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
    from ..models.admin_frn_snapshot import AdminFRNSnapshot
    from ..models.frn_status_change import FrnStatusChangeQueue

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
    now = datetime.utcnow()

    # Fetch existing snapshots for diffing
    existing_map = {}
    for i in range(0, len(bens), 100):
        chunk = bens[i:i + 100]
        rows = db.query(AdminFRNSnapshot).filter(AdminFRNSnapshot.ben.in_(chunk)).all()
        for r in rows:
            existing_map[(r.ben, r.frn)] = r

    inserts = []
    queue_entries = []
    updates = 0

    for ben_key, ben_data in batch_result.get("results", {}).items():
        entity_name = ben_data.get("entity_name") or ben_to_org.get(str(ben_key)) or ""
        for frn in ben_data.get("frns", []):
            rec = {
                "frn": frn.get("frn", ""),
                "status": frn.get("status", "Unknown"),
                "funding_year": str(frn.get("funding_year", "")),
                "amount_requested": float(frn.get("commitment_amount") or frn.get("amount") or 0),
                "amount_committed": float(frn.get("disbursed_amount") or 0),
                "service_type": frn.get("service_type", ""),
                "organization_name": entity_name,
                "ben": str(ben_key),
                "user_id": user_id,
                "user_email": user_email,
                "source": "consultant",
                "fcdl_date": frn.get("fcdl_date", ""),
                "pending_reason": frn.get("pending_reason", ""),
            }

            key = (rec["ben"], rec["frn"])
            if key in existing_map:
                ex = existing_map[key]
                rec_status = str(rec["status"]) if rec.get("status") else "Unknown"
                ex_status = str(ex.status) if ex.status else "Unknown"

                status_changed = ex_status != rec_status
                amt_changed = float(ex.amount_committed or 0) != float(rec.get("amount_committed") or 0)
                pr_changed = (ex.pending_reason or "") != (rec.get("pending_reason") or "")
                fcdl_changed = (ex.fcdl_date or "") != (rec.get("fcdl_date") or "")

                if status_changed or amt_changed or pr_changed or fcdl_changed:
                    if status_changed:
                        queue_entries.append(
                            FrnStatusChangeQueue(
                                user_id=user_id,
                                frn=rec["frn"],
                                ben=rec["ben"],
                                scope_type=scope_type,
                                scope_value=scope_value,
                                old_status=ex_status,
                                new_status=rec_status,
                                old_amount=float(ex.amount_committed or 0),
                                new_amount=float(rec.get("amount_committed") or 0),
                                entity_name=entity_name,
                                created_at=now,
                                processed=0,
                            )
                        )
                    ex.status = rec_status
                    ex.amount_committed = rec.get("amount_committed")
                    ex.pending_reason = rec.get("pending_reason", "")
                    ex.fcdl_date = rec.get("fcdl_date", "")
                    ex.last_refreshed = now
                    updates += 1
            else:
                rec["last_refreshed"] = now
                inserts.append(AdminFRNSnapshot(**rec))

    if inserts:
        for i in range(0, len(inserts), 1000):
            db.bulk_save_objects(inserts[i:i + 1000])
    if queue_entries:
        for i in range(0, len(queue_entries), 1000):
            db.bulk_save_objects(queue_entries[i:i + 1000])

    db.commit()
    logger.info(
        f"[FRN Sync] Done: {len(inserts)} inserts, {updates} updates, "
        f"{len(queue_entries)} queue entries"
    )
