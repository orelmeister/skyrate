"""
Admin Jobs API \u2014 perf_v2 nightly refresh + last-run telemetry.

Endpoints
---------
POST /v1/admin/jobs/usac-nightly-refresh
    Triggered by Google Cloud Scheduler once per day. Auth: ``X-Job-Token``
    header must match env ``NIGHTLY_JOB_TOKEN``. Returns 202 immediately and
    iterates every active user with a paced delay between hydrations.

GET /v1/admin/jobs/usac-nightly-refresh/last-run
    Returns metadata about the most recent nightly run for monitoring/UI.

GET /v1/admin/jobs/usac-backfill/run
    One-shot helper used during the flag-flip rollout to seed cache rows
    for any active users who don't yet have one. Same X-Job-Token auth.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.database import SessionLocal, get_db
from ...models.user import User
from ...models.consultant import ConsultantProfile
from ...models.user_usac_cache import UserUsacCache, UsacSyncJob
from ...services.usac_hydration import get_usac_hydration_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/jobs", tags=["Admin Jobs"])
settings = get_settings()


# In-process record of the most recent nightly run. Persisted weakly via the
# `usac_sync_jobs` table (every per-user run lands there) but kept here for
# fast last-run lookups without scanning the table.
_LAST_RUN: dict = {
    "started_at": None,
    "finished_at": None,
    "duration_ms": None,
    "users_total": 0,
    "users_succeeded": 0,
    "users_failed": 0,
    "trigger": None,
}


def _verify_job_token(x_job_token: Optional[str]) -> None:
    expected = settings.NIGHTLY_JOB_TOKEN
    if not expected:
        # Refuse all calls when the secret hasn't been configured, rather
        # than silently exposing the endpoint.
        raise HTTPException(status_code=503, detail="NIGHTLY_JOB_TOKEN not configured")
    if not x_job_token or x_job_token != expected:
        raise HTTPException(status_code=401, detail="invalid job token")


def _run_bulk_hydration(trigger: str, pace_seconds: float = 0.5) -> None:
    """Iterate active consultant users and hydrate each one in sequence.

    Paced (default 0.5s between users) to avoid hammering the USAC Open Data
    API. Each user runs in its own DB session so partial failures don't
    poison the whole batch.
    """
    started = datetime.utcnow()
    _LAST_RUN.update({
        "started_at": started.isoformat(),
        "finished_at": None,
        "duration_ms": None,
        "users_total": 0,
        "users_succeeded": 0,
        "users_failed": 0,
        "trigger": trigger,
    })

    listing_db = SessionLocal()
    try:
        # Only consultant accounts hydrate today. Vendor/applicant portals
        # don't depend on the user_usac_cache yet (their layouts cache-first
        # off empty payloads, which is fine).
        user_ids = [
            row[0]
            for row in (
                listing_db.query(ConsultantProfile.user_id)
                .join(User, User.id == ConsultantProfile.user_id)
                .filter(User.is_active.is_(True))
                .all()
            )
        ]
    finally:
        listing_db.close()

    _LAST_RUN["users_total"] = len(user_ids)
    succeeded = failed = 0
    service = get_usac_hydration_service()

    for uid in user_ids:
        db = SessionLocal()
        try:
            job = service.hydrate_user(db, user_id=uid, trigger=trigger)
            if job.status == "succeeded":
                succeeded += 1
            else:
                failed += 1
        except Exception as exc:  # pragma: no cover \u2014 hydrate_user already swallows
            failed += 1
            logger.exception("bulk hydrate failed for user_id=%s: %s", uid, exc)
        finally:
            db.close()
        if pace_seconds:
            time.sleep(pace_seconds)

    finished = datetime.utcnow()
    _LAST_RUN.update({
        "finished_at": finished.isoformat(),
        "duration_ms": int((finished - started).total_seconds() * 1000),
        "users_succeeded": succeeded,
        "users_failed": failed,
    })
    logger.info(
        "perf_v2 bulk hydration done trigger=%s total=%s ok=%s fail=%s ms=%s",
        trigger, len(user_ids), succeeded, failed, _LAST_RUN["duration_ms"],
    )


@router.post("/usac-nightly-refresh", status_code=status.HTTP_202_ACCEPTED)
def usac_nightly_refresh(
    background_tasks: BackgroundTasks,
    x_job_token: Optional[str] = Header(default=None, alias="X-Job-Token"),
):
    """Cloud Scheduler entry point. Fires-and-forgets the bulk hydration."""
    _verify_job_token(x_job_token)
    if not settings.PERF_V2_ENABLED:
        return {"success": True, "skipped": True, "reason": "PERF_V2_ENABLED=false"}
    background_tasks.add_task(_run_bulk_hydration, "nightly", 0.5)
    return {"success": True, "accepted": True, "started_at": datetime.utcnow().isoformat()}


@router.get("/usac-nightly-refresh/last-run")
def usac_nightly_refresh_last_run(
    x_job_token: Optional[str] = Header(default=None, alias="X-Job-Token"),
):
    _verify_job_token(x_job_token)
    return {"success": True, **_LAST_RUN}


@router.post("/usac-backfill/run", status_code=status.HTTP_202_ACCEPTED)
def usac_backfill_run(
    background_tasks: BackgroundTasks,
    x_job_token: Optional[str] = Header(default=None, alias="X-Job-Token"),
    only_missing: bool = True,
):
    """One-shot backfill of user_usac_cache for active consultant users.

    When ``only_missing=true`` (default) skips users who already have a
    cache row. Useful for the flag-flip rollout: run this once with
    ``only_missing=true`` to seed the system, then flip PERF_V2_ENABLED on.
    """
    _verify_job_token(x_job_token)

    def _run():
        started = datetime.utcnow()
        _LAST_RUN.update({
            "started_at": started.isoformat(),
            "finished_at": None,
            "duration_ms": None,
            "users_total": 0,
            "users_succeeded": 0,
            "users_failed": 0,
            "trigger": "backfill",
        })
        listing_db = SessionLocal()
        try:
            q = (
                listing_db.query(ConsultantProfile.user_id)
                .join(User, User.id == ConsultantProfile.user_id)
                .filter(User.is_active.is_(True))
            )
            if only_missing:
                # Outer join to user_usac_cache, keep rows where cache is NULL.
                from sqlalchemy import outerjoin
                cached_ids = set(
                    r[0] for r in listing_db.query(UserUsacCache.user_id).all()
                )
                user_ids = [r[0] for r in q.all() if r[0] not in cached_ids]
            else:
                user_ids = [r[0] for r in q.all()]
        finally:
            listing_db.close()

        _LAST_RUN["users_total"] = len(user_ids)
        succeeded = failed = 0
        service = get_usac_hydration_service()
        for uid in user_ids:
            db = SessionLocal()
            try:
                job = service.hydrate_user(db, user_id=uid, trigger="backfill")
                if job.status == "succeeded":
                    succeeded += 1
                else:
                    failed += 1
            except Exception as exc:  # pragma: no cover
                failed += 1
                logger.exception("backfill failed for user_id=%s: %s", uid, exc)
            finally:
                db.close()
            time.sleep(0.5)

        finished = datetime.utcnow()
        _LAST_RUN.update({
            "finished_at": finished.isoformat(),
            "duration_ms": int((finished - started).total_seconds() * 1000),
            "users_succeeded": succeeded,
            "users_failed": failed,
        })

    background_tasks.add_task(_run)
    return {"success": True, "accepted": True, "started_at": datetime.utcnow().isoformat()}


@router.get("/perf-summary")
def perf_summary(
    path_prefix: Optional[str] = None,
    x_job_token: Optional[str] = Header(default=None, alias="X-Job-Token"),
):
    """perf_v2 in-memory latency summary (p50/p95/p99 + cache-hit ratio).

    Used by the before/after audit script. Same X-Job-Token auth as the
    nightly job so we don't have to thread an admin JWT through the audit
    harness.
    """
    _verify_job_token(x_job_token)
    from ...core import perf_metrics  # local import to avoid cycles at boot
    return {"success": True, "summary": perf_metrics.summary(path_prefix=path_prefix)}


# ── TEMPORARY: FRN Digest backlog clear + single-user trigger ──────────────
# Added for one-time V2 rollout. Remove after verification.
from ...core.security import get_current_user, require_role

_require_super = require_role("super")


@router.post("/clear-frn-backlog")
def clear_frn_backlog(current_user=Depends(_require_super), db: Session = Depends(get_db)):
    """One-shot: mark all unprocessed queue rows as processed and bump cursors."""
    from sqlalchemy import text as sa_text

    row = db.execute(sa_text(
        "SELECT COUNT(*) AS cnt FROM frn_status_changes_queue WHERE processed=0"
    )).fetchone()
    pending_before = row[0]

    row = db.execute(sa_text(
        "SELECT COUNT(*) AS cnt FROM alert_configs WHERE last_frn_digest_at IS NULL "
        "OR last_frn_digest_at < NOW() - INTERVAL 1 DAY"
    )).fetchone()
    stale_configs = row[0]

    result = db.execute(sa_text(
        "UPDATE frn_status_changes_queue SET processed=1, processed_at=NOW() WHERE processed=0"
    ))
    marked_rows = result.rowcount

    result = db.execute(sa_text(
        "UPDATE alert_configs SET last_frn_digest_at=NOW() "
        "WHERE last_frn_digest_at IS NULL OR last_frn_digest_at < NOW() - INTERVAL 1 DAY"
    ))
    bumped_configs = result.rowcount

    db.commit()

    row = db.execute(sa_text(
        "SELECT COUNT(*) AS cnt FROM frn_status_changes_queue WHERE processed=0"
    )).fetchone()
    pending_after = row[0]

    return {
        "success": True,
        "pending_before": pending_before,
        "stale_configs": stale_configs,
        "marked_processed": marked_rows,
        "bumped_configs": bumped_configs,
        "pending_after": pending_after,
    }


@router.post("/trigger-frn-digest-single")
def trigger_frn_digest_single(
    email: str,
    current_user=Depends(_require_super),
    db: Session = Depends(get_db),
):
    """Trigger an immediate FRN digest email for a single user by email."""
    from ...models.alert import AlertConfig
    from ...models.frn_status_change import FrnStatusChangeQueue
    from ...services.email_service import EmailService

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User not found: {email}")

    config = db.query(AlertConfig).filter(AlertConfig.user_id == user.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="No alert_config for this user")

    since = config.last_frn_digest_at or (datetime.utcnow() - timedelta(hours=24))

    raw_rows = (
        db.query(FrnStatusChangeQueue)
        .filter(
            FrnStatusChangeQueue.user_id == user.id,
            FrnStatusChangeQueue.processed == 0,
            FrnStatusChangeQueue.created_at > since,
        )
        .order_by(FrnStatusChangeQueue.created_at.asc())
        .all()
    )

    frn_windows = {}
    for row in raw_rows:
        if row.frn not in frn_windows:
            frn_windows[row.frn] = {
                "first_old": row.old_status,
                "last_new": row.new_status,
                "last_amount": row.new_amount,
                "entity_name": row.entity_name,
                "ben": row.ben,
                "rows": [row],
            }
        else:
            w = frn_windows[row.frn]
            w["last_new"] = row.new_status
            w["last_amount"] = row.new_amount
            if row.entity_name:
                w["entity_name"] = row.entity_name
            w["rows"].append(row)

    collapsed_count = 0
    net_changes = []
    all_row_ids = []
    for frn_num, w in frn_windows.items():
        for r in w["rows"]:
            all_row_ids.append(r.id)
        if w["first_old"] == w["last_new"]:
            collapsed_count += 1
        else:
            net_changes.append({
                "frn": frn_num,
                "ben": w["ben"],
                "entity_name": w["entity_name"],
                "old_status": w["first_old"],
                "new_status": w["last_new"],
                "new_amount": w["last_amount"],
            })

    email_service = EmailService()
    user_name = user.first_name or user.email.split("@")[0]
    role = user.role or "consultant"
    email_to = config.notification_email or user.email

    if net_changes:
        if len(net_changes) > 50:
            net_changes = net_changes[:50]
        success = email_service.send_frn_digest_email_v2(
            to_email=email_to,
            user_name=user_name,
            changes=net_changes,
            collapsed_count=collapsed_count,
            role=role,
        )
        mode = "digest"
    else:
        success = email_service.send_frn_digest_heartbeat(
            to_email=email_to,
            user_name=user_name,
            role=role,
        )
        mode = "heartbeat"

    # Mark processed + cursor bump
    now = datetime.utcnow()
    if all_row_ids:
        db.query(FrnStatusChangeQueue).filter(
            FrnStatusChangeQueue.id.in_(all_row_ids)
        ).update({"processed": 1, "processed_at": now}, synchronize_session=False)
    config.last_frn_digest_at = now
    db.commit()

    return {
        "success": success,
        "mode": mode,
        "to_email": email_to,
        "net_changes_count": len(net_changes),
        "collapsed_count": collapsed_count,
        "raw_rows_drained": len(raw_rows),
    }
