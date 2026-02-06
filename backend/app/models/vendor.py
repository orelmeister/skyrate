"""
Vendor Models
Handles vendor profiles and search history
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, ARRAY, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta

from ..core.database import Base

# Default cache expiry in days
ENRICHMENT_CACHE_EXPIRY_DAYS = 90


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
    saved_leads = relationship("SavedLead", back_populates="vendor_profile", cascade="all, delete-orphan")
    
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


class SavedLead(Base):
    """Saved leads for vendor follow-up and management"""
    __tablename__ = "saved_leads"
    
    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(Integer, ForeignKey("vendor_profiles.id"), nullable=False)
    
    # Lead identification
    form_type = Column(String(10), nullable=False)  # '470' or '471'
    application_number = Column(String(50), nullable=False)
    ben = Column(String(50), nullable=False)  # Billed Entity Number
    frn = Column(String(50))  # FRN (Funding Request Number)
    
    # Entity info (denormalized for quick display)
    entity_name = Column(String(500))
    entity_type = Column(String(100))
    entity_state = Column(String(10))
    entity_city = Column(String(100))
    entity_address = Column(String(500))
    entity_zip = Column(String(20))
    entity_phone = Column(String(50))
    entity_website = Column(String(255))
    
    # Contact info (denormalized - primary contact)
    contact_name = Column(String(255))
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    contact_title = Column(String(100))
    
    # All contacts (from USAC enrichment)
    all_contacts = Column(JSON, default=[])  # Array of {name, title, email, phone, role, source}
    
    # Enriched contact info (from Hunter.io, etc)
    enriched_data = Column(JSON, default={})  # LinkedIn URL, additional contacts, etc
    enrichment_date = Column(DateTime)  # When data was enriched
    
    # Status tracking
    lead_status = Column(String(50), default='new')  # new, contacted, qualified, won, lost
    notes = Column(Text)
    tags = Column(JSON, default=[])  # User-defined tags
    
    # Application/FRN status from USAC
    application_status = Column(String(50))  # From Form 471 Basic
    frn_status = Column(String(50))  # Funded, Denied, Pending, etc.
    
    # Funding details
    funding_year = Column(Integer)
    funding_amount = Column(Integer, default=0)  # Pre-discount cost
    committed_amount = Column(Integer, default=0)
    funded_amount = Column(Integer, default=0)
    categories = Column(JSON, default=[])
    services = Column(JSON, default=[])
    service_type = Column(String(255))  # Primary service type
    manufacturers = Column(JSON, default=[])
    
    # Source data (raw USAC data for reference)
    source_data = Column(JSON, default={})
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    vendor_profile = relationship("VendorProfile", back_populates="saved_leads")
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "form_type": self.form_type,
            "application_number": self.application_number,
            "ben": self.ben,
            "frn": self.frn,
            "entity_name": self.entity_name,
            "entity_type": self.entity_type,
            "entity_state": self.entity_state,
            "entity_city": self.entity_city,
            "entity_address": self.entity_address,
            "entity_zip": self.entity_zip,
            "entity_phone": self.entity_phone,
            "entity_website": self.entity_website,
            "contact_name": self.contact_name,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "contact_title": self.contact_title,
            "all_contacts": self.all_contacts or [],
            "enriched_data": self.enriched_data or {},
            "enrichment_date": self.enrichment_date.isoformat() if self.enrichment_date else None,
            "lead_status": self.lead_status,
            "notes": self.notes,
            "tags": self.tags or [],
            "application_status": self.application_status,
            "frn_status": self.frn_status,
            "funding_year": self.funding_year,
            "funding_amount": self.funding_amount,
            "committed_amount": self.committed_amount,
            "funded_amount": self.funded_amount,
            "categories": self.categories or [],
            "services": self.services or [],
            "service_type": self.service_type,
            "manufacturers": self.manufacturers or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OrganizationEnrichmentCache(Base):
    """
    Cache for organization enrichment data.
    
    Stores enriched contact information at the organization/domain level
    so multiple vendors looking at the same organization don't trigger
    duplicate API calls and credit usage.
    
    Cache Strategy:
    - Key: domain (unique)
    - Expiry: 90 days (contacts change jobs/emails)
    - Access tracking: know which orgs are popular
    """
    __tablename__ = "organization_enrichment_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Organization identification - domain is the primary key for lookups
    domain = Column(String(255), unique=True, index=True, nullable=False)  # e.g., "cnyric.org"
    ben = Column(String(20), index=True, nullable=True)  # USAC BEN if available
    organization_name = Column(String(500))
    
    # Cached enrichment data (JSON blobs)
    company_data = Column(JSON, default={})  # Company profile info
    contacts = Column(JSON, default=[])  # Array of enriched contacts
    primary_contact = Column(JSON, default={})  # The main contact found
    
    # LinkedIn search URLs (pre-generated, free)
    linkedin_search_url = Column(String(500))
    org_linkedin_search_url = Column(String(500))
    
    # Source and cost tracking
    enrichment_source = Column(String(50), default='hunter')  # 'hunter', 'apollo', 'manual', etc.
    credits_used = Column(Integer, default=0)  # Total credits spent on this org
    
    # Cache management
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime)  # When to refresh (default: 90 days from created)
    
    # Access tracking - useful for analytics
    last_accessed_at = Column(DateTime, default=datetime.utcnow)
    access_count = Column(Integer, default=1)  # How many times data was served from cache
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Set expiry date if not provided
        if not self.expires_at:
            self.expires_at = datetime.utcnow() + timedelta(days=ENRICHMENT_CACHE_EXPIRY_DAYS)
    
    @property
    def is_expired(self) -> bool:
        """Check if cache entry has expired."""
        if not self.expires_at:
            return True
        return datetime.utcnow() > self.expires_at
    
    @property
    def is_stale(self) -> bool:
        """Check if cache is getting old (>30 days) but not yet expired."""
        if not self.created_at:
            return True
        age_days = (datetime.utcnow() - self.created_at).days
        return age_days > 30
    
    def record_access(self):
        """Record that this cache entry was accessed."""
        self.last_accessed_at = datetime.utcnow()
        self.access_count = (self.access_count or 0) + 1
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "domain": self.domain,
            "ben": self.ben,
            "organization_name": self.organization_name,
            "company_data": self.company_data or {},
            "contacts": self.contacts or [],
            "primary_contact": self.primary_contact or {},
            "linkedin_search_url": self.linkedin_search_url,
            "org_linkedin_search_url": self.org_linkedin_search_url,
            "enrichment_source": self.enrichment_source,
            "credits_used": self.credits_used,
            "is_expired": self.is_expired,
            "is_stale": self.is_stale,
            "access_count": self.access_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "last_accessed_at": self.last_accessed_at.isoformat() if self.last_accessed_at else None,
        }
    
    def to_enrichment_result(self) -> dict:
        """Convert cache entry to the format expected by the enrichment API response."""
        return {
            "success": True,
            "person": self.primary_contact or {},
            "company": self.company_data or {},
            "additional_contacts": self.contacts or [],
            "linkedin_search_url": self.linkedin_search_url,
            "org_linkedin_search_url": self.org_linkedin_search_url,
            "source": self.enrichment_source,
            "enriched_at": self.updated_at.isoformat() if self.updated_at else self.created_at.isoformat() if self.created_at else None,
            "credits_used": 0,  # No credits used when serving from cache!
            "from_cache": True,
            "cache_age_days": (datetime.utcnow() - self.created_at).days if self.created_at else 0,
            "api_available": True,
        }
