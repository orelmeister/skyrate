"""
Form 470 Scanner (P2)

Pulls the USAC Form 470 Basic Information dataset (jt8s-3q52) every 15
minutes and upserts each row into the `form470_postings` table. After
ingest, hands the newly-touched ids to the alert matcher so vendor
subscriptions can fire.

Checkpoint strategy:
  - Look up the most recent `vendor_alert_scan_runs.started_at`.
  - Pull rows with `certified_date_time > last_started_at - 1h` to absorb
    any late-arriving data the prior pass missed.
  - First-ever run (no prior scan rows): pull the last 7 days.

Idempotency:
  - UPSERT on `application_number` so re-running the same window is safe.
  - The matcher's UNIQUE constraint dedupes match rows.

All log labels use plain text ([INFO], [WARN], [ERROR]); no emojis.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.vendor_alerts import Form470Posting, VendorAlertScanRun
from .alert_matcher import match_postings

logger = logging.getLogger(__name__)


USAC_FORM_470_URL = "https://opendata.usac.org/resource/jt8s-3q52.json"
USAC_PAGE_LIMIT = 1000
USAC_REQUEST_TIMEOUT = 60
OVERLAP_HOURS = 1
FIRST_RUN_LOOKBACK_DAYS = 7


# ============================================================
# HTTP session
# ============================================================

def _build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=1,
        status_forcelist=[408, 429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=4)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "SkyRate-VendorAlerts/1.0"})
    token = os.getenv("USAC_APP_TOKEN")
    if token:
        session.headers["X-App-Token"] = token
    return session


# ============================================================
# Row coercion
# ============================================================

def _coerce_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    s = str(value).strip()
    # Socrata returns ISO-8601, sometimes with trailing .000.
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _coerce_decimal(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _coerce_str(value: Any, max_len: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if max_len is not None and len(s) > max_len:
        s = s[:max_len]
    return s


def _service_categories_from_row(row: Dict[str, Any]) -> List[str]:
    """USAC encodes service categories in a couple of fields; normalize
    to a list like ["Category 1","Category 2"] for our matcher."""
    out: List[str] = []
    raw = row.get("service_category") or row.get("service_categories")
    if isinstance(raw, list):
        for item in raw:
            s = _coerce_str(item)
            if s:
                out.append(s)
    elif isinstance(raw, str):
        s = _coerce_str(raw)
        if s:
            # Sometimes USAC sends "Category 1, Category 2"
            for piece in s.split(","):
                piece = piece.strip()
                if piece:
                    out.append(piece)
    # Boolean flag fields (defensive - varies between snapshots).
    if row.get("category_1") in ("1", 1, True, "true", "True"):
        if "Category 1" not in out:
            out.append("Category 1")
    if row.get("category_2") in ("1", 1, True, "true", "True"):
        if "Category 2" not in out:
            out.append("Category 2")
    return out


def _service_types_from_row(row: Dict[str, Any]) -> List[str]:
    raw = row.get("service_type") or row.get("service_types") or row.get("service_subtypes")
    if isinstance(raw, list):
        return [s for s in (_coerce_str(x) for x in raw) if s]
    if isinstance(raw, str):
        s = _coerce_str(raw)
        if s:
            return [p.strip() for p in s.split(",") if p.strip()]
    return []


# ============================================================
# Checkpoint
# ============================================================

def _compute_checkpoint(db: Session) -> datetime:
    """Return the lower-bound certified_date filter for this scan."""
    last_run = (
        db.query(VendorAlertScanRun)
        .order_by(VendorAlertScanRun.started_at.desc())
        .first()
    )
    if not last_run:
        return datetime.utcnow() - timedelta(days=FIRST_RUN_LOOKBACK_DAYS)
    return last_run.started_at - timedelta(hours=OVERLAP_HOURS)


# ============================================================
# Fetch
# ============================================================

def _fetch_page(session: requests.Session, since: datetime, offset: int) -> List[Dict[str, Any]]:
    where = f"certified_date_time > '{since.strftime('%Y-%m-%dT%H:%M:%S')}'"
    params = {
        "$where": where,
        "$limit": USAC_PAGE_LIMIT,
        "$offset": offset,
        "$order": "certified_date_time ASC",
    }
    resp = session.get(USAC_FORM_470_URL, params=params, timeout=USAC_REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        return []
    return data


def _fetch_all(since: datetime) -> List[Dict[str, Any]]:
    session = _build_session()
    out: List[Dict[str, Any]] = []
    offset = 0
    while True:
        page = _fetch_page(session, since, offset)
        if not page:
            break
        out.extend(page)
        if len(page) < USAC_PAGE_LIMIT:
            break
        offset += USAC_PAGE_LIMIT
        if offset >= 200_000:
            # Hard safety stop - the USAC delta should never be this large.
            logger.warning("[form470_scanner] aborting paging at offset=%s", offset)
            break
    return out


# ============================================================
# Upsert
# ============================================================

def _row_application_number(row: Dict[str, Any]) -> Optional[str]:
    # USAC has used a couple of column names across snapshots; accept any.
    for key in ("application_number", "form_470_application_number", "form_470_app_no"):
        v = _coerce_str(row.get(key), max_len=64)
        if v:
            return v
    return None


def _upsert_row(db: Session, row: Dict[str, Any]) -> Optional[int]:
    """Insert or update a single posting row. Returns the id of the
    affected row (whether inserted or updated), or None on bad data."""
    app_no = _row_application_number(row)
    if not app_no:
        return None

    existing = (
        db.query(Form470Posting)
        .filter(Form470Posting.application_number == app_no)
        .first()
    )
    now = datetime.utcnow()
    fields = dict(
        ben=_coerce_str(row.get("ben") or row.get("billed_entity_number"), max_len=20),
        applicant_name=_coerce_str(row.get("applicant_name") or row.get("billed_entity_name"), max_len=255),
        state=(_coerce_str(row.get("state") or row.get("billed_entity_state"), max_len=2) or None),
        certified_date=_coerce_datetime(
            row.get("certified_date_time")
            or row.get("certified_date")
            or row.get("posting_date")
        ),
        allowable_contract_date=_coerce_datetime(row.get("allowable_contract_date")),
        total_pre_discount_cost=_coerce_decimal(
            row.get("total_pre_discount_cost")
            or row.get("pre_discount_extended_eligible")
            or row.get("total_pre_discount_amount")
        ),
        service_categories=_service_categories_from_row(row),
        service_types=_service_types_from_row(row),
        applicant_type=_coerce_str(
            row.get("applicant_type") or row.get("billed_entity_type") or row.get("entity_type"),
            max_len=50,
        ),
        rfp_url=_coerce_str(row.get("rfp_url") or row.get("rfp_document_url"), max_len=500),
        raw=row,
        last_synced_at=now,
    )
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        db.flush()
        return existing.id

    posting = Form470Posting(
        application_number=app_no,
        first_seen_at=now,
        **fields,
    )
    db.add(posting)
    db.flush()
    return posting.id


# ============================================================
# Public entry point
# ============================================================

def run_scanner() -> Dict[str, Any]:
    """Run one pass: fetch -> upsert -> match. Always writes a scan run
    row (success or error). Returns a summary dict."""
    db = SessionLocal()

    # Compute the checkpoint BEFORE we insert this run's row, otherwise
    # the first-ever run would see its own placeholder and fall back to
    # the overlap window instead of the 7-day initial lookback.
    since = _compute_checkpoint(db)

    run = VendorAlertScanRun(started_at=datetime.utcnow())
    db.add(run)
    db.commit()
    db.refresh(run)

    summary: Dict[str, Any] = {
        "rows_pulled": 0,
        "rows_inserted": 0,
        "matches_created": 0,
        "error": None,
    }

    try:
        logger.info("[form470_scanner] checkpoint since=%s", since.isoformat())

        rows = _fetch_all(since)
        summary["rows_pulled"] = len(rows)
        logger.info("[form470_scanner] [INFO] pulled %s rows", len(rows))

        touched_ids: List[int] = []
        inserted = 0
        for row in rows:
            try:
                # Detect new-vs-updated by checking pre-existence.
                app_no = _row_application_number(row)
                if not app_no:
                    continue
                pre_exists = (
                    db.query(Form470Posting.id)
                    .filter(Form470Posting.application_number == app_no)
                    .first()
                )
                pid = _upsert_row(db, row)
                if pid is None:
                    continue
                if pre_exists is None:
                    inserted += 1
                touched_ids.append(pid)
            except Exception as e:
                db.rollback()
                logger.error("[form470_scanner] [ERROR] row failed: %s", e)
        db.commit()

        summary["rows_inserted"] = inserted

        if touched_ids:
            try:
                matches_created = match_postings(touched_ids, db=db)
                summary["matches_created"] = matches_created
            except Exception as e:
                logger.error("[form470_scanner] [ERROR] match_postings failed: %s", e)
                summary["matches_created"] = 0

        run.finished_at = datetime.utcnow()
        run.rows_pulled = summary["rows_pulled"]
        run.matches_created = summary["matches_created"]
        run.error = None
        db.commit()

        logger.info(
            "[form470_scanner] [INFO] done pulled=%s inserted=%s matches=%s",
            summary["rows_pulled"],
            summary["rows_inserted"],
            summary["matches_created"],
        )
    except Exception as e:
        logger.exception("[form470_scanner] [ERROR] scan failed")
        summary["error"] = str(e)
        try:
            run.finished_at = datetime.utcnow()
            run.error = str(e)[:65000]
            db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()

    return summary
