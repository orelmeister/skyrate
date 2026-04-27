"""
Consultant Portal API Endpoints
Handles school portfolios, funding data, and appeal generation
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import csv
import io
import sys
import os
import json
import logging
import requests

logger = logging.getLogger(__name__)

# Add skyrate-ai to path for importing existing utilities
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'skyrate-ai'))
# Add root opendata folder for accessing shared utilities
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))

from ...core.database import get_db
from ...core.security import get_current_user, require_role
from ...models.user import User
from ...models.consultant import ConsultantProfile, ConsultantSchool, ConsultantCRN
from ...models.application import SchoolSnapshot, Application, AppealRecord
from ...core.config import get_settings

# Import USAC service for validation
from ...services.usac_service import get_usac_service

# Stripe for additional CRN subscriptions
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False

router = APIRouter(prefix="/consultant", tags=["Consultant Portal"])

# USAC Open Data Dataset IDs
USAC_DATASETS = {
    'form_471': 'srbr-2d59',      # Form 471 Applications
    'c2_budget': '6brt-5pbv',     # C2 Budget Tool (5-year Category 2 budget)
}

def fetch_usac_data(dataset: str, where_clause: str, limit: int = 5000) -> List[Dict]:
    """
    Direct USAC Open Data API query with proper formatting.
    Uses the correct dataset IDs and field quoting.
    """
    dataset_id = USAC_DATASETS.get(dataset, dataset)
    url = f"https://opendata.usac.org/resource/{dataset_id}.json"
    
    params = {
        "$limit": limit,
        "$where": where_clause,
    }
    
    if dataset == 'form_471':
        params["$order"] = "funding_year DESC"
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"USAC API error for {dataset}: {e}")
        return []

# Constants for CSV template
CSV_TEMPLATE_COLUMNS = ["ben", "notes"]
CSV_TEMPLATE_EXAMPLE_ROWS = [
    {"ben": "143029", "notes": "Example: Wickenburg Public Library"},
    {"ben": "16069179", "notes": "Example: Battalion Christian Academy"},
]


# ==================== SCHEMAS ====================

class ProfileCreate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class SchoolAdd(BaseModel):
    ben: str
    frn: Optional[str] = None
    school_name: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = []


class SchoolUpdate(BaseModel):
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class AppealGenerateRequest(BaseModel):
    frn: str
    additional_context: Optional[str] = None
    appeal_type: Optional[str] = None  # "usac" | "fcc" | None (auto-detect)


# ==================== APPEAL TYPE DETECTION ====================

# FCC Secretary - NOTE: This changes over time, verify before FCC appeals
FCC_SECRETARY = {
    "name": "Marlene H. Dortch",
    "title": "Secretary",
    "organization": "Federal Communications Commission",
    "office": "Office of the Secretary",
    "address": "445 12th Street, SW",
    "city_state_zip": "Washington, DC 20554",
    "last_verified": "2026-03-12"
}

def determine_appeal_type(
    days_remaining: Optional[int],
    denial_reasons: List[Dict],
    user_context: Optional[str] = None,
    user_override: Optional[str] = None
) -> tuple:
    """
    Determine whether this should be a USAC or FCC appeal.
    
    USAC Appeals (within 60 days):
    - Contest factual determinations with evidence
    - "USAC got the facts wrong, here's proof"
    
    FCC Appeals (after 60 days OR waiver needed):
    - Request waiver of a rule
    - Claim USAC violated FCC order/procedure
    
    Returns: (appeal_type, reason, can_override)
    """
    # If user explicitly chose, respect it (with warning if inappropriate)
    if user_override:
        if user_override.lower() == "fcc":
            return ("fcc", "User selected FCC appeal", False)
        elif user_override.lower() == "usac":
            if days_remaining is not None and days_remaining < 0:
                return ("fcc", "USAC deadline expired - must use FCC appeal", False)
            return ("usac", "User selected USAC appeal", False)
    
    # Hard rule: past 60 days = FCC only
    if days_remaining is not None and days_remaining < 0:
        return ("fcc", f"USAC appeal window expired ({abs(days_remaining)} days ago). FCC appeal required.", False)
    
    # Check for waiver keywords in user context
    waiver_keywords = ["waiver", "late filing", "missed deadline", "extension", "procedural"]
    if user_context:
        context_lower = user_context.lower()
        for keyword in waiver_keywords:
            if keyword in context_lower:
                return ("fcc", f"Waiver request detected ('{keyword}'). FCC appeal recommended.", True)
    
    # Check denial reasons for timing/procedural issues that need waiver
    for reason in denial_reasons:
        violation_type = reason.get("violation_type", "").lower()
        if violation_type in ["timing", "deadline", "late_filing"]:
            return ("fcc", "Timing violation may require FCC waiver rather than USAC appeal.", True)
    
    # Default: USAC appeal for factual disputes within window
    if days_remaining is not None and days_remaining > 0:
        return ("usac", f"Within 60-day USAC appeal window ({days_remaining} days remaining). Factual dispute.", True)
    
    return ("usac", "Default to USAC appeal for factual correction.", True)


class BENValidationRequest(BaseModel):
    """Request to validate multiple BENs against USAC"""
    bens: List[str]


class BENValidationResult(BaseModel):
    """Result of validating a single BEN"""
    ben: str
    valid: bool
    school_name: Optional[str] = None
    state: Optional[str] = None
    entity_type: Optional[str] = None
    error: Optional[str] = None


# ==================== DEPENDENCIES ====================

async def get_consultant_profile(
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
) -> ConsultantProfile:
    """Get or create consultant profile for current user"""
    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        # Auto-create profile
        profile = ConsultantProfile(
            user_id=current_user.id,
            company_name=current_user.company_name,
            contact_name=current_user.full_name,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    
    return profile


# ==================== PROFILE ENDPOINTS ====================

@router.get("/profile")
async def get_profile(profile: ConsultantProfile = Depends(get_consultant_profile)):
    """Get consultant profile"""
    return {"success": True, "profile": profile.to_dict()}


@router.put("/profile")
async def update_profile(
    data: ProfileCreate,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """Update consultant profile"""
    if data.company_name is not None:
        profile.company_name = data.company_name
    if data.contact_name is not None:
        profile.contact_name = data.contact_name
    if data.phone is not None:
        profile.phone = data.phone
    if data.address is not None:
        profile.address = data.address
    if data.website is not None:
        profile.website = data.website
    
    db.commit()
    db.refresh(profile)
    
    return {"success": True, "profile": profile.to_dict()}


# ==================== CRN AUTO-IMPORT ENDPOINTS ====================

@router.get("/crn/schools")
async def get_schools_by_crn(
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get all schools associated with the consultant's CRN from USAC.
    This queries Form 471 data to find schools the consultant represents.
    """
    if not profile.crn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No CRN found on profile. Please update your profile with your Consultant Registration Number."
        )
    
    usac_service = get_usac_service()
    result = usac_service.get_schools_by_crn(profile.crn)
    
    # Check which schools are already in portfolio
    existing_bens = set(
        s.ben for s in db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
    )
    
    for school in result['schools']:
        school['already_added'] = school['ben'] in existing_bens
    
    return {
        "success": True,
        "crn": result['crn'],
        "total_found": result['school_count'],
        "already_added": len([s for s in result['schools'] if s.get('already_added')]),
        "new_schools": len([s for s in result['schools'] if not s.get('already_added')]),
        "schools": result['schools'],
        "years_queried": result['years_queried']
    }


@router.post("/crn/import")
async def import_schools_from_crn(
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Auto-import all schools from the consultant's CRN into their portfolio.
    Skips schools that are already added.
    Automatically syncs status data from USAC after import.
    """
    if not profile.crn:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No CRN found on profile. Please update your profile with your Consultant Registration Number."
        )
    
    usac_service = get_usac_service()
    result = usac_service.get_schools_by_crn(profile.crn)
    
    # Get existing BENs
    existing_bens = set(
        s.ben for s in db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
    )
    
    imported = []
    skipped = []
    new_schools = []
    
    for school in result['schools']:
        ben = school['ben']
        
        if ben in existing_bens:
            skipped.append(ben)
            continue
        
        # Add new school
        new_school = ConsultantSchool(
            consultant_profile_id=profile.id,
            ben=ben,
            school_name=school.get('organization_name'),
            state=school.get('state'),
            city=school.get('city'),
            entity_type=school.get('entity_type'),
            notes=f"Auto-imported from CRN {profile.crn}",
        )
        db.add(new_school)
        new_schools.append(new_school)
        imported.append({
            'ben': ben,
            'school_name': school.get('organization_name'),
            'state': school.get('state')
        })
    
    db.commit()
    
    # IMPORTANT: Sync all schools with USAC data (status, funding, etc.)
    # This ensures schools have proper status/color/count info in the database
    if new_schools:
        all_schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
        sync_result = sync_schools_with_usac(all_schools, db)
    else:
        sync_result = {"synced": 0, "errors": 0}
    
    return {
        "success": True,
        "crn": profile.crn,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "imported": imported,
        "skipped": skipped,
        "sync_result": sync_result
    }


@router.get("/crn/preview")
async def preview_crn_import(
    crn: str = Query(..., description="CRN to preview import for"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Preview what schools would be imported for a given CRN.
    Does not require the CRN to be on the profile - useful for validation.
    """
    usac_service = get_usac_service()
    result = usac_service.get_schools_by_crn(crn)
    
    return {
        "success": True,
        "crn": result['crn'],
        "school_count": result['school_count'],
        "schools": result['schools'][:50],  # Limit preview to 50 schools
        "years_queried": result['years_queried'],
        "has_more": result['school_count'] > 50
    }


def sync_schools_with_usac(
    schools: List[ConsultantSchool],
    db: Session
) -> Dict[str, Any]:
    """
    Helper function to sync school data from USAC API.
    Fetches Form 471 application data and updates school records with:
    - status, status_color, latest_year, applications_count, last_synced
    
    Returns summary of synced schools.
    """
    if not schools:
        return {"synced": 0, "errors": 0}
    
    usac_service = get_usac_service()
    all_bens = [school.ben for school in schools]
    
    # Build a map of BEN -> applications
    ben_applications: Dict[str, List[Dict]] = {ben: [] for ben in all_bens}
    
    try:
        # Single batch query with all BENs (uses OR conditions)
        all_applications = usac_service.fetch_form_471(
            filters={"ben": all_bens},
            limit=len(all_bens) * 20  # ~20 apps per school
        )
        
        # Group applications by BEN
        for app in all_applications:
            app_ben = str(app.get("ben", ""))
            if app_ben in ben_applications:
                ben_applications[app_ben].append(app)
    except Exception as e:
        print(f"Batch USAC fetch failed: {e}")
        return {"synced": 0, "errors": len(schools), "error": str(e)}
    
    synced_count = 0
    for school in schools:
        applications = ben_applications.get(school.ben, [])
        
        if applications:
            # Sort by funding year desc
            sorted_apps = sorted(
                applications, 
                key=lambda x: int(x.get("funding_year", 0) or 0), 
                reverse=True
            )
            
            # Get school info from most recent app
            latest = sorted_apps[0]
            if not school.school_name or school.school_name == "Unknown":
                school.school_name = (
                    latest.get("applicant_name") or 
                    latest.get("organization_name") or 
                    latest.get("billed_entity_name")
                )
            if not school.state:
                school.state = latest.get("physical_state") or latest.get("state")
            
            # Determine status based on most recent year's applications
            latest_year = latest.get("funding_year")
            latest_year_apps = [a for a in sorted_apps if a.get("funding_year") == latest_year]
            
            # Check all possible status values from USAC
            statuses = [
                (a.get("form_471_frn_status_name") or a.get("application_status") or "").lower() 
                for a in latest_year_apps
            ]
            
            has_denied = any("denied" in s for s in statuses)
            has_funded = any(s in ["funded", "committed"] for s in statuses)
            has_pending = any(s in ["pending", "under review", "in review", "wave ready", "certified", "submitted"] for s in statuses)
            has_unfunded = any(s in ["unfunded", "cancelled", "not funded"] for s in statuses)
            
            if has_denied:
                school.status = "Has Denials"
                school.status_color = "red"
            elif has_unfunded:
                school.status = "Unfunded"
                school.status_color = "red"
            elif has_funded:
                school.status = "Funded"
                school.status_color = "green"
            elif has_pending:
                school.status = "Pending"
                school.status_color = "yellow"
            else:
                actual_status = latest.get("form_471_frn_status_name") or latest.get("application_status") or "Unknown"
                school.status = actual_status if actual_status else "Unknown"
                school.status_color = "gray"
            
            school.latest_year = int(latest_year) if latest_year else None
            school.applications_count = len(applications)
            school.last_synced = datetime.utcnow()
            synced_count += 1
        else:
            school.status = "No Applications"
            school.status_color = "gray"
            school.applications_count = 0
            school.last_synced = datetime.utcnow()
            synced_count += 1
    
    db.commit()
    return {"synced": synced_count, "errors": 0}


@router.post("/crn/verify")
async def verify_and_import_crn(
    crn: str = Query(..., description="CRN to verify and import"),
    auto_import: bool = Query(True, description="Auto-import schools after verification"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Verify a CRN with USAC and optionally import all schools.
    
    This endpoint:
    1. Validates the CRN against USAC Consultants dataset
    2. Returns consultant company info (name, phone, email, etc.)
    3. Returns list of schools the consultant represents
    4. Optionally auto-imports all schools into the portfolio
    5. Updates the profile with the verified CRN
    6. Syncs all school data from USAC (status, funding info, etc.)
    """
    usac_service = get_usac_service()
    result = usac_service.verify_crn(crn)
    
    if not result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Invalid CRN - not found in USAC database")
        )
    
    # Update profile with CRN and consultant info
    profile.crn = result["crn"]
    
    consultant_info = result["consultant"]
    if consultant_info.get("company_name"):
        profile.company_name = consultant_info["company_name"]
    if consultant_info.get("phone"):
        profile.phone = consultant_info["phone"]
    # Note: email is available in consultant_info but ConsultantProfile doesn't have an email field
    
    # Import schools if requested
    imported = []
    skipped = []
    new_schools = []
    
    if auto_import and result["schools"]:
        # Get existing BENs
        existing_bens = set(
            s.ben for s in db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id
            ).all()
        )
        
        for school in result["schools"]:
            ben = school["ben"]
            
            if ben in existing_bens:
                skipped.append(ben)
                continue
            
            # Add new school
            new_school = ConsultantSchool(
                consultant_profile_id=profile.id,
                ben=ben,
                school_name=school.get("organization_name"),
                state=school.get("state"),
                entity_type=school.get("applicant_type"),
                notes=f"Auto-imported from CRN {crn}",
            )
            db.add(new_school)
            new_schools.append(new_school)
            imported.append({
                "ben": ben,
                "school_name": school.get("organization_name"),
                "state": school.get("state")
            })
    
    db.commit()
    
    # IMPORTANT: Sync all schools with USAC data (status, funding, etc.)
    # This ensures schools have proper status/color/count info in the database
    all_schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id
    ).all()
    
    sync_result = sync_schools_with_usac(all_schools, db)
    
    return {
        "success": True,
        "valid": True,
        "crn": result["crn"],
        "consultant": result["consultant"],
        "school_count": result["school_count"],
        "schools": result["schools"],
        "years_found": result["years_found"],
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "imported": imported,
        "skipped": skipped,
        "sync_result": sync_result
    }


# ==================== MULTI-CRN MANAGEMENT ENDPOINTS ====================

class AddCRNRequest(BaseModel):
    crn: str
    plan: Optional[str] = None  # "monthly" or "yearly" — only needed for paid additional CRNs

class CRNCheckoutRequest(BaseModel):
    crn_id: int
    plan: str = "monthly"
    success_url: str = "https://skyrate.ai/consultant?tab=settings&crn_added=true"
    cancel_url: str = "https://skyrate.ai/consultant?tab=settings"


def _is_free_crn_user(user: User) -> bool:
    """Check if user gets unlimited free CRNs (super, admin, or test account)."""
    settings = get_settings()
    if user.role in ("super", "admin"):
        return True
    if user.email.lower() in [e.lower() for e in settings.TEST_ACCOUNT_EMAILS]:
        return True
    for pattern in settings.TEST_EMAIL_PATTERNS:
        if pattern.lower() in user.email.lower():
            return True
    return False


@router.get("/crns")
async def list_crns(
    profile: ConsultantProfile = Depends(get_consultant_profile),
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
):
    """List CRNs.

    - Regular consultant: only their own CRNs (filtered by profile.id).
    - Admin / super: ALL CRNs across every consultant profile, with owner
      info attached (regression fix April 26, 2026: super accounts were
      seeing an empty CRN list because the dependency scoped the query to
      super's own freshly-seeded profile, hiding pre-existing CRN data
      that admin can still see via the admin panel).
    """
    from sqlalchemy import or_
    from ...models.user import User as UserModel

    is_privileged = current_user.role in ("admin", "super")

    if is_privileged:
        crns = db.query(ConsultantCRN).order_by(
            ConsultantCRN.is_primary.desc(), ConsultantCRN.created_at
        ).all()
    else:
        crns = db.query(ConsultantCRN).filter(
            ConsultantCRN.consultant_profile_id == profile.id
        ).order_by(ConsultantCRN.is_primary.desc(), ConsultantCRN.created_at).all()

    # Count schools per CRN
    for crn_record in crns:
        scope_profile_id = crn_record.consultant_profile_id
        if crn_record.is_primary:
            count = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == scope_profile_id,
                or_(
                    ConsultantSchool.source_crn == crn_record.crn,
                    ConsultantSchool.source_crn.is_(None)
                )
            ).count()
        else:
            count = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == scope_profile_id,
                ConsultantSchool.source_crn == crn_record.crn
            ).count()
        crn_record.schools_count = count
    db.commit()

    # Build response, attaching owner info when privileged so super/admin
    # can tell which consultant each CRN belongs to.
    owner_cache: dict = {}
    def _enrich(c: ConsultantCRN) -> dict:
        d = c.to_dict()
        if is_privileged:
            cp_id = c.consultant_profile_id
            if cp_id not in owner_cache:
                cp = db.query(ConsultantProfile).filter(
                    ConsultantProfile.id == cp_id
                ).first()
                if cp:
                    u = db.query(UserModel).filter(UserModel.id == cp.user_id).first()
                    owner_cache[cp_id] = {
                        "owner_user_id": cp.user_id,
                        "owner_email": u.email if u else None,
                        "owner_name": (u.full_name if u else None) or cp.contact_name,
                        "owner_company": cp.company_name,
                    }
                else:
                    owner_cache[cp_id] = {"owner_user_id": None, "owner_email": None, "owner_name": None, "owner_company": None}
            d.update(owner_cache[cp_id])
        return d

    is_free_user = _is_free_crn_user(current_user)

    return {
        "success": True,
        "crns": [_enrich(c) for c in crns],
        "count": len(crns),
        "is_free_user": is_free_user,
        "can_add_free": is_free_user or len(crns) == 0,  # First CRN is always free
        "scope": "all" if is_privileged else "self",
    }


@router.post("/crns/add")
async def add_crn(
    data: AddCRNRequest,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
):
    """
    Add a new CRN. Verifies with USAC, imports schools.
    - Super/admin/test accounts: unlimited free CRNs
    - Regular consultants: first CRN free, additional CRNs require payment ($499/mo or $4,999/yr)
    """
    crn_value = data.crn.upper().strip()
    
    # Check if CRN already exists for this consultant
    existing = db.query(ConsultantCRN).filter(
        ConsultantCRN.consultant_profile_id == profile.id,
        ConsultantCRN.crn == crn_value
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CRN {crn_value} is already added to your account"
        )
    
    # Verify CRN with USAC
    usac_service = get_usac_service()
    result = usac_service.verify_crn(crn_value)
    
    if not result["valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Invalid CRN — not found in USAC database")
        )
    
    # How many CRNs does this consultant already have?
    current_crn_count = db.query(ConsultantCRN).filter(
        ConsultantCRN.consultant_profile_id == profile.id
    ).count()
    
    is_free_user = _is_free_crn_user(current_user)
    is_first_crn = current_crn_count == 0
    needs_payment = not is_free_user and not is_first_crn
    
    if needs_payment:
        # Don't add CRN yet — return that payment is required
        # Frontend will redirect to checkout
        return {
            "success": True,
            "requires_payment": True,
            "crn": crn_value,
            "consultant": result["consultant"],
            "school_count": result["school_count"],
            "message": f"Additional CRN requires a subscription ($499/mo or $4,999/yr). Please complete payment to activate CRN {crn_value}."
        }
    
    # Free CRN — add directly
    consultant_info = result["consultant"]
    crn_record = ConsultantCRN(
        consultant_profile_id=profile.id,
        crn=crn_value,
        company_name=consultant_info.get("company_name"),
        phone=consultant_info.get("phone"),
        is_primary=is_first_crn,
        is_verified=True,
        verified_at=datetime.utcnow(),
        is_free=True,
        payment_status="active",
    )
    db.add(crn_record)
    db.flush()
    
    # Also update profile's primary CRN if this is the first
    if is_first_crn:
        profile.crn = crn_value
        if consultant_info.get("company_name"):
            profile.company_name = consultant_info["company_name"]
        if consultant_info.get("phone"):
            profile.phone = consultant_info["phone"]
    
    # Import schools from this CRN
    imported = _import_schools_for_crn(profile, crn_value, result["schools"], db)
    
    db.commit()
    
    return {
        "success": True,
        "requires_payment": False,
        "crn_record": crn_record.to_dict(),
        "consultant": consultant_info,
        "school_count": result["school_count"],
        "imported_count": imported["imported_count"],
        "skipped_count": imported["skipped_count"],
    }


@router.post("/crns/checkout")
async def create_crn_checkout(
    data: CRNCheckoutRequest,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
):
    """
    Create a Stripe Checkout session for an additional CRN subscription.
    Called after /crns/add returns requires_payment=true.
    """
    settings = get_settings()
    
    if not STRIPE_AVAILABLE or not settings.STRIPE_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment processing is not configured"
        )
    
    stripe.api_key = settings.STRIPE_SECRET_KEY
    
    # Pricing for additional CRN (same as consultant base subscription)
    if data.plan == "yearly":
        price_cents = settings.CONSULTANT_YEARLY_PRICE  # $4,999
        interval = "year"
        plan_name = "Annual"
    else:
        price_cents = settings.CONSULTANT_MONTHLY_PRICE  # $499
        interval = "month"
        plan_name = "Monthly"
    
    try:
        # Get or create Stripe customer
        from ...models.subscription import Subscription
        sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
        if sub and sub.stripe_customer_id:
            customer_id = sub.stripe_customer_id
        else:
            customer = stripe.Customer.create(
                email=current_user.email,
                name=current_user.full_name,
                metadata={"user_id": str(current_user.id), "role": current_user.role}
            )
            customer_id = customer.id
        
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card", "us_bank_account"],
            payment_method_options={
                "us_bank_account": {
                    "verification_method": "instant",
                    "financial_connections": {"permissions": ["payment_method"]}
                }
            },
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"SkyRate AI — Additional CRN ({plan_name})",
                        "description": f"Track an additional Consultant Registration Number. ${price_cents/100:.0f}/{interval}.",
                    },
                    "unit_amount": price_cents,
                    "recurring": {"interval": interval}
                },
                "quantity": 1
            }],
            mode="subscription",
            success_url=data.success_url + ("&" if "?" in data.success_url else "?") + "crn_checkout=success&session_id={CHECKOUT_SESSION_ID}",
            cancel_url=data.cancel_url,
            metadata={
                "user_id": str(current_user.id),
                "crn_id": str(data.crn_id),
                "type": "additional_crn",
                "plan": data.plan,
            },
            allow_promotion_codes=True,
        )
        
        return {
            "success": True,
            "checkout_url": session.url,
            "session_id": session.id,
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}"
        )


@router.post("/crns/activate")
async def activate_crn_after_payment(
    crn: str = Query(..., description="CRN to activate after payment"),
    session_id: str = Query(..., description="Stripe checkout session ID"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
):
    """
    Activate a CRN after successful Stripe payment.
    Called by frontend after Stripe checkout redirect.
    """
    settings = get_settings()
    crn_value = crn.upper().strip()
    
    # Verify the Stripe session was paid
    stripe_sub_id = None
    if STRIPE_AVAILABLE and settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            session = stripe.checkout.Session.retrieve(session_id)
            if session.payment_status != "paid" and session.status != "complete":
                raise HTTPException(status_code=400, detail="Payment not completed")
            stripe_sub_id = session.subscription
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not verify payment: {str(e)}")
    
    # Verify CRN with USAC
    usac_service = get_usac_service()
    result = usac_service.verify_crn(crn_value)
    
    if not result["valid"]:
        raise HTTPException(status_code=400, detail="Invalid CRN")
    
    # Check if already exists
    existing = db.query(ConsultantCRN).filter(
        ConsultantCRN.consultant_profile_id == profile.id,
        ConsultantCRN.crn == crn_value
    ).first()
    
    if existing:
        # Update with payment info
        existing.stripe_subscription_id = stripe_sub_id
        existing.payment_status = "active"
        existing.is_verified = True
        existing.verified_at = datetime.utcnow()
    else:
        consultant_info = result["consultant"]
        crn_record = ConsultantCRN(
            consultant_profile_id=profile.id,
            crn=crn_value,
            company_name=consultant_info.get("company_name"),
            phone=consultant_info.get("phone"),
            is_primary=False,
            is_verified=True,
            verified_at=datetime.utcnow(),
            is_free=False,
            stripe_subscription_id=stripe_sub_id,
            payment_status="active",
        )
        db.add(crn_record)
    
    # Import schools
    imported = _import_schools_for_crn(profile, crn_value, result["schools"], db)
    
    db.commit()
    
    return {
        "success": True,
        "crn": crn_value,
        "imported_count": imported["imported_count"],
        "skipped_count": imported["skipped_count"],
    }


@router.delete("/crns/{crn_id}")
async def remove_crn(
    crn_id: int,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    current_user: User = Depends(require_role("admin", "consultant", "super")),
    db: Session = Depends(get_db)
):
    """Remove a CRN from the consultant's account and delete all schools imported from that CRN."""
    crn_record = db.query(ConsultantCRN).filter(
        ConsultantCRN.id == crn_id,
        ConsultantCRN.consultant_profile_id == profile.id
    ).first()
    
    if not crn_record:
        raise HTTPException(status_code=404, detail="CRN not found")
    
    if crn_record.is_primary:
        raise HTTPException(status_code=400, detail="Cannot remove primary CRN. Change your primary CRN first.")
    
    # Cancel Stripe subscription if exists
    if crn_record.stripe_subscription_id and STRIPE_AVAILABLE:
        settings = get_settings()
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            stripe.Subscription.modify(
                crn_record.stripe_subscription_id,
                cancel_at_period_end=True
            )
        except Exception:
            pass  # Best effort
    
    # Delete schools that were imported from this CRN
    crn_value = crn_record.crn
    deleted_schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.source_crn == crn_value
    ).delete(synchronize_session="fetch")
    logger.info(f"Removed {deleted_schools} schools imported from CRN {crn_value}")
    
    db.delete(crn_record)
    db.commit()
    
    return {"success": True, "message": f"CRN {crn_value} removed along with {deleted_schools} imported schools"}


def _import_schools_for_crn(
    profile: ConsultantProfile,
    crn_value: str,
    schools: List[Dict],
    db: Session
) -> Dict[str, int]:
    """Helper: Import schools from a CRN into the consultant's portfolio."""
    existing_bens = set(
        s.ben for s in db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
    )
    
    imported_count = 0
    skipped_count = 0
    new_schools = []
    
    for school in schools:
        ben = school.get("ben", "")
        if ben in existing_bens:
            skipped_count += 1
            continue
        
        new_school = ConsultantSchool(
            consultant_profile_id=profile.id,
            ben=ben,
            school_name=school.get("organization_name"),
            state=school.get("state"),
            entity_type=school.get("applicant_type"),
            source_crn=crn_value,
            notes=f"Auto-imported from CRN {crn_value}",
        )
        db.add(new_school)
        new_schools.append(new_school)
        existing_bens.add(ben)
        imported_count += 1
    
    db.flush()
    
    # Sync new schools with USAC status data
    if new_schools:
        all_schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
        sync_schools_with_usac(all_schools, db)
    
    return {"imported_count": imported_count, "skipped_count": skipped_count}


# ==================== SCHOOL PORTFOLIO ENDPOINTS ====================

@router.get("/schools/csv-template")
async def download_csv_template():
    """
    Download a CSV template file for bulk school import.
    Template includes: ben, notes columns with example rows.
    """
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_TEMPLATE_COLUMNS)
    writer.writeheader()
    for row in CSV_TEMPLATE_EXAMPLE_ROWS:
        writer.writerow(row)
    
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8')),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=skyrate_school_import_template.csv"
        }
    )


@router.post("/schools/validate-bens")
async def validate_bens(
    request: BENValidationRequest,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Validate a list of BENs against USAC API.
    Returns school name, state, and validity for each BEN.
    Used before CSV import to preview results.
    """
    results: List[Dict[str, Any]] = []
    
    # Get existing BENs in portfolio for duplicate check
    existing_bens = set(
        s.ben for s in db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
    )
    
    usac_service = get_usac_service()
    
    for ben in request.bens[:100]:  # Limit to 100 BENs per request
        ben = str(ben).strip()
        if not ben:
            continue
            
        result = {
            "ben": ben,
            "valid": False,
            "school_name": None,
            "state": None,
            "entity_type": None,
            "already_exists": ben in existing_bens,
            "error": None
        }
        
        try:
            # Query USAC API for this BEN
            data = usac_service.fetch_form_471(
                filters={"ben": ben},
                limit=1
            )
            
            if data and len(data) > 0:
                record = data[0]
                result["valid"] = True
                result["school_name"] = record.get("organization_name") or record.get("billed_entity_name")
                result["state"] = record.get("physical_state") or record.get("state")
                result["entity_type"] = record.get("entity_type")
            else:
                # No Form 471 data - try entity API directly
                entity_data = usac_service.enrich_ben(ben)
                if entity_data and entity_data.get("organization_name"):
                    result["valid"] = True
                    result["school_name"] = entity_data["organization_name"]
                    result["state"] = entity_data.get("state")
                    result["entity_type"] = entity_data.get("entity_type")
                else:
                    result["error"] = "BEN not found in USAC database"
                
        except Exception as e:
            result["error"] = f"Validation failed: {str(e)}"
        
        results.append(result)
    
    valid_count = sum(1 for r in results if r["valid"])
    already_exists_count = sum(1 for r in results if r["already_exists"])
    
    return {
        "success": True,
        "total": len(results),
        "valid_count": valid_count,
        "invalid_count": len(results) - valid_count,
        "already_exists_count": already_exists_count,
        "results": results
    }


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get dashboard statistics for the consultant including total Category 2 funding.
    Uses C2 Budget Tool API for accurate C2 funding and Form 471 API for denials.
    """
    schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id
    ).all()
    
    if not schools:
        return {
            "success": True,
            "total_schools": 0,
            "total_c2_funding": 0,
            "total_c1_funding": 0,
            "total_applications": 0,
            "denied_count": 0,
            "funded_count": 0,
            "pending_count": 0,
            "schools_with_denials": 0
        }
    
    all_bens = [school.ben for school in schools]
    
    # Check cache first (dashboard stats are expensive — 2 USAC API calls)
    from app.services.cache_service import get_cached, set_cached, make_cache_key
    cache_key = make_cache_key("dashboard_stats", bens=all_bens)
    cached = get_cached(db, cache_key)
    if cached:
        # Update total_schools from DB (may have changed)
        cached["total_schools"] = len(schools)
        return cached
    
    total_c2_funding = 0
    total_c1_funding = 0
    total_applications = 0
    denied_count = 0
    funded_count = 0
    pending_count = 0
    bens_with_denials = set()
    
    # ========== STEP 1: Fetch C2 Budget data using C2 Budget Tool API ==========
    # This gives us accurate 5-year C2 budget amounts
    # OPTIMIZED: Batch query all BENs in one API call instead of individual calls
    try:
        if len(all_bens) == 1:
            c2_ben_filter = f"ben='{all_bens[0]}'"
        else:
            # Build OR clause for all BENs in a single query
            c2_or_conditions = [f"ben='{ben}'" for ben in all_bens]
            c2_ben_filter = f"({' OR '.join(c2_or_conditions)})"
        
        c2_data = fetch_usac_data('c2_budget', c2_ben_filter, limit=len(all_bens) * 10)
        
        if c2_data:
            for record in c2_data:
                # funded_c2_budget_amount = total C2 funding committed for this entity
                c2_funded = float(record.get("funded_c2_budget_amount") or 0)
                total_c2_funding += c2_funded
        print(f"DEBUG dashboard: Fetched C2 budget data for {len(all_bens)} BENs in single query, found {len(c2_data)} records")
    except Exception as e:
        print(f"Error fetching C2 Budget data: {e}")
    
    # ========== STEP 2: Fetch Form 471 data for 2025 denials and status counts ==========
    try:
        # Build OR clause for multiple BENs
        if len(all_bens) == 1:
            ben_filter = f"ben='{all_bens[0]}'"
        else:
            or_conditions = [f"ben='{ben}'" for ben in all_bens]
            ben_filter = f"({' OR '.join(or_conditions)})"
        
        # Query Form 471 with year filter - funding_year is a string field in this dataset
        where_clause = f"{ben_filter} AND funding_year='2025'"
        form_471_data = fetch_usac_data('form_471', where_clause, limit=len(all_bens) * 50)
        
        total_applications = len(form_471_data)
        print(f"DEBUG dashboard: Found {total_applications} Form 471 applications for 2025")
        
        # Debug: Print all unique statuses in dashboard
        all_statuses = set()
        for app in form_471_data:
            status = str(app.get("form_471_frn_status_name", ""))
            all_statuses.add(status)
        print(f"DEBUG dashboard: All unique statuses: {all_statuses}")
        
        for app in form_471_data:
            # Get status from form_471_frn_status_name
            status = str(app.get("form_471_frn_status_name", "")).lower()
            ben = app.get("ben")
            
            # Get committed amount for C1 calculation
            committed = float(app.get("funding_commitment_request") or 0)
            service_type = str(app.get("form_471_service_type_name", "")).lower()
            
            # C2 service types
            is_c2 = any(c2_type in service_type for c2_type in [
                "internal connections", "basic maintenance", 
                "managed internal broadband services", "mibs"
            ])
            
            # Only add C1 funding (C2 comes from C2 Budget Tool)
            if not is_c2 and status == "funded":
                total_c1_funding += committed
            
            # Count by status
            if "denied" in status:
                denied_count += 1
                if ben:
                    bens_with_denials.add(str(ben))
            elif status == "funded":
                funded_count += 1
            elif status in ["pending", "wave ready", "certified"]:
                pending_count += 1
                
    except Exception as e:
        print(f"Error fetching Form 471 data: {e}")
    
    result = {
        "success": True,
        "total_schools": len(schools),
        "total_c2_funding": total_c2_funding,
        "total_c1_funding": total_c1_funding,
        "total_funding": total_c2_funding + total_c1_funding,
        "total_applications": total_applications,
        "denied_count": denied_count,
        "funded_count": funded_count,
        "pending_count": pending_count,
        "schools_with_denials": len(bens_with_denials)
    }
    
    # Cache for 6 hours
    set_cached(db, cache_key, result)
    
    return result


@router.get("/denied-applications")
async def get_denied_applications(
    year: Optional[int] = Query(None, description="Filter by funding year (defaults to current year)"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get all denied applications across the consultant's schools.
    Returns detailed information for each denied FRN to help with appeals.
    """
    from app.models.application import AppealRecord
    
    schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id
    ).all()
    
    if not schools:
        return {
            "success": True,
            "denied_applications": [],
            "total_denied": 0,
            "total_denied_amount": 0
        }
    
    all_bens = [school.ben for school in schools]
    ben_to_school = {school.ben: school for school in schools}
    
    # Check cache first
    from app.services.cache_service import get_cached, set_cached, make_cache_key
    funding_year = year or 2025
    cache_key = make_cache_key("denied_apps", bens=all_bens, year=funding_year)
    cached = get_cached(db, cache_key)
    if cached:
        return cached
    
    # For now, we don't track appeals by FRN since AppealRecord links to Application
    # which is not populated from USAC data. Will show has_appeal=False for all.
    frns_with_appeals = set()
    
    denied_applications = []
    total_denied_amount = 0
    
    try:
        # Build OR clause for multiple BENs
        if len(all_bens) == 1:
            ben_filter = f"ben='{all_bens[0]}'"
        else:
            or_conditions = [f"ben='{ben}'" for ben in all_bens]
            ben_filter = f"({' OR '.join(or_conditions)})"
        
        # Filter by year if specified - default to 2025 (same as dashboard)
        funding_year = year or 2025
        where_clause = f"{ben_filter} AND funding_year='{funding_year}'"
        
        # Fetch Form 471 data
        form_471_data = fetch_usac_data('form_471', where_clause, limit=len(all_bens) * 100)
        
        print(f"DEBUG denied-applications: Found {len(form_471_data)} Form 471 applications for {funding_year}")
        
        # Debug: Print all unique statuses
        all_statuses = set()
        for app in form_471_data:
            status = str(app.get("form_471_frn_status_name", ""))
            all_statuses.add(status)
        print(f"DEBUG denied-applications: All unique statuses: {all_statuses}")
        
        for app in form_471_data:
            status = str(app.get("form_471_frn_status_name", "")).lower()
            
            # Match the same logic as dashboard - check if "denied" is in status
            if "denied" in status:
                frn = str(app.get("funding_request_number", ""))
                ben = str(app.get("ben", ""))
                school = ben_to_school.get(ben)
                
                amount = float(app.get("funding_commitment_request") or app.get("original_request") or 0)
                total_denied_amount += amount
                
                # Extract FCDL date and calculate appeal deadline
                fcdl_date_str = app.get("fcdl_letter_date")
                deadline_info = None
                
                if fcdl_date_str:
                    try:
                        from datetime import datetime, timedelta
                        # Parse FCDL date
                        fcdl_date = datetime.fromisoformat(fcdl_date_str.replace('T00:00:00.000', ''))
                        appeal_deadline = fcdl_date + timedelta(days=60)
                        days_remaining = (appeal_deadline - datetime.now()).days
                        
                        # Determine urgency level
                        if days_remaining < 0:
                            urgency = "EXPIRED"
                            urgency_color = "gray"
                        elif days_remaining <= 7:
                            urgency = "CRITICAL"
                            urgency_color = "red"
                        elif days_remaining <= 14:
                            urgency = "HIGH"
                            urgency_color = "orange"
                        elif days_remaining <= 30:
                            urgency = "MEDIUM"
                            urgency_color = "yellow"
                        else:
                            urgency = "LOW"
                            urgency_color = "green"
                        
                        deadline_info = {
                            "fcdl_date": fcdl_date.strftime('%Y-%m-%d'),
                            "appeal_deadline": appeal_deadline.strftime('%Y-%m-%d'),
                            "days_remaining": days_remaining,
                            "urgency": urgency,
                            "urgency_color": urgency_color,
                            "is_expired": days_remaining < 0,
                            "can_appeal_to_usac": days_remaining >= 0
                        }
                    except Exception as e:
                        print(f"Error calculating deadline for FRN {frn}: {e}")
                
                print(f"DEBUG: Found denied FRN {frn} - status: {status}, amount: {amount}")
                
                denied_app = {
                    "frn": frn,
                    "ben": ben,
                    "school_name": school.school_name if school else app.get("organization_name", "Unknown"),
                    "funding_year": app.get("funding_year"),
                    "status": app.get("form_471_frn_status_name", "Denied"),
                    "service_type": app.get("form_471_service_type_name"),
                    "amount_requested": amount,
                    "denial_reason": app.get("denial_reason") or app.get("frn_denial_reason_desc"),
                    "application_number": app.get("application_number"),
                    "has_appeal": frn in frns_with_appeals
                }
                
                # Add deadline info if available
                if deadline_info:
                    denied_app.update(deadline_info)
                
                denied_applications.append(denied_app)
                
    except Exception as e:
        print(f"Error fetching denied applications: {e}")
        import traceback
        traceback.print_exc()
    
    # ========== CROSS-REFERENCE: Enrich denial reasons from FRN Status dataset ==========
    # The Form 471 dataset (srbr-2d59) often lacks denial_reason/fcdl fields.
    # The FRN Status dataset (qdmp-ygft) has fcdl_comment_frn with actual FCDL comments.
    frns_missing_reasons = [app for app in denied_applications if not app.get("denial_reason")]

    if frns_missing_reasons:
        try:
            from utils.usac_client import USACDataClient
            client = USACDataClient()

            # Get unique BENs that need enrichment
            bens_to_enrich = list(set(app["ben"] for app in frns_missing_reasons))

            # Batch fetch from FRN Status dataset (qdmp-ygft) — 1 API call
            batch_result = client.get_frn_status_batch(
                bens=bens_to_enrich,
                year=funding_year,
                status_filter="Denied"
            )

            if batch_result.get("success"):
                # Build FRN -> fcdl_comment lookup from FRN Status dataset
                frn_fcdl_map = {}
                for ben_data in batch_result.get("results", {}).values():
                    for frn_record in ben_data.get("frns", []):
                        frn_num = frn_record.get("frn", "")
                        fcdl = frn_record.get("fcdl_comment", "")
                        pending = frn_record.get("pending_reason", "")
                        if frn_num and (fcdl or pending):
                            frn_fcdl_map[frn_num] = fcdl or pending

                # Enrich denied applications with FCDL comments
                enriched_count = 0
                for app in denied_applications:
                    if not app.get("denial_reason") and app["frn"] in frn_fcdl_map:
                        app["denial_reason"] = frn_fcdl_map[app["frn"]]
                        enriched_count += 1

                print(f"DEBUG denied-applications: Enriched {enriched_count}/{len(frns_missing_reasons)} denial reasons from FRN Status dataset")
        except Exception as e:
            print(f"Warning: Failed to enrich denial reasons from FRN Status dataset: {e}")

    print(f"DEBUG denied-applications: Returning {len(denied_applications)} denied applications")
    
    # Sort by urgency (most urgent first), then by amount
    urgency_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "EXPIRED": 4}
    denied_applications.sort(
        key=lambda x: (
            urgency_order.get(x.get("urgency", "LOW"), 99),  # Primary: urgency
            -x.get("amount_requested", 0)  # Secondary: amount (descending)
        )
    )
    
    result = {
        "success": True,
        "denied_applications": denied_applications,
        "total_denied": len(denied_applications),
        "total_denied_amount": total_denied_amount,
        "year": funding_year
    }
    
    # Cache for 6 hours
    set_cached(db, cache_key, result)
    
    return result


@router.get("/schools")
async def list_schools(
    include_usac_data: bool = Query(False, description="Fetch fresh data from USAC for each school"),
    auto_sync: bool = Query(True, description="Auto-sync schools with Unknown status or never synced"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    List all schools in consultant's portfolio.
    
    Auto-sync behavior (auto_sync=true by default):
    - Automatically syncs schools that have status='Unknown' or have never been synced
    - Ensures schools always have up-to-date status when consultant logs in
    
    If include_usac_data=true, forces fresh sync for ALL schools regardless of status.
    OPTIMIZED: Uses batch query to fetch all schools at once instead of one-by-one.
    """
    schools = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id
    ).order_by(ConsultantSchool.school_name).all()
    
    school_list = []
    
    # Determine if we need to sync from USAC
    # Auto-sync schools that have status='Unknown' or have never been synced
    needs_sync = include_usac_data  # Force sync if explicitly requested
    
    if not needs_sync and auto_sync and schools:
        # Check if any schools need syncing (Unknown status or never synced)
        schools_needing_sync = [
            s for s in schools 
            if not s.status or s.status == 'Unknown' or s.last_synced is None
        ]
        if schools_needing_sync:
            needs_sync = True
            print(f"Auto-sync triggered: {len(schools_needing_sync)} schools need status update")
    
    if needs_sync and schools:
        usac_service = get_usac_service()
        
        # OPTIMIZATION: Fetch ALL applications for ALL BENs in a SINGLE batch query
        all_bens = [school.ben for school in schools]
        
        # Build a map of BEN -> applications
        ben_applications: Dict[str, List[Dict]] = {ben: [] for ben in all_bens}
        
        try:
            # Single batch query with all BENs (uses OR conditions)
            all_applications = usac_service.fetch_form_471(
                filters={"ben": all_bens},  # Pass list of BENs for batch query
                limit=len(all_bens) * 20  # ~20 apps per school should be enough
            )
            
            # Group applications by BEN
            for app in all_applications:
                app_ben = str(app.get("ben", ""))
                if app_ben in ben_applications:
                    ben_applications[app_ben].append(app)
        except Exception as e:
            print(f"Batch USAC fetch failed: {e}")
            # Fall back to empty - will show "No Applications"
        
        # Now process each school using the pre-fetched data
        for school in schools:
            school_data = school.to_dict()
            applications = ben_applications.get(school.ben, [])
            
            if applications:
                # Sort by funding year desc
                sorted_apps = sorted(
                    applications, 
                    key=lambda x: int(x.get("funding_year", 0) or 0), 
                    reverse=True
                )
                
                # Get school info from most recent app
                latest = sorted_apps[0]
                school_data["school_name"] = latest.get("applicant_name") or latest.get("organization_name") or latest.get("billed_entity_name") or school.school_name
                school_data["state"] = latest.get("physical_state") or latest.get("state") or school.state
                
                # Determine overall status based on most recent year's applications
                latest_year = latest.get("funding_year")
                latest_year_apps = [a for a in sorted_apps if a.get("funding_year") == latest_year]
                
                # Check all possible status values from USAC
                # IMPORTANT: Check both form_471_frn_status_name AND application_status
                # The USAC API may return the status in either field
                statuses = [
                    (a.get("form_471_frn_status_name") or a.get("application_status") or "").lower() 
                    for a in latest_year_apps
                ]
                
                has_denied = any("denied" in s for s in statuses)
                has_funded = any(s in ["funded", "committed"] for s in statuses)
                has_pending = any(s in ["pending", "under review", "in review", "wave ready", "certified", "submitted"] for s in statuses)
                has_unfunded = any(s in ["unfunded", "cancelled", "not funded"] for s in statuses)
                
                if has_denied:
                    school_data["status"] = "Has Denials"
                    school_data["status_color"] = "red"
                elif has_unfunded:
                    school_data["status"] = "Unfunded"
                    school_data["status_color"] = "red"
                elif has_funded:
                    school_data["status"] = "Funded"
                    school_data["status_color"] = "green"
                elif has_pending:
                    school_data["status"] = "Pending"
                    school_data["status_color"] = "yellow"
                else:
                    actual_status = latest.get("form_471_frn_status_name") or latest.get("application_status") or "Unknown"
                    school_data["status"] = actual_status if actual_status else "Unknown"
                    school_data["status_color"] = "gray"
                
                school_data["latest_year"] = latest_year
                school_data["applications_count"] = len(applications)
                
                # SAVE ALL DATA TO DATABASE - not just display it
                if school_data.get("school_name") and school_data["school_name"] != school.school_name:
                    school.school_name = school_data["school_name"]
                if school_data.get("state") and school_data["state"] != school.state:
                    school.state = school_data["state"]
                # Save status info to DB
                school.status = school_data["status"]
                school.status_color = school_data["status_color"]
                school.latest_year = int(latest_year) if latest_year else None
                school.applications_count = len(applications)
                school.last_synced = datetime.utcnow()
            else:
                school_data["status"] = "No Applications"
                school_data["status_color"] = "gray"
                school_data["applications_count"] = 0
                # Save to DB
                school.status = "No Applications"
                school.status_color = "gray"
                school.applications_count = 0
                school.last_synced = datetime.utcnow()
            
            school_list.append(school_data)
        
        # Commit any updates to DB
        db.commit()
        print(f"Synced {len(school_list)} schools from USAC and saved to database")
    else:
        # No sync needed - return cached data from database
        school_list = [s.to_dict() for s in schools]
    
    return {
        "success": True,
        "count": len(school_list),
        "schools": school_list,
        "synced": needs_sync if schools else False
    }


@router.post("/schools")
async def add_school(
    data: SchoolAdd,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """Add a school to consultant's portfolio with auto-population from USAC"""
    # Check if already exists
    existing = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == data.ben
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"School with BEN {data.ben} already in portfolio"
        )
    
    # Try to fetch school info from USAC
    school_name = data.school_name
    state = data.state
    school_status = "Unknown"
    status_color = "gray"
    applications_count = 0
    latest_year = None
    
    try:
        usac_service = get_usac_service()
        usac_data = usac_service.fetch_form_471(
            filters={"ben": data.ben},
            limit=50  # Get more records to determine status
        )
        if usac_data:
            # Sort by funding year desc
            sorted_apps = sorted(
                usac_data, 
                key=lambda x: int(x.get("funding_year", 0) or 0), 
                reverse=True
            )
            
            # Get school info from most recent app
            latest = sorted_apps[0]
            if not school_name:
                school_name = latest.get("organization_name") or latest.get("billed_entity_name") or latest.get("applicant_name")
            if not state:
                state = latest.get("physical_state") or latest.get("state")
            
            latest_year = latest.get("funding_year")
            applications_count = len(usac_data)
            
            # Determine status from most recent year's applications
            latest_year_apps = [a for a in sorted_apps if a.get("funding_year") == latest_year]
            statuses = [
                (a.get("form_471_frn_status_name") or a.get("application_status") or "").lower() 
                for a in latest_year_apps
            ]
            
            has_denied = any("denied" in s for s in statuses)
            has_funded = any(s in ["funded", "committed"] for s in statuses)
            has_pending = any(s in ["pending", "under review", "in review", "wave ready", "certified", "submitted"] for s in statuses)
            has_unfunded = any(s in ["unfunded", "cancelled", "not funded"] for s in statuses)
            
            if has_denied:
                school_status = "Has Denials"
                status_color = "red"
            elif has_unfunded:
                school_status = "Unfunded"
                status_color = "red"
            elif has_funded:
                school_status = "Funded"
                status_color = "green"
            elif has_pending:
                school_status = "Pending"
                status_color = "yellow"
            else:
                actual = latest.get("form_471_frn_status_name") or latest.get("application_status")
                school_status = actual if actual else "No Applications"
                status_color = "gray"
        else:
            school_status = "No Applications"
            status_color = "gray"
    except Exception as e:
        print(f"Error fetching USAC data for BEN {data.ben}: {e}")
        # Continue with defaults if USAC lookup fails
    
    school = ConsultantSchool(
        consultant_profile_id=profile.id,
        ben=data.ben,
        frn=data.frn,
        school_name=school_name or "Unknown",
        state=state,
        status=school_status,
        status_color=status_color,
        applications_count=applications_count,
        latest_year=int(latest_year) if latest_year else None,
        last_synced=datetime.utcnow(),
        notes=data.notes,
        tags=data.tags or [],
    )
    db.add(school)
    db.commit()
    db.refresh(school)
    
    return {"success": True, "school": school.to_dict()}


@router.post("/upload-csv")
async def upload_schools_csv(
    file: UploadFile = File(...),
    validate_with_usac: bool = Query(True, description="Validate BENs and fetch school info from USAC"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Upload CSV file with BEN numbers to add schools in bulk.
    CSV should have columns: ben, notes (optional)
    If validate_with_usac=true, fetches school name and state from USAC API.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV"
        )
    
    content = await file.read()
    usac_service = get_usac_service() if validate_with_usac else None
    
    try:
        decoded = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))
        
        added = 0
        skipped = 0
        invalid = 0
        errors = []
        added_schools = []
        
        for row in reader:
            ben = row.get('ben', '').strip()
            notes = row.get('notes', '').strip() or None
            
            if not ben:
                continue
            
            # Check if already exists
            existing = db.query(ConsultantSchool).filter(
                ConsultantSchool.consultant_profile_id == profile.id,
                ConsultantSchool.ben == ben
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            # Validate with USAC if enabled
            school_name = None
            state = None
            
            if usac_service:
                try:
                    usac_data = usac_service.fetch_form_471(
                        filters={"ben": ben},
                        limit=1
                    )
                    if usac_data:
                        record = usac_data[0]
                        school_name = record.get("organization_name") or record.get("billed_entity_name")
                        state = record.get("physical_state") or record.get("state")
                    else:
                        errors.append(f"BEN {ben}: Not found in USAC database")
                        invalid += 1
                        continue
                except Exception as e:
                    errors.append(f"BEN {ben}: Validation error - {str(e)}")
            
            try:
                school = ConsultantSchool(
                    consultant_profile_id=profile.id,
                    ben=ben,
                    school_name=school_name,
                    state=state,
                    notes=notes,
                )
                db.add(school)
                added += 1
                added_schools.append({
                    "ben": ben,
                    "school_name": school_name,
                    "state": state
                })
            except Exception as e:
                errors.append(f"Row with BEN {ben}: {str(e)}")
        
        db.commit()
        
        return {
            "success": True,
            "added": added,
            "skipped": skipped,
            "invalid": invalid,
            "errors": errors[:10] if errors else [],  # Return max 10 errors
            "added_schools": added_schools[:20]  # Show first 20 added schools
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV: {str(e)}"
        )


@router.get("/schools/{ben}")
async def get_school_details(
    ben: str,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """Get detailed information for a specific school"""
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found in portfolio"
        )
    
    return {"success": True, "school": school.to_dict()}


@router.put("/schools/{ben}")
async def update_school(
    ben: str,
    data: SchoolUpdate,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """Update school notes and tags"""
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found"
        )
    
    if data.notes is not None:
        school.notes = data.notes
    if data.tags is not None:
        school.tags = data.tags
    
    db.commit()
    db.refresh(school)
    
    return {"success": True, "school": school.to_dict()}


@router.delete("/schools/{ben}")
async def remove_school(
    ben: str,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """Remove a school from portfolio"""
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found"
        )
    
    db.delete(school)
    db.commit()
    
    return {"success": True, "message": f"School {ben} removed from portfolio"}


# ==================== FUNDING DATA ENDPOINTS ====================

@router.get("/schools/{ben}/funding")
async def get_school_funding(
    ben: str,
    year: Optional[int] = None,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get funding balance and history for a school.
    Uses USAC API to fetch fresh data.
    """
    # Verify school is in portfolio
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found in portfolio"
        )
    
    try:
        # Import and use existing funding balance function from opendata root
        import sys
        import os
        # Add opendata root folder to path
        opendata_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))))
        if opendata_root not in sys.path:
            sys.path.insert(0, opendata_root)
        
        from get_ben_funding_balance import get_funding_balance
        
        result = get_funding_balance(ben, year)
        
        # Update school info if we got entity data
        if result.get("entity_info"):
            entity = result["entity_info"]
            if entity.get("organization_name"):
                school.school_name = entity["organization_name"]
            if entity.get("state"):
                school.state = entity["state"]
            school.last_synced = datetime.utcnow()
            db.commit()
        
        return {"success": True, "funding": result}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch funding data: {str(e)}"
        )


@router.get("/schools/{ben}/applications")
async def get_school_applications(
    ben: str,
    year: Optional[int] = Query(None, description="Filter by funding year (e.g., 2025)"),
    status_filter: Optional[str] = Query(None, description="Filter by status (Funded, Denied, Pending)"),
    include_denial_reasons: bool = Query(False, description="Fetch detailed denial reasons"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get all applications for a school with optional filtering.
    Uses USAC API to fetch Form 471 data.
    Includes denial reasons if requested.
    """
    # Verify school is in portfolio
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found in portfolio"
        )
    
    try:
        usac_service = get_usac_service()
        
        # Build filters
        filters = {"ben": ben}
        if status_filter:
            filters["application_status"] = status_filter
        
        # Fetch applications
        applications = usac_service.fetch_form_471(
            year=year,
            filters=filters,
            limit=500
        )
        
        if not applications:
            return {
                "success": True,
                "count": 0,
                "applications": [],
                "available_years": []
            }
        
        # Group by year for available years list
        years = sorted(set(
            int(a.get("funding_year", 0)) 
            for a in applications 
            if a.get("funding_year")
        ), reverse=True)
        
        # Process applications to extract key fields
        processed_apps = []
        for app in applications:
            processed = {
                "frn": app.get("funding_request_number"),
                "application_number": app.get("application_number"),
                "funding_year": app.get("funding_year"),
                "status": app.get("application_status"),
                "service_type": app.get("form_471_service_type_name") or app.get("frn_service_type"),
                "committed_amount": app.get("original_funding_commitment_request") or app.get("original_committed_amount"),
                "pre_discount_costs": app.get("original_total_pre_discount_costs"),
                "discount_rate": app.get("discount_rate"),
                "fcdl_date": app.get("fcdl_date"),
                "organization_name": app.get("organization_name"),
                "state": app.get("physical_state"),
                # Denial fields
                "is_denied": "denied" in str(app.get("application_status", "")).lower(),
                "fcdl_comment": app.get("fcdl_comment"),  # Contains denial reason
            }
            
            # Parse denial reason from FCDL comment if applicable
            if processed["is_denied"] and processed.get("fcdl_comment"):
                processed["denial_reason"] = processed["fcdl_comment"]
            else:
                processed["denial_reason"] = None
            
            processed_apps.append(processed)
        
        # Sort by funding year desc, then by FRN
        processed_apps.sort(
            key=lambda x: (
                -int(x.get("funding_year") or 0),
                x.get("frn") or ""
            )
        )
        
        # Count denials
        denial_count = sum(1 for a in processed_apps if a["is_denied"])
        funded_count = sum(1 for a in processed_apps if str(a.get("status", "")).lower() == "funded")
        
        return {
            "success": True,
            "count": len(processed_apps),
            "denial_count": denial_count,
            "funded_count": funded_count,
            "available_years": years,
            "applications": processed_apps
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch applications: {str(e)}"
        )


# ==================== APPEAL ENDPOINTS ====================

@router.post("/generate-appeal")
async def generate_appeal(
    data: AppealGenerateRequest,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Generate an appeal for a denied application.
    Uses AI models to analyze denial and generate strategy.
    """
    try:
        from utils.usac_client import USACDataClient
        from utils.ai_models import AIModelManager
        from utils.denial_analyzer import DenialAnalyzer
        from utils.appeals_strategy import AppealsStrategy
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"Starting appeal generation for FRN: {data.frn}")
        
        # Initialize the USAC client
        client = USACDataClient()
        
        # First, get FRN status from the frn_status dataset (has denial reasons)
        denial_analyzer = DenialAnalyzer(client)
        denial_details = denial_analyzer.fetch_denial_details(data.frn)
        
        logger.info(f"Denial details fetched: {bool(denial_details)}")
        if denial_details:
            logger.info(f"Denial reasons found: {len(denial_details.get('denial_reasons', []))}")
            logger.info(f"FCDL comment: {denial_details.get('fcdl_comment', '')[:200] if denial_details.get('fcdl_comment') else 'EMPTY'}")
        
        # If frn_status doesn't have the data, fall back to form_471
        if not denial_details:
            df = client.fetch_data(filters={"funding_request_number": data.frn}, limit=1)
            
            if df.empty:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Application with FRN {data.frn} not found"
                )
            
            record = df.iloc[0].to_dict()
            denial_details = {
                "organization_name": record.get("organization_name"),
                "application_number": record.get("application_number"),
                "frn_count": 1,
                "total_denied_amount": float(record.get("original_total_pre_discount_costs") or 0),
                "fcdl_date": None,
                "appeal_deadline": None,
                "days_remaining": None,
                "denial_reasons": [],
                "fcdl_comment": "",
            }
        
        # Verify it's denied based on status
        frn_status = (denial_details.get("frn_status") or "").lower()
        if frn_status and "denied" not in frn_status and "unfunded" not in frn_status:
            logger.warning(f"FRN status is '{frn_status}', not denied - proceeding anyway")
        
        # Initialize AI manager and strategy generator
        ai_manager = AIModelManager()
        appeals_strategy = AppealsStrategy()
        
        # Generate strategy based on denial details
        strategy = appeals_strategy.generate_strategy(denial_details)
        
        # Build comprehensive denial reasons text for the AI
        denial_reasons_text = ""
        for reason in denial_details.get('denial_reasons', []):
            denial_reasons_text += f"\n- {reason.get('code', 'N/A')}: {reason.get('description', 'No description')}"
            denial_reasons_text += f" (Type: {reason.get('violation_type', 'unknown')}, Appealability: {reason.get('appealability', 'unknown')})"
        
        if not denial_reasons_text:
            denial_reasons_text = denial_details.get('fcdl_comment', '') or "No specific denial reasons available"
        
        logger.info(f"Denial reasons for AI prompt: {denial_reasons_text[:500]}")
        
        # Determine appeal type (USAC vs FCC)
        appeal_type, appeal_type_reason, can_override = determine_appeal_type(
            days_remaining=denial_details.get('days_remaining'),
            denial_reasons=denial_details.get('denial_reasons', []),
            user_context=data.additional_context,
            user_override=data.appeal_type
        )
        
        logger.info(f"Appeal type determined: {appeal_type} - {appeal_type_reason}")
        
        # Build the appropriate prompt based on appeal type
        if appeal_type == "fcc":
            # FCC Appeal - for waivers or after USAC deadline
            appeal_prompt = f"""Generate an FCC E-Rate appeal letter requesting a waiver or review of USAC's decision.

ADDRESSEE (include at top of letter):
{FCC_SECRETARY['name']}, {FCC_SECRETARY['title']}
{FCC_SECRETARY['organization']}
{FCC_SECRETARY['office']}
{FCC_SECRETARY['address']}
{FCC_SECRETARY['city_state_zip']}

CRITICAL FORMATTING RULES:
- Maximum 2 pages (about 600-700 words)
- Use these sections: STATEMENT OF APPEAL, BACKGROUND, SPECIAL CIRCUMSTANCES, WAIVER JUSTIFICATION, REQUESTED RELIEF
- Reference FCC orders and rules (not civil law)
- Professional but not overly legalistic
- Focus on why waiver should be granted

APPLICATION DATA:
Organization: {denial_details.get('organization_name')}
BEN: {denial_details.get('ben')}
Application Number: {denial_details.get('application_number')}
FRN: {denial_details.get('frn')}
Funding Year: {denial_details.get('funding_year')}
Service Type: {denial_details.get('service_type')}
Denied Amount: ${denial_details.get('total_denied_amount', 0):,.2f}
FCDL Date: {denial_details.get('fcdl_date') or 'Unknown'}
Appeal Deadline: {denial_details.get('appeal_deadline') or 'Unknown'}
Days Since Deadline: {abs(denial_details.get('days_remaining', 0)) if denial_details.get('days_remaining', 0) < 0 else 'Within window'}

DENIAL REASONS:
{denial_reasons_text}

RAW FCDL COMMENT:
{denial_details.get('fcdl_comment') or 'Not available'}

Additional Context: {data.additional_context or 'None provided'}

APPEAL STRUCTURE:

1. STATEMENT OF APPEAL (2-3 sentences)
State: "[Organization] respectfully petitions the Federal Communications Commission to [grant a waiver / review USAC's decision] regarding FRN [number]."

2. BACKGROUND (1 paragraph)
Brief factual background of the application and USAC's decision.

3. SPECIAL CIRCUMSTANCES (bullet points)
- Good faith effort to comply with program rules
- First-time violation (if applicable)
- No competitive advantage gained
- Impact on students/educational mission
- Prior E-Rate participation history

4. WAIVER JUSTIFICATION (1-2 paragraphs)
Explain why granting the waiver:
- Serves the underlying purpose of the E-Rate program
- Would not undermine program integrity
- Is consistent with FCC precedent (cite specific FCC orders if known)
Reference 47 C.F.R. § 1.3 (general waiver authority) if requesting waiver.

5. REQUESTED RELIEF (2-3 sentences)
Clearly state what action the FCC should take.

TONE: Professional, respectful, focused on public interest and program goals."""
        else:
            # USAC Appeal - factual correction within 60 days
            appeal_prompt = f"""Generate a USAC E-Rate appeal letter that is SHORT and FACTUAL.

ADDRESSEE:
USAC Appeals
Universal Service Administrative Company

CRITICAL FORMATTING RULES:
- Maximum 1.5 pages (about 400-500 words)
- Use EXACTLY 4 sections: ISSUE, FACTS, EXPLANATION, REQUESTED ACTION
- NO legal jargon (avoid: "arbitrary and capricious", "Administrative Procedure Act", "due process")
- NO aggressive language - use respectful, factual tone
- Focus on FACTS and DOCUMENTATION, not policy arguments
- State the problem in the FIRST paragraph

APPLICATION DATA:
Organization: {denial_details.get('organization_name')}
BEN: {denial_details.get('ben')}
Application Number: {denial_details.get('application_number')}
FRN: {denial_details.get('frn')}
Funding Year: {denial_details.get('funding_year')}
Service Type: {denial_details.get('service_type')}
Denied Amount: ${denial_details.get('total_denied_amount', 0):,.2f}
FCDL Date: {denial_details.get('fcdl_date') or 'Unknown'}
Appeal Deadline: {denial_details.get('appeal_deadline') or 'Unknown'}
Days Remaining: {denial_details.get('days_remaining') or 'Unknown'}

DENIAL REASONS FROM FCDL:
{denial_reasons_text}

RAW FCDL COMMENT:
{denial_details.get('fcdl_comment') or 'Not available'}

Additional Context from User: {data.additional_context or 'None provided'}

APPEAL STRUCTURE (follow exactly):

1. ISSUE (2-3 sentences max)
State exactly: "[Organization] (BEN [number]) respectfully requests reversal of USAC's [decision type] of FRN [number] for Funding Year [year]."
Then state what USAC's stated reason was and that it appears to be based on a misunderstanding.

2. FACTS (bullet points, 5-8 items max)
- Key facts about the applicant
- Prior E-Rate funding history (if any) - THIS IS VERY IMPORTANT
- Relevant eligibility facts
- What actually happened vs what USAC believed

3. EXPLANATION (1-2 short paragraphs)
- Explain why USAC's determination was incorrect
- Reference specific evidence/documentation
- If the applicant received prior E-Rate funding, emphasize this strongly
- Keep it factual, not argumentative

4. REQUESTED ACTION (2-3 sentences)
Simply state: "Based on the above, [Organization] respectfully requests that USAC reverse its decision and reinstate FRN [number]."
List any supporting documents being submitted.

TONE GUIDANCE:
- Use: "This determination appears to be based on a misunderstanding of..."
- Avoid: "This decision was arbitrary and capricious..."
- Use: "The applicant has provided documentation showing..."
- Avoid: "USAC violated due process by..."

Remember: USAC reviewers prefer concise, factual corrections over lengthy legal arguments. Prior E-Rate approvals are often the strongest evidence."""

        appeal_text = ai_manager.deep_analysis(
            str(denial_details),
            appeal_prompt
        )
        
        return {
            "success": True,
            "appeal": {
                "frn": data.frn,
                "organization": denial_details.get("organization_name"),
                "appeal_type": appeal_type,
                "appeal_type_reason": appeal_type_reason,
                "can_override_type": can_override,
                "denial_details": denial_details,
                "strategy": strategy,
                "appeal_letter": appeal_text,
                "addressee": FCC_SECRETARY if appeal_type == "fcc" else {"name": "USAC Appeals", "organization": "Universal Service Administrative Company"}
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate appeal: {str(e)}"
        )


@router.get("/appeals")
async def list_appeals(
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """List all generated appeals for consultant's schools"""
    # Get all BENs in portfolio
    school_bens = [s.ben for s in profile.schools]
    
    if not school_bens:
        return {"success": True, "count": 0, "appeals": []}
    
    # Get appeals for those schools
    appeals = db.query(AppealRecord).join(Application).join(SchoolSnapshot).filter(
        SchoolSnapshot.ben.in_(school_bens)
    ).order_by(AppealRecord.generated_at.desc()).all()
    
    return {
        "success": True,
        "count": len(appeals),
        "appeals": [a.to_dict() for a in appeals]
    }


# ==================== FRN STATUS MONITORING (for Consultant Portfolio) ====================

@router.get("/frn-status")
async def get_portfolio_frn_status(
    year: Optional[int] = None,
    status_filter: Optional[str] = None,
    pending_reason: Optional[str] = None,
    limit: int = 500,
    refresh: bool = False,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db),
):
    """
    Get FRN status for all schools in consultant's portfolio.
    Uses batch USAC API call (1 call for all BENs) with DB caching (6hr TTL).
    
    Useful for consultants to:
    - Track which FRNs are funded/denied/pending across all clients
    - See disbursement status for all schools
    - Identify denied FRNs that need appeals
    
    Args:
        year: Optional funding year filter
        status_filter: Optional status filter ('Funded', 'Denied', 'Pending')
        limit: Maximum records per school (default 500)
        refresh: If True, bypass cache and fetch fresh data from USAC
    """
    # Get all BENs in portfolio
    school_bens = [s.ben for s in profile.schools]
    
    if not school_bens:
        return {
            "success": True,
            "message": "No schools in portfolio. Add schools to track their FRN status.",
            "total_frns": 0,
            "summary": {},
            "schools": []
        }
    
    # Check DB cache first (unless refresh is requested)
    cache_key = None
    try:
        from app.services.cache_service import get_cached, set_cached, make_frn_cache_key
        cache_key = make_frn_cache_key(school_bens, year, status_filter, pending_reason)
        if not refresh:
            cached_result = get_cached(db, cache_key)
            if cached_result:
                cached_result["from_cache"] = True
                return cached_result
    except Exception:
        cache_key = None  # Cache unavailable, proceed without it
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        
        # Batch fetch FRN status for ALL portfolio BENs in a single USAC API call
        # Instead of N sequential calls (one per BEN), this uses WHERE ben IN (...)
        batch_result = client.get_frn_status_batch(
            bens=school_bens,
            year=year,
            status_filter=status_filter,
            pending_reason_filter=pending_reason
        )
        
        if not batch_result.get('success'):
            raise Exception(batch_result.get('error', 'Batch FRN query failed'))
        
        all_frns = []
        schools_data = []
        status_counts = {
            "funded": {"count": 0, "amount": 0},
            "denied": {"count": 0, "amount": 0},
            "pending": {"count": 0, "amount": 0},
            "other": {"count": 0, "amount": 0}
        }
        
        for ben in school_bens:
            result = batch_result['results'].get(ben, {})
            
            if result.get('success') and result.get('frns'):
                school_frns = result.get('frns', [])
                all_frns.extend(school_frns)
                
                # Calculate school-level summary
                school_summary = {
                    "ben": ben,
                    "entity_name": result.get('entity_name', 'Unknown'),
                    "total_frns": len(school_frns),
                    "funded": 0,
                    "denied": 0,
                    "pending": 0,
                    "total_amount": 0,
                    "frns": school_frns[:10]  # Include first 10 FRNs for quick view
                }
                
                for frn in school_frns:
                    frn_status = (frn.get('status') or '').lower()
                    amount = float(frn.get('commitment_amount') or frn.get('total_authorized_amount') or frn.get('amount') or 0)
                    school_summary["total_amount"] += amount
                    
                    if 'funded' in frn_status or 'committed' in frn_status:
                        school_summary["funded"] += 1
                        status_counts["funded"]["count"] += 1
                        status_counts["funded"]["amount"] += amount
                    elif 'denied' in frn_status:
                        school_summary["denied"] += 1
                        status_counts["denied"]["count"] += 1
                        status_counts["denied"]["amount"] += amount
                    elif any(s in frn_status for s in ['pending', 'review', 'submitted', 'certified']):
                        school_summary["pending"] += 1
                        status_counts["pending"]["count"] += 1
                        status_counts["pending"]["amount"] += amount
                    else:
                        status_counts["other"]["count"] += 1
                        status_counts["other"]["amount"] += amount
                
                schools_data.append(school_summary)
        
        result = {
            "success": True,
            "total_frns": len(all_frns),
            "total_schools": len(schools_data),
            "summary": status_counts,
            "year_filter": year,
            "schools": schools_data
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
            detail=f"Failed to fetch FRN status: {str(e)}"
        )


@router.get("/frn-status/school/{ben}")
async def get_school_frn_status(
    ben: str,
    year: Optional[int] = None,
    profile: ConsultantProfile = Depends(get_consultant_profile),
):
    """
    Get detailed FRN status for a specific school in the portfolio.
    
    Args:
        ben: Billed Entity Number
        year: Optional funding year filter
    """
    # Verify school is in portfolio
    school_bens = [s.ben for s in profile.schools]
    if ben not in school_bens:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School {ben} not found in your portfolio"
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_frn_status_by_ben(ben, year)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch school FRN status: {str(e)}"
        )


@router.get("/frn-status/summary")
async def get_portfolio_frn_summary(
    year: Optional[int] = None,
    refresh: bool = False,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db),
):
    """
    Get a quick summary of FRN status across all portfolio schools.
    Returns aggregate counts without individual FRN details.
    OPTIMIZED: Uses batch query (1 API call) + DB cache instead of N sequential calls.
    
    Args:
        year: Optional funding year filter (defaults to all years)
    """
    # Get all BENs in portfolio
    school_bens = [s.ben for s in profile.schools]
    
    if not school_bens:
        return {
            "success": True,
            "total_schools": 0,
            "total_frns": 0,
            "summary": {
                "funded": {"count": 0, "amount": 0},
                "denied": {"count": 0, "amount": 0},
                "pending": {"count": 0, "amount": 0}
            }
        }
    
    # Check cache first (skip if refresh requested)
    from app.services.cache_service import get_cached, set_cached, make_cache_key
    cache_key = make_cache_key("frn_summary", bens=school_bens, year=year)
    if not refresh:
        cached = get_cached(db, cache_key)
        if cached:
            return cached
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        
        # OPTIMIZED: Single batch call instead of N sequential calls
        batch_result = client.get_frn_status_batch(school_bens, year=year)
        
        total_frns = 0
        status_counts = {
            "funded": {"count": 0, "amount": 0},
            "denied": {"count": 0, "amount": 0},
            "pending": {"count": 0, "amount": 0}
        }
        
        schools_data = []
        
        if batch_result.get('success'):
            for ben, ben_data in batch_result.get('results', {}).items():
                if isinstance(ben_data, dict):
                    total_frns += ben_data.get('total_frns', 0)
                    # Use pre-computed summary from get_frn_status_batch
                    ben_summary = ben_data.get('summary', {})
                    for category in ["funded", "denied", "pending"]:
                        cat_data = ben_summary.get(category, {})
                        status_counts[category]["count"] += cat_data.get("count", 0)
                        status_counts[category]["amount"] += cat_data.get("amount", 0)
                    
                    # Collect per-school data for the frontend table
                    ben_funded = ben_summary.get('funded', {}).get('amount', 0)
                    ben_total = ben_funded + ben_summary.get('pending', {}).get('amount', 0) + ben_summary.get('denied', {}).get('amount', 0)
                    schools_data.append({
                        "ben": ben,
                        "school_name": ben_data.get('entity_name'),
                        "state": ben_data.get('entity_state'),
                        "total_funding_committed": ben_funded,
                        "total_funding_requested": ben_total,
                        "funding_years": ben_data.get('years', []),
                        "total_frns": ben_data.get('total_frns', 0)
                    })
        
        result = {
            "success": True,
            "total_schools": len(school_bens),
            "total_frns": total_frns,
            "summary": status_counts,
            "schools": schools_data,
            "year_filter": year
        }
        
        # Cache for 6 hours
        set_cached(db, cache_key, result)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch FRN status summary: {str(e)}"
        )


# =============================================================================
# COMPREHENSIVE SCHOOL DATA ENDPOINTS (Budget, Funding History)
# =============================================================================

@router.get("/schools/{ben}/budget")
async def get_school_budget_data(
    ben: str,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive Category 2 budget data for a school.
    
    Returns:
    - C2 budget for current cycle (FY2021-2025 or FY2026-2030)
    - Previous cycle budget if applicable
    - Funded, pending, and available amounts
    - Historical funding data
    """
    # Verify school belongs to consultant
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found in your portfolio"
        )
    
    try:
        # Fetch C2 budget data directly from USAC
        url = 'https://opendata.usac.org/resource/6brt-5pbv.json'
        params = {
            '$limit': 10,
            '$where': f"ben = '{ben}'"
        }
        
        response = requests.get(url, params=params, timeout=30)
        c2_data = response.json() if response.ok else []
        
        # Process budget data by cycle
        budget_cycles = {}
        for record in c2_data:
            cycle = record.get('c2_budget_cycle', 'Unknown')
            budget_cycles[cycle] = {
                "cycle": cycle,
                "entity_name": record.get('billed_entity_name'),
                "state": record.get('state'),
                "applicant_type": record.get('applicant_type'),
                "c2_budget": float(record.get('c2_budget', 0) or 0),
                "funded_amount": float(record.get('funded_c2_budget_amount', 0) or 0),
                "pending_amount": float(record.get('pending_c2_budget_amount', 0) or 0),
                "available_amount": float(record.get('available_c2_budget_amount', 0) or 0),
                "budget_algorithm": record.get('c2_budget_algorithm'),
                "child_entity_count": int(record.get('child_entity_count', 0) or 0),
                "full_time_students": int(record.get('full_time_students', 0) or 0),
                "budget_version": record.get('c2_budget_version'),
            }
        
        # Get current and previous cycles
        current_cycle = budget_cycles.get('FY2026-2030') or budget_cycles.get('FY2021-2025', {})
        previous_cycle = budget_cycles.get('FY2021-2025') if 'FY2026-2030' in budget_cycles else {}
        
        return {
            "success": True,
            "ben": ben,
            "school_name": school.school_name,
            "current_cycle": current_cycle,
            "previous_cycle": previous_cycle,
            "all_cycles": budget_cycles,
            "summary": {
                "total_c2_budget": sum(b.get('c2_budget', 0) for b in budget_cycles.values()),
                "total_funded": sum(b.get('funded_amount', 0) for b in budget_cycles.values()),
                "total_available": sum(b.get('available_amount', 0) for b in budget_cycles.values()),
            }
        }
        
    except Exception as e:
        print(f"Error fetching C2 budget for BEN {ben}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch budget data: {str(e)}"
        )


@router.get("/schools/{ben}/comprehensive")
async def get_comprehensive_school_data(
    ben: str,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive data for a school including:
    - Basic info (name, state, entity type)
    - Category 2 budget (current and previous cycles)
    - Category 1 funding history (last 5 years)
    - Application history by year
    - Status summary
    """
    # Verify school belongs to consultant
    school = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.ben == ben
    ).first()
    
    if not school:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"School with BEN {ben} not found in your portfolio"
        )
    
    try:
        # Fetch Form 471 data for funding history
        url_471 = 'https://opendata.usac.org/resource/srbr-2d59.json'
        params_471 = {
            '$limit': 100,
            '$where': f"ben = '{ben}'",
            '$order': 'funding_year DESC'
        }
        
        response_471 = requests.get(url_471, params=params_471, timeout=30)
        applications = response_471.json() if response_471.ok else []
        
        # Fetch C2 budget data
        url_c2 = 'https://opendata.usac.org/resource/6brt-5pbv.json'
        params_c2 = {
            '$limit': 10,
            '$where': f"ben = '{ben}'"
        }
        
        response_c2 = requests.get(url_c2, params=params_c2, timeout=30)
        c2_data = response_c2.json() if response_c2.ok else []
        
        # Process C2 budget by cycle
        c2_budgets = {}
        for record in c2_data:
            cycle = record.get('c2_budget_cycle', 'Unknown')
            c2_budgets[cycle] = {
                "c2_budget": float(record.get('c2_budget', 0) or 0),
                "funded": float(record.get('funded_c2_budget_amount', 0) or 0),
                "pending": float(record.get('pending_c2_budget_amount', 0) or 0),
                "available": float(record.get('available_c2_budget_amount', 0) or 0),
            }
        
        # Process applications by year and service type
        years_data = {}
        c1_totals = {"funded": 0, "requested": 0}
        c2_totals = {"funded": 0, "requested": 0}
        
        for app in applications:
            year = app.get('funding_year', 'Unknown')
            service_type = (app.get('form_471_service_type_name') or '').lower()
            status_name = app.get('form_471_frn_status_name', 'Unknown')
            committed = float(app.get('funding_commitment_request', 0) or 0)
            requested = float(app.get('original_total_pre_discount_costs', 0) or app.get('total_pre_discount_costs', 0) or 0)
            
            if year not in years_data:
                years_data[year] = {
                    "year": year,
                    "applications": [],
                    "c1_funded": 0,
                    "c1_requested": 0,
                    "c2_funded": 0,
                    "c2_requested": 0,
                    "status_summary": {}
                }
            
            years_data[year]["applications"].append({
                "frn": app.get('funding_request_number'),
                "application_number": app.get('application_number'),
                "service_type": app.get('form_471_service_type_name'),
                "status": status_name,
                "committed_amount": committed,
                "requested_amount": requested,
                "spin_name": app.get('spin_name'),
            })
            
            # Category 1 = Voice, Data Transmission, Internet Access
            # Category 2 = Internal Connections, Basic Maintenance, MIBS
            is_c2 = 'internal' in service_type or 'maintenance' in service_type or 'mibs' in service_type
            
            if is_c2:
                years_data[year]["c2_funded"] += committed
                years_data[year]["c2_requested"] += requested
                if 'funded' in status_name.lower() or 'committed' in status_name.lower():
                    c2_totals["funded"] += committed
                c2_totals["requested"] += requested
            else:
                years_data[year]["c1_funded"] += committed
                years_data[year]["c1_requested"] += requested
                if 'funded' in status_name.lower() or 'committed' in status_name.lower():
                    c1_totals["funded"] += committed
                c1_totals["requested"] += requested
            
            # Track status counts
            status_key = status_name.lower()
            if status_key not in years_data[year]["status_summary"]:
                years_data[year]["status_summary"][status_key] = 0
            years_data[year]["status_summary"][status_key] += 1
        
        # Convert to sorted list
        years_list = sorted(years_data.values(), key=lambda x: str(x["year"]), reverse=True)
        
        # Update school info if we got data
        entity_name = None
        entity_state = None
        if applications:
            latest = applications[0]
            entity_name = latest.get('organization_name')
            entity_state = latest.get('state')
            
            # Update database
            if entity_name and entity_name != school.school_name:
                school.school_name = entity_name
            if entity_state and entity_state != school.state:
                school.state = entity_state
            school.last_synced = datetime.utcnow()
            db.commit()
        
        return {
            "success": True,
            "school": {
                "ben": ben,
                "name": entity_name or school.school_name,
                "state": entity_state or school.state,
                "entity_type": school.entity_type,
            },
            "c2_budget": c2_budgets,
            "c2_budget_summary": {
                "current_cycle": c2_budgets.get('FY2026-2030') or c2_budgets.get('FY2021-2025', {}),
                "previous_cycle": c2_budgets.get('FY2021-2025') if 'FY2026-2030' in c2_budgets else {},
            },
            "funding_totals": {
                "category_1": c1_totals,
                "category_2": c2_totals,
                "lifetime_total": c1_totals["funded"] + c2_totals["funded"],
            },
            "years": years_list[:10],  # Last 10 years
            "applications_count": len(applications),
        }
        
    except Exception as e:
        print(f"Error fetching comprehensive data for BEN {ben}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch comprehensive data: {str(e)}"
        )


# =============================================================================
# NATIONAL INSTITUTION SEARCH ENDPOINT
# =============================================================================

@router.get("/search/institutions")
async def search_institutions(
    query: str = Query(..., description="Search query (name, city, BEN)"),
    state: Optional[str] = Query(None, description="State filter (2-letter code)"),
    limit: int = Query(50, le=200, description="Maximum results"),
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Search for any institution in the United States from USAC data.
    
    This allows consultants to discover and research schools nationwide,
    view their budget data, and potentially add them to their portfolio.
    """
    try:
        # Build search query - search in C2 budget data which has all entities
        url = 'https://opendata.usac.org/resource/6brt-5pbv.json'
        
        # Build WHERE clause for search
        where_parts = []
        
        # Search by name (contains)
        if query:
            # Escape single quotes in query
            safe_query = query.replace("'", "''").upper()
            where_parts.append(f"upper(billed_entity_name) like '%{safe_query}%'")
        
        # Filter by state if provided
        if state:
            where_parts.append(f"state = '{state.upper()}'")
        
        where_clause = ' AND '.join(where_parts) if where_parts else '1=1'
        
        params = {
            '$limit': limit,
            '$where': where_clause,
            '$order': 'billed_entity_name ASC',
            '$select': 'ben, billed_entity_name, city, state, applicant_type, c2_budget_cycle, c2_budget, funded_c2_budget_amount, available_c2_budget_amount, consulting_firm_name_crn'
        }
        
        response = requests.get(url, params=params, timeout=30)
        
        if not response.ok:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"USAC API error: {response.text}"
            )
        
        data = response.json()
        
        # Deduplicate by BEN (may have multiple cycles)
        institutions = {}
        for record in data:
            ben = record.get('ben')
            if ben and ben not in institutions:
                institutions[ben] = {
                    "ben": ben,
                    "name": record.get('billed_entity_name'),
                    "city": record.get('city'),
                    "state": record.get('state'),
                    "entity_type": record.get('applicant_type'),
                    "c2_budget": float(record.get('c2_budget', 0) or 0),
                    "c2_funded": float(record.get('funded_c2_budget_amount', 0) or 0),
                    "c2_available": float(record.get('available_c2_budget_amount', 0) or 0),
                    "has_consultant": bool(record.get('consulting_firm_name_crn')),
                }
            elif ben in institutions:
                # Add to existing budget totals
                institutions[ben]["c2_budget"] += float(record.get('c2_budget', 0) or 0)
                institutions[ben]["c2_funded"] += float(record.get('funded_c2_budget_amount', 0) or 0)
                institutions[ben]["c2_available"] += float(record.get('available_c2_budget_amount', 0) or 0)
        
        results = list(institutions.values())
        
        # Check which ones are already in portfolio
        existing_bens = set(s.ben for s in db.query(ConsultantSchool.ben).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all())
        
        for inst in results:
            inst["in_portfolio"] = inst["ben"] in existing_bens
        
        return {
            "success": True,
            "count": len(results),
            "results": results,
            "query": query,
            "state_filter": state,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error searching institutions: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.get("/search/institutions/{ben}")
async def get_institution_details(
    ben: str,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about any institution by BEN.
    Does not require the school to be in the consultant's portfolio.
    """
    try:
        # Fetch Form 471 data
        url_471 = 'https://opendata.usac.org/resource/srbr-2d59.json'
        params_471 = {
            '$limit': 50,
            '$where': f"ben = '{ben}'",
            '$order': 'funding_year DESC'
        }
        
        response_471 = requests.get(url_471, params=params_471, timeout=30)
        applications = response_471.json() if response_471.ok else []
        
        # Fetch C2 budget data
        url_c2 = 'https://opendata.usac.org/resource/6brt-5pbv.json'
        params_c2 = {
            '$limit': 10,
            '$where': f"ben = '{ben}'"
        }
        
        response_c2 = requests.get(url_c2, params=params_c2, timeout=30)
        c2_data = response_c2.json() if response_c2.ok else []
        
        if not applications and not c2_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No data found for BEN {ben}"
            )
        
        # Get basic info
        entity_info = {}
        if applications:
            latest = applications[0]
            entity_info = {
                "name": latest.get('organization_name'),
                "state": latest.get('state'),
                "entity_type": latest.get('organization_entity_type_name'),
                "contact_name": latest.get('cnct_name'),
                "contact_email": latest.get('cnct_email'),
            }
        elif c2_data:
            record = c2_data[0]
            entity_info = {
                "name": record.get('billed_entity_name'),
                "state": record.get('state'),
                "city": record.get('city'),
                "entity_type": record.get('applicant_type'),
            }
        
        # Process C2 budgets
        c2_budgets = {}
        for record in c2_data:
            cycle = record.get('c2_budget_cycle', 'Unknown')
            c2_budgets[cycle] = {
                "budget": float(record.get('c2_budget', 0) or 0),
                "funded": float(record.get('funded_c2_budget_amount', 0) or 0),
                "pending": float(record.get('pending_c2_budget_amount', 0) or 0),
                "available": float(record.get('available_c2_budget_amount', 0) or 0),
            }
        
        # Process applications by year
        years_summary = {}
        for app in applications:
            year = app.get('funding_year')
            if year not in years_summary:
                years_summary[year] = {
                    "year": year,
                    "frn_count": 0,
                    "total_committed": 0,
                    "statuses": {}
                }
            years_summary[year]["frn_count"] += 1
            years_summary[year]["total_committed"] += float(app.get('funding_commitment_request', 0) or 0)
            
            status = app.get('form_471_frn_status_name', 'Unknown')
            if status not in years_summary[year]["statuses"]:
                years_summary[year]["statuses"][status] = 0
            years_summary[year]["statuses"][status] += 1
        
        # Check if in portfolio
        in_portfolio = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id,
            ConsultantSchool.ben == ben
        ).first() is not None
        
        return {
            "success": True,
            "ben": ben,
            "entity": entity_info,
            "c2_budgets": c2_budgets,
            "years": sorted(years_summary.values(), key=lambda x: str(x["year"]), reverse=True),
            "total_applications": len(applications),
            "in_portfolio": in_portfolio,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching institution details for BEN {ben}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch details: {str(e)}"
        )


# ==================== SERVICE SEARCH ENDPOINT ====================

class ServiceSearchRequest(BaseModel):
    """Service search filters — searches USAC FRN data scoped to consultant's BENs"""
    ben: Optional[str] = None  # Filter by specific BEN from portfolio
    status_filter: Optional[str] = None  # Funded, Denied, Pending
    service_type: Optional[str] = None
    year: Optional[int] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    limit: int = 100


@router.post("/service-search")
async def service_search(
    data: ServiceSearchRequest,
    profile: ConsultantProfile = Depends(get_consultant_profile),
    db: Session = Depends(get_db)
):
    """
    Search for E-Rate funded services across the consultant's managed BENs.
    Similar to the vendor search but scoped to the consultant's school portfolio.
    Uses the FRN Status USAC dataset.
    """
    try:
        # Get the consultant's managed BENs
        managed_schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id
        ).all()
        
        if not managed_schools:
            return {
                "success": True,
                "count": 0,
                "results": [],
                "message": "No schools in your portfolio. Add schools first to search their services."
            }
        
        # Determine which BENs to search
        if data.ben:
            # Verify the requested BEN is in the consultant's portfolio
            ben_list = [data.ben]
            if not any(s.ben == data.ben for s in managed_schools):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"BEN {data.ben} is not in your school portfolio."
                )
        else:
            # Search across all managed BENs
            ben_list = [s.ben for s in managed_schools]
        
        # Build USAC API query
        # FRN Status dataset: qdmp-ygft
        dataset_id = "qdmp-ygft"
        url = f"https://opendata.usac.org/resource/{dataset_id}.json"
        
        # Build the where clause
        where_parts = []
        
        # BEN filter
        if len(ben_list) == 1:
            where_parts.append(f"ben='{ben_list[0]}'")
        else:
            ben_values = "','".join(ben_list)
            where_parts.append(f"ben in ('{ben_values}')")
        
        # Year filter
        if data.year:
            where_parts.append(f"funding_year='{data.year}'")
        
        # Status filter
        if data.status_filter:
            status_map = {
                "funded": "Funded",
                "denied": "Denied",
                "pending": "Pending",
            }
            mapped = status_map.get(data.status_filter.lower(), data.status_filter)
            where_parts.append(f"form_471_frn_status_name='{mapped}'")
        
        # Service type filter
        if data.service_type:
            svc_lower = data.service_type.lower()
            service_type_map = {
                "internal connections": "Internal Connections",
                "basic maintenance": "Basic Maintenance of Internal Connections",
                "managed internal broadband services": "Managed Internal Broadband Services",
                "internet access": "Data Transmission and/or Internet Access",
                "data transmission": "Data Transmission and/or Internet Access",
                "voice": "Voice",
            }
            for key, value in service_type_map.items():
                if key in svc_lower:
                    where_parts.append(f"form_471_service_type_name='{value}'")
                    break
        
        where_clause = " AND ".join(where_parts) if where_parts else "1=1"
        
        params = {
            "$limit": min(data.limit, 500),
            "$where": where_clause,
            "$order": "funding_year DESC",
        }
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        raw_results = response.json()
        
        if not raw_results:
            return {"success": True, "count": 0, "results": []}
        
        # Build a school name lookup from the consultant's portfolio
        school_name_map = {s.ben: s.school_name for s in managed_schools}
        
        # Transform results
        results = []
        for r in raw_results:
            funding_amount = 0
            try:
                funding_amount = float(r.get('funding_commitment_request', 0) or 0)
            except (ValueError, TypeError):
                pass
            
            # Apply amount filters
            if data.min_amount and funding_amount < data.min_amount:
                continue
            if data.max_amount and funding_amount > data.max_amount:
                continue
            
            ben = r.get('ben', '')
            results.append({
                "ben": ben,
                "name": r.get('organization_name', '') or school_name_map.get(ben, ''),
                "state": r.get('state', ''),
                "city": r.get('city', ''),
                "status": r.get('form_471_frn_status_name', ''),
                "funding_amount": funding_amount,
                "service_type": r.get('form_471_service_type_name', ''),
                "funding_year": r.get('funding_year', ''),
                "application_number": r.get('application_number', ''),
                "frn": r.get('funding_request_number', ''),
                "_raw": r,
            })
        
        return {
            "success": True,
            "count": len(results),
            "results": results,
            "bens_searched": len(ben_list),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in consultant service search: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Service search failed: {str(e)}"
        )


@router.delete("/admin/cleanup-orphaned-schools")
async def cleanup_orphaned_schools(
    current_user: User = Depends(require_role("admin", "super")),
    db: Session = Depends(get_db)
):
    """Admin endpoint to remove schools whose source CRN is no longer linked to the account."""
    profile = db.query(ConsultantProfile).filter(ConsultantProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="No consultant profile found")

    # Get all active CRNs for this profile
    active_crns = db.query(ConsultantCRN.crn).filter(
        ConsultantCRN.consultant_profile_id == profile.id
    ).all()
    active_crn_values = {c.crn for c in active_crns}

    # Find schools with a source_crn that's no longer active
    query = db.query(ConsultantSchool).filter(
        ConsultantSchool.consultant_profile_id == profile.id,
        ConsultantSchool.source_crn.isnot(None),
        ConsultantSchool.source_crn != "",
    )
    if active_crn_values:
        query = query.filter(~ConsultantSchool.source_crn.in_(active_crn_values))

    orphaned = query.all()
    count = len(orphaned)
    for school in orphaned:
        db.delete(school)
    db.commit()

    logger.info(f"Cleaned up {count} orphaned schools for user {current_user.id}")
    return {"deleted": count, "message": f"Removed {count} orphaned schools"}
