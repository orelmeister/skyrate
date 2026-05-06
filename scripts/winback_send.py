"""One-shot win-back blast to 8 stranded signups (user IDs 7,8,9,12,13,14,15,16).

Each user gets a single-use 24-hour magic-link emailed via the existing SMTP
infrastructure (skyrate.ai/backend/app/services/email_service.py). The link
deep-links to /onboarding?from=winback&token=... and exchanges the token for a
full JWT via /api/v1/auth/magic-link/exchange.

Idempotency: if a 'winback' magic-link was already issued in the last 7 days
for a given user, this script SKIPS that user instead of double-mailing.

Logs each per-user send + outcome to:
  skyrate.ai/scripts/winback_log_<YYYY-MM-DD>.txt

Usage:
  cd skyrate.ai/backend
  python ../scripts/winback_send.py
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import os
import secrets
import sys
from pathlib import Path

# We import the SAME environment + DB session + email service the live API
# uses, so credentials never need to be duplicated. Load .env early so
# Settings() picks up DATABASE_URL / SMTP_* / FRONTEND_URL.
HERE = Path(__file__).resolve().parent
BACKEND_DIR = HERE.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

from app.core.database import SessionLocal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.email_verification_token import EmailVerificationToken  # noqa: E402
from app.services.email_service import get_email_service  # noqa: E402


# Hard-coded per the user task — these are the 8 specific abandoned consultant
# accounts confirmed in the investigation report. NOT a marketing list.
TARGET_USER_IDS: list[int] = [7, 8, 9, 12, 13, 14, 15, 16]


def _hash_token(raw: str) -> str:
    """SHA-256 hash for at-rest storage. Matches auth.py._hash_token."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _already_mailed_recently(db, user_id: int, within_days: int = 7) -> bool:
    """Return True iff a winback token was issued for this user in the
    last `within_days`. Used to make the script idempotent on rerun."""
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=within_days)
    row = (
        db.query(EmailVerificationToken)
        .filter(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.purpose == "winback",
            EmailVerificationToken.created_at >= cutoff,
        )
        .first()
    )
    return row is not None


def _create_winback_token(db, user: User, ttl_hours: int = 24) -> str:
    raw = secrets.token_urlsafe(32)
    row = EmailVerificationToken(
        user_id=user.id,
        token_hash=_hash_token(raw),
        purpose="winback",
        expires_at=_dt.datetime.utcnow() + _dt.timedelta(hours=ttl_hours),
    )
    db.add(row)
    db.commit()
    return raw


def _redact(email: str) -> str:
    """Display-friendly email redaction for the log file."""
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[0]}***{local[-1]}@{domain}"


def main() -> int:
    log_path = HERE / f"winback_log_{_dt.date.today().isoformat()}.txt"
    db = SessionLocal()
    email_svc = get_email_service()

    sent = 0
    skipped = 0
    failed = 0
    failures: list[tuple[int, str]] = []

    with log_path.open("a", encoding="utf-8") as logf:
        logf.write(
            f"\n=== Winback run {_dt.datetime.utcnow().isoformat()}Z ===\n"
            f"Targets: {TARGET_USER_IDS}\n"
            f"From: {settings.SMTP_USER}\n"
            f"Frontend: {settings.FRONTEND_URL}\n"
        )

        try:
            for uid in TARGET_USER_IDS:
                user = db.query(User).filter(User.id == uid).first()
                if not user:
                    msg = f"[SKIP] user_id={uid} NOT FOUND"
                    print(msg)
                    logf.write(msg + "\n")
                    skipped += 1
                    continue

                if not user.is_active:
                    msg = f"[SKIP] user_id={uid} email={_redact(user.email)} INACTIVE"
                    print(msg)
                    logf.write(msg + "\n")
                    skipped += 1
                    continue

                if _already_mailed_recently(db, uid):
                    msg = (
                        f"[SKIP] user_id={uid} email={_redact(user.email)} "
                        f"already mailed in last 7d"
                    )
                    print(msg)
                    logf.write(msg + "\n")
                    skipped += 1
                    continue

                try:
                    raw_token = _create_winback_token(db, user, ttl_hours=24)
                except Exception as exc:
                    failed += 1
                    failures.append((uid, f"token_error: {exc}"))
                    msg = f"[FAIL] user_id={uid} token error: {exc}"
                    print(msg)
                    logf.write(msg + "\n")
                    db.rollback()
                    continue

                # Send via existing email_service. Returns False on SMTP failure.
                ok = False
                try:
                    ok = email_svc.send_winback_email(
                        to_email=user.email,
                        first_name=user.first_name or "there",
                        magic_token=raw_token,
                        role=user.role or "consultant",
                    )
                except Exception as exc:
                    failed += 1
                    failures.append((uid, f"smtp_error: {exc}"))
                    msg = f"[FAIL] user_id={uid} email={_redact(user.email)} smtp error: {exc}"
                    print(msg)
                    logf.write(msg + "\n")
                    continue

                if not ok:
                    failed += 1
                    failures.append((uid, "send_returned_false"))
                    msg = f"[FAIL] user_id={uid} email={_redact(user.email)} send_returned_false"
                    print(msg)
                    logf.write(msg + "\n")
                    continue

                sent += 1
                expires = _dt.datetime.utcnow() + _dt.timedelta(hours=24)
                msg = (
                    f"[OK]  user_id={uid} email={_redact(user.email)} "
                    f"role={user.role} expires={expires.isoformat()}Z "
                    f"event=winback_email_sent"
                )
                print(msg)
                logf.write(msg + "\n")
        finally:
            db.close()
            summary = f"\nSummary: sent={sent} skipped={skipped} failed={failed}\n"
            print(summary)
            logf.write(summary)
            if failures:
                logf.write("Failures:\n")
                for uid, why in failures:
                    logf.write(f"  user_id={uid}: {why}\n")

    # Exit non-zero if anything failed so CI / cron will alert.
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
