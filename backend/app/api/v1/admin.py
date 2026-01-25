"""
Admin Portal API Endpoints
Handles user management, subscriptions oversight, and analytics
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta

from ...core.database import get_db
from ...core.security import get_current_user, require_role, hash_password
from ...models.user import User, UserRole
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.consultant import ConsultantProfile, ConsultantSchool
from ...models.vendor import VendorProfile, VendorSearch
from ...models.application import QueryHistory

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
