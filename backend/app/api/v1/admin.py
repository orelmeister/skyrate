"""
Admin Portal API Endpoints
Handles user management, subscriptions oversight, analytics,
support ticket management, FRN monitoring, and user communications
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta

from ...core.database import get_db
from ...core.config import get_settings
from ...core.security import get_current_user, require_role, hash_password
from ...models.user import User, UserRole
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.consultant import ConsultantProfile, ConsultantSchool
from ...models.vendor import VendorProfile, VendorSearch
from ...models.application import QueryHistory
from ...models.support_ticket import SupportTicket, TicketMessage, TicketStatus
from ...models.applicant import ApplicantProfile, ApplicantFRN, ApplicantBEN
from ...models.alert import Alert

router = APIRouter(prefix="/admin", tags=["Admin Portal"])


# ==================== SCHEMAS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    is_active: bool = True


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    is_active: Optional[bool] = None


class SubscriptionUpdate(BaseModel):
    status: Optional[str] = None
    plan: Optional[str] = None
    end_date: Optional[datetime] = None


# ==================== DEPENDENCIES ====================

AdminUser = Depends(require_role("admin"))


# ==================== USER MANAGEMENT ====================

@router.get("/users")
async def list_users(
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """List all users with optional filtering"""
    query = db.query(User)
    
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.email.ilike(search_term)) |
            (User.first_name.ilike(search_term)) |
            (User.last_name.ilike(search_term)) |
            (User.company_name.ilike(search_term))
        )
    
    total = query.count()
    users = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "success": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "users": [u.to_dict() for u in users]
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Get detailed user information"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user_data = user.to_dict()
    
    # Add subscription info
    if user.subscription:
        user_data["subscription"] = user.subscription.to_dict()
    
    # Add role-specific profile
    if user.role == "consultant" and user.consultant_profile:
        user_data["consultant_profile"] = user.consultant_profile.to_dict()
    elif user.role == "vendor" and user.vendor_profile:
        user_data["vendor_profile"] = user.vendor_profile.to_dict()
    
    return {"success": True, "user": user_data}


@router.post("/users")
async def create_user(
    data: UserCreate,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Create a new user (admin only)"""
    # Check email
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists"
        )
    
    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        role=data.role,
        first_name=data.first_name,
        last_name=data.last_name,
        company_name=data.company_name,
        is_active=data.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {"success": True, "user": user.to_dict()}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Update user details"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if data.email is not None:
        # Check if email is taken
        existing = db.query(User).filter(
            User.email == data.email.lower(),
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )
        user.email = data.email.lower()
    
    if data.role is not None:
        user.role = data.role
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.company_name is not None:
        user.company_name = data.company_name
    if data.is_active is not None:
        user.is_active = data.is_active
    
    db.commit()
    db.refresh(user)
    
    return {"success": True, "user": user.to_dict()}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Delete a user"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself"
        )
    
    db.delete(user)
    db.commit()
    
    return {"success": True, "message": "User deleted"}


# ==================== SUBSCRIPTION MANAGEMENT ====================

@router.get("/subscriptions")
async def list_subscriptions(
    status_filter: Optional[str] = None,
    plan: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """List all subscriptions"""
    query = db.query(Subscription).join(User)
    
    if status_filter:
        query = query.filter(Subscription.status == status_filter)
    if plan:
        query = query.filter(Subscription.plan == plan)
    
    total = query.count()
    subscriptions = query.order_by(Subscription.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for sub in subscriptions:
        sub_data = sub.to_dict()
        sub_data["user_email"] = sub.user.email
        sub_data["user_name"] = sub.user.full_name
        result.append(sub_data)
    
    return {
        "success": True,
        "total": total,
        "subscriptions": result
    }


@router.put("/subscriptions/{subscription_id}")
async def update_subscription(
    subscription_id: int,
    data: SubscriptionUpdate,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Update subscription (admin override)"""
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )
    
    if data.status is not None:
        sub.status = data.status
    if data.plan is not None:
        sub.plan = data.plan
    if data.end_date is not None:
        sub.end_date = data.end_date
        sub.current_period_end = data.end_date
    
    db.commit()
    db.refresh(sub)
    
    return {"success": True, "subscription": sub.to_dict()}


# ==================== ANALYTICS ====================

@router.get("/analytics")
async def get_analytics(
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Get platform analytics overview"""
    # User counts
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    
    users_by_role = db.query(
        User.role, func.count(User.id)
    ).group_by(User.role).all()
    
    # New users in last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    new_users = db.query(User).filter(
        User.created_at >= thirty_days_ago
    ).count()
    
    # Subscription stats
    active_subscriptions = db.query(Subscription).filter(
        Subscription.status.in_([
            SubscriptionStatus.ACTIVE.value,
            SubscriptionStatus.TRIALING.value
        ])
    ).count()
    
    subscriptions_by_status = db.query(
        Subscription.status, func.count(Subscription.id)
    ).group_by(Subscription.status).all()
    
    # Revenue (MRR approximation)
    active_subs = db.query(Subscription).filter(
        Subscription.status == SubscriptionStatus.ACTIVE.value
    ).all()
    
    mrr = sum(
        sub.price_cents / 100 / (12 if sub.plan == "yearly" else 1)
        for sub in active_subs
    )
    
    # Portfolio stats
    total_schools = db.query(ConsultantSchool).count()
    total_searches = db.query(VendorSearch).count()
    total_queries = db.query(QueryHistory).count()
    
    # Recent activity
    recent_queries = db.query(QueryHistory).filter(
        QueryHistory.executed_at >= thirty_days_ago
    ).count()
    
    return {
        "success": True,
        "analytics": {
            "users": {
                "total": total_users,
                "active": active_users,
                "new_last_30_days": new_users,
                "by_role": dict(users_by_role),
            },
            "subscriptions": {
                "active": active_subscriptions,
                "by_status": dict(subscriptions_by_status),
                "mrr_dollars": round(mrr, 2),
            },
            "activity": {
                "total_schools_tracked": total_schools,
                "total_vendor_searches": total_searches,
                "total_queries": total_queries,
                "queries_last_30_days": recent_queries,
            },
            "generated_at": datetime.utcnow().isoformat()
        }
    }


@router.get("/analytics/revenue")
async def get_revenue_analytics(
    months: int = 6,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Get detailed revenue analytics"""
    # This would be more sophisticated with actual payment history
    # For now, show subscription value over time
    
    revenue_by_month = []
    for i in range(months - 1, -1, -1):
        start_date = datetime.utcnow().replace(day=1) - timedelta(days=30 * i)
        end_date = start_date + timedelta(days=30)
        
        active_subs = db.query(Subscription).filter(
            Subscription.status == SubscriptionStatus.ACTIVE.value,
            Subscription.start_date <= end_date
        ).all()
        
        monthly_revenue = sum(
            sub.price_cents / 100 / (12 if sub.plan == "yearly" else 1)
            for sub in active_subs
        )
        
        revenue_by_month.append({
            "month": start_date.strftime("%Y-%m"),
            "mrr": round(monthly_revenue, 2),
            "active_subscriptions": len(active_subs)
        })
    
    return {
        "success": True,
        "revenue": revenue_by_month
    }


# ==================== SUPPORT TICKET MANAGEMENT ====================

class TicketUpdateRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None
    admin_notes: Optional[str] = None


class AdminReplyRequest(BaseModel):
    message: str


class EmailUserRequest(BaseModel):
    subject: str
    message: str
    email_type: Optional[str] = "support"


@router.get("/tickets")
async def list_tickets(
    status_filter: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """List all support tickets with filtering"""
    query = db.query(SupportTicket)

    if status_filter:
        query = query.filter(SupportTicket.status == status_filter)
    if priority:
        query = query.filter(SupportTicket.priority == priority)
    if category:
        query = query.filter(SupportTicket.category == category)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                SupportTicket.subject.ilike(term),
                SupportTicket.message.ilike(term),
                SupportTicket.guest_email.ilike(term),
            )
        )

    total = query.count()
    tickets = query.order_by(SupportTicket.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "success": True,
        "total": total,
        "tickets": [t.to_dict() for t in tickets]
    }


@router.get("/tickets/{ticket_id}")
async def get_ticket_detail(
    ticket_id: int,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Get a ticket with full message history"""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return {"success": True, "ticket": ticket.to_dict_with_messages()}


@router.put("/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: int,
    data: TicketUpdateRequest,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Update ticket status, priority, assignment, or notes"""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if data.status is not None:
        ticket.status = data.status
        if data.status in (TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value):
            ticket.resolved_at = datetime.utcnow()
    if data.priority is not None:
        ticket.priority = data.priority
    if data.assigned_to is not None:
        ticket.assigned_to = data.assigned_to
    if data.admin_notes is not None:
        ticket.admin_notes = data.admin_notes

    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)

    return {"success": True, "ticket": ticket.to_dict()}


@router.post("/tickets/{ticket_id}/reply")
async def admin_reply_ticket(
    ticket_id: int,
    data: AdminReplyRequest,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Admin reply to a support ticket"""
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    message = TicketMessage(
        ticket_id=ticket.id,
        sender_type="admin",
        sender_id=current_user.id,
        sender_name=f"{current_user.first_name or 'Admin'} {current_user.last_name or ''}".strip(),
        message=data.message,
    )
    db.add(message)
    ticket.status = TicketStatus.WAITING_USER.value
    ticket.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)

    # Send email notification to ticket creator
    recipient_email = ticket.user.email if ticket.user else ticket.guest_email
    if recipient_email:
        try:
            from ...services.email_service import EmailService
            email_service = EmailService()
            email_service.send_email(
                to_email=recipient_email,
                subject=f"Re: {ticket.subject} [Ticket #{ticket.id}]",
                html_content=f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #7c3aed;">SkyRate AI Support</h2>
                    <p>We've responded to your support ticket:</p>
                    <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border-left: 4px solid #7c3aed;">
                        <p>{data.message}</p>
                    </div>
                    <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
                        You can reply to this ticket from your 
                        <a href="https://skyrate.ai/settings" style="color: #7c3aed;">SkyRate dashboard</a>.
                    </p>
                </div>
                """,
                email_type='support'
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send reply email: {e}")

    return {"success": True, "message": message.to_dict()}


# ==================== FRN MONITORING (ALL USERS) ====================

@router.get("/frn-monitor")
async def get_frn_monitor(
    status_filter: Optional[str] = None,
    funding_year: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """
    Get aggregated FRN status across ALL users.
    Lets admin monitor every FRN being tracked in the system.
    """
    query = db.query(ApplicantFRN).join(
        ApplicantProfile,
        ApplicantFRN.applicant_profile_id == ApplicantProfile.id
    ).join(
        User,
        ApplicantProfile.user_id == User.id
    )

    if status_filter:
        query = query.filter(ApplicantFRN.status == status_filter)
    if funding_year:
        query = query.filter(ApplicantFRN.funding_year == funding_year)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                ApplicantFRN.frn.ilike(term),
                ApplicantProfile.organization_name.ilike(term),
            )
        )

    total = query.count()
    frn_records = query.order_by(ApplicantFRN.last_checked.desc().nullslast()).offset(offset).limit(limit).all()

    result = []
    for frn in frn_records:
        profile = db.query(ApplicantProfile).filter(
            ApplicantProfile.id == frn.applicant_profile_id
        ).first()
        user = db.query(User).filter(User.id == profile.user_id).first() if profile else None

        result.append({
            "frn": frn.frn,
            "status": frn.status,
            "funding_year": frn.funding_year,
            "amount_requested": float(frn.amount_requested) if frn.amount_requested else None,
            "amount_committed": float(frn.amount_committed) if frn.amount_committed else None,
            "service_type": frn.service_type,
            "last_checked": frn.last_checked.isoformat() if frn.last_checked else None,
            "organization_name": profile.organization_name if profile else None,
            "ben": profile.ben if profile else None,
            "user_id": user.id if user else None,
            "user_email": user.email if user else None,
        })

    # Summary stats
    all_frns = db.query(ApplicantFRN).count()
    denied_frns = db.query(ApplicantFRN).filter(
        ApplicantFRN.status.ilike("%denied%")
    ).count()
    pending_frns = db.query(ApplicantFRN).filter(
        ApplicantFRN.status.ilike("%pending%")
    ).count()
    funded_frns = db.query(ApplicantFRN).filter(
        or_(
            ApplicantFRN.status.ilike("%funded%"),
            ApplicantFRN.status.ilike("%committed%"),
        )
    ).count()

    return {
        "success": True,
        "total": total,
        "summary": {
            "total_tracked": all_frns,
            "denied": denied_frns,
            "pending": pending_frns,
            "funded": funded_frns,
        },
        "frns": result
    }


@router.get("/frn-monitor/denials")
async def get_recent_denials(
    days: int = 30,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Get recent denial alerts across all users"""
    since = datetime.utcnow() - timedelta(days=days)

    denial_alerts = db.query(Alert).filter(
        Alert.alert_type == "new_denial",
        Alert.created_at >= since
    ).order_by(Alert.created_at.desc()).all()

    return {
        "success": True,
        "total": len(denial_alerts),
        "denials": [a.to_dict() for a in denial_alerts]
    }


# ==================== USER COMMUNICATION ====================

@router.post("/users/{user_id}/email")
async def email_user(
    user_id: int,
    data: EmailUserRequest,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Send an email to a specific user from admin"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        from ...services.email_service import EmailService
        email_service = EmailService()
        success = email_service.send_email(
            to_email=user.email,
            subject=data.subject,
            html_content=f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #7c3aed; margin: 0;">SkyRate<span style="color: #a78bfa;">.AI</span></h1>
                </div>
                <div style="padding: 16px;">
                    {data.message}
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                <p style="color: #64748b; font-size: 12px; text-align: center;">
                    This message was sent from your SkyRate AI admin team.<br>
                    <a href="https://skyrate.ai" style="color: #7c3aed;">skyrate.ai</a>
                </p>
            </div>
            """,
            email_type=data.email_type or 'support'
        )

        if success:
            return {"success": True, "message": f"Email sent to {user.email}"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email error: {str(e)}")


# ==================== ADMIN DASHBOARD OVERVIEW ====================

@router.get("/dashboard")
async def get_admin_dashboard(
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """
    Comprehensive admin dashboard data.
    Returns user stats, recent tickets, FRN overview, and recent alerts.
    """
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    seven_days_ago = now - timedelta(days=7)

    # User stats
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
    new_users_30d = db.query(User).filter(User.created_at >= thirty_days_ago).count()
    users_by_role = dict(
        db.query(User.role, func.count(User.id)).group_by(User.role).all()
    )

    # Subscription stats
    active_subs = db.query(Subscription).filter(
        Subscription.status.in_([
            SubscriptionStatus.ACTIVE.value,
            SubscriptionStatus.TRIALING.value
        ])
    ).count()

    # Support ticket stats
    open_tickets = db.query(SupportTicket).filter(
        SupportTicket.status.in_([TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value])
    ).count()
    total_tickets = db.query(SupportTicket).count()
    recent_tickets = db.query(SupportTicket).order_by(
        SupportTicket.created_at.desc()
    ).limit(5).all()

    # FRN stats
    total_frns = db.query(ApplicantFRN).count()
    denied_frns = db.query(ApplicantFRN).filter(
        ApplicantFRN.status.ilike("%denied%")
    ).count()
    recent_denials = db.query(Alert).filter(
        Alert.alert_type == "new_denial",
        Alert.created_at >= seven_days_ago
    ).count()

    # Recent alerts
    recent_alerts = db.query(Alert).order_by(
        Alert.created_at.desc()
    ).limit(10).all()

    return {
        "success": True,
        "dashboard": {
            "users": {
                "total": total_users,
                "active": active_users,
                "new_7d": new_users_7d,
                "new_30d": new_users_30d,
                "by_role": users_by_role,
            },
            "subscriptions": {
                "active": active_subs,
            },
            "tickets": {
                "open": open_tickets,
                "total": total_tickets,
                "recent": [t.to_dict() for t in recent_tickets],
            },
            "frn_monitoring": {
                "total_tracked": total_frns,
                "denied": denied_frns,
                "recent_denials_7d": recent_denials,
            },
            "recent_alerts": [a.to_dict() for a in recent_alerts],
            "generated_at": now.isoformat(),
        }
    }


# ==================== BROADCAST / NOTIFICATIONS ====================

settings = get_settings()

class BroadcastRequest(BaseModel):
    """Send a message to one or multiple users via multiple channels"""
    user_ids: Optional[List[int]] = None  # None = all active users
    channels: List[str] = ["email"]  # email, sms, push, in_app
    subject: str
    message: str
    role_filter: Optional[str] = None  # consultant, vendor, applicant

class SMSRequest(BaseModel):
    message: str


@router.post("/broadcast")
async def admin_broadcast(
    data: BroadcastRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """
    Send a broadcast message to users via selected channels.
    Channels: email, sms, push, in_app
    """
    from ...services.email_service import get_email_service
    from ...services.sms_service import get_sms_service
    from ...services.push_notification_service import PushNotificationService

    query = db.query(User).filter(User.is_active == True)
    if data.user_ids:
        query = query.filter(User.id.in_(data.user_ids))
    if data.role_filter:
        query = query.filter(User.role == data.role_filter)
    query = query.filter(User.role != "admin")
    users = query.all()

    if not users:
        raise HTTPException(status_code=404, detail="No users found matching criteria")

    email_svc = get_email_service()
    sms_svc = get_sms_service()
    push_svc = PushNotificationService(db)

    results = {"email": 0, "sms": 0, "push": 0, "in_app": 0, "total_users": len(users)}

    for user in users:
        if "email" in data.channels:
            html = f'''
            <div style="font-family: sans-serif; padding: 20px; background: #f8fafc;">
              <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 16px;">
                  <span style="font-size: 20px; font-weight: bold; color: #7c3aed;">SkyRate.AI</span>
                </div>
                <h2 style="color: #1e293b; margin: 0 0 12px 0;">{data.subject}</h2>
                <div style="color: #475569; font-size: 14px; line-height: 1.7;">
                  {data.message.replace(chr(10), "<br>")}
                </div>
                <div style="margin-top: 20px; text-align: center;">
                  <a href="{settings.FRONTEND_URL}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none;">Go to SkyRate AI</a>
                </div>
              </div>
            </div>
            '''
            background_tasks.add_task(email_svc.send_email, user.email, data.subject, html, data.message, "alert")
            results["email"] += 1

        if "sms" in data.channels and user.phone and getattr(user, 'phone_verified', False):
            background_tasks.add_task(sms_svc.send_admin_broadcast_sms, user.phone, f"{data.subject}: {data.message}")
            results["sms"] += 1

        if "push" in data.channels:
            background_tasks.add_task(push_svc.send_push_to_user, user.id, data.subject, data.message[:200], settings.FRONTEND_URL)
            results["push"] += 1

        if "in_app" in data.channels:
            alert = Alert(
                user_id=user.id,
                alert_type="admin_broadcast",
                priority="MEDIUM",
                title=data.subject,
                message=data.message,
            )
            db.add(alert)
            results["in_app"] += 1

    if "in_app" in data.channels:
        db.commit()

    return {
        "success": True,
        "results": results,
        "message": f"Broadcast sent to {len(users)} users"
    }


@router.post("/users/{user_id}/sms")
async def send_sms_to_user(
    user_id: int,
    data: SMSRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """Send an SMS to a specific user (must have verified phone)"""
    from ...services.sms_service import get_sms_service

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.phone or not getattr(user, 'phone_verified', False):
        raise HTTPException(status_code=400, detail=f"User {user.email} doesn't have a verified phone")

    sms_svc = get_sms_service()
    if not sms_svc.is_configured:
        raise HTTPException(status_code=503, detail="SMS service not configured")

    success = sms_svc.send_admin_broadcast_sms(user.phone, data.message)
    return {"success": success, "message": f"SMS {'sent' if success else 'failed'} to {user.phone}"}


@router.post("/users/{user_id}/push")
async def send_push_to_user(
    user_id: int,
    data: SMSRequest,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """Send a push notification to a specific user"""
    from ...services.push_notification_service import PushNotificationService

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    push_svc = PushNotificationService(db)
    result = push_svc.send_push_to_user(user.id, "SkyRate.AI", data.message, settings.FRONTEND_URL)
    return {"success": True, "message": f"Push notification sent to user {user.email}", "result": str(result)}
