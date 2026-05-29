"""
Vendor Form 470 Snapshot Model
Stores a cached snapshot of Form 470 leads fetched from USAC.
Refreshed daily by a background scheduler job so the vendor leads
endpoint responds in <500ms from local MySQL instead of 60s+ from USAC.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Index
from sqlalchemy.sql import func

from ..core.database import Base


class VendorForm470Snapshot(Base):
    __tablename__ = "vendor_form470_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    application_number = Column(String(64), nullable=False, index=True)
    funding_year = Column(String(16), nullable=True, index=True)
    ben = Column(String(64), nullable=True, index=True)
    entity_name = Column(String(512), nullable=True)
    state = Column(String(8), nullable=True, index=True)
    city = Column(String(256), nullable=True)
    applicant_type = Column(String(128), nullable=True)
    status = Column(String(128), nullable=True)
    posting_date = Column(String(64), nullable=True)
    allowable_contract_date = Column(String(64), nullable=True)
    contact_name = Column(String(256), nullable=True)
    contact_email = Column(String(256), nullable=True)
    contact_phone = Column(String(64), nullable=True)
    technical_contact = Column(String(256), nullable=True)
    technical_email = Column(String(256), nullable=True)
    technical_phone = Column(String(64), nullable=True)
    cat1_description = Column(Text, nullable=True)
    cat2_description = Column(Text, nullable=True)
    # JSON-encoded arrays
    services_json = Column(Text, nullable=True)
    manufacturers_json = Column(Text, nullable=True)
    service_types_json = Column(Text, nullable=True)
    categories_json = Column(Text, nullable=True)
    # C2 budget enrichment
    c2_budget_total = Column(Float, nullable=True)
    c2_budget_available = Column(Float, nullable=True)
    c2_budget_cycle = Column(String(32), nullable=True)
    # Metadata
    last_refreshed = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_v470_snap_year_state", "funding_year", "state"),
        Index("ix_v470_snap_posting", "posting_date"),
    )
