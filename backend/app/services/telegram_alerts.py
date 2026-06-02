"""
Telegram alert service.

Sends instant alerts to a Telegram chat (group or DM) whenever a noteworthy
event happens — new support tickets, unhandled 500 errors, failed signups,
payment failures, etc.

Configuration (DO App Platform env vars):
    TELEGRAM_BOT_TOKEN     — token from BotFather
    TELEGRAM_ALERT_CHAT_ID — chat id of the destination (group or DM)

If either env var is missing the helper silently no-ops, so the rest of the
app keeps working even when alerting is disabled (e.g. local dev).
"""
from __future__ import annotations

import html
import logging
import os
from typing import Optional, Tuple

import requests

from ..core.config import settings

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

# Severity prefix — plain ASCII so no encoding issues in logs.
_SEVERITY_PREFIX = {
    "info": "[INFO]",
    "warn": "[WARN]",
    "error": "[ERROR]",
    "critical": "[CRITICAL]",
}


def _resolve_credentials() -> Tuple[Optional[str], Optional[str]]:
    """Read creds from Settings first, then env (in case Settings was cached)."""
    token = getattr(settings, "TELEGRAM_BOT_TOKEN", None) or os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = getattr(settings, "TELEGRAM_ALERT_CHAT_ID", None) or os.environ.get("TELEGRAM_ALERT_CHAT_ID")
    return token, (str(chat_id) if chat_id else None)


def _post_sync(token: str, chat_id: str, text: str) -> Tuple[int, str]:
    try:
        r = requests.post(
            _TELEGRAM_API.format(token=token),
            json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=5,
        )
        if r.status_code != 200:
            logger.warning("Telegram alert non-200: %s %s", r.status_code, r.text[:300])
        else:
            logger.info("Telegram alert sent ok chat=%s len=%s", chat_id, len(text))
        return r.status_code, r.text[:300]
    except Exception as exc:
        logger.warning("Telegram alert failed: %s", exc)
        return 0, str(exc)[:300]


def send_alert(
    title: str,
    body: str = "",
    severity: str = "info",
    link: Optional[str] = None,
) -> None:
    """
    Fire-and-forget alert to the configured Telegram chat.

    Never raises — alerting must never break the calling request.
    Calls Telegram synchronously with a short timeout (<=5s). Telegram
    sendMessage typically completes in <500ms; running synchronously
    guarantees delivery before the request handler returns (background
    daemon threads were being killed before the HTTP POST completed).
    """
    token, chat_id = _resolve_credentials()
    if not token or not chat_id:
        logger.info("Telegram alert skipped: token=%s chat_id=%s", bool(token), bool(chat_id))
        return

    prefix = _SEVERITY_PREFIX.get(severity, "[INFO]")
    safe_title = html.escape(title or "")
    safe_body = html.escape(body or "")
    text = f"<b>{prefix} {safe_title}</b>"
    if safe_body:
        text += f"\n\n{safe_body}"
    if link:
        safe_link = html.escape(link, quote=True)
        text += f'\n\n<a href="{safe_link}">Open</a>'

    # Telegram caps at 4096 chars.
    if len(text) > 4000:
        text = text[:3990] + "\n... (truncated)"

    _post_sync(token, chat_id, text)


def send_alert_debug(title: str = "debug ping", body: str = "") -> dict:
    """Synchronous helper used by /api/v1/debug/telegram to surface real errors."""
    token, chat_id = _resolve_credentials()
    if not token or not chat_id:
        return {"ok": False, "reason": "missing_credentials",
                "has_token": bool(token), "has_chat_id": bool(chat_id)}
    text = f"<b>[DEBUG] {html.escape(title)}</b>"
    if body:
        text += f"\n\n{html.escape(body)}"
    status, resp = _post_sync(token, chat_id, text)
    return {"ok": status == 200, "status": status, "response": resp,
            "chat_id_prefix": chat_id[:4]}
