"""
Vendor Form 470 Daily Digest dispatcher.

For each enabled Vendor470DigestSubscription, re-runs the saved Form 470 search
against USAC, finds the postings that are NEW since the subscription's last
dispatch (by Form 470 posting date), and emails a simple HTML table of them via
the existing EmailService SMTP transport.

Safety model (this runs on the PRODUCTION scheduler worker):
  - The whole run is wrapped in try/except; one bad subscription can never crash
    the worker or block the others (each iteration is independently guarded).
  - First run for a subscription only establishes a baseline marker and sends NO
    email, so opting in never dumps the entire current-year backlog.
  - Respects the SKYRATE_DISABLE_470_DIGEST=1 env flag to disable entirely.

Pure logic + DB I/O + SMTP. No emojis in log output or email subjects.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from html import escape
from typing import Any, Dict, List, Optional

from ..core.database import SessionLocal

logger = logging.getLogger(__name__)

# Cap postings rendered per email so a large backlog never produces a huge
# message. New rows beyond the cap are still marked seen; the email notes them.
MAX_ROWS_PER_EMAIL = 50

# How many recent rows a preview returns when the subscription has no baseline.
PREVIEW_ROWS = 25

APP_BASE_URL = "https://skyrate.ai"

# Filter keys that map directly to usac_client.get_470_leads kwargs.
_LEAD_FILTER_KEYS = ("year", "state", "category", "service_type", "manufacturer")


def _clean_filters(filters: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return the subset of a saved filter payload that get_470_leads accepts."""
    filters = filters or {}
    out: Dict[str, Any] = {}
    for key in _LEAD_FILTER_KEYS:
        val = filters.get(key)
        if val in (None, "", []):
            continue
        if key == "year":
            try:
                out[key] = int(val)
            except (TypeError, ValueError):
                continue
        else:
            out[key] = str(val).strip()
    return out


def fetch_matching_leads(filters: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Run the saved search against USAC and return matching Form 470 lead dicts.

    Applies the applicant-name filter client-side (get_470_leads has no name
    param) the same way the vendor 470 endpoint does.
    """
    from utils.usac_client import USACDataClient

    kwargs = _clean_filters(filters)
    client = USACDataClient()
    result = client.get_470_leads(limit=2000, offset=0, **kwargs)
    if not result.get("success"):
        raise RuntimeError(result.get("error") or "USAC 470 fetch failed")

    leads = result.get("leads", []) or []

    name_q = ((filters or {}).get("name") or "").strip().lower()
    if name_q:
        leads = [l for l in leads if name_q in (l.get("entity_name") or "").lower()]
    return leads


def compute_new_leads(leads: List[Dict[str, Any]], marker: Optional[str]) -> List[Dict[str, Any]]:
    """Rows whose posting date is strictly newer than the marker, newest first.

    posting_date is USAC's certified_datetime ISO string, so lexical comparison
    matches chronological order. Rows with no posting date are treated as older
    than any real marker (excluded), which is the conservative choice.
    """
    if marker:
        fresh = [l for l in leads if (l.get("posting_date") or "") > marker]
    else:
        fresh = list(leads)
    fresh.sort(key=lambda l: l.get("posting_date") or "", reverse=True)
    return fresh


def _max_posting_date(leads: List[Dict[str, Any]]) -> Optional[str]:
    dates = [l.get("posting_date") for l in leads if l.get("posting_date")]
    return max(dates) if dates else None


def _fmt_date(value: Optional[str]) -> str:
    if not value:
        return ""
    return str(value)[:10]


def _row_html(lead: Dict[str, Any]) -> str:
    name = escape(lead.get("entity_name") or "Unknown applicant")
    state = escape(lead.get("state") or "")
    services = ", ".join(escape(s) for s in (lead.get("service_types") or []) if s)
    mfrs = ", ".join(escape(m) for m in (lead.get("manufacturers") or []) if m)
    acd = escape(_fmt_date(lead.get("allowable_contract_date")))
    posted = escape(_fmt_date(lead.get("posting_date")))
    app_no = escape(str(lead.get("application_number") or ""))
    link = f"{APP_BASE_URL}/vendor?tab=470-leads&app={app_no}"

    return (
        "<tr>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a'>{name}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569'>{state}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569'>{services}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569'>{mfrs}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569'>{acd}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#475569'>{posted}</td>"
        f"<td style='padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px'>"
        f"<a href='{link}' style='color:#4f46e5'>Form 470 #{app_no}</a></td>"
        "</tr>"
    )


def _criteria_label(filters: Optional[Dict[str, Any]]) -> str:
    filters = filters or {}
    bits: List[str] = []
    if filters.get("state"):
        bits.append(str(filters["state"]).upper())
    if filters.get("category"):
        bits.append(f"Category {filters['category']}")
    if filters.get("service_type"):
        bits.append(str(filters["service_type"]))
    if filters.get("manufacturer"):
        bits.append(str(filters["manufacturer"]))
    if filters.get("name"):
        bits.append(str(filters["name"]))
    return ", ".join(bits) if bits else "all states"


def build_digest_html(sub_name: str, filters: Optional[Dict[str, Any]],
                      rows: List[Dict[str, Any]], total: int) -> str:
    shown = rows[:MAX_ROWS_PER_EMAIL]
    body_rows = "".join(_row_html(l) for l in shown)
    overflow = ""
    if total > len(shown):
        overflow = (
            f"<p style='font-size:12px;color:#64748b;margin:10px 0 0'>"
            f"Showing the {len(shown)} newest of {total} new opportunities. "
            f"Open your <a href='{APP_BASE_URL}/vendor?tab=470-leads' style='color:#4f46e5'>"
            f"Form 470 Leads</a> to see them all.</p>"
        )
    criteria = escape(_criteria_label(filters))
    safe_name = escape(sub_name or "Saved search")

    return f"""\
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="padding:20px 22px;background:linear-gradient(135deg,#f97316,#f59e0b)">
        <div style="font-size:18px;font-weight:700;color:#ffffff">{len(shown)} new Form 470 opportunities</div>
        <div style="font-size:13px;color:#fff7ed;margin-top:4px">{safe_name} &nbsp;&middot;&nbsp; {criteria}</div>
      </div>
      <div style="padding:18px 22px">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="text-align:left">
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Applicant</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">State</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Service Type</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Manufacturer</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Allowable Contract Date</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Posted</th>
              <th style="padding:8px 10px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase">Form 470</th>
            </tr>
          </thead>
          <tbody>{body_rows}</tbody>
        </table>
        {overflow}
        <p style="font-size:12px;color:#94a3b8;margin:16px 0 0">
          You are receiving this because you saved this search as a daily digest in SkyRate.
          Manage or turn off your digests in the <a href="{APP_BASE_URL}/vendor?tab=470-leads" style="color:#4f46e5">Form 470 Leads</a> view.
        </p>
      </div>
    </div>
  </div>
</body></html>"""


def preview_subscription(sub, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return the 470 rows that WOULD be emailed now for a subscription.

    Used by the preview endpoint so a vendor can see matches without waiting a
    day. When the subscription has no baseline marker yet, the most recent
    PREVIEW_ROWS matches are returned as a representative sample.
    """
    filt = filters if filters is not None else (getattr(sub, "filters_json", None) or {})
    leads = fetch_matching_leads(filt)
    marker = getattr(sub, "last_seen_marker", None)
    if marker:
        rows = compute_new_leads(leads, marker)
        is_baseline = False
    else:
        rows = compute_new_leads(leads, None)[:PREVIEW_ROWS]
        is_baseline = True
    return {
        "success": True,
        "is_baseline": is_baseline,
        "total_matches": len(leads),
        "new_count": len(rows),
        "rows": rows,
    }


def send_vendor_470_digests() -> Dict[str, Any]:
    """Email each enabled vendor Form 470 digest its new postings since last run."""
    if os.environ.get("SKYRATE_DISABLE_470_DIGEST") == "1":
        logger.info("[vendor_470_digest] disabled via SKYRATE_DISABLE_470_DIGEST=1; skipping")
        return {"skipped": True}

    from ..models.vendor_470_digest import Vendor470DigestSubscription
    from ..models.vendor import VendorProfile
    from ..models.user import User
    from .email_service import EmailService

    db = SessionLocal()
    stats = {"subscriptions": 0, "emails_sent": 0, "baselines": 0, "empty": 0, "errors": 0}
    try:
        subs = (
            db.query(Vendor470DigestSubscription)
            .filter(
                Vendor470DigestSubscription.enabled == True,  # noqa: E712
                Vendor470DigestSubscription.frequency == "daily",
            )
            .all()
        )
        stats["subscriptions"] = len(subs)
        if not subs:
            logger.info("[vendor_470_digest] no enabled daily subscriptions; skipping")
            return stats

        email_service = EmailService()
        now = datetime.utcnow()

        for sub in subs:
            try:
                profile = db.query(VendorProfile).filter(VendorProfile.id == sub.vendor_profile_id).first()
                if not profile:
                    stats["errors"] += 1
                    continue

                recipient = (sub.email or "").strip()
                if not recipient:
                    user = db.query(User).filter(User.id == profile.user_id).first()
                    recipient = (user.email if user else "") or ""
                    if user and (getattr(user, "is_test", False)
                                 or recipient.lower().endswith("@example.com")
                                 or recipient.lower().startswith("test_")):
                        stats["empty"] += 1
                        continue
                if not recipient:
                    stats["errors"] += 1
                    continue

                leads = fetch_matching_leads(sub.filters_json)

                # First run: establish a baseline marker only; never dump backlog.
                if not sub.last_seen_marker:
                    sub.last_seen_marker = _max_posting_date(leads) or ""
                    sub.last_sent_at = now
                    db.commit()
                    stats["baselines"] += 1
                    continue

                new_rows = compute_new_leads(leads, sub.last_seen_marker)
                if not new_rows:
                    stats["empty"] += 1
                    continue

                html = build_digest_html(sub.name, sub.filters_json, new_rows, len(new_rows))
                criteria = _criteria_label(sub.filters_json)
                subject = f"{len(new_rows)} new Form 470 opportunities - {criteria}"

                ok = email_service.send_email(
                    to_email=recipient,
                    subject=subject,
                    html_content=html,
                    email_type="alert",
                )
                if ok:
                    newest = _max_posting_date(new_rows)
                    if newest and newest > (sub.last_seen_marker or ""):
                        sub.last_seen_marker = newest
                    sub.last_sent_at = now
                    db.commit()
                    stats["emails_sent"] += 1
                else:
                    stats["errors"] += 1

            except Exception as e:  # noqa: BLE001
                logger.error(f"[vendor_470_digest] subscription {getattr(sub, 'id', '?')} failed: {e}")
                stats["errors"] += 1
                try:
                    db.rollback()
                except Exception:
                    pass

        logger.info(
            "[vendor_470_digest] done subs=%s emails=%s baselines=%s empty=%s errors=%s",
            stats["subscriptions"], stats["emails_sent"], stats["baselines"],
            stats["empty"], stats["errors"],
        )
        return stats
    except Exception as e:  # noqa: BLE001
        logger.error(f"[vendor_470_digest] job failed: {e}")
        try:
            db.rollback()
        except Exception:
            pass
        stats["errors"] += 1
        return stats
    finally:
        db.close()
