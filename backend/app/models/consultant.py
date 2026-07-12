"""
Consultant Models
Handles consultant profiles and their school portfolios
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class ConsultantProfile(Base):
    __tablename__ = "consultant_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # USAC Registration (legacy single CRN - kept for backward compat)
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
    crns = relationship("ConsultantCRN", back_populates="consultant_profile", cascade="all, delete-orphan")
    
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
            "crn_count": len(self.crns) if hasattr(self, 'crns') and self.crns else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ConsultantCRN(Base):
    """Tracks multiple CRNs per consultant. First CRN is included with subscription.
    Additional CRNs require a separate $499/mo or $4,999/yr subscription each.
    Super/admin/test accounts get unlimited free CRNs."""
    __tablename__ = "consultant_crns"
    
    id = Column(Integer, primary_key=True, index=True)
    consultant_profile_id = Column(Integer, ForeignKey("consultant_profiles.id"), nullable=False)
    
    # CRN data
    crn = Column(String(50), nullable=False, index=True)
    company_name = Column(String(255))  # Consultant org name from USAC
    phone = Column(String(50))
    is_primary = Column(Boolean, default=False)  # First/primary CRN (included with subscription)
    is_verified = Column(Boolean, default=False)
    verified_at = Column(DateTime)
    
    # Payment tracking
    is_free = Column(Boolean, default=False)  # True for super/admin/test accounts or primary CRN
    stripe_subscription_id = Column(String(255), nullable=True)  # Stripe sub for paid additional CRNs
    payment_status = Column(String(50), default="active")  # active, canceled, past_due
    
    # Stats
    schools_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    consultant_profile = relationship("ConsultantProfile", back_populates="crns")
    
    __table_args__ = (
        UniqueConstraint('consultant_profile_id', 'crn', name='uq_consultant_crn'),
    )
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "crn": self.crn,
            "company_name": self.company_name,
            "phone": self.phone,
            "is_primary": self.is_primary,
            "is_verified": self.is_verified,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "is_free": self.is_free,
            "payment_status": self.payment_status,
            "schools_count": self.schools_count,
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
    source_crn = Column(String(50), nullable=True, index=True)  # Which CRN this school was imported from
    
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

    # Letter of Agency (LOA) tracking — consultant marks whether a signed LOA is
    # on file for this school (E-Rate requires an LOA authorizing the consultant).
    loa_on_file = Column(Boolean, default=False, nullable=False)
    loa_reference = Column(String(255), nullable=True)  # optional filename / note
    loa_marked_at = Column(DateTime, nullable=True)

    # Equipment & Wishlist — "Happy with current" quick flag: the school is
    # satisfied with existing equipment and is not requesting a refresh this cycle.
    happy_with_current = Column(Boolean, default=False, nullable=False)

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
            "source_crn": self.source_crn,
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
            "loa_on_file": bool(self.loa_on_file),
            "loa_reference": self.loa_reference,
            "loa_marked_at": self.loa_marked_at.isoformat() if self.loa_marked_at else None,
            "happy_with_current": bool(self.happy_with_current),
            "added_at": self.added_at.isoformat() if self.added_at else None,
            "last_synced": self.last_synced.isoformat() if self.last_synced else None,
        }


class ConsultantEquipmentItem(Base):
    """Equipment inventory & wishlist items for a school in a consultant's portfolio.

    Powers the Equipment & Wishlist area:
      - ``kind`` splits Current Inventory ("inventory") vs Wishlist ("wishlist")
      - ``category`` groups by E-Rate Category 1 ("C1") / Category 2 ("C2")
      - Category 2 items can carry a maintenance term (Break/Fix vs MIBS) with dates
    """
    __tablename__ = "consultant_equipment_items"

    id = Column(Integer, primary_key=True, index=True)
    consultant_profile_id = Column(Integer, ForeignKey("consultant_profiles.id"), nullable=False, index=True)
    ben = Column(String(50), nullable=False, index=True)

    kind = Column(String(20), nullable=False, default="inventory")      # "inventory" | "wishlist"
    category = Column(String(4), nullable=False, default="C2")          # "C1" | "C2"

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    quantity = Column(Integer, default=1)

    # Category 2 maintenance term (only meaningful when category == "C2")
    # maintenance_type: None | "break_fix" (Basic Maintenance / Break-Fix) | "mibs" (Managed Internal Broadband Services)
    maintenance_type = Column(String(20), nullable=True)
    term_start = Column(DateTime, nullable=True)
    term_end = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('id', name='uq_consultant_equipment_id'),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ben": self.ben,
            "kind": self.kind,
            "category": self.category,
            "name": self.name,
            "description": self.description,
            "quantity": self.quantity or 0,
            "maintenance_type": self.maintenance_type,
            "term_start": self.term_start.isoformat() if self.term_start else None,
            "term_end": self.term_end.isoformat() if self.term_end else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ConsultantDocument(Base):
    """Document records attached to a school's Equipment area.

    Supports two clearly-separated upload zones:
      - ``doc_type`` "bid"      = vendor bid response documents
      - ``doc_type`` "form470"  = Form 470 posting documents

    NOTE: this stores document METADATA (name/note/type) only. Binary file
    storage requires object-storage infra and is intentionally deferred; the
    consultant records what has been received per zone.
    """
    __tablename__ = "consultant_documents"

    id = Column(Integer, primary_key=True, index=True)
    consultant_profile_id = Column(Integer, ForeignKey("consultant_profiles.id"), nullable=False, index=True)
    ben = Column(String(50), nullable=False, index=True)

    doc_type = Column(String(20), nullable=False, default="bid")  # "bid" | "form470"
    name = Column(String(255), nullable=False)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "ben": self.ben,
            "doc_type": self.doc_type,
            "name": self.name,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }