"""
Push Subscription Model
Stores Web Push subscription data for sending push notifications
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class PushSubscription(Base):
    """
    Stores Web Push API subscription for a user/device.
    Each user can have multiple subscriptions (desktop, mobile, etc.)
    """
    __tablename__ = "push_subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Web Push subscription data
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh_key = Column(String(255), nullable=False)  # Public key
    auth_key = Column(String(255), nullable=False)     # Auth secret
    
    # Device info
    device_type = Column(String(20), default="desktop")  # desktop, android, ios, mobile
    user_agent = Column(String(500))
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", backref="push_subscriptions")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_type": self.device_type,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
        }
