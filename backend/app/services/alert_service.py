"""
Alert Service
Handles alert creation, notification delivery, and alert management

Key Features:
- Real-time alert creation on triggers (denial, status change, deadline)
- Email notifications (immediate and digest)
- In-app notification delivery
- Auto-generate appeal for applicants on denial
- Weekly summary reports
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
import logging

from ..models.alert import Alert, AlertConfig, AlertType, AlertPriority
from ..models.user import User, UserRole
from ..models.applicant import ApplicantProfile, ApplicantFRN, ApplicantAutoAppeal
from ..core.config import settings

logger = logging.getLogger(__name__)


class AlertService:
    """Service for managing alerts and notifications"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ==================== ALERT CREATION ====================
    
    def create_alert(
        self,
        user_id: int,
        alert_type: AlertType,
        title: str,
        message: str,
        priority: AlertPriority = AlertPriority.MEDIUM,
        entity_type: str = None,
        entity_id: str = None,
        entity_name: str = None,
        metadata: dict = None,
        send_email: bool = None  # None = use user preference
    ) -> Optional[Alert]:
        """
        Create a new alert for a user.
        Checks user preferences before creating.
        Optionally sends email notification.
        """
        # Get user's alert config
        config = self.get_or_create_alert_config(user_id)
        
        # Check if user wants this type of alert
        if not self._should_alert(config, alert_type):
            logger.debug(f"User {user_id} has disabled alerts for {alert_type}")
            return None
        
        # Check in-app notifications preference
        if not config.in_app_notifications:
            logger.debug(f"User {user_id} has disabled in-app notifications")
            # Still might send email
            if send_email is None:
                send_email = config.email_notifications
        
        # Create the alert
        alert = Alert(
            user_id=user_id,
            alert_type=alert_type.value if isinstance(alert_type, AlertType) else alert_type,
            priority=priority.value if isinstance(priority, AlertPriority) else priority,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            alert_metadata=metadata or {},
            is_read=False,
            is_dismissed=False,
            email_sent=False
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        
        logger.info(f"Created alert {alert.id} for user {user_id}: {title}")
        
        # Send email if requested
        if send_email is None:
            send_email = config.email_notifications and not config.daily_digest
        
        if send_email:
            self._send_alert_email(alert, config)
        
        return alert
    
    def _should_alert(self, config: AlertConfig, alert_type: AlertType) -> bool:
        """Check if user wants alerts of this type"""
        type_mapping = {
            AlertType.NEW_DENIAL: config.alert_on_denial,
            AlertType.FRN_STATUS_CHANGE: config.alert_on_status_change,
            AlertType.DEADLINE_APPROACHING: config.alert_on_deadline,
            AlertType.APPEAL_DEADLINE: config.alert_on_deadline,
            AlertType.DISBURSEMENT_RECEIVED: config.alert_on_disbursement,
            AlertType.FUNDING_APPROVED: config.alert_on_funding_approved,
            AlertType.FORM_470_MATCH: config.alert_on_form_470,
            AlertType.COMPETITOR_ACTIVITY: config.alert_on_competitor,
        }
        
        alert_type_enum = alert_type if isinstance(alert_type, AlertType) else AlertType(alert_type)
        return type_mapping.get(alert_type_enum, True)
    
    # ==================== DENIAL ALERTS ====================
    
    def alert_on_denial(
        self,
        user_id: int,
        frn: str,
        school_name: str,
        denial_reason: str,
        amount: float = 0,
        funding_year: int = None,
        auto_generate_appeal: bool = None
    ) -> Optional[Alert]:
        """
        Create alert when a denial is detected.
        For applicants: automatically generate appeal letter.
        For consultants: just notify.
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        
        # Create the alert
        alert = self.create_alert(
            user_id=user_id,
            alert_type=AlertType.NEW_DENIAL,
            priority=AlertPriority.HIGH,
            title=f"🚨 Denial Detected: {school_name}",
            message=f"FRN {frn} has been denied. Reason: {denial_reason}. "
                    f"Amount at risk: ${amount:,.2f}. "
                    f"You have 60 days to file an appeal.",
            entity_type="frn",
            entity_id=frn,
            entity_name=school_name,
            metadata={
                "denial_reason": denial_reason,
                "amount": amount,
                "funding_year": funding_year,
            }
        )
        
        # For applicants: auto-generate appeal
        if user.role == UserRole.APPLICANT.value:
            if auto_generate_appeal is None:
                auto_generate_appeal = True  # Default for applicants
            
            if auto_generate_appeal:
                self._auto_generate_appeal_for_applicant(user, frn, denial_reason, funding_year)
        
        return alert
    
    def _auto_generate_appeal_for_applicant(
        self,
        user: User,
        frn: str,
        denial_reason: str,
        funding_year: int
    ):
        """
        Automatically generate an appeal letter for an applicant's denied FRN.
        """
        try:
            from .ai_service import AIService
            
            # Get applicant profile
            profile = self.db.query(ApplicantProfile).filter(
                ApplicantProfile.user_id == user.id
            ).first()
            
            if not profile:
                logger.warning(f"No applicant profile for user {user.id}")
                return
            
            # Get the FRN record
            frn_record = self.db.query(ApplicantFRN).filter(
                ApplicantFRN.applicant_profile_id == profile.id,
                ApplicantFRN.frn == frn
            ).first()
            
            if not frn_record:
                logger.warning(f"FRN {frn} not found for applicant {profile.id}")
                return
            
            # Check if appeal already exists
            existing_appeal = self.db.query(ApplicantAutoAppeal).filter(
                ApplicantAutoAppeal.frn_id == frn_record.id
            ).first()
            
            if existing_appeal:
                logger.info(f"Appeal already exists for FRN {frn}")
                return
            
            # Generate appeal using AI
            ai_service = AIService()
            appeal_result = ai_service.generate_applicant_appeal(
                frn=frn,
                denial_reason=denial_reason,
                school_name=profile.organization_name,
                funding_year=funding_year or datetime.now().year,
                service_type=frn_record.service_type,
                amount=float(frn_record.amount_requested or 0)
            )
            
            # Calculate deadline (60 days from denial)
            appeal_deadline = datetime.utcnow() + timedelta(days=60)
            
            # Create auto appeal record
            auto_appeal = ApplicantAutoAppeal(
                applicant_profile_id=profile.id,
                frn_id=frn_record.id,
                frn=frn,
                funding_year=funding_year,
                denial_reason=denial_reason,
                denial_category=appeal_result.get("denial_category"),
                appeal_strategy=appeal_result.get("strategy"),
                appeal_letter=appeal_result.get("appeal_letter"),
                evidence_checklist=appeal_result.get("evidence_checklist"),
                success_probability=appeal_result.get("success_probability"),
                status="draft",
                user_modified=False,
                chat_history=[],
                appeal_deadline=appeal_deadline,
                days_until_deadline=60,
                generated_at=datetime.utcnow()
            )
            
            self.db.add(auto_appeal)
            self.db.commit()
            
            logger.info(f"Auto-generated appeal for FRN {frn}")
            
            # Create follow-up alert about the appeal
            self.create_alert(
                user_id=user.id,
                alert_type=AlertType.FRN_STATUS_CHANGE,
                priority=AlertPriority.MEDIUM,
                title="📝 Appeal Letter Generated",
                message=f"We've automatically drafted an appeal letter for FRN {frn}. "
                        f"Review and customize it in your dashboard. "
                        f"Deadline: {appeal_deadline.strftime('%B %d, %Y')}",
                entity_type="appeal",
                entity_id=str(auto_appeal.id),
                entity_name=profile.organization_name,
                metadata={
                    "frn": frn,
                    "appeal_id": auto_appeal.id,
                    "deadline": appeal_deadline.isoformat()
                }
            )
            
        except Exception as e:
            logger.error(f"Error auto-generating appeal: {e}")
    
    # ==================== STATUS CHANGE ALERTS ====================
    
    def alert_on_status_change(
        self,
        user_id: int,
        frn: str,
        school_name: str,
        old_status: str,
        new_status: str,
        amount: float = 0
    ) -> Optional[Alert]:
        """
        Create alert when FRN status changes.
        Determines priority based on the nature of the change.
        """
        # Determine priority and emoji based on status
        if "denied" in new_status.lower():
            priority = AlertPriority.HIGH
            emoji = "🚨"
        elif "funded" in new_status.lower() or "committed" in new_status.lower():
            priority = AlertPriority.MEDIUM
            emoji = "✅"
        elif "pending" in new_status.lower():
            priority = AlertPriority.LOW
            emoji = "⏳"
        else:
            priority = AlertPriority.MEDIUM
            emoji = "🔄"
        
        return self.create_alert(
            user_id=user_id,
            alert_type=AlertType.FRN_STATUS_CHANGE,
            priority=priority,
            title=f"{emoji} Status Change: {school_name}",
            message=f"FRN {frn} status changed from '{old_status}' to '{new_status}'. "
                    f"Amount: ${amount:,.2f}",
            entity_type="frn",
            entity_id=frn,
            entity_name=school_name,
            metadata={
                "old_status": old_status,
                "new_status": new_status,
                "amount": amount,
            }
        )
    
    # ==================== DEADLINE ALERTS ====================
    
    def alert_on_deadline(
        self,
        user_id: int,
        entity_id: str,
        entity_name: str,
        deadline_type: str,
        deadline_date: datetime,
        days_remaining: int
    ) -> Optional[Alert]:
        """
        Create alert for approaching deadline.
        """
        if days_remaining <= 3:
            priority = AlertPriority.CRITICAL
            emoji = "🔴"
        elif days_remaining <= 7:
            priority = AlertPriority.HIGH
            emoji = "🟠"
        elif days_remaining <= 14:
            priority = AlertPriority.MEDIUM
            emoji = "🟡"
        else:
            priority = AlertPriority.LOW
            emoji = "📅"
        
        return self.create_alert(
            user_id=user_id,
            alert_type=AlertType.DEADLINE_APPROACHING,
            priority=priority,
            title=f"{emoji} Deadline in {days_remaining} days: {deadline_type}",
            message=f"{deadline_type} deadline for {entity_name} is "
                    f"{deadline_date.strftime('%B %d, %Y')} ({days_remaining} days remaining).",
            entity_type="deadline",
            entity_id=entity_id,
            entity_name=entity_name,
            metadata={
                "deadline_type": deadline_type,
                "deadline_date": deadline_date.isoformat(),
                "days_remaining": days_remaining,
            }
        )
    
    # ==================== FORM 470 ALERTS (VENDORS) ====================
    
    def alert_on_form_470(
        self,
        user_id: int,
        form_470_id: str,
        entity_name: str,
        state: str,
        category: str,
        services: list,
        deadline: datetime = None
    ) -> Optional[Alert]:
        """
        Create alert for new Form 470 matching vendor criteria.
        """
        return self.create_alert(
            user_id=user_id,
            alert_type=AlertType.FORM_470_MATCH,
            priority=AlertPriority.MEDIUM,
            title=f"📋 New Form 470: {entity_name}",
            message=f"New Form 470 in {state} matching your criteria. "
                    f"Category: {category}. Services: {', '.join(services[:3])}{'...' if len(services) > 3 else ''}",
            entity_type="form_470",
            entity_id=form_470_id,
            entity_name=entity_name,
            metadata={
                "state": state,
                "category": category,
                "services": services,
                "deadline": deadline.isoformat() if deadline else None,
            }
        )
    
    # ==================== COMPETITOR ALERTS (VENDORS) ====================
    
    def alert_on_competitor(
        self,
        user_id: int,
        competitor_name: str,
        entity_name: str,
        activity_type: str,
        details: str
    ) -> Optional[Alert]:
        """
        Create alert for competitor activity.
        """
        return self.create_alert(
            user_id=user_id,
            alert_type=AlertType.COMPETITOR_ACTIVITY,
            priority=AlertPriority.LOW,
            title=f"👀 Competitor Activity: {competitor_name}",
            message=f"{competitor_name} {activity_type} at {entity_name}. {details}",
            entity_type="competitor",
            entity_id=competitor_name,
            entity_name=entity_name,
            metadata={
                "competitor_name": competitor_name,
                "activity_type": activity_type,
                "details": details,
            }
        )
    
    # ==================== ALERT CONFIG MANAGEMENT ====================
    
    def get_or_create_alert_config(self, user_id: int) -> AlertConfig:
        """Get or create alert configuration for a user"""
        config = self.db.query(AlertConfig).filter(
            AlertConfig.user_id == user_id
        ).first()
        
        if not config:
            user = self.db.query(User).filter(User.id == user_id).first()
            config = AlertConfig(
                user_id=user_id,
                alert_on_denial=True,
                alert_on_status_change=True,
                alert_on_deadline=True,
                alert_on_disbursement=True,
                alert_on_funding_approved=True,
                alert_on_form_470=user.role == UserRole.VENDOR.value if user else False,
                alert_on_competitor=False,  # Off by default
                deadline_warning_days=14,
                min_alert_amount=0,
                email_notifications=True,
                in_app_notifications=True,
                daily_digest=False,  # Off by default
                notification_email=user.email if user else None,
                alert_filters={}
            )
            self.db.add(config)
            self.db.commit()
            self.db.refresh(config)
        
        return config
    
    def update_alert_config(
        self,
        user_id: int,
        updates: Dict[str, Any]
    ) -> AlertConfig:
        """Update alert configuration for a user"""
        config = self.get_or_create_alert_config(user_id)
        
        allowed_fields = [
            'alert_on_denial', 'alert_on_status_change', 'alert_on_deadline',
            'alert_on_disbursement', 'alert_on_funding_approved', 'alert_on_form_470',
            'alert_on_competitor', 'deadline_warning_days', 'min_alert_amount',
            'email_notifications', 'in_app_notifications', 'daily_digest',
            'notification_email', 'alert_filters'
        ]
        
        for field, value in updates.items():
            if field in allowed_fields:
                setattr(config, field, value)
        
        config.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(config)
        
        return config
    
    # ==================== ALERT RETRIEVAL ====================
    
    def get_alerts(
        self,
        user_id: int,
        unread_only: bool = False,
        alert_type: str = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Alert]:
        """Get alerts for a user with optional filtering"""
        query = self.db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.is_dismissed == False
        )
        
        if unread_only:
            query = query.filter(Alert.is_read == False)
        
        if alert_type:
            query = query.filter(Alert.alert_type == alert_type)
        
        return query.order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()
    
    def get_unread_count(self, user_id: int) -> int:
        """Get count of unread alerts for a user"""
        return self.db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.is_read == False,
            Alert.is_dismissed == False
        ).count()
    
    def mark_as_read(self, alert_id: int, user_id: int) -> Optional[Alert]:
        """Mark an alert as read"""
        alert = self.db.query(Alert).filter(
            Alert.id == alert_id,
            Alert.user_id == user_id
        ).first()
        
        if alert:
            alert.is_read = True
            alert.read_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(alert)
        
        return alert
    
    def mark_all_as_read(self, user_id: int) -> int:
        """Mark all alerts as read for a user"""
        result = self.db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.is_read == False
        ).update({
            Alert.is_read: True,
            Alert.read_at: datetime.utcnow()
        })
        self.db.commit()
        return result
    
    def dismiss_alert(self, alert_id: int, user_id: int) -> Optional[Alert]:
        """Dismiss an alert (soft delete)"""
        alert = self.db.query(Alert).filter(
            Alert.id == alert_id,
            Alert.user_id == user_id
        ).first()
        
        if alert:
            alert.is_dismissed = True
            self.db.commit()
            self.db.refresh(alert)
        
        return alert
    
    # ==================== EMAIL NOTIFICATIONS ====================
    
    def _send_alert_email(self, alert: Alert, config: AlertConfig):
        """Send email notification for an alert"""
        try:
            from .email_service import EmailService
            
            email_to = config.notification_email or self.db.query(User).filter(
                User.id == alert.user_id
            ).first().email
            
            email_service = EmailService()
            email_service.send_alert_email(
                to_email=email_to,
                alert=alert
            )
            
            alert.email_sent = True
            alert.email_sent_at = datetime.utcnow()
            self.db.commit()
            
            logger.info(f"Sent alert email to {email_to} for alert {alert.id}")
            
        except Exception as e:
            logger.error(f"Failed to send alert email: {e}")
    
    def send_daily_digest(self, user_id: int) -> bool:
        """Send daily digest email with all unread alerts"""
        config = self.get_or_create_alert_config(user_id)
        
        if not config.daily_digest:
            return False
        
        # Get all unread alerts from the last 24 hours
        since = datetime.utcnow() - timedelta(hours=24)
        alerts = self.db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.created_at >= since,
            Alert.is_dismissed == False
        ).order_by(Alert.created_at.desc()).all()
        
        if not alerts:
            return False
        
        try:
            from .email_service import EmailService
            
            user = self.db.query(User).filter(User.id == user_id).first()
            email_to = config.notification_email or user.email
            
            email_service = EmailService()
            email_service.send_digest_email(
                to_email=email_to,
                user_name=user.first_name or user.email,
                alerts=alerts
            )
            
            logger.info(f"Sent daily digest to {email_to} with {len(alerts)} alerts")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send daily digest: {e}")
            return False
    
    def send_weekly_summary(self, user_id: int) -> bool:
        """Send weekly summary email"""
        config = self.get_or_create_alert_config(user_id)
        
        if not config.daily_digest:  # Using same flag for weekly
            return False
        
        # Get stats from the last 7 days
        since = datetime.utcnow() - timedelta(days=7)
        
        alerts = self.db.query(Alert).filter(
            Alert.user_id == user_id,
            Alert.created_at >= since,
            Alert.is_dismissed == False
        ).all()
        
        # Summarize by type
        summary = {
            "total_alerts": len(alerts),
            "denials": len([a for a in alerts if a.alert_type == AlertType.NEW_DENIAL.value]),
            "status_changes": len([a for a in alerts if a.alert_type == AlertType.FRN_STATUS_CHANGE.value]),
            "deadlines": len([a for a in alerts if a.alert_type == AlertType.DEADLINE_APPROACHING.value]),
            "unread": len([a for a in alerts if not a.is_read]),
        }
        
        if summary["total_alerts"] == 0:
            return False
        
        try:
            from .email_service import EmailService
            
            user = self.db.query(User).filter(User.id == user_id).first()
            email_to = config.notification_email or user.email
            
            email_service = EmailService()
            email_service.send_weekly_summary_email(
                to_email=email_to,
                user_name=user.first_name or user.email,
                summary=summary,
                top_alerts=alerts[:10]  # Top 10 most recent
            )
            
            logger.info(f"Sent weekly summary to {email_to}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send weekly summary: {e}")
            return False


# Convenience function to get alert service
def get_alert_service(db: Session) -> AlertService:
    return AlertService(db)
