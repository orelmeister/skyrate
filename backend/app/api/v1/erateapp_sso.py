"""
erateapp Phase-1 embed / SSO bridge (SkyRate side).

Mints a short-lived, HMAC-signed SSO token that app.erateapp.com trusts, so a
logged-in SkyRate applicant can be dropped into their embedded erateapp
filing-journey workspace WITHOUT a second login.

DESIGN (Phase 1 — reverse-proxy + SSO, confirmed by Ari 2026-08-03):
- SkyRate stays the front door; erateapp stays the document / application
  system-of-record. Uploads still land in erateapp exactly as today.
- The SkyRate shell renders the erateapp workspace under a SkyRate-owned path
  (white-labeled), so to the client it reads as SkyRate, not erateapp.
- Identity key = BEN. The applicant's SkyRate profile carries the BEN; erateapp
  resolves the matching entity by BEN on the receiving end.

SAFETY — this whole bridge is INERT until the shared secret is provisioned:
- If ``settings.ERATEAPP_SSO_SECRET`` is unset, every endpoint here returns HTTP
  503 and NO token is ever minted. Shipping this code therefore cannot affect
  production auth in either app until the operator sets the secret in BOTH the
  SkyRate (DigitalOcean) and erateapp (Bluehost) environments.

Token format (compact, URL-safe, dependency-free):
    base64url(payload_json) + "." + base64url(hmac_sha256(secret, payload_bytes))
payload = {"ben": str, "role": str, "email": str, "iat": int, "exp": int,
           "iss": "skyrate"}
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.applicant import ApplicantProfile

router = APIRouter(prefix="/erateapp", tags=["erateapp SSO Bridge"])


def _b64url(raw: bytes) -> str:
    """URL-safe base64 without padding."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def mint_sso_token(ben: str, role: str, email: str) -> str:
    """Create a short-lived HMAC-signed SSO token for erateapp.

    Raises RuntimeError if the shared secret is not configured — callers must
    guard with ``_require_enabled()`` so this surfaces as a clean 503.
    """
    secret = settings.ERATEAPP_SSO_SECRET
    if not secret:
        raise RuntimeError("ERATEAPP_SSO_SECRET not configured")
    now = int(time.time())
    payload = {
        "ben": ben,
        "role": role,
        "email": email,
        "iat": now,
        "exp": now + int(settings.ERATEAPP_SSO_TTL_SECONDS or 120),
        "iss": "skyrate",
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    return f"{_b64url(payload_bytes)}.{_b64url(sig)}"


def _require_enabled() -> None:
    if not settings.ERATEAPP_SSO_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "erateapp portal bridge is not yet enabled. Set ERATEAPP_SSO_SECRET "
                "in the SkyRate and erateapp environments to activate it."
            ),
        )


def _resolve_ben(db: Session, user: User) -> Optional[str]:
    """Resolve the BEN to embed for this user.

    Applicants have an ApplicantProfile.ben. Admin/super accounts may also carry
    an applicant profile (seeded in main.py) for testing.
    """
    profile = (
        db.query(ApplicantProfile)
        .filter(ApplicantProfile.user_id == user.id)
        .first()
    )
    if profile and getattr(profile, "ben", None):
        return str(profile.ben)
    return None


@router.get("/portal-session")
async def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a white-labeled URL that logs the user into their embedded
    erateapp filing-journey via a one-time SSO token.

    The frontend /portal route loads the returned ``embed_url`` inside the
    SkyRate shell. Returns 503 while the bridge is disabled (secret unset).
    """
    _require_enabled()

    ben = _resolve_ben(db, current_user)
    if not ben:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No BEN is associated with your account, so there is no entity portal to open.",
        )

    role = getattr(current_user, "role", "applicant") or "applicant"
    token = mint_sso_token(ben=ben, role=str(role), email=current_user.email)

    base = settings.ERATEAPP_BASE_URL.rstrip("/")
    # erateapp consumes the token at /sso/consume, sets its entity session, and
    # redirects into the embedded (nav-stripped) filing journey.
    embed_url = f"{base}/sso/consume?token={quote(token)}&embed=1"

    return {
        "success": True,
        "ben": ben,
        "embed_url": embed_url,
        "expires_in": int(settings.ERATEAPP_SSO_TTL_SECONDS or 120),
    }


@router.get("/status")
async def bridge_status():
    """Lightweight readiness probe (no auth) so ops/frontend can check whether
    the bridge is enabled without minting a token."""
    return {"enabled": bool(settings.ERATEAPP_SSO_SECRET)}
