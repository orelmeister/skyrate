"""
UsacHydrationService — perf_v2 single-shot performance overhaul.

Pre-computes the three expensive USAC-derived payloads used by the consultant
portal and stores them in user_usac_cache so portal pages can render
cache-first without ever waiting on Sodapy / USAC Open Data on a request.

Payloads (one row per user, JSON-serialized in Text columns):
  - schools_json:          shape of /v1/consultant/schools
  - dashboard_stats_json:  shape of /v1/consultant/dashboard-stats (default year)
  - crns_json:             shape of /v1/consultant/crns

Triggers:
  - signup     — first hydration on account creation (BackgroundTasks)
  - login      — opportunistic refresh on login when cache stale
  - manual     — user clicks "Sync from USAC" in the portal
  - nightly    — Cloud Scheduler -> /v1/admin/jobs/usac-nightly-refresh
  - backfill   — one-shot script to seed existing users on flag-flip

Gated by PERF_V2_ENABLED at the call site; this service is safe to import
unconditionally — it only writes when invoked.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..models.consultant import ConsultantProfile, ConsultantSchool, ConsultantCRN
from ..models.user import User
from ..models.user_usac_cache import UserUsacCache, UsacSyncJob
from .usac_service import get_usac_service

logger = logging.getLogger(__name__)

# USAC Open Data dataset IDs (mirrors consultant.py USAC_DATASETS).
USAC_DATASETS = {
    "form_471": "srbr-2d59",
    "c2_budget": "6brt-5pbv",
}


# ---------------------------------------------------------------------------
# Low-level USAC HTTP fetch (mirrors consultant.fetch_usac_data, kept local
# so this service has zero dependency on the FastAPI endpoint module).
# ---------------------------------------------------------------------------

def _fetch_usac_data(dataset: str, where_clause: str, limit: int = 5000) -> List[Dict[str, Any]]:
    import requests

    dataset_id = USAC_DATASETS.get(dataset, dataset)
    url = f"https://opendata.usac.org/resource/{dataset_id}.json"
    params = {"$where": where_clause, "$limit": limit}
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json() or []
    except Exception as exc:
        logger.warning("USAC fetch failed dataset=%s err=%s", dataset, exc)
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class UsacHydrationService:
    """Service for pre-computing per-user USAC-derived payloads."""

    # ----- Top-level entry point -------------------------------------------

    def hydrate_user(
        self,
        db: Session,
        user_id: int,
        trigger: str = "manual",
        force: bool = False,
    ) -> UsacSyncJob:
        """Hydrate (or refresh) the user_usac_cache row for ``user_id``.

        Returns the UsacSyncJob row (succeeded or failed). On failure the cache
        row's ``status`` is set to ``error`` but any previously cached payload
        is left intact so portal reads continue to serve stale-but-usable data.
        """
        job = UsacSyncJob(
            job_id=str(uuid.uuid4()),
            user_id=user_id,
            trigger=trigger if trigger in ("signup", "login", "manual", "nightly", "backfill") else "manual",
            status="running",
            started_at=datetime.utcnow(),
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        cache = db.query(UserUsacCache).filter(UserUsacCache.user_id == user_id).first()
        if cache is None:
            cache = UserUsacCache(user_id=user_id, status="syncing")
            db.add(cache)
        else:
            cache.status = "syncing"
        db.commit()

        t0 = datetime.utcnow()
        try:
            profile = (
                db.query(ConsultantProfile)
                .filter(ConsultantProfile.user_id == user_id)
                .first()
            )

            if profile is None:
                # Non-consultant users (vendor/applicant): write empty payloads
                # so the layout still has *something* to render cache-first.
                schools_payload = {"success": True, "count": 0, "schools": [], "synced": False}
                stats_payload = self._empty_dashboard_stats()
                crns_payload = {"success": True, "crns": [], "count": 0, "is_free_user": False, "can_add_free": False, "scope": "self"}
            else:
                schools_payload = self._build_schools_payload(db, profile)
                stats_payload = self._build_dashboard_stats(db, profile)
                crns_payload = self._build_crns_payload(db, profile)

            cache.schools_json = json.dumps(schools_payload, default=str)
            cache.dashboard_stats_json = json.dumps(stats_payload, default=str)
            cache.crns_json = json.dumps(crns_payload, default=str)
            cache.last_synced_at = datetime.utcnow()
            cache.status = "fresh"
            cache.last_error = None

            job.status = "succeeded"
            job.finished_at = datetime.utcnow()
            job.duration_ms = int((job.finished_at - t0).total_seconds() * 1000)
            db.commit()
            db.refresh(job)
            logger.info(
                "usac_hydrate ok user_id=%s trigger=%s ms=%s schools=%s",
                user_id, trigger, job.duration_ms, schools_payload.get("count"),
            )
            return job

        except Exception as exc:
            db.rollback()
            # Re-fetch after rollback to update fail status
            job = db.query(UsacSyncJob).filter(UsacSyncJob.job_id == job.job_id).first()
            cache = db.query(UserUsacCache).filter(UserUsacCache.user_id == user_id).first()
            if job is not None:
                job.status = "failed"
                job.error = str(exc)[:2000]
                job.finished_at = datetime.utcnow()
                job.duration_ms = int((job.finished_at - t0).total_seconds() * 1000)
            if cache is not None:
                cache.status = "error"
                cache.last_error = str(exc)[:2000]
            db.commit()
            logger.exception("usac_hydrate FAIL user_id=%s trigger=%s", user_id, trigger)
            return job  # caller decides whether to re-raise

    # ----- Payload builders ------------------------------------------------

    def _build_schools_payload(self, db: Session, profile: ConsultantProfile) -> Dict[str, Any]:
        """Mirror of /v1/consultant/schools force-sync path.

        Always fetches fresh USAC Form 471 status for every BEN in the
        consultant's portfolio, persists the derived status back onto the
        ConsultantSchool rows (so the existing endpoint also benefits), and
        returns the same dict the endpoint returns.
        """
        schools = (
            db.query(ConsultantSchool)
            .filter(ConsultantSchool.consultant_profile_id == profile.id)
            .order_by(ConsultantSchool.school_name)
            .all()
        )

        if not schools:
            return {"success": True, "count": 0, "schools": [], "synced": False}

        all_bens = [s.ben for s in schools]
        ben_apps: Dict[str, List[Dict[str, Any]]] = {ben: [] for ben in all_bens}

        try:
            usac = get_usac_service()
            all_apps = usac.fetch_form_471(
                filters={"ben": all_bens},
                limit=len(all_bens) * 20,
            )
            for app in all_apps:
                ben = str(app.get("ben", ""))
                if ben in ben_apps:
                    ben_apps[ben].append(app)
        except Exception as exc:
            logger.warning("hydrate schools batch fetch failed: %s", exc)

        school_list: List[Dict[str, Any]] = []
        now = datetime.utcnow()
        for school in schools:
            d = school.to_dict()
            apps = ben_apps.get(school.ben, [])
            if apps:
                sorted_apps = sorted(
                    apps,
                    key=lambda x: int(x.get("funding_year", 0) or 0),
                    reverse=True,
                )
                latest = sorted_apps[0]
                d["school_name"] = (
                    latest.get("applicant_name")
                    or latest.get("organization_name")
                    or latest.get("billed_entity_name")
                    or school.school_name
                )
                d["state"] = latest.get("physical_state") or latest.get("state") or school.state

                latest_year = latest.get("funding_year")
                latest_year_apps = [a for a in sorted_apps if a.get("funding_year") == latest_year]
                statuses = [
                    (a.get("form_471_frn_status_name") or a.get("application_status") or "").lower()
                    for a in latest_year_apps
                ]
                has_denied = any("denied" in s for s in statuses)
                has_funded = any(s in ("funded", "committed") for s in statuses)
                has_pending = any(
                    s in ("pending", "under review", "in review", "wave ready", "certified", "submitted")
                    for s in statuses
                )
                has_unfunded = any(s in ("unfunded", "cancelled", "not funded") for s in statuses)

                if has_denied:
                    d["status"], d["status_color"] = "Has Denials", "red"
                elif has_unfunded:
                    d["status"], d["status_color"] = "Unfunded", "red"
                elif has_funded:
                    d["status"], d["status_color"] = "Funded", "green"
                elif has_pending:
                    d["status"], d["status_color"] = "Pending", "yellow"
                else:
                    actual = (
                        latest.get("form_471_frn_status_name")
                        or latest.get("application_status")
                        or "Unknown"
                    )
                    d["status"], d["status_color"] = actual or "Unknown", "gray"

                d["latest_year"] = latest_year
                d["applications_count"] = len(apps)

                # Persist back to ConsultantSchool (same behavior as the
                # existing endpoint) so the legacy code path also benefits.
                if d.get("school_name") and d["school_name"] != school.school_name:
                    school.school_name = d["school_name"]
                if d.get("state") and d["state"] != school.state:
                    school.state = d["state"]
                school.status = d["status"]
                school.status_color = d["status_color"]
                school.latest_year = int(latest_year) if latest_year else None
                school.applications_count = len(apps)
                school.last_synced = now
            else:
                d["status"] = "No Applications"
                d["status_color"] = "gray"
                d["applications_count"] = 0
                school.status = "No Applications"
                school.status_color = "gray"
                school.applications_count = 0
                school.last_synced = now

            school_list.append(d)

        db.commit()
        return {
            "success": True,
            "count": len(school_list),
            "schools": school_list,
            "synced": True,
        }

    def _build_dashboard_stats(
        self, db: Session, profile: ConsultantProfile, year: Optional[int] = None
    ) -> Dict[str, Any]:
        """Mirror of /v1/consultant/dashboard-stats default-year path."""
        target_year = year if year is not None else datetime.utcnow().year

        schools = (
            db.query(ConsultantSchool)
            .filter(ConsultantSchool.consultant_profile_id == profile.id)
            .all()
        )
        if not schools:
            return {
                "success": True, "year": target_year, "total_schools": 0,
                "total_c2_funding": 0, "total_c2_funding_year": 0,
                "total_c1_funding": 0, "total_funding": 0,
                "total_applications": 0, "denied_count": 0,
                "funded_count": 0, "pending_count": 0,
                "schools_with_denials": 0,
            }

        all_bens = [s.ben for s in schools]

        # ---- C2 Budget (5-year total) ----
        total_c2_funding = 0.0
        try:
            if len(all_bens) == 1:
                c2_filter = f"ben='{all_bens[0]}'"
            else:
                c2_filter = "(" + " OR ".join(f"ben='{b}'" for b in all_bens) + ")"
            c2_data = _fetch_usac_data("c2_budget", c2_filter, limit=len(all_bens) * 10)
            for rec in c2_data or []:
                total_c2_funding += float(rec.get("funded_c2_budget_amount") or 0)
        except Exception as exc:
            logger.warning("hydrate c2_budget fetch failed: %s", exc)

        # ---- Form 471 (year-scoped) ----
        total_c1_funding = 0.0
        total_c2_funding_year = 0.0
        total_applications = 0
        denied_count = funded_count = pending_count = 0
        bens_with_denials: set = set()
        try:
            if len(all_bens) == 1:
                ben_filter = f"ben='{all_bens[0]}'"
            else:
                ben_filter = "(" + " OR ".join(f"ben='{b}'" for b in all_bens) + ")"
            where = f"{ben_filter} AND funding_year='{target_year}'"
            apps = _fetch_usac_data("form_471", where, limit=len(all_bens) * 50)
            total_applications = len(apps)
            for app in apps:
                stat = str(app.get("form_471_frn_status_name", "")).lower()
                ben = app.get("ben")
                committed = float(app.get("funding_commitment_request") or 0)
                stype = str(app.get("form_471_service_type_name", "")).lower()
                is_c2 = any(
                    t in stype
                    for t in (
                        "internal connections", "basic maintenance",
                        "managed internal broadband services", "mibs",
                    )
                )
                if not is_c2 and stat == "funded":
                    total_c1_funding += committed
                if is_c2 and stat == "funded":
                    total_c2_funding_year += committed
                if "denied" in stat:
                    denied_count += 1
                    if ben:
                        bens_with_denials.add(str(ben))
                elif stat == "funded":
                    funded_count += 1
                elif stat in ("pending", "wave ready", "certified"):
                    pending_count += 1
        except Exception as exc:
            logger.warning("hydrate form_471 fetch failed: %s", exc)

        return {
            "success": True,
            "year": target_year,
            "total_schools": len(schools),
            "total_c2_funding": total_c2_funding,
            "total_c2_funding_year": total_c2_funding_year,
            "total_c1_funding": total_c1_funding,
            "total_funding": total_c2_funding + total_c1_funding,
            "total_applications": total_applications,
            "denied_count": denied_count,
            "funded_count": funded_count,
            "pending_count": pending_count,
            "schools_with_denials": len(bens_with_denials),
        }

    def _build_crns_payload(self, db: Session, profile: ConsultantProfile) -> Dict[str, Any]:
        """Mirror of /v1/consultant/crns for a regular consultant (no USAC call)."""
        from sqlalchemy import or_

        crns = (
            db.query(ConsultantCRN)
            .filter(ConsultantCRN.consultant_profile_id == profile.id)
            .order_by(ConsultantCRN.is_primary.desc(), ConsultantCRN.created_at)
            .all()
        )

        for crn in crns:
            if crn.is_primary:
                count = (
                    db.query(ConsultantSchool)
                    .filter(
                        ConsultantSchool.consultant_profile_id == profile.id,
                        or_(
                            ConsultantSchool.source_crn == crn.crn,
                            ConsultantSchool.source_crn.is_(None),
                        ),
                    )
                    .count()
                )
            else:
                count = (
                    db.query(ConsultantSchool)
                    .filter(
                        ConsultantSchool.consultant_profile_id == profile.id,
                        ConsultantSchool.source_crn == crn.crn,
                    )
                    .count()
                )
            crn.schools_count = count

        return {
            "success": True,
            "crns": [c.to_dict() for c in crns],
            "count": len(crns),
            # is_free_user / can_add_free are user-role-dependent and are
            # safe to recompute cheaply at request time; the cache stores
            # the heavy parts (DB joins + counts). The endpoint will overlay
            # these flags from the live request context.
            "is_free_user": False,
            "can_add_free": False,
            "scope": "self",
        }

    @staticmethod
    def _empty_dashboard_stats() -> Dict[str, Any]:
        return {
            "success": True,
            "year": datetime.utcnow().year,
            "total_schools": 0,
            "total_c2_funding": 0, "total_c2_funding_year": 0,
            "total_c1_funding": 0, "total_funding": 0,
            "total_applications": 0,
            "denied_count": 0, "funded_count": 0, "pending_count": 0,
            "schools_with_denials": 0,
        }


# Module-level singleton accessor (matches the get_usac_service convention).
_singleton: Optional[UsacHydrationService] = None


def get_usac_hydration_service() -> UsacHydrationService:
    global _singleton
    if _singleton is None:
        _singleton = UsacHydrationService()
    return _singleton


# Convenience wrapper used by FastAPI BackgroundTasks. Opens its own DB
# session so the calling request's session can close before the long-running
# USAC fetch begins.
def hydrate_user_background(user_id: int, trigger: str = "signup") -> None:
    from ..core.database import SessionLocal

    db = SessionLocal()
    try:
        get_usac_hydration_service().hydrate_user(db, user_id=user_id, trigger=trigger)
    finally:
        db.close()
