"""
User Model
Handles users across all portal types (admin, consultant, vendor)
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    CONSULTANT = "consultant"
    VENDOR = "vendor"
    APPLICANT = "applicant"
    SUPER = "super"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=True)  # Nullable for OAuth users
    role = Column(String(50), nullable=False, default=UserRole.CONSULTANT.value)
    auth_provider = Column(String(50), default="email")  # 'email', 'google', etc.
    
    # Profile info
    first_name = Column(String(100))
    last_name = Column(String(100))
    company_name = Column(String(255))
    phone = Column(String(50))
    phone_verified = Column(Boolean, default=False)
    phone_verified_at = Column(DateTime, nullable=True)
    onboarding_completed = Column(Boolean, default=False)
    
    # Verification status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # True once email is verified
    email_verified = Column(Boolean, default=False)
    email_verified_at = Column(DateTime, nullable=True)
    
    # SMS opt-in consent tracking
    sms_opt_in = Column(Boolean, default=False)
    sms_opted_in_at = Column(DateTime, nullable=True)

    # USAC entity verification (CRN/SPIN/BEN verified against USAC API)
    # Used to gate AI features until the user proves they own a real E-Rate entity.
    verified_entity = Column(Boolean, default=False)
    verified_entity_at = Column(DateTime, nullable=True)

    # Funnel re-engagement: stamped when user clicks "remind me later" on
    # onboarding step 0. A scheduled job sends a follow-up email ~48h after.
    pending_identifier_reminder = Column(DateTime, nullable=True)

    # Test account flag — skip real SMTP in digest jobs
    is_test = Column(Boolean, default=False, nullable=False, server_default="0")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)
    
    # Relationships
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    consultant_profile = relationship("ConsultantProfile", back_populates="user", uselist=False)
    vendor_profile = relationship("VendorProfile", back_populates="user", uselist=False)
    applicant_profile = relationship("ApplicantProfile", back_populates="user", uselist=False)
    query_history = relationship("QueryHistory", back_populates="user")
    
    @property
    def full_name(self) -> str:
        if self.first_name and self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.email.split("@")[0]
    
    def to_dict(self, include_profile: bool = False) -> dict:
        data = {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "company_name": self.company_name,
            "phone": self.phone,
            "phone_verified": self.phone_verified,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "email_verified": self.email_verified,
            "email_verified_at": self.email_verified_at.isoformat() if self.email_verified_at else None,
            "sms_opt_in": self.sms_opt_in,
            "onboarding_completed": self.onboarding_completed,
            "verified_entity": self.verified_entity,
            "pending_identifier_reminder": self.pending_identifier_reminder.isoformat() if self.pending_identifier_reminder else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }
        if include_profile:
            data["consultant_profile"] = (
                self.consultant_profile.to_dict() if self.consultant_profile else None
            )
            data["vendor_profile"] = (
                self.vendor_profile.to_dict() if self.vendor_profile else None
            )
            data["applicant_profile"] = (
                self.applicant_profile.to_dict() if self.applicant_profile else None
            )
        return data
