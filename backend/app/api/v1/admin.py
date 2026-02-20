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
from ...models.admin_frn_snapshot import AdminFRNSnapshot
from ...models.promo_invite import PromoInvite, PromoInviteStatus
from ...services.cache_service import get_cached, set_cached, make_cache_key

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
    
    # Enrich with role-specific portfolio data
    enriched = []
    for u in users:
        data = u.to_dict()
        if u.role == "consultant" and u.consultant_profile:
            schools = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == u.consultant_profile.id
            ).all()
            data["portfolio"] = {
                "crn": u.consultant_profile.crn,
                "schools_count": len(schools),
                "schools": [{"ben": s.ben, "name": s.school_name, "state": s.state} for s in schools[:10]],
            }
        elif u.role == "vendor" and u.vendor_profile:
            data["portfolio"] = {
                "spin": u.vendor_profile.spin,
                "company_name": u.vendor_profile.company_name,
            }
        elif u.role == "applicant":
            profile = db.query(ApplicantProfile).filter(ApplicantProfile.user_id == u.id).first()
            if profile:
                bens = db.query(ApplicantBEN).filter(ApplicantBEN.applicant_profile_id == profile.id).all()
                data["portfolio"] = {
                    "organization": profile.organization_name,
                    "ben_count": len(bens),
                    "bens": [{"ben": b.ben, "name": b.organization_name or b.display_name} for b in bens[:10]],
                }
        enriched.append(data)
    
    return {
        "success": True,
        "total": total,
        "limit": limit,
        "offset": offset,
        "users": enriched
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
    background_tasks: BackgroundTasks = None,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """
    Get aggregated FRN status across ALL users.
    Reads from the admin_frn_snapshots DB table (instant).
    A background scheduler job refreshes this table every 6 hours.
    If the table is empty, triggers an immediate background refresh.
    Returns ALL FRNs — no pagination limit.
    """
    import logging
    log = logging.getLogger(__name__)

    # Check how many snapshot rows exist
    snap_count = db.query(func.count(AdminFRNSnapshot.id)).scalar() or 0

    if snap_count == 0:
        # Table is empty — trigger immediate refresh and fall back to old cache/live
        log.info("Admin FRN snapshot table empty, triggering background refresh")
        if background_tasks:
            from app.services.scheduler_service import refresh_admin_frn_snapshot
            background_tasks.add_task(refresh_admin_frn_snapshot)
        # Fall back to existing cache so user gets *something* on first call
        cache_key = make_cache_key("admin_frn_monitor_v2")
        cached = get_cached(db, cache_key)
        if cached:
            all_rows = cached
        else:
            all_rows = []
    else:
        # Read all rows from snapshot table (fast DB read)
        query = db.query(AdminFRNSnapshot)

        if funding_year:
            query = query.filter(AdminFRNSnapshot.funding_year == str(funding_year))
        if status_filter:
            query = query.filter(AdminFRNSnapshot.status.ilike(f"%{status_filter}%"))
        if search:
            term = f"%{search}%"
            query = query.filter(or_(
                AdminFRNSnapshot.frn.ilike(term),
                AdminFRNSnapshot.organization_name.ilike(term),
                AdminFRNSnapshot.ben.ilike(term),
                AdminFRNSnapshot.user_email.ilike(term),
            ))

        rows = query.all()
        all_rows = [
            {
                "frn": r.frn,
                "status": r.status,
                "funding_year": r.funding_year,
                "amount_requested": r.amount_requested,
                "amount_committed": r.amount_committed,
                "service_type": r.service_type,
                "organization_name": r.organization_name,
                "ben": r.ben,
                "user_id": r.user_id,
                "user_email": r.user_email,
                "source": r.source,
                "fcdl_date": r.fcdl_date,
                "last_checked": r.last_refreshed.isoformat() if r.last_refreshed else None,
            }
            for r in rows
        ]

    # Summary stats (always from full table, ignoring filters for accurate totals)
    if snap_count > 0:
        total_tracked = snap_count
        denied_frns = db.query(func.count(AdminFRNSnapshot.id)).filter(
            AdminFRNSnapshot.status.ilike("%denied%")
        ).scalar() or 0
        pending_frns = db.query(func.count(AdminFRNSnapshot.id)).filter(
            or_(AdminFRNSnapshot.status.ilike("%pending%"), AdminFRNSnapshot.status.ilike("%review%"))
        ).scalar() or 0
        funded_frns = db.query(func.count(AdminFRNSnapshot.id)).filter(
            or_(AdminFRNSnapshot.status.ilike("%funded%"), AdminFRNSnapshot.status.ilike("%committed%"))
        ).scalar() or 0
        # Get last refresh time
        last_refresh = db.query(func.max(AdminFRNSnapshot.last_refreshed)).scalar()
    else:
        total_tracked = len(all_rows)
        denied_frns = len([f for f in all_rows if "denied" in (f.get("status") or "").lower()])
        pending_frns = len([f for f in all_rows if "pending" in (f.get("status") or "").lower()])
        funded_frns = len([f for f in all_rows if "funded" in (f.get("status") or "").lower() or "committed" in (f.get("status") or "").lower()])
        last_refresh = None

    return {
        "success": True,
        "total": len(all_rows),
        "summary": {
            "total_tracked": total_tracked,
            "denied": denied_frns,
            "pending": pending_frns,
            "funded": funded_frns,
            "last_refreshed": last_refresh.isoformat() if last_refresh else None,
        },
        "frns": all_rows,
    }


@router.post("/frn-monitor/refresh")
async def trigger_frn_refresh(
    background_tasks: BackgroundTasks,
    current_user: User = AdminUser,
    db: Session = Depends(get_db)
):
    """Manually trigger a background refresh of the FRN snapshot."""
    from app.services.scheduler_service import refresh_admin_frn_snapshot
    background_tasks.add_task(refresh_admin_frn_snapshot)
    return {"success": True, "message": "FRN snapshot refresh started in background. Reload in a few minutes."}


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

    # Portfolio stats (cross-portal overview)
    total_consultant_schools = db.query(ConsultantSchool).count()
    total_applicant_bens = db.query(ApplicantBEN).count()
    total_vendor_spins = db.query(VendorProfile).filter(
        VendorProfile.spin.isnot(None), VendorProfile.spin != ""
    ).count()

    # Collect all tracked BENs for live USAC summary (cached)
    cache_key = make_cache_key("admin_dashboard_portfolio_v2")
    cached = get_cached(db, cache_key)
    if cached:
        portfolio_live = cached
    else:
        consultant_bens = [s.ben for s in db.query(ConsultantSchool.ben).distinct().all() if s.ben]
        applicant_ben_list = [b.ben for b in db.query(ApplicantBEN.ben).distinct().all() if b.ben]
        all_bens = list(set(consultant_bens + applicant_ben_list))
        
        portfolio_live = {
            "total_bens_tracked": len(all_bens),
            "funded_amount": 0,
            "pending_amount": 0,
            "denied_amount": 0,
            "denied_count": 0,
            "denied_current_prev_fy": 0,
            "funded_count": 0,
            "pending_count": 0,
            "total_frns": 0,
        }
        
        if all_bens:
            try:
                from utils.usac_client import USACDataClient
                from datetime import date
                client = USACDataClient()
                # No year filter — fetch ALL funding years
                batch_result = client.get_frn_status_batch(all_bens)
                
                current_fy = date.today().year
                prev_fy = current_fy - 1
                
                if batch_result.get('success'):
                    for ben_key, ben_data in batch_result.get('results', {}).items():
                        summary = ben_data.get('summary', {})
                        portfolio_live["funded_count"] += summary.get('funded', {}).get('count', 0)
                        portfolio_live["funded_amount"] += summary.get('funded', {}).get('amount', 0)
                        portfolio_live["denied_count"] += summary.get('denied', {}).get('count', 0)
                        portfolio_live["denied_amount"] += summary.get('denied', {}).get('amount', 0)
                        portfolio_live["pending_count"] += summary.get('pending', {}).get('count', 0)
                        portfolio_live["pending_amount"] += summary.get('pending', {}).get('amount', 0)
                        
                        # Count total FRNs
                        frns_list = ben_data.get('frns', [])
                        portfolio_live["total_frns"] += len(frns_list)
                        
                        # Count denials for current + previous FY only
                        for frn in frns_list:
                            fy = frn.get('funding_year')
                            status = (frn.get('status') or '').lower()
                            if 'denied' in status:
                                try:
                                    fy_int = int(fy) if fy else 0
                                except (ValueError, TypeError):
                                    fy_int = 0
                                if fy_int in (current_fy, prev_fy, current_fy + 1):
                                    portfolio_live["denied_current_prev_fy"] += 1
                
                set_cached(db, cache_key, portfolio_live, ttl_hours=6)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Admin dashboard USAC fetch failed: {e}")

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
                "total_tracked": portfolio_live.get("total_frns", 0),
                "denied": portfolio_live.get("denied_count", 0),
                "denied_current_prev_fy": portfolio_live.get("denied_current_prev_fy", 0),
            },
            "portfolio": {
                "consultant_schools": total_consultant_schools,
                "applicant_bens": total_applicant_bens,
                "vendor_spins": total_vendor_spins,
                "live": portfolio_live,
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


# ==================== PROMO INVITE SYSTEM ====================

class PromoInviteCreate(BaseModel):
    email: EmailStr
    role: str = "vendor"  # vendor, consultant, applicant
    trial_days: int = 30  # 21, 30, 60, 90, 180

class PromoInviteResponse(BaseModel):
    id: int
    token: str
    email: str
    role: str
    trial_days: int
    status: str
    invite_url: str
    invite_expires_at: Optional[str] = None
    used_at: Optional[str] = None
    used_by_user_id: Optional[int] = None
    created_at: Optional[str] = None


@router.post("/promo-invites", response_model=PromoInviteResponse)
async def create_promo_invite(
    data: PromoInviteCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """
    Create a promo invite and send email to the user.
    Generates a unique URL that lets the user sign up and skip the paywall
    for the specified trial duration.
    """
    import uuid
    
    settings = get_settings()
    
    # Validate role
    if data.role not in ["vendor", "consultant", "applicant"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be vendor, consultant, or applicant.")
    
    # Validate trial days (21 days to 6 months)
    if data.trial_days < 21 or data.trial_days > 180:
        raise HTTPException(status_code=400, detail="Trial days must be between 21 and 180.")
    
    # Check if email already has an active invite
    existing = db.query(PromoInvite).filter(
        PromoInvite.email == data.email.lower(),
        PromoInvite.status == PromoInviteStatus.PENDING.value
    ).first()
    if existing:
        # Revoke the old invite and create a new one
        existing.status = PromoInviteStatus.REVOKED.value
        db.flush()
    
    # Check if email already registered
    existing_user = db.query(User).filter(User.email == data.email.lower()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="This email is already registered.")
    
    # Generate unique token
    token = uuid.uuid4().hex
    
    # Invite link expires in 7 days
    invite_expires_at = datetime.utcnow() + timedelta(days=7)
    
    invite = PromoInvite(
        token=token,
        email=data.email.lower(),
        role=data.role,
        trial_days=data.trial_days,
        status=PromoInviteStatus.PENDING.value,
        invite_expires_at=invite_expires_at,
        created_by_admin_id=current_user.id,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    
    # Build invite URL
    base_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
    invite_url = f"{base_url}/sign-up?promo={token}"
    
    # Send invite email in background
    background_tasks.add_task(_send_promo_invite_email, data.email.lower(), invite_url, data.role, data.trial_days)
    
    return PromoInviteResponse(
        id=invite.id,
        token=invite.token,
        email=invite.email,
        role=invite.role,
        trial_days=invite.trial_days,
        status=invite.status,
        invite_url=invite_url,
        invite_expires_at=invite.invite_expires_at.isoformat() if invite.invite_expires_at else None,
        used_at=invite.used_at.isoformat() if invite.used_at else None,
        used_by_user_id=invite.used_by_user_id,
        created_at=invite.created_at.isoformat() if invite.created_at else None,
    )


@router.get("/promo-invites")
async def list_promo_invites(
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """List all promo invites with their status."""
    settings = get_settings()
    base_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
    
    invites = db.query(PromoInvite).order_by(PromoInvite.created_at.desc()).all()
    
    # Auto-expire any pending invites past their expiry date
    now = datetime.utcnow()
    for inv in invites:
        if inv.status == PromoInviteStatus.PENDING.value and inv.invite_expires_at and inv.invite_expires_at < now:
            inv.status = PromoInviteStatus.EXPIRED.value
    db.commit()
    
    result = []
    for inv in invites:
        d = inv.to_dict()
        d["invite_url"] = f"{base_url}/sign-up?promo={inv.token}"
        # Include user info if used
        if inv.used_by_user_id:
            user = db.query(User).filter(User.id == inv.used_by_user_id).first()
            if user:
                d["used_by_name"] = user.full_name
                d["used_by_email"] = user.email
        result.append(d)
    
    return {
        "invites": result,
        "total": len(result),
        "pending": sum(1 for i in result if i["status"] == "pending"),
        "accepted": sum(1 for i in result if i["status"] == "accepted"),
        "expired": sum(1 for i in result if i["status"] == "expired"),
    }


@router.delete("/promo-invites/{invite_id}")
async def revoke_promo_invite(
    invite_id: int,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """Revoke a pending promo invite."""
    invite = db.query(PromoInvite).filter(PromoInvite.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.status != PromoInviteStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Cannot revoke invite with status '{invite.status}'")
    
    invite.status = PromoInviteStatus.REVOKED.value
    db.commit()
    return {"success": True, "message": f"Invite to {invite.email} has been revoked."}


@router.post("/promo-invites/{invite_id}/resend")
async def resend_promo_invite(
    invite_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db)
):
    """Resend the invite email for a pending invite."""
    settings = get_settings()
    invite = db.query(PromoInvite).filter(PromoInvite.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.status != PromoInviteStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Cannot resend invite with status '{invite.status}'")
    
    # Reset expiry
    invite.invite_expires_at = datetime.utcnow() + timedelta(days=7)
    db.commit()
    
    base_url = getattr(settings, 'FRONTEND_URL', 'https://skyrate.ai')
    invite_url = f"{base_url}/sign-up?promo={invite.token}"
    
    background_tasks.add_task(_send_promo_invite_email, invite.email, invite_url, invite.role, invite.trial_days)
    
    return {"success": True, "message": f"Invite resent to {invite.email}"}


def _send_promo_invite_email(email: str, invite_url: str, role: str, trial_days: int):
    """Send the promo invite email with a nice HTML template."""
    try:
        from ...services.email_service import get_email_service
        email_svc = get_email_service()
        
        role_display = role.capitalize()
        
        if trial_days >= 30:
            months = trial_days // 30
            duration_text = f"{months} month{'s' if months > 1 else ''}"
        else:
            duration_text = f"{trial_days} days"
        
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited to SkyRate.AI</h1>
                <p style="color: #c4b5fd; margin: 10px 0 0 0; font-size: 16px;">E-Rate Funding Intelligence Platform</p>
            </div>
            
            <div style="padding: 30px; background: #f8fafc; border-radius: 0 0 12px 12px;">
                <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
                    You've been invited to join <strong>SkyRate.AI</strong> as a <strong>{role_display}</strong> with 
                    <strong>{duration_text} of free access</strong> — no credit card required.
                </p>
                
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #7c3aed; margin-top: 0;">What you get:</h3>
                    <ul style="color: #475569; line-height: 1.8;">
                        {"<li>Find Form 470 leads by manufacturer</li><li>Track SPIN status & competitor analysis</li><li>Market intelligence & lead scoring</li>" if role == "vendor" else ""}
                        {"<li>Manage school portfolios & FRN tracking</li><li>AI-powered appeal letter generation</li><li>Denial analysis & funding insights</li>" if role == "consultant" else ""}
                        {"<li>Track your applications & FRN status</li><li>Funding management dashboard</li><li>AI-powered denial analysis</li>" if role == "applicant" else ""}
                    </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{invite_url}" 
                       style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                        Accept Invitation & Create Account
                    </a>
                </div>
                
                <p style="font-size: 13px; color: #94a3b8; text-align: center;">
                    This invite link expires in 7 days. After your {duration_text} trial ends, you can continue with a paid subscription.
                </p>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                
                <p style="font-size: 12px; color: #94a3b8; text-align: center;">
                    SkyRate.AI — AI-Powered E-Rate Funding Intelligence<br>
                    <a href="https://skyrate.ai" style="color: #7c3aed;">skyrate.ai</a>
                </p>
            </div>
        </div>
        """
        
        text_content = f"""You're invited to join SkyRate.AI as a {role_display}!

You get {duration_text} of free access — no credit card required.

Accept your invitation: {invite_url}

This invite link expires in 7 days.

— SkyRate.AI Team
"""
        
        email_svc.send_email(
            to_email=email,
            subject=f"You're Invited to SkyRate.AI — {duration_text} Free Access",
            html_content=html_content,
            text_content=text_content,
            email_type='welcome'
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to send promo invite email to {email}: {e}")
