"""
Background Scheduler
Handles periodic tasks like deadline checks, daily digests, and data syncing

Uses APScheduler for job scheduling
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.alert import AlertConfig
from ..models.user import User
from ..models.applicant import ApplicantProfile, ApplicantFRN, ApplicantAutoAppeal
from ..models.consultant import ConsultantProfile, ConsultantSchool
from ..models.subscription import Subscription
from .alert_service import AlertService

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler: Optional[BackgroundScheduler] = None


def get_db():
    """Get database session for background tasks"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_upcoming_deadlines():
    """
    Check for approaching deadlines and send alerts.
    Runs every 6 hours.
    """
    logger.info("Running deadline check job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)

        # FIX (2026-05-18): iterate ALL active users, auto-creating their AlertConfig
        # via get_or_create_alert_config. Previously this filtered db.query(AlertConfig)
        # which silently skipped every user who had never visited /alerts/config -
        # 75%+ of accounts never received any scheduled alert.
        users = db.query(User).filter(
            User.is_active == True
        ).all()

        processed = 0
        for user in users:
            try:
                config = alert_service.get_or_create_alert_config(user.id)
            except Exception as e:
                logger.error(f"Failed to get/create alert config for user {user.id}: {e}")
                continue

            if not config.alert_on_deadline:
                continue

            try:
                _check_user_deadlines(db, alert_service, config)
            except Exception as e:
                logger.error(f"Error checking deadlines for user {config.user_id}: {e}")
            try:
                _check_consultant_deadlines(db, alert_service, config)
            except Exception as e:
                logger.error(f"Error checking consultant deadlines for user {config.user_id}: {e}")
            try:
                _check_vendor_deadlines(db, alert_service, config)
            except Exception as e:
                logger.error(f"Error checking vendor deadlines for user {config.user_id}: {e}")
            processed += 1

        logger.info(f"Deadline check complete. Processed {processed} of {len(users)} users.")
        
    except Exception as e:
        logger.error(f"Deadline check job failed: {e}")
    finally:
        db.close()


def _maybe_invoice_detail(ben, ben_data, frn, intervals: list, now: datetime) -> Optional[dict]:
    """
    Return an invoice-deadline card-detail dict if this FRN's days-remaining to its
    BEAR/SPI invoice deadline (service_end + 120 days) exactly matches one of the
    configured intervals AND the FRN has not yet been invoiced. Otherwise None.
    """
    status = (frn.get("status") or "").lower()
    if "funded" not in status and "committed" not in status:
        return None
    service_end_str = frn.get("service_end", "")
    last_invoice = frn.get("last_invoice_date", "")
    if not service_end_str or last_invoice:
        return None
    svc_end = _parse_date(service_end_str)
    if not svc_end:
        return None

    invoice_deadline = svc_end + timedelta(days=120)
    days_remaining = (invoice_deadline - now).days
    if days_remaining not in intervals:
        return None

    approved = frn.get("commitment_amount") or frn.get("original_amount")
    disbursed = frn.get("disbursed_amount")
    remaining = None
    try:
        remaining = float(approved) - float(disbursed or 0)
    except (TypeError, ValueError):
        remaining = None

    frn_number = frn.get("frn", "")
    return {
        "entity_name": ben_data.get("entity_name", f"BEN {ben}"),
        "frn_nickname": frn.get("nickname", ""),
        "ben": ben,
        "state": ben_data.get("state", ""),
        "frn": frn_number,
        "application_number": frn.get("application_number", ""),
        "funding_year": frn.get("funding_year", ""),
        "spin": frn.get("spin", ""),
        "provider": frn.get("spin_name") or frn.get("service_provider", ""),
        "invoicing_mode": frn.get("invoicing_mode") or "BEAR/SPI",
        "approved_funding": approved,
        "disbursed": disbursed,
        "remaining": remaining,
        "service_end": svc_end.strftime("%m/%d/%Y"),
        "invoice_deadline": invoice_deadline.strftime("%m/%d/%Y"),
        "days_remaining": days_remaining,
        "deep_link": f"https://skyrate.ai/consultant?tab=frn-status&frn={frn_number}",
    }


def _collect_invoice_deadline_details(db: Session, user, intervals: list, now: datetime) -> list:
    """
    Gather approaching invoicing-deadline card details for a single user across all
    roles (applicant BEN, consultant school BENs, vendor SPIN). Only returns FRNs
    whose days-remaining exactly matches one of the configured intervals.
    """
    from ..models.applicant import ApplicantProfile
    from ..models.consultant import ConsultantProfile, ConsultantSchool

    results = []
    bens = []
    role = user.role

    if role in ('applicant', 'super'):
        ap = db.query(ApplicantProfile).filter(ApplicantProfile.user_id == user.id).first()
        if ap and getattr(ap, 'ben', None):
            bens.append(ap.ben)

    if role in ('consultant', 'super'):
        cp = db.query(ConsultantProfile).filter(ConsultantProfile.user_id == user.id).first()
        if cp:
            schools = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == cp.id
            ).all()
            bens.extend([s.ben for s in schools if s.ben])

    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
    except Exception as e:
        logger.error(f"Invoice sweep: USAC client init failed: {e}")
        return results

    bens = list({b for b in bens if b})
    if bens:
        try:
            batch = client.get_frn_status_batch(bens)
            if batch.get("success"):
                for ben, ben_data in batch.get("results", {}).items():
                    for frn in ben_data.get("frns", []):
                        d = _maybe_invoice_detail(ben, ben_data, frn, intervals, now)
                        if d:
                            results.append(d)
        except Exception as e:
            logger.error(f"Invoice sweep: USAC batch error: {e}")

    if role in ('vendor', 'super'):
        from ..models.vendor import VendorProfile
        vp = db.query(VendorProfile).filter(VendorProfile.user_id == user.id).first()
        if vp and vp.spin:
            try:
                sr = client.get_frn_status_by_spin(vp.spin)
                if sr.get("success"):
                    for frn in sr.get("frns", []):
                        ben = frn.get("ben", "")
                        ben_data = {
                            "entity_name": frn.get("entity_name") or f"FRN {frn.get('frn', '')}",
                            "state": frn.get("state", ""),
                        }
                        d = _maybe_invoice_detail(ben, ben_data, frn, intervals, now)
                        if d:
                            results.append(d)
            except Exception as e:
                logger.error(f"Invoice sweep: USAC SPIN error: {e}")

    return results


def check_invoicing_deadlines():
    """
    Dedicated, opt-in sweep for approaching BEAR/SPI invoicing deadlines.

    Runs only for users who set ``alert_on_invoice_deadline=True``. Fires a rich
    invoice-deadline card email + in-app alert at exactly the configured day-out
    intervals (default [30, 7]). Uses DispatchedDeadlineAlert for idempotent,
    once-per-(user, frn, deadline_type, day) delivery so paying users are never
    double-notified across the 6-hourly runs.

    SAFETY: defaults OFF for every account (alert_on_invoice_deadline default
    False), so this job is a no-op until a user explicitly opts in.
    """
    logger.info("Running invoicing-deadline check job...")

    db = SessionLocal()
    try:
        from ..models.alert import Alert, AlertType, AlertPriority, DispatchedDeadlineAlert
        from .email_service import EmailService

        alert_service = AlertService(db)
        email_service = EmailService()
        now = datetime.utcnow()

        users = db.query(User).filter(User.is_active == True).all()
        processed = 0
        sent = 0

        for user in users:
            try:
                config = alert_service.get_or_create_alert_config(user.id)
            except Exception as e:
                logger.error(f"Invoice sweep: config error for user {user.id}: {e}")
                continue

            if not getattr(config, 'alert_on_invoice_deadline', False):
                continue

            intervals = config.invoice_deadline_intervals or [30, 7]
            try:
                intervals = sorted({int(x) for x in intervals if int(x) > 0}, reverse=True)
            except (TypeError, ValueError):
                intervals = [30, 7]
            if not intervals:
                continue

            processed += 1
            try:
                details = _collect_invoice_deadline_details(db, user, intervals, now)
            except Exception as e:
                logger.error(f"Invoice sweep: collect error for user {user.id}: {e}")
                continue

            for detail in details:
                frn_number = detail.get("frn", "")
                days_remaining = detail.get("days_remaining")
                try:
                    existing = db.query(DispatchedDeadlineAlert).filter(
                        DispatchedDeadlineAlert.user_id == user.id,
                        DispatchedDeadlineAlert.frn == frn_number,
                        DispatchedDeadlineAlert.deadline_type == "invoice_deadline",
                        DispatchedDeadlineAlert.days_remaining == days_remaining,
                    ).first()
                    if existing:
                        continue

                    urgent = (days_remaining or 0) <= 7
                    priority = AlertPriority.HIGH if urgent else AlertPriority.MEDIUM
                    entity_label = detail.get("entity_name") or frn_number
                    title = f"Invoice deadline in {days_remaining} days - {entity_label}"
                    message = (
                        f"FRN {frn_number} must be invoiced (BEAR/SPI) by "
                        f"{detail.get('invoice_deadline', 'N/A')}. {days_remaining} days remain "
                        f"before unclaimed funds are forfeited to USAC."
                    )

                    if config.in_app_notifications:
                        db.add(Alert(
                            user_id=user.id,
                            alert_type=AlertType.DEADLINE_APPROACHING.value,
                            priority=priority.value if isinstance(priority, AlertPriority) else priority,
                            title=title,
                            message=message,
                            entity_type="frn",
                            entity_id=frn_number,
                            entity_name=detail.get("entity_name", ""),
                            alert_metadata={"deadline_type": "invoice_deadline", **detail},
                            is_read=False,
                            is_dismissed=False,
                            email_sent=False,
                        ))

                    if config.email_notifications and user.email:
                        try:
                            email_service.send_invoice_deadline_email(user.email, detail)
                        except Exception as e:
                            logger.error(f"Invoice sweep: email error for user {user.id} FRN {frn_number}: {e}")

                    db.add(DispatchedDeadlineAlert(
                        user_id=user.id,
                        frn=frn_number,
                        deadline_type="invoice_deadline",
                        days_remaining=days_remaining,
                        dispatched_at=now,
                    ))
                    db.commit()
                    sent += 1
                except Exception as e:
                    db.rollback()
                    logger.error(f"Invoice sweep: dispatch error for user {user.id} FRN {frn_number}: {e}")

        logger.info(
            f"Invoicing-deadline check complete. Opted-in users: {processed}, alerts dispatched: {sent}."
        )
    except Exception as e:
        logger.error(f"Invoicing-deadline job failed: {e}")
    finally:
        db.close()


def _check_user_deadlines(db: Session, alert_service: AlertService, config: AlertConfig):

    """Check deadlines for applicant users: Appeal, Form 486, Invoice, Service Delivery"""
    
    user = db.query(User).filter(User.id == config.user_id).first()
    if not user:
        return
    
    warning_days = config.deadline_warning_days or 14
    
    # Check applicant appeal deadlines from auto-appeals
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == user.id
    ).first()
    
    if profile:
        # Get appeals with approaching deadlines
        deadline_threshold = datetime.utcnow() + timedelta(days=warning_days)
        
        appeals = db.query(ApplicantAutoAppeal).filter(
            ApplicantAutoAppeal.applicant_profile_id == profile.id,
            ApplicantAutoAppeal.appeal_deadline <= deadline_threshold,
            ApplicantAutoAppeal.appeal_deadline > datetime.utcnow(),
            ApplicantAutoAppeal.status.in_(['draft', 'pending'])
        ).all()
        
        for appeal in appeals:
            days_remaining = (appeal.appeal_deadline - datetime.utcnow()).days
            
            # Only alert at specific intervals (14, 7, 3, 1 days)
            if days_remaining in [14, 7, 3, 1]:
                alert_service.alert_on_deadline(
                    user_id=user.id,
                    entity_id=appeal.frn,
                    entity_name=profile.organization_name,
                    deadline_type="Appeal Deadline",
                    deadline_date=appeal.appeal_deadline,
                    days_remaining=days_remaining,
                    frn_details=[{
                        "ben": getattr(profile, 'ben', ''),
                        "entity_name": profile.organization_name,
                        "frn": appeal.frn,
                        "deadline_type": "Appeal Deadline",
                        "deadline_date": appeal.appeal_deadline.strftime("%m/%d/%Y"),
                        "days_remaining": days_remaining,
                        "status": "Denied",
                    }]
                )
    
    # For applicant users, also check USAC FRN data for Form 486, Invoice, Service Delivery
    if user.role in ('applicant', 'super') and profile and getattr(profile, 'ben', None):
        bens = [profile.ben]
        _check_frn_deadlines_for_bens(
            db, alert_service, user, bens, warning_days,
            skip_invoice=bool(getattr(config, 'alert_on_invoice_deadline', False)),
            service_delivery_enabled=bool(getattr(config, 'alert_on_service_delivery', True)),
        )


def _build_frn_detail_row(ben, ben_data, frn, deadline_type, deadline_date, days_remaining):
    """Build a rich FRN detail dict for alert metadata."""
    return {
        "ben": ben,
        "entity_name": ben_data.get("entity_name", f"BEN {ben}"),
        "state": ben_data.get("state", ""),
        "frn": frn.get("frn", ""),
        "application_number": frn.get("application_number", ""),
        "funding_year": frn.get("funding_year", ""),
        "status": frn.get("status", ""),
        "spin_name": frn.get("spin_name") or frn.get("service_provider", ""),
        "commitment_amount": frn.get("commitment_amount") or frn.get("original_amount", ""),
        "disbursed_amount": frn.get("disbursed_amount", ""),
        "deadline_type": deadline_type,
        "deadline_date": deadline_date.strftime("%m/%d/%Y") if deadline_date else "",
        "days_remaining": days_remaining,
    }


def _check_frn_deadlines_for_bens(db: Session, alert_service: AlertService, user, bens: list, warning_days: int, skip_invoice: bool = False, service_delivery_enabled: bool = True):
    """
    Shared logic: check Form 486, Invoice, Service Delivery, and Contract Expiration
    deadlines for a list of BENs using USAC data. Used by applicants, consultants, and super users.

    If a user has more than 5 approaching deadlines, they are consolidated into a
    single 'Multiple Deadlines Approaching' alert to avoid notification fatigue.

    When ``skip_invoice`` is True the legacy invoice-deadline branch is skipped
    because the user has opted into the dedicated 30/7-day invoicing-deadline
    card alerts (handled by check_invoicing_deadlines), preventing duplicates.
    """
    if not bens:
        return
    
    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        batch_result = client.get_frn_status_batch(bens)
        
        if not batch_result.get("success"):
            return
        
        from ..models.alert import Alert, AlertType
        now = datetime.utcnow()

        # Collect all pending deadline alerts before sending
        pending_alerts = []  # list of dicts with alert details
        
        for ben, ben_data in batch_result.get("results", {}).items():
            entity_name = ben_data.get("entity_name", f"BEN {ben}")
            
            for frn in ben_data.get("frns", []):
                frn_number = frn.get("frn", "")
                status = (frn.get("status") or "").lower()
                
                # === Appeal Deadline for denied FRNs (60 days from FCDL date) ===
                if "denied" in status:
                    fcdl_date_str = frn.get("fcdl_date", "")
                    if fcdl_date_str:
                        fcdl_date = _parse_date(fcdl_date_str)
                        if fcdl_date:
                            appeal_deadline = fcdl_date + timedelta(days=60)
                            days_remaining = (appeal_deadline - now).days
                            
                            if 0 < days_remaining <= warning_days:
                                recent = db.query(Alert).filter(
                                    Alert.user_id == user.id,
                                    Alert.entity_id == frn_number,
                                    Alert.alert_type == AlertType.APPEAL_DEADLINE.value,
                                    Alert.created_at >= now - timedelta(days=3)
                                ).first()
                                
                                if not recent:
                                    pending_alerts.append({
                                        "entity_id": frn_number,
                                        "entity_name": entity_name,
                                        "deadline_type": "Appeal Deadline",
                                        "deadline_date": appeal_deadline,
                                        "days_remaining": days_remaining,
                                        "frn_detail": _build_frn_detail_row(ben, ben_data, frn, "Appeal Deadline", appeal_deadline, days_remaining),
                                        "is_appeal": True,
                                    })
                
                # === Form 486 Deadline (120 days after FCDL date or service start) ===
                if "funded" in status or "committed" in status:
                    f486_status = (frn.get("f486_status") or "").lower()
                    if f486_status and "filed" not in f486_status and "approved" not in f486_status:
                        fcdl_date_str = frn.get("fcdl_date", "")
                        service_start_str = frn.get("service_start", "")
                        
                        fcdl_dt = _parse_date(fcdl_date_str) if fcdl_date_str else None
                        svc_dt = _parse_date(service_start_str) if service_start_str else None
                        later_date = max(fcdl_dt, svc_dt) if (fcdl_dt and svc_dt) else (fcdl_dt or svc_dt)
                        
                        if later_date:
                            f486_deadline = later_date + timedelta(days=120)
                            days_remaining = (f486_deadline - now).days
                            
                            if 0 < days_remaining <= warning_days:
                                recent = db.query(Alert).filter(
                                    Alert.user_id == user.id,
                                    Alert.entity_id == frn_number,
                                    Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                    Alert.created_at >= now - timedelta(days=3)
                                ).first()
                                
                                if not recent:
                                    pending_alerts.append({
                                        "entity_id": frn_number,
                                        "entity_name": entity_name,
                                        "deadline_type": "Form 486 Filing Deadline",
                                        "deadline_date": f486_deadline,
                                        "days_remaining": days_remaining,
                                        "frn_detail": _build_frn_detail_row(ben, ben_data, frn, "Form 486 Filing", f486_deadline, days_remaining),
                                        "is_appeal": False,
                                    })
                
                # === Invoice Deadline (BEAR/SPI: 120 days after service end date) ===
                if (not skip_invoice) and ("funded" in status or "committed" in status):
                    service_end_str = frn.get("service_end", "")
                    last_invoice = frn.get("last_invoice_date", "")
                    
                    if service_end_str and not last_invoice:
                        svc_end = _parse_date(service_end_str)
                        if svc_end:
                            invoice_deadline = svc_end + timedelta(days=120)
                            days_remaining = (invoice_deadline - now).days
                            
                            if 0 < days_remaining <= warning_days:
                                recent = db.query(Alert).filter(
                                    Alert.user_id == user.id,
                                    Alert.entity_id == frn_number,
                                    Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                    Alert.created_at >= now - timedelta(days=3)
                                ).first()
                                
                                if not recent:
                                    pending_alerts.append({
                                        "entity_id": frn_number,
                                        "entity_name": entity_name,
                                        "deadline_type": "Invoice Filing Deadline (BEAR/SPI)",
                                        "deadline_date": invoice_deadline,
                                        "days_remaining": days_remaining,
                                        "frn_detail": _build_frn_detail_row(ben, ben_data, frn, "Invoice (BEAR/SPI)", invoice_deadline, days_remaining),
                                        "is_appeal": False,
                                    })
                
                # === Service Delivery Deadline (check service_end date approaching) ===
                if service_delivery_enabled and ("funded" in status or "committed" in status):
                    service_end_str = frn.get("service_end", "")
                    if service_end_str:
                        svc_end = _parse_date(service_end_str)
                        if svc_end:
                            days_remaining = (svc_end - now).days
                            
                            if 0 < days_remaining <= warning_days:
                                recent = db.query(Alert).filter(
                                    Alert.user_id == user.id,
                                    Alert.entity_id == frn_number,
                                    Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                    Alert.created_at >= now - timedelta(days=3)
                                ).first()
                                
                                if not recent:
                                    pending_alerts.append({
                                        "entity_id": frn_number,
                                        "entity_name": entity_name,
                                        "deadline_type": "Service Delivery Deadline",
                                        "deadline_date": svc_end,
                                        "days_remaining": days_remaining,
                                        "frn_detail": _build_frn_detail_row(ben, ben_data, frn, "Service Delivery End", svc_end, days_remaining),
                                        "is_appeal": False,
                                    })
                
                # === Contract Expiration  ===
                contract_end_str = frn.get("contract_expiration") or frn.get("contract_end", "")
                if contract_end_str:
                    contract_end = _parse_date(contract_end_str)
                    if contract_end:
                        days_remaining = (contract_end - now).days
                        
                        if 0 < days_remaining <= warning_days:
                            recent = db.query(Alert).filter(
                                Alert.user_id == user.id,
                                Alert.entity_id == frn_number,
                                Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                Alert.created_at >= now - timedelta(days=3)
                            ).first()
                            
                            if not recent:
                                pending_alerts.append({
                                    "entity_id": frn_number,
                                    "entity_name": entity_name,
                                    "deadline_type": "Contract Expiration",
                                    "deadline_date": contract_end,
                                    "days_remaining": days_remaining,
                                    "frn_detail": _build_frn_detail_row(ben, ben_data, frn, "Contract Expiration", contract_end, days_remaining),
                                    "is_appeal": False,
                                })

        # --- Consolidation logic: if > 5 deadlines, send a single combined alert ---
        if len(pending_alerts) > 5:
            # Sort by days_remaining (most urgent first)
            pending_alerts.sort(key=lambda x: x["days_remaining"])
            all_frn_details = [a["frn_detail"] for a in pending_alerts]
            soonest = pending_alerts[0]
            deadline_types = list(set(a["deadline_type"] for a in pending_alerts))
            alert_service.alert_on_deadline(
                user_id=user.id,
                entity_id="multiple",
                entity_name=f"{len(pending_alerts)} FRNs",
                deadline_type="Multiple Deadlines Approaching",
                deadline_date=soonest["deadline_date"],
                days_remaining=soonest["days_remaining"],
                frn_details=all_frn_details,
                extra_metadata={
                    "consolidated": True,
                    "total_deadlines": len(pending_alerts),
                    "deadline_types": deadline_types,
                }
            )
        else:
            # Send individual alerts as before
            for item in pending_alerts:
                if item["is_appeal"]:
                    alert_service.alert_on_deadline(
                        user_id=user.id,
                        entity_id=item["entity_id"],
                        entity_name=item["entity_name"],
                        deadline_type=item["deadline_type"],
                        deadline_date=item["deadline_date"],
                        days_remaining=item["days_remaining"],
                        frn_details=[item["frn_detail"]]
                    )
                else:
                    alert_service.alert_on_deadline(
                        user_id=user.id,
                        entity_id=item["entity_id"],
                        entity_name=item["entity_name"],
                        deadline_type=item["deadline_type"],
                        deadline_date=item["deadline_date"],
                        days_remaining=item["days_remaining"],
                        frn_details=[item["frn_detail"]]
                    )
    except Exception as e:
        logger.error(f"Error checking FRN deadlines for user {user.id}: {e}")


def _check_consultant_deadlines(db: Session, alert_service: AlertService, config: AlertConfig):
    """Check E-Rate deadlines for consultant users using live USAC FRN data"""
    from ..models.consultant import ConsultantProfile, ConsultantSchool
    
    user = db.query(User).filter(User.id == config.user_id).first()
    if not user or user.role not in ('consultant', 'super'):
        return
    
    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.user_id == user.id
    ).first()
    if not profile:
        return
    
    warning_days = config.deadline_warning_days or 14
    
    # Get all school BENs for this consultant
    schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id
    ).all()
    
    if not schools:
        return
    
    bens = [s.ben for s in schools if s.ben]
    if not bens:
        return
    
    # Use shared FRN deadline checker for all deadline types
    _check_frn_deadlines_for_bens(
        db, alert_service, user, bens, warning_days,
        skip_invoice=bool(getattr(config, 'alert_on_invoice_deadline', False)),
        service_delivery_enabled=bool(getattr(config, 'alert_on_service_delivery', True)),
    )


def _check_vendor_deadlines(db: Session, alert_service: AlertService, config: AlertConfig):
    """Check E-Rate deadlines for vendor users using SPIN-based USAC data"""
    from ..models.vendor import VendorProfile
    
    user = db.query(User).filter(User.id == config.user_id).first()
    if not user or user.role not in ('vendor', 'super'):
        return
    
    profile = db.query(VendorProfile).filter(
        VendorProfile.user_id == user.id
    ).first()
    if not profile or not profile.spin:
        return
    
    warning_days = config.deadline_warning_days or 14
    
    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        spin_result = client.get_frn_status_by_spin(profile.spin)
        
        if not spin_result.get("success"):
            return
        
        from ..models.alert import Alert, AlertType
        now = datetime.utcnow()
        
        for frn in spin_result.get("frns", []):
            frn_number = frn.get("frn", "")
            status = (frn.get("status") or "").lower()
            entity_name = frn.get("entity_name") or f"FRN {frn_number}"
            ben = frn.get("ben", "")
            
            # Mock ben_data for _build_frn_detail_row compatibility
            ben_data = {"entity_name": entity_name, "state": frn.get("state", "")}
            
            # === Invoice Deadline (BEAR/SPI: 120 days after service end date) ===
            if (not getattr(config, 'alert_on_invoice_deadline', False)) and ("funded" in status or "committed" in status):
                service_end_str = frn.get("service_end", "")
                last_invoice = frn.get("last_invoice_date", "")
                
                if service_end_str and not last_invoice:
                    svc_end = _parse_date(service_end_str)
                    if svc_end:
                        invoice_deadline = svc_end + timedelta(days=120)
                        days_remaining = (invoice_deadline - now).days
                        
                        if 0 < days_remaining <= warning_days:
                            recent = db.query(Alert).filter(
                                Alert.user_id == user.id,
                                Alert.entity_id == frn_number,
                                Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                Alert.created_at >= now - timedelta(days=3)
                            ).first()
                            
                            if not recent:
                                alert_service.alert_on_deadline(
                                    user_id=user.id,
                                    entity_id=frn_number,
                                    entity_name=entity_name,
                                    deadline_type="Invoice Filing Deadline (BEAR/SPI)",
                                    deadline_date=invoice_deadline,
                                    days_remaining=days_remaining,
                                    frn_details=[_build_frn_detail_row(ben, ben_data, frn, "Invoice (BEAR/SPI)", invoice_deadline, days_remaining)]
                                )
            
            # === Service Delivery Deadline ===
            # Gated by alert_on_service_delivery, which defaults OFF for vendors
            # (they reported these reminders as irrelevant noise).
            if getattr(config, 'alert_on_service_delivery', False) and ("funded" in status or "committed" in status):
                service_end_str = frn.get("service_end", "")
                if service_end_str:
                    svc_end = _parse_date(service_end_str)
                    if svc_end:
                        days_remaining = (svc_end - now).days
                        
                        if 0 < days_remaining <= warning_days:
                            recent = db.query(Alert).filter(
                                Alert.user_id == user.id,
                                Alert.entity_id == frn_number,
                                Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                                Alert.created_at >= now - timedelta(days=3)
                            ).first()
                            
                            if not recent:
                                alert_service.alert_on_deadline(
                                    user_id=user.id,
                                    entity_id=frn_number,
                                    entity_name=entity_name,
                                    deadline_type="Service Delivery Deadline",
                                    deadline_date=svc_end,
                                    days_remaining=days_remaining,
                                    frn_details=[_build_frn_detail_row(ben, ben_data, frn, "Service Delivery End", svc_end, days_remaining)]
                                )
            
            # === Contract Expiration ===
            contract_end_str = frn.get("contract_expiration") or frn.get("contract_end", "")
            if contract_end_str:
                contract_end = _parse_date(contract_end_str)
                if contract_end:
                    days_remaining = (contract_end - now).days
                    
                    if 0 < days_remaining <= warning_days:
                        recent = db.query(Alert).filter(
                            Alert.user_id == user.id,
                            Alert.entity_id == frn_number,
                            Alert.alert_type == AlertType.DEADLINE_APPROACHING.value,
                            Alert.created_at >= now - timedelta(days=3)
                        ).first()
                        
                        if not recent:
                            alert_service.alert_on_deadline(
                                user_id=user.id,
                                entity_id=frn_number,
                                entity_name=entity_name,
                                deadline_type="Contract Expiration",
                                deadline_date=contract_end,
                                days_remaining=days_remaining,
                                frn_details=[_build_frn_detail_row(ben, ben_data, frn, "Contract Expiration", contract_end, days_remaining)]
                            )
    except Exception as e:
        logger.error(f"Error checking vendor deadlines for user {config.user_id}: {e}")


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse various USAC date formats"""
    if not date_str:
        return None
    
    from datetime import datetime as dt
    formats = [
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
    ]
    
    for fmt in formats:
        try:
            return dt.strptime(date_str.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    
    return None


def send_daily_digests():
    """
    Send daily FRN digest emails to users who opted in.
    Reads from frn_status_changes_queue and groups by user.
    Runs at 08:00 America/New_York every day.

    Phase 2 V2 rebuild:
    - Window-function dedup: per (user_id, frn) collapse to first old_status -> last new_status
    - Drop FRNs whose net change is zero (flipped and reverted)
    - Bucket into categories for subject line
    - Heartbeat email if user opted in but no changes
    - Atomic mark-processed + cursor bump
    """
    import os as _os
    if _os.environ.get("SKYRATE_DISABLE_FRN_DIGEST") == "1":
        logger.info("FRN digest disabled via SKYRATE_DISABLE_FRN_DIGEST=1; skipping")
        return

    logger.info("Running FRN daily digest job...")

    db = SessionLocal()
    try:
        from ..models.frn_status_change import FrnStatusChangeQueue
        from .email_service import EmailService

        alert_service = AlertService(db)
        email_service = EmailService()
        now = datetime.utcnow()

        # Gather all users with daily_digest enabled
        configs = db.query(AlertConfig).filter(AlertConfig.daily_digest == True).all()
        if not configs:
            logger.info("FRN daily digest: no users with digest enabled. Skipping.")
            db.close()
            return

        sent_count = 0
        heartbeat_count = 0
        skipped_count = 0
        total_rows_drained = 0
        total_rows_collapsed = 0
        errors = 0

        for config in configs:
            user_id = config.user_id
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if not user or not user.is_active:
                    skipped_count += 1
                    continue

                # Skip test accounts (no real SMTP)
                _email = (user.email or "").lower()
                if getattr(user, 'is_test', False) or _email.endswith("@example.com") or _email.startswith("test_"):
                    skipped_count += 1
                    continue

                # Skip users without an active/trialing subscription
                sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
                if not sub or sub.status not in ('active', 'trialing'):
                    skipped_count += 1
                    continue
                if sub.status == 'trialing' and sub.trial_end and sub.trial_end < now:
                    skipped_count += 1
                    continue

                # Determine window: since last digest (or 24h ago if never sent)
                since = config.last_frn_digest_at or (now - timedelta(hours=24))

                # Fetch unprocessed queue rows for this user within the window
                raw_rows = (
                    db.query(FrnStatusChangeQueue)
                    .filter(
                        FrnStatusChangeQueue.user_id == user_id,
                        FrnStatusChangeQueue.processed == 0,
                        FrnStatusChangeQueue.created_at > since,
                    )
                    .order_by(FrnStatusChangeQueue.created_at.asc())
                    .all()
                )

                # Window-function dedup: per FRN, take first old_status and last new_status
                frn_windows = {}  # frn -> {first_old, last_new, last_amount, entity_name, ben, rows}
                for row in raw_rows:
                    if row.frn not in frn_windows:
                        frn_windows[row.frn] = {
                            "first_old": row.old_status,
                            "last_new": row.new_status,
                            "last_amount": row.new_amount,
                            "entity_name": row.entity_name,
                            "ben": row.ben,
                            "rows": [row],
                        }
                    else:
                        w = frn_windows[row.frn]
                        w["last_new"] = row.new_status
                        w["last_amount"] = row.new_amount
                        if row.entity_name:
                            w["entity_name"] = row.entity_name
                        w["rows"].append(row)

                # Filter: drop FRNs where net change is zero
                collapsed_count = 0
                net_changes = []
                all_row_ids = []
                for frn_num, w in frn_windows.items():
                    for r in w["rows"]:
                        all_row_ids.append(r.id)
                    if w["first_old"] == w["last_new"]:
                        collapsed_count += 1
                    else:
                        net_changes.append({
                            "frn": frn_num,
                            "ben": w["ben"],
                            "entity_name": w["entity_name"],
                            "old_status": w["first_old"],
                            "new_status": w["last_new"],
                            "new_amount": w["last_amount"],
                        })

                total_rows_drained += len(raw_rows)
                total_rows_collapsed += collapsed_count

                # --- ◄ NEW: Consolidated deadline alerts query ---
                from ..models.alert import Alert, AlertType
                deadline_alerts = (
                    db.query(Alert)
                    .filter(
                        Alert.user_id == user_id,
                        Alert.alert_type.in_([
                            AlertType.DEADLINE_APPROACHING.value,
                            AlertType.APPEAL_DEADLINE.value,
                            AlertType.FORM_486_DUE.value,
                            AlertType.NO_DISBURSEMENT_WARNING.value
                        ]),
                        Alert.email_sent == False,
                        Alert.is_dismissed == False,
                        Alert.created_at > since,
                    )
                    .all()
                )

                email_to = config.notification_email or user.email
                user_name = user.first_name or user.email.split("@")[0]
                role = user.role or "consultant"

                if net_changes or deadline_alerts:
                    # Sanity guard: cap at 50 rows, skip if suspiciously large
                    if len(net_changes) > 50:
                        # Sort by severity for the cap: denied > PIA > funded > other
                        def _severity(c):
                            ns = (c.get("new_status") or "").lower()
                            if "denied" in ns:
                                return 0
                            if "pia" in ns or "review" in ns:
                                return 1
                            if "committed" in ns or "funded" in ns:
                                return 2
                            return 3
                        net_changes.sort(key=_severity)
                        net_changes = net_changes[:50]

                    # Convert Alert models to dictionaries for rendering
                    deadlines_list = [a.to_dict() for a in deadline_alerts]

                    # Send digest with real changes + deadlines
                    success = email_service.send_frn_digest_email_v2(
                        to_email=email_to,
                        user_name=user_name,
                        changes=net_changes,
                        collapsed_count=collapsed_count,
                        role=role,
                        deadlines=deadlines_list,
                    )
                    if success:
                        sent_count += 1
                        # Mark those deadline alerts as email_notified
                        if deadline_alerts:
                            for alert in deadline_alerts:
                                alert.email_sent = True
                                alert.email_sent_at = now
                else:
                    # Heartbeat: no net changes and no deadlines, but user opted in
                    success = email_service.send_frn_digest_heartbeat(
                        to_email=email_to,
                        user_name=user_name,
                        role=role,
                    )
                    if success:
                        heartbeat_count += 1

                # Atomic mark-processed + cursor bump
                if all_row_ids:
                    db.query(FrnStatusChangeQueue).filter(
                        FrnStatusChangeQueue.id.in_(all_row_ids)
                    ).update({"processed": 1, "processed_at": now}, synchronize_session=False)
                config.last_frn_digest_at = now
                db.commit()

            except Exception as e:
                logger.error(f"Error sending FRN digest to user {user_id}: {e}")
                errors += 1
                try:
                    db.rollback()
                except Exception:
                    pass

        logger.info(
            f"digest_run: users_scanned={len(configs)} digests_sent={sent_count} "
            f"digests_heartbeat={heartbeat_count} digests_skipped_empty=0 "
            f"queue_rows_drained={total_rows_drained} queue_rows_collapsed={total_rows_collapsed} "
            f"errors={errors}"
        )

    except Exception as e:
        logger.error(f"FRN daily digest job failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def send_weekly_summaries():
    """
    Send weekly summary emails to users who opted in.
    Runs every Monday at 9 AM.
    """
    logger.info("Running weekly summary job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)
        
        # Iterate all active users; auto-create AlertConfig if missing,
        # then respect the per-user daily_digest flag (used for weekly too).
        users = db.query(User).filter(User.is_active == True).all()
        
        sent_count = 0
        now = datetime.utcnow()
        for user in users:
            try:
                # Skip users without an active/trialing subscription
                sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
                if not sub or sub.status not in ('active', 'trialing'):
                    continue
                if sub.status == 'trialing' and sub.trial_end and sub.trial_end < now:
                    continue

                config = alert_service.get_or_create_alert_config(user.id)
                if not config.daily_digest:
                    continue
                if alert_service.send_weekly_summary(user.id):
                    sent_count += 1
            except Exception as e:
                logger.error(f"Error sending summary to user {user.id}: {e}")
        
        logger.info(f"Weekly summary complete. Sent {sent_count} summaries.")
        
    except Exception as e:
        logger.error(f"Weekly summary job failed: {e}")
    finally:
        db.close()


def sync_frn_statuses():
    """
    Sync FRN statuses from USAC and trigger alerts on changes.
    Runs every hour.
    """
    logger.info("Running FRN status sync job...")
    
    db = SessionLocal()
    try:
        # Get all applicant FRNs that need checking
        frns = db.query(ApplicantFRN).filter(
            ApplicantFRN.status.notin_(['Funded', 'Cancelled', 'Denied - Final'])
        ).all()
        
        if not frns:
            logger.info("No FRNs to sync")
            return
        
        from ..services.usac_service import USACService
        usac_service = USACService(db)
        alert_service = AlertService(db)
        
        updated_count = 0
        for frn_record in frns:
            try:
                # Get updated status from USAC
                frn_data = usac_service.get_frn_details(frn_record.frn)
                
                if frn_data and frn_data.get('status'):
                    new_status = frn_data['status']
                    old_status = frn_record.status
                    
                    if new_status != old_status:
                        # Update status
                        frn_record.status = new_status
                        frn_record.last_checked = datetime.utcnow()
                        updated_count += 1
                        
                        # Get user for this FRN
                        profile = db.query(ApplicantProfile).filter(
                            ApplicantProfile.id == frn_record.applicant_profile_id
                        ).first()
                        
                        if profile:
                            frn_detail = {
                                "ben": getattr(profile, 'ben', ''),
                                "entity_name": profile.organization_name,
                                "frn": frn_record.frn,
                                "funding_year": frn_record.funding_year,
                                "old_status": old_status,
                                "new_status": new_status,
                                "status": new_status,
                                "commitment_amount": float(frn_record.amount_requested or 0),
                                "spin_name": frn_data.get("spin_name") or frn_data.get("service_provider", ""),
                            }
                            
                            # Check if this is a denial
                            if 'denied' in new_status.lower():
                                alert_service.alert_on_denial(
                                    user_id=profile.user_id,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name,
                                    denial_reason=frn_data.get('denial_reason', 'Unknown'),
                                    amount=float(frn_record.amount_requested or 0),
                                    funding_year=frn_record.funding_year
                                )
                                
                                # Also alert admin users on ANY denial
                                _notify_admins_of_denial(
                                    db, alert_service,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name or "Unknown",
                                    user_email=db.query(User).filter(User.id == profile.user_id).first().email if profile.user_id else "unknown",
                                    denial_reason=frn_data.get('denial_reason', 'Unknown'),
                                    amount=float(frn_record.amount_requested or 0),
                                )
                            else:
                                # Regular status change with rich FRN detail
                                alert_service.alert_on_status_change(
                                    user_id=profile.user_id,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name,
                                    old_status=old_status,
                                    new_status=new_status,
                                    amount=float(frn_record.amount_requested or 0),
                                    frn_details=[frn_detail]
                                )
            
            except Exception as e:
                logger.error(f"Error syncing FRN {frn_record.frn}: {e}")
        
        db.commit()
        logger.info(f"FRN sync complete. Updated {updated_count} FRNs.")
        
    except Exception as e:
        logger.error(f"FRN sync job failed: {e}")
    finally:
        db.close()


def sync_consultant_frn_statuses():
    """
    Sync FRN statuses for consultant-tracked schools from USAC and trigger alerts on changes.
    Runs every 2 hours.
    """
    logger.info("Running consultant FRN status sync job...")

    db = SessionLocal()
    try:
        # Get all consultant schools with FRNs that are not in terminal states
        terminal_statuses = ['Funded', 'Cancelled', 'Denied - Final']
        schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.frn.isnot(None),
            ConsultantSchool.frn != '',
            ConsultantSchool.status.notin_(terminal_statuses)
        ).all()

        if not schools:
            logger.info("No consultant FRNs to sync")
            return

        from ..services.usac_service import USACService
        usac_service = USACService(db)
        alert_service = AlertService(db)

        updated_count = 0
        for school in schools:
            try:
                frn_data = usac_service.get_frn_details(school.frn)

                if frn_data and frn_data.get('status'):
                    new_status = frn_data['status']
                    old_status = school.status or 'Unknown'

                    if new_status != old_status:
                        school.status = new_status
                        school.last_synced = datetime.utcnow()
                        updated_count += 1

                        # First-run protection: if cached status was never set or unknown,
                        # just record the baseline without flooding alerts
                        if old_status in (None, '', 'Unknown'):
                            logger.info(f"FRN {school.frn}: baseline recorded as '{new_status}' (was '{old_status}')")
                            continue

                        # Resolve the consultant's user_id
                        profile = db.query(ConsultantProfile).filter(
                            ConsultantProfile.id == school.consultant_profile_id
                        ).first()

                        if profile:
                            frn_detail = {
                                "ben": school.ben or '',
                                "entity_name": school.school_name or '',
                                "frn": school.frn,
                                "old_status": old_status,
                                "new_status": new_status,
                                "status": new_status,
                                "spin_name": frn_data.get("spin_name") or frn_data.get("service_provider", ""),
                                "commitment_amount": float(frn_data.get("commitment_amount", 0) or 0),
                            }

                            if 'denied' in new_status.lower():
                                alert_service.alert_on_denial(
                                    user_id=profile.user_id,
                                    frn=school.frn,
                                    school_name=school.school_name or f"BEN {school.ben}",
                                    denial_reason=frn_data.get('denial_reason', 'Unknown'),
                                    amount=float(frn_data.get("commitment_amount", 0) or 0),
                                    funding_year=frn_data.get("funding_year")
                                )
                            else:
                                alert_service.alert_on_status_change(
                                    user_id=profile.user_id,
                                    frn=school.frn,
                                    school_name=school.school_name or f"BEN {school.ben}",
                                    old_status=old_status,
                                    new_status=new_status,
                                    amount=float(frn_data.get("commitment_amount", 0) or 0),
                                    frn_details=[frn_detail]
                                )
                else:
                    # Still update last_synced even if no change
                    school.last_synced = datetime.utcnow()

            except Exception as e:
                logger.error(f"Error syncing consultant FRN {school.frn}: {e}")

        db.commit()
        logger.info(f"Consultant FRN sync complete. Updated {updated_count} FRNs.")

    except Exception as e:
        logger.error(f"Consultant FRN sync job failed: {e}")
    finally:
        db.close()


def check_long_pending_frns():
    """
    Check for FRNs that have been pending for more than 15 days.
    Creates alerts for users whose FRNs are stalled.
    Runs every 12 hours.
    """
    logger.info("Running long-pending FRN check job...")
    
    db = SessionLocal()
    try:
        from ..models.alert import AlertType
        alert_service = AlertService(db)
        
        # Get all applicant FRNs that are pending
        pending_frns = db.query(ApplicantFRN).filter(
            ApplicantFRN.status.ilike('%pending%')
        ).all()
        
        alert_count = 0
        threshold_days = 15
        
        for frn_record in pending_frns:
            try:
                # Calculate how long it's been pending
                # Use last_checked or created_at as baseline
                pending_since = frn_record.last_checked or frn_record.created_at or datetime.utcnow()
                days_pending = (datetime.utcnow() - pending_since).days
                
                if days_pending < threshold_days:
                    continue
                
                # Get user for this FRN
                profile = db.query(ApplicantProfile).filter(
                    ApplicantProfile.id == frn_record.applicant_profile_id
                ).first()
                
                if not profile:
                    continue
                
                # Check if we already alerted for this FRN recently (within 7 days)
                from ..models.alert import Alert
                recent_alert = db.query(Alert).filter(
                    Alert.user_id == profile.user_id,
                    Alert.entity_id == frn_record.frn,
                    Alert.alert_type == AlertType.PENDING_TOO_LONG.value,
                    Alert.created_at >= datetime.utcnow() - timedelta(days=7)
                ).first()
                
                if recent_alert:
                    continue  # Don't spam — only alert once per 7 days per FRN
                
                alert_service.alert_on_pending_too_long(
                    user_id=profile.user_id,
                    frn=frn_record.frn,
                    school_name=profile.organization_name or f"BEN {frn_record.ben}",
                    pending_reason=getattr(frn_record, 'pending_reason', '') or 'Not specified',
                    days_pending=days_pending,
                    amount=float(frn_record.amount_requested or 0)
                )
                alert_count += 1
                
            except Exception as e:
                logger.error(f"Error checking pending FRN {frn_record.frn}: {e}")
        
        logger.info(f"Long-pending check complete. Created {alert_count} alerts.")
        
    except Exception as e:
        logger.error(f"Long-pending FRN check job failed: {e}")
    finally:
        db.close()


def _notify_admins_of_denial(
    db: Session,
    alert_service: AlertService,
    frn: str,
    school_name: str,
    user_email: str,
    denial_reason: str,
    amount: float,
):
    """
    Notify all admin and super users when ANY user's FRN is denied.
    This gives admins visibility into denials across the entire platform.
    """
    try:
        # Include both 'admin' and 'super' roles for notifications
        admin_users = db.query(User).filter(
            User.role.in_(["admin", "super"]),
            User.is_active == True
        ).all()
        
        for admin in admin_users:
            from ..models.alert import Alert, AlertType, AlertPriority
            admin_alert = Alert(
                user_id=admin.id,
                alert_type=AlertType.NEW_DENIAL.value,
                priority=AlertPriority.HIGH.value,
                title=f"[Admin] User Denial: {school_name}",
                message=f"FRN {frn} for user {user_email} has been denied. Reason: {denial_reason}. Amount: ${amount:,.2f}",
                entity_type="frn",
                entity_id=frn,
                entity_name=school_name,
                alert_metadata={
                    "denial_reason": denial_reason,
                    "amount": amount,
                    "user_email": user_email,
                    "admin_notification": True,
                }
            )
            db.add(admin_alert)
        
        db.commit()
        logger.info(f"Notified {len(admin_users)} admin/super user(s) about denial of FRN {frn}")
        
        # Send email to each admin/super user
        try:
            from .email_service import EmailService
            email_service = EmailService()
            
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #dc2626;">FRN Denial Detected</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px; font-weight: bold;">FRN:</td><td style="padding: 8px;">{frn}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">School:</td><td style="padding: 8px;">{school_name}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">User:</td><td style="padding: 8px;">{user_email}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Reason:</td><td style="padding: 8px;">{denial_reason}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold;">Amount:</td><td style="padding: 8px;">${amount:,.2f}</td></tr>
                </table>
                <p style="margin-top: 16px;">
                    <a href="https://skyrate.ai/admin" style="color: #7c3aed;">View in Admin Dashboard</a>
                </p>
            </div>
            """
            
            for admin in admin_users:
                try:
                    email_service.send_email(
                        to_email=admin.email,
                        subject=f"[ALERT] FRN Denial: {frn} ({school_name})",
                        html_content=html_content,
                        email_type='alert'
                    )
                    logger.info(f"Sent denial email to {admin.email}")
                except Exception as e:
                    logger.error(f"Failed to send admin denial email to {admin.email}: {e}")
                    
        except Exception as e:
            logger.error(f"Failed to initialize email service for admin denial: {e}")
    
    except Exception as e:
        logger.error(f"Failed to notify admins of denial: {e}")


def refresh_admin_frn_snapshot():
    """
    Refresh the admin FRN snapshot table with FRN data from USAC.
    Runs once daily at 10:00 AM Pacific (17:00 UTC), shortly after USAC's
    9:00 AM PT database refresh. Uses a sliding 2-year funding year window
    (current year + previous year) to avoid pulling records back to 2014.
    """
    logger.info("Running admin FRN snapshot refresh...")

    db = SessionLocal()
    try:
        from utils.usac_client import USACDataClient
        from ..models.admin_frn_snapshot import AdminFRNSnapshot
        from ..models.consultant import ConsultantProfile, ConsultantSchool
        from ..models.vendor import VendorProfile
        from ..models.applicant import ApplicantProfile as ApProfile, ApplicantBEN

        # Collect ALL BENs from consultants + applicants
        consultant_schools = db.query(
            ConsultantSchool.ben, ConsultantSchool.school_name,
            ConsultantSchool.consultant_profile_id
        ).filter(ConsultantSchool.ben.isnot(None)).all()

        applicant_bens_db = db.query(
            ApplicantBEN.ben, ApplicantBEN.organization_name,
            ApplicantBEN.applicant_profile_id
        ).filter(ApplicantBEN.ben.isnot(None)).all()

        vendor_profiles = db.query(
            VendorProfile.spin, VendorProfile.company_name, VendorProfile.user_id
        ).filter(VendorProfile.spin.isnot(None), VendorProfile.spin != "").all()

        # Build BEN -> user info map
        ben_to_user = {}
        for s in consultant_schools:
            profile = db.query(ConsultantProfile).filter(ConsultantProfile.id == s.consultant_profile_id).first()
            if profile:
                user = db.query(User).filter(User.id == profile.user_id).first()
                ben_to_user[s.ben] = {
                    "org": s.school_name,
                    "user_email": user.email if user else None,
                    "user_id": user.id if user else None,
                    "source": "consultant",
                }

        for b in applicant_bens_db:
            profile = db.query(ApProfile).filter(ApProfile.id == b.applicant_profile_id).first()
            if profile:
                user = db.query(User).filter(User.id == profile.user_id).first()
                ben_to_user[b.ben] = {
                    "org": b.organization_name or (profile.organization_name if profile else None),
                    "user_email": user.email if user else None,
                    "user_id": user.id if user else None,
                    "source": "applicant",
                }

        all_bens = list(set(
            [s.ben for s in consultant_schools if s.ben] +
            [b.ben for b in applicant_bens_db if b.ben]
        ))

        all_frn_records = []
        now = datetime.utcnow()

        # Sliding funding year window: only current year and previous year
        # to avoid pulling records back to 2014 on every refresh.
        current_year = now.year
        funding_years = [current_year, current_year - 1]

        # Batch fetch from USAC for all BENs (sliding 2-year window)
        if all_bens:
            try:
                client = USACDataClient()
                for fy in funding_years:
                    batch_result = client.get_frn_status_batch(all_bens, year=fy)
                    if batch_result.get("success"):
                        for ben, ben_data in batch_result.get("results", {}).items():
                            user_info = ben_to_user.get(str(ben), {})
                            entity_name = ben_data.get("entity_name") or user_info.get("org") or ""
                            for frn in ben_data.get("frns", []):
                                all_frn_records.append({
                                    "frn": frn.get("frn", ""),
                                    "status": frn.get("status", "Unknown"),
                                    "funding_year": str(frn.get("funding_year", "")),
                                    "amount_requested": float(frn.get("commitment_amount", 0) or 0),
                                    "amount_committed": float(frn.get("disbursed_amount", 0) or 0),
                                    "service_type": frn.get("service_type", ""),
                                    "organization_name": entity_name,
                                    "ben": str(ben),
                                    "user_id": user_info.get("user_id"),
                                    "user_email": user_info.get("user_email"),
                                    "source": user_info.get("source", "unknown"),
                                    "fcdl_date": frn.get("fcdl_date", ""),
                                    "pending_reason": frn.get("pending_reason", ""),
                                    "spin": frn.get("spin_name") or frn.get("spin") or "",
                                    "contract_number": frn.get("contract_number", "") or "",
                                    "last_refreshed": now,
                                })
            except Exception as e:
                logger.warning(f"Admin FRN snapshot BEN batch fetch failed: {e}")

        # Fetch vendor SPIN FRNs (sliding 2-year window)
        for vp in vendor_profiles:
            try:
                client = USACDataClient()
                for fy in funding_years:
                    spin_result = client.get_frn_status_by_spin(vp.spin, year=fy)
                    if spin_result.get("success"):
                        user = db.query(User).filter(User.id == vp.user_id).first()
                        for frn in spin_result.get("frns", []):
                            all_frn_records.append({
                                "frn": frn.get("frn", ""),
                                "status": frn.get("status", "Unknown"),
                                "funding_year": str(frn.get("funding_year", "")),
                                "amount_requested": float(frn.get("commitment_amount", 0) or 0),
                                "amount_committed": float(frn.get("disbursed_amount", 0) or 0),
                                "service_type": frn.get("service_type", ""),
                                "organization_name": frn.get("entity_name") or vp.company_name or "",
                                "ben": frn.get("ben", ""),
                                "user_id": user.id if user else None,
                                "user_email": user.email if user else None,
                                "source": "vendor",
                                "fcdl_date": frn.get("fcdl_date", ""),
                                "pending_reason": frn.get("pending_reason", ""),
                                "spin": frn.get("spin_name") or frn.get("spin") or vp.spin or "",
                                "contract_number": frn.get("contract_number", "") or "",
                                "last_refreshed": now,
                            })
            except Exception as e:
                logger.warning(f"Admin FRN snapshot SPIN fetch failed for {vp.spin}: {e}")

        # Replace all rows in snapshot table atomically
        if all_frn_records:
            from .frn_upsert import upsert_frn_snapshots

            result = upsert_frn_snapshots(
                db, all_frn_records,
                scope_type="ben", scope_value="",
                queue_status_changes=True,
            )
            logger.info(
                f"Admin FRN snapshot refreshed: "
                f"{result['inserts']} inserts, {result['updates']} updates, {result['alerts']} alerts queued"
            )
        else:
            logger.info("Admin FRN snapshot: No FRN records found to store")

    except Exception as e:
        logger.error(f"Admin FRN snapshot refresh failed: {e}")
        try:
            db.rollback()
        except:
            pass
    finally:
        db.close()


def background_refresh_portfolio(uid: int, uemail: str, ben_to_org: dict):
    """
    Background task to pull USAC FRN data for a specific user's BENs and UPSERT them.
    Used when adding a new CRN or manually requesting a refresh.
    """
    db_bg = SessionLocal()
    try:
        from utils.usac_client import USACDataClient
        from .frn_upsert import upsert_frn_snapshots, build_rec_from_usac_frn

        client = USACDataClient()
        bens = list(ben_to_org.keys())
        batch_result = client.get_frn_status_batch(bens=bens)
        if not batch_result.get("success"):
            logger.error(f"Background refresh failed: {batch_result.get('error')}")
            return

        records = []
        for ben_key, ben_data in batch_result.get("results", {}).items():
            entity_name = ben_data.get("entity_name") or ben_to_org.get(str(ben_key)) or ""
            for frn in ben_data.get("frns", []):
                records.append(build_rec_from_usac_frn(
                    frn, ben=str(ben_key), entity_name=entity_name,
                    user_id=uid, user_email=uemail, source="consultant",
                ))

        result = upsert_frn_snapshots(
            db_bg, records,
            scope_type="ben", scope_value="",
            queue_status_changes=True,
        )
        logger.info(
            f"Background refresh for user {uid} complete: "
            f"{result['inserts']} inserts, {result['updates']} updates, {result['alerts']} alerts"
        )
    except Exception as e:
        logger.error(f"Background refresh exception: {str(e)}")
    finally:
        db_bg.close()


def refresh_vendor_form470_snapshot():
    """
    Daily job: Refresh the vendor_form470_snapshots table with current/next year
    Form 470 leads from USAC. Ensures the GET /vendor/470/leads endpoint responds
    in <500ms from local MySQL instead of 60s+ from live USAC.
    """
    logger.info("[470-snapshot] Starting vendor Form 470 snapshot refresh...")
    db = SessionLocal()
    try:
        import json as _json
        from utils.usac_client import USACDataClient
        from ..models.vendor_form470_snapshot import VendorForm470Snapshot

        client = USACDataClient()
        now = datetime.utcnow()

        # Fetch current + next year (no state filter = nationwide)
        result = client.get_470_leads(limit=10000, offset=0)
        if not result.get("success"):
            logger.error(f"[470-snapshot] USAC fetch failed: {result.get('error')}")
            return

        leads = result.get("leads", [])
        if not leads:
            logger.info("[470-snapshot] No leads returned from USAC")
            return

        # Replace all rows atomically
        db.query(VendorForm470Snapshot).delete(synchronize_session=False)
        for lead in leads:
            db.add(VendorForm470Snapshot(
                application_number=lead.get("application_number", ""),
                funding_year=str(lead.get("funding_year", "")),
                ben=lead.get("ben"),
                entity_name=lead.get("entity_name"),
                state=lead.get("state"),
                city=lead.get("city"),
                applicant_type=lead.get("applicant_type"),
                status=lead.get("status"),
                posting_date=lead.get("posting_date"),
                allowable_contract_date=lead.get("allowable_contract_date"),
                contact_name=lead.get("contact_name"),
                contact_email=lead.get("contact_email"),
                contact_phone=lead.get("contact_phone"),
                technical_contact=lead.get("technical_contact"),
                technical_email=lead.get("technical_email"),
                technical_phone=lead.get("technical_phone"),
                cat1_description=lead.get("cat1_description"),
                cat2_description=lead.get("cat2_description"),
                services_json=_json.dumps(lead.get("services", [])),
                manufacturers_json=_json.dumps(lead.get("manufacturers", [])),
                service_types_json=_json.dumps(lead.get("service_types", [])),
                categories_json=_json.dumps(lead.get("categories", [])),
                c2_budget_total=lead.get("c2_budget_total"),
                c2_budget_available=lead.get("c2_budget_available"),
                c2_budget_cycle=lead.get("c2_budget_cycle"),
                last_refreshed=now,
            ))
        db.commit()
        logger.info(f"[470-snapshot] Refreshed: {len(leads)} leads stored")
    except Exception as e:
        logger.error(f"[470-snapshot] Refresh failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def refresh_frn_disbursements():
    """
    Daily job: Refresh the frn_disbursements table from USAC disbursements dataset.
    Fetches disbursement data for all FRNs tracked in admin_frn_snapshots.
    """
    logger.info("[disbursements] Starting FRN disbursement refresh...")
    db = SessionLocal()
    try:
        from ..models.frn_disbursement import FRNDisbursement
        from ..models.admin_frn_snapshot import AdminFRNSnapshot
        from utils.usac_client import USACDataClient

        # Get all unique FRNs we track
        frn_rows = db.query(AdminFRNSnapshot.frn, AdminFRNSnapshot.funding_year).distinct().all()
        if not frn_rows:
            logger.info("[disbursements] No FRNs in snapshot table to look up")
            return

        client = USACDataClient()
        now = datetime.utcnow()
        updated = 0

        # Batch fetch disbursement data from USAC (dataset hbj5-2bpj)
        unique_frns = list(set(r.frn for r in frn_rows if r.frn))
        batch_size = 50  # Socrata limits IN clause cardinality / URL length
        import requests as _req
        import time as _time

        for i in range(0, len(unique_frns), batch_size):
            batch = unique_frns[i:i + batch_size]
            data = None
            # Retry with exponential backoff on transient errors
            for attempt in range(3):
                try:
                    quoted = ",".join(f"'{f}'" for f in batch)
                    # USAC dataset jpiu-tj8h = E-Rate Invoices and Authorized Disbursements (Forms 472/474).
                    # invoice_type='Applicant' -> BEAR (Form 472); invoice_type='Service Provider' -> SPI (Form 474).
                    url = "https://opendata.usac.org/resource/jpiu-tj8h.json"
                    params = {
                        "$where": f"funding_request_number IN ({quoted})",
                        "$limit": 50000,
                        "$select": "funding_request_number, funding_year, invoice_type, approved_inv_line_amt, inv_line_completion_date",
                    }
                    resp = _req.get(url, params=params, timeout=60)
                    resp.raise_for_status()
                    data = resp.json()
                    break  # success
                except _req.exceptions.HTTPError as http_err:
                    code = http_err.response.status_code if http_err.response is not None else 0
                    if code in (400, 429, 500, 502, 503, 504) and attempt < 2:
                        wait = (4 ** attempt)  # 1s, 4s, 16s
                        logger.warning(
                            f"[disbursements] Batch {i} attempt {attempt+1} got HTTP {code}, "
                            f"retrying in {wait}s (FRNs {batch[0]}..{batch[-1]})"
                        )
                        _time.sleep(wait)
                    else:
                        raise
                except Exception:
                    if attempt < 2:
                        _time.sleep(4 ** attempt)
                    else:
                        raise

            if data is None:
                logger.warning(
                    f"[disbursements] Batch {i} permanently failed after 3 attempts "
                    f"(FRNs {batch[0]}..{batch[-1]}), skipping"
                )
                continue

            # Aggregate by FRN
            try:
                frn_agg = {}
                for row in data:
                    frn_key = row.get("funding_request_number", "")
                    if not frn_key:
                        continue
                    if frn_key not in frn_agg:
                        frn_agg[frn_key] = {
                            "total": 0.0,
                            "last_date": None,
                            "bear": False,
                            "spi": False,
                            "count": 0,
                            "funding_year": row.get("funding_year", ""),
                        }
                    entry = frn_agg[frn_key]
                    entry["total"] += float(row.get("approved_inv_line_amt") or 0)
                    entry["count"] += 1
                    inv_date = row.get("inv_line_completion_date")
                    if inv_date:
                        inv_date_10 = inv_date[:10] if len(inv_date) >= 10 else inv_date
                        if entry["last_date"] is None or inv_date_10 > entry["last_date"]:
                            entry["last_date"] = inv_date_10
                    itype = (row.get("invoice_type") or "").strip().lower()
                    if itype == "applicant":
                        entry["bear"] = True
                    elif itype == "service provider":
                        entry["spi"] = True

                # UPSERT into frn_disbursements using MySQL ON DUPLICATE KEY UPDATE
                from sqlalchemy.dialects.mysql import insert as mysql_insert

                upsert_rows = []
                for frn_key, agg in frn_agg.items():
                    mode = "MIX" if (agg["bear"] and agg["spi"]) else ("BEAR" if agg["bear"] else ("SPI" if agg["spi"] else None))
                    last_date = None
                    if agg["last_date"]:
                        try:
                            from datetime import date as _date
                            parts = agg["last_date"].split("-")
                            last_date = _date(int(parts[0]), int(parts[1]), int(parts[2]))
                        except Exception:
                            pass

                    upsert_rows.append({
                        "frn": frn_key,
                        "funding_year": str(agg["funding_year"]),
                        "total_authorized_disbursement": agg["total"],
                        "last_invoice_date": last_date,
                        "invoicing_mode": mode,
                        "disbursement_count": agg["count"],
                        "updated_at": now,
                    })

                if upsert_rows:
                    stmt = mysql_insert(FRNDisbursement).values(upsert_rows)
                    stmt = stmt.on_duplicate_key_update(
                        total_authorized_disbursement=stmt.inserted.total_authorized_disbursement,
                        last_invoice_date=stmt.inserted.last_invoice_date,
                        invoicing_mode=stmt.inserted.invoicing_mode,
                        disbursement_count=stmt.inserted.disbursement_count,
                        updated_at=stmt.inserted.updated_at,
                    )
                    db.execute(stmt)
                    updated += len(upsert_rows)

                db.commit()
                logger.info(f"[disbursements] Batch {i} processed: {len(frn_agg)} FRNs")
            except Exception as e:
                logger.warning(f"[disbursements] Batch {i} DB write failed: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass
                # Reconnect session if connection was lost
                try:
                    db.execute(db.query(AdminFRNSnapshot.frn).limit(1))
                except Exception:
                    db.close()
                    db = SessionLocal()

        logger.info(f"[disbursements] Refresh complete: {updated} FRNs updated")
    except Exception as e:
        logger.error(f"[disbursements] Refresh failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


def refresh_predicted_leads():
    """
    Weekly job: Refresh predictive lead intelligence.
    Fetches fresh data from USAC Socrata API and runs all prediction algorithms.
    Premium feature ($499/mo addon for vendors).
    """
    logger.info("Starting predictive leads refresh...")
    db = SessionLocal()
    try:
        from app.services.prediction_service import prediction_service
        
        result = prediction_service.generate_all_predictions(
            db=db,
            force_refresh=False  # Keep existing viewed/contacted predictions
        )
        
        if result.get('success'):
            logger.info(
                f"Predictive leads refresh complete: {result.get('total_predictions', 0)} predictions. "
                f"Contract: {result['counts'].get('contract_expiry', 0)}, "
                f"Equipment: {result['counts'].get('equipment_refresh', 0)}, "
                f"C2 Budget: {result['counts'].get('c2_budget_reset', 0)}. "
                f"Duration: {result.get('duration_seconds', 0):.1f}s"
            )
        else:
            logger.error(f"Predictive leads refresh failed: {result.get('error', 'Unknown')}")
    except Exception as e:
        logger.error(f"Predictive leads refresh job failed: {e}")
    finally:
        db.close()


def process_frn_watch_reports():
    """
    Process FRN watch monitors and send email reports.
    Runs every hour, checks for watches whose next_send_at has passed.
    """
    logger.info("Running FRN watch report processing...")
    
    db = SessionLocal()
    try:
        from .frn_report_service import FRNReportService
        report_service = FRNReportService(db)
        result = report_service.process_due_watches()
        
        logger.info(
            f"FRN watch processing complete. "
            f"Processed: {result['processed']}, Emails: {result.get('emails_sent', 0)}, "
            f"SMS: {result.get('sms_sent', 0)}, Errors: {result['errors']}"
        )
    except Exception as e:
        logger.error(f"FRN watch report processing failed: {e}")
    finally:
        db.close()


def run_form470_scanner_job():
    """Pull USAC Form 470 dataset and match against vendor alert subs.
    Runs every 15 minutes via APScheduler (P2 of Vendor Parity Plan v2)."""
    logger.info("[form470_scanner] starting scheduled run")
    try:
        from .form470_scanner import run_scanner
        result = run_scanner()
        logger.info(
            "[form470_scanner] done pulled=%s inserted=%s matches=%s error=%s",
            result.get("rows_pulled"),
            result.get("rows_inserted"),
            result.get("matches_created"),
            result.get("error"),
        )
    except Exception as e:
        logger.error(f"[form470_scanner] scheduled run failed: {e}")


def init_scheduler():
    """Initialize the background scheduler with all jobs.

    Cross-process safety (added 2026-05-27):
    When uvicorn runs with --workers > 1, every worker process executes the
    FastAPI `lifespan` startup, which would otherwise start APScheduler N
    times and fire each job N times. We use an O_CREAT|O_EXCL sentinel file
    so only the first worker that wins the race starts the scheduler; the
    others log and return. The sentinel is recreated each container boot
    because /tmp is fresh on every DigitalOcean deploy.

    Override with `SKYRATE_DISABLE_SCHEDULER=1` to skip entirely
    (useful when running the scheduler in a dedicated DO worker component).
    """
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler already initialized")
        return

    import os as _os

    if _os.environ.get("SKYRATE_DISABLE_SCHEDULER") == "1":
        logger.info("Scheduler disabled via SKYRATE_DISABLE_SCHEDULER=1; skipping init")
        return

    # Single-leader election across uvicorn workers via O_EXCL sentinel.
    # First worker to create the file wins and starts the scheduler.
    _lock_path = _os.environ.get("SKYRATE_SCHEDULER_LOCK", "/tmp/skyrate_scheduler.lock")

    def _try_acquire():
        try:
            _fd = _os.open(_lock_path, _os.O_CREAT | _os.O_EXCL | _os.O_WRONLY, 0o644)
            try:
                _os.write(_fd, f"pid={_os.getpid()}\n".encode())
            finally:
                _os.close(_fd)
            return True
        except FileExistsError:
            return False

    if not _try_acquire():
        # Lock exists. If the owning PID is dead (crashed worker), reclaim it.
        try:
            with open(_lock_path, "r") as _lf:
                _content = _lf.read().strip()
            _owner_pid = None
            if _content.startswith("pid="):
                try:
                    _owner_pid = int(_content[4:])
                except ValueError:
                    _owner_pid = None
            _is_alive = False
            if _owner_pid:
                try:
                    _os.kill(_owner_pid, 0)
                    _is_alive = True
                except (ProcessLookupError, PermissionError):
                    _is_alive = False
                except OSError:
                    _is_alive = True  # be conservative
            if not _is_alive:
                logger.warning(
                    f"Scheduler lock {_lock_path} held by dead pid={_owner_pid}; reclaiming"
                )
                try:
                    _os.unlink(_lock_path)
                except OSError:
                    pass
                if not _try_acquire():
                    logger.info(
                        f"Another worker beat us to reclaiming {_lock_path}; skipping init in this worker"
                    )
                    return
            else:
                logger.info(
                    f"Scheduler lock {_lock_path} held by live pid={_owner_pid}; skipping init in this worker"
                )
                return
        except OSError as e:
            logger.warning(f"Could not inspect scheduler lock {_lock_path}: {e}; skipping init")
            return

    scheduler = BackgroundScheduler()

    # FIX (2026-05-18): Every IntervalTrigger job now sets next_run_time so the
    # first execution happens shortly after boot. Previously, IntervalTrigger(hours=N)
    # deferred the first run by N hours after scheduler.start(). Because the
    # production worker restarts on every deploy (usually < 6h apart), the 6h and
    # 12h jobs almost never fired - which is why scheduled alerts never reached users.
    boot = datetime.utcnow()

    # Deadline check - daily at 10:30 AM Pacific (17:30 UTC), after snapshot refresh
    scheduler.add_job(
        check_upcoming_deadlines,
        trigger=CronTrigger(hour=17, minute=30, timezone='UTC'),
        id='check_deadlines',
        name='Check upcoming deadlines (daily after snapshot refresh)',
        replace_existing=True,
    )

    # Invoicing-deadline sweep (opt-in) - daily at 18:00 UTC, after deadline check.
    # No-op until a user enables alert_on_invoice_deadline; idempotent per day-bucket.
    scheduler.add_job(
        check_invoicing_deadlines,
        trigger=CronTrigger(hour=18, minute=0, timezone='UTC'),
        id='check_invoicing_deadlines',
        name='Check approaching BEAR/SPI invoicing deadlines (opt-in)',
        replace_existing=True,
    )

    # Daily FRN digest - 08:00 America/New_York every day
    scheduler.add_job(
        send_daily_digests,
        trigger=CronTrigger(hour=8, minute=0, timezone='America/New_York'),
        id='daily_digest',
        name='Send FRN daily digest emails',
        replace_existing=True
    )

    # Weekly summary - Monday 9 AM
    scheduler.add_job(
        send_weekly_summaries,
        trigger=CronTrigger(day_of_week='mon', hour=9, minute=0),
        id='weekly_summary',
        name='Send weekly summary emails',
        replace_existing=True
    )

    # FRN status sync - DEACTIVATED: replaced by single daily admin snapshot refresh
    # at 17:00 UTC (10:00 AM PT). The admin snapshot job now handles all FRN syncing.
    # scheduler.add_job(
    #     sync_frn_statuses,
    #     trigger=IntervalTrigger(hours=1),
    #     id='sync_frn_statuses',
    #     name='Sync FRN statuses from USAC',
    #     replace_existing=True,
    #     next_run_time=boot + timedelta(minutes=2),
    # )

    # Consultant FRN status sync - DEACTIVATED: replaced by single daily admin snapshot refresh
    # scheduler.add_job(
    #     sync_consultant_frn_statuses,
    #     trigger=IntervalTrigger(hours=2),
    #     id='sync_consultant_frn_statuses',
    #     name='Sync consultant school FRN statuses from USAC',
    #     replace_existing=True,
    #     next_run_time=boot + timedelta(minutes=3),
    # )

    # Long-pending FRN check - every 12 hours (first run 4 min after boot)
    scheduler.add_job(
        check_long_pending_frns,
        trigger=IntervalTrigger(hours=12),
        id='check_long_pending',
        name='Check FRNs pending > 15 days',
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=4),
    )

    # Admin FRN snapshot refresh - daily at 10:00 AM Pacific (17:00 UTC)
    # Shortly after USAC's daily 9:00 AM PT database refresh.
    scheduler.add_job(
        refresh_admin_frn_snapshot,
        trigger=CronTrigger(hour=17, minute=0, timezone='UTC'),
        id='refresh_admin_frn_snapshot',
        name='Refresh admin FRN snapshot from USAC (daily 10:00 AM PT)',
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=5),
    )
    
    # Predictive leads refresh - weekly on Sunday 2 AM
    scheduler.add_job(
        refresh_predicted_leads,
        trigger=CronTrigger(day_of_week='sun', hour=2, minute=0),
        id='refresh_predicted_leads',
        name='Refresh predictive lead intelligence from USAC',
        replace_existing=True
    )
    
    # FRN watch report processing - every hour (first run 6 min after boot)
    scheduler.add_job(
        process_frn_watch_reports,
        trigger=IntervalTrigger(hours=1),
        id='process_frn_watches',
        name='Process FRN watch email reports',
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=6),
    )
    
    # Form 470 scanner - once daily at 15:00 UTC (reduced 2026-06-27 from every
    # 15 min). USAC refreshes open data weekly (Mon ~9 AM ET), so sub-daily
    # polling re-pulled identical data ~96x/day. First run warms ~10 min after
    # boot so a fresh deploy still populates vendor alerts.
    scheduler.add_job(
        run_form470_scanner_job,
        trigger=CronTrigger(hour=15, minute=0, timezone='UTC'),
        id='form470_scanner',
        name='Pull USAC Form 470 + match vendor alerts (daily)',
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=10),
    )

    # Vendor Form 470 snapshot - daily at 04:00 UTC (first run 7 min after boot)
    scheduler.add_job(
        refresh_vendor_form470_snapshot,
        trigger=CronTrigger(hour=4, minute=0),
        id='refresh_vendor_form470_snapshot',
        name='Refresh vendor Form 470 leads snapshot from USAC',
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=7),
    )

    # FRN disbursements - daily at 04:30 UTC (first run 8 min after boot)
    scheduler.add_job(
        refresh_frn_disbursements,
        trigger=CronTrigger(hour=4, minute=30),
        id='refresh_frn_disbursements',
        name='Refresh FRN disbursement data from USAC',
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        next_run_time=boot + timedelta(minutes=8),
    )

    # perf_v2 nightly hydration - 03:00 UTC daily + a boot-time warm at +90s
    # to make sure every active user has a freshly populated
    # user_usac_cache + FRN cache row even right after a restart.
    # Runs ONLY on the dedicated scheduler worker (SKYRATE_DISABLE_SCHEDULER=0).
    def _nightly_perf_v2_hydration():
        try:
            from ..api.v1.admin_jobs import _run_bulk_hydration
            _run_bulk_hydration(trigger="nightly", pace_seconds=0.5)
        except Exception as exc:
            logger.exception("perf_v2 nightly hydration failed: %s", exc)

    scheduler.add_job(
        _nightly_perf_v2_hydration,
        trigger=CronTrigger(hour=3, minute=0),
        id='perf_v2_nightly_hydration',
        name='perf_v2: nightly USAC hydration + FRN cache warm',
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        next_run_time=boot + timedelta(seconds=90),
    )

    scheduler.start()
    logger.info("Background scheduler started with jobs:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name} ({job.id})")


def shutdown_scheduler():
    """Shutdown the scheduler gracefully"""
    global scheduler

    if scheduler is not None:
        scheduler.shutdown()
        scheduler = None
        logger.info("Background scheduler shut down")
        # Release the cross-worker lock so the next deploy / restart can re-elect.
        import os as _os
        _lock_path = _os.environ.get("SKYRATE_SCHEDULER_LOCK", "/tmp/skyrate_scheduler.lock")
        try:
            _os.unlink(_lock_path)
        except FileNotFoundError:
            pass
        except OSError as e:
            logger.warning(f"Could not remove scheduler lock {_lock_path}: {e}")


def get_scheduler_status():
    """Get status of all scheduled jobs"""
    if scheduler is None:
        return {"status": "not_running", "jobs": []}
    
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
        })
    
    return {
        "status": "running",
        "jobs": jobs
    }


def run_job_now(job_id: str) -> bool:
    """Manually trigger a scheduled job"""
    if scheduler is None:
        return False
    
    job = scheduler.get_job(job_id)
    if job:
        job.modify(next_run_time=datetime.now())
        return True
    return False
