"""
Push Notification API Endpoints
Handles push subscription management and notification preferences
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.push_subscription import PushSubscription
from ...services.push_notification_service import PushNotificationService

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications/push", tags=["Push Notifications"])


# ==================== SCHEMAS ====================

class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionData(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    expirationTime: Optional[float] = None

class SubscribeRequest(BaseModel):
    subscription: PushSubscriptionData
    device_type: Optional[str] = "desktop"
    user_agent: Optional[str] = None

class UnsubscribeRequest(BaseModel):
    endpoint: str

class TestPushRequest(BaseModel):
    title: Optional[str] = "Test Notification"
    body: Optional[str] = "This is a test push notification from SkyRate AI"


# ==================== ENDPOINTS ====================

@router.post("/subscribe")
async def subscribe_to_push(
    request: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Subscribe to push notifications"""
    service = PushNotificationService(db)
    
    subscription = service.save_subscription(
        user_id=current_user.id,
        endpoint=request.subscription.endpoint,
        p256dh_key=request.subscription.keys.p256dh,
        auth_key=request.subscription.keys.auth,
        device_type=request.device_type,
        user_agent=request.user_agent,
    )
    
    return {
        "success": True,
        "message": "Push subscription saved",
        "subscription_id": subscription.id,
    }


@router.post("/unsubscribe")
async def unsubscribe_from_push(
    request: UnsubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unsubscribe from push notifications"""
    service = PushNotificationService(db)
    removed = service.remove_subscription(request.endpoint)
    
    return {
        "success": removed,
        "message": "Unsubscribed from push notifications" if removed else "Subscription not found",
    }


@router.get("/subscriptions")
async def list_push_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user's push subscriptions"""
    service = PushNotificationService(db)
    subs = service.get_user_subscriptions(current_user.id)
    
    return {
        "success": True,
        "subscriptions": [s.to_dict() for s in subs],
        "count": len(subs),
    }


@router.post("/test")
async def send_test_notification(
    request: TestPushRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test push notification to the current user"""
    service = PushNotificationService(db)
    
    sent = service.send_push_to_user(
        user_id=current_user.id,
        title=request.title,
        body=request.body,
        url="/",
        tag="test-notification",
    )
    
    if sent == 0:
        raise HTTPException(
            status_code=400,
            detail="No active push subscriptions found. Please enable notifications first."
        )
    
    return {
        "success": True,
        "message": f"Test notification sent to {sent} device(s)",
        "devices_reached": sent,
    }


@router.delete("/all")
async def remove_all_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove all push subscriptions for the current user"""
    service = PushNotificationService(db)
    count = service.remove_user_subscriptions(current_user.id)
    
    return {
        "success": True,
        "message": f"Removed {count} subscription(s)",
        "removed_count": count,
    }
