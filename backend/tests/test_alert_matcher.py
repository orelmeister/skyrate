"""Tests for the P2 vendor alert matcher.

Covers:
- Empty filter (all wildcards): would match everything, but P1 endpoint
  rejects creating that, so we test directly against the matcher.
- State match / state mismatch.
- Service category intersection.
- Multi-criteria AND.
- Applicant type normalization map.
- Min/max amount bounds.
- Watchlist BEN hit / miss.
- UNIQUE dedupe: re-running the matcher does not raise and does not
  create duplicate match rows.

Run from skyrate.ai/backend:
  python -m pytest tests/test_alert_matcher.py -v
"""
import os
import sys
import pathlib

_TEST_DB = pathlib.Path(__file__).parent / "_test_alert_matcher.db"
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

from app.core.database import SessionLocal, Base, engine  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.vendor import VendorProfile  # noqa: E402
from app.models.vendor_alerts import (  # noqa: E402
    Form470Posting,
    VendorAlertSubscription,
    VendorAlertMatch,
)
from app.services.alert_matcher import match_postings, _subscription_matches  # noqa: E402


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


def _ensure_vendor(email: str) -> VendorProfile:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                password_hash="x",
                role="vendor",
                first_name="V",
                last_name="T",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(user)
            db.flush()
        profile = db.query(VendorProfile).filter(VendorProfile.user_id == user.id).first()
        if not profile:
            profile = VendorProfile(user_id=user.id, company_name="X", contact_name="Y")
            db.add(profile)
            db.flush()
        db.commit()
        db.refresh(profile)
        return profile
    finally:
        db.close()


_VENDOR = _ensure_vendor("matcher_vendor@example.com")


@pytest.fixture(autouse=True)
def _wipe():
    db = SessionLocal()
    try:
        db.query(VendorAlertMatch).delete()
        db.query(VendorAlertSubscription).delete()
        db.query(Form470Posting).delete()
        db.commit()
    finally:
        db.close()
    yield


def _make_posting(**kw) -> Form470Posting:
    db = SessionLocal()
    try:
        p = Form470Posting(
            application_number=kw.pop("application_number"),
            ben=kw.pop("ben", "12345"),
            applicant_name=kw.pop("applicant_name", "Test School"),
            state=kw.pop("state", "TX"),
            certified_date=kw.pop("certified_date", datetime.utcnow()),
            total_pre_discount_cost=kw.pop("total_pre_discount_cost", None),
            service_categories=kw.pop("service_categories", ["Category 1"]),
            service_types=kw.pop("service_types", []),
            applicant_type=kw.pop("applicant_type", "School District"),
            **kw,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p
    finally:
        db.close()


def _make_sub(**kw) -> VendorAlertSubscription:
    db = SessionLocal()
    try:
        sub = VendorAlertSubscription(
            vendor_profile_id=_VENDOR.id,
            name=kw.pop("name", "test"),
            mode=kw.pop("mode", "filter"),
            channels={"email": True, "sms": False, "push": False, "in_app": False},
            active=kw.pop("active", True),
            **kw,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub
    finally:
        db.close()


# ---------- pure predicate tests ----------

def test_state_match():
    sub = _make_sub(states=["TX"])
    posting = _make_posting(application_number="A1", state="TX")
    assert _subscription_matches(sub, posting) is True


def test_state_mismatch():
    sub = _make_sub(states=["CA"])
    posting = _make_posting(application_number="A2", state="TX")
    assert _subscription_matches(sub, posting) is False


def test_service_category_intersection():
    sub = _make_sub(states=["TX"], service_categories=["Category 2"])
    miss = _make_posting(application_number="B1", service_categories=["Category 1"])
    assert _subscription_matches(sub, miss) is False
    hit = _make_posting(application_number="B2", service_categories=["Category 1", "Category 2"])
    assert _subscription_matches(sub, hit) is True


def test_multi_criteria_and():
    sub = _make_sub(states=["TX"], service_categories=["Category 1"], min_amount=10000)
    # Wrong state.
    p1 = _make_posting(application_number="C1", state="CA", service_categories=["Category 1"], total_pre_discount_cost=20000)
    assert _subscription_matches(sub, p1) is False
    # Below min_amount.
    p2 = _make_posting(application_number="C2", state="TX", service_categories=["Category 1"], total_pre_discount_cost=5000)
    assert _subscription_matches(sub, p2) is False
    # All good.
    p3 = _make_posting(application_number="C3", state="TX", service_categories=["Category 1"], total_pre_discount_cost=20000)
    assert _subscription_matches(sub, p3) is True


def test_applicant_type_normalization():
    sub = _make_sub(states=["TX"], applicant_types=["library"])
    sch = _make_posting(application_number="D1", state="TX", applicant_type="School District")
    assert _subscription_matches(sub, sch) is False
    lib = _make_posting(application_number="D2", state="TX", applicant_type="Library System")
    assert _subscription_matches(sub, lib) is True


def test_watchlist_hit_and_miss():
    sub = _make_sub(mode="watchlist", watchlist_bens=["99999", "11111"])
    hit = _make_posting(application_number="E1", ben="11111")
    assert _subscription_matches(sub, hit) is True
    miss = _make_posting(application_number="E2", ben="22222")
    assert _subscription_matches(sub, miss) is False


def test_empty_filter_matches_everything_via_predicate():
    # All criteria empty -> every posting passes (the API guards against
    # ever saving such a subscription, but the matcher itself should not
    # crash).
    sub = _make_sub(mode="filter")
    p = _make_posting(application_number="F1")
    assert _subscription_matches(sub, p) is True


# ---------- match_postings: insert + dedupe ----------

def test_match_postings_inserts_rows():
    sub = _make_sub(states=["TX"])
    p = _make_posting(application_number="G1", state="TX")
    n = match_postings([p.id])
    assert n == 1
    db = SessionLocal()
    try:
        rows = db.query(VendorAlertMatch).all()
        assert len(rows) == 1
        assert rows[0].subscription_id == sub.id
        assert rows[0].form_470_application_number == "G1"
    finally:
        db.close()


def test_match_postings_dedupes_on_rerun():
    _make_sub(states=["TX"])
    p = _make_posting(application_number="H1", state="TX")
    first = match_postings([p.id])
    second = match_postings([p.id])
    assert first == 1
    assert second == 0  # UNIQUE constraint blocked second insert
    db = SessionLocal()
    try:
        assert db.query(VendorAlertMatch).count() == 1
    finally:
        db.close()


def test_inactive_subscription_skipped():
    _make_sub(states=["TX"], active=False)
    p = _make_posting(application_number="I1", state="TX")
    assert match_postings([p.id]) == 0
