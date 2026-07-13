"""
Pilot FRN Snapshot Model
Stores a cached snapshot of Cybersecurity Pilot Program FCC Form 471 FRNs per vendor SPIN.
Refreshed nightly by a background job so vendor pilot views load instantly and so
status changes can be diffed over time (feeds the same alert/digest system as E-Rate FRNs).

The Cybersecurity Pilot is a SEPARATE USAC program from E-Rate; its FRNs use a distinct
id space (CBR...), so it lives in its own table rather than admin_frn_snapshots.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Index
from sqlalchemy.sql import func

from ..core.database import Base


class PilotFRNSnapshot(Base):
    __tablename__ = "pilot_frn_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    frn = Column(String(64), nullable=False, index=True)  # CBR99xxxxxxxx
    pilot_471_number = Column(String(64), nullable=True)   # CBR253xxxxxx
    pilot_471_nickname = Column(String(256), nullable=True)
    status = Column(String(128), nullable=True)            # frn_status (Funded/Denied/Pending)
    application_status = Column(String(128), nullable=True)
    window_status = Column(String(64), nullable=True)
    amount_requested = Column(Float, nullable=True, default=0)
    amount_committed = Column(Float, nullable=True, default=0)
    discount_rate = Column(Float, nullable=True, default=0)
    service_type = Column(String(256), nullable=True)
    organization_name = Column(String(512), nullable=True)
    entity_type = Column(String(128), nullable=True)
    ben = Column(String(64), nullable=True, index=True)
    state = Column(String(8), nullable=True)
    city = Column(String(128), nullable=True)
    user_id = Column(Integer, nullable=True)
    user_email = Column(String(256), nullable=True)
    spin = Column(String(64), nullable=True, index=True)
    spin_name = Column(String(255), nullable=True)
    fcdl_date = Column(String(64), nullable=True)
    last_updated = Column(String(64), nullable=True)
    service_delivery_deadline = Column(String(64), nullable=True)
    invoice_deadline = Column(String(64), nullable=True)
    contract_award_date = Column(String(64), nullable=True)
    contract_expiration_date = Column(String(64), nullable=True)
    fcc_form_470_number = Column(String(64), nullable=True)
    invoicing_method = Column(String(256), nullable=True)
    line_item_count = Column(Integer, nullable=True, default=0)
    last_refreshed = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_pilot_frn_snap_spin", "spin"),
        Index("ix_pilot_frn_snap_status", "status"),
    )

    def to_dict(self) -> dict:
        return {
            "frn": self.frn,
            "pilot_471_number": self.pilot_471_number,
            "pilot_471_nickname": self.pilot_471_nickname,
            "status": self.status,
            "application_status": self.application_status,
            "window_status": self.window_status,
            "requested_amount": self.amount_requested or 0,
            "committed_amount": self.amount_committed or 0,
            "discount_rate": self.discount_rate or 0,
            "service_type": self.service_type,
            "entity_name": self.organization_name,
            "entity_type": self.entity_type,
            "ben": self.ben,
            "state": self.state,
            "city": self.city,
            "spin": self.spin,
            "spin_name": self.spin_name,
            "fcdl_date": self.fcdl_date,
            "last_updated": self.last_updated,
            "service_delivery_deadline": self.service_delivery_deadline,
            "invoice_deadline": self.invoice_deadline,
            "contract_award_date": self.contract_award_date,
            "contract_expiration_date": self.contract_expiration_date,
            "fcc_form_470_number": self.fcc_form_470_number,
            "invoicing_method": self.invoicing_method,
            "line_item_count": self.line_item_count or 0,
            "last_refreshed": self.last_refreshed.isoformat() if self.last_refreshed else None,
        }
