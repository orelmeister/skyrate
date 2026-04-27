"""
Public Tools API — no-login utilities exposed for SEO and lead generation.

These endpoints are intentionally PUBLIC (no auth) and rate-limited per IP
so they can power free tools on skyrate.ai (e.g. /tools/frn-tracker).

Phase 2 (commit shipping this): adds POST /v1/public/frn-lookup which queries
the USAC Open Data FRN Status dataset (qdmp-ygft) for a single Funding Request
Number and returns the public-record fields we want to display on the free
FRN tracker page.

Anti-abuse:
- 30/hr per IP rate limit (in-memory; sufficient until we add Redis)
- FRN format validation (digits only, length-bounded)
- USAC client timeout enforcement
"""

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from collections import defaultdict, deque
from threading import Lock
import logging
import re

from utils.usac_client import USACDataClient, USAC_ENDPOINTS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["Public Tools"])


# ==================== RATE LIMITING (in-memory) ====================

_RATE_WINDOW_SECONDS = 3600  # 1 hour
_RATE_MAX_HITS = 30
_rate_log: dict = defaultdict(deque)
_rate_lock = Lock()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        ip = fwd.split(",")[0].strip()
        if ip:
            return ip
    return (request.client.host if request.client else "unknown") or "unknown"


def _check_rate_limit(ip: str) -> bool:
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=_RATE_WINDOW_SECONDS)
    with _rate_lock:
        bucket = _rate_log[ip]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= _RATE_MAX_HITS:
            return False
        bucket.append(now)
        return True


# ==================== SCHEMAS ====================

class FRNLookupRequest(BaseModel):
    frn: str = Field(..., min_length=4, max_length=20, description="Funding Request Number (digits)")


class FRNRecord(BaseModel):
    frn: str
    funding_year: Optional[str] = None
    application_number: Optional[str] = None
    status: Optional[str] = None
    pending_reason: Optional[str] = None
    fcdl_comment: Optional[str] = None
    ben: Optional[str] = None
    applicant_name: Optional[str] = None
    state: Optional[str] = None
    spin_name: Optional[str] = None
    service_type: Optional[str] = None
    service_category: Optional[str] = None
    commitment_amount: float = 0.0
    disbursed_amount: float = 0.0
    discount_rate: float = 0.0
    award_date: Optional[str] = None
    fcdl_date: Optional[str] = None
    service_start: Optional[str] = None
    service_end: Optional[str] = None
    last_invoice_date: Optional[str] = None
    wave_number: Optional[str] = None
    updated_at: Optional[str] = None


class FRNLookupResponse(BaseModel):
    success: bool
    found: bool
    frn: str
    record: Optional[FRNRecord] = None
    message: Optional[str] = None


# ==================== HELPERS ====================

_FRN_RE = re.compile(r"^\d{4,20}$")


def _normalize_frn(frn_raw: str) -> Optional[str]:
    """Strip non-digits and validate. Returns canonical FRN or None if invalid."""
    if not frn_raw:
        return None
    digits = re.sub(r"\D", "", frn_raw)
    if not digits or not _FRN_RE.match(digits):
        return None
    return digits


def _categorize_status(status_raw: Optional[str]) -> str:
    """Coarse bucket for UI styling."""
    if not status_raw:
        return "unknown"
    s = status_raw.lower()
    if "denied" in s:
        return "denied"
    if "funded" in s or "committed" in s:
        return "funded"
    if "cancel" in s or "withdraw" in s:
        return "cancelled"
    return "pending"


def _query_frn(frn: str) -> Optional[Dict[str, Any]]:
    """Query USAC FRN Status dataset for a single FRN. Returns the most recent
    record (by funding_year DESC) or None if not found.
    """
    client = USACDataClient()
    url = USAC_ENDPOINTS["frn_status"]
    params = {
        "$select": "*, :updated_at",
        "$where": f"funding_request_number = '{frn}'",
        "$limit": 5,
        "$order": "funding_year DESC",
    }
    try:
        response = client.session.get(url, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        logger.error(f"USAC FRN lookup failed for {frn}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="USAC Open Data is temporarily unavailable. Please try again in a moment.",
        )

    if not data:
        return None
    return data[0]


def _record_to_pydantic(frn: str, raw: Dict[str, Any]) -> FRNRecord:
    def _f(key: str, default: float = 0.0) -> float:
        try:
            return float(raw.get(key, default) or default)
        except (TypeError, ValueError):
            return default

    return FRNRecord(
        frn=frn,
        funding_year=str(raw.get("funding_year") or "") or None,
        application_number=raw.get("application_number") or None,
        status=raw.get("form_471_frn_status_name") or raw.get("frn_status") or None,
        pending_reason=raw.get("pending_reason") or None,
        fcdl_comment=raw.get("fcdl_comment_frn") or raw.get("fcdl_comment") or None,
        ben=str(raw.get("ben") or "") or None,
        applicant_name=raw.get("organization_name") or None,
        state=raw.get("state") or None,
        spin_name=raw.get("spin_name") or None,
        service_type=raw.get("form_471_service_type_name") or raw.get("service_type") or None,
        service_category=raw.get("service_category") or None,
        commitment_amount=_f("funding_commitment_request"),
        disbursed_amount=_f("total_authorized_disbursement"),
        discount_rate=_f("dis_pct") * 100.0,
        award_date=raw.get("award_date") or None,
        fcdl_date=raw.get("fcdl_letter_date") or None,
        service_start=raw.get("service_start_date") or None,
        service_end=raw.get("service_delivery_deadline") or None,
        last_invoice_date=raw.get("last_date_to_invoice") or None,
        wave_number=str(raw.get("wave_sequence_number") or "") or None,
        updated_at=raw.get(":updated_at") or None,
    )


# ==================== ENDPOINTS ====================

@router.post("/frn-lookup", response_model=FRNLookupResponse, status_code=status.HTTP_200_OK)
async def public_frn_lookup(payload: FRNLookupRequest, request: Request):
    """Public FRN status lookup — no auth required. Backed by USAC Open Data.

    Used by the free tracker page at https://skyrate.ai/tools/frn-tracker.
    """
    ip = _client_ip(request)
    if not _check_rate_limit(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many lookups from your IP. Please try again in an hour.",
        )

    frn = _normalize_frn(payload.frn)
    if not frn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FRN must be a numeric string (4-20 digits).",
        )

    raw = _query_frn(frn)
    if not raw:
        return FRNLookupResponse(
            success=True,
            found=False,
            frn=frn,
            message="No public USAC record found for this FRN. It may be too new or never filed.",
        )

    record = _record_to_pydantic(frn, raw)
    logger.info(f"Public FRN lookup OK: frn={frn} status={record.status} ip={ip}")
    return FRNLookupResponse(success=True, found=True, frn=frn, record=record)


@router.get("/health", status_code=status.HTTP_200_OK)
async def public_tools_health() -> Dict[str, Any]:
    return {"ok": True, "tool": "public-tools", "ts": datetime.utcnow().isoformat() + "Z"}
