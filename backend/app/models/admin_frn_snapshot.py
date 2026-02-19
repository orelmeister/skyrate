"""
Admin FRN Snapshot Model
Stores a cached snapshot of ALL FRN records across all users.
Refreshed every 6 hours by a background job so the admin FRN monitor loads instantly.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Index
from sqlalchemy.sql import func

from ..core.database import Base


class AdminFRNSnapshot(Base):
    __tablename__ = "admin_frn_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    frn = Column(String(64), nullable=False, index=True)
    status = Column(String(128), nullable=True)
    funding_year = Column(String(16), nullable=True)
    amount_requested = Column(Float, nullable=True, default=0)
    amount_committed = Column(Float, nullable=True, default=0)
    service_type = Column(String(128), nullable=True)
    organization_name = Column(String(512), nullable=True)
    ben = Column(String(64), nullable=True, index=True)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(256), nullable=True)
    source = Column(String(32), nullable=True)  # consultant / applicant / vendor
    fcdl_date = Column(String(64), nullable=True)
    last_refreshed = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_admin_frn_snap_org", "organization_name"),
        Index("ix_admin_frn_snap_status", "status"),
    )
