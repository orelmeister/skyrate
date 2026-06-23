"""
Account Seat Model
Tracks team seats granted to a consultant account (Phase 4 seats feature).
Each row represents an invited or active seat under a consultant profile.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime

from ..core.database import Base


class AccountSeat(Base):
    __tablename__ = "account_seats"

    id = Column(Integer, primary_key=True, index=True)
    consultant_profile_id = Column(Integer, ForeignKey("consultant_profiles.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # null until invite accepted
    invited_email = Column(String(255), nullable=False, index=True)
    seat_role = Column(String(20), nullable=False, default="seat")  # "owner" | "seat"
    status = Column(String(20), nullable=False, default="invited", index=True)  # invited | active | suspended | removed
    invite_token = Column(String(255), unique=True, index=True, nullable=True)
    invite_expires_at = Column(DateTime, nullable=True)
    invited_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "consultant_profile_id": self.consultant_profile_id,
            "user_id": self.user_id,
            "invited_email": self.invited_email,
            "seat_role": self.seat_role,
            "status": self.status,
            "invite_token": self.invite_token,
            "invite_expires_at": self.invite_expires_at.isoformat() if self.invite_expires_at else None,
            "invited_by_admin_id": self.invited_by_admin_id,
            "accepted_at": self.accepted_at.isoformat() if self.accepted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
