"""
Billing Invoice Model
Admin-built custom invoices / quotes billed via Stripe Checkout (card + ACH).

Completely separate from the app.erateapp.com PHP invoice system — different
stack, different database, no cross-linking.
"""

import json
import enum
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship

from ..core.database import Base


class BillingInvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    VOID = "void"
    EXPIRED = "expired"


class BillingInvoiceInterval(str, enum.Enum):
    ONE_TIME = "one_time"
    MONTH = "month"
    YEAR = "year"


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(32), unique=True, nullable=False, index=True)

    # Recipient
    customer_email = Column(String(255), nullable=False, index=True)
    customer_name = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)

    # What paying this invoice grants
    grants_role = Column(String(20), nullable=False, default="consultant")  # consultant|vendor|applicant
    grants_plan = Column(String(20), nullable=False, default="none")        # monthly|yearly|none

    # NULL user_id == prospect with no account yet (magic signup link after payment)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    status = Column(String(20), nullable=False, default=BillingInvoiceStatus.DRAFT.value, index=True)
    currency = Column(String(3), nullable=False, default="usd")

    # Money (server-computed; client totals are display-only)
    subtotal_cents = Column(Integer, nullable=False, default=0)
    discount_cents = Column(Integer, nullable=False, default=0)
    total_cents = Column(Integer, nullable=False, default=0)

    notes = Column(Text, nullable=True)

    # Public pay credential (the token IS the authorization for the pay page)
    pay_token = Column(String(64), unique=True, nullable=False, index=True)

    # Stripe wiring
    primary_interval = Column(String(10), nullable=True)  # month|year (None for one-time-only)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_coupon_id = Column(String(255), nullable=True)
    stripe_checkout_session_id = Column(String(255), nullable=True)
    stripe_subscription_ids = Column(Text, nullable=True)  # JSON-encoded list of sub ids

    # Prospect magic signup link (single-use)
    signup_token = Column(String(64), unique=True, nullable=True, index=True)
    signup_token_expires_at = Column(DateTime, nullable=True)

    # Automatic payment-reminder chase for unpaid (sent) invoices
    reminders_enabled = Column(Boolean, nullable=False, default=True)
    reminder_count = Column(Integer, nullable=False, default=0)
    last_reminder_at = Column(DateTime, nullable=True)

    created_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    sent_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lines = relationship(
        "BillingInvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="BillingInvoiceLine.sort_order",
    )

    # ---- helpers ----------------------------------------------------------
    def subscription_ids(self) -> list:
        if not self.stripe_subscription_ids:
            return []
        try:
            val = json.loads(self.stripe_subscription_ids)
            return val if isinstance(val, list) else []
        except (ValueError, TypeError):
            return []

    def set_subscription_ids(self, ids: list) -> None:
        self.stripe_subscription_ids = json.dumps(list(dict.fromkeys(ids)))

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_at and self.expires_at < datetime.utcnow())

    def to_dict(self, include_lines: bool = True) -> dict:
        """Full record — ADMIN ONLY. Never return to the public pay page."""
        data = {
            "id": self.id,
            "invoice_number": self.invoice_number,
            "customer_email": self.customer_email,
            "customer_name": self.customer_name,
            "company_name": self.company_name,
            "grants_role": self.grants_role,
            "grants_plan": self.grants_plan,
            "user_id": self.user_id,
            "status": self.status,
            "currency": self.currency,
            "subtotal_cents": self.subtotal_cents,
            "discount_cents": self.discount_cents,
            "total_cents": self.total_cents,
            "notes": self.notes,
            "pay_token": self.pay_token,
            "primary_interval": self.primary_interval,
            "stripe_customer_id": self.stripe_customer_id,
            "stripe_checkout_session_id": self.stripe_checkout_session_id,
            "stripe_subscription_ids": self.subscription_ids(),
            "created_by_admin_id": self.created_by_admin_id,
            "reminders_enabled": bool(self.reminders_enabled) if self.reminders_enabled is not None else True,
            "reminder_count": int(self.reminder_count or 0),
            "last_reminder_at": self.last_reminder_at.isoformat() if self.last_reminder_at else None,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_lines:
            data["lines"] = [ln.to_dict() for ln in self.lines]
        return data

    def to_public_dict(self) -> dict:
        """Safe subset for the unauthenticated pay page. Leaks NOTHING sensitive:
        no user_id, no signup/pay tokens beyond what the caller already holds,
        no admin ids, no Stripe secrets."""
        return {
            "invoice_number": self.invoice_number,
            "customer_name": self.customer_name,
            "company_name": self.company_name,
            "status": self.status,
            "currency": self.currency,
            "subtotal_cents": self.subtotal_cents,
            "discount_cents": self.discount_cents,
            "total_cents": self.total_cents,
            "notes": self.notes,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "is_expired": self.is_expired,
            "lines": [ln.to_public_dict() for ln in self.lines],
        }


class BillingInvoiceLine(Base):
    __tablename__ = "billing_invoice_lines"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(
        Integer,
        ForeignKey("billing_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description = Column(String(500), nullable=False)
    unit_amount_cents = Column(Integer, nullable=False, default=0)
    quantity = Column(Integer, nullable=False, default=1)
    interval = Column(String(10), nullable=False, default=BillingInvoiceInterval.ONE_TIME.value)  # one_time|month|year
    sort_order = Column(Integer, nullable=False, default=0)

    invoice = relationship("BillingInvoice", back_populates="lines")

    @property
    def amount_cents(self) -> int:
        return int(self.unit_amount_cents) * int(self.quantity or 1)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "unit_amount_cents": self.unit_amount_cents,
            "quantity": self.quantity,
            "interval": self.interval,
            "sort_order": self.sort_order,
            "amount_cents": self.amount_cents,
        }

    def to_public_dict(self) -> dict:
        return {
            "description": self.description,
            "unit_amount_cents": self.unit_amount_cents,
            "quantity": self.quantity,
            "interval": self.interval,
            "amount_cents": self.amount_cents,
        }
