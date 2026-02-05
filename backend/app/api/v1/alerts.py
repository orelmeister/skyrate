"""
Alerts API Endpoints
Handles alert management for both consultants and vendors
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.alert import Alert, AlertConfig, AlertType, AlertPriority

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ==================== SCHEMAS ====================

class AlertConfigUpdate(BaseModel):
    """Schema for updating alert configuration"""
    alert_on_denial: Optional[bool] = None
    alert_on_status_change: Optional[bool] = None
    alert_on_deadline: Optional[bool] = None
    alert_on_disbursement: Optional[bool] = None
    alert_on_funding_approved: Optional[bool] = None
    alert_on_form_470: Optional[bool] = None
    alert_on_competitor: Optional[bool] = None
    deadline_warning_days: Optional[int] = None
    min_alert_amount: Optional[float] = None
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None
    daily_digest: Optional[bool] = None
    notification_email: Optional[str] = None
    alert_filters: Optional[Dict[str, Any]] = None


class AlertMarkRead(BaseModel):
    """Schema for marking alerts as read"""
    alert_ids: List[int]


class AlertDismiss(BaseModel):
    """Schema for dismissing alerts"""
    alert_ids: List[int]


# ==================== HELPER FUNCTIONS ====================

def get_or_create_alert_config(user_id: int, db: Session) -> AlertConfig:
    """Get existing alert config or create default one"""
    config = db.query(AlertConfig).filter(AlertConfig.user_id == user_id).first()
    
    if not config:
        config = AlertConfig(user_id=user_id)
        db.add(config)
        db.commit()
        db.refresh(config)
    
    return config


# ==================== ENDPOINTS ====================

@router.get("")
async def get_alerts(
    unread_only: bool = Query(False, description="Only return unread alerts"),
    alert_type: Optional[str] = Query(None, description="Filter by alert type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all alerts for the current user.
    Returns alerts sorted by creation date (newest first).
    """
    query = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.is_dismissed == False
    )
    
    if unread_only:
        query = query.filter(Alert.is_read == False)
    
    if alert_type:
        query = query.filter(Alert.alert_type == alert_type)
    
    # Get total count for pagination
    total_count = query.count()
    
    # Get paginated results
    alerts = query.order_by(Alert.created_at.desc()).offset(offset).limit(limit).all()
    
    # Get unread count
    unread_count = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.is_dismissed == False,
        Alert.is_read == False
    ).count()
    
    return {
        "success": True,
        "total": total_count,
        "unread_count": unread_count,
        "limit": limit,
        "offset": offset,
        "alerts": [a.to_dict() for a in alerts]
    }


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get count of unread alerts for badge display"""
    count = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.is_dismissed == False,
        Alert.is_read == False
    ).count()
    
    return {"unread_count": count}


@router.get("/config")
async def get_alert_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the current user's alert configuration"""
    config = get_or_create_alert_config(current_user.id, db)
    return {"success": True, "config": config.to_dict()}


@router.put("/config")
async def update_alert_config(
    data: AlertConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update alert configuration/preferences"""
    config = get_or_create_alert_config(current_user.id, db)
    
    # Update only provided fields
    update_data = data.dict(exclude_unset=True)
    for field, value in update_data.items():
        if hasattr(config, field):
            setattr(config, field, value)
    
    db.commit()
    db.refresh(config)
    
    return {"success": True, "config": config.to_dict()}


@router.post("/mark-read")
async def mark_alerts_read(
    data: AlertMarkRead,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark one or more alerts as read"""
    updated = db.query(Alert).filter(
        Alert.id.in_(data.alert_ids),
        Alert.user_id == current_user.id
    ).update({
        Alert.is_read: True,
        Alert.read_at: datetime.utcnow()
    }, synchronize_session=False)
    
    db.commit()
    
    return {"success": True, "marked_read": updated}


@router.post("/mark-all-read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all alerts as read"""
    updated = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.is_read == False
    ).update({
        Alert.is_read: True,
        Alert.read_at: datetime.utcnow()
    }, synchronize_session=False)
    
    db.commit()
    
    return {"success": True, "marked_read": updated}


@router.post("/dismiss")
async def dismiss_alerts(
    data: AlertDismiss,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Dismiss one or more alerts (soft delete)"""
    updated = db.query(Alert).filter(
        Alert.id.in_(data.alert_ids),
        Alert.user_id == current_user.id
    ).update({
        Alert.is_dismissed: True
    }, synchronize_session=False)
    
    db.commit()
    
    return {"success": True, "dismissed": updated}


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permanently delete an alert"""
    alert = db.query(Alert).filter(
        Alert.id == alert_id,
        Alert.user_id == current_user.id
    ).first()
    
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    db.delete(alert)
    db.commit()
    
    return {"success": True, "deleted": True}


@router.get("/types")
async def get_alert_types(
    current_user: User = Depends(get_current_user)
):
    """Get available alert types with descriptions"""
    types = [
        {
            "type": AlertType.NEW_DENIAL.value,
            "name": "New Denial",
            "description": "Alert when a new denial is detected in your portfolio",
            "roles": ["consultant", "vendor"]
        },
        {
            "type": AlertType.FRN_STATUS_CHANGE.value,
            "name": "FRN Status Change",
            "description": "Alert when an FRN status changes (e.g., Pending → Funded)",
            "roles": ["consultant", "vendor"]
        },
        {
            "type": AlertType.DEADLINE_APPROACHING.value,
            "name": "Deadline Approaching",
            "description": "Alert when a filing deadline is approaching",
            "roles": ["consultant", "vendor"]
        },
        {
            "type": AlertType.DISBURSEMENT_RECEIVED.value,
            "name": "Disbursement Received",
            "description": "Alert when a disbursement payment is received",
            "roles": ["consultant", "vendor"]
        },
        {
            "type": AlertType.FUNDING_APPROVED.value,
            "name": "Funding Approved",
            "description": "Alert when an FRN is approved/committed",
            "roles": ["consultant", "vendor"]
        },
        {
            "type": AlertType.FORM_470_MATCH.value,
            "name": "Form 470 Match",
            "description": "Alert when a new Form 470 matches your criteria",
            "roles": ["vendor"]
        },
        {
            "type": AlertType.COMPETITOR_ACTIVITY.value,
            "name": "Competitor Activity",
            "description": "Alert when competitor activity is detected at your serviced entities",
            "roles": ["vendor"]
        },
        {
            "type": AlertType.APPEAL_DEADLINE.value,
            "name": "Appeal Deadline",
            "description": "Alert when an appeal deadline is approaching for a denied FRN",
            "roles": ["consultant"]
        },
    ]
    
    # Filter by user role
    user_role = current_user.role
    filtered_types = [t for t in types if user_role in t["roles"] or user_role == "admin"]
    
    return {"success": True, "alert_types": filtered_types}


@router.get("/summary")
async def get_alerts_summary(
    days: int = Query(7, ge=1, le=90, description="Number of days to summarize"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a summary of alerts for the last N days"""
    since = datetime.utcnow() - timedelta(days=days)
    
    alerts = db.query(Alert).filter(
        Alert.user_id == current_user.id,
        Alert.created_at >= since
    ).all()
    
    # Group by type
    by_type = {}
    by_priority = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    unread = 0
    
    for alert in alerts:
        # Count by type
        alert_type = alert.alert_type
        if alert_type not in by_type:
            by_type[alert_type] = 0
        by_type[alert_type] += 1
        
        # Count by priority
        if alert.priority in by_priority:
            by_priority[alert.priority] += 1
        
        # Count unread
        if not alert.is_read:
            unread += 1
    
    return {
        "success": True,
        "period_days": days,
        "total_alerts": len(alerts),
        "unread_count": unread,
        "by_type": by_type,
        "by_priority": by_priority
    }


# ==================== ALERT CREATION HELPERS (Internal Use) ====================

def create_alert_for_user(
    db: Session,
    user_id: int,
    alert_type: str,
    title: str,
    message: str,
    entity_type: str = None,
    entity_id: str = None,
    entity_name: str = None,
    priority: str = AlertPriority.MEDIUM.value,
    metadata: dict = None
) -> Alert:
    """
    Internal helper to create an alert for a user.
    Checks user's alert config before creating.
    """
    # Get user's alert config
    config = db.query(AlertConfig).filter(AlertConfig.user_id == user_id).first()
    
    # Check if user wants this type of alert
    if config:
        type_settings = {
            AlertType.NEW_DENIAL.value: config.alert_on_denial,
            AlertType.FRN_STATUS_CHANGE.value: config.alert_on_status_change,
            AlertType.DEADLINE_APPROACHING.value: config.alert_on_deadline,
            AlertType.DISBURSEMENT_RECEIVED.value: config.alert_on_disbursement,
            AlertType.FUNDING_APPROVED.value: config.alert_on_funding_approved,
            AlertType.FORM_470_MATCH.value: config.alert_on_form_470,
            AlertType.COMPETITOR_ACTIVITY.value: config.alert_on_competitor,
        }
        
        if alert_type in type_settings and not type_settings[alert_type]:
            return None  # User doesn't want this type of alert
    
    # Create the alert
    alert = Alert(
        user_id=user_id,
        alert_type=alert_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        priority=priority,
        metadata=metadata or {}
    )
    
    db.add(alert)
    db.commit()
    db.refresh(alert)
    
    return alert


@router.post("/test")
async def send_test_alert(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a test alert to verify notifications are working"""
    alert = create_alert_for_user(
        db=db,
        user_id=current_user.id,
        alert_type=AlertType.FRN_STATUS_CHANGE.value,
        priority=AlertPriority.LOW.value,
        title="🧪 Test Alert",
        message="This is a test alert to verify your notification settings are working correctly. "
                "If you see this, your in-app notifications are configured properly!",
        entity_type="test",
        entity_id="test-123",
        entity_name="Test Entity"
    )
    
    if alert:
        return {
            "success": True,
            "message": "Test alert sent successfully",
            "alert_id": alert.id
        }
    else:
        return {
            "success": False,
            "message": "Alert was not created (check your notification preferences)",
            "alert_id": None
        }
