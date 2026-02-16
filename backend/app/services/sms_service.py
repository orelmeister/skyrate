"""
SMS Service
Handles sending SMS notifications and phone verification via Twilio
"""

import logging
from typing import Optional

from ..core.config import settings

logger = logging.getLogger(__name__)


class SMSService:
    """Service for sending SMS via Twilio and verifying phone numbers"""
    
    def __init__(self):
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.verify_sid = settings.TWILIO_VERIFY_SERVICE_SID
        self.from_number = settings.TWILIO_FROM_NUMBER
        self._client = None
    
    @property
    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token)
    
    @property
    def client(self):
        """Lazy-load Twilio client"""
        if self._client is None:
            if not self.is_configured:
                return None
            try:
                from twilio.rest import Client
                self._client = Client(self.account_sid, self.auth_token)
            except ImportError:
                logger.error("twilio package not installed. Run: pip install twilio")
                return None
        return self._client
    
    def send_sms(self, to_phone: str, message: str) -> bool:
        """
        Send an SMS message to a phone number.
        
        Args:
            to_phone: Phone number in E.164 format (+1XXXXXXXXXX)
            message: Text message to send (max 1600 chars)
            
        Returns:
            True if sent successfully
        """
        if not self.client:
            logger.info(f"SMS would be sent to {to_phone}: {message[:50]}... (Twilio not configured)")
            return False
        
        try:
            msg = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_phone
            )
            logger.info(f"SMS sent to {to_phone}, SID: {msg.sid}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SMS to {to_phone}: {e}")
            return False
    
    def send_verification_code(self, phone_number: str) -> dict:
        """
        Send a verification code to a phone number via Twilio Verify.
        
        Args:
            phone_number: Phone number in E.164 format (+1XXXXXXXXXX)
            
        Returns:
            Dict with 'success', 'status', 'message' keys
        """
        if not self.client or not self.verify_sid:
            logger.warning("Twilio Verify not configured")
            return {"success": False, "status": "unconfigured", "message": "SMS verification not configured"}
        
        try:
            verification = self.client.verify.v2 \
                .services(self.verify_sid) \
                .verifications \
                .create(to=phone_number, channel="sms")
            
            logger.info(f"Verification sent to {phone_number}, status: {verification.status}")
            return {
                "success": True,
                "status": verification.status,
                "message": f"Verification code sent to {phone_number}"
            }
        except Exception as e:
            logger.error(f"Failed to send verification to {phone_number}: {e}")
            return {"success": False, "status": "error", "message": str(e)}
    
    def check_verification_code(self, phone_number: str, code: str) -> dict:
        """
        Verify a phone number with the code the user entered.
        
        Args:
            phone_number: Phone number in E.164 format
            code: 6-digit verification code
            
        Returns:
            Dict with 'success', 'status', 'message' keys
        """
        if not self.client or not self.verify_sid:
            return {"success": False, "status": "unconfigured", "message": "SMS verification not configured"}
        
        try:
            verification_check = self.client.verify.v2 \
                .services(self.verify_sid) \
                .verification_checks \
                .create(to=phone_number, code=code)
            
            is_approved = verification_check.status == "approved"
            logger.info(f"Verification check for {phone_number}: {verification_check.status}")
            
            return {
                "success": is_approved,
                "status": verification_check.status,
                "message": "Phone verified successfully!" if is_approved else "Invalid or expired code"
            }
        except Exception as e:
            logger.error(f"Failed to check verification for {phone_number}: {e}")
            return {"success": False, "status": "error", "message": str(e)}
    
    def send_alert_sms(self, to_phone: str, alert_type: str, title: str, message: str = "") -> bool:
        """
        Send an alert notification via SMS.
        Keeps messages concise for SMS format.
        
        Args:
            to_phone: Phone number in E.164 format
            alert_type: Type of alert for formatting
            title: Alert title
            message: Additional details (truncated for SMS)
        """
        # Format concise SMS
        prefix = {
            "FRN_STATUS_CHANGE": "\U0001f504",
            "NEW_DENIAL": "\u26a0\ufe0f",
            "DEADLINE_APPROACHING": "\u23f0",
            "DISBURSEMENT_RECEIVED": "\U0001f4b0",
            "FUNDING_APPROVED": "\u2705",
            "FORM_470_MATCH": "\U0001f4cb",
            "COMPETITOR_ACTIVITY": "\U0001f50d",
            "APPEAL_DEADLINE": "\U0001f6a8",
        }.get(alert_type, "\U0001f4e2")
        
        sms_text = f"{prefix} SkyRate AI: {title}"
        if message:
            # Keep SMS under 160 chars when possible
            remaining = 160 - len(sms_text) - 3  # 3 for " - "
            if remaining > 20:
                sms_text += f" - {message[:remaining]}"
        
        return self.send_sms(to_phone, sms_text)
    
    def send_admin_broadcast_sms(self, to_phone: str, message: str) -> bool:
        """Send an admin broadcast SMS to a user"""
        sms_text = f"SkyRate AI: {message}"
        if len(sms_text) > 1600:
            sms_text = sms_text[:1597] + "..."
        return self.send_sms(to_phone, sms_text)


# Convenience function
def get_sms_service() -> SMSService:
    return SMSService()
