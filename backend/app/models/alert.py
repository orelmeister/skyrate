"""
Alert Model
Handles alerts and alert configurations for users
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class AlertType(str, enum.Enum):
    """Types of alerts that can be triggered"""
    FRN_STATUS_CHANGE = "frn_status_change"  # FRN status changed (e.g., Pending → Denied)
    NEW_DENIAL = "new_denial"  # New denial detected in portfolio
    DEADLINE_APPROACHING = "deadline_approaching"  # Filing deadline approaching
    DISBURSEMENT_RECEIVED = "disbursement_received"  # Payment/disbursement received
    FORM_470_MATCH = "form_470_match"  # New Form 470 matching vendor criteria
    COMPETITOR_ACTIVITY = "competitor_activity"  # Competitor activity at serviced entity
    FUNDING_APPROVED = "funding_approved"  # FRN approved/committed
    APPEAL_DEADLINE = "appeal_deadline"  # Appeal deadline approaching


class AlertPriority(str, enum.Enum):
    """Priority levels for alerts"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertConfig(Base):
    """
    User's alert configuration/preferences.
    Stores what types of alerts the user wants and how they want to receive them.
    """
    __tablename__ = "alert_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # Alert type toggles (what to alert on)
    alert_on_denial = Column(Boolean, default=True)
    alert_on_status_change = Column(Boolean, default=True)
    alert_on_deadline = Column(Boolean, default=True)
    alert_on_disbursement = Column(Boolean, default=True)
    alert_on_funding_approved = Column(Boolean, default=True)
    alert_on_form_470 = Column(Boolean, default=True)  # Vendor-specific
    alert_on_competitor = Column(Boolean, default=False)  # Vendor-specific
    
    # Deadline thresholds (days before deadline to alert)
    deadline_warning_days = Column(Integer, default=14)  # Alert 14 days before deadline
    
    # Amount thresholds (only alert if above this amount)
    min_alert_amount = Column(Float, default=0)
    
    # Notification preferences
    email_notifications = Column(Boolean, default=True)
    in_app_notifications = Column(Boolean, default=True)
    daily_digest = Column(Boolean, default=False)  # Send daily summary email
    
    # Email settings
    notification_email = Column(String(255))  # Override email for alerts
    
    # Filters (JSON for flexibility)
    # For consultants: filter by BEN list
    # For vendors: filter by state, category, manufacturer
    alert_filters = Column(JSON, default=dict)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", backref="alert_config")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "alert_on_denial": self.alert_on_denial,
            "alert_on_status_change": self.alert_on_status_change,
            "alert_on_deadline": self.alert_on_deadline,
            "alert_on_disbursement": self.alert_on_disbursement,
            "alert_on_funding_approved": self.alert_on_funding_approved,
            "alert_on_form_470": self.alert_on_form_470,
            "alert_on_competitor": self.alert_on_competitor,
            "deadline_warning_days": self.deadline_warning_days,
            "min_alert_amount": self.min_alert_amount,
            "email_notifications": self.email_notifications,
            "in_app_notifications": self.in_app_notifications,
            "daily_digest": self.daily_digest,
            "notification_email": self.notification_email,
            "alert_filters": self.alert_filters,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Alert(Base):
    """
    Individual alert record.
    Created when an alert condition is triggered for a user.
    """
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Alert details
    alert_type = Column(String(50), nullable=False, index=True)
    priority = Column(String(20), default=AlertPriority.MEDIUM.value)
    title = Column(String(255), nullable=False)
    message = Column(String(2000), nullable=False)
    
    # Related entity info
    entity_type = Column(String(50))  # 'frn', 'ben', 'form_470', etc.
    entity_id = Column(String(100))  # FRN number, BEN, Form 470 ID, etc.
    entity_name = Column(String(255))  # School name, vendor name, etc.
    
    # Additional context (JSON for flexibility)
    alert_metadata = Column(JSON, default=dict)  # Store additional alert-specific data
    
    # Status
    is_read = Column(Boolean, default=False, index=True)
    is_dismissed = Column(Boolean, default=False)
    is_actioned = Column(Boolean, default=False)  # User took action (e.g., started appeal)
    
    # Notification tracking
    email_sent = Column(Boolean, default=False)
    email_sent_at = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime)
    
    # Relationships
    user = relationship("User", backref="alerts")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "alert_type": self.alert_type,
            "priority": self.priority,
            "title": self.title,
            "message": self.message,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "metadata": self.alert_metadata,
            "is_read": self.is_read,
            "is_dismissed": self.is_dismissed,
            "is_actioned": self.is_actioned,
            "email_sent": self.email_sent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
        }
    
    @classmethod
    def create_denial_alert(
        cls,
        user_id: int,
        frn: str,
        school_name: str,
        denial_reason: str,
        amount: float = 0
    ) -> "Alert":
        """Factory method to create a denial alert"""
        return cls(
            user_id=user_id,
            alert_type=AlertType.NEW_DENIAL.value,
            priority=AlertPriority.HIGH.value,
            title=f"New Denial: {school_name}",
            message=f"FRN {frn} has been denied. Reason: {denial_reason}",
            entity_type="frn",
            entity_id=frn,
            entity_name=school_name,
            alert_metadata={
                "denial_reason": denial_reason,
                "amount": amount,
            }
        )
    
    @classmethod
    def create_status_change_alert(
        cls,
        user_id: int,
        frn: str,
        school_name: str,
        old_status: str,
        new_status: str,
        amount: float = 0
    ) -> "Alert":
        """Factory method to create a status change alert"""
        # Determine priority based on status change
        priority = AlertPriority.MEDIUM.value
        if "denied" in new_status.lower():
            priority = AlertPriority.HIGH.value
        elif "funded" in new_status.lower() or "committed" in new_status.lower():
            priority = AlertPriority.MEDIUM.value
            
        return cls(
            user_id=user_id,
            alert_type=AlertType.FRN_STATUS_CHANGE.value,
            priority=priority,
            title=f"Status Change: {school_name}",
            message=f"FRN {frn} status changed from '{old_status}' to '{new_status}'",
            entity_type="frn",
            entity_id=frn,
            entity_name=school_name,
            alert_metadata={
                "old_status": old_status,
                "new_status": new_status,
                "amount": amount,
            }
        )
    
    @classmethod
    def create_deadline_alert(
        cls,
        user_id: int,
        entity_id: str,
        entity_name: str,
        deadline_type: str,
        deadline_date: str,
        days_remaining: int
    ) -> "Alert":
        """Factory method to create a deadline approaching alert"""
        priority = AlertPriority.HIGH.value if days_remaining <= 7 else AlertPriority.MEDIUM.value
        
        return cls(
            user_id=user_id,
            alert_type=AlertType.DEADLINE_APPROACHING.value,
            priority=priority,
            title=f"Deadline Approaching: {deadline_type}",
            message=f"{deadline_type} deadline for {entity_name} is in {days_remaining} days ({deadline_date})",
            entity_type="deadline",
            entity_id=entity_id,
            entity_name=entity_name,
            alert_metadata={
                "deadline_type": deadline_type,
                "deadline_date": deadline_date,
                "days_remaining": days_remaining,
            }
        )
    
    @classmethod
    def create_form_470_alert(
        cls,
        user_id: int,
        form_470_id: str,
        entity_name: str,
        state: str,
        category: str,
        manufacturers: list
    ) -> "Alert":
        """Factory method to create a Form 470 match alert (for vendors)"""
        return cls(
            user_id=user_id,
            alert_type=AlertType.FORM_470_MATCH.value,
            priority=AlertPriority.MEDIUM.value,
            title=f"New Form 470: {entity_name}",
            message=f"New Form 470 in {state} matching your criteria. Category: {category}",
            entity_type="form_470",
            entity_id=form_470_id,
            entity_name=entity_name,
            alert_metadata={
                "state": state,
                "category": category,
                "manufacturers": manufacturers,
            }
        )
