"""
Applicant Models
Handles applicant profiles, FRN tracking, and auto-generated appeals

The applicant tier is designed for "Sign up → Enter BEN → Pay → BOOM - Everything's ready!"
Minimal input from user, maximum automation from backend.

Multi-BEN Support:
- Schools can have multiple BEN numbers (admin office, junior high, high school, library)
- Each BEN is a separate subscription/payment
- Primary BEN is stored in ApplicantProfile
- Additional BENs are stored in ApplicantBEN table
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, Numeric, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from ..core.database import Base


class DataSyncStatus(str, enum.Enum):
    """Status of background data synchronization"""
    PENDING = "pending"          # Initial state, waiting for payment
    SYNCING = "syncing"          # Currently fetching data
    COMPLETED = "completed"      # All data fetched successfully
    FAILED = "failed"            # Sync failed (will retry)
    PARTIAL = "partial"          # Some data fetched, some failed


class FRNStatusType(str, enum.Enum):
    """Standard FRN status types from USAC"""
    FUNDED = "funded"
    PENDING_REVIEW = "pending_review"
    IN_REVIEW = "in_review"
    DENIED = "denied"
    CANCELLED = "cancelled"
    APPEALED = "appealed"
    UNKNOWN = "unknown"


class BENSubscriptionStatus(str, enum.Enum):
    """Status of a BEN subscription"""
    ACTIVE = "active"
    TRIAL = "trial"
    PENDING_PAYMENT = "pending_payment"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class ApplicantBEN(Base):
    """
    Individual BEN (Billed Entity Number) subscription.
    Schools can monitor multiple BENs, each requiring its own subscription.
    
    Example: A school district with:
    - Admin Office (BEN: 123456)
    - High School (BEN: 123457)  
    - Junior High (BEN: 123458)
    - Library (BEN: 123459)
    
    Each BEN is tracked separately with its own subscription and data.
    """
    __tablename__ = "applicant_bens"
    
    id = Column(Integer, primary_key=True, index=True)
    applicant_profile_id = Column(Integer, ForeignKey("applicant_profiles.id"), nullable=False)
    
    # BEN identification
    ben = Column(String(50), nullable=False, index=True)
    is_primary = Column(Boolean, default=False)  # Is this the main/first BEN?
    display_name = Column(String(255))  # User-friendly name like "High School"
    
    # Organization info (auto-populated from USAC)
    organization_name = Column(String(255))
    state = Column(String(2))
    city = Column(String(100))
    entity_type = Column(String(100))
    discount_rate = Column(Numeric(5, 2))  # E-Rate discount percentage
    
    # Subscription/Payment status
    subscription_status = Column(String(50), default=BENSubscriptionStatus.PENDING_PAYMENT.value)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime)
    subscription_start = Column(DateTime)
    subscription_end = Column(DateTime)
    stripe_subscription_item_id = Column(String(255))  # For metered billing
    monthly_price_cents = Column(Integer, default=4900)  # $49/month per BEN
    
    # Data sync status
    sync_status = Column(String(50), default=DataSyncStatus.PENDING.value)
    last_sync_at = Column(DateTime)
    sync_error = Column(Text)
    
    # Dashboard stats (cached for this BEN)
    total_applications = Column(Integer, default=0)
    total_funded = Column(Numeric(15, 2), default=0)
    total_pending = Column(Numeric(15, 2), default=0)
    total_denied = Column(Numeric(15, 2), default=0)
    active_appeals_count = Column(Integer, default=0)
    pending_deadlines_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    applicant_profile = relationship("ApplicantProfile", back_populates="monitored_bens")
    frn_records = relationship("ApplicantFRN", back_populates="applicant_ben", cascade="all, delete-orphan", 
                               foreign_keys="ApplicantFRN.applicant_ben_id")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ben": self.ben,
            "is_primary": self.is_primary,
            "display_name": self.display_name,
            "organization_name": self.organization_name,
            "state": self.state,
            "city": self.city,
            "entity_type": self.entity_type,
            "discount_rate": float(self.discount_rate) if self.discount_rate else None,
            "subscription_status": self.subscription_status,
            "is_paid": self.is_paid,
            "sync_status": self.sync_status,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "stats": {
                "total_applications": self.total_applications or 0,
                "total_funded": float(self.total_funded) if self.total_funded else 0,
                "total_pending": float(self.total_pending) if self.total_pending else 0,
                "total_denied": float(self.total_denied) if self.total_denied else 0,
                "active_appeals_count": self.active_appeals_count or 0,
                "pending_deadlines_count": self.pending_deadlines_count or 0,
            },
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ApplicantProfile(Base):
    """
    Applicant profile with their BEN (Billed Entity Number).
    The magic happens here - store BEN, and we fetch everything automatically.
    """
    __tablename__ = "applicant_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # The golden key - BEN (Billed Entity Number)
    ben = Column(String(50), nullable=False, index=True)
    
    # Organization info (auto-populated from USAC)
    organization_name = Column(String(255))
    state = Column(String(2))
    city = Column(String(100))
    entity_type = Column(String(100))
    discount_rate = Column(Numeric(5, 2))  # E-Rate discount percentage
    
    # Data sync status
    sync_status = Column(String(50), default=DataSyncStatus.PENDING.value)
    last_sync_at = Column(DateTime)
    sync_error = Column(Text)  # Error message if sync failed
    
    # Payment status (for gating data access)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime)
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))
    
    # Dashboard stats (cached for quick loading)
    total_applications = Column(Integer, default=0)
    total_funded = Column(Numeric(15, 2), default=0)
    total_pending = Column(Numeric(15, 2), default=0)
    total_denied = Column(Numeric(15, 2), default=0)
    active_appeals_count = Column(Integer, default=0)
    pending_deadlines_count = Column(Integer, default=0)
    
    # Settings
    settings = Column(JSON, default={})
    notification_preferences = Column(JSON, default={
        "email_deadline_reminders": True,
        "email_status_changes": True,
        "email_appeal_updates": True,
    })
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="applicant_profile")
    frn_records = relationship("ApplicantFRN", back_populates="applicant_profile", cascade="all, delete-orphan",
                               foreign_keys="ApplicantFRN.applicant_profile_id")
    auto_appeals = relationship("ApplicantAutoAppeal", back_populates="applicant_profile", cascade="all, delete-orphan")
    status_history = relationship("ApplicantStatusHistory", back_populates="applicant_profile", cascade="all, delete-orphan")
    monitored_bens = relationship("ApplicantBEN", back_populates="applicant_profile", cascade="all, delete-orphan")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "ben": self.ben,
            "organization_name": self.organization_name,
            "state": self.state,
            "city": self.city,
            "entity_type": self.entity_type,
            "discount_rate": float(self.discount_rate) if self.discount_rate else None,
            "sync_status": self.sync_status,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "is_paid": self.is_paid,
            "stats": {
                "total_applications": self.total_applications or 0,
                "total_funded": float(self.total_funded) if self.total_funded else 0,
                "total_pending": float(self.total_pending) if self.total_pending else 0,
                "total_denied": float(self.total_denied) if self.total_denied else 0,
                "active_appeals_count": self.active_appeals_count or 0,
                "pending_deadlines_count": self.pending_deadlines_count or 0,
            },
            "monitored_bens_count": len(self.monitored_bens) if self.monitored_bens else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def to_dashboard_dict(self) -> dict:
        """Extended data for dashboard view"""
        base = self.to_dict()
        base["frn_records"] = [frn.to_dict() for frn in self.frn_records] if self.frn_records else []
        base["auto_appeals"] = [appeal.to_dict() for appeal in self.auto_appeals] if self.auto_appeals else []
        base["recent_status_changes"] = [
            sh.to_dict() for sh in sorted(self.status_history, key=lambda x: x.changed_at, reverse=True)[:10]
        ] if self.status_history else []
        base["monitored_bens"] = [ben.to_dict() for ben in self.monitored_bens] if self.monitored_bens else []
        return base


class ApplicantFRN(Base):
    """
    Individual FRN (Funding Request Number) records for an applicant.
    Auto-fetched from USAC based on their BEN.
    
    Can be linked to either:
    - applicant_profile_id (legacy, for single-BEN users)
    - applicant_ben_id (multi-BEN support)
    """
    __tablename__ = "applicant_frns"
    
    id = Column(Integer, primary_key=True, index=True)
    applicant_profile_id = Column(Integer, ForeignKey("applicant_profiles.id"), nullable=False)
    applicant_ben_id = Column(Integer, ForeignKey("applicant_bens.id"), nullable=True)  # Link to specific BEN
    
    # FRN identification
    frn = Column(String(50), nullable=False, index=True)
    application_number = Column(String(50), index=True)
    funding_year = Column(Integer, nullable=False, index=True)
    
    # Status tracking
    status = Column(String(100), nullable=False)  # Raw status from USAC
    status_type = Column(String(50), default=FRNStatusType.UNKNOWN.value)  # Normalized status
    
    # Service info
    service_type = Column(String(100))  # Category 1 or 2
    service_description = Column(Text)
    
    # Funding amounts
    amount_requested = Column(Numeric(15, 2))
    amount_funded = Column(Numeric(15, 2))
    amount_disbursed = Column(Numeric(15, 2))
    discount_rate = Column(Numeric(5, 2))
    
    # Denial info (if applicable)
    is_denied = Column(Boolean, default=False)
    denial_reason = Column(Text)
    fcdl_comment = Column(Text)
    fcdl_date = Column(DateTime)
    appeal_deadline = Column(DateTime)
    
    # Invoice/Disbursement info
    invoice_deadline = Column(DateTime)
    last_invoice_date = Column(DateTime)
    disbursement_status = Column(String(100))
    
    # Review pipeline info (from FRN Status dataset)
    review_stage = Column(String(100))  # e.g., "Initial Review", "PIA Review", etc.
    pia_question_type = Column(String(255))  # Type of PIA question if any
    days_in_review = Column(Integer)
    
    # Raw data storage
    raw_data = Column(JSON)  # Full record from USAC
    
    # Timestamps
    fetched_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    applicant_profile = relationship("ApplicantProfile", back_populates="frn_records", 
                                     foreign_keys=[applicant_profile_id])
    applicant_ben = relationship("ApplicantBEN", back_populates="frn_records",
                                 foreign_keys=[applicant_ben_id])
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "frn": self.frn,
            "application_number": self.application_number,
            "funding_year": self.funding_year,
            "status": self.status,
            "status_type": self.status_type,
            "service_type": self.service_type,
            "service_description": self.service_description,
            "amount_requested": float(self.amount_requested) if self.amount_requested else None,
            "amount_funded": float(self.amount_funded) if self.amount_funded else None,
            "amount_disbursed": float(self.amount_disbursed) if self.amount_disbursed else None,
            "discount_rate": float(self.discount_rate) if self.discount_rate else None,
            "is_denied": self.is_denied,
            "denial_reason": self.denial_reason,
            "fcdl_comment": self.fcdl_comment,
            "fcdl_date": self.fcdl_date.isoformat() if self.fcdl_date else None,
            "appeal_deadline": self.appeal_deadline.isoformat() if self.appeal_deadline else None,
            "invoice_deadline": self.invoice_deadline.isoformat() if self.invoice_deadline else None,
            "disbursement_status": self.disbursement_status,
            "review_stage": self.review_stage,
            "days_in_review": self.days_in_review,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
        }


class ApplicantAutoAppeal(Base):
    """
    Auto-generated appeals for denied FRNs.
    These are created automatically when we detect a denial.
    "We don't need for the applicants to do anything" - appeals are ready to go!
    """
    __tablename__ = "applicant_auto_appeals"
    
    id = Column(Integer, primary_key=True, index=True)
    applicant_profile_id = Column(Integer, ForeignKey("applicant_profiles.id"), nullable=False)
    frn_id = Column(Integer, ForeignKey("applicant_frns.id"), nullable=False)
    
    # FRN reference (denormalized for easy access)
    frn = Column(String(50), nullable=False, index=True)
    funding_year = Column(Integer)
    
    # Denial info
    denial_reason = Column(Text)
    denial_category = Column(String(100))  # Categorized denial type
    
    # AI-generated appeal content
    appeal_strategy = Column(JSON)  # Strategy analysis
    appeal_letter = Column(Text)  # Ready-to-use appeal letter
    evidence_checklist = Column(JSON)  # What evidence to gather
    success_probability = Column(Numeric(5, 2))  # AI confidence score
    
    # Appeal status
    status = Column(String(50), default="ready")  # ready, reviewed, submitted, won, lost
    user_modified = Column(Boolean, default=False)  # Did user edit the appeal?
    
    # Chat history for refining the appeal
    chat_history = Column(JSON, default=list)
    
    # Deadline tracking
    appeal_deadline = Column(DateTime)
    days_until_deadline = Column(Integer)  # Calculated field
    
    # Timestamps
    generated_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime)
    submitted_at = Column(DateTime)
    outcome_at = Column(DateTime)
    
    # Relationships
    applicant_profile = relationship("ApplicantProfile", back_populates="auto_appeals")
    frn_record = relationship("ApplicantFRN")
    
    def to_dict(self) -> dict:
        days_left = None
        if self.appeal_deadline:
            delta = self.appeal_deadline - datetime.utcnow()
            days_left = max(0, delta.days)
        
        return {
            "id": self.id,
            "frn": self.frn,
            "funding_year": self.funding_year,
            "denial_reason": self.denial_reason,
            "denial_category": self.denial_category,
            "appeal_strategy": self.appeal_strategy,
            "appeal_letter": self.appeal_letter,
            "evidence_checklist": self.evidence_checklist,
            "success_probability": float(self.success_probability) if self.success_probability else None,
            "status": self.status,
            "user_modified": self.user_modified,
            "chat_history": self.chat_history or [],
            "appeal_deadline": self.appeal_deadline.isoformat() if self.appeal_deadline else None,
            "days_until_deadline": days_left,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


class ApplicantStatusHistory(Base):
    """
    Track all status changes for applicant's FRNs.
    This powers the "what changed since last login" feature.
    """
    __tablename__ = "applicant_status_history"
    
    id = Column(Integer, primary_key=True, index=True)
    applicant_profile_id = Column(Integer, ForeignKey("applicant_profiles.id"), nullable=False)
    frn_id = Column(Integer, ForeignKey("applicant_frns.id"), nullable=True)
    
    # What changed
    frn = Column(String(50), index=True)
    change_type = Column(String(50), nullable=False)  # status_change, new_denial, disbursement, deadline_approaching
    
    # Change details
    previous_value = Column(String(255))
    new_value = Column(String(255))
    description = Column(Text)  # Human-readable description
    
    # Importance
    is_important = Column(Boolean, default=False)  # Flag for critical changes
    is_read = Column(Boolean, default=False)  # User has seen this
    
    # Timestamps
    changed_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    applicant_profile = relationship("ApplicantProfile", back_populates="status_history")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "frn": self.frn,
            "change_type": self.change_type,
            "previous_value": self.previous_value,
            "new_value": self.new_value,
            "description": self.description,
            "is_important": self.is_important,
            "is_read": self.is_read,
            "changed_at": self.changed_at.isoformat() if self.changed_at else None,
        }
