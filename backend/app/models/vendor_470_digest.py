"""
Vendor Form 470 Daily Digest Subscription model.

A vendor saves one of their Form 470 Lead searches (year / state / category /
service_type / manufacturer / applicant-name) as a named subscription. A daily
scheduler job re-runs each enabled subscription's filters against USAC, finds
the Form 470 postings that are NEW since the last dispatch, and emails them.

This is the "daily email of new 470s matching my saved search criteria" feature
that competitors (Funds for Learning) offer and prospects rely on.

One row per (vendor_profile_id, saved search). Scoped to the account OWNER's
vendor_profile_id so team seats share the same set of digests.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey, Index
from datetime import datetime

from ..core.database import Base


class Vendor470DigestSubscription(Base):
    """A vendor's saved Form 470 search that emails a daily digest of new matches."""

    __tablename__ = "vendor_470_digest_subscriptions"
    __table_args__ = (
        Index("ix_v470_digest_enabled", "enabled"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(
        Integer,
        ForeignKey("vendor_profiles.id"),
        nullable=False,
        index=True,
    )

    name = Column(String(160), nullable=False)

    # Saved search criteria: {year, state, category, service_type, manufacturer, name}.
    # All optional; an empty object means "all current/upcoming-FY 470s nationwide".
    filters_json = Column(JSON, nullable=True)

    frequency = Column(String(20), nullable=False, default="daily")
    enabled = Column(Boolean, nullable=False, default=True)

    # Optional recipient override; falls back to the owner user's email.
    email = Column(String(255), nullable=True)

    last_sent_at = Column(DateTime, nullable=True)

    # Highest Form 470 posting date (certified_datetime, ISO string) already
    # emailed. New postings are those with a posting date strictly greater than
    # this marker. NULL means the subscription has not established a baseline yet.
    last_seen_marker = Column(String(40), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "filters": self.filters_json or {},
            "frequency": self.frequency,
            "enabled": bool(self.enabled),
            "email": self.email,
            "last_sent_at": self.last_sent_at.isoformat() if self.last_sent_at else None,
            "last_seen_marker": self.last_seen_marker,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
