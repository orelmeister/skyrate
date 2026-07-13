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
    fcdl_date, pending_reason, spin, spin_name, contract_number
"""

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


# Fields that participate in the dirty-diff. If any change, the row is updated.
_DIFF_FIELDS = ("status", "amount_committed", "pending_reason", "fcdl_date")


def _parse_fcdl_date(raw) -> "datetime | None":
    """
    Parse a USAC FCDL date (the true funding-decision date) into a datetime.
    USAC returns ISO-ish strings ("2024-05-03T00:00:00.000" or "2024-05-03").
    Returns None if unparseable/empty. Used as the true status-change date so
    historical events don't render as "just now".
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    datepart = s.split("T")[0]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(datepart, fmt)
        except (ValueError, TypeError):
            continue
    return None


def _deduplicate_frn_records(frn_records: list) -> list:
    """
    Deduplicate incoming FRN records by (ben, frn) key.
    When duplicates exist, pick the record with the most authoritative status.
    Priority: Funded/Committed/Denied > Pending/Under Review > Unknown/empty.
    """
    _STATUS_PRIORITY = {
        "funded": 10,
        "committed": 9,
        "denied": 8,
        "denied - final": 8,
        "cancelled": 7,
        "under review": 5,
        "pending": 4,
        "wave ready": 3,
        "unknown": 1,
        "": 0,
    }

    def _score(rec):
        s = (rec.get("status") or "").strip().lower()
        for key, val in _STATUS_PRIORITY.items():
            if key in s:
                return val
        return 2  # default for unrecognized statuses

    seen = {}  # (ben, frn) -> best record
    for rec in frn_records:
        ben = str(rec.get("ben", ""))
        frn = str(rec.get("frn", ""))
        if not frn:
            continue
        key = (ben, frn)
        if key not in seen or _score(rec) > _score(seen[key]):
            seen[key] = rec

    return list(seen.values())


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

    # Deduplicate incoming records to prevent flapping from Socrata duplicates
    frn_records = _deduplicate_frn_records(frn_records)

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
                                status_change_date=_parse_fcdl_date(rec_fcdl),
                                processed=0,
                            )
                        )
                ex.status = rec_status
                ex.amount_committed = rec_amt
                ex.pending_reason = rec_pr
                ex.fcdl_date = rec_fcdl
                ex.last_refreshed = now
                # Backfill spin/spin_name/contract_number if newly available.
                # Treat numeric-looking values as authoritative SPIN numbers and
                # always overwrite the spin column when we get one, since older
                # rows historically stored the service-provider NAME here.
                rec_spin = rec.get("spin") or ""
                rec_spin_name = rec.get("spin_name") or ""
                rec_cn = rec.get("contract_number") or ""
                if rec_spin:
                    if (not ex.spin) or (str(rec_spin).isdigit() and not str(ex.spin or "").isdigit()):
                        ex.spin = rec_spin
                if rec_spin_name and not ex.spin_name:
                    ex.spin_name = rec_spin_name
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


def _pilot_rec_to_columns(f: dict, *, user_id, user_email, spin) -> dict:
    """Map a get_pilot_frns_by_spin() FRN dict to PilotFRNSnapshot columns."""
    return {
        "frn": str(f.get("frn", "")),
        "pilot_471_number": f.get("pilot_471_number"),
        "pilot_471_nickname": f.get("pilot_471_nickname"),
        "status": str(f.get("status") or "Unknown"),
        "application_status": f.get("application_status"),
        "window_status": f.get("window_status"),
        "amount_requested": float(f.get("requested_amount") or 0),
        "amount_committed": float(f.get("committed_amount") or 0),
        "discount_rate": float(f.get("discount_rate") or 0),
        "service_type": f.get("service_type"),
        "organization_name": f.get("entity_name"),
        "entity_type": f.get("entity_type"),
        "ben": str(f.get("ben") or ""),
        "state": f.get("state"),
        "city": f.get("city"),
        "user_id": user_id,
        "user_email": user_email,
        "spin": str(f.get("spin") or spin or ""),
        "spin_name": f.get("spin_name"),
        "fcdl_date": f.get("fcdl_date"),
        "last_updated": f.get("last_updated"),
        "service_delivery_deadline": f.get("service_delivery_deadline"),
        "invoice_deadline": f.get("invoice_deadline"),
        "contract_award_date": f.get("contract_award_date"),
        "contract_expiration_date": f.get("contract_expiration_date"),
        "fcc_form_470_number": f.get("fcc_form_470_number"),
        "invoicing_method": f.get("invoicing_method"),
        "line_item_count": int(f.get("line_item_count") or 0),
    }


def upsert_pilot_snapshots(
    db,
    pilot_frns: list,
    *,
    user_id,
    user_email: str = "",
    spin: str = "",
    queue_status_changes: bool = True,
) -> dict:
    """
    Insert-or-update a batch of Cybersecurity Pilot FRN snapshots for one vendor
    SPIN into `pilot_frn_snapshots`. Diffs status / application_status /
    amount_committed / fcdl_date and, on a status change, queues a
    FrnStatusChangeQueue row for the owning vendor user — feeding the SAME
    alert/digest system used for E-Rate FRNs.

    Returns {"inserts": int, "updates": int, "alerts": int}.
    """
    from ..models.pilot_frn_snapshot import PilotFRNSnapshot
    from ..models.frn_status_change import FrnStatusChangeQueue

    if not pilot_frns:
        return {"inserts": 0, "updates": 0, "alerts": 0}

    now = datetime.utcnow()

    # Existing rows for this SPIN, keyed by frn.
    existing_map = {}
    if spin:
        for r in db.query(PilotFRNSnapshot).filter(PilotFRNSnapshot.spin == str(spin)).all():
            existing_map[str(r.frn)] = r

    inserts = []
    alerts = []
    updates = 0

    for f in pilot_frns:
        frn = str(f.get("frn", ""))
        if not frn:
            continue
        cols = _pilot_rec_to_columns(f, user_id=user_id, user_email=user_email, spin=spin)
        rec_status = cols["status"]
        rec_appstatus = cols["application_status"] or ""
        rec_amt = cols["amount_committed"]
        rec_fcdl = cols["fcdl_date"] or ""

        ex = existing_map.get(frn)
        if ex is not None:
            ex_status = str(ex.status) if ex.status else "Unknown"
            ex_appstatus = ex.application_status or ""
            ex_amt = float(ex.amount_committed or 0)
            ex_fcdl = ex.fcdl_date or ""

            status_changed = ex_status != rec_status
            if status_changed or ex_appstatus != rec_appstatus or ex_amt != rec_amt or ex_fcdl != rec_fcdl:
                if status_changed and queue_status_changes and user_id:
                    alerts.append(
                        FrnStatusChangeQueue(
                            user_id=user_id,
                            frn=frn,
                            ben=cols["ben"],
                            scope_type="pilot_spin",
                            scope_value=str(spin),
                            old_status=ex_status,
                            new_status=rec_status,
                            old_amount=ex_amt,
                            new_amount=rec_amt,
                            entity_name=cols["organization_name"],
                            created_at=now,
                            status_change_date=_parse_fcdl_date(rec_fcdl),
                            processed=0,
                        )
                    )
                for k, v in cols.items():
                    setattr(ex, k, v)
                ex.last_refreshed = now
                updates += 1
        else:
            cols["last_refreshed"] = now
            inserts.append(PilotFRNSnapshot(**cols))

    try:
        db.flush()
        db.commit()
    except Exception as flush_err:
        logger.warning(f"[pilot_upsert] flush/commit updates failed: {flush_err}")
        try:
            db.rollback()
        except Exception:
            pass

    insert_ok = 0
    for i in range(0, len(inserts), 500):
        chunk = inserts[i:i + 500]
        try:
            db.bulk_save_objects(chunk)
            db.commit()
            insert_ok += len(chunk)
        except Exception as ins_err:
            logger.warning(f"[pilot_upsert] insert batch {i} failed: {ins_err}")
            try:
                db.rollback()
            except Exception:
                pass

    alert_ok = 0
    for i in range(0, len(alerts), 500):
        chunk = alerts[i:i + 500]
        try:
            db.bulk_save_objects(chunk)
            db.commit()
            alert_ok += len(chunk)
        except Exception as chg_err:
            logger.warning(f"[pilot_upsert] alert batch {i} failed: {chg_err}")
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
        # Prefer the reconstructed post-discount requested amount (non-zero even
        # for Denied/Cancelled FRNs); fall back to the committed amount for
        # older callers that don't emit requested_amount.
        "amount_requested": float(frn.get("requested_amount") or frn.get("commitment_amount") or frn.get("amount") or 0),
        "amount_committed": float(frn.get("disbursed_amount") or 0),
        "service_type": frn.get("service_type", ""),
        "organization_name": entity_name,
        "ben": str(ben),
        "user_id": user_id,
        "user_email": user_email,
        "source": source,
        "fcdl_date": frn.get("fcdl_date", ""),
        "pending_reason": frn.get("pending_reason", ""),
        # Store SPIN NUMBER and SPIN NAME in separate columns so search can
        # match either. Historically these were collapsed into one column
        # (preferring the name) which broke SPIN-by-number search.
        "spin": frn.get("spin", "") or "",
        "spin_name": frn.get("spin_name", "") or "",
        "contract_number": frn.get("contract_number", "") or "",
    }
