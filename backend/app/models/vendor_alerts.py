"""
Vendor Alert Models
Phase 1 of the Vendor Parity Plan v2: data layer for Form 470 alert
subscriptions (filter or watchlist mode), match log, scanner run log,
Web Push subscriptions scoped to vendor profile, and the in-app
notification bell.

The actual scanner/dispatcher is implemented in later phases (P2-P3);
these models only stand up the schema and CRUD-friendly relationships.
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    DECIMAL,
    Enum,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


# Default channel configuration applied when a subscription is created
# without an explicit channels payload.
DEFAULT_ALERT_CHANNELS = {
    "email": True,
    "sms": False,
    "push": False,
    "in_app": False,
}


class VendorAlertSubscription(Base):
    """A vendor's saved Form 470 alert. Either a `filter` (criteria-based,
    fires whenever any matching new 470 lands) or a `watchlist` (fires
    whenever any 470 lands for a specific list of BENs)."""

    __tablename__ = "vendor_alert_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(
        Integer,
        ForeignKey("vendor_profiles.id"),
        nullable=False,
        index=True,
    )

    name = Column(String(120), nullable=False)
    mode = Column(
        Enum("filter", "watchlist", name="vendor_alert_mode"),
        nullable=False,
        default="filter",
    )

    # Filter-mode criteria (all optional, but at least one must be set
    # at the application layer when mode='filter').
    states = Column(JSON, nullable=True)
    service_categories = Column(JSON, nullable=True)
    applicant_types = Column(JSON, nullable=True)
    min_amount = Column(DECIMAL(12, 2), nullable=True)
    max_amount = Column(DECIMAL(12, 2), nullable=True)

    # Watchlist-mode criteria.
    watchlist_bens = Column(JSON, nullable=True)

    # Delivery channels + per-channel destination overrides.
    channels = Column(JSON, nullable=False, default=lambda: dict(DEFAULT_ALERT_CHANNELS))
    email = Column(String(255), nullable=True)
    phone_e164 = Column(String(20), nullable=True)

    # Tier + status flags.
    is_paid_tier = Column(Boolean, nullable=False, default=False)
    active = Column(Boolean, nullable=False, default=True)

    last_dispatched_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    vendor_profile = relationship("VendorProfile", backref="alert_subscriptions")
    matches = relationship(
        "VendorAlertMatch",
        back_populates="subscription",
        cascade="all, delete-orphan",
    )
    in_app_notifications = relationship(
        "VendorInAppNotification",
        back_populates="subscription",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "vendor_profile_id": self.vendor_profile_id,
            "name": self.name,
            "mode": self.mode,
            "states": self.states or [],
            "service_categories": self.service_categories or [],
            "applicant_types": self.applicant_types or [],
            "min_amount": float(self.min_amount) if self.min_amount is not None else None,
            "max_amount": float(self.max_amount) if self.max_amount is not None else None,
            "watchlist_bens": self.watchlist_bens or [],
            "channels": self.channels or dict(DEFAULT_ALERT_CHANNELS),
            "email": self.email,
            "phone_e164": self.phone_e164,
            "is_paid_tier": bool(self.is_paid_tier),
            "active": bool(self.active),
            "last_dispatched_at": self.last_dispatched_at.isoformat() if self.last_dispatched_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class VendorAlertMatch(Base):
    """One row per (subscription, Form 470 application number) pairing.
    Unique on (subscription_id, form_470_application_number) so we never
    notify a vendor twice for the same 470."""

    __tablename__ = "vendor_alert_matches"
    __table_args__ = (
        UniqueConstraint(
            "subscription_id",
            "form_470_application_number",
            name="uq_vendor_alert_match_sub_form",
        ),
        Index("ix_vendor_alert_matches_matched_at", "matched_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(
        Integer,
        ForeignKey("vendor_alert_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    form_470_application_number = Column(String(64), nullable=False)
    ben = Column(String(20), nullable=True)

    matched_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    delivered_email_at = Column(DateTime, nullable=True)
    delivered_sms_at = Column(DateTime, nullable=True)
    delivered_push_at = Column(DateTime, nullable=True)
    read_in_app_at = Column(DateTime, nullable=True)

    # Relationship
    subscription = relationship("VendorAlertSubscription", back_populates="matches")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "subscription_id": self.subscription_id,
            "form_470_application_number": self.form_470_application_number,
            "ben": self.ben,
            "matched_at": self.matched_at.isoformat() if self.matched_at else None,
            "delivered_email_at": self.delivered_email_at.isoformat() if self.delivered_email_at else None,
            "delivered_sms_at": self.delivered_sms_at.isoformat() if self.delivered_sms_at else None,
            "delivered_push_at": self.delivered_push_at.isoformat() if self.delivered_push_at else None,
            "read_in_app_at": self.read_in_app_at.isoformat() if self.read_in_app_at else None,
        }


class VendorAlertScanRun(Base):
    """Log row for every run of the (P2) scanner. Phase 1 keeps the table
    empty; the scanner will append a row per pass once it ships."""

    __tablename__ = "vendor_alert_scan_runs"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    rows_pulled = Column(Integer, default=0, nullable=False)
    matches_created = Column(Integer, default=0, nullable=False)
    error = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "rows_pulled": self.rows_pulled or 0,
            "matches_created": self.matches_created or 0,
            "error": self.error,
        }


class VendorPushSubscription(Base):
    """Web Push (RFC 8030) subscription scoped to a vendor_profile. Each
    browser/device a vendor signs in from will create its own row.
    Independent of the user-scoped `push_subscriptions` table used by the
    rest of the app."""

    __tablename__ = "vendor_push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(
        Integer,
        ForeignKey("vendor_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint = Column(Text, nullable=False)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    ua = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    vendor_profile = relationship("VendorProfile", backref="push_subscriptions_vendor")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "vendor_profile_id": self.vendor_profile_id,
            "endpoint": self.endpoint,
            "ua": self.ua,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class VendorInAppNotification(Base):
    """A single in-app notification (bell entry) for a vendor. May or may
    not be linked back to a subscription that produced it."""

    __tablename__ = "vendor_in_app_notifications"
    __table_args__ = (
        Index(
            "ix_vendor_in_app_notif_profile_read",
            "vendor_profile_id",
            "read_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(
        Integer,
        ForeignKey("vendor_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    subscription_id = Column(
        Integer,
        ForeignKey("vendor_alert_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    link = Column(String(500), nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    vendor_profile = relationship("VendorProfile", backref="in_app_notifications")
    subscription = relationship("VendorAlertSubscription", back_populates="in_app_notifications")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "vendor_profile_id": self.vendor_profile_id,
            "subscription_id": self.subscription_id,
            "title": self.title,
            "body": self.body,
            "link": self.link,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Form470Posting(Base):
    """One row per Form 470 application pulled from USAC opendata
    (dataset jt8s-3q52). Populated by the P2 scanner; consumed by the
    matcher to fire vendor alerts."""

    __tablename__ = "form470_postings"
    __table_args__ = (
        Index("ix_form470_postings_ben", "ben"),
        Index("ix_form470_postings_state", "state"),
        Index("ix_form470_postings_certified_date", "certified_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    application_number = Column(String(64), unique=True, nullable=False)
    ben = Column(String(20), nullable=True)
    applicant_name = Column(String(255), nullable=True)
    state = Column(String(2), nullable=True)
    certified_date = Column(DateTime, nullable=True)
    allowable_contract_date = Column(DateTime, nullable=True)
    total_pre_discount_cost = Column(DECIMAL(14, 2), nullable=True)
    service_categories = Column(JSON, nullable=True)
    service_types = Column(JSON, nullable=True)
    applicant_type = Column(String(50), nullable=True)
    rfp_url = Column(String(500), nullable=True)
    raw = Column(JSON, nullable=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_synced_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "application_number": self.application_number,
            "ben": self.ben,
            "applicant_name": self.applicant_name,
            "state": self.state,
            "certified_date": self.certified_date.isoformat() if self.certified_date else None,
            "allowable_contract_date": self.allowable_contract_date.isoformat() if self.allowable_contract_date else None,
            "total_pre_discount_cost": float(self.total_pre_discount_cost) if self.total_pre_discount_cost is not None else None,
            "service_categories": self.service_categories or [],
            "service_types": self.service_types or [],
            "applicant_type": self.applicant_type,
            "rfp_url": self.rfp_url,
            "first_seen_at": self.first_seen_at.isoformat() if self.first_seen_at else None,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
        }
