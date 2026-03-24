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
