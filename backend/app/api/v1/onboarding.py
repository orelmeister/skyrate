"""
Onboarding API
Handles post-registration onboarding: FRN discovery, alert preferences, phone verification
"""

import logging
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.alert import AlertConfig
from ...models.applicant import ApplicantProfile, ApplicantFRN, FRNStatusType
from ...models.consultant import ConsultantProfile, ConsultantSchool
from ...models.vendor import VendorProfile
from ...services.usac_service import get_usac_service
from ...services.sms_service import get_sms_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ==================== Schemas ====================

class FRNDiscoveryResponse(BaseModel):
    frns: list
    total: int
    source_id: Optional[str] = None  # BEN, CRN, or SPIN used
    source_type: Optional[str] = None

class AlertPreferencesUpdate(BaseModel):
    # Alert type toggles
    alert_on_denial: bool = True
    alert_on_status_change: bool = True
    alert_on_deadline: bool = True
    alert_on_disbursement: bool = True
    alert_on_funding_approved: bool = True
    alert_on_form_470: bool = True
    alert_on_competitor: bool = False
    
    # Notification channels
    email_notifications: bool = True
    push_notifications: bool = True
    sms_notifications: bool = False
    in_app_notifications: bool = True
    
    # Frequency
    notification_frequency: str = "realtime"  # realtime, every_6_hours, daily, weekly
    
    # Optional overrides
    notification_email: Optional[str] = None
    notification_phone: Optional[str] = None
    deadline_warning_days: int = 14

class SelectedFRNs(BaseModel):
    frn_numbers: List[str]

class PhoneVerifyRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number in E.164 format (+1XXXXXXXXXX)")

class PhoneVerifyCheckRequest(BaseModel):
    phone_number: str
    code: str = Field(..., min_length=4, max_length=8)

class OnboardingCompleteRequest(BaseModel):
    pass  # Just marks onboarding as done


# ==================== Step 1: FRN Discovery ====================

@router.get("/discover-frns")
async def discover_frns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Discover all FRNs from USAC based on user's BEN/CRN/SPIN.
    Returns FRN data for the user to review and select which to monitor.
    """
    usac = get_usac_service()
    frns = []
    source_id = None
    source_type = None
    
    try:
        if current_user.role == "applicant":
            # Get BEN from applicant profile
            profile = db.query(ApplicantProfile).filter(
                ApplicantProfile.user_id == current_user.id
            ).first()
            if profile and profile.ben:
                source_id = profile.ben
                source_type = "BEN"
                
                # Fetch FRNs from USAC by BEN
                result = usac.fetch_form_471(
                    year=None,
                    filters={"ben": profile.ben},
                    limit=500
                )
                if result:
                    for item in result:
                        frns.append({
                            "frn": item.get("frn", ""),
                            "applicant_name": item.get("applicant_name", item.get("organization_name", "")),
                            "funding_year": item.get("funding_year", ""),
                            "category_of_service": item.get("category_of_service", ""),
                            "status": item.get("frn_status", item.get("status", "")),
                            "total_funding": item.get("total_authorized_disbursement", 
                                            item.get("original_request", 0)),
                            "service_type": item.get("service_type", ""),
                            "ben": profile.ben,
                        })
        
        elif current_user.role == "consultant":
            # Get CRN from consultant profile
            profile = db.query(ConsultantProfile).filter(
                ConsultantProfile.user_id == current_user.id
            ).first()
            if profile and profile.crn:
                source_id = profile.crn
                source_type = "CRN"
                
                # Get schools first, then FRNs for each school
                schools = db.query(ConsultantSchool).filter(
                    ConsultantSchool.consultant_profile_id == profile.id
                ).all()
                
                if schools:
                    for school in schools[:50]:  # Limit to prevent timeout
                        try:
                            result = usac.fetch_form_471(
                                year=None,
                                filters={"ben": school.ben},
                                limit=100
                            )
                            if result:
                                for item in result:
                                    frns.append({
                                        "frn": item.get("frn", ""),
                                        "applicant_name": school.school_name or item.get("applicant_name", ""),
                                        "funding_year": item.get("funding_year", ""),
                                        "category_of_service": item.get("category_of_service", ""),
                                        "status": item.get("frn_status", item.get("status", "")),
                                        "total_funding": item.get("total_authorized_disbursement",
                                                        item.get("original_request", 0)),
                                        "service_type": item.get("service_type", ""),
                                        "ben": school.ben,
                                        "school_name": school.school_name,
                                    })
                        except Exception as e:
                            logger.warning(f"Error fetching FRNs for school {school.ben}: {e}")
                            continue
                else:
                    # No schools imported yet — try USAC directly
                    result = usac.fetch_form_471(
                        year=None,
                        filters={"consultant_registration_number": profile.crn},
                        limit=500
                    )
                    if result:
                        for item in result:
                            frns.append({
                                "frn": item.get("frn", ""),
                                "applicant_name": item.get("applicant_name", ""),
                                "funding_year": item.get("funding_year", ""),
                                "category_of_service": item.get("category_of_service", ""),
                                "status": item.get("frn_status", item.get("status", "")),
                                "total_funding": item.get("total_authorized_disbursement",
                                                item.get("original_request", 0)),
                                "service_type": item.get("service_type", ""),
                                "ben": item.get("ben", ""),
                            })
        
        elif current_user.role == "vendor":
            # Get SPIN from vendor profile
            profile = db.query(VendorProfile).filter(
                VendorProfile.user_id == current_user.id
            ).first()
            if profile and profile.spin:
                source_id = profile.spin
                source_type = "SPIN"
                
                # Fetch FRNs where this vendor is the service provider
                result = usac.fetch_form_471(
                    year=None,
                    filters={"spin": profile.spin},
                    limit=500
                )
                if result:
                    for item in result:
                        frns.append({
                            "frn": item.get("frn", ""),
                            "applicant_name": item.get("applicant_name", item.get("organization_name", "")),
                            "funding_year": item.get("funding_year", ""),
                            "category_of_service": item.get("category_of_service", ""),
                            "status": item.get("frn_status", item.get("status", "")),
                            "total_funding": item.get("total_authorized_disbursement",
                                            item.get("original_request", 0)),
                            "service_type": item.get("service_type", ""),
                            "spin": profile.spin,
                        })
        
        # Deduplicate by FRN number
        seen = set()
        unique_frns = []
        for frn in frns:
            frn_num = frn.get("frn", "")
            if frn_num and frn_num not in seen:
                seen.add(frn_num)
                unique_frns.append(frn)
        
        return {
            "frns": unique_frns,
            "total": len(unique_frns),
            "source_id": source_id,
            "source_type": source_type,
        }
    
    except Exception as e:
        logger.error(f"Error discovering FRNs for user {current_user.id}: {e}")
        return {
            "frns": [],
            "total": 0,
            "source_id": source_id,
            "source_type": source_type,
            "error": f"Could not fetch FRN data: {str(e)}"
        }


@router.post("/select-frns")
async def select_frns_to_monitor(
    data: SelectedFRNs,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Save the user's selected FRNs for monitoring.
    Creates ApplicantFRN records for each selected FRN.
    """
    usac = get_usac_service()
    
    # Get or create applicant profile (all user types can monitor FRNs)
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        # Create minimal applicant profile for FRN tracking
        profile = ApplicantProfile(
            user_id=current_user.id,
            organization_name=current_user.company_name or "",
        )
        db.add(profile)
        db.flush()
    
    saved_count = 0
    skipped_count = 0
    
    for frn_number in data.frn_numbers:
        # Check if already tracking this FRN
        existing = db.query(ApplicantFRN).filter(
            ApplicantFRN.applicant_profile_id == profile.id,
            ApplicantFRN.frn == frn_number
        ).first()
        
        if existing:
            skipped_count += 1
            continue
        
        # Fetch current status from USAC
        try:
            details = usac.get_application_details(frn=frn_number)
            status = "Unknown"
            status_type = FRNStatusType.UNKNOWN.value
            applicant_name = ""
            funding_year = ""
            
            if details:
                status = details.get("frn_status", details.get("status", "Unknown"))
                applicant_name = details.get("applicant_name", "")
                funding_year = details.get("funding_year", "")
                
                # Map status to type
                status_lower = status.lower()
                if "funded" in status_lower or "committed" in status_lower:
                    status_type = FRNStatusType.FUNDED.value
                elif "denied" in status_lower:
                    status_type = FRNStatusType.DENIED.value
                elif "pending" in status_lower:
                    status_type = FRNStatusType.PENDING_REVIEW.value
                elif "review" in status_lower:
                    status_type = FRNStatusType.IN_REVIEW.value
                elif "cancel" in status_lower:
                    status_type = FRNStatusType.CANCELLED.value
            
            frn_record = ApplicantFRN(
                applicant_profile_id=profile.id,
                frn=frn_number,
                status=status,
                status_type=status_type,
                applicant_name=applicant_name,
                funding_year=funding_year,
                last_checked=datetime.utcnow(),
            )
            db.add(frn_record)
            saved_count += 1
            
        except Exception as e:
            logger.warning(f"Error fetching FRN {frn_number} details: {e}")
            # Still save with unknown status
            frn_record = ApplicantFRN(
                applicant_profile_id=profile.id,
                frn=frn_number,
                status="Unknown",
                status_type=FRNStatusType.UNKNOWN.value,
                last_checked=datetime.utcnow(),
            )
            db.add(frn_record)
            saved_count += 1
    
    db.commit()
    
    return {
        "saved": saved_count,
        "skipped": skipped_count,
        "total_monitoring": saved_count + skipped_count,
        "message": f"Now monitoring {saved_count + skipped_count} FRNs"
    }


# ==================== Step 2: Alert Preferences ====================

@router.get("/alert-preferences")
async def get_alert_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current alert preferences or return defaults"""
    config = db.query(AlertConfig).filter(
        AlertConfig.user_id == current_user.id
    ).first()
    
    if config:
        return config.to_dict()
    
    # Return defaults (not yet saved)
    return {
        "alert_on_denial": True,
        "alert_on_status_change": True,
        "alert_on_deadline": True,
        "alert_on_disbursement": True,
        "alert_on_funding_approved": True,
        "alert_on_form_470": current_user.role == "vendor",
        "alert_on_competitor": False,
        "email_notifications": True,
        "push_notifications": True,
        "sms_notifications": False,
        "in_app_notifications": True,
        "notification_frequency": "realtime",
        "deadline_warning_days": 14,
        "notification_email": current_user.email,
        "notification_phone": current_user.phone,
    }


@router.put("/alert-preferences")
async def update_alert_preferences(
    data: AlertPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save alert preferences during onboarding"""
    config = db.query(AlertConfig).filter(
        AlertConfig.user_id == current_user.id
    ).first()
    
    if not config:
        config = AlertConfig(user_id=current_user.id)
        db.add(config)
    
    # Update all fields
    config.alert_on_denial = data.alert_on_denial
    config.alert_on_status_change = data.alert_on_status_change
    config.alert_on_deadline = data.alert_on_deadline
    config.alert_on_disbursement = data.alert_on_disbursement
    config.alert_on_funding_approved = data.alert_on_funding_approved
    config.alert_on_form_470 = data.alert_on_form_470
    config.alert_on_competitor = data.alert_on_competitor
    config.email_notifications = data.email_notifications
    config.push_notifications = data.push_notifications
    config.sms_notifications = data.sms_notifications
    config.in_app_notifications = data.in_app_notifications
    config.notification_frequency = data.notification_frequency
    config.deadline_warning_days = data.deadline_warning_days
    
    if data.notification_email:
        config.notification_email = data.notification_email
    if data.notification_phone:
        config.notification_phone = data.notification_phone
    
    # If SMS enabled but phone not verified, warn
    if data.sms_notifications and not current_user.phone_verified:
        config.sms_notifications = False  # Can't enable SMS without verified phone
    
    db.commit()
    db.refresh(config)
    
    return {
        "success": True,
        "config": config.to_dict(),
        "sms_warning": data.sms_notifications and not current_user.phone_verified
    }


# ==================== Step 3: Phone Verification ====================

@router.post("/phone/send-code")
async def send_phone_verification(
    data: PhoneVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a verification code to the user's phone via Twilio Verify"""
    sms_service = get_sms_service()
    
    if not sms_service.is_configured:
        raise HTTPException(
            status_code=503,
            detail="SMS verification is not yet available. We're setting this up — check back soon!"
        )
    
    # Save phone number on user (unverified)
    current_user.phone = data.phone_number
    current_user.phone_verified = False
    db.commit()
    
    result = sms_service.send_verification_code(data.phone_number)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    
    return {
        "success": True,
        "message": result["message"],
        "phone": data.phone_number
    }


@router.post("/phone/verify-code")
async def verify_phone_code(
    data: PhoneVerifyCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify the code the user entered"""
    sms_service = get_sms_service()
    
    if not sms_service.is_configured:
        raise HTTPException(status_code=503, detail="SMS verification not available")
    
    result = sms_service.check_verification_code(data.phone_number, data.code)
    
    if result["success"]:
        # Mark phone as verified
        current_user.phone = data.phone_number
        current_user.phone_verified = True
        db.commit()
        
        # Also enable SMS in alert config if they have one
        config = db.query(AlertConfig).filter(
            AlertConfig.user_id == current_user.id
        ).first()
        if config:
            config.sms_notifications = True
            config.notification_phone = data.phone_number
            db.commit()
    
    return {
        "success": result["success"],
        "verified": result["success"],
        "message": result["message"]
    }


# ==================== Complete Onboarding ====================

@router.post("/complete")
async def complete_onboarding(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark onboarding as completed for the user"""
    current_user.onboarding_completed = True
    db.commit()
    
    # Determine redirect URL based on role
    role_redirects = {
        "consultant": "/consultant",
        "vendor": "/vendor",
        "applicant": "/applicant",
        "admin": "/admin",
    }
    
    redirect_url = role_redirects.get(current_user.role, "/dashboard")
    
    return {
        "success": True,
        "message": "Onboarding completed! Your FRNs are now being monitored.",
        "redirect": redirect_url
    }


@router.get("/status")
async def get_onboarding_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has completed onboarding"""
    # Count monitored FRNs
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == current_user.id
    ).first()
    
    frn_count = 0
    if profile:
        frn_count = db.query(ApplicantFRN).filter(
            ApplicantFRN.applicant_profile_id == profile.id
        ).count()
    
    # Check alert config
    has_alert_config = db.query(AlertConfig).filter(
        AlertConfig.user_id == current_user.id
    ).first() is not None
    
    return {
        "onboarding_completed": current_user.onboarding_completed,
        "frns_selected": frn_count > 0,
        "frn_count": frn_count,
        "alert_config_set": has_alert_config,
        "phone_verified": current_user.phone_verified,
        "phone": current_user.phone,
    }
