"""
USAC Data API Endpoints
Public USAC data lookups (FRN detail, entity info, etc.)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
import logging
import requests

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/usac", tags=["USAC Data"])

# USAC FRN Status dataset (qdmp-ygft)
FRN_STATUS_URL = "https://opendata.usac.org/resource/qdmp-ygft.json"


def _compute_deadlines(frn_data: dict) -> dict:
    """Compute deadline-related fields for an FRN record."""
    now = datetime.utcnow()
    result = {}

    # Appeal deadline: fcdl_date + 60 days (only for denied FRNs)
    status = (frn_data.get("status") or "").lower()
    fcdl_date_str = frn_data.get("fcdl_date") or ""
    if fcdl_date_str and "denied" in status:
        try:
            fcdl_date = datetime.fromisoformat(fcdl_date_str.replace("Z", "+00:00").split("T")[0])
            appeal_deadline = fcdl_date + timedelta(days=60)
            result["appeal_deadline"] = appeal_deadline.strftime("%Y-%m-%d")
            days_remaining = (appeal_deadline - now).days
            result["appeal_days_remaining"] = max(days_remaining, 0)
            if days_remaining <= 0:
                result["appeal_urgency"] = "expired"
            elif days_remaining <= 7:
                result["appeal_urgency"] = "critical"
            elif days_remaining <= 14:
                result["appeal_urgency"] = "high"
            elif days_remaining <= 30:
                result["appeal_urgency"] = "medium"
            else:
                result["appeal_urgency"] = "low"
        except (ValueError, TypeError):
            pass

    # Invoicing deadline
    invoice_date_str = frn_data.get("last_date_to_invoice") or ""
    if invoice_date_str:
        try:
            invoice_date = datetime.fromisoformat(invoice_date_str.replace("Z", "+00:00").split("T")[0])
            days_remaining = (invoice_date - now).days
            result["invoicing_days_remaining"] = max(days_remaining, 0)
            if days_remaining <= 0:
                result["invoicing_urgency"] = "expired"
            elif days_remaining <= 7:
                result["invoicing_urgency"] = "critical"
            elif days_remaining <= 14:
                result["invoicing_urgency"] = "high"
            elif days_remaining <= 30:
                result["invoicing_urgency"] = "medium"
            else:
                result["invoicing_urgency"] = "low"
        except (ValueError, TypeError):
            pass

    # Service delivery deadline
    svc_deadline_str = frn_data.get("service_delivery_deadline") or ""
    if svc_deadline_str:
        try:
            svc_date = datetime.fromisoformat(svc_deadline_str.replace("Z", "+00:00").split("T")[0])
            days_remaining = (svc_date - now).days
            result["service_delivery_days_remaining"] = max(days_remaining, 0)
            if days_remaining <= 0:
                result["service_delivery_urgency"] = "expired"
            elif days_remaining <= 14:
                result["service_delivery_urgency"] = "critical"
            elif days_remaining <= 30:
                result["service_delivery_urgency"] = "high"
            elif days_remaining <= 60:
                result["service_delivery_urgency"] = "medium"
            else:
                result["service_delivery_urgency"] = "low"
        except (ValueError, TypeError):
            pass

    return result


@router.get("/frn/{frn_number}")
async def get_frn_detail(
    frn_number: str,
    ben: Optional[str] = Query(None, description="Optional BEN filter"),
    year: Optional[int] = Query(None, description="Optional funding year filter"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get full FRN details from USAC qdmp-ygft dataset.
    Returns enriched data with computed deadlines and urgency levels.
    """
    try:
        where_conditions = [f"funding_request_number = '{frn_number}'"]
        if ben:
            where_conditions.append(f"ben = '{ben}'")
        if year:
            where_conditions.append(f"funding_year = '{year}'")

        params = {
            "$where": " AND ".join(where_conditions),
            "$limit": 5,
        }

        response = requests.get(FRN_STATUS_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if not data:
            raise HTTPException(status_code=404, detail=f"FRN {frn_number} not found in USAC data")

        record = data[0]

        # Map USAC fields to a clean response
        status = record.get("form_471_frn_status_name", "Unknown")
        commitment_amount = float(record.get("funding_commitment_request", 0) or 0)
        disbursed_amount = float(record.get("total_authorized_disbursement", 0) or 0)
        discount_rate = float(record.get("dis_pct", 0) or 0) * 100

        frn_data = {
            "frn": record.get("funding_request_number", frn_number),
            "ben": record.get("ben", ""),
            "organization_name": record.get("organization_name", ""),
            "status": status,
            "pending_reason": record.get("pending_reason", ""),
            "commitment_amount": commitment_amount,
            "disbursed_amount": disbursed_amount,
            "discount_rate": round(discount_rate, 1),
            "fcdl_date": record.get("fcdl_letter_date", ""),
            "fcdl_comment": record.get("fcdl_comment_frn", ""),
            "last_date_to_invoice": record.get("last_date_to_invoice", ""),
            "service_delivery_deadline": record.get("service_delivery_deadline", ""),
            "contract_expiration_date": record.get("contract_expiration_date", ""),
            "service_type": record.get("form_471_service_type_name", ""),
            "spin_name": record.get("spin_name", ""),
            "application_number": record.get("application_number", ""),
            "funding_year": record.get("funding_year", ""),
            "service_start_date": record.get("service_start_date", ""),
            "award_date": record.get("award_date", ""),
            "wave_number": record.get("wave_sequence_number", ""),
            "state": record.get("state", ""),
        }

        # Compute deadlines
        deadlines = _compute_deadlines(frn_data)
        frn_data.update(deadlines)

        return {
            "success": True,
            "frn": frn_data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching FRN {frn_number}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch FRN data: {str(e)}")


@router.post("/check-deadlines")
async def check_deadline_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Scan the current user's FRN watches and portfolio for approaching deadlines.
    Creates alerts for deadlines within the user's configured warning window.
    """
    from ...models.frn_watch import FRNWatch
    from ...models.consultant import ConsultantProfile, ConsultantSchool
    from ...models.vendor import VendorProfile
    from ...models.applicant import ApplicantProfile
    from ...models.alert import Alert, AlertType, AlertPriority, AlertConfig
    from ...services.alert_service import AlertService

    alert_service = AlertService(db)
    alerts_created = []

    # Get user's deadline warning threshold (default 14 days)
    config = alert_service.get_or_create_alert_config(current_user.id)
    warning_days = config.deadline_warning_days or 14

    # Collect BENs and FRNs to check
    bens_to_check = set()
    frns_to_check = set()

    # From FRN watches
    watches = db.query(FRNWatch).filter(
        FRNWatch.user_id == current_user.id,
        FRNWatch.is_active == True
    ).all()

    for watch in watches:
        if watch.watch_type == "frn" and watch.target_id:
            frns_to_check.add(watch.target_id)
        elif watch.watch_type == "ben" and watch.target_id:
            bens_to_check.add(watch.target_id)

    # From consultant portfolio
    if current_user.role == "consultant":
        profile = db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == current_user.id
        ).first()
        if profile:
            schools = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()
            for school in schools:
                bens_to_check.add(school.ben)

    # From applicant profile
    if current_user.role == "applicant":
        profile = db.query(ApplicantProfile).filter(
            ApplicantProfile.user_id == current_user.id
        ).first()
        if profile and profile.ben:
            bens_to_check.add(profile.ben)

    if not bens_to_check and not frns_to_check:
        return {"success": True, "alerts_created": 0, "message": "No BENs or FRNs to monitor"}

    # Query USAC for FRN data
    now = datetime.utcnow()
    frn_records = []

    try:
        # Fetch FRN data for each BEN
        for ben in bens_to_check:
            where_clause = f"ben = '{ben}'"
            params = {"$where": where_clause, "$limit": 100, "$order": "funding_year DESC"}
            resp = requests.get(FRN_STATUS_URL, params=params, timeout=30)
            resp.raise_for_status()
            frn_records.extend(resp.json())

        # Fetch specific FRNs
        for frn in frns_to_check:
            where_clause = f"funding_request_number = '{frn}'"
            params = {"$where": where_clause, "$limit": 5}
            resp = requests.get(FRN_STATUS_URL, params=params, timeout=30)
            resp.raise_for_status()
            frn_records.extend(resp.json())

    except Exception as e:
        logger.error(f"Error fetching USAC data for deadline check: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch USAC data for deadline check")

    # Deduplicate by FRN number
    seen_frns = set()
    unique_records = []
    for record in frn_records:
        frn_num = record.get("funding_request_number")
        if frn_num and frn_num not in seen_frns:
            seen_frns.add(frn_num)
            unique_records.append(record)

    # Check deadlines for each FRN
    for record in unique_records:
        frn_data = {
            "status": record.get("form_471_frn_status_name", ""),
            "fcdl_date": record.get("fcdl_letter_date", ""),
            "last_date_to_invoice": record.get("last_date_to_invoice", ""),
            "service_delivery_deadline": record.get("service_delivery_deadline", ""),
        }
        deadlines = _compute_deadlines(frn_data)
        frn_num = record.get("funding_request_number", "")
        org_name = record.get("organization_name", "Unknown")

        # Check for duplicate alerts (don't spam same deadline)
        def _alert_exists(alert_type_val: str, entity_id: str, days_key: str) -> bool:
            recent = db.query(Alert).filter(
                Alert.user_id == current_user.id,
                Alert.alert_type == alert_type_val,
                Alert.entity_id == entity_id,
                Alert.created_at >= now - timedelta(days=3)
            ).first()
            return recent is not None

        # Appeal deadline
        appeal_days = deadlines.get("appeal_days_remaining")
        if appeal_days is not None and 0 < appeal_days <= warning_days:
            if not _alert_exists(AlertType.APPEAL_DEADLINE.value, frn_num, "appeal"):
                alert = alert_service.create_alert(
                    user_id=current_user.id,
                    alert_type=AlertType.APPEAL_DEADLINE,
                    title=f"Appeal Deadline: {org_name} FRN {frn_num}",
                    message=f"You have {appeal_days} days to file an appeal for FRN {frn_num} ({org_name}). Deadline: {deadlines.get('appeal_deadline')}.",
                    priority=AlertPriority.CRITICAL if appeal_days <= 7 else AlertPriority.HIGH,
                    entity_type="frn",
                    entity_id=frn_num,
                    entity_name=org_name,
                    metadata={"deadline_type": "appeal", "days_remaining": appeal_days, "deadline_date": deadlines.get("appeal_deadline")},
                )
                if alert:
                    alerts_created.append({"frn": frn_num, "type": "appeal", "days": appeal_days})

        # Invoicing deadline
        inv_days = deadlines.get("invoicing_days_remaining")
        if inv_days is not None and 0 < inv_days <= warning_days:
            if not _alert_exists(AlertType.DEADLINE_APPROACHING.value, frn_num, "invoicing"):
                alert = alert_service.create_alert(
                    user_id=current_user.id,
                    alert_type=AlertType.DEADLINE_APPROACHING,
                    title=f"Invoicing Deadline: {org_name} FRN {frn_num}",
                    message=f"Invoicing deadline for FRN {frn_num} ({org_name}) is in {inv_days} days.",
                    priority=AlertPriority.HIGH if inv_days <= 7 else AlertPriority.MEDIUM,
                    entity_type="frn",
                    entity_id=frn_num,
                    entity_name=org_name,
                    metadata={"deadline_type": "invoicing", "days_remaining": inv_days},
                )
                if alert:
                    alerts_created.append({"frn": frn_num, "type": "invoicing", "days": inv_days})

        # Service delivery deadline
        svc_days = deadlines.get("service_delivery_days_remaining")
        if svc_days is not None and 0 < svc_days <= warning_days:
            if not _alert_exists(AlertType.DEADLINE_APPROACHING.value, f"{frn_num}_svc", "service"):
                alert = alert_service.create_alert(
                    user_id=current_user.id,
                    alert_type=AlertType.DEADLINE_APPROACHING,
                    title=f"Service Delivery Deadline: {org_name} FRN {frn_num}",
                    message=f"Service delivery deadline for FRN {frn_num} ({org_name}) is in {svc_days} days.",
                    priority=AlertPriority.HIGH if svc_days <= 14 else AlertPriority.MEDIUM,
                    entity_type="frn",
                    entity_id=f"{frn_num}_svc",
                    entity_name=org_name,
                    metadata={"deadline_type": "service_delivery", "days_remaining": svc_days},
                )
                if alert:
                    alerts_created.append({"frn": frn_num, "type": "service_delivery", "days": svc_days})

    return {
        "success": True,
        "alerts_created": len(alerts_created),
        "details": alerts_created,
        "frns_checked": len(unique_records),
        "bens_checked": len(bens_to_check),
    }
