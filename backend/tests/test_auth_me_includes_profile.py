"""
Test that /api/v1/auth/me returns role-specific profiles (consultant_profile, vendor_profile, applicant_profile).
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.user import User, UserRole
from app.models.consultant import ConsultantProfile
from app.models.vendor import VendorProfile
from app.models.applicant import ApplicantProfile


# Use in-memory SQLite with StaticPool so all connections share one DB
SQLALCHEMY_DATABASE_URL = "sqlite:///"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


def _create_all_skip_dupes():
    """prediction.py declares both Column(index=True) and Index() with same name.
    SQLite rejects duplicates, so deduplicate before create_all."""
    seen = set()
    for tbl in Base.metadata.tables.values():
        for ix in list(tbl.indexes):
            if ix.name in seen:
                tbl.indexes.discard(ix)
            else:
                seen.add(ix.name)
    Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    _create_all_skip_dupes()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def consultant_user():
    db = TestingSessionLocal()
    user = User(
        email="test_consultant_profile@example.com",
        password_hash=hash_password("TestPass123!"),
        role="consultant",
        first_name="Test",
        last_name="Consultant",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    profile = ConsultantProfile(
        user_id=user.id,
        crn="CRN1234",
        company_name="Test Consulting LLC",
        contact_name="Test Consultant",
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def vendor_user():
    db = TestingSessionLocal()
    user = User(
        email="test_vendor_profile@example.com",
        password_hash=hash_password("TestPass123!"),
        role="vendor",
        first_name="Test",
        last_name="Vendor",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    profile = VendorProfile(
        user_id=user.id,
        spin="SPIN5678",
        company_name="Test Vendor Corp",
        contact_name="Test Vendor",
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def applicant_user():
    db = TestingSessionLocal()
    user = User(
        email="test_applicant_profile@example.com",
        password_hash=hash_password("TestPass123!"),
        role="applicant",
        first_name="Test",
        last_name="Applicant",
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.flush()
    profile = ApplicantProfile(
        user_id=user.id,
        ben="BEN9012",
        organization_name="Test School District",
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def _login_and_get_token(client: TestClient, email: str, password: str) -> str:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def test_auth_me_includes_consultant_profile(client, consultant_user):
    token = _login_and_get_token(client, "test_consultant_profile@example.com", "TestPass123!")
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    user = data["user"]
    assert user["role"] == "consultant"
    assert user["consultant_profile"] is not None
    assert user["consultant_profile"]["crn"] == "CRN1234"
    assert user["consultant_profile"]["company_name"] == "Test Consulting LLC"


def test_auth_me_includes_vendor_profile(client, vendor_user):
    token = _login_and_get_token(client, "test_vendor_profile@example.com", "TestPass123!")
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    user = data["user"]
    assert user["role"] == "vendor"
    assert user["vendor_profile"] is not None
    assert user["vendor_profile"]["spin"] == "SPIN5678"


def test_auth_me_includes_applicant_profile(client, applicant_user):
    token = _login_and_get_token(client, "test_applicant_profile@example.com", "TestPass123!")
    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    user = data["user"]
    assert user["role"] == "applicant"
    assert user["applicant_profile"] is not None
    assert user["applicant_profile"]["ben"] == "BEN9012"


def test_login_response_includes_profile(client, consultant_user):
    resp = client.post("/api/v1/auth/login", json={
        "email": "test_consultant_profile@example.com",
        "password": "TestPass123!"
    })
    assert resp.status_code == 200
    data = resp.json()
    user = data["user"]
    assert user["consultant_profile"] is not None
    assert user["consultant_profile"]["crn"] == "CRN1234"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
