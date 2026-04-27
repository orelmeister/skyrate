"""Regression test — super accounts must see CRNs across all consultant
profiles via GET /api/v1/consultant/crns.

Triggered by April 26, 2026 incident: a recent change scoped the CRN list
to the caller's own profile, so super@skyrate.ai (which has its own
fresh ConsultantProfile) saw an empty list while admin still saw the
underlying rows in the admin panel.

Run locally:
  cd skyrate.ai/backend
  python -m pytest tests/test_super_crn_visibility.py -v

Or as a smoke script:
  python tests/test_super_crn_visibility.py
"""
import os
import sys
import pathlib

# Use a throwaway sqlite file so we don't touch the dev DB.
_TEST_DB = pathlib.Path(__file__).parent / "_test_super_crn.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-for-pytest-DO-NOT-USE")
os.environ.setdefault("ENVIRONMENT", "development")

# Make `app` importable without installing the package.
_BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.core.database import SessionLocal, Base, engine  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.consultant import (  # noqa: E402
    ConsultantProfile,
    ConsultantCRN,
)

# Ensure schema exists on the throwaway sqlite DB.
Base.metadata.create_all(bind=engine)


def _login(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("access_token") or body.get("data", {}).get("access_token")
    assert token, f"no access_token in login response: {body}"
    return token


def _seed_consultant_with_crn(email: str = "regression_consultant@example.com") -> str:
    """Create a regular consultant user with one CRN — this is the row the
    super account must be able to see."""
    import bcrypt
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            user = existing
        else:
            user = User(
                email=email,
                password_hash=bcrypt.hashpw(b"RegressionPass1!", bcrypt.gensalt()).decode(),
                role="consultant",
                first_name="Reg",
                last_name="Test",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(user)
            db.flush()

        cp = db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user.id
        ).first()
        if not cp:
            cp = ConsultantProfile(
                user_id=user.id,
                company_name="Regression Co",
                contact_name="Reg Test",
                crn="99999999",
            )
            db.add(cp)
            db.flush()

        existing_crn = db.query(ConsultantCRN).filter(
            ConsultantCRN.consultant_profile_id == cp.id,
            ConsultantCRN.crn == "99999999",
        ).first()
        if not existing_crn:
            db.add(ConsultantCRN(
                consultant_profile_id=cp.id,
                crn="99999999",
                company_name="Regression Co",
                is_primary=True,
                is_verified=True,
                is_free=True,
                payment_status="active",
            ))
        db.commit()
        return email
    finally:
        db.close()


def run() -> int:
    client = TestClient(app)

    # 1. Seed a consultant + CRN that does NOT belong to super.
    seeded_email = _seed_consultant_with_crn()
    print(f"[SEED] regression consultant: {seeded_email} with CRN 99999999")

    # 2. Login as super and confirm GET /consultant/crns includes that CRN.
    super_token = _login(client, "super@skyrate.ai", "super@12345")
    r = client.get(
        "/api/v1/consultant/crns",
        headers={"Authorization": f"Bearer {super_token}"},
    )
    assert r.status_code == 200, f"super /crns failed: {r.status_code} {r.text}"
    body = r.json()
    crns = body.get("crns") or []
    assert body.get("scope") == "all", f"expected scope=all for super, got {body.get('scope')}"
    crn_values = {c.get("crn") for c in crns}
    assert "99999999" in crn_values, (
        f"REGRESSION: super did not see CRN 99999999. "
        f"Saw {len(crns)} CRNs: {crn_values}"
    )
    # Owner enrichment should be present for privileged callers.
    target = next(c for c in crns if c.get("crn") == "99999999")
    assert target.get("owner_email") == seeded_email, (
        f"owner_email missing or wrong: {target.get('owner_email')}"
    )
    print(f"[OK] super sees {len(crns)} CRN(s) including 99999999 owned by {target.get('owner_email')}")

    # 3. Sanity: a regular consultant must NOT see other consultants' CRNs.
    consultant_token = _login(client, "test_consultant@example.com", "TestPass123!")
    r2 = client.get(
        "/api/v1/consultant/crns",
        headers={"Authorization": f"Bearer {consultant_token}"},
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2.get("scope") == "self", f"expected scope=self for consultant, got {body2.get('scope')}"
    other_crns = {c.get("crn") for c in (body2.get("crns") or [])}
    assert "99999999" not in other_crns, (
        f"PRIVACY BUG: consultant saw another user's CRN 99999999"
    )
    print(f"[OK] regular consultant correctly scoped to self ({len(other_crns)} CRN(s))")

    print("[PASS] super CRN visibility regression test")
    return 0


if __name__ == "__main__":
    sys.exit(run())


def test_super_sees_all_crns_admin_too():
    """pytest entry point."""
    assert run() == 0
