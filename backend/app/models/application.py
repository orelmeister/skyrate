"""
Application & School Models
Handles school snapshots, applications, and appeal records
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from decimal import Decimal

from ..core.database import Base


class SchoolSnapshot(Base):
    """Cached USAC data for a school (BEN) in a funding year"""
    __tablename__ = "school_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # School identification
    ben = Column(String(50), nullable=False, index=True)
    funding_year = Column(Integer, nullable=False, index=True)
    
    # Cached school info
    organization_name = Column(String(255))
    state = Column(String(2))
    city = Column(String(100))
    entity_type = Column(String(100))
    
    # Full snapshot data (JSON blob from USAC API)
    snapshot_data = Column(JSON, nullable=False)
    
    # Funding summary (calculated)
    total_committed = Column(Numeric(15, 2), default=0)
    total_disbursed = Column(Numeric(15, 2), default=0)
    applications_count = Column(Integer, default=0)
    
    # Timestamps
    fetched_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    applications = relationship("Application", back_populates="school_snapshot", cascade="all, delete-orphan")
    
    __table_args__ = (
        UniqueConstraint('ben', 'funding_year', name='uq_school_year'),
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ben": self.ben,
            "funding_year": self.funding_year,
            "organization_name": self.organization_name,
            "state": self.state,
            "city": self.city,
            "entity_type": self.entity_type,
            "total_committed": float(self.total_committed) if self.total_committed else 0,
            "total_disbursed": float(self.total_disbursed) if self.total_disbursed else 0,
            "applications_count": self.applications_count,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
        }


class Application(Base):
    """E-Rate application/FRN record"""
    __tablename__ = "applications"
    
    id = Column(Integer, primary_key=True, index=True)
    school_snapshot_id = Column(Integer, ForeignKey("school_snapshots.id"), nullable=False)
    
    # Application identification
    application_number = Column(String(50), index=True)
    frn = Column(String(50), index=True)  # Funding Request Number
    funding_year = Column(Integer)
    
    # Status
    status = Column(String(100))  # Funded, Denied, Pending, etc.
    
    # Amounts
    amount_requested = Column(Numeric(15, 2))  # Pre-discount
    amount_funded = Column(Numeric(15, 2))  # Approved amount
    discount_rate = Column(Numeric(5, 2))  # Discount percentage
    
    # Service details
    service_type = Column(String(100))  # Category 1 or 2
    service_description = Column(Text)
    
    # Denial info
    fcdl_comment = Column(Text)  # FCDL denial comments
    denial_reasons = Column(JSON)  # Parsed denial reasons
    appeal_deadline = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    school_snapshot = relationship("SchoolSnapshot", back_populates="applications")
    appeals = relationship("AppealRecord", back_populates="application", cascade="all, delete-orphan")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "application_number": self.application_number,
            "frn": self.frn,
            "funding_year": self.funding_year,
            "status": self.status,
            "amount_requested": float(self.amount_requested) if self.amount_requested else None,
            "amount_funded": float(self.amount_funded) if self.amount_funded else None,
            "discount_rate": float(self.discount_rate) if self.discount_rate else None,
            "service_type": self.service_type,
            "service_description": self.service_description,
            "fcdl_comment": self.fcdl_comment,
            "denial_reasons": self.denial_reasons,
            "appeal_deadline": self.appeal_deadline.isoformat() if self.appeal_deadline else None,
            "has_appeals": len(self.appeals) > 0 if self.appeals else False,
        }


class AppealRecord(Base):
    """Generated appeal records for denied applications"""
    __tablename__ = "appeal_records"
    
    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    
    # Appeal content
    appeal_text = Column(Text)  # Generated appeal letter
    strategy = Column(JSON)  # Appeal strategy from AI
    evidence = Column(JSON)  # Evidence pack
    
    # Status
    status = Column(String(50), default="draft")  # draft, submitted, won, lost
    submitted_at = Column(DateTime)
    outcome = Column(String(50))
    outcome_notes = Column(Text)
    
    # Timestamps
    generated_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    application = relationship("Application", back_populates="appeals")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "application_id": self.application_id,
            "appeal_text": self.appeal_text,
            "strategy": self.strategy,
            "status": self.status,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "outcome": self.outcome,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


class QueryHistory(Base):
    """User query history for analytics and quick access"""
    __tablename__ = "query_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Query details
    query_text = Column(Text, nullable=False)
    display_title = Column(String(255))
    interpretation = Column(JSON)  # AI interpretation result
    
    # Results
    results_count = Column(Integer, default=0)
    
    # Timestamps
    executed_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    user = relationship("User", back_populates="query_history")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "query_text": self.query_text,
            "display_title": self.display_title,
            "interpretation": self.interpretation,
            "results_count": self.results_count,
            "executed_at": self.executed_at.isoformat() if self.executed_at else None,
        }
