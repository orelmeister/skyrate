"""
Leads API — public lead capture endpoint.

POST /v1/leads/capture is intentionally PUBLIC (no auth) so erateapp.com and
other SkyRate landing pages can submit leads directly.

Anti-abuse:
- 10/min per IP rate limit (in-memory; sufficient until we add Redis)
- Honeypot field `_hp` — silent discard if filled
- Email validated by Pydantic EmailStr
- Phone reduced to digits only

Notification: every captured lead emails admin@skyrate.ai via the existing
EmailService. Failures are logged, never block the response.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime, timedelta
from collections import defaultdict, deque
from threading import Lock
import logging
import re

from ...core.database import get_db
from ...models.lead import Lead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["Leads"])


# ==================== RATE LIMITING (in-memory) ====================

_RATE_WINDOW_SECONDS = 60
_RATE_MAX_HITS = 10
_rate_log: dict = defaultdict(deque)
_rate_lock = Lock()


def _check_rate_limit(ip: str) -> bool:
    """Return True if the request is allowed. Uses a per-IP sliding 60s window."""
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

class LeadCapture(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=50)
    role: Literal["consultant", "vendor", "applicant", "unsure"] = "unsure"
    ben: Optional[str] = Field(None, max_length=50)
    organization: Optional[str] = Field(None, max_length=255)
    student_count: Optional[int] = Field(None, ge=0, le=10_000_000)
    source: str = Field(..., max_length=255)
    utm_source: Optional[str] = Field(None, max_length=120)
    utm_medium: Optional[str] = Field(None, max_length=120)
    utm_campaign: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None, max_length=4000)
    # Honeypot — should always be empty for real users.
    # Pydantic v2 forbids leading-underscore field names, so we name the
    # attribute `hp` and accept the form-field name `_hp` via alias.
    hp: Optional[str] = Field(None, alias="_hp")

    class Config:
        populate_by_name = True


class LeadCaptureResponse(BaseModel):
    success: bool
    lead_id: int


# ==================== HELPERS ====================

def _strip_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return digits or None


def _send_admin_lead_email(lead_id: int, payload: dict) -> None:
    """Notify admin@skyrate.ai about a new lead. Best-effort."""
    try:
        from ...services.email_service import get_email_service
        email_svc = get_email_service()

        rows = []
        for k in ("name", "email", "phone", "role", "organization", "ben",
                 "student_count", "source", "utm_source", "utm_medium",
                 "utm_campaign", "notes", "ip_address"):
            v = payload.get(k)
            if v is None or v == "":
                continue
            rows.append(
                f"<tr><td style='padding:6px 12px;color:#64748b;font-size:12px;text-transform:uppercase;'>"
                f"{k}</td><td style='padding:6px 12px;color:#0f172a;font-size:14px;'>{v}</td></tr>"
            )

        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#7c3aed;">New SkyRate Lead #{lead_id}</h2>
          <p style="color:#475569;">A visitor just submitted the lead-capture form.</p>
          <table style="border-collapse:collapse;border:1px solid #e2e8f0;width:100%;border-radius:8px;overflow:hidden;">
            {''.join(rows)}
          </table>
          <p style="color:#94a3b8;font-size:12px;margin-top:16px;">
            Manage this lead at https://skyrate.ai/superadmin/leads
          </p>
        </div>
        """
        text = "\n".join(f"{k}: {payload[k]}" for k in payload if payload[k] not in (None, ""))

        email_svc.send_email(
            to_email="admin@skyrate.ai",
            subject=f"[SkyRate Lead] {payload.get('name')} ({payload.get('role')})",
            html_content=html,
            text_content=text,
            email_type="alert",
        )
    except Exception as e:
        logger.error(f"Failed to send admin lead email for lead {lead_id}: {e}")


# ==================== ENDPOINTS ====================

@router.post("/capture", response_model=LeadCaptureResponse, status_code=status.HTTP_200_OK)
async def capture_lead(
    payload: LeadCapture,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Public lead-capture endpoint. No auth required.

    Used by erateapp.com forms, free-tool landing pages, and any other
    inbound funnel surface.
    """
    # 1) Rate limit
    client_ip = (request.client.host if request.client else "unknown") or "unknown"
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        client_ip = fwd.split(",")[0].strip() or client_ip

    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again in a minute.",
        )

    # 2) Honeypot — silently discard bots, but return success
    hp_value = getattr(payload, "hp", None)
    if hp_value:
        logger.warning(f"Honeypot triggered from {client_ip}: hp={hp_value!r}")
        return LeadCaptureResponse(success=True, lead_id=0)

    # 3) Insert
    lead = Lead(
        name=payload.name.strip(),
        email=str(payload.email).lower().strip(),
        phone=_strip_phone(payload.phone),
        role=payload.role,
        ben=(payload.ben or "").strip() or None,
        organization=(payload.organization or "").strip() or None,
        student_count=payload.student_count,
        source=payload.source.strip(),
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
        notes=(payload.notes or "").strip() or None,
        ip_address=client_ip,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
        status="new",
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    logger.info(f"Lead captured: id={lead.id} email={lead.email} role={lead.role} source={lead.source}")

    # 4) Notify admin (best-effort, non-blocking)
    background_tasks.add_task(_send_admin_lead_email, lead.id, lead.to_dict())

    return LeadCaptureResponse(success=True, lead_id=lead.id)
