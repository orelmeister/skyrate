"""
Vendor FRN Note Model (B8)

A single free-form manual note a vendor keeps against one FRN. This is the
lightweight, standalone note affordance surfaced in the vendor "FRN Status" view
and is intentionally separate from the richer VendorFrnTracking annotations
(working sub-status / install / co-pay / PIA).

One row per (vendor profile, FRN). Upserted from the vendor portal and scoped to
the account OWNER's vendor_profile_id so team seats share one view.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, UniqueConstraint
from datetime import datetime

from ..core.database import Base


class VendorFrnNote(Base):
    """Vendor-maintained free-form note for a single FRN."""

    __tablename__ = "vendor_frn_notes"
    __table_args__ = (
        UniqueConstraint("vendor_profile_id", "frn", name="uq_vendor_frn_notes_profile_frn"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(Integer, nullable=False, index=True)
    frn = Column(String(50), nullable=False, index=True)
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "frn": self.frn,
            "note": self.note,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
