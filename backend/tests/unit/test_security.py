"""
Unit Tests for Security Module
Tests password hashing, JWT tokens, and authentication utilities
"""

import pytest
from datetime import datetime, timedelta
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)


class TestPasswordHashing:
    """Tests for password hashing functions."""

    @pytest.mark.unit
    def test_hash_password_returns_hash(self):
        """Test that hash_password returns a bcrypt hash."""
        password = "SecurePassword123!"
        hashed = hash_password(password)
        
        assert hashed is not None
        assert hashed != password
        assert hashed.startswith("$2b$")  # bcrypt prefix

    @pytest.mark.unit
    def test_verify_password_correct(self):
        """Test that verify_password returns True for correct password."""
        password = "SecurePassword123!"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True

    @pytest.mark.unit
    def test_verify_password_incorrect(self):
        """Test that verify_password returns False for incorrect password."""
        password = "SecurePassword123!"
        hashed = hash_password(password)
        
        assert verify_password("WrongPassword", hashed) is False

    @pytest.mark.unit
    def test_different_passwords_different_hashes(self):
        """Test that different passwords produce different hashes."""
        password1 = "Password1!"
        password2 = "Password2!"
        
        hash1 = hash_password(password1)
        hash2 = hash_password(password2)
        
        assert hash1 != hash2

    @pytest.mark.unit
    def test_same_password_different_hashes(self):
        """Test that same password produces different hashes (due to salt)."""
        password = "SecurePassword123!"
        
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # Bcrypt uses random salt, so hashes should be different
        assert hash1 != hash2
        # But both should verify correctly
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True

    @pytest.mark.unit
    def test_password_truncation_72_bytes(self):
        """Test that passwords longer than 72 bytes are handled correctly."""
        # Bcrypt truncates passwords at 72 bytes
        long_password = "a" * 100
        hashed = hash_password(long_password)
        
        # Should still verify correctly
        assert verify_password(long_password, hashed) is True

    @pytest.mark.unit
    def test_unicode_password(self):
        """Test that unicode passwords work correctly."""
        password = "密码Password123!🔐"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True

    @pytest.mark.unit
    def test_empty_password(self):
        """Test handling of empty password."""
        password = ""
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
        assert verify_password("notempty", hashed) is False


class TestJWTTokens:
    """Tests for JWT token creation and validation."""

    @pytest.mark.unit
    def test_create_access_token(self):
        """Test that access token is created correctly."""
        data = {"sub": "123"}
        token = create_access_token(data)
        
        assert token is not None
        assert len(token.split('.')) == 3  # Valid JWT format

    @pytest.mark.unit
    def test_create_refresh_token(self):
        """Test that refresh token is created correctly."""
        data = {"sub": "123"}
        token = create_refresh_token(data)
        
        assert token is not None
        assert len(token.split('.')) == 3  # Valid JWT format

    @pytest.mark.unit
    def test_decode_access_token(self):
        """Test that access token can be decoded."""
        user_id = "456"
        data = {"sub": user_id}
        token = create_access_token(data)
        
        decoded = decode_token(token)
        
        assert decoded["sub"] == user_id
        assert decoded["type"] == "access"
        assert "exp" in decoded

    @pytest.mark.unit
    def test_decode_refresh_token(self):
        """Test that refresh token can be decoded."""
        user_id = "789"
        data = {"sub": user_id}
        token = create_refresh_token(data)
        
        decoded = decode_token(token)
        
        assert decoded["sub"] == user_id
        assert decoded["type"] == "refresh"
        assert "exp" in decoded

    @pytest.mark.unit
    def test_access_token_expiration(self):
        """Test that access token has correct expiration."""
        data = {"sub": "123"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        exp_time = datetime.fromtimestamp(decoded["exp"])
        now = datetime.utcnow()
        
        # Access token should expire within ~60 minutes (default)
        assert (exp_time - now).total_seconds() <= 3660  # 61 minutes max
        assert (exp_time - now).total_seconds() > 0  # Should be in future

    @pytest.mark.unit
    def test_custom_expiration(self):
        """Test creating token with custom expiration."""
        data = {"sub": "123"}
        expires = timedelta(minutes=5)
        token = create_access_token(data, expires_delta=expires)
        decoded = decode_token(token)
        
        exp_time = datetime.fromtimestamp(decoded["exp"])
        now = datetime.utcnow()
        
        # Should expire within ~5 minutes
        assert (exp_time - now).total_seconds() <= 310  # 5 min + buffer
        assert (exp_time - now).total_seconds() > 0

    @pytest.mark.unit
    def test_token_contains_custom_data(self):
        """Test that custom data is included in token."""
        data = {"sub": "123", "role": "consultant", "custom": "value"}
        token = create_access_token(data)
        decoded = decode_token(token)
        
        assert decoded["sub"] == "123"
        assert decoded["role"] == "consultant"
        assert decoded["custom"] == "value"

    @pytest.mark.unit
    def test_invalid_token_raises_error(self):
        """Test that invalid token raises appropriate error."""
        from fastapi import HTTPException
        
        with pytest.raises(HTTPException) as exc_info:
            decode_token("invalid.token.here")
        
        assert exc_info.value.status_code == 401

    @pytest.mark.unit
    def test_tampered_token_fails(self):
        """Test that tampered token fails validation."""
        from fastapi import HTTPException
        
        data = {"sub": "123"}
        token = create_access_token(data)
        
        # Tamper with the token
        parts = token.split('.')
        parts[1] = parts[1][:-5] + "xxxxx"  # Modify payload
        tampered = '.'.join(parts)
        
        with pytest.raises(HTTPException) as exc_info:
            decode_token(tampered)
        
        assert exc_info.value.status_code == 401
