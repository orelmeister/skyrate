"""
FRN Sync Service — Event-driven USAC data import (Phase 5)

Provides background-task-compatible functions to sync FRN data from USAC
into AdminFRNSnapshot and write status changes to FrnStatusChangeQueue.
Each function opens its own DB session so it can run asynchronously after
the request's session has closed.
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def sync_portfolio_for_crn(crn: str, user_id: int) -> None:
    """
    Background task: fetch FRN data from USAC for all BENs associated with a CRN,
    persist into AdminFRNSnapshot, and queue status changes to FrnStatusChangeQueue.
    """
    from ..core.database import SessionLocal
    from ..models.admin_frn_snapshot import AdminFRNSnapshot
    from ..models.frn_status_change import FrnStatusChangeQueue
    from ..models.consultant import ConsultantProfile, ConsultantSchool
    from ..models.user import User

    db = SessionLocal()
    try:
        # Get the consultant profile and schools for this CRN
        profile = db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user_id
        ).first()
        if not profile:
            logger.warning(f"[FRN Sync] No consultant profile for user_id={user_id}")
            return

        # Get BENs from schools that were imported via this CRN
        schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id,
            ConsultantSchool.source_crn == crn
        ).all()

        # Fallback: if source_crn isn't set, grab all portfolio schools
        if not schools:
            schools = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()

        if not schools:
            logger.info(f"[FRN Sync] No schools for CRN {crn}, user_id={user_id}")
            return

        bens = [s.ben for s in schools if s.ben]
        if not bens:
            return

        user = db.query(User).filter(User.id == user_id).first()
        user_email = user.email if user else ""

        _sync_bens_to_snapshot(db, bens, user_id, user_email, schools, scope_type="crn", scope_value=crn)
        logger.info(f"[FRN Sync] CRN sync complete for {crn}, user_id={user_id}, bens={len(bens)}")
    except Exception as e:
        logger.error(f"[FRN Sync] CRN sync error for {crn}: {e}")
    finally:
        db.close()


def sync_frns_for_ben(ben: str, user_id: int) -> None:
    """
    Background task: fetch FRN data from USAC for a single BEN,
    persist into AdminFRNSnapshot, and queue status changes to FrnStatusChangeQueue.
    """
    from ..core.database import SessionLocal
    from ..models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        user_email = user.email if user else ""

        _sync_bens_to_snapshot(db, [ben], user_id, user_email, [], scope_type="ben", scope_value=ben)
        logger.info(f"[FRN Sync] BEN sync complete for {ben}, user_id={user_id}")
    except Exception as e:
        logger.error(f"[FRN Sync] BEN sync error for {ben}: {e}")
    finally:
        db.close()


def sync_frns_for_spin(spin: str, user_id: int) -> None:
    """
    Background task: fetch FRN data from USAC for a vendor's SPIN.
    Placeholder for future use if a SPIN-add endpoint is created.
    """
    logger.info(f"[FRN Sync] SPIN sync placeholder for {spin}, user_id={user_id}")


def _sync_bens_to_snapshot(
    db,
    bens: list,
    user_id: int,
    user_email: str,
    schools: list,
    scope_type: str = "ben",
    scope_value: str = "",
) -> None:
    """
    Core logic: fetch FRN data from USAC batch API, upsert into AdminFRNSnapshot,
    and write changes to FrnStatusChangeQueue.
    """
    from .frn_upsert import upsert_frn_snapshots, build_rec_from_usac_frn

    try:
        from utils.usac_client import USACDataClient
    except ImportError:
        from ...utils.usac_client import USACDataClient

    client = USACDataClient()
    batch_result = client.get_frn_status_batch(bens=bens)
    if not batch_result.get("success"):
        logger.error(f"[FRN Sync] USAC batch failed: {batch_result.get('error')}")
        return

    ben_to_org = {s.ben: s.school_name for s in schools} if schools else {}

    records = []
    for ben_key, ben_data in batch_result.get("results", {}).items():
        entity_name = ben_data.get("entity_name") or ben_to_org.get(str(ben_key)) or ""
        for frn in ben_data.get("frns", []):
            records.append(build_rec_from_usac_frn(
                frn, ben=str(ben_key), entity_name=entity_name,
                user_id=user_id, user_email=user_email, source="consultant",
            ))

    result = upsert_frn_snapshots(
        db, records,
        scope_type=scope_type, scope_value=scope_value,
        queue_status_changes=True,
    )
    logger.info(
        f"[FRN Sync] Done: {result['inserts']} inserts, {result['updates']} updates, "
        f"{result['alerts']} queue entries"
    )
