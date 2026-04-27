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
    applicant_email: Optional[str] = None
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
    # Phase 2 enhancement (April 26, 2026):
    # Surface "you can still appeal/recover this funding" prompts when the
    # FRN is denied or canceled in the CURRENT calendar year. Frontend
    # uses this to render an unmissable red banner + CTA.
    urgent_help_eligible: bool = False
    urgent_help_message: Optional[str] = None
    auto_lead_captured: bool = False


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

    # USAC qdmp-ygft surfaces a small handful of contact-email-ish fields
    # depending on which join is current. Try them all in priority order.
    applicant_email = (
        raw.get("applicant_contact_email")
        or raw.get("contact_email")
        or raw.get("applicant_email")
        or raw.get("billed_entity_contact_email")
        or raw.get("be_contact_email")
        or None
    )
    if applicant_email and "@" not in applicant_email:
        applicant_email = None

    return FRNRecord(
        frn=frn,
        funding_year=str(raw.get("funding_year") or "") or None,
        application_number=raw.get("application_number") or None,
        status=raw.get("form_471_frn_status_name") or raw.get("frn_status") or None,
        pending_reason=raw.get("pending_reason") or None,
        fcdl_comment=raw.get("fcdl_comment_frn") or raw.get("fcdl_comment") or None,
        ben=str(raw.get("ben") or "") or None,
        applicant_name=raw.get("organization_name") or None,
        applicant_email=applicant_email,
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


def _is_current_year_denial_or_cancel(record: FRNRecord) -> tuple[bool, Optional[str]]:
    """If this FRN is denied/canceled AND its funding_year matches the current
    calendar year, return (True, message) so the frontend can render an
    "appeal-now" prompt. Otherwise (False, None).
    """
    if not record.status:
        return False, None
    s = record.status.lower()
    is_denied = "denied" in s
    is_cancelled = "cancel" in s  # matches both "canceled" and "cancelled"
    if not (is_denied or is_cancelled):
        return False, None

    current_year = str(datetime.utcnow().year)
    fy_raw = (record.funding_year or "").strip()
    # funding_year may be "2026" or "FY2026" etc.
    fy_digits = re.sub(r"\D", "", fy_raw)
    if fy_digits != current_year:
        return False, None

    verb = "denied" if is_denied else "canceled"
    msg = (
        f"Your FY{current_year} FRN was {verb}. Appeals must be filed within 60 days of the FCDL "
        f"under FCC Order 19-117 — SkyRate AI can help you recover this funding."
    )
    return True, msg


def _try_auto_capture_lead(record: FRNRecord, ip: str, user_agent: Optional[str]) -> bool:
    """Best-effort: if USAC gave us an email for this applicant, persist it
    as a Lead so admin/super sees inbound interest. Never blocks the
    response; failures are swallowed and logged.
    """
    if not record.applicant_email:
        return False
    try:
        from ...core.database import SessionLocal
        from ...models.lead import Lead
        db = SessionLocal()
        try:
            # Skip if we already auto-captured this email + FRN combo recently.
            existing = db.query(Lead).filter(
                Lead.email == record.applicant_email,
                Lead.source.like("frn-tracker-auto%"),
            ).order_by(Lead.created_at.desc()).first()
            if existing and existing.notes and f"FRN {record.frn}" in (existing.notes or ""):
                return False

            note = (
                f"Auto-captured from public FRN lookup of FRN {record.frn}. "
                f"Status: {record.status or 'unknown'}. "
                f"Funding Year: {record.funding_year or 'unknown'}. "
                f"BEN: {record.ben or 'unknown'}."
            )
            lead = Lead(
                name=record.applicant_name or "(USAC applicant — name unknown)",
                email=record.applicant_email,
                organization=record.applicant_name,
                role="applicant",
                ben=record.ben,
                source="frn-tracker-auto",
                notes=note,
                ip_address=ip[:64] if ip else None,
                user_agent=(user_agent or "")[:500] or None,
                status="new",
            )
            db.add(lead)
            db.commit()
            logger.info(f"[FRN-AUTO-LEAD] Captured lead for {record.applicant_email} (FRN {record.frn})")
            return True
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[FRN-AUTO-LEAD] Failed to auto-capture lead: {e}")
        return False


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
    urgent_eligible, urgent_msg = _is_current_year_denial_or_cancel(record)
    auto_lead = _try_auto_capture_lead(
        record,
        ip=ip,
        user_agent=request.headers.get("user-agent"),
    )
    logger.info(
        f"Public FRN lookup OK: frn={frn} status={record.status} fy={record.funding_year} "
        f"urgent={urgent_eligible} auto_lead={auto_lead} ip={ip}"
    )
    return FRNLookupResponse(
        success=True,
        found=True,
        frn=frn,
        record=record,
        urgent_help_eligible=urgent_eligible,
        urgent_help_message=urgent_msg,
        auto_lead_captured=auto_lead,
    )


@router.get("/ben-lookup", status_code=status.HTTP_200_OK)
async def public_ben_lookup(ben: str, request: Request) -> Dict[str, Any]:
    """Public BEN status lookup — returns all FRNs for a Billed Entity Number.
    No auth required. Backed by USAC Open Data frn_status dataset.

    Used by the free tracker page at https://skyrate.ai/tools/ben-tracker.
    """
    ip = _client_ip(request)
    if not _check_rate_limit(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many lookups from your IP. Please try again in an hour.",
        )

    # Validate BEN: digits only, 4-12 chars
    cleaned = re.sub(r"\D", "", (ben or "").strip())
    if not cleaned or len(cleaned) < 4 or len(cleaned) > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BEN must be a numeric string (4-12 digits).",
        )

    client = USACDataClient()
    url = USAC_ENDPOINTS["frn_status"]
    params = {
        "$select": "funding_request_number,funding_year,form_471_frn_status_name,frn_status,"
                   "organization_name,state,spin_name,form_471_service_type_name,service_type,"
                   "funding_commitment_request,total_authorized_disbursement,dis_pct",
        "$where": f"ben = '{cleaned}'",
        "$limit": 200,
        "$order": "funding_year DESC",
    }
    try:
        response = client.session.get(url, params=params, timeout=25)
        response.raise_for_status()
        records = response.json()
    except Exception as e:
        logger.error(f"USAC BEN lookup failed for {cleaned}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="USAC Open Data is temporarily unavailable. Please try again in a moment.",
        )

    if not records:
        return {
            "success": True,
            "found": False,
            "ben": cleaned,
            "message": "No public USAC records found for this BEN. It may be inactive or not yet filed.",
        }

    # Aggregate entity info from first record
    first = records[0]
    entity_name = first.get("organization_name") or None
    state = first.get("state") or None

    def _f(key: str, raw: Dict[str, Any]) -> float:
        try:
            return float(raw.get(key) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    frns = []
    total_committed = 0.0
    for r in records:
        amt = _f("funding_commitment_request", r)
        total_committed += amt
        frns.append({
            "frn": r.get("funding_request_number") or "",
            "funding_year": str(r.get("funding_year") or "") or None,
            "status": r.get("form_471_frn_status_name") or r.get("frn_status") or None,
            "commitment_amount": amt,
            "spin_name": r.get("spin_name") or None,
            "service_type": r.get("form_471_service_type_name") or r.get("service_type") or None,
        })

    logger.info(f"Public BEN lookup OK: ben={cleaned} frn_count={len(frns)} total=${total_committed:.0f} ip={ip}")
    return {
        "success": True,
        "found": True,
        "ben": cleaned,
        "record": {
            "ben": cleaned,
            "applicant_name": entity_name,
            "state": state,
            "total_committed": total_committed,
            "total_frns": len(frns),
            "frns": frns,
        },
    }


@router.get("/health", status_code=status.HTTP_200_OK)
async def public_tools_health() -> Dict[str, Any]:
    return {"ok": True, "tool": "public-tools", "ts": datetime.utcnow().isoformat() + "Z"}
