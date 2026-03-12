"""
FRN Watch Model
Allows users to create monitors that track specific FRNs, BENs, or their full portfolio
and receive periodic email reports with status updates.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class WatchType(str, enum.Enum):
    """Types of FRN watches"""
    FRN = "frn"           # Watch a specific FRN
    BEN = "ben"           # Watch all FRNs for a specific BEN/entity
    PORTFOLIO = "portfolio"  # Watch entire portfolio (all schools/entities)


class WatchFrequency(str, enum.Enum):
    """How often to send reports"""
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"


class DeliveryMode(str, enum.Enum):
    """How to deliver the report"""
    FULL_EMAIL = "full_email"          # Include full report in consolidated email
    NOTIFICATION_ONLY = "notification_only"  # Just a summary + link in email
    IN_APP_ONLY = "in_app_only"        # No email, only viewable in dashboard


class FRNWatch(Base):
    """
    FRN Watch/Monitor record.
    Users create watches to receive periodic FRN status email reports.
    """
    __tablename__ = "frn_watches"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Watch configuration
    name = Column(String(255), nullable=False)  # User-friendly name for the watch
    watch_type = Column(String(20), nullable=False, default=WatchType.PORTFOLIO.value)
    target_id = Column(String(100))  # FRN number, BEN, or null for portfolio
    target_name = Column(String(255))  # Entity name or FRN label for display
    
    # Frequency & delivery
    frequency = Column(String(20), nullable=False, default=WatchFrequency.WEEKLY.value)
    recipient_email = Column(String(255), nullable=False)  # Where to send reports
    cc_emails = Column(JSON, default=list)  # Optional CC recipients
    
    # Delivery preferences
    delivery_mode = Column(String(30), nullable=False, default=DeliveryMode.FULL_EMAIL.value)
    notify_sms = Column(Boolean, default=False)  # Send SMS notification when report is ready
    sms_phone = Column(String(50))  # Override phone number for SMS (uses user's phone if null)
    
    # Filters (optional — narrow down what's included in the report)
    funding_year = Column(Integer)  # Only include this funding year
    status_filter = Column(String(50))  # Only include FRNs with this status
    include_funded = Column(Boolean, default=True)
    include_pending = Column(Boolean, default=True)
    include_denied = Column(Boolean, default=True)
    
    # Report preferences
    include_summary = Column(Boolean, default=True)  # Include summary stats
    include_details = Column(Boolean, default=True)  # Include per-FRN details
    include_changes = Column(Boolean, default=True)  # Highlight changes since last report
    
    # State tracking
    is_active = Column(Boolean, default=True, index=True)
    last_sent_at = Column(DateTime)
    next_send_at = Column(DateTime)
    send_count = Column(Integer, default=0)
    last_error = Column(Text)  # Last error message if send failed
    
    # Snapshot of last report data (for change detection)
    last_snapshot = Column(JSON, default=dict)  # {frn: status} from last report
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", backref="frn_watches")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "watch_type": self.watch_type,
            "target_id": self.target_id,
            "target_name": self.target_name,
            "frequency": self.frequency,
            "recipient_email": self.recipient_email,
            "cc_emails": self.cc_emails or [],
            "delivery_mode": self.delivery_mode,
            "notify_sms": self.notify_sms,
            "sms_phone": self.sms_phone,
            "funding_year": self.funding_year,
            "status_filter": self.status_filter,
            "include_funded": self.include_funded,
            "include_pending": self.include_pending,
            "include_denied": self.include_denied,
            "include_summary": self.include_summary,
            "include_details": self.include_details,
            "include_changes": self.include_changes,
            "is_active": self.is_active,
            "last_sent_at": self.last_sent_at.isoformat() if self.last_sent_at else None,
            "next_send_at": self.next_send_at.isoformat() if self.next_send_at else None,
            "send_count": self.send_count,
            "last_error": self.last_error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
    
    def calculate_next_send(self) -> datetime:
        """Calculate the next send time based on frequency"""
        from datetime import timedelta
        now = datetime.utcnow()
        
        if self.frequency == WatchFrequency.DAILY.value:
            # Next day at 8 AM UTC
            next_day = now + timedelta(days=1)
            return next_day.replace(hour=8, minute=0, second=0, microsecond=0)
        elif self.frequency == WatchFrequency.WEEKLY.value:
            # Next Monday at 8 AM UTC
            days_ahead = 7 - now.weekday()  # Monday = 0
            if days_ahead <= 0:
                days_ahead += 7
            next_monday = now + timedelta(days=days_ahead)
            return next_monday.replace(hour=8, minute=0, second=0, microsecond=0)
        elif self.frequency == WatchFrequency.BIWEEKLY.value:
            # 14 days from now at 8 AM UTC
            next_send = now + timedelta(days=14)
            return next_send.replace(hour=8, minute=0, second=0, microsecond=0)
        elif self.frequency == WatchFrequency.MONTHLY.value:
            # First of next month at 8 AM UTC
            if now.month == 12:
                return datetime(now.year + 1, 1, 1, 8, 0, 0)
            else:
                return datetime(now.year, now.month + 1, 1, 8, 0, 0)
        else:
            return now + timedelta(days=7)  # Default weekly
