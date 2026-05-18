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
from datetime import datetime
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
