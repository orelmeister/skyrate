"""
Push Notification Service
Handles sending Web Push notifications to subscribed users
"""

import json
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.push_subscription import PushSubscription
from ..models.alert import Alert

logger = logging.getLogger(__name__)

# VAPID configuration
VAPID_PRIVATE_KEY = getattr(settings, 'VAPID_PRIVATE_KEY', None)
VAPID_PUBLIC_KEY = getattr(settings, 'VAPID_PUBLIC_KEY', None)
VAPID_CLAIMS = {"sub": f"mailto:{getattr(settings, 'VAPID_CONTACT_EMAIL', 'alerts@skyrate.ai')}"}


class PushNotificationService:
    """Service for managing push subscriptions and sending notifications"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== SUBSCRIPTION MANAGEMENT ====================
    
    def save_subscription(
        self,
        user_id: int,
        endpoint: str,
        p256dh_key: str,
        auth_key: str,
        device_type: str = "desktop",
        user_agent: str = None,
    ) -> PushSubscription:
        """Save or update a push subscription for a user"""
        
        # Check for existing subscription with same endpoint
        existing = self.db.query(PushSubscription).filter(
            PushSubscription.endpoint == endpoint
        ).first()
        
        if existing:
            # Update existing subscription
            existing.user_id = user_id
            existing.p256dh_key = p256dh_key
            existing.auth_key = auth_key
            existing.device_type = device_type
            existing.user_agent = user_agent
            existing.is_active = True
            existing.last_used_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            logger.info(f"Updated push subscription for user {user_id}")
            return existing
        
        # Create new subscription
        subscription = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh_key=p256dh_key,
            auth_key=auth_key,
            device_type=device_type,
            user_agent=user_agent,
            is_active=True,
        )
        self.db.add(subscription)
        self.db.commit()
        self.db.refresh(subscription)
        logger.info(f"Created push subscription for user {user_id} ({device_type})")
        return subscription
    
    def remove_subscription(self, endpoint: str) -> bool:
        """Remove a push subscription by endpoint"""
        sub = self.db.query(PushSubscription).filter(
            PushSubscription.endpoint == endpoint
        ).first()
        
        if sub:
            self.db.delete(sub)
            self.db.commit()
            logger.info(f"Removed push subscription for user {sub.user_id}")
            return True
        return False
    
    def remove_user_subscriptions(self, user_id: int) -> int:
        """Remove all push subscriptions for a user"""
        count = self.db.query(PushSubscription).filter(
            PushSubscription.user_id == user_id
        ).delete()
        self.db.commit()
        logger.info(f"Removed {count} push subscriptions for user {user_id}")
        return count
    
    def get_user_subscriptions(self, user_id: int) -> List[PushSubscription]:
        """Get all active push subscriptions for a user"""
        return self.db.query(PushSubscription).filter(
            PushSubscription.user_id == user_id,
            PushSubscription.is_active == True
        ).all()
    
    # ==================== SENDING NOTIFICATIONS ====================
    
    def send_push_to_user(
        self,
        user_id: int,
        title: str,
        body: str,
        url: str = "/",
        tag: str = "skyrate-notification",
        priority: str = "medium",
        alert_id: int = None,
        icon: str = "/icons/icon-192x192.png",
        badge: str = "/icons/icon-96x96.png",
    ) -> int:
        """
        Send a push notification to all of a user's subscribed devices.
        Returns the number of successful sends.
        """
        subscriptions = self.get_user_subscriptions(user_id)
        
        if not subscriptions:
            logger.debug(f"No push subscriptions for user {user_id}")
            return 0
        
        payload = json.dumps({
            "title": title,
            "body": body,
            "icon": icon,
            "badge": badge,
            "tag": tag,
            "url": url,
            "priority": priority,
            "alertId": alert_id,
        })
        
        success_count = 0
        for sub in subscriptions:
            if self._send_push(sub, payload):
                success_count += 1
                sub.last_used_at = datetime.utcnow()
        
        self.db.commit()
        logger.info(f"Sent push to {success_count}/{len(subscriptions)} devices for user {user_id}")
        return success_count
    
    def send_alert_as_push(self, alert: Alert) -> int:
        """Send an alert as a push notification"""
        # Determine URL based on alert type
        url = "/"
        if alert.entity_type == "frn":
            url = f"/applicant?frn={alert.entity_id}"
        elif alert.entity_type == "form_470":
            url = f"/vendor?form470={alert.entity_id}"
        elif alert.entity_type == "deadline":
            url = "/applicant?tab=appeals"
        
        return self.send_push_to_user(
            user_id=alert.user_id,
            title=alert.title,
            body=alert.message,
            url=url,
            tag=f"alert-{alert.id}",
            priority=alert.priority,
            alert_id=alert.id,
        )
    
    def _send_push(self, subscription: PushSubscription, payload: str) -> bool:
        """Send a push notification to a single subscription"""
        if not VAPID_PRIVATE_KEY:
            logger.warning("VAPID_PRIVATE_KEY not configured, skipping push send")
            return False
        
        try:
            from pywebpush import webpush, WebPushException
            
            subscription_info = {
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh_key,
                    "auth": subscription.auth_key,
                }
            }
            
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
                timeout=10,
            )
            return True
            
        except Exception as e:
            error_str = str(e)
            # Handle expired/invalid subscriptions
            if "410" in error_str or "404" in error_str:
                logger.info(f"Push subscription expired, deactivating: {subscription.id}")
                subscription.is_active = False
            else:
                logger.error(f"Push send failed for subscription {subscription.id}: {e}")
            return False
    
    # ==================== BULK NOTIFICATIONS ====================
    
    def send_push_to_users(
        self,
        user_ids: List[int],
        title: str,
        body: str,
        url: str = "/",
        tag: str = "skyrate-broadcast",
    ) -> Dict[str, int]:
        """Send a push notification to multiple users"""
        sent = 0
        failed = 0
        skipped = 0
        
        for user_id in user_ids:
            count = self.send_push_to_user(user_id, title, body, url, tag)
            if count > 0:
                sent += 1
            elif self.get_user_subscriptions(user_id):
                failed += 1
            else:
                skipped += 1
        
        return {"sent": sent, "failed": failed, "skipped": skipped}
