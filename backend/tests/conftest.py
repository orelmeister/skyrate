"""
Pytest Configuration and Fixtures
Shared fixtures for all tests
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.main import app
from app.core.database import Base, get_db
from app.core.security import hash_password, create_access_token
from app.models.user import User, UserRole
from app.models.subscription import Subscription, SubscriptionStatus


# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def test_engine():
    """Create a test database engine."""
    engine = create_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_db(test_engine):
    """Create a test database session."""
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client(test_db):
    """Create a test client with database override."""
    def override_get_db():
        try:
            yield test_db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(test_db) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("TestPassword123!"),
        role=UserRole.CONSULTANT.value,
        first_name="Test",
        last_name="User",
        company_name="Test Company",
        is_active=True,
        is_verified=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_user_with_subscription(test_db, test_user) -> User:
    """Create a test user with a subscription."""
    from datetime import datetime, timedelta
    
    subscription = Subscription(
        user_id=test_user.id,
        plan="monthly",
        status=SubscriptionStatus.TRIALING.value,
        price_cents=30000,
        start_date=datetime.utcnow(),
        trial_end=datetime.utcnow() + timedelta(days=14),
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=14),
    )
    test_db.add(subscription)
    test_db.commit()
    test_db.refresh(test_user)
    return test_user


@pytest.fixture
def auth_token(test_user) -> str:
    """Create an auth token for the test user."""
    return create_access_token(data={"sub": str(test_user.id)})


@pytest.fixture
def auth_headers(auth_token) -> dict:
    """Create authorization headers."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture
def vendor_user(test_db) -> User:
    """Create a test vendor user."""
    user = User(
        email="vendor@example.com",
        password_hash=hash_password("VendorPassword123!"),
        role=UserRole.VENDOR.value,
        first_name="Vendor",
        last_name="User",
        company_name="Vendor Company",
        is_active=True,
        is_verified=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def vendor_auth_token(vendor_user) -> str:
    """Create an auth token for the vendor user."""
    return create_access_token(data={"sub": str(vendor_user.id)})


@pytest.fixture
def vendor_auth_headers(vendor_auth_token) -> dict:
    """Create authorization headers for vendor."""
    return {"Authorization": f"Bearer {vendor_auth_token}"}
