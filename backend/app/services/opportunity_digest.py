"""
Vendor Opportunity Digest — weekly email dispatcher (P3)

Emails each active vendor alert subscription a digest of the NEW Form 470
postings that matched it since the previous dispatch. Dedupe is per-match
via ``VendorAlertMatch.delivered_email_at`` — a given (subscription, 470)
pair is emailed exactly once, ever.

Cadence rationale: USAC only refreshes its open data WEEKLY (Mon ~9 AM ET),
so "the moment a 470 posts" is impossible. This dispatcher therefore runs
once a week on Monday afternoon UTC, after the daily Form 470 scan has
ingested the fresh weekly data and the matcher has written match rows.

Pure logic + DB I/O + SMTP. No emojis in log output.
"""

from __future__ import annotations

import logging
from datetime import datetime
from html import escape
from typing import List, Optional

from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.vendor_alerts import (
    Form470Posting,
    VendorAlertMatch,
    VendorAlertSubscription,
)

logger = logging.getLogger(__name__)

# Cap the number of postings rendered in a single email so a large backlog
# never produces a multi-megabyte message. All matched postings are still
# marked delivered; the email simply notes the overflow count.
MAX_POSTINGS_PER_EMAIL = 50

APP_BASE_URL = "https://skyrate.ai"


def _fmt_money(value) -> Optional[str]:
    if value is None:
        return None
    try:
        return "${:,.0f}".format(float(value))
    except (TypeError, ValueError):
        return None


def _fmt_date(value) -> str:
    if not value:
        return ""
    try:
        return value.strftime("%b %d, %Y")
    except Exception:  # pragma: no cover - defensive
        return str(value)


def _posting_row_html(p: Form470Posting) -> str:
    name = escape(p.applicant_name or "Unknown applicant")
    state = escape(p.state or "")
    ben = escape(str(p.ben)) if p.ben else ""
    posted = _fmt_date(p.certified_date)
    cost = _fmt_money(p.total_pre_discount_cost)
    services = ", ".join(escape(s) for s in (p.service_types or []) if s)
    atype = escape(p.applicant_type or "")

    meta_bits: List[str] = []
    if state:
        meta_bits.append(state)
    if atype:
        meta_bits.append(atype)
    if ben:
        meta_bits.append(f"BEN {ben}")
    if posted:
        meta_bits.append(f"Posted {posted}")
    meta = " &nbsp;·&nbsp; ".join(meta_bits)

    extra: List[str] = []
    if services:
        extra.append(f"<div style='font-size:12px;color:#475569;margin-top:4px'>{services}</div>")
    if cost:
        extra.append(f"<div style='font-size:12px;color:#475569;margin-top:2px'>Pre-discount budget: {cost}</div>")
    if p.rfp_url:
        safe_rfp = escape(p.rfp_url)
        extra.append(
            f"<div style='font-size:12px;margin-top:4px'>"
            f"<a href='{safe_rfp}' style='color:#4f46e5'>View RFP document</a></div>"
        )

    app_no = escape(p.application_number or "")
    return (
        "<tr><td style='padding:12px 14px;border-bottom:1px solid #e2e8f0'>"
        f"<div style='font-size:14px;font-weight:600;color:#0f172a'>{name}</div>"
        f"<div style='font-size:12px;color:#64748b;margin-top:2px'>{meta}</div>"
        + "".join(extra)
        + f"<div style='font-size:11px;color:#94a3b8;margin-top:4px'>Form 470 #{app_no}</div>"
        "</td></tr>"
    )


def _digest_html(sub: VendorAlertSubscription, postings: List[Form470Posting], total: int) -> str:
    states = ", ".join(sub.states or []) if sub.states else "All states"
    rows = "".join(_posting_row_html(p) for p in postings)
    overflow = ""
    if total > len(postings):
        overflow = (
            f"<p style='font-size:12px;color:#64748b;margin:8px 0 0'>"
            f"Showing the {len(postings)} most recent of {total} new opportunities. "
            f"Open your <a href='{APP_BASE_URL}/vendor?tab=map' style='color:#4f46e5'>"
            f"Opportunity Map</a> to see them all.</p>"
        )

    return f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="background:#4f46e5;padding:20px 24px">
        <div style="color:#ffffff;font-size:18px;font-weight:700">New E-Rate opportunities</div>
        <div style="color:#c7d2fe;font-size:13px;margin-top:4px">{escape(sub.name)} &nbsp;·&nbsp; {escape(states)}</div>
      </div>
      <div style="padding:20px 24px">
        <p style="font-size:14px;color:#334155;margin:0 0 12px">
          {total} new Form 470{'s' if total != 1 else ''} matching your alert posted in USAC's latest weekly refresh.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
          {rows}
        </table>
        {overflow}
        <div style="margin-top:20px">
          <a href="{APP_BASE_URL}/vendor?tab=map"
             style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px">
            Open the Opportunity Map
          </a>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
        <p style="font-size:11px;color:#94a3b8;margin:0">
          You are receiving this because you created an opportunity alert in SkyRate AI.
          USAC refreshes E-Rate open data weekly (Mondays), so these digests are sent once a week.
          Manage or delete this alert from your <a href="{APP_BASE_URL}/vendor?tab=map" style="color:#64748b">vendor dashboard</a>.
        </p>
      </div>
    </div>
  </div>
</body></html>"""


def send_opportunity_digests(dry_run: bool = False, db: Optional[Session] = None) -> dict:
    """Send one weekly digest per active email-channel subscription that has
    undelivered matches. Returns a summary dict. Idempotent: each match is
    stamped ``delivered_email_at`` so it is never emailed twice."""
    owns_session = db is None
    if owns_session:
        db = SessionLocal()

    summary = {
        "subscriptions_checked": 0,
        "emails_sent": 0,
        "matches_delivered": 0,
        "errors": 0,
    }

    try:
        from .email_service import EmailService

        email_service = EmailService()

        subs = (
            db.query(VendorAlertSubscription)
            .filter(VendorAlertSubscription.active == True)  # noqa: E712
            .all()
        )

        for sub in subs:
            channels = sub.channels or {}
            if not channels.get("email"):
                continue
            to_email = (sub.email or "").strip()
            if not to_email:
                continue

            summary["subscriptions_checked"] += 1

            matches = (
                db.query(VendorAlertMatch)
                .filter(
                    VendorAlertMatch.subscription_id == sub.id,
                    VendorAlertMatch.delivered_email_at.is_(None),
                )
                .order_by(VendorAlertMatch.matched_at.desc())
                .all()
            )
            if not matches:
                continue

            app_nos = [m.form_470_application_number for m in matches]
            postings = (
                db.query(Form470Posting)
                .filter(Form470Posting.application_number.in_(app_nos))
                .all()
            )
            posting_by_app = {p.application_number: p for p in postings}
            ordered = [
                posting_by_app[m.form_470_application_number]
                for m in matches
                if m.form_470_application_number in posting_by_app
            ]
            if not ordered:
                # Matched postings were purged; stamp matches so they don't
                # linger forever, but send nothing.
                now = datetime.utcnow()
                for m in matches:
                    m.delivered_email_at = now
                if not dry_run:
                    db.commit()
                continue

            display = ordered[:MAX_POSTINGS_PER_EMAIL]
            total = len(ordered)
            html = _digest_html(sub, display, total)
            plural = "opportunity" if total == 1 else "opportunities"
            subject = f"{total} new E-Rate {plural} in your alert: {sub.name}"

            sent = True
            if not dry_run:
                try:
                    sent = email_service.send_email(
                        to_email=to_email,
                        subject=subject,
                        html_content=html,
                        email_type="digest",
                    )
                except Exception as e:  # pragma: no cover - defensive
                    logger.error("[opportunity_digest] send failed sub=%s err=%s", sub.id, e)
                    sent = False

            if sent:
                now = datetime.utcnow()
                for m in matches:
                    m.delivered_email_at = now
                sub.last_dispatched_at = now
                if not dry_run:
                    db.commit()
                summary["emails_sent"] += 1
                summary["matches_delivered"] += len(matches)
                logger.info(
                    "[opportunity_digest] sent sub=%s to=%s matches=%s",
                    sub.id,
                    to_email,
                    len(matches),
                )
            else:
                summary["errors"] += 1
                if not dry_run:
                    db.rollback()

        return summary
    finally:
        if owns_session:
            db.close()
