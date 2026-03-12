"""
FRN Report History Model
Stores generated FRN status reports for in-app viewing.
Each record represents one consolidated report cycle per user.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class FRNReportHistory(Base):
    """
    Stored report for in-app viewing.
    One record per user per processing cycle.
    """
    __tablename__ = "frn_report_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Report metadata
    report_name = Column(String(500))  # Generated name e.g. "Weekly Report - Mar 12, 2026"
    watch_ids = Column(JSON, default=list)  # IDs of watches included in this report
    watch_names = Column(JSON, default=list)  # Names of watches for display
    
    # Report content
    html_content = Column(Text)  # Full HTML of the report (for in-app rendering)
    
    # Summary data (for list view without loading full HTML)
    total_frns = Column(Integer, default=0)
    funded_count = Column(Integer, default=0)
    denied_count = Column(Integer, default=0)
    pending_count = Column(Integer, default=0)
    total_amount = Column(Integer, default=0)  # Stored as cents to avoid float issues
    changes_detected = Column(Integer, default=0)
    
    # Delivery tracking
    email_sent = Column(Boolean, default=False)
    sms_sent = Column(Boolean, default=False)
    delivery_modes = Column(JSON, default=list)  # List of delivery modes used
    recipient_email = Column(String(255))  # Primary recipient
    
    # User interaction
    viewed_at = Column(DateTime)  # When user first viewed in app
    
    # Timestamps
    generated_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", backref="frn_report_history")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "report_name": self.report_name,
            "watch_ids": self.watch_ids or [],
            "watch_names": self.watch_names or [],
            "total_frns": self.total_frns,
            "funded_count": self.funded_count,
            "denied_count": self.denied_count,
            "pending_count": self.pending_count,
            "total_amount": self.total_amount,
            "changes_detected": self.changes_detected,
            "email_sent": self.email_sent,
            "sms_sent": self.sms_sent,
            "delivery_modes": self.delivery_modes or [],
            "recipient_email": self.recipient_email,
            "viewed_at": self.viewed_at.isoformat() if self.viewed_at else None,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "has_html": bool(self.html_content),
        }
