"""
Vendor Portal API Endpoints
Handles school search, equipment matching, and lead generation
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import sys
import os

# Add skyrate-ai to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'skyrate-ai'))

from ...core.database import get_db
from ...core.security import get_current_user, require_role
from ...models.user import User
from ...models.vendor import VendorProfile, VendorSearch

router = APIRouter(prefix="/vendor", tags=["Vendor Portal"])


# ==================== SCHEMAS ====================

class VendorProfileCreate(BaseModel):
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    equipment_types: Optional[List[str]] = []
    services_offered: Optional[List[str]] = []
    service_areas: Optional[List[str]] = []
    spin: Optional[str] = None  # Service Provider Identification Number


class SpinValidationRequest(BaseModel):
    spin: str


class SearchRequest(BaseModel):
    year: Optional[int] = None
    state: Optional[str] = None
    status: Optional[str] = None  # Funded, Denied, Pending
    service_type: Optional[str] = None  # Category 1, Category 2
    equipment_keyword: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    limit: int = 100


class SaveSearchRequest(BaseModel):
    search_name: str
    search_params: dict


# ==================== DEPENDENCIES ====================

async def get_vendor_profile(
    current_user: User = Depends(require_role("admin", "vendor")),
    db: Session = Depends(get_db)
) -> VendorProfile:
    """Get or create vendor profile for current user"""
    profile = db.query(VendorProfile).filter(
        VendorProfile.user_id == current_user.id
    ).first()
    
    if not profile:
        profile = VendorProfile(
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
async def get_profile(profile: VendorProfile = Depends(get_vendor_profile)):
    """Get vendor profile"""
    return {"success": True, "profile": profile.to_dict()}


@router.put("/profile")
async def update_profile(
    data: VendorProfileCreate,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Update vendor profile"""
    for field in ['company_name', 'contact_name', 'phone', 'address', 
                  'website', 'equipment_types', 'services_offered', 'service_areas', 'spin']:
        value = getattr(data, field, None)
        if value is not None:
            setattr(profile, field, value)
    
    db.commit()
    db.refresh(profile)
    
    return {"success": True, "profile": profile.to_dict()}


# ==================== SPIN VALIDATION & SERVICED ENTITIES ====================

@router.post("/spin/validate")
async def validate_spin(
    data: SpinValidationRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Validate a SPIN and get service provider information from USAC.
    Returns provider details if valid, error if not found.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.validate_spin(data.spin)
        
        if not result.get('valid'):
            return {
                "success": False,
                "error": result.get('error', 'Invalid SPIN'),
                "valid": False
            }
        
        return {
            "success": True,
            "valid": True,
            "provider": result
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to validate SPIN: {str(e)}"
        )


@router.get("/spin/serviced-entities")
async def get_serviced_entities(
    year: Optional[int] = None,
    limit: int = 500,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get all schools/entities that your company services based on your SPIN.
    Uses invoice disbursement data from USAC to find all entities.
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        summary = client.get_serviced_entities_summary(profile.spin, year)
        
        return {
            "success": True,
            "spin": profile.spin,
            "service_provider_name": summary.get('service_provider_name'),
            "total_entities": summary.get('total_entities', 0),
            "total_authorized": summary.get('total_authorized', 0),
            "funding_years": summary.get('funding_years', []),
            "entities": summary.get('entities', [])
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch serviced entities: {str(e)}"
        )


@router.get("/spin/entity/{ben}")
async def get_entity_detail(
    ben: str,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get detailed year-by-year breakdown for a specific entity you service.
    Shows Category 1 and Category 2 budgets, all services provided, and FRN history.
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_entity_detail(profile.spin, ben)
        
        if not result.get('success'):
            return {
                "success": False,
                "error": result.get('error', 'Failed to fetch entity details')
            }
        
        return {
            "success": True,
            "spin": profile.spin,
            **result
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch entity details: {str(e)}"
        )


# ==================== FORM 471 COMPETITIVE ANALYSIS ====================

class Form471SearchRequest(BaseModel):
    ben: Optional[str] = None
    state: Optional[str] = None
    year: Optional[int] = None
    category: Optional[str] = None  # '1' or '2'
    limit: int = 500


@router.get("/471/entity/{ben}")
async def get_471_by_entity(
    ben: str,
    year: Optional[int] = None,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Get all Form 471 applications for a specific entity (BEN).
    Shows which vendors have won contracts at this school - core competitive intelligence.
    
    This helps vendors:
    - See who their competitors are at target schools
    - Understand what services schools are purchasing
    - Identify opportunities where contracts may be up for renewal
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_471_by_ben(ben, year)
        
        if not result.get('success'):
            return {
                "success": False,
                "error": result.get('error', 'Failed to fetch 471 data')
            }
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 471 data: {str(e)}"
        )


@router.get("/471/state/{state}")
async def get_471_by_state(
    state: str,
    year: Optional[int] = None,
    category: Optional[str] = None,
    limit: int = 500,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Search Form 471 applications by state.
    Useful for finding opportunities in specific markets.
    
    Args:
        state: Two-letter state code (e.g., 'NY', 'CA')
        year: Optional funding year filter
        category: Optional category filter ('1' for Cat1, '2' for Cat2)
        limit: Maximum records (default 500)
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_471_by_state(state, year, category, limit)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 471 data: {str(e)}"
        )


@router.get("/471/competitors")
async def get_competitors(
    year: Optional[int] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Find competing vendors at entities you service.
    Shows which other vendors have won contracts at "your" schools.
    
    Requires SPIN to be configured in vendor profile.
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_471_competitors_for_spin(profile.spin, year)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze competitors: {str(e)}"
        )


@router.post("/471/search")
async def search_471(
    data: Form471SearchRequest,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Search Form 471 applications with multiple filters.
    Flexible endpoint for competitive analysis queries.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        
        # If BEN is specified, search by entity
        if data.ben:
            result = client.get_471_by_ben(data.ben, data.year, data.limit)
        # Otherwise search by state
        elif data.state:
            result = client.get_471_by_state(data.state, data.year, data.category, data.limit)
        else:
            return {
                "success": False,
                "error": "Please specify either a BEN or state to search"
            }
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search 471 data: {str(e)}"
        )


# ==================== FRN STATUS MONITORING (Sprint 2) ====================

@router.get("/frn-status")
async def get_frn_status(
    year: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 500,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get FRN status for all your contracts (filtered by your SPIN).
    This shows the commitment status, disbursement status, and key dates.
    
    Useful for operations team to:
    - Track which FRNs are funded/denied/pending
    - See disbursement status
    - Follow up with clients based on status
    
    Args:
        year: Optional funding year filter
        status: Optional status filter ('Funded', 'Denied', 'Pending')
        limit: Maximum records (default 500)
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_frn_status_by_spin(profile.spin, year, status, limit)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch FRN status: {str(e)}"
        )


@router.get("/frn-status/entity/{ben}")
async def get_entity_frn_status(
    ben: str,
    year: Optional[int] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get detailed FRN status for a specific entity (school).
    Filtered by your SPIN to show only your contracts at this entity.
    
    Args:
        ben: Billed Entity Number
        year: Optional funding year filter
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_entity_frn_summary(profile.spin, ben)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch entity FRN status: {str(e)}"
        )


@router.get("/frn-status/summary")
async def get_frn_status_summary(
    year: Optional[int] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get a summary of FRN status across all your contracts.
    Returns totals for funded, denied, and pending FRNs.
    
    Args:
        year: Optional funding year filter (defaults to all years)
    """
    if not profile.spin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_frn_status_by_spin(profile.spin, year)
        
        if not result.get('success'):
            return result
        
        # Return just the summary without all FRN details
        return {
            'success': True,
            'spin': profile.spin,
            'spin_name': result.get('spin_name'),
            'total_frns': result.get('total_frns', 0),
            'summary': result.get('summary', {}),
            'year_filter': year
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch FRN status summary: {str(e)}"
        )


async def lookup_spin_details(
    spin: str,
    year: Optional[int] = None,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Look up any SPIN to see what entities they service.
    Useful for competitive research or verification.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        
        # First validate the SPIN
        validation = client.validate_spin(spin)
        if not validation.get('valid'):
            return {
                "success": False,
                "error": validation.get('error', 'Invalid SPIN')
            }
        
        # Get serviced entities
        summary = client.get_serviced_entities_summary(spin, year)
        
        return {
            "success": True,
            "provider": validation,
            "total_entities": summary.get('total_entities', 0),
            "total_authorized": summary.get('total_authorized', 0),
            "funding_years": summary.get('funding_years', []),
            "entities": summary.get('entities', [])[:100]  # Limit to first 100 for other SPINs
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to lookup SPIN: {str(e)}"
        )


# ==================== FORM 470 LEAD GENERATION (Sprint 3) ====================

class Form470SearchRequest(BaseModel):
    year: Optional[int] = None
    state: Optional[str] = None
    category: Optional[str] = None  # '1' or '2'
    service_type: Optional[str] = None
    manufacturer: Optional[str] = None
    limit: int = 500


@router.get("/470/leads")
async def get_470_leads(
    year: Optional[int] = None,
    state: Optional[str] = None,
    category: Optional[str] = None,
    service_type: Optional[str] = None,
    manufacturer: Optional[str] = None,
    limit: int = 500,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Get Form 470 postings for lead generation.
    This is the CORE SALES WORKFLOW for vendors - finding schools seeking services.
    
    Key differentiator: Manufacturer filtering - exclusive to SkyRate!
    
    Args:
        year: Optional funding year filter (defaults to current/next year)
        state: Optional two-letter state code (e.g., 'NY', 'CA')
        category: Optional category filter ('1' for Cat1, '2' for Cat2)
        service_type: Optional service type filter
        manufacturer: Optional manufacturer name (partial match - e.g., 'Cisco', 'Meraki')
        limit: Maximum records (default 500)
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_470_leads(
            year=year,
            state=state,
            category=category,
            service_type=service_type,
            manufacturer=manufacturer,
            limit=limit
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 470 leads: {str(e)}"
        )


@router.get("/470/state/{state}")
async def get_470_by_state(
    state: str,
    year: Optional[int] = None,
    category: Optional[str] = None,
    limit: int = 500,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Get Form 470 postings for a specific state.
    Quick way to find opportunities in target markets.
    
    Args:
        state: Two-letter state code (e.g., 'NY', 'CA')
        year: Optional funding year filter
        category: Optional category filter ('1' or '2')
        limit: Maximum records (default 500)
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_470_by_state(state, year, category, limit)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 470 leads for state {state}: {str(e)}"
        )


@router.get("/470/manufacturer/{manufacturer}")
async def get_470_by_manufacturer(
    manufacturer: str,
    year: Optional[int] = None,
    state: Optional[str] = None,
    limit: int = 500,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Get Form 470 postings that mention a specific manufacturer.
    KEY DIFFERENTIATOR: Manufacturer filtering - only available in SkyRate!
    
    Perfect for vendors representing specific product lines:
    - Cisco, Cisco Systems
    - Meraki
    - Aruba, HP Aruba
    - Sonic Wall, SonicWall
    - Fortinet
    - Ubiquiti
    
    Args:
        manufacturer: Manufacturer name (partial match supported)
        year: Optional funding year filter
        state: Optional state filter
        limit: Maximum records (default 500)
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_470_by_manufacturer(manufacturer, year, state, limit)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 470 leads for manufacturer {manufacturer}: {str(e)}"
        )


@router.get("/470/{application_number}")
async def get_470_detail(
    application_number: str,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Get detailed information about a specific Form 470 application.
    Includes all services requested, contact information, and descriptions.
    
    Use this when a vendor wants to see full details before reaching out.
    
    Args:
        application_number: The Form 470 application number
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_470_detail(application_number)
        
        if not result.get('success'):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get('error', 'Form 470 not found')
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 470 details: {str(e)}"
        )


@router.post("/470/search")
async def search_470(
    data: Form470SearchRequest,
    current_user: User = Depends(require_role("admin", "vendor")),
):
    """
    Advanced Form 470 search with multiple filters.
    Flexible endpoint for customized lead generation queries.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        result = client.get_470_leads(
            year=data.year,
            state=data.state,
            category=data.category,
            service_type=data.service_type,
            manufacturer=data.manufacturer,
            limit=data.limit
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search 470 data: {str(e)}"
        )


# ==================== SEARCH ENDPOINTS ====================

@router.post("/search")
async def search_schools(
    data: SearchRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Search for schools/applications matching criteria.
    Great for finding leads - schools that need vendor's products/services.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        filters = {}
        
        # Build filters
        if data.state:
            filters["state"] = data.state.upper()
        
        if data.status:
            status_map = {
                "funded": "Funded",
                "denied": "Denied",
                "pending": "Pending",
            }
            filters["application_status"] = status_map.get(data.status.lower(), data.status)
        
        if data.service_type:
            # Map service type names to E-Rate categories
            # Category 1: Telecommunications, Internet Access, Data Transmission, Voice
            # Category 2: Internal Connections, Basic Maintenance, MIBS
            service_type_lower = data.service_type.lower()
            
            category_1_services = [
                "1", "category 1", "cat1",
                "internet access", "data transmission", "voice",
                "telecommunications"
            ]
            category_2_services = [
                "2", "category 2", "cat2",
                "internal connections", "basic maintenance",
                "managed internal broadband services", "mibs"
            ]
            
            if service_type_lower in category_1_services:
                filters["form_471_service_type_name"] = "Category 1"
            elif service_type_lower in category_2_services:
                filters["form_471_service_type_name"] = "Category 2"
            # If service type doesn't match, don't add filter (search all)
        
        # Fetch data
        df = client.fetch_data(year=data.year, filters=filters, limit=data.limit)
        
        if df.empty:
            return {"success": True, "count": 0, "results": []}
        
        # Apply additional filters
        results = df.to_dict('records')
        
        # Filter by amount if specified
        if data.min_amount:
            results = [r for r in results if float(r.get('original_total_pre_discount_costs', 0) or 0) >= data.min_amount]
        
        if data.max_amount:
            results = [r for r in results if float(r.get('original_total_pre_discount_costs', 0) or 0) <= data.max_amount]
        
        # Filter by equipment keyword (search in service description)
        if data.equipment_keyword:
            keyword = data.equipment_keyword.lower()
            results = [
                r for r in results 
                if keyword in str(r.get('narrative', '')).lower() or
                   keyword in str(r.get('form_471_service_type_name', '')).lower()
            ]
        
        # Save search to history (optional - don't fail if DB issue)
        search_id = None
        try:
            search_record = VendorSearch(
                vendor_profile_id=profile.id,
                search_params={
                    "year": data.year,
                    "state": data.state,
                    "status": data.status,
                    "service_type": data.service_type,
                    "equipment_keyword": data.equipment_keyword,
                },
                results_count=len(results)
            )
            db.add(search_record)
            db.commit()
            search_id = search_record.id
        except Exception as db_error:
            # Log but don't fail the search
            print(f"Warning: Could not save search history: {db_error}")
            db.rollback()
        
        return {
            "success": True,
            "count": len(results),
            "results": results[:data.limit],
            "search_id": search_id
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.get("/search/history")
async def get_search_history(
    limit: int = 20,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Get vendor's recent search history"""
    searches = db.query(VendorSearch).filter(
        VendorSearch.vendor_profile_id == profile.id
    ).order_by(VendorSearch.created_at.desc()).limit(limit).all()
    
    return {
        "success": True,
        "count": len(searches),
        "searches": [s.to_dict() for s in searches]
    }


@router.post("/search/save")
async def save_search(
    data: SaveSearchRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Save a search for quick access later"""
    search_record = VendorSearch(
        vendor_profile_id=profile.id,
        search_name=data.search_name,
        search_params=data.search_params,
        results_count=0
    )
    db.add(search_record)
    db.commit()
    db.refresh(search_record)
    
    return {"success": True, "search": search_record.to_dict()}


# ==================== SCHOOL DETAIL ENDPOINTS ====================

@router.get("/school/{ben}")
async def get_school_detail(
    ben: str,
    year: Optional[int] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific school.
    Useful when vendor wants to learn more about a potential lead.
    """
    try:
        from get_ben_funding_balance import get_funding_balance
        from utils.usac_client import USACDataClient
        
        # Get funding balance
        funding = get_funding_balance(ben, year)
        
        # Get applications
        client = USACDataClient()
        df = client.fetch_data(filters={"ben": ben}, year=year, limit=100)
        applications = df.to_dict('records') if not df.empty else []
        
        return {
            "success": True,
            "school": {
                "ben": ben,
                "entity_info": funding.get("entity_info"),
                "funding_summary": funding.get("e_rate_funding"),
                "applications": applications
            }
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch school details: {str(e)}"
        )


@router.get("/school/{ben}/denial-summary")
async def get_denial_summary(
    ben: str,
    year: Optional[int] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get AI-generated summary of why a school's applications were denied.
    Helps vendors understand what the school needs.
    """
    try:
        from utils.usac_client import USACDataClient
        from utils.ai_models import AIModelManager
        from utils.denial_analyzer import DenialAnalyzer
        
        client = USACDataClient()
        
        # Fetch denied applications
        filters = {"ben": ben, "application_status": "Denied"}
        df = client.fetch_data(filters=filters, year=year, limit=50)
        
        if df.empty:
            return {
                "success": True,
                "message": "No denied applications found for this school",
                "denials": [],
                "summary": None
            }
        
        denials = df.to_dict('records')
        
        # Initialize AI and analyze
        ai_manager = AIModelManager()
        denial_analyzer = DenialAnalyzer(client)
        
        # Parse denial reasons
        parsed_denials = []
        for denial in denials:
            fcdl = denial.get('fcdl_comment_from_usac', '')
            if fcdl:
                reasons = denial_analyzer.parse_fcdl_comments(fcdl)
                parsed_denials.append({
                    "frn": denial.get("funding_request_number"),
                    "amount": denial.get("original_total_pre_discount_costs"),
                    "service_type": denial.get("form_471_service_type_name"),
                    "reasons": [r.to_dict() for r in reasons]
                })
        
        # Generate AI summary
        summary_prompt = f"""Summarize the denial reasons for this school's E-Rate applications in a way that helps a vendor understand what products or services the school needs:

School: {denials[0].get('organization_name', 'Unknown')}
State: {denials[0].get('state', 'Unknown')}
Denial Details: {parsed_denials}

Provide:
1. Brief summary of what the school was trying to purchase
2. Why applications were denied
3. What the school likely still needs
4. How a vendor could help"""

        summary = ai_manager.deep_analysis(str(parsed_denials), summary_prompt)
        
        return {
            "success": True,
            "school_name": denials[0].get('organization_name'),
            "denials": parsed_denials,
            "ai_summary": summary
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate summary: {str(e)}"
        )


# ==================== EQUIPMENT TYPES ====================

@router.get("/equipment-types")
async def get_equipment_types():
    """
    Get list of common equipment types for E-Rate.
    Useful for vendor profile setup and search filtering.
    """
    equipment_types = {
        "category_1": {
            "name": "Category 1 - Telecommunications",
            "types": [
                "Internet Access",
                "Data Transmission Services",
                "Voice Services",
                "Fiber Connectivity",
                "Wireless Internet",
                "Leased Lit Fiber",
                "Leased Dark Fiber",
            ]
        },
        "category_2": {
            "name": "Category 2 - Internal Connections",
            "types": [
                "Routers",
                "Switches",
                "Wireless Access Points",
                "Wireless Controllers",
                "Firewalls",
                "UPS/Battery Backup",
                "Cabling",
                "Racks",
                "Network Management Software",
                "Caching Solutions",
            ]
        }
    }
    
    return {"success": True, "equipment_types": equipment_types}


# ==================== LEAD EXPORT ====================

@router.post("/export-leads")
async def export_leads(
    search_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Export search results as leads (returns data for CSV download).
    Marks the search as exported for tracking.
    """
    search = db.query(VendorSearch).filter(
        VendorSearch.id == search_id,
        VendorSearch.vendor_profile_id == profile.id
    ).first()
    
    if not search:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Search not found"
        )
    
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        params = search.search_params
        
        filters = {}
        if params.get("state"):
            filters["state"] = params["state"]
        if params.get("status"):
            filters["application_status"] = params["status"]
        
        df = client.fetch_data(
            year=params.get("year"),
            filters=filters,
            limit=1000
        )
        
        if df.empty:
            return {"success": True, "leads": [], "count": 0}
        
        # Select relevant columns for leads
        lead_columns = [
            'organization_name', 'ben', 'state', 'city',
            'application_number', 'funding_request_number',
            'form_471_service_type_name', 'original_total_pre_discount_costs',
            'form_471_frn_status_name'
        ]
        
        available_cols = [c for c in lead_columns if c in df.columns]
        leads_df = df[available_cols]
        leads = leads_df.to_dict('records')
        
        # Update search record
        search.exported = datetime.utcnow()
        db.commit()
        
        return {
            "success": True,
            "count": len(leads),
            "leads": leads,
            "columns": available_cols
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export failed: {str(e)}"
        )


# ==================== SAVED LEADS MANAGEMENT ====================

class SaveLeadRequest(BaseModel):
    form_type: str  # '470' or '471'
    application_number: str
    ben: str
    entity_name: Optional[str] = None
    entity_type: Optional[str] = None
    entity_state: Optional[str] = None
    entity_city: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    funding_year: Optional[int] = None
    categories: Optional[List[str]] = []
    services: Optional[List[str]] = []
    manufacturers: Optional[List[str]] = []


class UpdateLeadStatusRequest(BaseModel):
    lead_status: Optional[str] = None
    notes: Optional[str] = None


class EnrichLeadRequest(BaseModel):
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    company_domain: Optional[str] = None
    force_refresh: bool = False  # If True, bypass cache and fetch fresh data


class ExportLeadsRequest(BaseModel):
    lead_ids: Optional[List[int]] = None
    lead_status: Optional[str] = None


@router.get("/saved-leads")
async def get_saved_leads(
    lead_status: Optional[str] = None,
    form_type: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Get all saved leads for the vendor.
    
    Args:
        lead_status: Filter by status ('new', 'contacted', 'qualified', 'won', 'lost')
        form_type: Filter by form type ('470' or '471')
        state: Filter by entity state
        limit: Maximum records to return (default 100)
        offset: Records to skip for pagination
    """
    from ...models.vendor import SavedLead
    
    query = db.query(SavedLead).filter(SavedLead.vendor_profile_id == profile.id)
    
    if lead_status:
        query = query.filter(SavedLead.lead_status == lead_status)
    if form_type:
        query = query.filter(SavedLead.form_type == form_type)
    if state:
        query = query.filter(SavedLead.entity_state == state)
    
    total = query.count()
    leads = query.order_by(SavedLead.created_at.desc()).offset(offset).limit(limit).all()
    
    return {
        "success": True,
        "total": total,
        "leads": [lead.to_dict() for lead in leads],
        "limit": limit,
        "offset": offset
    }


@router.post("/saved-leads")
async def save_lead(
    data: SaveLeadRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Save a lead for follow-up.
    
    This stores the lead in the vendor's saved leads list for tracking and enrichment.
    """
    from ...models.vendor import SavedLead
    
    # Check if lead already saved
    existing = db.query(SavedLead).filter(
        SavedLead.vendor_profile_id == profile.id,
        SavedLead.form_type == data.form_type,
        SavedLead.application_number == data.application_number
    ).first()
    
    if existing:
        return {
            "success": False,
            "error": "Lead already saved",
            "lead": existing.to_dict()
        }
    
    # Create new saved lead
    lead = SavedLead(
        vendor_profile_id=profile.id,
        form_type=data.form_type,
        application_number=data.application_number,
        ben=data.ben,
        entity_name=data.entity_name,
        entity_type=data.entity_type,
        entity_state=data.entity_state,
        entity_city=data.entity_city,
        contact_name=data.contact_name,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        funding_year=data.funding_year,
        categories=data.categories or [],
        services=data.services or [],
        manufacturers=data.manufacturers or [],
        lead_status='new'
    )
    
    db.add(lead)
    db.commit()
    db.refresh(lead)
    
    return {
        "success": True,
        "lead": lead.to_dict()
    }


@router.get("/saved-leads/{lead_id}")
async def get_saved_lead(
    lead_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Get a specific saved lead by ID."""
    from ...models.vendor import SavedLead
    
    lead = db.query(SavedLead).filter(
        SavedLead.id == lead_id,
        SavedLead.vendor_profile_id == profile.id
    ).first()
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved lead not found"
        )
    
    return {
        "success": True,
        "lead": lead.to_dict()
    }


@router.put("/saved-leads/{lead_id}")
async def update_saved_lead(
    lead_id: int,
    data: UpdateLeadStatusRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Update a saved lead's status or notes."""
    from ...models.vendor import SavedLead
    
    lead = db.query(SavedLead).filter(
        SavedLead.id == lead_id,
        SavedLead.vendor_profile_id == profile.id
    ).first()
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved lead not found"
        )
    
    if data.lead_status is not None:
        lead.lead_status = data.lead_status
    if data.notes is not None:
        lead.notes = data.notes
    
    db.commit()
    db.refresh(lead)
    
    return {
        "success": True,
        "lead": lead.to_dict()
    }


@router.delete("/saved-leads/{lead_id}")
async def delete_saved_lead(
    lead_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Remove a lead from saved leads."""
    from ...models.vendor import SavedLead
    
    lead = db.query(SavedLead).filter(
        SavedLead.id == lead_id,
        SavedLead.vendor_profile_id == profile.id
    ).first()
    
    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved lead not found"
        )
    
    db.delete(lead)
    db.commit()
    
    return {
        "success": True,
        "message": "Lead removed from saved leads"
    }


@router.post("/saved-leads/{lead_id}/enrich")
async def enrich_saved_lead(
    lead_id: int,
    data: EnrichLeadRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Enrich a saved lead with additional contact information.
    
    Uses Hunter.io API to find:
    - LinkedIn profile for the contact
    - Additional contacts at the organization
    - Verified email information
    
    CACHING: Results are cached by domain. Multiple vendors looking at 
    the same organization will get cached results (no extra credits used).
    
    Force refresh is only allowed when cache is expired (90+ days old).
    """
    import logging
    logger = logging.getLogger(__name__)
    
    from ...models.vendor import SavedLead, OrganizationEnrichmentCache
    from ...services.enrichment_service import EnrichmentService
    
    logger.info(f"Enriching lead {lead_id} for vendor profile {profile.id}")
    logger.info(f"Request data: email={data.contact_email}, name={data.contact_name}, domain={data.company_domain}")
    
    lead = db.query(SavedLead).filter(
        SavedLead.id == lead_id,
        SavedLead.vendor_profile_id == profile.id
    ).first()
    
    if not lead:
        logger.error(f"Lead {lead_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved lead not found"
        )
    
    # Use provided data or fall back to saved data
    email = data.contact_email or lead.contact_email
    name = data.contact_name or lead.contact_name
    domain = data.company_domain
    
    # If no domain provided, try to extract from email
    if not domain and email and '@' in email:
        domain = email.split('@')[1]
    
    logger.info(f"Using: email={email}, name={name}, domain={domain}")
    
    if not domain:
        logger.warning("No domain available for enrichment")
        return {
            "success": False,
            "error": "No domain available for enrichment. Provide an email or domain."
        }
    
    # Check if force_refresh is allowed (only when cache is expired)
    force_refresh = data.force_refresh if hasattr(data, 'force_refresh') else False
    if force_refresh:
        # Check cache age - only allow force refresh if expired (90+ days)
        cache_entry = db.query(OrganizationEnrichmentCache).filter(
            OrganizationEnrichmentCache.domain == domain.lower()
        ).first()
        
        if cache_entry and not cache_entry.is_expired:
            # Cache is still valid - don't allow force refresh
            cache_age_days = (datetime.utcnow() - cache_entry.created_at).days if cache_entry.created_at else 0
            days_until_refresh = 90 - cache_age_days
            logger.warning(f"Force refresh rejected - cache is only {cache_age_days} days old for domain: {domain}")
            return {
                "success": False,
                "error": f"Cannot refresh yet. Data is only {cache_age_days} days old. You can refresh in {days_until_refresh} days.",
                "cache_age_days": cache_age_days,
                "days_until_refresh": days_until_refresh
            }
    
    try:
        enrichment_service = EnrichmentService()
        logger.info(f"Enriching with cache for domain: {domain}")
        
        # Use cached enrichment - checks DB first before calling API
        enrichment_result = await enrichment_service.enrich_contact_with_cache(
            db=db,
            email=email,
            name=name,
            domain=domain,
            ben=lead.ben,
            organization_name=lead.entity_name,
            force_refresh=force_refresh
        )
        
        # Log cache status
        if enrichment_result.get('from_cache'):
            logger.info(f"Served from CACHE for domain: {domain} (age: {enrichment_result.get('cache_age_days', 0)} days, credits: 0)")
        else:
            logger.info(f"Fetched FRESH data for domain: {domain} (credits used: {enrichment_result.get('credits_used', 0)})")
        
        # Update lead with enriched data
        lead.enriched_data = enrichment_result
        lead.enrichment_date = datetime.utcnow()
        
        # Update contact info if we got better data
        if enrichment_result.get('person', {}).get('linkedin'):
            existing_enriched = lead.enriched_data or {}
            existing_enriched['linkedin_url'] = enrichment_result['person']['linkedin']
            lead.enriched_data = existing_enriched
        
        db.commit()
        db.refresh(lead)
        
        logger.info(f"Enrichment complete for lead {lead_id}")
        
        return {
            "success": True,
            "lead": lead.to_dict(),
            "enrichment": enrichment_result
        }
        
    except Exception as e:
        logger.error(f"Enrichment failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": f"Enrichment failed: {str(e)}",
            "lead": lead.to_dict()
        }


@router.get("/saved-leads/check/{form_type}/{application_number}")
async def check_lead_saved(
    form_type: str,
    application_number: str,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Check if a lead is already saved."""
    from ...models.vendor import SavedLead
    
    existing = db.query(SavedLead).filter(
        SavedLead.vendor_profile_id == profile.id,
        SavedLead.form_type == form_type,
        SavedLead.application_number == application_number
    ).first()
    
    return {
        "success": True,
        "is_saved": existing is not None,
        "lead": existing.to_dict() if existing else None
    }


@router.post("/saved-leads/export")
async def export_saved_leads(
    request: ExportLeadsRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Export saved leads as CSV-ready data.
    
    Args:
        request: ExportLeadsRequest with optional lead_ids or lead_status filter
    """
    from ...models.vendor import SavedLead
    
    query = db.query(SavedLead).filter(SavedLead.vendor_profile_id == profile.id)
    
    if request.lead_ids:
        query = query.filter(SavedLead.id.in_(request.lead_ids))
    elif request.lead_status:
        query = query.filter(SavedLead.lead_status == request.lead_status)
    
    leads = query.order_by(SavedLead.created_at.desc()).all()
    
    # Format for CSV export - one row per contact with all lead info repeated
    export_data = []
    
    for lead in leads:
        enriched = lead.enriched_data or {}
        
        # Base lead data that will be repeated for each contact
        base_data = {
            "Form Type": lead.form_type,
            "Application #": lead.application_number,
            "BEN": lead.ben,
            "Entity Name": lead.entity_name,
            "Entity Type": lead.entity_type,
            "State": lead.entity_state,
            "City": lead.entity_city,
            "Status": lead.lead_status,
            "Funding Year": lead.funding_year,
            "Categories": ", ".join(lead.categories) if lead.categories else "",
            "Notes": lead.notes or "",
            "Saved Date": lead.created_at.strftime("%Y-%m-%d") if lead.created_at else "",
            "LinkedIn": enriched.get('linkedin_url', ''),
        }
        
        # First row: Primary contact (from Form 470 - has phone number)
        primary_row = base_data.copy()
        primary_row["Contact Name"] = lead.contact_name or ""
        primary_row["Contact Email"] = lead.contact_email or ""
        primary_row["Contact Phone"] = lead.contact_phone or ""
        export_data.append(primary_row)
        
        # Additional rows: Enriched contacts (no phone numbers available)
        additional_contacts = enriched.get('additional_contacts', [])
        for contact in additional_contacts:
            name = contact.get('name', '').strip()
            email = contact.get('email', '').strip()
            
            # Skip if same as primary contact
            if email and email.lower() == (lead.contact_email or '').lower():
                continue
            
            contact_row = base_data.copy()
            contact_row["Contact Name"] = name
            contact_row["Contact Email"] = email
            contact_row["Contact Phone"] = ""  # No phone for enriched contacts
            export_data.append(contact_row)
    
    # Define column order with Contact fields in the right position
    columns = [
        "Form Type", "Application #", "BEN", "Entity Name", "Entity Type",
        "State", "City", "Contact Name", "Contact Email", "Contact Phone",
        "Status", "Funding Year", "Categories", "Notes", "Saved Date", "LinkedIn"
    ]
    
    return {
        "success": True,
        "count": len(export_data),
        "data": export_data,
        "columns": columns
    }



# ===========================================
# ENRICHMENT CACHE ENDPOINTS
# ===========================================

@router.get("/enrichment-cache/stats")
async def get_enrichment_cache_stats(
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Get statistics about the enrichment cache.
    Shows how many organizations are cached and credits saved.
    """
    from sqlalchemy import func
    from ...models.vendor import OrganizationEnrichmentCache
    
    total_cached = db.query(func.count(OrganizationEnrichmentCache.id)).scalar() or 0
    total_credits_used = db.query(func.sum(OrganizationEnrichmentCache.credits_used)).scalar() or 0
    total_access_count = db.query(func.sum(OrganizationEnrichmentCache.access_count)).scalar() or 0
    
    # Credits saved = total_access_count - total_cached (since each after the first is "free")
    credits_saved = max(0, (total_access_count or 0) - (total_cached or 0))
    
    # Most accessed organizations
    top_orgs = db.query(OrganizationEnrichmentCache).order_by(
        OrganizationEnrichmentCache.access_count.desc()
    ).limit(10).all()
    
    # Expired entries
    expired_count = db.query(func.count(OrganizationEnrichmentCache.id)).filter(
        OrganizationEnrichmentCache.expires_at < datetime.utcnow()
    ).scalar() or 0
    
    return {
        "success": True,
        "stats": {
            "total_organizations_cached": total_cached,
            "total_api_credits_used": total_credits_used,
            "total_cache_hits": total_access_count,
            "estimated_credits_saved": credits_saved,
            "expired_entries": expired_count,
        },
        "top_accessed_organizations": [
            {
                "domain": org.domain,
                "organization_name": org.organization_name,
                "access_count": org.access_count,
                "cached_since": org.created_at.isoformat() if org.created_at else None,
            }
            for org in top_orgs
        ]
    }


@router.get("/enrichment-cache/lookup/{domain}")
async def lookup_enrichment_cache(
    domain: str,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Look up cached enrichment data for a specific domain.
    Useful for checking if data exists before enriching.
    """
    from ...models.vendor import OrganizationEnrichmentCache
    
    cache_entry = db.query(OrganizationEnrichmentCache).filter(
        OrganizationEnrichmentCache.domain == domain.lower()
    ).first()
    
    if not cache_entry:
        return {
            "success": True,
            "cached": False,
            "domain": domain,
            "message": "No cached data for this domain"
        }
    
    return {
        "success": True,
        "cached": True,
        "is_expired": cache_entry.is_expired,
        "is_stale": cache_entry.is_stale,
        "data": cache_entry.to_dict()
    }
