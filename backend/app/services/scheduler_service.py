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
        
        # Get all users with deadline alerts enabled
        configs = db.query(AlertConfig).filter(
            AlertConfig.alert_on_deadline == True
        ).all()
        
        for config in configs:
            try:
                _check_user_deadlines(db, alert_service, config)
            except Exception as e:
                logger.error(f"Error checking deadlines for user {config.user_id}: {e}")
        
        logger.info(f"Deadline check complete. Processed {len(configs)} users.")
        
    except Exception as e:
        logger.error(f"Deadline check job failed: {e}")
    finally:
        db.close()


def _check_user_deadlines(db: Session, alert_service: AlertService, config: AlertConfig):
    """Check deadlines for a specific user"""
    
    user = db.query(User).filter(User.id == config.user_id).first()
    if not user:
        return
    
    warning_days = config.deadline_warning_days or 14
    
    # Check applicant appeal deadlines
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
                    days_remaining=days_remaining
                )


def send_daily_digests():
    """
    Send daily digest emails to users who opted in.
    Runs at 8 AM every day.
    """
    logger.info("Running daily digest job...")
    
    db = SessionLocal()
    try:
        alert_service = AlertService(db)
        
        # Get all users with daily digest enabled
        configs = db.query(AlertConfig).filter(
            AlertConfig.daily_digest == True
        ).all()
        
        sent_count = 0
        for config in configs:
            try:
                if alert_service.send_daily_digest(config.user_id):
                    sent_count += 1
            except Exception as e:
                logger.error(f"Error sending digest to user {config.user_id}: {e}")
        
        logger.info(f"Daily digest complete. Sent {sent_count} digests.")
        
    except Exception as e:
        logger.error(f"Daily digest job failed: {e}")
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
        
        # Get all users with digest enabled (same flag)
        configs = db.query(AlertConfig).filter(
            AlertConfig.daily_digest == True
        ).all()
        
        sent_count = 0
        for config in configs:
            try:
                if alert_service.send_weekly_summary(config.user_id):
                    sent_count += 1
            except Exception as e:
                logger.error(f"Error sending summary to user {config.user_id}: {e}")
        
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
                                # Regular status change
                                alert_service.alert_on_status_change(
                                    user_id=profile.user_id,
                                    frn=frn_record.frn,
                                    school_name=profile.organization_name,
                                    old_status=old_status,
                                    new_status=new_status,
                                    amount=float(frn_record.amount_requested or 0)
                                )
            
            except Exception as e:
                logger.error(f"Error syncing FRN {frn_record.frn}: {e}")
        
        db.commit()
        logger.info(f"FRN sync complete. Updated {updated_count} FRNs.")
        
    except Exception as e:
        logger.error(f"FRN sync job failed: {e}")
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
    Notify all admin users when ANY user's FRN is denied.
    This gives admins visibility into denials across the entire platform.
    """
    try:
        admin_users = db.query(User).filter(User.role == "admin", User.is_active == True).all()
        
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
        logger.info(f"Notified {len(admin_users)} admin(s) about denial of FRN {frn}")
        
        # Also send email to admin
        try:
            from .email_service import EmailService
            email_service = EmailService()
            email_service.send_email(
                to_email="admin@skyrate.ai",
                subject=f"🚨 FRN Denial Alert: {frn} ({school_name})",
                html_content=f"""
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
                """,
                email_type='alert'
            )
        except Exception as e:
            logger.error(f"Failed to send admin denial email: {e}")
    
    except Exception as e:
        logger.error(f"Failed to notify admins of denial: {e}")


def refresh_admin_frn_snapshot():
    """
    Refresh the admin FRN snapshot table with ALL FRN data from USAC.
    This runs every 6 hours so the admin FRN monitor loads instantly from DB.
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

        # Batch fetch from USAC for all BENs (all years)
        if all_bens:
            try:
                client = USACDataClient()
                batch_result = client.get_frn_status_batch(all_bens)
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
                                "last_refreshed": now,
                            })
            except Exception as e:
                logger.warning(f"Admin FRN snapshot BEN batch fetch failed: {e}")

        # Fetch vendor SPIN FRNs
        for vp in vendor_profiles:
            try:
                client = USACDataClient()
                spin_result = client.get_frn_status_by_spin(vp.spin)
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
                            "last_refreshed": now,
                        })
            except Exception as e:
                logger.warning(f"Admin FRN snapshot SPIN fetch failed for {vp.spin}: {e}")

        # Replace all rows in snapshot table atomically
        if all_frn_records:
            db.query(AdminFRNSnapshot).delete()
            for rec in all_frn_records:
                db.add(AdminFRNSnapshot(**rec))
            db.commit()
            logger.info(f"Admin FRN snapshot refreshed: {len(all_frn_records)} FRNs stored")
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


def init_scheduler():
    """Initialize the background scheduler with all jobs"""
    global scheduler
    
    if scheduler is not None:
        logger.warning("Scheduler already initialized")
        return
    
    scheduler = BackgroundScheduler()
    
    # Deadline check - every 6 hours
    scheduler.add_job(
        check_upcoming_deadlines,
        trigger=IntervalTrigger(hours=6),
        id='check_deadlines',
        name='Check upcoming deadlines',
        replace_existing=True
    )
    
    # Daily digest - 8 AM every day
    scheduler.add_job(
        send_daily_digests,
        trigger=CronTrigger(hour=8, minute=0),
        id='daily_digest',
        name='Send daily digest emails',
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
    
    # FRN status sync - every hour
    scheduler.add_job(
        sync_frn_statuses,
        trigger=IntervalTrigger(hours=1),
        id='sync_frn_statuses',
        name='Sync FRN statuses from USAC',
        replace_existing=True
    )
    
    # Long-pending FRN check - every 12 hours
    scheduler.add_job(
        check_long_pending_frns,
        trigger=IntervalTrigger(hours=12),
        id='check_long_pending',
        name='Check FRNs pending > 15 days',
        replace_existing=True
    )
    
    # Admin FRN snapshot refresh - every 6 hours
    scheduler.add_job(
        refresh_admin_frn_snapshot,
        trigger=IntervalTrigger(hours=6),
        id='refresh_admin_frn_snapshot',
        name='Refresh admin FRN snapshot from USAC',
        replace_existing=True
    )
    
    # Predictive leads refresh - weekly on Sunday 2 AM
    scheduler.add_job(
        refresh_predicted_leads,
        trigger=CronTrigger(day_of_week='sun', hour=2, minute=0),
        id='refresh_predicted_leads',
        name='Refresh predictive lead intelligence from USAC',
        replace_existing=True
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
