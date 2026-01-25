"""
Consultant Models
Handles consultant profiles and their school portfolios
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class ConsultantProfile(Base):
    __tablename__ = "consultant_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # USAC Registration
    crn = Column(String(50), unique=True, index=True)  # Consultant Registration Number
    
    # Profile info
    company_name = Column(String(255))
    contact_name = Column(String(255))
    phone = Column(String(50))
    address = Column(Text)
    website = Column(String(255))
    
    # Settings (JSON for flexibility)
    settings = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="consultant_profile")
    schools = relationship("ConsultantSchool", back_populates="consultant_profile", cascade="all, delete-orphan")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "crn": self.crn,
            "company_name": self.company_name,
            "contact_name": self.contact_name,
            "phone": self.phone,
            "address": self.address,
            "website": self.website,
            "settings": self.settings or {},
            "school_count": len(self.schools) if self.schools else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ConsultantSchool(Base):
    """Schools in a consultant's portfolio"""
    __tablename__ = "consultant_schools"
    
    id = Column(Integer, primary_key=True, index=True)
    consultant_profile_id = Column(Integer, ForeignKey("consultant_profiles.id"), nullable=False)
    
    # School identification
    ben = Column(String(50), nullable=False, index=True)
    frn = Column(String(50), index=True)
    
    # School info (cached from USAC)
    school_name = Column(String(255))
    state = Column(String(2))
    city = Column(String(100))
    entity_type = Column(String(100))
    
    # Funding status (cached from USAC sync)
    status = Column(String(50))  # e.g., "Funded", "Has Denials", "Pending", "Unknown"
    status_color = Column(String(20))  # e.g., "green", "red", "yellow", "gray"
    latest_year = Column(Integer)  # Most recent funding year
    applications_count = Column(Integer, default=0)  # Number of applications
    
    # Notes
    notes = Column(Text)
    tags = Column(JSON, default=[])  # Custom tags for organization
    
    # Timestamps
    added_at = Column(DateTime, default=datetime.utcnow)
    last_synced = Column(DateTime)
    
    # Relationship
    consultant_profile = relationship("ConsultantProfile", back_populates="schools")
    
    __table_args__ = (
        UniqueConstraint('consultant_profile_id', 'ben', name='uq_consultant_school'),
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ben": self.ben,
            "frn": self.frn,
            "school_name": self.school_name,
            "state": self.state,
            "city": self.city,
            "entity_type": self.entity_type,
            "status": self.status,
            "status_color": self.status_color,
            "latest_year": self.latest_year,
            "applications_count": self.applications_count or 0,
            "notes": self.notes,
            "tags": self.tags or [],
            "added_at": self.added_at.isoformat() if self.added_at else None,
            "last_synced": self.last_synced.isoformat() if self.last_synced else None,
        }
