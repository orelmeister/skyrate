"""
Denial Hunter Admin Router

Read/update endpoints powering the /admin/denial-hunter dashboard.
Reads from the separate Hostinger MySQL DB written by the denial-hunter
worker (a different DigitalOcean app). All endpoints are gated by
require_role("admin", "super") per skyrate-admin-auth.md — no
ADMIN_EMAILS allowlist.

Tables consumed: denial_leads, denial_scan_runs.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ...core.security import require_role
from ...models.user import User
from ...services import denial_hunter_db


router = APIRouter(prefix="/admin/denial-hunter", tags=["Denial Hunter"])

DHAdmin = Depends(require_role("admin", "super"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_db() -> Session:
    sess = denial_hunter_db.get_dh_session()
    if sess is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Denial Hunter DB not configured. Set "
                "DENIAL_HUNTER_MYSQL_HOST, DENIAL_HUNTER_MYSQL_USER, "
                "DENIAL_HUNTER_MYSQL_PASSWORD, DENIAL_HUNTER_MYSQL_DATABASE."
            ),
        )
    # Probe the connection so unreachable-host errors surface as a clean 503
    # (instead of bubbling up as a 500 from the endpoint's first query).
    # Common cause: Hostinger remote-MySQL allow-list does not include the
    # current DigitalOcean outbound IP.
    try:
        sess.execute(text("SELECT 1"))
    except OperationalError as exc:
        sess.close()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Denial Hunter database is temporarily unreachable. "
                "Verify the Hostinger Remote MySQL allow-list includes the "
                "skyrate.ai backend outbound IP (or use a wildcard '%'). "
                f"Underlying error: {str(exc.orig)[:240]}"
            ),
        ) from exc
    try:
        yield sess
    finally:
        sess.close()


def _rows(result) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in result:
        m = dict(r._mapping)
        for k, v in list(m.items()):
            if isinstance(v, (datetime, date)):
                m[k] = v.isoformat()
        out.append(m)
    return out


def _maybe_json(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


# Columns shown in the leads table (no big JSON payloads).
LEADS_LIST_COLUMNS = (
    "id, ben, frn, application_number, funding_year, organization_name, state, "
    "service_type, requested_amount, fcdl_letter_date, appeal_deadline, "
    "denial_category, denial_category_human, appealability, appeal_confidence, "
    "scoring_source, cnct_name, cnct_email, cnct_phone, district_domain, "
    "scanned_at, outreach_status, notes, updated_at"
)


# ---------------------------------------------------------------------------
# /stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def stats(_: User = DHAdmin, db: Session = Depends(_get_db)):
    totals = db.execute(text(
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN outreach_status = 'new' THEN 1 ELSE 0 END) AS new_count,
            SUM(CASE WHEN outreach_status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
            SUM(CASE WHEN outreach_status = 'won' THEN 1 ELSE 0 END) AS won,
            SUM(CASE WHEN outreach_status = 'lost' THEN 1 ELSE 0 END) AS lost,
            SUM(CASE WHEN outreach_status = 'archived' THEN 1 ELSE 0 END) AS archived,
            COALESCE(SUM(requested_amount), 0) AS total_potential_revenue
        FROM denial_leads
        """
    )).first()

    # "Replied" is sourced from denial_replies (the authoritative inbox log).
    # The bot updates denial_leads.outreach_status to specific values like
    # 'interested' / 'unsubscribed' / 'redirected' rather than a generic
    # 'replied', so counting that column always returned 0. We count distinct
    # leads with at least one human reply (excluding auto-replies, bounces,
    # DSNs, and out-of-office responders), plus the total reply messages.
    reply_totals = db.execute(text(
        """
        SELECT
            COUNT(*) AS total_messages,
            COUNT(DISTINCT COALESCE(institution_ben, from_email)) AS distinct_leads,
            SUM(CASE WHEN classification = 'INTERESTED' THEN 1 ELSE 0 END) AS interested_msgs,
            SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review_msgs,
            SUM(CASE WHEN draft_status = 'pending'  THEN 1 ELSE 0 END) AS drafts_pending,
            SUM(CASE WHEN draft_status = 'approved' THEN 1 ELSE 0 END) AS drafts_approved,
            SUM(CASE WHEN draft_status = 'sent'     THEN 1 ELSE 0 END) AS drafts_sent
        FROM denial_replies
        WHERE COALESCE(classification, '') NOT IN
            ('AUTO_REPLY', 'BOUNCE', 'DSN', 'OUT_OF_OFFICE', 'TEST')
          AND COALESCE(status, '') <> 'test_injection'
        """
    )).first()

    by_appeal = _rows(db.execute(text(
        """
        SELECT COALESCE(appealability, 'unknown') AS appealability, COUNT(*) AS cnt
        FROM denial_leads
        GROUP BY appealability
        """
    )))
    appeal_map = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    for row in by_appeal:
        key = (row["appealability"] or "unknown").lower()
        appeal_map[key] = appeal_map.get(key, 0) + int(row["cnt"])

    by_state = _rows(db.execute(text(
        """
        SELECT COALESCE(state, '??') AS state, COUNT(*) AS cnt
        FROM denial_leads
        GROUP BY state
        ORDER BY cnt DESC
        LIMIT 25
        """
    )))

    by_year = _rows(db.execute(text(
        """
        SELECT funding_year, COUNT(*) AS cnt
        FROM denial_leads
        WHERE funding_year IS NOT NULL
        GROUP BY funding_year
        ORDER BY funding_year DESC
        """
    )))

    by_category = _rows(db.execute(text(
        """
        SELECT
            COALESCE(denial_category, 'other') AS denial_category,
            COALESCE(denial_category_human, denial_category) AS label,
            COUNT(*) AS cnt
        FROM denial_leads
        GROUP BY denial_category, denial_category_human
        ORDER BY cnt DESC
        LIMIT 12
        """
    )))

    last_scan_row = db.execute(text(
        """
        SELECT id, started_at, finished_at, funding_year,
               rows_pulled, rows_inserted, rows_skipped_dup, errors_json
        FROM denial_scan_runs
        ORDER BY started_at DESC
        LIMIT 1
        """
    )).first()
    last_scan = dict(last_scan_row._mapping) if last_scan_row else None
    if last_scan:
        for k, v in list(last_scan.items()):
            if isinstance(v, (datetime, date)):
                last_scan[k] = v.isoformat()

    return {
        "total_leads": int(totals.total or 0),
        "new": int(totals.new_count or 0),
        "contacted": int(totals.contacted or 0),
        "replied": int((reply_totals.distinct_leads if reply_totals else 0) or 0),
        "reply_messages_total": int((reply_totals.total_messages if reply_totals else 0) or 0),
        "reply_messages_interested": int((reply_totals.interested_msgs if reply_totals else 0) or 0),
        "reply_messages_needs_review": int((reply_totals.needs_review_msgs if reply_totals else 0) or 0),
        "drafts_pending": int((reply_totals.drafts_pending if reply_totals else 0) or 0),
        "drafts_approved": int((reply_totals.drafts_approved if reply_totals else 0) or 0),
        "drafts_sent": int((reply_totals.drafts_sent if reply_totals else 0) or 0),
        "won": int(totals.won or 0),
        "lost": int(totals.lost or 0),
        "archived": int(totals.archived or 0),
        "total_potential_revenue": float(totals.total_potential_revenue or 0),
        "by_appealability": appeal_map,
        "by_state": by_state,
        "by_funding_year": by_year,
        "by_category": by_category,
        "last_scan": last_scan,
    }


# ---------------------------------------------------------------------------
# /leads (list)
# ---------------------------------------------------------------------------

@router.get("/leads")
async def list_leads(
    status_: Optional[str] = Query(None, alias="status"),
    appealability: Optional[str] = None,
    state: Optional[str] = None,
    funding_year: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    where: List[str] = []
    params: Dict[str, Any] = {}
    if status_:
        where.append("outreach_status = :status")
        params["status"] = status_
    if appealability:
        where.append("appealability = :appealability")
        params["appealability"] = appealability
    if state:
        where.append("state = :state")
        params["state"] = state
    if funding_year:
        where.append("funding_year = :funding_year")
        params["funding_year"] = funding_year
    if search:
        where.append(
            "(organization_name LIKE :search "
            "OR frn LIKE :search "
            "OR application_number LIKE :search "
            "OR ben LIKE :search)"
        )
        params["search"] = f"%{search}%"

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(
        text(f"SELECT COUNT(*) FROM denial_leads {where_sql}"),
        params,
    ).scalar() or 0

    params["limit"] = limit
    params["offset"] = offset

    rows = _rows(db.execute(
        text(
            f"SELECT {LEADS_LIST_COLUMNS} FROM denial_leads {where_sql} "
            "ORDER BY appeal_deadline IS NULL, appeal_deadline ASC, "
            "scanned_at DESC LIMIT :limit OFFSET :offset"
        ),
        params,
    ))

    return {
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# /leads/{id} (detail with parsed JSON payloads)
# ---------------------------------------------------------------------------

@router.get("/leads/{lead_id}")
async def lead_detail(
    lead_id: int,
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    row = db.execute(
        text("SELECT * FROM denial_leads WHERE id = :id"),
        {"id": lead_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")
    data: Dict[str, Any] = dict(row._mapping)
    for k, v in list(data.items()):
        if isinstance(v, (datetime, date)):
            data[k] = v.isoformat()
    data["supporting_arguments"] = _maybe_json(data.pop("supporting_arguments_json", None))
    data["documents_needed"] = _maybe_json(data.pop("documents_needed_json", None))
    data["raw"] = _maybe_json(data.pop("raw_json", None))
    return data


# ---------------------------------------------------------------------------
# /leads/{id} PATCH
# ---------------------------------------------------------------------------

ALLOWED_STATUSES = {"new", "contacted", "replied", "won", "lost", "archived"}


class LeadUpdate(BaseModel):
    outreach_status: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)


@router.patch("/leads/{lead_id}")
async def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    sets: List[str] = []
    params: Dict[str, Any] = {"id": lead_id}
    if payload.outreach_status is not None:
        if payload.outreach_status not in ALLOWED_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"outreach_status must be one of {sorted(ALLOWED_STATUSES)}",
            )
        sets.append("outreach_status = :outreach_status")
        params["outreach_status"] = payload.outreach_status
    if payload.notes is not None:
        sets.append("notes = :notes")
        params["notes"] = payload.notes
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append("updated_at = NOW()")
    db.execute(
        text(f"UPDATE denial_leads SET {', '.join(sets)} WHERE id = :id"),
        params,
    )
    db.commit()

    row = db.execute(
        text(f"SELECT {LEADS_LIST_COLUMNS} FROM denial_leads WHERE id = :id"),
        {"id": lead_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found after update")
    out = dict(row._mapping)
    for k, v in list(out.items()):
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
    return out


# ---------------------------------------------------------------------------
# /scan-runs
# ---------------------------------------------------------------------------

@router.get("/scan-runs")
async def scan_runs(
    limit: int = Query(20, ge=1, le=200),
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    rows = _rows(db.execute(
        text(
            "SELECT id, started_at, finished_at, funding_year, "
            "rows_pulled, rows_inserted, rows_skipped_dup, errors_json "
            "FROM denial_scan_runs "
            "ORDER BY started_at DESC LIMIT :limit"
        ),
        {"limit": limit},
    ))
    for r in rows:
        errs = r.get("errors_json")
        if isinstance(errs, str) and errs:
            try:
                parsed = json.loads(errs)
                r["errors_count"] = len(parsed) if isinstance(parsed, list) else 1
            except Exception:
                r["errors_count"] = 1
        else:
            r["errors_count"] = 0
    return {"rows": rows}


# ---------------------------------------------------------------------------
# /trigger-digest (placeholder)
# ---------------------------------------------------------------------------

@router.post("/trigger-digest", status_code=202)
async def trigger_digest(_: User = DHAdmin):
    return {
        "status": "not_implemented",
        "detail": (
            "Weekly digest runs automatically Monday 13:00 UTC on the "
            "denial-hunter worker (DO app a46fb759-5e9a-480d-a72f-27ec26118dc3). "
            "Remote on-demand trigger is not yet wired up."
        ),
    }


# ---------------------------------------------------------------------------
# /drafts — human-in-the-loop reply-approval workflow
# ---------------------------------------------------------------------------
# Lifecycle (denial_replies.draft_status):
#   pending      -> Gemini drafted a reply; awaiting human approval in dashboard
#   approved     -> Human clicked Send; denial-hunter worker drains and SMTPs
#   sent         -> Worker confirmed SMTP delivery
#   send_failed  -> SMTP error; needs operator attention
#   rejected     -> Human rejected; never sends
#
# The skyrate.ai backend does NOT send mail directly — it only flips the row
# to draft_status='approved'. The denial-hunter worker (which already holds
# SMTP creds for schools@mail.skyrate.ai) drains approved rows on each poll
# cycle and sends with proper RFC-822 threading headers.

from sqlalchemy import bindparam  # noqa: E402

DRAFT_LIST_COLS = (
    "id, outreach_id, institution_ben, from_email, from_name, to_email, "
    "subject, received_at, classification, sentiment, intent_confidence, "
    "recommended_action, reasoning, forward_to_email, forward_to_name, "
    "draft_status, status, approved_by, approved_at, sent_at, send_error, "
    "classified_at"
)


@router.get("/drafts")
async def list_drafts(
    draft_status_: str = Query("pending", alias="draft_status",
                               description="pending|approved|sent|send_failed|rejected|all"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    where = "WHERE draft_reply IS NOT NULL AND draft_reply <> ''"
    params: Dict[str, Any] = {}
    if draft_status_ and draft_status_ != "all":
        where += " AND draft_status = :ds"
        params["ds"] = draft_status_
    total = db.execute(
        text(f"SELECT COUNT(*) FROM denial_replies {where}"), params,
    ).scalar() or 0
    params["limit"] = limit
    params["offset"] = offset
    rows = _rows(db.execute(text(
        f"SELECT {DRAFT_LIST_COLS} FROM denial_replies {where} "
        "ORDER BY classified_at DESC, id DESC LIMIT :limit OFFSET :offset"
    ), params))
    # Enrich with organization name when available
    bens = [r["institution_ben"] for r in rows if r.get("institution_ben")]
    if bens:
        org_rows = _rows(db.execute(
            text("SELECT ben, organization_name, state, appealability, "
                 "appeal_deadline FROM denial_leads WHERE ben IN :bens")
            .bindparams(bindparam("bens", expanding=True)),
            {"bens": list(set(bens))},
        ))
        by_ben = {r["ben"]: r for r in org_rows}
        for r in rows:
            ctx = by_ben.get(r.get("institution_ben"))
            if ctx:
                r["organization_name"] = ctx.get("organization_name")
                r["state"] = ctx.get("state")
                r["appealability"] = ctx.get("appealability")
                r["appeal_deadline"] = ctx.get("appeal_deadline")
    return {"total": int(total), "limit": limit, "offset": offset, "rows": rows}


@router.get("/drafts/{draft_id}")
async def get_draft(
    draft_id: int,
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    row = db.execute(text(
        "SELECT * FROM denial_replies WHERE id = :id"
    ), {"id": draft_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found")
    data: Dict[str, Any] = dict(row._mapping)
    for k, v in list(data.items()):
        if isinstance(v, (datetime, date)):
            data[k] = v.isoformat()
    if data.get("institution_ben"):
        lead = db.execute(text(
            "SELECT ben, organization_name, state, appealability, "
            "appeal_deadline, primary_argument, denial_category_human "
            "FROM denial_leads WHERE ben = :b LIMIT 1"
        ), {"b": data["institution_ben"]}).first()
        if lead:
            data["lead"] = {k: (v.isoformat() if isinstance(v, (datetime, date)) else v)
                            for k, v in dict(lead._mapping).items()}
    if data.get("outreach_id"):
        out = db.execute(text(
            "SELECT id, touch_number, subject, sent_at, recipient_email "
            "FROM denial_outreach WHERE id = :oid LIMIT 1"
        ), {"oid": data["outreach_id"]}).first()
        if out:
            data["outreach"] = {k: (v.isoformat() if isinstance(v, (datetime, date)) else v)
                                for k, v in dict(out._mapping).items()}
    return data


class DraftEdit(BaseModel):
    draft_reply: str = Field(..., min_length=1, max_length=20000)


@router.patch("/drafts/{draft_id}")
async def edit_draft(
    draft_id: int,
    payload: DraftEdit,
    _: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    row = db.execute(text(
        "SELECT id, draft_status FROM denial_replies WHERE id = :id"
    ), {"id": draft_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found")
    if (row.draft_status or "pending") not in ("pending",):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot edit draft in status '{row.draft_status}' (only 'pending' is editable).",
        )
    db.execute(text(
        "UPDATE denial_replies SET draft_reply = :body WHERE id = :id"
    ), {"body": payload.draft_reply, "id": draft_id})
    db.commit()
    return {"ok": True, "id": draft_id}


@router.post("/drafts/{draft_id}/approve")
async def approve_draft(
    draft_id: int,
    user: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    row = db.execute(text(
        "SELECT id, draft_status, draft_reply, from_email FROM denial_replies WHERE id = :id"
    ), {"id": draft_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found")
    if (row.draft_status or "pending") != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot approve draft in status '{row.draft_status}'.",
        )
    if not (row.draft_reply or "").strip():
        raise HTTPException(status_code=400, detail="Draft body is empty; edit before approving.")
    if not (row.from_email or "").strip():
        raise HTTPException(status_code=400, detail="No recipient (from_email) on row; cannot send.")
    db.execute(text(
        "UPDATE denial_replies SET draft_status = 'approved', "
        "approved_by = :who, approved_at = NOW() WHERE id = :id"
    ), {"who": user.email, "id": draft_id})
    db.commit()
    return {"ok": True, "id": draft_id, "draft_status": "approved",
            "detail": "Queued for SMTP send on next worker poll (within ~2 min)."}


@router.post("/drafts/{draft_id}/reject")
async def reject_draft(
    draft_id: int,
    user: User = DHAdmin,
    db: Session = Depends(_get_db),
):
    row = db.execute(text(
        "SELECT id, draft_status FROM denial_replies WHERE id = :id"
    ), {"id": draft_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found")
    if (row.draft_status or "pending") not in ("pending", "send_failed"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot reject draft in status '{row.draft_status}'.",
        )
    db.execute(text(
        "UPDATE denial_replies SET draft_status = 'rejected', "
        "approved_by = :who, approved_at = NOW() WHERE id = :id"
    ), {"who": user.email, "id": draft_id})
    db.commit()
    return {"ok": True, "id": draft_id, "draft_status": "rejected"}
