"""
Authentication API Endpoints
Handles user registration, login, token refresh, and profile management
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timedelta

from ...core.database import get_db
from ...core.security import (
    hash_password, verify_password, 
    create_access_token, create_refresh_token, decode_token,
    get_current_user
)
from ...core.config import settings
from ...models.user import User, UserRole
from ...models.subscription import Subscription, SubscriptionStatus
from ...models.consultant import ConsultantProfile, ConsultantSchool
from ...models.vendor import VendorProfile
from ...services.usac_service import get_usac_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ==================== SCHEMAS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    role: str = Field(default="consultant", pattern="^(consultant|vendor)$")
    crn: Optional[str] = Field(None, description="Consultant Registration Number (required for consultants)")
    spin: Optional[str] = Field(None, description="Service Provider Identification Number (required for vendors)")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class TokenRefresh(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None


# ==================== BACKGROUND TASKS ====================

def auto_import_schools_from_crn(user_id: int, crn: str):
    """
    Background task to auto-import schools from CRN.
    Called after consultant registration.
    """
    from ...core.database import SessionLocal
    
    db = SessionLocal()
    try:
        # Get consultant profile
        profile = db.query(ConsultantProfile).filter(
            ConsultantProfile.user_id == user_id
        ).first()
        
        if not profile:
            return
        
        # Query USAC for schools
        usac_service = get_usac_service()
        result = usac_service.get_schools_by_crn(crn)
        
        # Import each school
        for school in result['schools']:
            ben = school.get('ben')
            if not ben:
                continue
            
            # Check if already exists
            existing = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id,
                ConsultantSchool.ben == ben
            ).first()
            
            if existing:
                continue
            
            # Add new school
            new_school = ConsultantSchool(
                consultant_profile_id=profile.id,
                ben=ben,
                school_name=school.get('organization_name'),
                state=school.get('state'),
                city=school.get('city'),
                entity_type=school.get('entity_type'),
                notes=f"Auto-imported on registration from CRN {crn}",
            )
            db.add(new_school)
        
        db.commit()
        print(f"[Auto-Import] Imported {len(result['schools'])} schools for CRN {crn}")
    except Exception as e:
        print(f"[Auto-Import] Error importing schools for CRN {crn}: {e}")
        db.rollback()
    finally:
        db.close()


# ==================== ENDPOINTS ====================

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Register a new user account.
    Creates user and starts 14-day free trial.
    Requires CRN for consultants and SPIN for vendors.
    """
    # Validate required registration numbers
    if data.role == "consultant" and not data.crn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CRN (Consultant Registration Number) is required for consultant accounts"
        )
    
    if data.role == "vendor" and not data.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SPIN (Service Provider Identification Number) is required for vendor accounts"
        )
    
    # Check if email exists
    existing = db.query(User).filter(User.email == data.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if CRN already registered (for consultants)
    if data.role == "consultant" and data.crn:
        existing_crn = db.query(ConsultantProfile).filter(ConsultantProfile.crn == data.crn.upper().strip()).first()
        if existing_crn:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CRN is already registered to another account"
            )
    
    # Check if SPIN already registered (for vendors)
    if data.role == "vendor" and data.spin:
        existing_spin = db.query(VendorProfile).filter(VendorProfile.spin == data.spin.upper().strip()).first()
        if existing_spin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SPIN is already registered to another account"
            )
    
    # Create user
    user = User(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        role=data.role,
        first_name=data.first_name,
        last_name=data.last_name,
        company_name=data.company_name,
        is_active=True,
        is_verified=False,  # Email verification can be added later
    )
    db.add(user)
    db.flush()  # Get user.id
    
    # Create role-specific profile with registration number
    if data.role == "consultant":
        consultant_profile = ConsultantProfile(
            user_id=user.id,
            crn=data.crn.upper().strip() if data.crn else None,
            company_name=data.company_name,
            contact_name=f"{data.first_name or ''} {data.last_name or ''}".strip() or None,
        )
        db.add(consultant_profile)
    elif data.role == "vendor":
        vendor_profile = VendorProfile(
            user_id=user.id,
            spin=data.spin.upper().strip() if data.spin else None,
            company_name=data.company_name,
            contact_name=f"{data.first_name or ''} {data.last_name or ''}".strip() or None,
        )
        db.add(vendor_profile)
    
    # Create trial subscription
    trial_end = datetime.utcnow() + timedelta(days=14)
    price = (
        settings.CONSULTANT_MONTHLY_PRICE 
        if data.role == "consultant" 
        else settings.VENDOR_MONTHLY_PRICE
    )
    
    subscription = Subscription(
        user_id=user.id,
        plan="monthly",
        status=SubscriptionStatus.TRIALING.value,
        price_cents=price,
        start_date=datetime.utcnow(),
        trial_end=trial_end,
        current_period_start=datetime.utcnow(),
        current_period_end=trial_end,
    )
    db.add(subscription)
    
    db.commit()
    db.refresh(user)
    
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    # Auto-import schools in background for consultants
    if data.role == "consultant" and data.crn:
        background_tasks.add_task(auto_import_schools_from_crn, user.id, data.crn.upper().strip())
    
    # TODO: Send welcome email in background
    # background_tasks.add_task(send_welcome_email, user.email, user.first_name)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user.to_dict()
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    db: Session = Depends(get_db)
):
    """
    Login with email and password.
    Returns access and refresh tokens.
    """
    user = db.query(User).filter(User.email == data.email.lower()).first()
    
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user.to_dict()
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: TokenRefresh,
    db: Session = Depends(get_db)
):
    """
    Refresh access token using refresh token.
    """
    payload = decode_token(data.refresh_token)
    
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )
    
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == int(user_id)).first()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    
    # Generate new tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user.to_dict()
    )


@router.get("/me")
async def get_profile(current_user: User = Depends(get_current_user)):
    """
    Get current user profile and subscription status.
    """
    user_data = current_user.to_dict()
    
    # Add subscription info
    if current_user.subscription:
        user_data["subscription"] = current_user.subscription.to_dict()
    else:
        user_data["subscription"] = None
    
    return {"success": True, "user": user_data}


@router.put("/me")
async def update_profile(
    data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user profile.
    """
    if data.first_name is not None:
        current_user.first_name = data.first_name
    if data.last_name is not None:
        current_user.last_name = data.last_name
    if data.company_name is not None:
        current_user.company_name = data.company_name
    if data.phone is not None:
        current_user.phone = data.phone
    
    db.commit()
    db.refresh(current_user)
    
    return {"success": True, "user": current_user.to_dict()}


@router.post("/change-password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change user password.
    """
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.password_hash = hash_password(data.new_password)
    db.commit()
    
    return {"success": True, "message": "Password changed successfully"}


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """
    Logout user (client should discard tokens).
    In production, you might want to blacklist the token.
    """
    return {"success": True, "message": "Logged out successfully"}


# ==================== GOOGLE OAUTH ====================

class GoogleAuthRequest(BaseModel):
    """Google OAuth token from frontend"""
    id_token: str
    role: str = Field(default="consultant", pattern="^(consultant|vendor)$")


@router.post("/google", response_model=TokenResponse)
async def google_auth(
    data: GoogleAuthRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate or register user via Google OAuth.
    If user exists, logs them in. If not, creates a new account.
    Uses the official google-auth library for production token verification.
    """
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    
    # Verify the Google ID token using the official library
    try:
        # Specify the CLIENT_ID of the app that accesses the backend
        client_id = settings.GOOGLE_CLIENT_ID
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google authentication is not configured"
            )
        
        # Verify the token (this validates signature, aud, iss, and exp)
        idinfo = id_token.verify_oauth2_token(
            data.id_token, 
            google_requests.Request(), 
            client_id
        )
        
        # Verify the issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer"
            )
        
        # Get user info from the verified token
        # Use 'sub' as the unique identifier (never reused, unlike email)
        google_user_id = idinfo.get('sub')
        email = idinfo.get('email')
        email_verified = idinfo.get('email_verified', False)
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not provided by Google"
            )
        
        if not email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google email is not verified"
            )
        
        email = email.lower()
        first_name = idinfo.get('given_name')
        last_name = idinfo.get('family_name')
        picture = idinfo.get('picture')  # Profile picture URL
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )
    
    # Check if user exists
    user = db.query(User).filter(User.email == email).first()
    
    if user:
        # Existing user - log them in
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled"
            )
        
        # Update last login and names if missing
        user.last_login = datetime.utcnow()
        if not user.first_name and first_name:
            user.first_name = first_name
        if not user.last_name and last_name:
            user.last_name = last_name
        db.commit()
    else:
        # New user - register them
        user = User(
            email=email,
            password_hash="",  # No password for OAuth users
            role=data.role,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
            is_verified=True,  # Google already verified email
            auth_provider="google",
        )
        db.add(user)
        db.flush()
        
        # Create trial subscription
        trial_end = datetime.utcnow() + timedelta(days=14)
        price = (
            settings.CONSULTANT_MONTHLY_PRICE 
            if data.role == "consultant" 
            else settings.VENDOR_MONTHLY_PRICE
        )
        
        subscription = Subscription(
            user_id=user.id,
            plan="monthly",
            status=SubscriptionStatus.TRIALING.value,
            price_cents=price,
            start_date=datetime.utcnow(),
            trial_end=trial_end,
            current_period_start=datetime.utcnow(),
            current_period_end=trial_end,
        )
        db.add(subscription)
        db.commit()
        db.refresh(user)
    
    # Generate tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user.to_dict()
    )
