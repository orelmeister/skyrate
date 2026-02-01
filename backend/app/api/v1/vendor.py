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


@router.get("/spin/{spin}/lookup")
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
            if data.service_type.lower() in ["1", "category 1", "cat1"]:
                filters["form_471_service_type_name"] = "Category 1"
            elif data.service_type.lower() in ["2", "category 2", "cat2"]:
                filters["form_471_service_type_name"] = "Category 2"
        
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
        
        # Save search to history
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
        
        return {
            "success": True,
            "count": len(results),
            "results": results[:data.limit],
            "search_id": search_record.id
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
