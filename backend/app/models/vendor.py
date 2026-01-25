"""
Vendor Models
Handles vendor profiles and search history
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, ARRAY
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class VendorProfile(Base):
    __tablename__ = "vendor_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # USAC Registration
    spin = Column(String(50), unique=True, index=True)  # Service Provider Identification Number
    
    # Profile info
    company_name = Column(String(255))
    contact_name = Column(String(255))
    phone = Column(String(50))
    address = Column(Text)
    website = Column(String(255))
    
    # Products/Services offered (for matching with E-Rate requests)
    equipment_types = Column(JSON, default=[])  # e.g., ["routers", "switches", "access points"]
    services_offered = Column(JSON, default=[])  # e.g., ["Internet Access", "WLAN"]
    service_areas = Column(JSON, default=[])  # States they operate in
    
    # Contact preferences
    contact_preferences = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="vendor_profile")
    searches = relationship("VendorSearch", back_populates="vendor_profile", cascade="all, delete-orphan")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "spin": self.spin,
            "company_name": self.company_name,
            "contact_name": self.contact_name,
            "phone": self.phone,
            "address": self.address,
            "website": self.website,
            "equipment_types": self.equipment_types or [],
            "services_offered": self.services_offered or [],
            "service_areas": self.service_areas or [],
            "search_count": len(self.searches) if self.searches else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class VendorSearch(Base):
    """Vendor search history for analytics and saved searches"""
    __tablename__ = "vendor_searches"
    
    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(Integer, ForeignKey("vendor_profiles.id"), nullable=False)
    
    # Search parameters
    search_name = Column(String(255))  # Optional name for saved searches
    search_params = Column(JSON, nullable=False)  # Filters used
    
    # Results summary
    results_count = Column(Integer, default=0)
    
    # Export tracking
    exported = Column(DateTime)  # When leads were exported
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationship
    vendor_profile = relationship("VendorProfile", back_populates="searches")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "search_name": self.search_name,
            "search_params": self.search_params,
            "results_count": self.results_count,
            "exported": self.exported.isoformat() if self.exported else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
