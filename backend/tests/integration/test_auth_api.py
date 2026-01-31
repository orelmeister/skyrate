"""
Integration Tests for Authentication API
Tests registration, login, token refresh, and profile endpoints
"""

import pytest


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    @pytest.mark.integration
    def test_health_check(self, client):
        """Test that health endpoint returns healthy status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data

    @pytest.mark.integration
    def test_root_endpoint(self, client):
        """Test that root endpoint returns API info."""
        response = client.get("/")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "SkyRate AI API"
        assert data["status"] == "running"


class TestUserRegistration:
    """Tests for user registration endpoint."""

    @pytest.mark.integration
    def test_register_consultant_success(self, client):
        """Test successful consultant registration."""
        response = client.post("/api/v1/auth/register", json={
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "first_name": "New",
            "last_name": "User",
            "company_name": "New Company",
            "role": "consultant",
            "crn": "12345678"
        })
        
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "newuser@example.com"
        assert data["user"]["role"] == "consultant"

    @pytest.mark.integration
    def test_register_vendor_success(self, client):
        """Test successful vendor registration."""
        response = client.post("/api/v1/auth/register", json={
            "email": "vendor@example.com",
            "password": "SecurePass123!",
            "first_name": "Vendor",
            "last_name": "User",
            "company_name": "Vendor Company",
            "role": "vendor",
            "spin": "143000001"
        })
        
        assert response.status_code == 201
        data = response.json()
        assert data["user"]["role"] == "vendor"

    @pytest.mark.integration
    def test_register_consultant_missing_crn(self, client):
        """Test that consultant registration requires CRN."""
        response = client.post("/api/v1/auth/register", json={
            "email": "nocrn@example.com",
            "password": "SecurePass123!",
            "role": "consultant"
        })
        
        assert response.status_code == 400
        assert "CRN" in response.json()["detail"]

    @pytest.mark.integration
    def test_register_vendor_missing_spin(self, client):
        """Test that vendor registration requires SPIN."""
        response = client.post("/api/v1/auth/register", json={
            "email": "nospin@example.com",
            "password": "SecurePass123!",
            "role": "vendor"
        })
        
        assert response.status_code == 400
        assert "SPIN" in response.json()["detail"]

    @pytest.mark.integration
    def test_register_duplicate_email(self, client, test_user):
        """Test that duplicate email registration fails."""
        response = client.post("/api/v1/auth/register", json={
            "email": test_user.email,
            "password": "AnotherPass123!",
            "role": "consultant",
            "crn": "87654321"
        })
        
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()

    @pytest.mark.integration
    def test_register_short_password(self, client):
        """Test that short password is rejected."""
        response = client.post("/api/v1/auth/register", json={
            "email": "shortpass@example.com",
            "password": "short",
            "role": "consultant",
            "crn": "11111111"
        })
        
        assert response.status_code == 422  # Validation error

    @pytest.mark.integration
    def test_register_invalid_email(self, client):
        """Test that invalid email is rejected."""
        response = client.post("/api/v1/auth/register", json={
            "email": "notanemail",
            "password": "SecurePass123!",
            "role": "consultant",
            "crn": "22222222"
        })
        
        assert response.status_code == 422  # Validation error


class TestUserLogin:
    """Tests for user login endpoint."""

    @pytest.mark.integration
    def test_login_success(self, client, test_user):
        """Test successful login."""
        response = client.post("/api/v1/auth/login", json={
            "email": test_user.email,
            "password": "TestPassword123!"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == test_user.email

    @pytest.mark.integration
    def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password."""
        response = client.post("/api/v1/auth/login", json={
            "email": test_user.email,
            "password": "WrongPassword123!"
        })
        
        assert response.status_code == 401

    @pytest.mark.integration
    def test_login_nonexistent_user(self, client):
        """Test login with non-existent user."""
        response = client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "AnyPassword123!"
        })
        
        assert response.status_code == 401

    @pytest.mark.integration
    def test_login_case_insensitive_email(self, client, test_user):
        """Test that email is case-insensitive for login."""
        response = client.post("/api/v1/auth/login", json={
            "email": test_user.email.upper(),
            "password": "TestPassword123!"
        })
        
        assert response.status_code == 200


class TestTokenRefresh:
    """Tests for token refresh endpoint."""

    @pytest.mark.integration
    def test_refresh_token_success(self, client, test_user):
        """Test successful token refresh."""
        # First login to get tokens
        login_response = client.post("/api/v1/auth/login", json={
            "email": test_user.email,
            "password": "TestPassword123!"
        })
        refresh_token = login_response.json()["refresh_token"]
        
        # Then refresh
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    @pytest.mark.integration
    def test_refresh_with_access_token_fails(self, client, auth_token):
        """Test that access token cannot be used for refresh."""
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": auth_token  # Using access token instead
        })
        
        assert response.status_code == 401

    @pytest.mark.integration
    def test_refresh_with_invalid_token(self, client):
        """Test refresh with invalid token."""
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": "invalid.token.here"
        })
        
        assert response.status_code == 401


class TestUserProfile:
    """Tests for user profile endpoints."""

    @pytest.mark.integration
    def test_get_profile_authenticated(self, client, auth_headers):
        """Test getting profile when authenticated."""
        response = client.get("/api/v1/auth/me", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "user" in data

    @pytest.mark.integration
    def test_get_profile_unauthenticated(self, client):
        """Test getting profile without authentication."""
        response = client.get("/api/v1/auth/me")
        
        assert response.status_code == 403  # No auth header

    @pytest.mark.integration
    def test_update_profile(self, client, auth_headers):
        """Test updating user profile."""
        response = client.put("/api/v1/auth/me", 
            headers=auth_headers,
            json={
                "first_name": "Updated",
                "last_name": "Name",
                "company_name": "Updated Company"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["first_name"] == "Updated"
        assert data["user"]["last_name"] == "Name"

    @pytest.mark.integration
    def test_change_password(self, client, auth_headers):
        """Test changing password."""
        response = client.post("/api/v1/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "TestPassword123!",
                "new_password": "NewSecurePass456!"
            }
        )
        
        assert response.status_code == 200
        assert response.json()["success"] is True

    @pytest.mark.integration
    def test_change_password_wrong_current(self, client, auth_headers):
        """Test changing password with wrong current password."""
        response = client.post("/api/v1/auth/change-password",
            headers=auth_headers,
            json={
                "current_password": "WrongPassword!",
                "new_password": "NewSecurePass456!"
            }
        )
        
        assert response.status_code == 400
