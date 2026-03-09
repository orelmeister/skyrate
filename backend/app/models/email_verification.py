"""
Email Verification Code Model
Stores email verification codes in the database instead of in-memory dict.
This ensures codes persist across server restarts and work with multiple instances.
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime, timedelta
import random
import string

from ..core.database import Base


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    @staticmethod
    def generate_code(length: int = 6) -> str:
        """Generate a random numeric verification code"""
        return ''.join(random.choices(string.digits, k=length))
    
    @classmethod
    def create_for_email(cls, email: str, ttl_minutes: int = 10) -> "EmailVerificationCode":
        """Create a new verification code for the given email"""
        return cls(
            email=email.lower().strip(),
            code=cls.generate_code(),
            expires_at=datetime.utcnow() + timedelta(minutes=ttl_minutes),
        )
    
    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at
    
    @property
    def is_used(self) -> bool:
        return self.verified_at is not None
    
    def mark_verified(self) -> None:
        self.verified_at = datetime.utcnow()
