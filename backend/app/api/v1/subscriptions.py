"""
Subscription & Payments API Endpoints
Handles Stripe integration for consultant and vendor subscriptions

Flow:
1. User signs up -> account created with TRIALING status, requires_payment_setup=True
2. User redirected to paywall -> creates Stripe checkout session with 14-day trial
3. Stripe collects card, creates subscription (no charge for 14 days)
4. After 14 days, Stripe charges the card automatically
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import json

from ...core.database import get_db
from ...core.security import get_current_user
from ...core.config import settings
from ...models.user import User
from ...models.subscription import Subscription, SubscriptionStatus, SubscriptionPlan

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])

# Trial period in days
TRIAL_PERIOD_DAYS = 14

# Stripe import (optional - won't fail if not installed)
try:
    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    STRIPE_AVAILABLE = bool(settings.STRIPE_SECRET_KEY)
except ImportError:
    stripe = None
    STRIPE_AVAILABLE = False


# ==================== SCHEMAS ====================

class CreateCheckoutRequest(BaseModel):
    plan: str  # "monthly" or "yearly"
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class SubscriptionResponse(BaseModel):
    success: bool
    subscription: Optional[dict]
    requires_payment_setup: Optional[bool] = None


class PaymentStatusResponse(BaseModel):
    requires_payment_setup: bool
    subscription_status: Optional[str]
    trial_ends_at: Optional[str]
    plan: Optional[str]


class CancelRequest(BaseModel):
    reason: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.get("/payment-status", response_model=PaymentStatusResponse)
async def get_payment_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check if user needs to complete payment setup.
    Used by frontend to determine if user should be redirected to paywall.
    
    A user requires payment setup if:
    - They have no Stripe customer ID, OR
    - They have no Stripe subscription ID
    """
    subscription = current_user.subscription
    
    if not subscription:
        return PaymentStatusResponse(
            requires_payment_setup=True,
            subscription_status=None,
            trial_ends_at=None,
            plan=None
        )
    
    # User needs payment setup if they don't have Stripe IDs
    requires_setup = (
        not subscription.stripe_customer_id or 
        not subscription.stripe_subscription_id
    )
    
    return PaymentStatusResponse(
        requires_payment_setup=requires_setup,
        subscription_status=subscription.status,
        trial_ends_at=subscription.trial_end.isoformat() if subscription.trial_end else None,
        plan=subscription.plan
    )


@router.get("/status", response_model=SubscriptionResponse)
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current subscription status.
    """
    subscription = current_user.subscription
    
    if not subscription:
        return SubscriptionResponse(
            success=True, 
            subscription=None,
            requires_payment_setup=True
        )
    
    # Check if subscription is expired
    sub_data = subscription.to_dict()
    sub_data["is_expired"] = (
        subscription.end_date and 
        subscription.end_date < datetime.utcnow() and
        subscription.status != SubscriptionStatus.ACTIVE.value
    )
    
    # Check if payment setup is required
    requires_setup = (
        not subscription.stripe_customer_id or 
        not subscription.stripe_subscription_id
    )
    
    return SubscriptionResponse(
        success=True, 
        subscription=sub_data,
        requires_payment_setup=requires_setup
    )


@router.post("/create-checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    data: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Stripe checkout session for subscription with 14-day free trial.
    
    The user's card will be collected but NOT charged for the first 14 days.
    After the trial period, Stripe will automatically charge the subscription fee.
    """
    if not STRIPE_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment processing is not configured"
        )
    
    # Get price based on user role and plan
    if current_user.role == "consultant":
        if data.plan == "yearly":
            price_cents = settings.CONSULTANT_YEARLY_PRICE
            plan_name = "Annual"
        else:
            price_cents = settings.CONSULTANT_MONTHLY_PRICE
            plan_name = "Monthly"
    else:  # vendor
        if data.plan == "yearly":
            price_cents = settings.VENDOR_YEARLY_PRICE
            plan_name = "Annual"
        else:
            price_cents = settings.VENDOR_MONTHLY_PRICE
            plan_name = "Monthly"
    
    try:
        # Get or create Stripe customer
        if current_user.subscription and current_user.subscription.stripe_customer_id:
            customer_id = current_user.subscription.stripe_customer_id
        else:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.full_name,
                metadata={
                    "user_id": str(current_user.id),
                    "role": current_user.role
                }
            )
            customer_id = customer.id
            
            # Update subscription with customer ID
            if current_user.subscription:
                current_user.subscription.stripe_customer_id = customer_id
                db.commit()
        
        # Create checkout session with 14-day trial
        # The card is collected but not charged during the trial
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"SkyRate AI {current_user.role.title()} - {plan_name}",
                        "description": f"{plan_name} subscription to SkyRate AI. {TRIAL_PERIOD_DAYS}-day free trial, then ${price_cents/100:.0f}/{('year' if data.plan == 'yearly' else 'month')}.",
                    },
                    "unit_amount": price_cents,
                    "recurring": {
                        "interval": "year" if data.plan == "yearly" else "month"
                    }
                },
                "quantity": 1
            }],
            mode="subscription",
            # Enable 14-day trial - card collected but not charged
            subscription_data={
                "trial_period_days": TRIAL_PERIOD_DAYS,
                "metadata": {
                    "user_id": str(current_user.id),
                    "plan": data.plan,
                    "role": current_user.role
                }
            },
            success_url=data.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=data.cancel_url,
            metadata={
                "user_id": str(current_user.id),
                "plan": data.plan
            },
            # Allow promotion codes for discounts
            allow_promotion_codes=True,
        )
        
        return CheckoutResponse(
            checkout_url=session.url,
            session_id=session.id
        )
    
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}"
        )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: Session = Depends(get_db)
):
    """
    Handle Stripe webhooks for subscription events.
    """
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {str(e)}")
    
    # Handle events
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session["metadata"].get("user_id")
        plan = session["metadata"].get("plan", "monthly")
        
        if user_id:
            user = db.query(User).filter(User.id == int(user_id)).first()
            if user and user.subscription:
                user.subscription.status = SubscriptionStatus.ACTIVE.value
                user.subscription.plan = plan
                user.subscription.stripe_subscription_id = session.get("subscription")
                db.commit()
    
    elif event["type"] == "customer.subscription.updated":
        subscription_obj = event["data"]["object"]
        stripe_sub_id = subscription_obj["id"]
        
        sub = db.query(Subscription).filter(
            Subscription.stripe_subscription_id == stripe_sub_id
        ).first()
        
        if sub:
            sub.status = subscription_obj["status"]
            if subscription_obj.get("current_period_end"):
                sub.current_period_end = datetime.fromtimestamp(
                    subscription_obj["current_period_end"]
                )
            db.commit()
    
    elif event["type"] == "customer.subscription.deleted":
        subscription_obj = event["data"]["object"]
        stripe_sub_id = subscription_obj["id"]
        
        sub = db.query(Subscription).filter(
            Subscription.stripe_subscription_id == stripe_sub_id
        ).first()
        
        if sub:
            sub.status = SubscriptionStatus.CANCELED.value
            sub.canceled_at = datetime.utcnow()
            db.commit()
    
    elif event["type"] == "invoice.payment_failed":
        invoice = event["data"]["object"]
        customer_id = invoice["customer"]
        
        sub = db.query(Subscription).filter(
            Subscription.stripe_customer_id == customer_id
        ).first()
        
        if sub:
            sub.status = SubscriptionStatus.PAST_DUE.value
            db.commit()
    
    return {"received": True}


@router.post("/cancel")
async def cancel_subscription(
    data: CancelRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cancel current subscription at end of billing period.
    """
    subscription = current_user.subscription
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active subscription"
        )
    
    if STRIPE_AVAILABLE and subscription.stripe_subscription_id:
        try:
            # Cancel at period end in Stripe
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=True
            )
        except stripe.error.StripeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to cancel: {str(e)}"
            )
    
    subscription.status = SubscriptionStatus.CANCELED.value
    subscription.canceled_at = datetime.utcnow()
    db.commit()
    
    return {
        "success": True,
        "message": "Subscription will be canceled at the end of the current billing period",
        "end_date": subscription.current_period_end.isoformat() if subscription.current_period_end else None
    }


@router.post("/reactivate")
async def reactivate_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Reactivate a canceled subscription (if still within billing period).
    """
    subscription = current_user.subscription
    
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No subscription found"
        )
    
    if subscription.status != SubscriptionStatus.CANCELED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subscription is not canceled"
        )
    
    if STRIPE_AVAILABLE and subscription.stripe_subscription_id:
        try:
            stripe.Subscription.modify(
                subscription.stripe_subscription_id,
                cancel_at_period_end=False
            )
        except stripe.error.StripeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to reactivate: {str(e)}"
            )
    
    subscription.status = SubscriptionStatus.ACTIVE.value
    subscription.canceled_at = None
    db.commit()
    
    return {"success": True, "message": "Subscription reactivated"}
