"""
Applicant FRN Tracking Model

Per-FRN manual annotations an applicant maintains on top of the raw USAC data.
These are working fields USAC does not provide — the applicant's own view of
where each funding request stands in their workflow. This is the applicant-side
parallel of ``ConsultantFrnTracking`` / ``VendorFrnTracking``.

Covers the same working asks as the consultant/vendor trackers:
  - A4/A5: a controlled working sub-status (replaces free-text status entry) incl. Wave Ready
  - A6:    equipment installation tracking (installed? + date)
  - A7:    non-discounted co-pay / applicant-share payment tracking
  - PIA:   Program Integrity Assurance review tracking (outstanding vs completed)

One row per (applicant user, FRN). Upserted from the applicant portal, scoped to
the account owner.

The allowed value lists (WORKING_STATUS_VALUES / PIA_STATUS_VALUES) are imported
from ``consultant_frn_tracking`` so the trackers stay in sync — do NOT redefine
them here.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Date, Text, ForeignKey, UniqueConstraint
from datetime import datetime

from ..core.database import Base
# Single source of truth for the allowed value sets — shared with the consultant
# tracker so the dropdowns / validation never drift apart.
from .consultant_frn_tracking import WORKING_STATUS_VALUES, PIA_STATUS_VALUES  # noqa: F401


class ApplicantFrnTracking(Base):
    """Applicant-maintained working annotations for a single FRN."""

    __tablename__ = "applicant_frn_tracking"
    __table_args__ = (
        UniqueConstraint("applicant_user_id", "frn", name="uq_applicant_frn_tracking_user_frn"),
    )

    id = Column(Integer, primary_key=True, index=True)
    applicant_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # FRN identity
    frn = Column(String(50), nullable=False, index=True)
    ben = Column(String(50), nullable=True, index=True)

    # A4/A5 — controlled working sub-status (nullable = defer to USAC status)
    working_status = Column(String(40), nullable=True)

    # A6 — equipment installation tracking
    installed = Column(Boolean, nullable=False, default=False)
    install_date = Column(Date, nullable=True)

    # A7 — non-discounted co-pay / applicant-share payment tracking
    copay_paid = Column(Boolean, nullable=False, default=False)
    copay_amount = Column(Float, nullable=True)

    # PIA — Program Integrity Assurance review tracking
    pia_status = Column(String(20), nullable=True)

    # Free-form working notes
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "frn": self.frn,
            "ben": self.ben,
            "working_status": self.working_status,
            "installed": bool(self.installed),
            "install_date": self.install_date.isoformat() if self.install_date else None,
            "copay_paid": bool(self.copay_paid),
            "copay_amount": self.copay_amount,
            "pia_status": self.pia_status,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
