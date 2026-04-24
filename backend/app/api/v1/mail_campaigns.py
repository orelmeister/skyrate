"""
Mail Campaigns Admin Router (P5)

Read-only + approval endpoints that power the /superadmin/mail-campaigns
dashboard. Queries run against the separate Hostinger MySQL database used
by the mail.skyrate.ai worker (NOT the SkyRate AI app DB).

All endpoints require admin/super role AND the caller's email must appear
in the ADMIN_EMAILS env var (comma-separated allowlist). This is the real
admin gate that Objective 2 requires.

No new ORM models — every query uses raw SQLAlchemy text() so we stay
loosely coupled to the mail worker's schema.
"""

import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session

from ...core.security import require_role
from ...models.user import User


router = APIRouter(prefix="/mail", tags=["Mail Campaigns Admin"])


# --------------------------------------------------------------------------
# Separate engine for the mail.skyrate.ai database (u892988798_mail_skyrate).
# Lazily initialised so the app still boots if these env vars are missing.
# --------------------------------------------------------------------------

_mail_engine: Optional[Engine] = None
_MailSession: Optional[sessionmaker] = None


def _get_mail_engine() -> Engine:
    global _mail_engine, _MailSession
    if _mail_engine is not None:
        return _mail_engine

    host = os.environ.get("MAIL_DB_HOST")
    user = os.environ.get("MAIL_DB_USER")
    password = os.environ.get("MAIL_DB_PASSWORD")
    name = os.environ.get("MAIL_DB_NAME")
    port = os.environ.get("MAIL_DB_PORT", "3306")

    if not all([host, user, password, name]):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Mail campaigns DB not configured. Set MAIL_DB_HOST, "
                "MAIL_DB_USER, MAIL_DB_PASSWORD, MAIL_DB_NAME on the app."
            ),
        )

    url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{name}?charset=utf8mb4"
    _mail_engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=3,
        max_overflow=2,
    )
    _MailSession = sessionmaker(bind=_mail_engine, autoflush=False, autocommit=False)
    return _mail_engine


def get_mail_db() -> Session:
    _get_mail_engine()
    assert _MailSession is not None
    db = _MailSession()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------
# Admin gate: role check + email allowlist
# --------------------------------------------------------------------------

def _parse_admin_emails() -> List[str]:
    raw = os.environ.get("ADMIN_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


async def require_mail_admin(
    current_user: User = Depends(require_role("admin", "super")),
) -> User:
    allowlist = _parse_admin_emails()
    # If the allowlist is empty, we fall back to role-only (still admin/super)
    # so a fresh deploy isn't locked out. Once ADMIN_EMAILS is set, it's enforced.
    if allowlist and (current_user.email or "").lower() not in allowlist:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mail admin access restricted to ADMIN_EMAILS allowlist.",
        )
    return current_user


MailAdmin = Depends(require_mail_admin)


def _rows(result) -> List[Dict[str, Any]]:
    return [dict(r._mapping) for r in result]


def _table_exists(db: Session, table: str) -> bool:
    q = text(
        "SELECT COUNT(*) AS c FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = :t"
    )
    return bool(db.execute(q, {"t": table}).scalar() or 0)


# ==========================================================================
# 1. LIVE  -- 24h send volume + current sender_health
# ==========================================================================

@router.get("/live")
async def mail_live(
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    sends_by_tier = _rows(db.execute(text(
        """
        SELECT
            COALESCE(tier, 'unknown') AS tier,
            COALESCE(status, 'unknown') AS status,
            COUNT(*) AS cnt
        FROM sends
        WHERE sent_at >= NOW() - INTERVAL 24 HOUR
        GROUP BY tier, status
        ORDER BY tier, status
        """
    )))

    hourly = _rows(db.execute(text(
        """
        SELECT
            DATE_FORMAT(sent_at, '%Y-%m-%d %H:00') AS hour,
            COUNT(*) AS sent
        FROM sends
        WHERE sent_at >= NOW() - INTERVAL 24 HOUR
        GROUP BY hour
        ORDER BY hour
        """
    )))

    sender_health: List[Dict[str, Any]] = []
    if _table_exists(db, "sender_health"):
        sender_health = _rows(db.execute(text(
            """
            SELECT
                from_email,
                window_sends,
                window_bounces,
                CASE WHEN window_sends > 0
                     THEN ROUND(window_bounces * 100.0 / window_sends, 2)
                     ELSE 0 END AS bounce_pct,
                status,
                updated_at
            FROM sender_health
            ORDER BY from_email
            """
        )))

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "sends_by_tier_24h": sends_by_tier,
        "hourly_24h": hourly,
        "sender_health": sender_health,
    }


# ==========================================================================
# 2. DELIVERABILITY  -- trailing-200 bounce + 7d DMARC alignment
# ==========================================================================

@router.get("/deliverability")
async def mail_deliverability(
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    # Per-tier trailing 200 sends bounce rate
    tiers = _rows(db.execute(text("SELECT DISTINCT tier FROM sends WHERE tier IS NOT NULL")))
    trailing_by_tier: List[Dict[str, Any]] = []
    for row in tiers:
        tier = row["tier"]
        r = db.execute(text(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status IN ('bounced','hard_bounced','soft_bounced') THEN 1 ELSE 0 END) AS bounces
            FROM (
                SELECT status FROM sends
                WHERE tier = :tier
                ORDER BY sent_at DESC
                LIMIT 200
            ) t
            """
        ), {"tier": tier}).first()
        total = int(r.total or 0)
        bounces = int(r.bounces or 0)
        trailing_by_tier.append({
            "tier": tier,
            "total": total,
            "bounces": bounces,
            "bounce_pct": round(bounces * 100.0 / total, 2) if total else 0.0,
        })

    dmarc_summary: Dict[str, Any] = {"available": False}
    failing_ips: List[Dict[str, Any]] = []
    if _table_exists(db, "dmarc_aggregate"):
        dmarc_summary = dict(db.execute(text(
            """
            SELECT
                COALESCE(SUM(count),0) AS total,
                COALESCE(SUM(CASE WHEN spf_result='pass' THEN count ELSE 0 END),0) AS spf_pass,
                COALESCE(SUM(CASE WHEN dkim_result='pass' THEN count ELSE 0 END),0) AS dkim_pass,
                COALESCE(SUM(CASE WHEN disposition='none' THEN count ELSE 0 END),0) AS delivered
            FROM dmarc_aggregate
            WHERE created_at >= NOW() - INTERVAL 7 DAY
            """
        )).first()._mapping)
        dmarc_summary["available"] = True
        total = int(dmarc_summary.get("total") or 0)
        dmarc_summary["spf_alignment_pct"] = (
            round(int(dmarc_summary["spf_pass"]) * 100.0 / total, 2) if total else 0.0
        )
        dmarc_summary["dkim_alignment_pct"] = (
            round(int(dmarc_summary["dkim_pass"]) * 100.0 / total, 2) if total else 0.0
        )

        failing_ips = _rows(db.execute(text(
            """
            SELECT
                source_ip,
                SUM(count) AS volume,
                SUM(CASE WHEN spf_result='pass' THEN count ELSE 0 END) AS spf_pass,
                SUM(CASE WHEN dkim_result='pass' THEN count ELSE 0 END) AS dkim_pass
            FROM dmarc_aggregate
            WHERE created_at >= NOW() - INTERVAL 7 DAY
              AND (spf_result <> 'pass' OR dkim_result <> 'pass')
            GROUP BY source_ip
            ORDER BY volume DESC
            LIMIT 20
            """
        )))

    sender_health: List[Dict[str, Any]] = []
    if _table_exists(db, "sender_health"):
        sender_health = _rows(db.execute(text(
            """
            SELECT from_email, window_sends, window_bounces,
                   CASE WHEN window_sends > 0
                        THEN ROUND(window_bounces * 100.0 / window_sends, 2)
                        ELSE 0 END AS bounce_pct,
                   status
            FROM sender_health
            """
        )))

    return {
        "trailing_by_tier": trailing_by_tier,
        "dmarc_7d": dmarc_summary,
        "failing_source_ips": failing_ips,
        "sender_health": sender_health,
    }


# ==========================================================================
# 3. FUNNEL  -- sent / opens / clicks / replies / unsubs per tier
# ==========================================================================

@router.get("/funnel")
async def mail_funnel(
    days: int = Query(7, ge=1, le=90),
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    sent = _rows(db.execute(text(
        """
        SELECT COALESCE(tier,'unknown') AS tier, COUNT(*) AS sent
        FROM sends
        WHERE sent_at >= NOW() - INTERVAL :d DAY
        GROUP BY tier
        """
    ), {"d": days}))

    by_tier: Dict[str, Dict[str, int]] = {
        r["tier"]: {"sent": int(r["sent"]), "opened": 0, "clicked": 0, "replied": 0, "unsubbed": 0}
        for r in sent
    }

    def _ensure(tier: str) -> Dict[str, int]:
        if tier not in by_tier:
            by_tier[tier] = {"sent": 0, "opened": 0, "clicked": 0, "replied": 0, "unsubbed": 0}
        return by_tier[tier]

    if _table_exists(db, "open_events"):
        for r in _rows(db.execute(text(
            """
            SELECT COALESCE(s.tier,'unknown') AS tier, COUNT(DISTINCT o.send_id) AS c
            FROM open_events o
            LEFT JOIN sends s ON s.id = o.send_id
            WHERE o.created_at >= NOW() - INTERVAL :d DAY
            GROUP BY s.tier
            """
        ), {"d": days})):
            _ensure(r["tier"])["opened"] = int(r["c"])

    if _table_exists(db, "click_events"):
        for r in _rows(db.execute(text(
            """
            SELECT COALESCE(s.tier,'unknown') AS tier, COUNT(DISTINCT c.send_id) AS c
            FROM click_events c
            LEFT JOIN sends s ON s.id = c.send_id
            WHERE c.created_at >= NOW() - INTERVAL :d DAY
            GROUP BY s.tier
            """
        ), {"d": days})):
            _ensure(r["tier"])["clicked"] = int(r["c"])

    if _table_exists(db, "replies"):
        for r in _rows(db.execute(text(
            """
            SELECT COALESCE(tier,'unknown') AS tier, COUNT(*) AS c
            FROM replies
            WHERE received_at >= NOW() - INTERVAL :d DAY
            GROUP BY tier
            """
        ), {"d": days})):
            _ensure(r["tier"])["replied"] = int(r["c"])

    if _table_exists(db, "suppression_list"):
        for r in _rows(db.execute(text(
            """
            SELECT COALESCE(tier,'unknown') AS tier, COUNT(*) AS c
            FROM suppression_list
            WHERE reason IN ('unsubscribe','one_click_unsub')
              AND created_at >= NOW() - INTERVAL :d DAY
            GROUP BY tier
            """
        ), {"d": days})):
            _ensure(r["tier"])["unsubbed"] = int(r["c"])

    funnel = []
    for tier, v in by_tier.items():
        sent_n = v["sent"] or 0
        funnel.append({
            "tier": tier,
            **v,
            "open_pct": round(v["opened"] * 100.0 / sent_n, 2) if sent_n else 0.0,
            "click_pct": round(v["clicked"] * 100.0 / sent_n, 2) if sent_n else 0.0,
            "reply_pct": round(v["replied"] * 100.0 / sent_n, 2) if sent_n else 0.0,
            "unsub_pct": round(v["unsubbed"] * 100.0 / sent_n, 2) if sent_n else 0.0,
        })
    funnel.sort(key=lambda x: -x["sent"])
    return {"days": days, "funnel": funnel}


# ==========================================================================
# 4. SUPPRESSION LIST
# ==========================================================================

@router.get("/suppression")
async def mail_suppression(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    reason: Optional[str] = None,
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    if not _table_exists(db, "suppression_list"):
        return {"total": 0, "items": []}

    where = ""
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    if reason:
        where = "WHERE reason = :reason"
        params["reason"] = reason

    total = db.execute(
        text(f"SELECT COUNT(*) FROM suppression_list {where}"), params
    ).scalar() or 0

    items = _rows(db.execute(text(
        f"""
        SELECT email, reason, source, created_at
        FROM suppression_list
        {where}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
        """
    ), params))

    reasons = _rows(db.execute(text(
        "SELECT reason, COUNT(*) AS cnt FROM suppression_list GROUP BY reason ORDER BY cnt DESC"
    )))

    return {"total": int(total), "items": items, "reasons": reasons}


# ==========================================================================
# 5. LLM INSIGHTS  -- nightly analyst reports + budget ledger
# ==========================================================================

@router.get("/llm-insights")
async def mail_llm_insights(
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    reports: List[Dict[str, Any]] = []
    if _table_exists(db, "campaign_reports"):
        reports = _rows(db.execute(text(
            """
            SELECT id, created_at, report_type, model, tokens_in, tokens_out,
                   cost_usd, payload
            FROM campaign_reports
            ORDER BY created_at DESC
            LIMIT 30
            """
        )))

    budget_daily: List[Dict[str, Any]] = []
    if _table_exists(db, "llm_budget_ledger"):
        budget_daily = _rows(db.execute(text(
            """
            SELECT DATE(created_at) AS day,
                   SUM(cost_usd) AS spend_usd,
                   SUM(tokens_in) AS tokens_in,
                   SUM(tokens_out) AS tokens_out,
                   COUNT(*) AS calls
            FROM llm_budget_ledger
            WHERE created_at >= NOW() - INTERVAL 7 DAY
            GROUP BY DATE(created_at)
            ORDER BY day ASC
            """
        )))

    return {
        "reports": reports,
        "budget_7d": budget_daily,
        "daily_budget_ceiling_usd": 5.0,
    }


# ==========================================================================
# 6. DMARC  -- findings + 30d aggregate
# ==========================================================================

@router.get("/dmarc")
async def mail_dmarc(
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    findings: List[Dict[str, Any]] = []
    if _table_exists(db, "dmarc_findings"):
        findings = _rows(db.execute(text(
            """
            SELECT id, status, severity, title, recommendation,
                   created_at, approved_at, admin_email
            FROM dmarc_findings
            ORDER BY
                CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1
                            WHEN 'applied' THEN 2 WHEN 'rejected' THEN 3
                            ELSE 4 END,
                created_at DESC
            LIMIT 200
            """
        )))

    aggregate: Dict[str, Any] = {"available": False}
    if _table_exists(db, "dmarc_aggregate"):
        agg = db.execute(text(
            """
            SELECT COALESCE(SUM(count),0) AS total,
                   COALESCE(SUM(CASE WHEN spf_result='pass' AND dkim_result='pass' THEN count ELSE 0 END),0) AS both_pass
            FROM dmarc_aggregate
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            """
        )).first()
        top_ips = _rows(db.execute(text(
            """
            SELECT source_ip, SUM(count) AS volume
            FROM dmarc_aggregate
            WHERE created_at >= NOW() - INTERVAL 30 DAY
            GROUP BY source_ip
            ORDER BY volume DESC
            LIMIT 10
            """
        )))
        total = int(agg.total or 0)
        aggregate = {
            "available": True,
            "total_messages": total,
            "pass_rate_pct": round(int(agg.both_pass) * 100.0 / total, 2) if total else 0.0,
            "top_source_ips": top_ips,
        }

    return {"findings": findings, "aggregate_30d": aggregate}


# ==========================================================================
# 7. EXPERIMENTS
# ==========================================================================

@router.get("/experiments")
async def mail_experiments(
    status_filter: Optional[str] = Query(None, alias="status"),
    _: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    if not _table_exists(db, "experiments"):
        return {"items": []}
    where = ""
    params: Dict[str, Any] = {}
    if status_filter:
        where = "WHERE status = :s"
        params["s"] = status_filter
    items = _rows(db.execute(text(
        f"""
        SELECT id, name, hypothesis, variant, metric, status,
               created_at, approved_at, admin_email, payload
        FROM experiments
        {where}
        ORDER BY
            CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1
                        WHEN 'running' THEN 2 ELSE 3 END,
            created_at DESC
        LIMIT 200
        """
    ), params))
    return {"items": items}


# ==========================================================================
# APPROVAL ENDPOINTS (the only writes in this router)
# ==========================================================================

class ApprovalResponse(BaseModel):
    ok: bool
    id: int
    status: str


def _update_status(
    db: Session, table: str, row_id: int, new_status: str, admin_email: str
) -> ApprovalResponse:
    if not _table_exists(db, table):
        raise HTTPException(status_code=404, detail=f"{table} not available")
    now = datetime.utcnow()
    res = db.execute(text(
        f"""
        UPDATE {table}
        SET status = :s, admin_email = :e, approved_at = :t
        WHERE id = :id
        """
    ), {"s": new_status, "e": admin_email, "t": now, "id": row_id})
    if res.rowcount == 0:
        db.rollback()
        raise HTTPException(status_code=404, detail=f"{table} id {row_id} not found")
    db.commit()
    return ApprovalResponse(ok=True, id=row_id, status=new_status)


@router.post("/dmarc/{finding_id}/approve", response_model=ApprovalResponse)
async def approve_dmarc(
    finding_id: int,
    current_user: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    return _update_status(db, "dmarc_findings", finding_id, "approved", current_user.email)


@router.post("/dmarc/{finding_id}/reject", response_model=ApprovalResponse)
async def reject_dmarc(
    finding_id: int,
    current_user: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    return _update_status(db, "dmarc_findings", finding_id, "rejected", current_user.email)


@router.post("/experiments/{exp_id}/approve", response_model=ApprovalResponse)
async def approve_experiment(
    exp_id: int,
    current_user: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    return _update_status(db, "experiments", exp_id, "approved", current_user.email)


@router.post("/experiments/{exp_id}/reject", response_model=ApprovalResponse)
async def reject_experiment(
    exp_id: int,
    current_user: User = MailAdmin,
    db: Session = Depends(get_mail_db),
):
    return _update_status(db, "experiments", exp_id, "rejected", current_user.email)
