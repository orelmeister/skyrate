"""
Applicant API Endpoints
Handles applicant registration, dashboard, appeals, and data sync

The applicant tier is designed for the "Sign up → Enter BEN → Pay → BOOM - Everything's ready!" experience.
Backend does all the heavy lifting - applicants just need to provide their BEN.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import re

from slowapi import Limiter
from slowapi.util import get_remote_address

from ...core.database import get_db
from ...core.security import (
    hash_password, verify_password, 
    create_access_token, create_refresh_token,
    get_current_user
)
from ...core.config import settings
from ...models.user import User, UserRole
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.applicant import (
    ApplicantProfile, ApplicantFRN, ApplicantAutoAppeal, 
    ApplicantStatusHistory, DataSyncStatus, FRNStatusType
)
from ...services.usac_service import get_usac_service

router = APIRouter(prefix="/applicant", tags=["Applicant"])

# Rate limiter using client IP
limiter = Limiter(key_func=get_remote_address)


# ==================== SCHEMAS ====================

class ApplicantRegister(BaseModel):
    """
    Minimal registration - just what we need!
    "Ask him the minimum amount of questions"
    """
    email: EmailStr
    password: str = Field(..., min_length=8)
    ben: str = Field(..., description="Billed Entity Number - the golden key")
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password meets security requirements"""
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r'[A-Z]', v):
            errors.append("one uppercase letter")
        if not re.search(r'[a-z]', v):
            errors.append("one lowercase letter")
        if not re.search(r'\d', v):
            errors.append("one digit")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            errors.append("one special character (!@#$%^&*(),.?\":{}|<>)")
        
        if errors:
            raise ValueError(f"Password must contain {', '.join(errors)}")
        return v
    
    @field_validator('ben')
    @classmethod
    def validate_ben_format(cls, v: str) -> str:
        """Validate BEN format - should be numeric"""
        cleaned = v.strip()
        if not cleaned.isdigit():
            raise ValueError("BEN must be a numeric value")
        return cleaned


class ApplicantTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
    profile: dict
    needs_payment: bool = True


class DashboardResponse(BaseModel):
    profile: dict
    frns: List[dict]
    appeals: List[dict]
    recent_changes: List[dict]
    summary: dict


class AppealChatMessage(BaseModel):
    message: str


class AppealUpdate(BaseModel):
    appeal_letter: Optional[str] = None
    status: Optional[str] = None


# ==================== ALERT HELPERS ====================

def trigger_denial_alert(db: Session, profile, frn: str, denial_reason: str, amount: float, funding_year: int):
    """Trigger an alert when a denial is detected"""
    try:
        from ...services.alert_service import AlertService
        alert_service = AlertService(db)
        alert_service.alert_on_denial(
            user_id=profile.user_id,
            frn=frn,
            school_name=profile.organization_name or f"BEN {profile.ben}",
            denial_reason=denial_reason,
            amount=float(amount or 0),
            funding_year=funding_year
        )
    except Exception as e:
        print(f"[Alert] Failed to trigger denial alert: {e}")


def trigger_status_change_alert(db: Session, profile, frn: str, old_status: str, new_status: str, amount: float, is_denial: bool):
    """Trigger an alert when FRN status changes"""
    try:
        from ...services.alert_service import AlertService
        alert_service = AlertService(db)
        
        if is_denial:
            # Denial alerts are handled separately
            return
        
        alert_service.alert_on_status_change(
            user_id=profile.user_id,
            frn=frn,
            school_name=profile.organization_name or f"BEN {profile.ben}",
            old_status=old_status or "Unknown",
            new_status=new_status or "Unknown",
            amount=float(amount or 0)
        )
    except Exception as e:
        print(f"[Alert] Failed to trigger status change alert: {e}")


# ==================== BACKGROUND TASKS ====================

def sync_applicant_data(applicant_profile_id: int):
    """
    Background task to fetch all data for an applicant from USAC.
    This is the magic - "as soon as we sign up the servers in the back end start collecting all the data"
    """
    from ...core.database import SessionLocal
    from ...services.usac_service import get_usac_service
    
    db = SessionLocal()
    try:
        profile = db.query(ApplicantProfile).filter(
            ApplicantProfile.id == applicant_profile_id
        ).first()
        
        if not profile:
            return
        
        # Update sync status
        profile.sync_status = DataSyncStatus.SYNCING.value
        db.commit()
        
        usac_service = get_usac_service()
        ben = profile.ben
        
        try:
            # Fetch organization info
            org_info = usac_service.get_ben_info(ben)
            if org_info:
                profile.organization_name = org_info.get('organization_name')
                profile.state = org_info.get('state')
                profile.city = org_info.get('city')
                profile.entity_type = org_info.get('entity_type')
            
            # Fetch all Form 471 applications
            applications = usac_service.get_applications_by_ben(ben)
            
            total_funded = 0
            total_pending = 0
            total_denied = 0
            
            for app in applications.get('applications', []):
                frn = app.get('frn')
                if not frn:
                    continue
                
                # Check if FRN already exists
                existing_frn = db.query(ApplicantFRN).filter(
                    ApplicantFRN.applicant_profile_id == profile.id,
                    ApplicantFRN.frn == frn
                ).first()
                
                # Determine status type
                raw_status = app.get('status', '').lower()
                status_type = FRNStatusType.UNKNOWN.value
                is_denied = False
                
                if 'funded' in raw_status or 'committed' in raw_status:
                    status_type = FRNStatusType.FUNDED.value
                    total_funded += float(app.get('amount_funded', 0) or 0)
                elif 'denied' in raw_status:
                    status_type = FRNStatusType.DENIED.value
                    is_denied = True
                    total_denied += float(app.get('amount_requested', 0) or 0)
                elif 'pending' in raw_status or 'review' in raw_status:
                    status_type = FRNStatusType.PENDING_REVIEW.value
                    total_pending += float(app.get('amount_requested', 0) or 0)
                elif 'cancelled' in raw_status:
                    status_type = FRNStatusType.CANCELLED.value
                
                frn_data = {
                    'applicant_profile_id': profile.id,
                    'frn': frn,
                    'application_number': app.get('application_number'),
                    'funding_year': app.get('funding_year'),
                    'status': app.get('status'),
                    'status_type': status_type,
                    'service_type': app.get('service_type'),
                    'service_description': app.get('service_description'),
                    'amount_requested': app.get('amount_requested'),
                    'amount_funded': app.get('amount_funded'),
                    'discount_rate': app.get('discount_rate'),
                    'is_denied': is_denied,
                    'denial_reason': app.get('fcdl_comment') if is_denied else None,
                    'fcdl_comment': app.get('fcdl_comment'),
                    'raw_data': app,
                }
                
                # Calculate appeal deadline (60 days from FCDL date)
                if app.get('fcdl_date'):
                    try:
                        fcdl_date = datetime.fromisoformat(app['fcdl_date'].replace('Z', '+00:00'))
                        frn_data['fcdl_date'] = fcdl_date
                        frn_data['appeal_deadline'] = fcdl_date + timedelta(days=60)
                    except:
                        pass
                
                if existing_frn:
                    # Update existing FRN
                    old_status = existing_frn.status
                    for key, value in frn_data.items():
                        if key != 'applicant_profile_id':
                            setattr(existing_frn, key, value)
                    existing_frn.updated_at = datetime.utcnow()
                    
                    # Log status change
                    if old_status != app.get('status'):
                        status_change = ApplicantStatusHistory(
                            applicant_profile_id=profile.id,
                            frn_id=existing_frn.id,
                            frn=frn,
                            change_type='status_change',
                            previous_value=old_status,
                            new_value=app.get('status'),
                            description=f"FRN {frn} status changed from {old_status} to {app.get('status')}",
                            is_important=is_denied,
                        )
                        db.add(status_change)
                        
                        # Trigger status change alert
                        if old_status != app.get('status'):
                            trigger_status_change_alert(
                                db, profile, frn, old_status, 
                                app.get('status'), app.get('amount_requested', 0), is_denied
                            )
                else:
                    # Create new FRN
                    new_frn = ApplicantFRN(**frn_data)
                    db.add(new_frn)
                    db.flush()
                    
                    # Log new FRN
                    status_change = ApplicantStatusHistory(
                        applicant_profile_id=profile.id,
                        frn_id=new_frn.id,
                        frn=frn,
                        change_type='new_frn',
                        new_value=app.get('status'),
                        description=f"New FRN {frn} discovered for funding year {app.get('funding_year')}",
                        is_important=is_denied,
                    )
                    db.add(status_change)
                    
                    # Auto-generate appeal for denials!
                    if is_denied:
                        generate_auto_appeal(db, profile.id, new_frn.id, app)
                        # Trigger denial alert
                        trigger_denial_alert(
                            db, profile, frn, app.get('fcdl_comment', 'Unknown reason'),
                            app.get('amount_requested', 0), app.get('funding_year')
                        )
            
            # Update profile stats
            profile.total_applications = len(applications.get('applications', []))
            profile.total_funded = total_funded
            profile.total_pending = total_pending
            profile.total_denied = total_denied
            profile.active_appeals_count = db.query(ApplicantAutoAppeal).filter(
                ApplicantAutoAppeal.applicant_profile_id == profile.id,
                ApplicantAutoAppeal.status.in_(['ready', 'reviewed'])
            ).count()
            
            # Count pending deadlines (appeals due within 30 days)
            deadline_cutoff = datetime.utcnow() + timedelta(days=30)
            profile.pending_deadlines_count = db.query(ApplicantFRN).filter(
                ApplicantFRN.applicant_profile_id == profile.id,
                ApplicantFRN.is_denied == True,
                ApplicantFRN.appeal_deadline != None,
                ApplicantFRN.appeal_deadline <= deadline_cutoff
            ).count()
            
            profile.sync_status = DataSyncStatus.COMPLETED.value
            profile.last_sync_at = datetime.utcnow()
            profile.sync_error = None
            
            db.commit()
            print(f"[Applicant Sync] Successfully synced data for BEN {ben}")
            
        except Exception as e:
            profile.sync_status = DataSyncStatus.FAILED.value
            profile.sync_error = str(e)
            db.commit()
            print(f"[Applicant Sync] Error syncing data for BEN {ben}: {e}")
            
    except Exception as e:
        print(f"[Applicant Sync] Fatal error: {e}")
        db.rollback()
    finally:
        db.close()


def generate_auto_appeal(db: Session, profile_id: int, frn_id: int, frn_data: dict):
    """
    Auto-generate an appeal for a denied FRN.
    "generating all the appeals that you need"
    """
    from ...services.ai_service import get_ai_service
    
    try:
        ai_service = get_ai_service()
        
        # Prepare denial info for AI
        denial_info = {
            'frn': frn_data.get('frn'),
            'funding_year': frn_data.get('funding_year'),
            'denial_reason': frn_data.get('fcdl_comment'),
            'service_type': frn_data.get('service_type'),
            'amount_requested': frn_data.get('amount_requested'),
        }
        
        # Generate appeal strategy
        strategy = ai_service.analyze_denial_for_appeal(denial_info)
        
        # Generate appeal letter
        appeal_letter = ai_service.generate_appeal_letter(denial_info, strategy)
        
        # Calculate appeal deadline
        appeal_deadline = None
        if frn_data.get('fcdl_date'):
            try:
                fcdl_date = datetime.fromisoformat(frn_data['fcdl_date'].replace('Z', '+00:00'))
                appeal_deadline = fcdl_date + timedelta(days=60)
            except:
                pass
        
        # Create auto-appeal record
        auto_appeal = ApplicantAutoAppeal(
            applicant_profile_id=profile_id,
            frn_id=frn_id,
            frn=frn_data.get('frn'),
            funding_year=frn_data.get('funding_year'),
            denial_reason=frn_data.get('fcdl_comment'),
            denial_category=strategy.get('denial_category', 'Unknown'),
            appeal_strategy=strategy,
            appeal_letter=appeal_letter,
            evidence_checklist=strategy.get('evidence_needed', []),
            success_probability=strategy.get('success_probability', 50),
            appeal_deadline=appeal_deadline,
            status='ready',
        )
        db.add(auto_appeal)
        
        # Log the auto-appeal generation
        status_change = ApplicantStatusHistory(
            applicant_profile_id=profile_id,
            frn_id=frn_id,
            frn=frn_data.get('frn'),
            change_type='appeal_generated',
            new_value='ready',
            description=f"Auto-generated appeal for FRN {frn_data.get('frn')} with {strategy.get('success_probability', 50)}% success probability",
            is_important=True,
        )
        db.add(status_change)
        
        print(f"[Auto-Appeal] Generated appeal for FRN {frn_data.get('frn')}")
        
    except Exception as e:
        print(f"[Auto-Appeal] Error generating appeal for FRN {frn_data.get('frn')}: {e}")


# ==================== ENDPOINTS ====================

@router.post("/register", response_model=ApplicantTokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def register_applicant(
    request: Request,
    data: ApplicantRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Register a new applicant account.
    Just email, password, and BEN - that's all we need!
    
    After registration, background tasks start fetching all data from USAC.
    "as soon as we sign up the servers in the back end start collecting all the data"
    """
    # Check if email exists
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if BEN already registered
    existing_ben = db.query(ApplicantProfile).filter(ApplicantProfile.ben == data.ben).first()
    if existing_ben:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This BEN is already registered to another account"
        )
    
    # Create user
    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        role=UserRole.APPLICANT.value,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    db.flush()
    
    # Create applicant profile
    applicant_profile = ApplicantProfile(
        user_id=user.id,
        ben=data.ben,
        sync_status=DataSyncStatus.PENDING.value,
    )
    db.add(applicant_profile)
    db.flush()
    
    # Create subscription (trial for now, payment will activate)
    trial_end = datetime.utcnow() + timedelta(days=14)
    subscription = Subscription(
        user_id=user.id,
        plan="monthly",
        status=SubscriptionStatus.TRIALING.value,
        price_cents=settings.APPLICANT_MONTHLY_PRICE if hasattr(settings, 'APPLICANT_MONTHLY_PRICE') else 9900,
        start_date=datetime.utcnow(),
        trial_end=trial_end,
        current_period_start=datetime.utcnow(),
        current_period_end=trial_end,
    )
    db.add(subscription)
    
    db.commit()
    db.refresh(user)
    db.refresh(applicant_profile)
    
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "role": user.role})
    
    # Start background data sync immediately!
    background_tasks.add_task(sync_applicant_data, applicant_profile.id)
    
    return ApplicantTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user.to_dict(),
        profile=applicant_profile.to_dict(),
        needs_payment=True,  # Redirect to payment after registration
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get applicant dashboard with all data.
    "boom he sees all the information ready for him about all of his denials everything"
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only for applicants"
        )
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Applicant profile not found"
        )
    
    # Get FRNs ordered by funding year (newest first)
    frns = db.query(ApplicantFRN).filter(
        ApplicantFRN.applicant_profile_id == profile.id
    ).order_by(ApplicantFRN.funding_year.desc(), ApplicantFRN.status_type).all()
    
    # Get appeals
    appeals = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.applicant_profile_id == profile.id
    ).order_by(ApplicantAutoAppeal.appeal_deadline).all()
    
    # Get recent changes (unread first, then by date)
    recent_changes = db.query(ApplicantStatusHistory).filter(
        ApplicantStatusHistory.applicant_profile_id == profile.id
    ).order_by(
        ApplicantStatusHistory.is_read,
        ApplicantStatusHistory.changed_at.desc()
    ).limit(20).all()
    
    # Calculate summary
    denied_frns = [f for f in frns if f.is_denied]
    urgent_appeals = [a for a in appeals if a.appeal_deadline and a.appeal_deadline <= datetime.utcnow() + timedelta(days=14)]
    
    summary = {
        "total_frns": len(frns),
        "funded_count": len([f for f in frns if f.status_type == FRNStatusType.FUNDED.value]),
        "pending_count": len([f for f in frns if f.status_type in [FRNStatusType.PENDING_REVIEW.value, FRNStatusType.IN_REVIEW.value]]),
        "denied_count": len(denied_frns),
        "total_funded_amount": float(profile.total_funded) if profile.total_funded else 0,
        "total_pending_amount": float(profile.total_pending) if profile.total_pending else 0,
        "total_denied_amount": float(profile.total_denied) if profile.total_denied else 0,
        "appeals_ready": len([a for a in appeals if a.status == 'ready']),
        "urgent_deadlines": len(urgent_appeals),
        "unread_changes": len([c for c in recent_changes if not c.is_read]),
        "sync_status": profile.sync_status,
        "last_sync": profile.last_sync_at.isoformat() if profile.last_sync_at else None,
    }
    
    return DashboardResponse(
        profile=profile.to_dict(),
        frns=[f.to_dict() for f in frns],
        appeals=[a.to_dict() for a in appeals],
        recent_changes=[c.to_dict() for c in recent_changes],
        summary=summary,
    )


@router.get("/frns")
async def get_frns(
    funding_year: Optional[int] = None,
    status_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all FRNs for the applicant with optional filters"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    query = db.query(ApplicantFRN).filter(ApplicantFRN.applicant_profile_id == profile.id)
    
    if funding_year:
        query = query.filter(ApplicantFRN.funding_year == funding_year)
    if status_type:
        query = query.filter(ApplicantFRN.status_type == status_type)
    
    frns = query.order_by(ApplicantFRN.funding_year.desc()).all()
    
    return {"frns": [f.to_dict() for f in frns]}


@router.get("/frns/{frn_id}")
async def get_frn_detail(
    frn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed info for a specific FRN with real-time USAC enrichment"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    frn = db.query(ApplicantFRN).filter(
        ApplicantFRN.id == frn_id,
        ApplicantFRN.applicant_profile_id == profile.id
    ).first()
    
    if not frn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FRN not found")
    
    # Get associated appeal if exists
    appeal = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.frn_id == frn_id
    ).first()
    
    result = frn.to_dict()
    result['raw_data'] = frn.raw_data  # Include full USAC data
    result['appeal'] = appeal.to_dict() if appeal else None
    
    # Real-time USAC enrichment for SPIN, provider, discount, disbursement
    try:
        usac_service = get_usac_service()
        enrichment = usac_service.enrich_frn_details(frn.frn, frn.funding_year)
        
        # Merge enrichment into raw_data for frontend consumption
        if enrichment:
            if not result['raw_data']:
                result['raw_data'] = {}
            
            # Update raw_data with enriched fields (don't overwrite if already exists)
            for key, value in enrichment.items():
                if value is not None and (key not in result['raw_data'] or not result['raw_data'].get(key)):
                    result['raw_data'][key] = value
            
            # Also update top-level fields if empty
            if enrichment.get('discount_pct') and not result.get('discount_rate'):
                result['discount_rate'] = float(enrichment['discount_pct'])
            if enrichment.get('total_disbursed') and not result.get('amount_disbursed'):
                result['amount_disbursed'] = enrichment['total_disbursed']
    except Exception as e:
        print(f"[FRN Detail] Enrichment error for FRN {frn.frn}: {e}")
        # Continue without enrichment if it fails
    
    return result


@router.get("/appeals")
async def get_appeals(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all auto-generated appeals"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    query = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.applicant_profile_id == profile.id
    )
    
    if status:
        query = query.filter(ApplicantAutoAppeal.status == status)
    
    appeals = query.order_by(ApplicantAutoAppeal.appeal_deadline).all()
    
    return {"appeals": [a.to_dict() for a in appeals]}


@router.get("/appeals/{appeal_id}")
async def get_appeal_detail(
    appeal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed info for a specific appeal"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    appeal = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.id == appeal_id,
        ApplicantAutoAppeal.applicant_profile_id == profile.id
    ).first()
    
    if not appeal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    
    # Get associated FRN
    frn = db.query(ApplicantFRN).filter(ApplicantFRN.id == appeal.frn_id).first()
    
    result = appeal.to_dict()
    result['frn_details'] = frn.to_dict() if frn else None
    
    return result


@router.put("/appeals/{appeal_id}")
async def update_appeal(
    appeal_id: int,
    data: AppealUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an appeal (edit letter, mark as submitted, etc.)"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    appeal = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.id == appeal_id,
        ApplicantAutoAppeal.applicant_profile_id == profile.id
    ).first()
    
    if not appeal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    
    if data.appeal_letter is not None:
        appeal.appeal_letter = data.appeal_letter
        appeal.user_modified = True
    
    if data.status is not None:
        appeal.status = data.status
        if data.status == 'submitted':
            appeal.submitted_at = datetime.utcnow()
        elif data.status == 'reviewed':
            appeal.reviewed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(appeal)
    
    return appeal.to_dict()


@router.post("/appeals/{appeal_id}/chat")
async def chat_with_appeal(
    appeal_id: int,
    data: AppealChatMessage,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Chat with AI about refining an appeal"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    appeal = db.query(ApplicantAutoAppeal).filter(
        ApplicantAutoAppeal.id == appeal_id,
        ApplicantAutoAppeal.applicant_profile_id == profile.id
    ).first()
    
    if not appeal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appeal not found")
    
    from ...services.ai_service import get_ai_service
    
    ai_service = get_ai_service()
    
    # Add user message to history
    chat_history = appeal.chat_history or []
    chat_history.append({
        "role": "user",
        "content": data.message,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    # Get AI response
    context = {
        'frn': appeal.frn,
        'denial_reason': appeal.denial_reason,
        'current_letter': appeal.appeal_letter,
        'strategy': appeal.appeal_strategy,
    }
    
    response = ai_service.chat_about_appeal(data.message, chat_history, context)
    
    # Add AI response to history
    chat_history.append({
        "role": "assistant",
        "content": response,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    appeal.chat_history = chat_history
    db.commit()
    
    return {
        "message": response,
        "chat_history": chat_history
    }


@router.post("/sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually trigger a data sync from USAC"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    # Check if already syncing
    if profile.sync_status == DataSyncStatus.SYNCING.value:
        return {"message": "Sync already in progress", "status": profile.sync_status}
    
    # Start sync
    background_tasks.add_task(sync_applicant_data, profile.id)
    
    return {"message": "Sync started", "status": "syncing"}


@router.post("/changes/{change_id}/read")
async def mark_change_read(
    change_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a status change as read"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    change = db.query(ApplicantStatusHistory).filter(
        ApplicantStatusHistory.id == change_id,
        ApplicantStatusHistory.applicant_profile_id == profile.id
    ).first()
    
    if not change:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change not found")
    
    change.is_read = True
    db.commit()
    
    return {"success": True}


@router.post("/changes/read-all")
async def mark_all_changes_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all status changes as read"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    db.query(ApplicantStatusHistory).filter(
        ApplicantStatusHistory.applicant_profile_id == profile.id,
        ApplicantStatusHistory.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    
    return {"success": True}


# ==================== MULTI-BEN MANAGEMENT ====================
# "sometimes schools they have multiple Ben numbers because they have different locations"

from ...models.applicant import ApplicantBEN, BENSubscriptionStatus


class AddBENRequest(BaseModel):
    """Request to add a new BEN to monitor"""
    ben: str = Field(..., description="Billed Entity Number to add")
    display_name: Optional[str] = Field(None, description="Friendly name like 'High School' or 'Library'")
    
    @field_validator('ben')
    @classmethod
    def validate_ben_format(cls, v: str) -> str:
        """Validate BEN format - should be numeric"""
        cleaned = v.strip()
        if not cleaned.isdigit():
            raise ValueError("BEN must be a numeric value")
        return cleaned


class UpdateBENRequest(BaseModel):
    """Request to update BEN settings"""
    display_name: Optional[str] = None


@router.get("/bens")
async def list_monitored_bens(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all BENs being monitored by this applicant.
    "schools they have multiple Ben numbers and because they have different locations"
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    # Get all BENs
    bens = db.query(ApplicantBEN).filter(
        ApplicantBEN.applicant_profile_id == profile.id
    ).order_by(ApplicantBEN.is_primary.desc(), ApplicantBEN.created_at).all()
    
    return {
        "bens": [ben.to_dict() for ben in bens],
        "total_count": len(bens),
        "active_count": len([b for b in bens if b.is_paid]),
        "primary_ben": profile.ben,
    }


@router.post("/bens")
async def add_monitored_ben(
    request: AddBENRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Add a new BEN to monitor.
    "when they add a number we then send them to the paywall"
    
    Returns info about the BEN and whether payment is required.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    # Check if BEN already exists
    existing = db.query(ApplicantBEN).filter(
        ApplicantBEN.applicant_profile_id == profile.id,
        ApplicantBEN.ben == request.ben
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="This BEN is already being monitored"
        )
    
    # Try to get organization info from USAC
    usac_service = get_usac_service()
    org_info = None
    try:
        org_info = usac_service.get_ben_info(request.ben)
    except Exception as e:
        print(f"[BEN] Could not fetch org info for {request.ben}: {e}")
    
    # Create the BEN record
    new_ben = ApplicantBEN(
        applicant_profile_id=profile.id,
        ben=request.ben,
        display_name=request.display_name,
        is_primary=False,  # Only the first BEN is primary
        organization_name=org_info.get('organization_name') if org_info else None,
        state=org_info.get('state') if org_info else None,
        city=org_info.get('city') if org_info else None,
        entity_type=org_info.get('entity_type') if org_info else None,
        subscription_status=BENSubscriptionStatus.PENDING_PAYMENT.value,
        is_paid=False,
    )
    
    db.add(new_ben)
    db.commit()
    db.refresh(new_ben)
    
    return {
        "ben": new_ben.to_dict(),
        "needs_payment": True,
        "message": "BEN added successfully. Payment required to activate monitoring.",
        "payment_info": {
            "monthly_price": 49.00,
            "currency": "USD",
            "ben_id": new_ben.id,
        }
    }


@router.get("/bens/{ben_id}")
async def get_ben_details(
    ben_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed information about a specific BEN"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    ben = db.query(ApplicantBEN).filter(
        ApplicantBEN.id == ben_id,
        ApplicantBEN.applicant_profile_id == profile.id
    ).first()
    
    if not ben:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BEN not found")
    
    # Get FRNs for this BEN
    frns = db.query(ApplicantFRN).filter(
        ApplicantFRN.applicant_ben_id == ben.id
    ).all()
    
    ben_dict = ben.to_dict()
    ben_dict["frn_records"] = [frn.to_dict() for frn in frns]
    
    return ben_dict


@router.patch("/bens/{ben_id}")
async def update_ben(
    ben_id: int,
    request: UpdateBENRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update BEN settings (e.g., display name)"""
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    ben = db.query(ApplicantBEN).filter(
        ApplicantBEN.id == ben_id,
        ApplicantBEN.applicant_profile_id == profile.id
    ).first()
    
    if not ben:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BEN not found")
    
    if request.display_name is not None:
        ben.display_name = request.display_name
    
    ben.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "ben": ben.to_dict()}


@router.delete("/bens/{ben_id}")
async def remove_ben(
    ben_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove a BEN from monitoring.
    Cannot remove the primary BEN.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    ben = db.query(ApplicantBEN).filter(
        ApplicantBEN.id == ben_id,
        ApplicantBEN.applicant_profile_id == profile.id
    ).first()
    
    if not ben:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BEN not found")
    
    if ben.is_primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove primary BEN. Change your primary BEN first or contact support."
        )
    
    # Delete the BEN (cascades to related FRNs)
    db.delete(ben)
    db.commit()
    
    return {"success": True, "message": "BEN removed successfully"}


@router.post("/bens/{ben_id}/sync")
async def sync_ben_data(
    ben_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger data sync for a specific BEN.
    Only works if BEN subscription is active.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    ben = db.query(ApplicantBEN).filter(
        ApplicantBEN.id == ben_id,
        ApplicantBEN.applicant_profile_id == profile.id
    ).first()
    
    if not ben:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BEN not found")
    
    if not ben.is_paid:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment required to sync this BEN's data"
        )
    
    # Update sync status
    ben.sync_status = DataSyncStatus.SYNCING.value
    db.commit()
    
    # Queue background sync
    background_tasks.add_task(sync_individual_ben_data, ben.id)
    
    return {
        "success": True,
        "message": "Sync started",
        "ben": ben.to_dict()
    }


def sync_individual_ben_data(ben_id: int):
    """Background task to sync data for a specific BEN"""
    from ...core.database import SessionLocal
    from ...services.usac_service import get_usac_service
    
    db = SessionLocal()
    try:
        ben = db.query(ApplicantBEN).filter(ApplicantBEN.id == ben_id).first()
        if not ben:
            return
        
        usac_service = get_usac_service()
        
        try:
            # Fetch organization info
            org_info = usac_service.get_ben_info(ben.ben)
            if org_info:
                ben.organization_name = org_info.get('organization_name')
                ben.state = org_info.get('state')
                ben.city = org_info.get('city')
                ben.entity_type = org_info.get('entity_type')
            
            # Fetch all applications
            applications = usac_service.get_applications_by_ben(ben.ben)
            
            total_funded = 0
            total_pending = 0
            total_denied = 0
            
            for app in applications.get('applications', []):
                frn = app.get('frn')
                if not frn:
                    continue
                
                # Check if FRN already exists
                existing_frn = db.query(ApplicantFRN).filter(
                    ApplicantFRN.applicant_ben_id == ben.id,
                    ApplicantFRN.frn == frn
                ).first()
                
                # Determine status type
                raw_status = app.get('status', '').lower()
                status_type = FRNStatusType.UNKNOWN.value
                is_denied = False
                
                if 'funded' in raw_status or 'committed' in raw_status:
                    status_type = FRNStatusType.FUNDED.value
                    total_funded += float(app.get('amount_funded', 0) or 0)
                elif 'denied' in raw_status:
                    status_type = FRNStatusType.DENIED.value
                    is_denied = True
                    total_denied += float(app.get('amount_requested', 0) or 0)
                elif 'pending' in raw_status or 'review' in raw_status:
                    status_type = FRNStatusType.PENDING_REVIEW.value
                    total_pending += float(app.get('amount_requested', 0) or 0)
                
                frn_data = {
                    'applicant_profile_id': ben.applicant_profile_id,
                    'applicant_ben_id': ben.id,
                    'frn': frn,
                    'application_number': app.get('application_number'),
                    'funding_year': app.get('funding_year'),
                    'status': app.get('status'),
                    'status_type': status_type,
                    'service_type': app.get('service_type'),
                    'amount_requested': app.get('amount_requested'),
                    'amount_funded': app.get('amount_funded'),
                    'is_denied': is_denied,
                    'denial_reason': app.get('fcdl_comment') if is_denied else None,
                    'raw_data': app,
                }
                
                if existing_frn:
                    for key, value in frn_data.items():
                        if key not in ['applicant_profile_id', 'applicant_ben_id']:
                            setattr(existing_frn, key, value)
                    existing_frn.updated_at = datetime.utcnow()
                else:
                    new_frn = ApplicantFRN(**frn_data)
                    db.add(new_frn)
            
            # Update BEN stats
            ben.total_applications = len(applications.get('applications', []))
            ben.total_funded = total_funded
            ben.total_pending = total_pending
            ben.total_denied = total_denied
            ben.sync_status = DataSyncStatus.COMPLETED.value
            ben.last_sync_at = datetime.utcnow()
            ben.sync_error = None
            
            db.commit()
            print(f"[BEN Sync] Successfully synced data for BEN {ben.ben}")
            
        except Exception as e:
            ben.sync_status = DataSyncStatus.FAILED.value
            ben.sync_error = str(e)
            db.commit()
            print(f"[BEN Sync] Error syncing BEN {ben.ben}: {e}")
            
    finally:
        db.close()


@router.post("/bens/{ben_id}/activate")
async def activate_ben_subscription(
    ben_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Activate a BEN subscription (called after payment).
    This is typically called by a webhook, but can be called manually for testing.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    ben = db.query(ApplicantBEN).filter(
        ApplicantBEN.id == ben_id,
        ApplicantBEN.applicant_profile_id == profile.id
    ).first()
    
    if not ben:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="BEN not found")
    
    # Activate subscription
    ben.is_paid = True
    ben.paid_at = datetime.utcnow()
    ben.subscription_status = BENSubscriptionStatus.ACTIVE.value
    ben.subscription_start = datetime.utcnow()
    
    db.commit()
    
    # Start data sync
    if background_tasks:
        background_tasks.add_task(sync_individual_ben_data, ben.id)
    
    return {
        "success": True,
        "message": "BEN subscription activated",
        "ben": ben.to_dict()
    }


@router.get("/frn-status-live")
async def get_live_frn_status(
    year: Optional[int] = None,
    status_filter: Optional[str] = None,
    pending_reason: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get live FRN status from USAC for all applicant BENs.
    Fetches directly from USAC Open Data API.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    # Get all BENs for applicant
    from ...models.applicant import ApplicantBEN
    bens = db.query(ApplicantBEN).filter(
        ApplicantBEN.applicant_profile_id == profile.id
    ).all()
    
    if not bens:
        return {
            "success": True,
            "total_frns": 0,
            "total_bens": 0,
            "summary": {},
            "bens": [],
            "message": "No BENs registered. Add a BEN to track FRN status."
        }
    
    # Check DB cache first
    ben_numbers = [ben_record.ben for ben_record in bens]
    try:
        from app.services.cache_service import get_cached, set_cached, make_frn_cache_key
        cache_key = make_frn_cache_key(ben_numbers, year, status_filter, pending_reason)
        cached_result = get_cached(db, cache_key)
        if cached_result:
            return cached_result
    except Exception:
        cache_key = None
    
    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        
        # Batch fetch FRN status for ALL applicant BENs in a single USAC API call
        batch_result = client.get_frn_status_batch(
            bens=ben_numbers,
            year=year,
            status_filter=status_filter,
            pending_reason_filter=pending_reason
        )
        
        if not batch_result.get('success'):
            raise Exception(batch_result.get('error', 'Batch FRN query failed'))
        
        all_data = []
        status_counts = {
            "funded": {"count": 0, "amount": 0},
            "denied": {"count": 0, "amount": 0},
            "pending": {"count": 0, "amount": 0},
            "other": {"count": 0, "amount": 0}
        }
        total_frns = 0
        
        for ben_record in bens:
            result = batch_result['results'].get(ben_record.ben, {})
            
            if result.get('success') and result.get('frns'):
                frns = result.get('frns', [])
                total_frns += len(frns)
                
                ben_summary = {
                    "ben": ben_record.ben,
                    "entity_name": result.get('entity_name', ben_record.entity_name or 'Unknown'),
                    "total_frns": len(frns),
                    "funded": 0,
                    "denied": 0,
                    "pending": 0,
                    "total_amount": 0,
                    "frns": frns[:20]
                }
                
                for frn in frns:
                    frn_status = (frn.get('frn_status') or frn.get('status') or '').lower()
                    amount = float(frn.get('total_authorized_amount') or frn.get('amount') or 0)
                    ben_summary["total_amount"] += amount
                    
                    if 'funded' in frn_status or 'committed' in frn_status:
                        ben_summary["funded"] += 1
                        status_counts["funded"]["count"] += 1
                        status_counts["funded"]["amount"] += amount
                    elif 'denied' in frn_status:
                        ben_summary["denied"] += 1
                        status_counts["denied"]["count"] += 1
                        status_counts["denied"]["amount"] += amount
                    elif any(s in frn_status for s in ['pending', 'review', 'submitted', 'certified']):
                        ben_summary["pending"] += 1
                        status_counts["pending"]["count"] += 1
                        status_counts["pending"]["amount"] += amount
                    else:
                        status_counts["other"]["count"] += 1
                        status_counts["other"]["amount"] += amount
                
                all_data.append(ben_summary)
        
        result = {
            "success": True,
            "total_frns": total_frns,
            "total_bens": len(all_data),
            "summary": status_counts,
            "bens": all_data
        }
        
        # Cache the result for 6 hours
        try:
            if cache_key:
                from app.services.cache_service import set_cached
                set_cached(db, cache_key, result, ttl_hours=6)
        except Exception:
            pass  # Cache write failure is non-fatal
        
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch live FRN status: {str(e)}"
        )


@router.get("/disbursements")
async def get_disbursements(
    year: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get disbursement/invoice data for all applicant BENs.
    Shows how much funding has actually been disbursed vs authorized.
    """
    if current_user.role != UserRole.APPLICANT.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Applicants only")
    
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    
    from ...models.applicant import ApplicantBEN
    bens = db.query(ApplicantBEN).filter(
        ApplicantBEN.applicant_profile_id == profile.id
    ).all()
    
    if not bens:
        return {
            "success": True,
            "total_disbursed": 0,
            "total_authorized": 0,
            "disbursement_rate": 0,
            "bens": [],
            "message": "No BENs registered."
        }
    
    try:
        from utils.usac_client import USACDataClient
        from app.services.cache_service import get_cached, set_cached, make_cache_key
        client = USACDataClient()
        
        all_ben_ids = [ben_record.ben for ben_record in bens]
        
        # Check cache first
        cache_key = make_cache_key("disbursements", bens=all_ben_ids, year=year)
        cached = get_cached(db, cache_key)
        if cached:
            return cached
        
        # Batch fetch all BENs in a single USAC API call
        batch_result = client.get_disbursements_batch(all_ben_ids, year=year)
        
        all_bens_data = []
        grand_total_disbursed = 0
        grand_total_authorized = 0
        
        if batch_result.get('success'):
            ben_name_map = {ben_record.ben: ben_record.entity_name for ben_record in bens}
            for ben_id in all_ben_ids:
                result = batch_result.get('results', {}).get(ben_id, {})
                if result.get('success', False) or result.get('total_records', 0) > 0:
                    grand_total_disbursed += result.get('total_disbursed', 0)
                    grand_total_authorized += result.get('total_authorized', 0)
                    all_bens_data.append({
                        "ben": ben_id,
                        "entity_name": result.get('entity_name') or ben_name_map.get(ben_id, 'Unknown'),
                        "total_records": result.get('total_records', 0),
                        "total_disbursed": result.get('total_disbursed', 0),
                        "total_authorized": result.get('total_authorized', 0),
                        "disbursement_rate": result.get('disbursement_rate', 0),
                        "disbursements": result.get('disbursements', [])[:20]
                    })
        
        response_data = {
            "success": True,
            "total_disbursed": grand_total_disbursed,
            "total_authorized": grand_total_authorized,
            "disbursement_rate": round((grand_total_disbursed / grand_total_authorized * 100), 1) if grand_total_authorized > 0 else 0,
            "total_bens": len(all_bens_data),
            "bens": all_bens_data
        }
        
        # Cache for 6 hours
        set_cached(db, cache_key, response_data)
        
        return response_data
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch disbursement data: {str(e)}"
        )
