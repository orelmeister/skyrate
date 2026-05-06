"""
Public email tracking endpoints for the denial-hunter outbound campaign.

These endpoints are intentionally UNAUTHENTICATED — they are hit by
recipients' email clients and browsers when they open emails or click
links. They write directly to the Hostinger denial_outreach table via
the shared denial_hunter_db engine.

Routes (mounted at /v1):
    GET /t/o/{token}        -> 1x1 transparent GIF, marks open
    GET /t/c/{token}        -> 302 redirect to ?u=<base64url>, marks click

Tokens are 32-char random strings inserted at send-time by the
denial-hunter scheduler. Unknown tokens are silently accepted (we still
return the pixel / redirect) to avoid leaking which tokens exist.
"""

from __future__ import annotations

import base64
import binascii
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import text

from app.services.denial_hunter_db import get_dh_engine

log = logging.getLogger(__name__)
router = APIRouter(tags=["denial-hunter-tracking"])

# 1x1 transparent GIF
_PIXEL_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
    b"!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
    b"\x00\x00\x02\x02D\x01\x00;"
)

_NO_CACHE = {
    "Cache-Control": "no-cache, no-store, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0",
}

_DEFAULT_REDIRECT = "https://skyrate.ai/scheduler"


def _safe_decode_url(b64: str) -> str:
    """Decode a base64url-encoded redirect target, or fall back to /scheduler."""
    if not b64:
        return _DEFAULT_REDIRECT
    try:
        # base64url -> base64
        padded = b64 + "=" * (-len(b64) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", "ignore")
        if raw.startswith("https://") or raw.startswith("http://"):
            return raw
    except (binascii.Error, ValueError, UnicodeDecodeError):
        pass
    return _DEFAULT_REDIRECT


def _record_open(token: str) -> None:
    eng = get_dh_engine()
    if eng is None:
        return
    now = datetime.utcnow()
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "UPDATE denial_outreach SET open_count = open_count + 1, "
                    "opened_at = COALESCE(opened_at, :now), "
                    "status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END "
                    "WHERE token = :token"
                ),
                {"now": now, "token": token},
            )
    except Exception:  # noqa: BLE001
        log.exception("denial_hunter open tracking failed (token=%s)", token[:8])


def _record_click(token: str, url: str) -> None:
    eng = get_dh_engine()
    if eng is None:
        return
    now = datetime.utcnow()
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "UPDATE denial_outreach SET click_count = click_count + 1, "
                    "clicked_at = COALESCE(clicked_at, :now), "
                    "opened_at = COALESCE(opened_at, :now), "
                    "status = CASE WHEN status IN ('sent','opened') THEN 'clicked' ELSE status END "
                    "WHERE token = :token"
                ),
                {"now": now, "token": token},
            )
    except Exception:  # noqa: BLE001
        log.exception("denial_hunter click tracking failed (token=%s url=%s)", token[:8], url)


@router.get("/t/o/{token}")
async def track_open(token: str) -> Response:
    """Open-tracking 1x1 GIF. Marks token as opened."""
    _record_open(token)
    return Response(content=_PIXEL_GIF, media_type="image/gif", headers=_NO_CACHE)


@router.get("/t/c/{token}")
async def track_click(token: str, u: Optional[str] = None) -> RedirectResponse:
    """Click-tracking redirect. ?u=<base64url-encoded URL> -> 302."""
    target = _safe_decode_url(u or "")
    _record_click(token, target)
    return RedirectResponse(url=target, status_code=302, headers=_NO_CACHE)
