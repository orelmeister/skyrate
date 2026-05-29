"""
FRN Disbursement Model
Stores disbursement data from USAC disbursements dataset.
Refreshed daily by a background scheduler job.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Index
from sqlalchemy.sql import func

from ..core.database import Base


class FRNDisbursement(Base):
    __tablename__ = "frn_disbursements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    frn = Column(String(64), nullable=False, index=True)
    funding_year = Column(String(16), nullable=True, index=True)
    total_authorized_disbursement = Column(Float, nullable=True, default=0)
    last_invoice_date = Column(Date, nullable=True)
    invoicing_mode = Column(String(8), nullable=True)  # 'BEAR' | 'SPI' | 'MIX'
    disbursement_count = Column(Integer, nullable=True, default=0)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_frn_disb_frn_year", "frn", "funding_year", unique=True),
    )
