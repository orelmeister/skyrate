"""
Predictive Lead Intelligence Models
Stores pre-computed predictions for vendor lead generation.
Premium feature ($499/mo addon).
"""

import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, JSON, Enum, Index
from datetime import datetime

from ..core.database import Base


class PredictionType(str, enum.Enum):
    """Types of predictions we generate"""
    CONTRACT_EXPIRY = "contract_expiry"          # Contract about to expire
    EQUIPMENT_REFRESH = "equipment_refresh"      # Aging equipment needs replacement
    C2_BUDGET_RESET = "c2_budget_reset"          # Category 2 budget cycle resetting
    HISTORICAL_PATTERN = "historical_pattern"    # Historical rebid patterns


class PredictionStatus(str, enum.Enum):
    """Status of a predicted lead"""
    NEW = "new"
    VIEWED = "viewed"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    DISMISSED = "dismissed"


class PredictedLead(Base):
    """
    A pre-computed predicted lead for vendor outreach.
    Generated weekly by the prediction engine from USAC data.
    """
    __tablename__ = "predicted_leads"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Which vendor this prediction is for (null = global, assigned on premium access)
    vendor_profile_id = Column(Integer, ForeignKey("vendor_profiles.id"), nullable=True, index=True)
    
    # Prediction metadata
    prediction_type = Column(Enum(PredictionType), nullable=False, index=True)
    confidence_score = Column(Float, nullable=False, default=0.5)  # 0.0 - 1.0
    prediction_reason = Column(Text, nullable=False)  # Human-readable explanation
    
    # When is this opportunity expected
    predicted_action_date = Column(DateTime, nullable=True)  # When they'll likely need to act
    
    # Entity / School info (denormalized for fast queries)
    ben = Column(String(20), nullable=False, index=True)
    organization_name = Column(String(500), nullable=False)
    state = Column(String(10), nullable=False, index=True)
    city = Column(String(255), nullable=True)
    entity_type = Column(String(100), nullable=True)  # School District, Library, etc.
    
    # Contact info (from USAC data)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    
    # Funding / Financial context
    funding_year = Column(Integer, nullable=True)
    discount_rate = Column(Float, nullable=True)
    estimated_deal_value = Column(Float, nullable=True)  # Estimated contract value
    
    # Equipment / Service details (for matching to vendor capabilities)
    service_type = Column(String(255), nullable=True)  # e.g. "Internal Connections"
    manufacturer = Column(String(255), nullable=True, index=True)  # e.g. "Meraki", "Aruba"
    equipment_model = Column(String(500), nullable=True)
    product_type = Column(String(255), nullable=True)  # e.g. "Switches", "Access Points"
    
    # Contract details (for CONTRACT_EXPIRY type)
    contract_expiration_date = Column(DateTime, nullable=True)
    contract_number = Column(String(100), nullable=True)
    current_spin = Column(String(50), nullable=True)  # Current service provider
    current_provider_name = Column(String(255), nullable=True)
    
    # C2 Budget details (for C2_BUDGET_RESET type)
    c2_budget_total = Column(Float, nullable=True)
    c2_budget_remaining = Column(Float, nullable=True)
    c2_budget_cycle = Column(String(50), nullable=True)  # e.g. "FY2021-2025"
    
    # Source data references
    application_number = Column(String(50), nullable=True)
    frn = Column(String(50), nullable=True)  # Funding Request Number
    source_dataset = Column(String(100), nullable=True)  # Which USAC dataset
    
    # Status tracking
    status = Column(Enum(PredictionStatus), default=PredictionStatus.NEW, nullable=False)
    
    # Batch tracking
    batch_id = Column(String(100), nullable=True, index=True)  # Groups predictions from same run
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # When this prediction is no longer relevant
    
    # Composite indexes for common queries
    __table_args__ = (
        Index("ix_predicted_leads_type_state", "prediction_type", "state"),
        Index("ix_predicted_leads_manufacturer", "manufacturer"),
        Index("ix_predicted_leads_vendor_status", "vendor_profile_id", "status"),
        Index("ix_predicted_leads_batch", "batch_id", "created_at"),
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "vendor_profile_id": self.vendor_profile_id,
            "prediction_type": self.prediction_type.value if self.prediction_type else None,
            "confidence_score": self.confidence_score,
            "prediction_reason": self.prediction_reason,
            "predicted_action_date": self.predicted_action_date.isoformat() if self.predicted_action_date else None,
            # Entity
            "ben": self.ben,
            "organization_name": self.organization_name,
            "state": self.state,
            "city": self.city,
            "entity_type": self.entity_type,
            # Contact
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            # Financial
            "funding_year": self.funding_year,
            "discount_rate": self.discount_rate,
            "estimated_deal_value": self.estimated_deal_value,
            # Equipment
            "service_type": self.service_type,
            "manufacturer": self.manufacturer,
            "equipment_model": self.equipment_model,
            "product_type": self.product_type,
            # Contract
            "contract_expiration_date": self.contract_expiration_date.isoformat() if self.contract_expiration_date else None,
            "contract_number": self.contract_number,
            "current_spin": self.current_spin,
            "current_provider_name": self.current_provider_name,
            # C2 Budget
            "c2_budget_total": self.c2_budget_total,
            "c2_budget_remaining": self.c2_budget_remaining,
            "c2_budget_cycle": self.c2_budget_cycle,
            # Source
            "application_number": self.application_number,
            "frn": self.frn,
            "source_dataset": self.source_dataset,
            # Status
            "status": self.status.value if self.status else None,
            "batch_id": self.batch_id,
            # Timestamps
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


class PredictionRefreshLog(Base):
    """Tracks prediction refresh job runs"""
    __tablename__ = "prediction_refresh_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(100), nullable=False, unique=True)
    
    # Job execution details
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(50), default="running")  # running, completed, failed
    
    # Results summary
    total_predictions = Column(Integer, default=0)
    contract_expiry_count = Column(Integer, default=0)
    equipment_refresh_count = Column(Integer, default=0)
    c2_budget_reset_count = Column(Integer, default=0)
    historical_pattern_count = Column(Integer, default=0)
    
    # Error tracking
    errors = Column(JSON, default=[])
    
    # Performance
    duration_seconds = Column(Float, nullable=True)
