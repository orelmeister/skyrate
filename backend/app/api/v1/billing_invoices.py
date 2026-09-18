"""
Admin Custom Invoice / Quote Builder API

Admin-built priced quotes billed through Stripe Checkout (card + ACH). On payment
the subscription provisions automatically:
  - Existing account  -> its Subscription flips to active immediately.
  - Prospect (no acct) -> emailed a magic signup link; account is created with the
    subscription already active (no second payment, no trial).

Completely separate from the app.erateapp.com PHP invoice system.

Stripe constraints handled here:
  * One mode=subscription Checkout Session cannot mix monthly + yearly recurring
    prices. The primary-interval recurring line(s) + any one-time lines go through
    Checkout (which collects the payment method); secondary-interval subscription(s)
    are created server-side in the webhook using the collected default payment method.
  * discounts=[{coupon}] and allow_promotion_codes are mutually exclusive — when a
    coupon is attached we omit allow_promotion_codes.
  * No trial on invoice checkouts — the customer is paying now.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, Field, EmailStr, field_validator

from ...core.database import get_db
from ...core.config import settings
from ...core.security import require_role
from ...models.user import User
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.billing_invoice import (
    BillingInvoice,
    BillingInvoiceLine,
    BillingInvoiceStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Billing Invoices"])

AdminUser = Depends(require_role("admin", "super"))

# Stripe import (optional — mirrors subscriptions.py)
try:
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    STRIPE_AVAILABLE = bool(settings.STRIPE_SECRET_KEY)
except ImportError:
    stripe = None
    STRIPE_AVAILABLE = False


LineInterval = Literal["one_time", "month", "year"]
GrantsRole = Literal["consultant", "vendor", "applicant"]
GrantsPlan = Literal["monthly", "yearly", "none"]


# ==================== SCHEMAS ====================

class InvoiceLineIn(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    unit_amount_cents: int = Field(..., ge=0, le=100_000_000)
    quantity: int = Field(1, ge=1, le=1000)
    interval: LineInterval = "one_time"


class InvoiceCreate(BaseModel):
    customer_email: EmailStr
    customer_name: str = Field(..., min_length=1, max_length=255)
    company_name: Optional[str] = Field(None, max_length=255)
    grants_role: GrantsRole = "consultant"
    grants_plan: GrantsPlan = "none"
    lines: List[InvoiceLineIn] = Field(..., min_length=1)
    discount_cents: int = Field(0, ge=0, le=100_000_000)
    notes: Optional[str] = None
    expires_at: Optional[datetime] = None
    primary_interval: Optional[Literal["month", "year"]] = None

    @field_validator("lines")
    @classmethod
    def _non_empty(cls, v):
        if not v:
            raise ValueError("At least one line item is required")
        return v


class InvoiceUpdate(BaseModel):
    customer_email: Optional[EmailStr] = None
    customer_name: Optional[str] = Field(None, min_length=1, max_length=255)
    company_name: Optional[str] = Field(None, max_length=255)
    grants_role: Optional[GrantsRole] = None
    grants_plan: Optional[GrantsPlan] = None
    lines: Optional[List[InvoiceLineIn]] = None
    discount_cents: Optional[int] = Field(None, ge=0, le=100_000_000)
    notes: Optional[str] = None
    expires_at: Optional[datetime] = None
    primary_interval: Optional[Literal["month", "year"]] = None


class CheckoutResponse(BaseModel):
    checkout_url: str


# ==================== HELPERS ====================

def _recompute_totals(lines: List[BillingInvoiceLine], discount_cents: int) -> tuple:
    subtotal = sum(int(l.unit_amount_cents) * int(l.quantity or 1) for l in lines)
    discount = max(0, min(int(discount_cents or 0), subtotal))  # never exceed subtotal
    total = subtotal - discount
    return subtotal, discount, total


def _compute_primary_interval(lines: List[BillingInvoiceLine], override: Optional[str]) -> Optional[str]:
    """Primary billing interval for the Checkout Session. Uses the admin override
    when it matches an existing recurring line; otherwise the interval of the
    highest-value recurring line. None when there are no recurring lines."""
    recurring = [l for l in lines if l.interval in ("month", "year")]
    if not recurring:
        return None
    if override in ("month", "year") and any(l.interval == override for l in recurring):
        return override
    top = max(recurring, key=lambda l: int(l.unit_amount_cents) * int(l.quantity or 1))
    return top.interval


def _generate_invoice_number(db: Session) -> str:
    year = datetime.utcnow().year
    prefix = f"SKY-{year}-"
    # Highest existing sequence for this year (string sort is safe for zero-padded seq)
    latest = (
        db.query(BillingInvoice.invoice_number)
        .filter(BillingInvoice.invoice_number.like(f"{prefix}%"))
        .order_by(BillingInvoice.invoice_number.desc())
        .first()
    )
    seq = 1
    if latest and latest[0]:
        try:
            seq = int(str(latest[0]).split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}{seq:04d}"


def _load_invoice(db: Session, invoice_id: int) -> BillingInvoice:
    inv = (
        db.query(BillingInvoice)
        .options(joinedload(BillingInvoice.lines))
        .filter(BillingInvoice.id == invoice_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def _pay_url(inv: BillingInvoice) -> str:
    base = getattr(settings, "FRONTEND_URL", "https://skyrate.ai").rstrip("/")
    return f"{base}/pay/{inv.pay_token}"


def _require_stripe():
    if not STRIPE_AVAILABLE or stripe is None:
        raise HTTPException(status_code=503, detail="Payment processing is not configured")
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured on this server")


# ==================== ADMIN ROUTES ====================

@router.post("/admin/invoices")
async def create_invoice(data: InvoiceCreate, current_user: User = AdminUser, db: Session = Depends(get_db)):
    """Create a draft invoice. Server recomputes all money; client totals are display-only."""
    # Resolve an existing account by email (so payment flips their sub, not a prospect flow)
    existing_user = db.query(User).filter(User.email == data.customer_email.lower()).first()

    inv = BillingInvoice(
        invoice_number=_generate_invoice_number(db),
        customer_email=data.customer_email.lower(),
        customer_name=data.customer_name.strip(),
        company_name=(data.company_name or None),
        grants_role=data.grants_role,
        grants_plan=data.grants_plan,
        user_id=existing_user.id if existing_user else None,
        status=BillingInvoiceStatus.DRAFT.value,
        currency="usd",
        notes=data.notes,
        pay_token=secrets.token_urlsafe(32),
        expires_at=data.expires_at,
        created_by_admin_id=current_user.id,
    )
    for i, ln in enumerate(data.lines):
        inv.lines.append(BillingInvoiceLine(
            description=ln.description.strip(),
            unit_amount_cents=ln.unit_amount_cents,
            quantity=ln.quantity,
            interval=ln.interval,
            sort_order=i,
        ))
    inv.subtotal_cents, inv.discount_cents, inv.total_cents = _recompute_totals(inv.lines, data.discount_cents)
    inv.primary_interval = _compute_primary_interval(inv.lines, data.primary_interval)

    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"success": True, "invoice": inv.to_dict()}


@router.get("/admin/invoices")
async def list_invoices(
    current_user: User = AdminUser,
    db: Session = Depends(get_db),
    status_filter: Optional[str] = None,
    email: Optional[str] = None,
    page: int = 1,
    per_page: int = 25,
):
    """List invoices, newest first, filterable by status/email, paginated."""
    q = db.query(BillingInvoice)
    if status_filter:
        q = q.filter(BillingInvoice.status == status_filter)
    if email:
        q = q.filter(BillingInvoice.customer_email.like(f"%{email.lower()}%"))
    total = q.count()
    page = max(1, page)
    per_page = max(1, min(per_page, 100))
    rows = (
        q.order_by(BillingInvoice.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return {
        "invoices": [r.to_dict(include_lines=False) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/admin/invoices/{invoice_id}")
async def get_invoice(invoice_id: int, current_user: User = AdminUser, db: Session = Depends(get_db)):
    inv = _load_invoice(db, invoice_id)
    return {"success": True, "invoice": inv.to_dict(), "pay_url": _pay_url(inv)}


@router.patch("/admin/invoices/{invoice_id}")
async def update_invoice(invoice_id: int, data: InvoiceUpdate, current_user: User = AdminUser, db: Session = Depends(get_db)):
    """Edit an invoice — allowed only while status == draft."""
    inv = _load_invoice(db, invoice_id)
    if inv.status != BillingInvoiceStatus.DRAFT.value:
        raise HTTPException(status_code=400, detail="Only draft invoices can be edited")

    if data.customer_email is not None:
        inv.customer_email = data.customer_email.lower()
        existing_user = db.query(User).filter(User.email == inv.customer_email).first()
        inv.user_id = existing_user.id if existing_user else None
    if data.customer_name is not None:
        inv.customer_name = data.customer_name.strip()
    if data.company_name is not None:
        inv.company_name = data.company_name or None
    if data.grants_role is not None:
        inv.grants_role = data.grants_role
    if data.grants_plan is not None:
        inv.grants_plan = data.grants_plan
    if data.notes is not None:
        inv.notes = data.notes
    if data.expires_at is not None:
        inv.expires_at = data.expires_at

    if data.lines is not None:
        if not data.lines:
            raise HTTPException(status_code=400, detail="At least one line item is required")
        inv.lines.clear()
        db.flush()
        for i, ln in enumerate(data.lines):
            inv.lines.append(BillingInvoiceLine(
                description=ln.description.strip(),
                unit_amount_cents=ln.unit_amount_cents,
                quantity=ln.quantity,
                interval=ln.interval,
                sort_order=i,
            ))

    discount = data.discount_cents if data.discount_cents is not None else inv.discount_cents
    inv.subtotal_cents, inv.discount_cents, inv.total_cents = _recompute_totals(inv.lines, discount)
    inv.primary_interval = _compute_primary_interval(
        inv.lines, data.primary_interval if data.primary_interval is not None else inv.primary_interval
    )

    db.commit()
    db.refresh(inv)
    return {"success": True, "invoice": inv.to_dict()}


@router.post("/admin/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: int, background_tasks: BackgroundTasks, current_user: User = AdminUser, db: Session = Depends(get_db)):
    """Render the PDF, email it with the pay link, mark status=sent. Re-sending an
    unpaid (already-sent) invoice is allowed."""
    inv = _load_invoice(db, invoice_id)
    if inv.status in (BillingInvoiceStatus.PAID.value, BillingInvoiceStatus.VOID.value):
        raise HTTPException(status_code=400, detail=f"Cannot send a {inv.status} invoice")

    from ...services.invoice_pdf_service import generate_invoice_pdf
    pay_url = _pay_url(inv)
    inv_dict = inv.to_dict()  # detached-safe snapshot for the background task
    try:
        pdf_bytes = generate_invoice_pdf(inv_dict, pay_url)
    except Exception as e:
        logger.error(f"Invoice PDF generation failed for {inv.invoice_number}: {e}")
        raise HTTPException(status_code=500, detail="Failed to render invoice PDF")

    from ...services.email_service import get_email_service
    email_svc = get_email_service()
    background_tasks.add_task(email_svc.send_invoice_email, inv.customer_email, inv_dict, pdf_bytes, pay_url)

    inv.status = BillingInvoiceStatus.SENT.value
    inv.sent_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return {"success": True, "invoice": inv.to_dict(), "pay_url": pay_url}


@router.post("/admin/invoices/{invoice_id}/void")
async def void_invoice(invoice_id: int, current_user: User = AdminUser, db: Session = Depends(get_db)):
    inv = _load_invoice(db, invoice_id)
    if inv.status == BillingInvoiceStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Cannot void a paid invoice")
    inv.status = BillingInvoiceStatus.VOID.value
    db.commit()
    return {"success": True, "invoice": inv.to_dict(include_lines=False)}


@router.get("/admin/invoices/{invoice_id}/pdf")
async def admin_invoice_pdf(invoice_id: int, current_user: User = AdminUser, db: Session = Depends(get_db)):
    inv = _load_invoice(db, invoice_id)
    from ...services.invoice_pdf_service import generate_invoice_pdf
    pdf_bytes = generate_invoice_pdf(inv.to_dict(), _pay_url(inv))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Invoice-{inv.invoice_number}.pdf"},
    )


# ==================== PUBLIC (token-gated) ROUTES ====================

def _lookup_by_pay_token(db: Session, pay_token: str) -> BillingInvoice:
    inv = (
        db.query(BillingInvoice)
        .options(joinedload(BillingInvoice.lines))
        .filter(BillingInvoice.pay_token == pay_token)
        .first()
    )
    # Constant-time confirm to avoid leaking match timing on the credential.
    if not inv or not secrets.compare_digest(inv.pay_token, pay_token):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def _maybe_expire(inv: BillingInvoice, db: Session) -> None:
    if (
        inv.status in (BillingInvoiceStatus.DRAFT.value, BillingInvoiceStatus.SENT.value)
        and inv.expires_at
        and inv.expires_at < datetime.utcnow()
    ):
        inv.status = BillingInvoiceStatus.EXPIRED.value
        db.commit()


@router.get("/invoices/pay/{pay_token}")
async def public_get_invoice(pay_token: str, db: Session = Depends(get_db)):
    """Public — returns ONLY the safe subset. The pay_token is the credential."""
    inv = _lookup_by_pay_token(db, pay_token)
    _maybe_expire(inv, db)
    return {"success": True, "invoice": inv.to_public_dict()}


@router.post("/invoices/pay/{pay_token}/checkout", response_model=CheckoutResponse)
async def public_checkout(pay_token: str, db: Session = Depends(get_db)):
    """Public — create a Stripe Checkout Session (card + ACH) for this invoice."""
    _require_stripe()
    inv = _lookup_by_pay_token(db, pay_token)
    _maybe_expire(inv, db)

    if inv.status == BillingInvoiceStatus.PAID.value:
        raise HTTPException(status_code=400, detail="This invoice has already been paid")
    if inv.status == BillingInvoiceStatus.VOID.value:
        raise HTTPException(status_code=400, detail="This invoice has been voided")
    if inv.status == BillingInvoiceStatus.EXPIRED.value:
        raise HTTPException(status_code=400, detail="This invoice has expired")
    if not inv.lines:
        raise HTTPException(status_code=400, detail="This invoice has no line items")

    base = getattr(settings, "FRONTEND_URL", "https://skyrate.ai").rstrip("/")
    success_url = f"{base}/pay/{inv.pay_token}?paid=1"
    cancel_url = f"{base}/pay/{inv.pay_token}"

    try:
        # 1) Resolve / create the Stripe customer (reuse a real cus_ from the account).
        customer_id = None
        if inv.stripe_customer_id and inv.stripe_customer_id.startswith("cus_"):
            customer_id = inv.stripe_customer_id
        elif inv.user_id:
            u = db.query(User).filter(User.id == inv.user_id).first()
            if u and u.subscription and (u.subscription.stripe_customer_id or "").startswith("cus_"):
                try:
                    cust = stripe.Customer.retrieve(u.subscription.stripe_customer_id)
                    if not getattr(cust, "deleted", False):
                        customer_id = u.subscription.stripe_customer_id
                except stripe.error.InvalidRequestError:
                    customer_id = None
        if not customer_id:
            customer = stripe.Customer.create(
                email=inv.customer_email,
                name=inv.customer_name,
                metadata={"billing_invoice_id": str(inv.id)},
            )
            customer_id = customer.id
        inv.stripe_customer_id = customer_id

        # 2) Split lines by billing interval.
        recurring = [l for l in inv.lines if l.interval in ("month", "year")]
        one_time = [l for l in inv.lines if l.interval == "one_time"]
        primary_interval = _compute_primary_interval(inv.lines, inv.primary_interval)
        inv.primary_interval = primary_interval

        line_items = []
        if recurring:
            for l in [x for x in recurring if x.interval == primary_interval]:
                line_items.append({
                    "price_data": {
                        "currency": "usd",
                        "product_data": {"name": l.description},
                        "unit_amount": int(l.unit_amount_cents),
                        "recurring": {"interval": l.interval},
                    },
                    "quantity": int(l.quantity or 1),
                })
        # One-time lines are allowed alongside recurring in subscription mode
        # (they land on the initial invoice). In payment mode they are the whole cart.
        for l in one_time:
            line_items.append({
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": l.description},
                    "unit_amount": int(l.unit_amount_cents),
                },
                "quantity": int(l.quantity or 1),
            })

        mode = "subscription" if recurring else "payment"

        session_kwargs = dict(
            customer=customer_id,
            payment_method_types=["card", "us_bank_account"],
            payment_method_options={
                "us_bank_account": {
                    "verification_method": "instant",
                    "financial_connections": {"permissions": ["payment_method"]},
                }
            },
            line_items=line_items,
            mode=mode,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"billing_invoice_id": str(inv.id)},
        )
        if mode == "subscription":
            session_kwargs["subscription_data"] = {"metadata": {"billing_invoice_id": str(inv.id)}}

        # 3) Discount -> Stripe Coupon (amount_off, once). Mutually exclusive with
        #    allow_promotion_codes, so we simply do not pass that param when couponed.
        if inv.discount_cents and inv.discount_cents > 0:
            coupon_id = inv.stripe_coupon_id
            if not coupon_id:
                coupon = stripe.Coupon.create(
                    amount_off=int(inv.discount_cents),
                    currency="usd",
                    duration="once",
                    name=f"Discount {inv.invoice_number}",
                )
                coupon_id = coupon.id
                inv.stripe_coupon_id = coupon_id
            session_kwargs["discounts"] = [{"coupon": coupon_id}]
        else:
            session_kwargs["allow_promotion_codes"] = True

        session = stripe.checkout.Session.create(**session_kwargs)
        inv.stripe_checkout_session_id = session.id
        db.commit()
        return CheckoutResponse(checkout_url=session.url)

    except stripe.error.StripeError as e:
        db.rollback()
        logger.error(f"Stripe checkout failed for invoice {inv.invoice_number}: {e}")
        raise HTTPException(status_code=400, detail=f"Payment error: {str(e)}")


@router.get("/invoices/pay/{pay_token}/pdf")
async def public_invoice_pdf(pay_token: str, db: Session = Depends(get_db)):
    inv = _lookup_by_pay_token(db, pay_token)
    from ...services.invoice_pdf_service import generate_invoice_pdf
    pdf_bytes = generate_invoice_pdf(inv.to_dict(), _pay_url(inv))
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Invoice-{inv.invoice_number}.pdf"},
    )


# ==================== WEBHOOK HELPER (called from subscriptions.py) ====================

def _period_end_from_sub(sub) -> Optional[datetime]:
    """Read current_period_end from a Stripe Subscription defensively (it moved to
    subscription items in the Basil API; on 7.12.0 it is on the subscription)."""
    try:
        ts = sub.get("current_period_end") if hasattr(sub, "get") else getattr(sub, "current_period_end", None)
        if not ts:
            items = (sub.get("items") if hasattr(sub, "get") else None) or {}
            data = (items.get("data") if isinstance(items, dict) else None) or []
            if data:
                ts = data[0].get("current_period_end")
        if ts:
            return datetime.utcfromtimestamp(int(ts))
    except (ValueError, TypeError, AttributeError, KeyError):
        pass
    return None


def handle_invoice_payment(session: dict, db: Session) -> None:
    """Idempotently finalize a paid custom invoice. Called from the shared Stripe
    webhook (subscriptions.py) when checkout.session.completed carries
    metadata.billing_invoice_id. Must never raise back to Stripe."""
    try:
        metadata = session.get("metadata") or {}
        raw_id = metadata.get("billing_invoice_id")
        if not raw_id:
            return
        try:
            invoice_id = int(raw_id)
        except (ValueError, TypeError):
            return

        inv = (
            db.query(BillingInvoice)
            .options(joinedload(BillingInvoice.lines))
            .filter(BillingInvoice.id == invoice_id)
            .first()
        )
        if not inv:
            logger.warning(f"[invoice-webhook] invoice {raw_id} not found")
            return
        if inv.status == BillingInvoiceStatus.PAID.value:
            return  # idempotent no-op

        sub_ids = list(inv.subscription_ids())
        customer_id = session.get("customer") or inv.stripe_customer_id
        primary_sub_id = session.get("subscription")
        pm_id = None
        current_period_end = None

        # Retrieve the primary subscription (created by Checkout) to grab the
        # collected default payment method + billing period.
        if primary_sub_id and STRIPE_AVAILABLE and stripe is not None:
            if primary_sub_id not in sub_ids:
                sub_ids.append(primary_sub_id)
            try:
                primary_sub = stripe.Subscription.retrieve(primary_sub_id)
                pm_id = primary_sub.get("default_payment_method")
                current_period_end = _period_end_from_sub(primary_sub)
            except Exception as e:  # noqa: BLE001
                logger.error(f"[invoice-webhook] retrieve primary sub failed: {e}")

        if not pm_id and customer_id and STRIPE_AVAILABLE and stripe is not None:
            try:
                cust = stripe.Customer.retrieve(customer_id)
                inv_settings = cust.get("invoice_settings") or {}
                pm_id = inv_settings.get("default_payment_method")
            except Exception as e:  # noqa: BLE001
                logger.error(f"[invoice-webhook] retrieve customer failed: {e}")

        # Create secondary-interval subscription(s) server-side (e.g. the monthly
        # retainer when the annual line drove the Checkout Session).
        if inv.primary_interval and customer_id and STRIPE_AVAILABLE and stripe is not None:
            secondary = [l for l in inv.lines if l.interval in ("month", "year") and l.interval != inv.primary_interval]
            for l in secondary:
                try:
                    price = stripe.Price.create(
                        currency="usd",
                        unit_amount=int(l.unit_amount_cents),
                        recurring={"interval": l.interval},
                        product_data={"name": l.description},
                    )
                    sub_kwargs = dict(
                        customer=customer_id,
                        items=[{"price": price.id, "quantity": int(l.quantity or 1)}],
                        metadata={"billing_invoice_id": str(inv.id), "secondary": "1"},
                    )
                    if pm_id:
                        sub_kwargs["default_payment_method"] = pm_id
                    sub2 = stripe.Subscription.create(**sub_kwargs)
                    sub_ids.append(sub2.id)
                except Exception as e:  # noqa: BLE001
                    logger.error(f"[invoice-webhook] secondary sub create failed for '{l.description}': {e}")

        # Finalize the invoice record.
        inv.status = BillingInvoiceStatus.PAID.value
        inv.paid_at = datetime.utcnow()
        if customer_id:
            inv.stripe_customer_id = customer_id
        if session.get("id"):
            inv.stripe_checkout_session_id = session.get("id")
        inv.set_subscription_ids(sub_ids)

        prospect_email_ctx = None
        if inv.user_id:
            _provision_for_existing_user(inv, db, primary_sub_id, current_period_end)
        else:
            # Prospect: issue a single-use magic signup link (72h).
            inv.signup_token = secrets.token_urlsafe(32)
            inv.signup_token_expires_at = datetime.utcnow() + timedelta(hours=72)
            base = getattr(settings, "FRONTEND_URL", "https://skyrate.ai").rstrip("/")
            prospect_email_ctx = (
                inv.customer_email,
                f"{base}/sign-up?invoice_token={inv.signup_token}",
                inv.to_dict(),
            )

        db.commit()

        # Emails after the DB commit succeeds (best-effort; never 500 to Stripe).
        if prospect_email_ctx:
            try:
                from ...services.email_service import get_email_service
                to_email, signup_url, inv_dict = prospect_email_ctx
                get_email_service().send_invoice_signup_link_email(to_email, signup_url, inv_dict)
            except Exception as e:  # noqa: BLE001
                logger.error(f"[invoice-webhook] prospect signup email failed: {e}")

    except Exception as e:  # noqa: BLE001 — a webhook must never 500 back to Stripe
        logger.error(f"[invoice-webhook] unexpected error: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def _provision_for_existing_user(inv: BillingInvoice, db: Session, stripe_sub_id: Optional[str], current_period_end: Optional[datetime]) -> None:
    """Flip an existing account's Subscription to active immediately (no trial)."""
    user = db.query(User).filter(User.id == inv.user_id).first()
    if not user:
        logger.warning(f"[invoice-webhook] invoice {inv.invoice_number} user_id {inv.user_id} missing")
        return
    plan = inv.grants_plan if inv.grants_plan in ("monthly", "yearly") else "yearly"
    sub = user.subscription
    if not sub:
        sub = Subscription(user_id=user.id, price_cents=inv.total_cents)
        db.add(sub)
    sub.status = SubscriptionStatus.ACTIVE.value
    sub.plan = plan
    sub.price_cents = inv.total_cents
    if inv.stripe_customer_id:
        sub.stripe_customer_id = inv.stripe_customer_id
    if stripe_sub_id:
        sub.stripe_subscription_id = stripe_sub_id
    sub.start_date = datetime.utcnow()
    sub.trial_end = None
    if current_period_end:
        sub.current_period_end = current_period_end
