"""Tests for the P1 Vendor Alert Subscriptions endpoints.

Covers:
- Filter subscription create happy path
- Watchlist subscription create happy path
- Reject empty filter subscription (no criteria)
- Reject watchlist without BENs
- Reject SMS-enabled without phone
- Ownership isolation (vendor B cannot read/update/delete vendor A's row)
- List + patch + delete round trip
- Push subscription + in-app notification mark-read smoke
- Preview endpoint returns P2 stub

Run from skyrate.ai/backend:
  python -m pytest tests/test_vendor_alerts.py -v
"""
import os
import sys
import pathlib

# Throwaway sqlite file isolated from dev DB.
_TEST_DB = pathlib.Path(__file__).parent / "_test_vendor_alerts.db"
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
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api.v1.vendor import router as vendor_router  # noqa: E402
from app.core.database import SessionLocal, Base, engine  # noqa: E402
from app.core.security import get_current_user  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.vendor import VendorProfile  # noqa: E402
from app.models.vendor_alerts import (  # noqa: E402
    VendorAlertSubscription,
    VendorInAppNotification,
)


# Build a minimal app that mounts ONLY the vendor router. This avoids
# importing app.main, which would register every model on Base (including
# prediction.py, whose duplicate `ix_predicted_leads_manufacturer` index
# breaks sqlite create_all).
app = FastAPI()
app.include_router(vendor_router, prefix="/api/v1")


def _create_all_skip_dupes():
    """Workaround: prediction.py declares `manufacturer = Column(..., index=True)`
    *and* `Index("ix_predicted_leads_manufacturer", "manufacturer")` which sqlite
    rejects as a duplicate during a single create_all sweep. Drop one before
    creating."""
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
                password_hash="not-used-in-tests",
                role="vendor",
                first_name="Vendor",
                last_name="Test",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(user)
            db.flush()
        profile = db.query(VendorProfile).filter(
            VendorProfile.user_id == user.id
        ).first()
        if not profile:
            profile = VendorProfile(
                user_id=user.id,
                company_name=f"{email} Co",
                contact_name="Vendor Test",
            )
            db.add(profile)
            db.flush()
        db.commit()
        db.refresh(profile)
        return profile
    finally:
        db.close()


# Pre-create two vendors so tests can swap who's "logged in".
_VENDOR_A = _ensure_vendor("vendor_a@example.com")
_VENDOR_B = _ensure_vendor("vendor_b@example.com")
_VENDOR_A_USER_ID = _VENDOR_A.user_id
_VENDOR_B_USER_ID = _VENDOR_B.user_id


_current_user_id = {"id": _VENDOR_A_USER_ID}


def _fake_get_current_user():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == _current_user_id["id"]).first()
        # Detach so the dependency caller can use it after session closes.
        db.expunge(user)
        return user
    finally:
        db.close()


app.dependency_overrides[get_current_user] = _fake_get_current_user


@pytest.fixture(autouse=True)
def _reset_to_vendor_a():
    _current_user_id["id"] = _VENDOR_A_USER_ID
    yield


@pytest.fixture(autouse=True)
def _wipe_subscriptions():
    db = SessionLocal()
    try:
        db.query(VendorInAppNotification).delete()
        db.query(VendorAlertSubscription).delete()
        db.commit()
    finally:
        db.close()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def _as_vendor_b():
    _current_user_id["id"] = _VENDOR_B_USER_ID


def _as_vendor_a():
    _current_user_id["id"] = _VENDOR_A_USER_ID


# ---------- happy paths ----------

def test_create_filter_subscription_happy_path(client):
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "TX K-12 Cat 1",
        "mode": "filter",
        "states": ["TX"],
        "service_categories": ["Category 1"],
        "channels": {"email": True, "sms": False, "push": False, "in_app": True},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    sub = body["subscription"]
    assert sub["mode"] == "filter"
    assert sub["states"] == ["TX"]
    assert sub["channels"]["email"] is True
    assert sub["channels"]["sms"] is False
    # email should default to caller's account email
    assert sub["email"] == "vendor_a@example.com"


def test_create_watchlist_subscription_happy_path(client):
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "My BENs",
        "mode": "watchlist",
        "watchlist_bens": ["12345", "67890"],
        "channels": {"email": True, "sms": False, "push": False, "in_app": False},
    })
    assert r.status_code == 200, r.text
    sub = r.json()["subscription"]
    assert sub["mode"] == "watchlist"
    assert sub["watchlist_bens"] == ["12345", "67890"]


# ---------- validation rejections ----------

def test_reject_empty_filter_subscription(client):
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "Empty",
        "mode": "filter",
        "channels": {"email": True, "sms": False, "push": False, "in_app": False},
    })
    assert r.status_code == 400, r.text
    assert "filter" in r.json()["detail"].lower()


def test_reject_watchlist_without_bens(client):
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "Bad watchlist",
        "mode": "watchlist",
        "watchlist_bens": [],
        "channels": {"email": True, "sms": False, "push": False, "in_app": False},
    })
    assert r.status_code == 400, r.text
    assert "watchlist_bens" in r.json()["detail"]


def test_reject_sms_enabled_without_phone(client):
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "SMS no phone",
        "mode": "filter",
        "states": ["CA"],
        "channels": {"email": True, "sms": True, "push": False, "in_app": False},
    })
    assert r.status_code == 400, r.text
    assert "phone_e164" in r.json()["detail"]


# ---------- ownership ----------

def test_other_vendor_cannot_read_update_or_delete(client):
    # Vendor A creates a subscription.
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "A's alert",
        "mode": "filter",
        "states": ["NY"],
        "channels": {"email": True, "sms": False, "push": False, "in_app": False},
    })
    assert r.status_code == 200
    sub_id = r.json()["subscription"]["id"]

    # Vendor B should see nothing in list.
    _as_vendor_b()
    r_list = client.get("/api/v1/vendor/alerts")
    assert r_list.status_code == 200
    assert r_list.json()["subscriptions"] == []

    # Direct read/patch/delete must 404 for vendor B.
    assert client.get(f"/api/v1/vendor/alerts/{sub_id}").status_code == 404
    assert client.patch(
        f"/api/v1/vendor/alerts/{sub_id}", json={"name": "stolen"}
    ).status_code == 404
    assert client.delete(f"/api/v1/vendor/alerts/{sub_id}").status_code == 404

    # And the row still exists for A.
    _as_vendor_a()
    r_get = client.get(f"/api/v1/vendor/alerts/{sub_id}")
    assert r_get.status_code == 200
    assert r_get.json()["subscription"]["name"] == "A's alert"


# ---------- CRUD round trip ----------

def test_list_patch_delete_round_trip(client):
    # create
    r = client.post("/api/v1/vendor/alerts", json={
        "name": "Round trip",
        "mode": "filter",
        "states": ["WA"],
        "channels": {"email": True, "sms": False, "push": False, "in_app": False},
    })
    sub_id = r.json()["subscription"]["id"]

    # list should contain it
    r_list = client.get("/api/v1/vendor/alerts")
    assert r_list.status_code == 200
    assert len(r_list.json()["subscriptions"]) == 1

    # patch the name + states
    r_patch = client.patch(f"/api/v1/vendor/alerts/{sub_id}", json={
        "name": "Renamed",
        "states": ["WA", "OR"],
    })
    assert r_patch.status_code == 200, r_patch.text
    patched = r_patch.json()["subscription"]
    assert patched["name"] == "Renamed"
    assert patched["states"] == ["WA", "OR"]

    # matches endpoint returns empty list (no scanner yet)
    r_matches = client.get(f"/api/v1/vendor/alerts/{sub_id}/matches")
    assert r_matches.status_code == 200
    assert r_matches.json()["matches"] == []

    # preview is stubbed
    r_preview = client.post("/api/v1/vendor/alerts/preview", json={
        "mode": "filter", "states": ["WA"],
    })
    assert r_preview.status_code == 200
    assert r_preview.json() == {"status": "not_implemented", "phase": "P2"}

    # delete
    r_del = client.delete(f"/api/v1/vendor/alerts/{sub_id}")
    assert r_del.status_code == 200

    # list now empty
    r_list2 = client.get("/api/v1/vendor/alerts")
    assert r_list2.json()["subscriptions"] == []


# ---------- push + notifications smoke ----------

def test_push_subscribe_and_delete(client):
    r = client.post("/api/v1/vendor/push/subscribe", json={
        "endpoint": "https://fcm.googleapis.com/fcm/send/abc",
        "p256dh": "BASE64-PUB",
        "auth": "BASE64-AUTH",
        "ua": "pytest",
    })
    assert r.status_code == 200, r.text
    push_id = r.json()["push_subscription"]["id"]

    # Vendor B should not be able to delete A's push subscription.
    _as_vendor_b()
    assert client.delete(f"/api/v1/vendor/push/{push_id}").status_code == 404

    # A can delete their own.
    _as_vendor_a()
    assert client.delete(f"/api/v1/vendor/push/{push_id}").status_code == 200


def test_notifications_unread_mark_read(client):
    # Seed an unread notification directly.
    db = SessionLocal()
    try:
        n = VendorInAppNotification(
            vendor_profile_id=_VENDOR_A.id,
            title="Test",
            body="New Form 470 match",
            link="https://skyrate.ai/vendor?tab=alerts",
        )
        db.add(n)
        db.commit()
        db.refresh(n)
        notif_id = n.id
    finally:
        db.close()

    r = client.get("/api/v1/vendor/notifications?unread_only=true")
    assert r.status_code == 200
    body = r.json()
    assert body["unread_count"] >= 1
    assert any(item["id"] == notif_id for item in body["notifications"])

    r_read = client.post(f"/api/v1/vendor/notifications/{notif_id}/read")
    assert r_read.status_code == 200
    assert r_read.json()["notification"]["read_at"] is not None

    # And vendor B cannot mark it read.
    _as_vendor_b()
    assert client.post(
        f"/api/v1/vendor/notifications/{notif_id}/read"
    ).status_code == 404
