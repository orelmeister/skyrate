"""Tests for the P2 Form 470 scanner.

Mocks the USAC HTTP layer and verifies:
- Rows upsert into form470_postings
- A scan-run row is written on success (with finished_at + counts)
- Re-running the scanner with the same payload is idempotent
- Matches fire when a posting matches an active subscription
- First-ever run uses a 7-day lookback; subsequent runs use the previous
  scan's started_at - 1h.

Run from skyrate.ai/backend:
  python -m pytest tests/test_form470_scanner.py -v
"""
import os
import sys
import pathlib

_TEST_DB = pathlib.Path(__file__).parent / "_test_form470_scanner.db"
if _TEST_DB.exists():
    try:
        _TEST_DB.unlink()
    except OSError:
        pass
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-for-pytest-DO-NOT-USE")
os.environ.setdefault("ENVIRONMENT", "development")

_BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

import pytest  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402
from unittest import mock  # noqa: E402

from app.core.database import SessionLocal, Base, engine  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.vendor import VendorProfile  # noqa: E402
from app.models.vendor_alerts import (  # noqa: E402
    Form470Posting,
    VendorAlertScanRun,
    VendorAlertSubscription,
    VendorAlertMatch,
)
from app.services import form470_scanner as scanner_mod  # noqa: E402


def _create_all_skip_dupes():
    seen = set()
    for tbl in Base.metadata.tables.values():
        for ix in list(tbl.indexes):
            if ix.name in seen:
                tbl.indexes.discard(ix)
            else:
                seen.add(ix.name)
    Base.metadata.create_all(bind=engine)


_create_all_skip_dupes()


def _ensure_vendor() -> VendorProfile:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "scanner_vendor@example.com").first()
        if not user:
            user = User(
                email="scanner_vendor@example.com",
                password_hash="x",
                role="vendor",
                first_name="S",
                last_name="V",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(user)
            db.flush()
        prof = db.query(VendorProfile).filter(VendorProfile.user_id == user.id).first()
        if not prof:
            prof = VendorProfile(user_id=user.id, company_name="X", contact_name="Y")
            db.add(prof)
            db.flush()
        db.commit()
        db.refresh(prof)
        return prof
    finally:
        db.close()


_VENDOR = _ensure_vendor()


@pytest.fixture(autouse=True)
def _wipe():
    db = SessionLocal()
    try:
        db.query(VendorAlertMatch).delete()
        db.query(VendorAlertSubscription).delete()
        db.query(VendorAlertScanRun).delete()
        db.query(Form470Posting).delete()
        db.commit()
    finally:
        db.close()
    yield


def _usac_row(app_no: str, **kw) -> dict:
    return {
        "application_number": app_no,
        "ben": kw.get("ben", "12345"),
        "applicant_name": kw.get("applicant_name", "Foo School District"),
        "state": kw.get("state", "TX"),
        "certified_date_time": kw.get("certified_date_time", "2026-05-10T12:00:00.000"),
        "total_pre_discount_cost": kw.get("total_pre_discount_cost", "10000.00"),
        "service_category": kw.get("service_category", ["Category 1"]),
        "applicant_type": kw.get("applicant_type", "School District"),
    }


def _patch_fetch(rows: list):
    """Patch the scanner's network layer to return `rows` on the first
    call and an empty list afterward (so paging terminates)."""
    state = {"call": 0}

    def fake_fetch_all(since):
        state["call"] += 1
        return list(rows) if state["call"] == 1 else []

    return mock.patch.object(scanner_mod, "_fetch_all", side_effect=fake_fetch_all)


def test_scanner_inserts_rows_and_writes_scan_run():
    rows = [
        _usac_row("APP-1", state="TX"),
        _usac_row("APP-2", state="CA"),
    ]
    with _patch_fetch(rows):
        summary = scanner_mod.run_scanner()

    assert summary["error"] is None
    assert summary["rows_pulled"] == 2
    assert summary["rows_inserted"] == 2

    db = SessionLocal()
    try:
        postings = db.query(Form470Posting).order_by(Form470Posting.application_number).all()
        assert [p.application_number for p in postings] == ["APP-1", "APP-2"]
        assert postings[0].state == "TX"
        assert postings[0].applicant_type == "School District"

        runs = db.query(VendorAlertScanRun).all()
        assert len(runs) == 1
        assert runs[0].finished_at is not None
        assert runs[0].rows_pulled == 2
        assert runs[0].error is None
    finally:
        db.close()


def test_scanner_is_idempotent_on_rerun():
    rows = [_usac_row("APP-IDEMP", state="TX")]
    with _patch_fetch(rows):
        s1 = scanner_mod.run_scanner()
    with _patch_fetch(rows):
        s2 = scanner_mod.run_scanner()

    assert s1["rows_inserted"] == 1
    assert s2["rows_inserted"] == 0  # already existed -> upsert, not insert

    db = SessionLocal()
    try:
        assert db.query(Form470Posting).count() == 1
        # two scan runs both succeeded
        assert db.query(VendorAlertScanRun).count() == 2
    finally:
        db.close()


def test_scanner_fires_matches_for_active_subscription():
    db = SessionLocal()
    try:
        sub = VendorAlertSubscription(
            vendor_profile_id=_VENDOR.id,
            name="TX K-12",
            mode="filter",
            states=["TX"],
            service_categories=["Category 1"],
            channels={"email": True, "sms": False, "push": False, "in_app": False},
            active=True,
        )
        db.add(sub)
        db.commit()
        sub_id = sub.id
    finally:
        db.close()

    rows = [
        _usac_row("APP-MATCH", state="TX"),
        _usac_row("APP-NOMATCH", state="CA"),
    ]
    with _patch_fetch(rows):
        summary = scanner_mod.run_scanner()

    assert summary["matches_created"] == 1

    db = SessionLocal()
    try:
        matches = db.query(VendorAlertMatch).all()
        assert len(matches) == 1
        assert matches[0].subscription_id == sub_id
        assert matches[0].form_470_application_number == "APP-MATCH"
    finally:
        db.close()


def test_first_run_uses_seven_day_lookback():
    captured = {}

    def fake_fetch_all(since):
        captured["since"] = since
        return []

    with mock.patch.object(scanner_mod, "_fetch_all", side_effect=fake_fetch_all):
        scanner_mod.run_scanner()

    now = datetime.utcnow()
    assert captured["since"] is not None
    delta = now - captured["since"]
    # Within ~7 days (allow some slack).
    assert timedelta(days=6, hours=23) <= delta <= timedelta(days=7, hours=1)


def test_subsequent_run_uses_overlap_checkpoint():
    # First run: must return at least 1 row so postings table is non-empty,
    # otherwise the checkpoint always falls back to 7-day lookback.
    sample_row = _usac_row("990000001")
    with _patch_fetch([sample_row]):
        scanner_mod.run_scanner()

    # Second run: should use last_started_at - 1h as the since filter.
    captured = {}

    def fake_fetch_all(since):
        captured["since"] = since
        return []

    db = SessionLocal()
    try:
        first_run = db.query(VendorAlertScanRun).order_by(VendorAlertScanRun.started_at.desc()).first()
        first_started = first_run.started_at
    finally:
        db.close()

    with mock.patch.object(scanner_mod, "_fetch_all", side_effect=fake_fetch_all):
        scanner_mod.run_scanner()

    assert captured["since"] is not None
    # Expect since == first_started - 1h (within a second of slack).
    expected = first_started - timedelta(hours=1)
    diff = abs((captured["since"] - expected).total_seconds())
    assert diff < 2.0
