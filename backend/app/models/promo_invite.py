"""
Promo Invite Model
Handles promotional invite links created by admin for user onboarding
with configurable trial periods (no paywall during trial).
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class PromoInviteStatus(str, enum.Enum):
    PENDING = "pending"      # Invite sent, not yet used
    ACCEPTED = "accepted"    # User signed up via invite
    EXPIRED = "expired"      # Invite link expired before use
    REVOKED = "revoked"      # Admin revoked the invite


class PromoInvite(Base):
    __tablename__ = "promo_invites"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Invite token (UUID, used in URL)
    token = Column(String(64), unique=True, nullable=False, index=True)
    
    # Invitee info
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(50), nullable=False, default="vendor")  # vendor, consultant, applicant
    
    # Trial configuration
    trial_days = Column(Integer, nullable=False, default=30)  # Duration of free trial
    
    # Status tracking
    status = Column(String(50), nullable=False, default=PromoInviteStatus.PENDING.value)
    
    # When the invite link itself expires (not the trial)
    invite_expires_at = Column(DateTime, nullable=False)
    
    # When the invite was used
    used_at = Column(DateTime, nullable=True)
    used_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Admin who created the invite
    created_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    used_by_user = relationship("User", foreign_keys=[used_by_user_id])
    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "token": self.token,
            "email": self.email,
            "role": self.role,
            "trial_days": self.trial_days,
            "status": self.status,
            "invite_expires_at": self.invite_expires_at.isoformat() if self.invite_expires_at else None,
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "used_by_user_id": self.used_by_user_id,
            "created_by_admin_id": self.created_by_admin_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
