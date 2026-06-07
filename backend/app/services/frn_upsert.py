"""
Shared FRN snapshot upsert helper.

Single canonical implementation used by every code path that writes to
`admin_frn_snapshots`. Previously this logic was duplicated in 4 places
(consultant.py background refresh, scheduler_service.py admin refresh +
background_refresh_portfolio, frn_sync_service._sync_bens_to_snapshot),
which caused class-of-bug situations where a field added to one writer
silently stayed NULL on the others.

Usage:
    from app.services.frn_upsert import upsert_frn_snapshots

    result = upsert_frn_snapshots(
        db,
        frn_records,                  # list[dict] — see expected keys below
        scope_type="crn" | "ben" | "spin",
        scope_value="...",            # what to record in FrnStatusChangeQueue
        queue_status_changes=True,
    )
    # result -> {"inserts": int, "updates": int, "alerts": int}

Expected keys in each rec dict (defaults are tolerated for missing keys):
    frn, status, funding_year, amount_requested, amount_committed,
    service_type, organization_name, ben, user_id, user_email, source,
    fcdl_date, pending_reason, spin, contract_number
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


# Fields that participate in the dirty-diff. If any change, the row is updated.
_DIFF_FIELDS = ("status", "amount_committed", "pending_reason", "fcdl_date")


def upsert_frn_snapshots(
    db,
    frn_records: list,
    *,
    scope_type: str = "ben",
    scope_value: str = "",
    queue_status_changes: bool = True,
) -> dict:
    """
    Insert-or-update a batch of FRN snapshot records into `admin_frn_snapshots`.

    Returns {"inserts": int, "updates": int, "alerts": int}.
    """
    from ..models.admin_frn_snapshot import AdminFRNSnapshot
    from ..models.frn_status_change import FrnStatusChangeQueue

    if not frn_records:
        return {"inserts": 0, "updates": 0, "alerts": 0}

    now = datetime.utcnow()

    # Fetch existing rows for diffing. Key on (ben, frn).
    existing_map = {}
    bens = list({str(r.get("ben", "")) for r in frn_records if r.get("ben")})
    for i in range(0, len(bens), 200):
        chunk = bens[i:i + 200]
        rows = db.query(AdminFRNSnapshot).filter(AdminFRNSnapshot.ben.in_(chunk)).all()
        for r in rows:
            existing_map[(r.ben, r.frn)] = r

    inserts = []
    alerts = []
    updates = 0

    for rec in frn_records:
        ben = str(rec.get("ben", ""))
        frn = str(rec.get("frn", ""))
        if not frn:
            continue
        key = (ben, frn)
        rec_status = str(rec.get("status") or "Unknown")
        rec_amt = float(rec.get("amount_committed") or 0)
        rec_pr = rec.get("pending_reason") or ""
        rec_fcdl = rec.get("fcdl_date") or ""

        if key in existing_map:
            ex = existing_map[key]
            ex_status = str(ex.status) if ex.status else "Unknown"
            ex_amt = float(ex.amount_committed or 0)
            ex_pr = ex.pending_reason or ""
            ex_fcdl = ex.fcdl_date or ""

            status_changed = ex_status != rec_status
            amt_changed = ex_amt != rec_amt
            pr_changed = ex_pr != rec_pr
            fcdl_changed = ex_fcdl != rec_fcdl

            if status_changed or amt_changed or pr_changed or fcdl_changed:
                if status_changed and queue_status_changes:
                    # Resolve all owners for this BEN/FRN/SPIN and insert a row per owner
                    from .frn_ownership import resolve_owners
                    rec_spin = rec.get("spin") or ""
                    owners = resolve_owners(db, ben=ben, frn=frn, spin=rec_spin)
                    for owner_id in owners:
                        alerts.append(
                            FrnStatusChangeQueue(
                                user_id=owner_id,
                                frn=frn,
                                ben=ben,
                                scope_type=scope_type,
                                scope_value=scope_value or ben,
                                old_status=ex_status,
                                new_status=rec_status,
                                old_amount=ex_amt,
                                new_amount=rec_amt,
                                entity_name=rec.get("organization_name"),
                                created_at=now,
                                processed=0,
                            )
                        )
                ex.status = rec_status
                ex.amount_committed = rec_amt
                ex.pending_reason = rec_pr
                ex.fcdl_date = rec_fcdl
                ex.last_refreshed = now
                # Backfill spin/contract_number if newly available
                rec_spin = rec.get("spin") or ""
                rec_cn = rec.get("contract_number") or ""
                if rec_spin and not ex.spin:
                    ex.spin = rec_spin
                if rec_cn and not ex.contract_number:
                    ex.contract_number = rec_cn
                updates += 1
        else:
            rec_copy = dict(rec)
            rec_copy.setdefault("source", "consultant")
            rec_copy["ben"] = ben
            rec_copy["frn"] = frn
            rec_copy["status"] = rec_status
            rec_copy["amount_committed"] = rec_amt
            rec_copy["pending_reason"] = rec_pr
            rec_copy["fcdl_date"] = rec_fcdl
            rec_copy["last_refreshed"] = now
            inserts.append(AdminFRNSnapshot(**rec_copy))

    # Commit dirty updates first
    try:
        db.flush()
        db.commit()
    except Exception as flush_err:
        logger.warning(f"[frn_upsert] flush/commit updates failed: {flush_err}")
        try:
            db.rollback()
        except Exception:
            pass

    # Bulk insert new rows in chunks
    insert_ok = 0
    for i in range(0, len(inserts), 500):
        chunk = inserts[i:i + 500]
        try:
            db.bulk_save_objects(chunk)
            db.commit()
            insert_ok += len(chunk)
        except Exception as ins_err:
            logger.warning(f"[frn_upsert] insert batch {i} failed: {ins_err}")
            try:
                db.rollback()
            except Exception:
                pass

    # Bulk insert alert queue rows in chunks
    alert_ok = 0
    for i in range(0, len(alerts), 500):
        chunk = alerts[i:i + 500]
        try:
            db.bulk_save_objects(chunk)
            db.commit()
            alert_ok += len(chunk)
        except Exception as chg_err:
            logger.warning(f"[frn_upsert] alert batch {i} failed: {chg_err}")
            try:
                db.rollback()
            except Exception:
                pass

    return {"inserts": insert_ok, "updates": updates, "alerts": alert_ok}


def build_rec_from_usac_frn(
    frn: dict,
    *,
    ben: str,
    entity_name: str,
    user_id,
    user_email: str,
    source: str = "consultant",
) -> dict:
    """
    Helper: convert a raw USAC FRN dict (from get_frn_status_batch results) into
    the rec shape expected by upsert_frn_snapshots().
    """
    return {
        "frn": frn.get("frn", ""),
        "status": frn.get("status", "Unknown"),
        "funding_year": str(frn.get("funding_year", "")),
        "amount_requested": float(frn.get("commitment_amount") or frn.get("amount") or 0),
        "amount_committed": float(frn.get("disbursed_amount") or 0),
        "service_type": frn.get("service_type", ""),
        "organization_name": entity_name,
        "ben": str(ben),
        "user_id": user_id,
        "user_email": user_email,
        "source": source,
        "fcdl_date": frn.get("fcdl_date", ""),
        "pending_reason": frn.get("pending_reason", ""),
        "spin": frn.get("spin_name", "") or frn.get("spin", "") or "",
        "contract_number": frn.get("contract_number", "") or "",
    }
