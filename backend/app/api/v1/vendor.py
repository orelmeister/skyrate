"""
Vendor Portal API Endpoints
Handles school search, equipment matching, and lead generation
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
from urllib.parse import urlparse, unquote
import sys
import os
import re
import threading
import uuid as uuid_mod

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
    page: int = 1
    page_size: Optional[int] = None


class SaveSearchRequest(BaseModel):
    search_name: str
    search_params: dict


# ==================== DEPENDENCIES ====================

async def get_vendor_profile(
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="spin_validate",
            params={"spin": data.spin},
            ttl_hours=24,
            fetch_fn=lambda: client.validate_spin(data.spin),
        )
        
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


class ReplaceSpinRequest(BaseModel):
    new_spin: str


@router.post("/profile/replace-spin")
async def replace_spin(
    data: ReplaceSpinRequest,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Replace the vendor SPIN for demo/test accounts.

    Verifies the new SPIN with USAC, updates the profile, and triggers
    a background data rebuild.
    """
    from ...services.demo_identity_service import swap_demo_identity

    result = swap_demo_identity(
        db=db,
        user=current_user,
        kind="spin",
        new_id=data.new_spin,
        background_tasks=background_tasks,
    )
    return {"success": True, **result}


@router.get("/spin/serviced-entities")
async def get_serviced_entities(
    year: Optional[int] = None,
    limit: int = 500,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
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
        from app.services.cache_service import get_cached, set_cached, make_cache_key
        
        # Check cache first
        cache_key = make_cache_key("vendor_entities", spin=profile.spin, year=year)
        cached = get_cached(db, cache_key)
        if cached:
            return cached
        
        client = USACDataClient()
        summary = client.get_serviced_entities_summary(profile.spin, year)
        
        result = {
            "success": True,
            "spin": profile.spin,
            "service_provider_name": summary.get('service_provider_name'),
            "total_entities": summary.get('total_entities', 0),
            "total_authorized": summary.get('total_authorized', 0),
            "funding_years": summary.get('funding_years', []),
            "entities": summary.get('entities', [])
        }
        
        # Cache for 6 hours
        set_cached(db, cache_key, result)
        
        return result
        
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="spin_entity_detail",
            params={"spin": profile.spin, "ben": ben},
            ttl_hours=6,
            fetch_fn=lambda: client.get_entity_detail(profile.spin, ben),
        )
        
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
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="471_by_ben",
            params={"ben": ben, "year": year},
            ttl_hours=24,
            fetch_fn=lambda: client.get_471_by_ben(ben, year),
        )
        
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
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="471_by_state",
            params={"state": state, "year": year, "category": category, "limit": limit},
            ttl_hours=6,
            fetch_fn=lambda: client.get_471_by_state(state, year, category, limit),
        )
        
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="471_competitors",
            params={"spin": profile.spin, "year": year},
            ttl_hours=6,
            fetch_fn=lambda: client.get_471_competitors_for_spin(profile.spin, year),
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze competitors: {str(e)}"
        )


@router.post("/471/search")
async def search_471(
    data: Form471SearchRequest,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
):
    """
    Search Form 471 applications with multiple filters.
    Flexible endpoint for competitive analysis queries.
    """
    try:
        from utils.usac_client import USACDataClient
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        
        # If BEN is specified, search by entity
        if data.ben:
            result = get_or_cache(
                namespace="471_by_ben",
                params={"ben": data.ben, "year": data.year, "limit": data.limit},
                ttl_hours=24,
                fetch_fn=lambda: client.get_471_by_ben(data.ben, data.year, data.limit),
            )
        # Otherwise search by state
        elif data.state:
            result = get_or_cache(
                namespace="471_by_state",
                params={"state": data.state, "year": data.year, "category": data.category, "limit": data.limit},
                ttl_hours=6,
                fetch_fn=lambda: client.get_471_by_state(data.state, data.year, data.category, data.limit),
            )
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
    pending_reason: Optional[str] = None,
    limit: int = 500,
    ben: Optional[str] = None,
    spin_search: Optional[str] = None,
    crn: Optional[str] = None,
    global_view: Optional[bool] = False,
    profile: VendorProfile = Depends(get_vendor_profile),
    current_user: User = Depends(require_role("admin", "vendor", "super")),
    db: Session = Depends(get_db),
):
    """
    Get FRN status for all your contracts (filtered by your SPIN),
    or look up any BEN's FRN status (super/admin can query any BEN),
    or look up FRNs by SPIN name/number or contract number (CRN).

    Args:
        year: Optional funding year filter
        status: Optional status filter ('Funded', 'Denied', 'Pending')
        pending_reason: Optional pending reason filter (partial match)
        limit: Maximum records (default 500)
        ben: Optional BEN to look up directly (bypasses SPIN filter)
        spin_search: Optional SPIN name/number to search across admin_frn_snapshots
            (partial match on the `spin` column). Privileged-only unless global_view=True.
        crn: Optional contract number to search across admin_frn_snapshots
            (partial match on `contract_number`). Privileged-only unless global_view=True.
        global_view: If True, bypasses SPIN locks to view all public FRNs globally (demo mode).
    """
    is_privileged = current_user.role in ("super", "admin")

    # Direct BEN lookup
    if ben:
        try:
            from utils.usac_client import USACDataClient
            from app.services.cache_service import get_cached, set_cached, make_cache_key

            client = USACDataClient()
            cache_key = make_cache_key("vendor_frn_ben", ben=ben, year=year)
            cached = get_cached(db, cache_key)
            if cached:
                return cached

            result = client.get_frn_status_by_ben(ben, year)
            set_cached(db, cache_key, result, ttl_hours=1)
            return result
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch FRN status for BEN {ben}: {str(e)}"
            )

    # SPIN-name/CRN search against local admin_frn_snapshots
    # (mirrors consultant.py /frn-status spin/crn filters). Privileged or Global-view.
    if (spin_search or crn) and (is_privileged or global_view):
        try:
            from ...models.admin_frn_snapshot import AdminFRNSnapshot
            from sqlalchemy import or_ as _or
            from datetime import datetime as _dt

            q = db.query(AdminFRNSnapshot)
            if spin_search:
                _ss = f"%{spin_search.strip()}%"
                q = q.filter(
                    _or(
                        AdminFRNSnapshot.spin.ilike(_ss),
                        AdminFRNSnapshot.spin_name.ilike(_ss),
                    )
                )
            if crn:
                q = q.filter(AdminFRNSnapshot.contract_number.ilike(f"%{crn.strip()}%"))
            if year is not None:
                q = q.filter(AdminFRNSnapshot.funding_year == str(year))
            if status:
                q = q.filter(AdminFRNSnapshot.status.ilike(f"%{status}%"))
            if pending_reason:
                q = q.filter(AdminFRNSnapshot.pending_reason.ilike(f"%{pending_reason}%"))
            rows = q.order_by(AdminFRNSnapshot.last_refreshed.desc()).limit(limit).all()

            # If no local hits and a SPIN was searched, try live USAC fallback so
            # un-cached SPINs still return data (matches the BEN-direct flow).
            if not rows and spin_search:
                try:
                    from utils.usac_client import USACDataClient
                    from ...services.frn_upsert import upsert_frn_snapshots, build_rec_from_usac_frn
                    client = USACDataClient()
                    live_result = client.get_frn_status_by_spin(
                        spin_search.strip(), year, status, pending_reason, limit
                    )
                    if live_result and live_result.get("success"):
                        live_frns = live_result.get("frns", []) or []
                        if live_frns:
                            try:
                                records = [
                                    build_rec_from_usac_frn(
                                        f,
                                        ben=f.get("ben", ""),
                                        entity_name=f.get("entity_name", ""),
                                        user_id=current_user.id,
                                        user_email=current_user.email,
                                        source="vendor",
                                    )
                                    for f in live_frns
                                ]
                                upsert_frn_snapshots(
                                    db, records,
                                    scope_type="spin", scope_value=spin_search.strip(),
                                    queue_status_changes=False,
                                )
                                db.expire_all()
                            except Exception as _upsert_err:
                                import logging as _lg
                                _lg.getLogger(__name__).warning(
                                    f"[vendor.frn-status spin_search={spin_search}] cache writeback failed: {_upsert_err}"
                                )
                            # Re-run local query against the freshly upserted rows
                            _ss2 = f"%{spin_search.strip()}%"
                            q2 = db.query(AdminFRNSnapshot).filter(
                                _or(
                                    AdminFRNSnapshot.spin.ilike(_ss2),
                                    AdminFRNSnapshot.spin_name.ilike(_ss2),
                                )
                            )
                            if year is not None:
                                q2 = q2.filter(AdminFRNSnapshot.funding_year == str(year))
                            if status:
                                q2 = q2.filter(AdminFRNSnapshot.status.ilike(f"%{status}%"))
                            if pending_reason:
                                q2 = q2.filter(AdminFRNSnapshot.pending_reason.ilike(f"%{pending_reason}%"))
                            rows = q2.order_by(AdminFRNSnapshot.last_refreshed.desc()).limit(limit).all()
                except Exception as _live_err:
                    import logging as _lg
                    _lg.getLogger(__name__).warning(
                        f"[vendor.frn-status spin_search={spin_search}] live USAC fetch failed: {_live_err}"
                    )

            # Build response in the same shape the frontend expects (mirrors
            # USACDataClient.get_frn_status_by_spin output: success/frns/summary).
            funded_count = funded_amount = 0
            denied_count = denied_amount = 0
            pending_count = pending_amount = 0
            frns_out = []
            for r in rows:
                amount = float(r.amount_requested or 0)
                disbursed = float(r.amount_committed or 0)
                status_text = (r.status or "").lower()
                if "funded" in status_text or "committed" in status_text:
                    funded_count += 1
                    funded_amount += amount
                elif "denied" in status_text:
                    denied_count += 1
                    denied_amount += amount
                else:
                    pending_count += 1
                    pending_amount += amount
                frns_out.append({
                    "frn": r.frn,
                    "ben": r.ben,
                    "entity_name": r.organization_name or "",
                    "funding_year": r.funding_year,
                    "status": r.status,
                    "pending_reason": r.pending_reason or "",
                    "commitment_amount": amount,
                    "disbursed_amount": disbursed,
                    "service_type": r.service_type or "",
                    "fcdl_date": r.fcdl_date or "",
                    "spin_name": getattr(r, "spin", None) or "",
                    "contract_number": getattr(r, "contract_number", None) or "",
                })

            return {
                "success": True,
                "from_cache": True,
                "source": "local_db",
                "spin_search": spin_search,
                "crn": crn,
                "total_frns": len(frns_out),
                "frns": frns_out,
                "summary": {
                    "funded": {"count": funded_count, "amount": funded_amount},
                    "denied": {"count": denied_count, "amount": denied_amount},
                    "pending": {"count": pending_count, "amount": pending_amount},
                },
                "last_refreshed": _dt.utcnow().isoformat(),
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to search by SPIN/CRN: {str(e)}"
            )

    if global_view:
        # Regular global view: query all AdminFRNSnapshot rows in our DB!
        try:
            from ...models.admin_frn_snapshot import AdminFRNSnapshot
            from datetime import datetime as _dt

            q = db.query(AdminFRNSnapshot)
            if year is not None:
                q = q.filter(AdminFRNSnapshot.funding_year == str(year))
            if status:
                q = q.filter(AdminFRNSnapshot.status.ilike(f"%{status}%"))
            if pending_reason:
                q = q.filter(AdminFRNSnapshot.pending_reason.ilike(f"%{pending_reason}%"))
            
            rows = q.order_by(AdminFRNSnapshot.last_refreshed.desc()).limit(limit).all()
            
            # Aggregate and format rows in the identical shape expected by the frontend
            funded_count = funded_amount = 0
            denied_count = denied_amount = 0
            pending_count = pending_amount = 0
            frns_out = []
            for r in rows:
                amount = float(r.amount_requested or 0)
                disbursed = float(r.amount_committed or 0)
                status_text = (r.status or "").lower()
                if "funded" in status_text or "committed" in status_text:
                    funded_count += 1
                    funded_amount += amount
                elif "denied" in status_text:
                    denied_count += 1
                    denied_amount += amount
                else:
                    pending_count += 1
                    pending_amount += amount
                frns_out.append({
                    "frn": r.frn,
                    "ben": r.ben,
                    "entity_name": r.organization_name or "",
                    "funding_year": r.funding_year,
                    "status": r.status,
                    "pending_reason": r.pending_reason or "",
                    "commitment_amount": amount,
                    "disbursed_amount": disbursed,
                    "service_type": r.service_type or "",
                    "fcdl_date": r.fcdl_date or "",
                    "spin_name": getattr(r, "spin", None) or "",
                    "contract_number": getattr(r, "contract_number", None) or "",
                })

            return {
                "success": True,
                "from_cache": True,
                "source": "local_db",
                "global_view": True,
                "total_frns": len(frns_out),
                "frns": frns_out,
                "summary": {
                    "funded": {"count": funded_count, "amount": funded_amount},
                    "denied": {"count": denied_count, "amount": denied_amount},
                    "pending": {"count": pending_count, "amount": pending_amount},
                },
                "last_refreshed": _dt.utcnow().isoformat(),
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch global FRN status: {str(e)}"
            )

    if not profile or not profile.spin:
        raise HTTPException(
            status_code=400,
            detail="No SPIN configured in your profile. Please add your SPIN in settings first."
        )
    
    try:
        from utils.usac_client import USACDataClient
        from app.services.cache_service import get_cached, set_cached, make_cache_key
        from datetime import datetime as _dt
        
        # Check cache first
        cache_key = make_cache_key("vendor_frn", spin=profile.spin, year=year, status=status, pending_reason=pending_reason)
        cached = get_cached(db, cache_key)
        if cached:
            # Ensure last_refreshed is present for frontend display
            if isinstance(cached, dict) and "last_refreshed" not in cached:
                cached["last_refreshed"] = _dt.utcnow().isoformat()
            return cached
        
        client = USACDataClient()
        result = client.get_frn_status_by_spin(profile.spin, year, status, pending_reason, limit)
        
        # Tag with fetch timestamp
        if isinstance(result, dict):
            result["last_refreshed"] = _dt.utcnow().isoformat()

        # Write-back to unified admin_frn_snapshots cache via shared upsert helper
        # so vendor rows stay populated and any cache-based reads see fresh data.
        try:
            if isinstance(result, dict) and result.get("success") and result.get("frns"):
                from app.services.frn_upsert import upsert_frn_snapshots, build_rec_from_usac_frn
                records = [
                    build_rec_from_usac_frn(
                        frn,
                        ben=frn.get("ben", ""),
                        entity_name=frn.get("entity_name", ""),
                        user_id=current_user.id,
                        user_email=current_user.email,
                        source="vendor",
                    )
                    for frn in result.get("frns", [])
                ]
                upsert_frn_snapshots(
                    db, records,
                    scope_type="spin", scope_value=profile.spin or "",
                    queue_status_changes=True,
                )
        except Exception as upsert_err:
            # Never let cache writeback break the response
            import logging as _lg
            _lg.getLogger(__name__).warning(f"[vendor.frn-status] cache writeback failed: {upsert_err}")
        
        # Cache for 6 hours
        set_cached(db, cache_key, result)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="vendor_entity_frn_summary",
            params={"spin": profile.spin, "ben": ben, "year": year},
            ttl_hours=1,
            fetch_fn=lambda: client.get_entity_frn_summary(profile.spin, ben),
        )
        
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="vendor_frn_status_summary",
            params={"spin": profile.spin, "year": year},
            ttl_hours=1,
            fetch_fn=lambda: client.get_frn_status_by_spin(profile.spin, year),
        )
        
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
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
    request: Request,
    background_tasks: BackgroundTasks,
    year: Optional[int] = None,
    state: Optional[str] = None,
    category: Optional[str] = None,
    service_type: Optional[str] = None,
    manufacturer: Optional[str] = None,
    equipment_type: Optional[str] = None,
    service_function: Optional[str] = None,
    min_speed: Optional[str] = None,
    max_speed: Optional[str] = None,
    sort_by: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    cursor: Optional[str] = None,
    min_deal_value: Optional[float] = None,
    max_deal_value: Optional[float] = None,
    refresh: bool = False,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
    db: Session = Depends(get_db),
):
    """
    Get Form 470 postings for lead generation.
    SNAPSHOT-FIRST: Reads from local vendor_form470_snapshots table (<500ms).
    Live USAC fetch only when refresh=true (with 25s hard timeout).

    Cursor-based pagination: use next_cursor from response for next page.
    Default 200 rows per page, max 1000.
    """
    import json as _json
    import logging as _logging
    from ...models.vendor_form470_snapshot import VendorForm470Snapshot

    _log = _logging.getLogger(__name__)

    # Clamp limit
    if limit > 1000:
        limit = 1000
    if limit < 1:
        limit = 200

    # Resolve cursor to offset
    if cursor:
        try:
            import base64
            decoded = base64.b64decode(cursor).decode()
            offset = int(decoded)
        except Exception:
            offset = 0

    def _build_query(q):
        if year:
            q = q.filter(VendorForm470Snapshot.funding_year == str(year))
        if state:
            q = q.filter(VendorForm470Snapshot.state == state.upper())
        if category:
            cat_name = f"Category {category}" if category in ('1', '2') else category
            q = q.filter(VendorForm470Snapshot.categories_json.ilike(f'%{cat_name}%'))
        if service_type:
            q = q.filter(VendorForm470Snapshot.service_types_json.ilike(f'%{service_type}%'))
        if manufacturer:
            q = q.filter(VendorForm470Snapshot.manufacturers_json.ilike(f'%{manufacturer}%'))
        if equipment_type:
            q = q.filter(VendorForm470Snapshot.services_json.ilike(f'%{equipment_type}%'))
        if service_function:
            q = q.filter(VendorForm470Snapshot.service_types_json.ilike(f'%{service_function}%'))
        if min_deal_value and min_deal_value > 0:
            q = q.filter(VendorForm470Snapshot.c2_budget_available >= min_deal_value)
        if max_deal_value and max_deal_value > 0:
            q = q.filter(VendorForm470Snapshot.c2_budget_available <= max_deal_value)
        return q

    def _safe_json_list(raw, row_id=None, field=None):
        """Tolerantly decode a JSON-array column. Returns [] on any error so one
        bad row never 500s the whole leads endpoint (MySQL TEXT 64KB truncation
        was the original culprit — column is now MEDIUMTEXT but old rows may
        still be truncated until the next snapshot refresh)."""
        if not raw:
            return []
        try:
            return _json.loads(raw)
        except Exception as exc:
            _log.warning(
                "[470-leads] bad %s on row id=%s len=%s err=%s",
                field, row_id, len(raw), exc,
            )
            return []

    def _row_to_lead(r):
        return {
            "application_number": r.application_number,
            "funding_year": r.funding_year,
            "ben": r.ben,
            "entity_name": r.entity_name,
            "state": r.state,
            "city": r.city,
            "applicant_type": r.applicant_type,
            "status": r.status,
            "posting_date": r.posting_date,
            "allowable_contract_date": r.allowable_contract_date,
            "contact_name": r.contact_name,
            "contact_email": r.contact_email,
            "contact_phone": r.contact_phone,
            "technical_contact": r.technical_contact,
            "technical_email": r.technical_email,
            "technical_phone": r.technical_phone,
            "cat1_description": r.cat1_description,
            "cat2_description": r.cat2_description,
            "services": _safe_json_list(r.services_json, r.id, "services_json"),
            "manufacturers": _safe_json_list(r.manufacturers_json, r.id, "manufacturers_json"),
            "service_types": _safe_json_list(r.service_types_json, r.id, "service_types_json"),
            "categories": _safe_json_list(r.categories_json, r.id, "categories_json"),
            "c2_budget_total": r.c2_budget_total,
            "c2_budget_available": r.c2_budget_available,
            "c2_budget_cycle": r.c2_budget_cycle,
        }

    # --- Snapshot-first read path ---
    if not refresh:
        from sqlalchemy import func as _sqlfunc
        q = _build_query(db.query(VendorForm470Snapshot))
        total = q.count()

        if total > 0 or refresh is False:
            # Sort
            if sort_by == "entity_name":
                q = q.order_by(VendorForm470Snapshot.entity_name.asc())
            elif sort_by == "c2_budget_available":
                q = q.order_by(VendorForm470Snapshot.c2_budget_available.desc())
            else:
                q = q.order_by(VendorForm470Snapshot.posting_date.desc())

            rows = q.offset(offset).limit(limit).all()
            leads = [_row_to_lead(r) for r in rows]
            has_more = (offset + limit) < total

            # Build next_cursor
            import base64
            next_cursor = None
            if has_more:
                next_offset = offset + limit
                next_cursor = base64.b64encode(str(next_offset).encode()).decode()

            last_refreshed = None
            if rows:
                last_refreshed = max(
                    (r.last_refreshed for r in rows if r.last_refreshed), default=None
                )

            from ...utils.source_tag import tag_source
            tag_source(request, "snapshot_hit", rows=len(leads), partial=False, user_id=current_user.id)
            return {
                "success": True,
                "source": "local_db",
                "from_cache": True,
                "total_leads": total,
                "leads": leads,
                "has_more": has_more,
                "next_cursor": next_cursor,
                "partial": False,
                "last_refreshed": last_refreshed.isoformat() if last_refreshed else None,
                "filters_applied": {
                    "year": year, "state": state, "category": category,
                    "service_type": service_type, "manufacturer": manufacturer,
                    "equipment_type": equipment_type, "service_function": service_function,
                    "min_speed": min_speed, "max_speed": max_speed,
                    "sort_by": sort_by,
                    "min_deal_value": min_deal_value, "max_deal_value": max_deal_value,
                },
            }

    # --- Live USAC fetch path (refresh=true) with 25s hard timeout ---
    try:
        from utils.usac_client import USACDataClient
        import concurrent.futures

        client = USACDataClient()

        def _fetch_live():
            return client.get_470_leads(
                year=year, state=state, category=category,
                service_type=service_type, manufacturer=manufacturer,
                equipment_type=equipment_type, service_function=service_function,
                min_speed=min_speed, max_speed=max_speed,
                sort_by=sort_by, limit=5000, offset=0,
                min_deal_value=min_deal_value, max_deal_value=max_deal_value,
            )

        result = None
        partial = False
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_fetch_live)
            try:
                result = future.result(timeout=25)
            except concurrent.futures.TimeoutError:
                _log.warning("[470-leads] Live USAC fetch timed out after 25s, returning snapshot")
                partial = True

        if partial or not result or not result.get("success"):
            # Return whatever snapshot rows exist with partial=true
            q = _build_query(db.query(VendorForm470Snapshot))
            total = q.count()
            rows = q.order_by(VendorForm470Snapshot.posting_date.desc()).offset(offset).limit(limit).all()
            leads = [_row_to_lead(r) for r in rows]
            from ...utils.source_tag import tag_source
            tag_source(request, "snapshot_miss", rows=len(leads), partial=True, user_id=current_user.id)
            return {
                "success": True,
                "source": "local_db",
                "from_cache": True,
                "partial": True,
                "total_leads": total,
                "leads": leads,
                "has_more": (offset + limit) < total,
                "next_cursor": None,
                "message": "Live USAC fetch timed out or failed. Showing cached data.",
                "filters_applied": {
                    "year": year, "state": state, "category": category,
                    "service_type": service_type, "manufacturer": manufacturer,
                },
            }

        # Persist fetched leads to snapshot table (background to not block response)
        fetched_leads = result.get("leads", [])

        def _persist_snapshot(leads_data):
            from ...core.database import SessionLocal
            _db = SessionLocal()
            try:
                from datetime import datetime as _dt
                now = _dt.utcnow()
                # Delete and reinsert for this year/state combo (or all if no filter)
                del_q = _db.query(VendorForm470Snapshot)
                if year:
                    del_q = del_q.filter(VendorForm470Snapshot.funding_year == str(year))
                if state:
                    del_q = del_q.filter(VendorForm470Snapshot.state == state.upper())
                del_q.delete(synchronize_session=False)

                for lead in leads_data:
                    _db.add(VendorForm470Snapshot(
                        application_number=lead.get("application_number", ""),
                        funding_year=str(lead.get("funding_year", "")),
                        ben=lead.get("ben"),
                        entity_name=lead.get("entity_name"),
                        state=lead.get("state"),
                        city=lead.get("city"),
                        applicant_type=lead.get("applicant_type"),
                        status=lead.get("status"),
                        posting_date=lead.get("posting_date"),
                        allowable_contract_date=lead.get("allowable_contract_date"),
                        contact_name=lead.get("contact_name"),
                        contact_email=lead.get("contact_email"),
                        contact_phone=lead.get("contact_phone"),
                        technical_contact=lead.get("technical_contact"),
                        technical_email=lead.get("technical_email"),
                        technical_phone=lead.get("technical_phone"),
                        cat1_description=lead.get("cat1_description"),
                        cat2_description=lead.get("cat2_description"),
                        services_json=_json.dumps(lead.get("services", [])),
                        manufacturers_json=_json.dumps(lead.get("manufacturers", [])),
                        service_types_json=_json.dumps(lead.get("service_types", [])),
                        categories_json=_json.dumps(lead.get("categories", [])),
                        c2_budget_total=lead.get("c2_budget_total"),
                        c2_budget_available=lead.get("c2_budget_available"),
                        c2_budget_cycle=lead.get("c2_budget_cycle"),
                        last_refreshed=now,
                    ))
                _db.commit()
                _log.info(f"[470-leads] Persisted {len(leads_data)} leads to snapshot table")
            except Exception as exc:
                _db.rollback()
                _log.warning(f"[470-leads] Failed to persist snapshot: {exc}")
            finally:
                _db.close()

        background_tasks.add_task(_persist_snapshot, fetched_leads)

        # Return the live result with pagination applied
        total_leads = result.get("total_leads", len(fetched_leads))
        paginated = fetched_leads[offset:offset + limit]
        import base64
        has_more = (offset + limit) < total_leads
        next_cursor = None
        if has_more:
            next_cursor = base64.b64encode(str(offset + limit).encode()).decode()

        from ...utils.source_tag import tag_source
        tag_source(request, "usac_live", rows=len(paginated), partial=False, user_id=current_user.id)
        return {
            "success": True,
            "source": "usac_live",
            "from_cache": False,
            "partial": False,
            "total_leads": total_leads,
            "leads": paginated,
            "has_more": has_more,
            "next_cursor": next_cursor,
            "filters_applied": result.get("filters_applied", {}),
        }

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
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="470_by_state",
            params={"state": state, "year": year, "category": category, "limit": limit},
            ttl_hours=6,
            fetch_fn=lambda: client.get_470_by_state(state, year, category, limit),
        )
        
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
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="470_by_manufacturer",
            params={"manufacturer": manufacturer, "year": year, "state": state, "limit": limit},
            ttl_hours=6,
            fetch_fn=lambda: client.get_470_by_manufacturer(manufacturer, year, state, limit),
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch 470 leads for manufacturer {manufacturer}: {str(e)}"
        )


@router.get("/470/{application_number}")
async def get_470_detail(
    application_number: str,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
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
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="470_detail",
            params={"application_number": application_number},
            ttl_hours=24,
            fetch_fn=lambda: client.get_470_detail(application_number),
        )
        
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


# Allowed hosts for RFP proxy. USAC's public document host is the only legitimate source.
_RFP_ALLOWED_HOSTS = {"publicdata.usac.org"}

# Map common file extensions to a stable Content-Type. Keeps Word/Excel/PDF
# happy even if upstream returns a vague application/octet-stream.
_RFP_EXT_CT = {
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls":  "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt":  "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt":  "text/plain; charset=utf-8",
    ".zip":  "application/zip",
    ".csv":  "text/csv; charset=utf-8",
}


def _rfp_safe_filename(name: str) -> str:
    """Strip path separators and Windows-illegal chars, keep extension."""
    name = unquote(name or "")
    name = name.split("/")[-1].split("\\")[-1]
    # remove leading "<digits>-" prefix (USAC adds an internal id)
    name = re.sub(r"^\d+-", "", name)
    # collapse repeated whitespace
    name = re.sub(r"\s+", " ", name).strip()
    # drop characters Windows refuses in filenames
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "", name)
    return name or "document"


@router.get("/rfp-download")
async def rfp_download_proxy(url: str):
    """
    Server-side proxy for RFP document downloads from USAC's public-data host.

    Why: the browser's direct fetch() to publicdata.usac.org sometimes lands on
    HTML wrappers / redirects, producing corrupt files that Word, Excel, and PDF
    readers reject. Streaming through the backend lets us validate the host,
    set a clean Content-Type/Content-Disposition, and force a proper attachment.

    No auth is required: the proxied content is public USAC data already
    accessible to anyone, and the host allow-list prevents the endpoint from
    being abused as an open proxy.
    """
    import requests
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL")
    if parsed.scheme not in ("http", "https") or parsed.hostname not in _RFP_ALLOWED_HOSTS:
        raise HTTPException(
            status_code=400,
            detail=f"URL host not allowed; expected one of {sorted(_RFP_ALLOWED_HOSTS)}",
        )

    raw_name = parsed.path.rsplit("/", 1)[-1] if parsed.path else "document"
    filename = _rfp_safe_filename(raw_name)
    ext = os.path.splitext(filename)[1].lower()

    try:
        upstream = requests.get(url, allow_redirects=True, timeout=60, stream=True)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}")

    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(
            status_code=502,
            detail=f"Upstream returned HTTP {upstream.status_code}",
        )

    upstream_ct = (upstream.headers.get("Content-Type") or "").lower()
    # If we asked for a binary doc but USAC returned HTML, that's a stub/error page.
    if ext in _RFP_EXT_CT and "html" in upstream_ct:
        upstream.close()
        raise HTTPException(
            status_code=502,
            detail="Upstream returned an HTML page instead of the requested document",
        )

    # Pick the cleanest Content-Type we can.
    content_type = (
        _RFP_EXT_CT.get(ext)
        or (upstream_ct.split(";")[0].strip() if upstream_ct and "html" not in upstream_ct else None)
        or "application/octet-stream"
    )

    def _iter():
        try:
            for chunk in upstream.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    headers = {
        # RFC 5987-encoded filename so spaces / unicode survive intact in browsers.
        "Content-Disposition": (
            f'attachment; filename="{filename}"; '
            f"filename*=UTF-8''{requests.utils.quote(filename)}"
        ),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
    }
    upstream_len = upstream.headers.get("Content-Length")
    if upstream_len:
        headers["Content-Length"] = upstream_len

    return StreamingResponse(_iter(), media_type=content_type, headers=headers)


@router.post("/470/search")
async def search_470(
    data: Form470SearchRequest,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
):
    """
    Advanced Form 470 search with multiple filters.
    Flexible endpoint for customized lead generation queries.
    """
    try:
        from utils.usac_client import USACDataClient
        from utils.usac_cache import get_or_cache
        
        client = USACDataClient()
        result = get_or_cache(
            namespace="470_search",
            params={
                "year": data.year, "state": data.state, "category": data.category,
                "service_type": data.service_type, "manufacturer": data.manufacturer,
                "limit": data.limit,
            },
            ttl_hours=6,
            fetch_fn=lambda: client.get_470_leads(
                year=data.year,
                state=data.state,
                category=data.category,
                service_type=data.service_type,
                manufacturer=data.manufacturer,
                limit=data.limit,
            ),
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
    
    Uses the FRN Status dataset (qdmp-ygft) which has actual Funded/Denied/Pending status.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        filters = {}
        
        # Build filters - FRN Status dataset (qdmp-ygft) field names
        if data.state:
            filters["state"] = data.state.upper()
        
        if data.status:
            # Status field is form_471_frn_status_name (not frn_status!)
            status_map = {
                "funded": "Funded",
                "denied": "Denied", 
                "pending": "Pending",
            }
            filters["form_471_frn_status_name"] = status_map.get(data.status.lower(), data.status)
        
        if data.service_type:
            service_type_lower = data.service_type.lower()
            service_type_map = {
                "internal connections": "Internal Connections",
                "basic maintenance": "Basic Maintenance of Internal Connections",
                "managed internal broadband services": "Managed Internal Broadband Services",
                "mibs": "Managed Internal Broadband Services",
                "internet access": "Data Transmission and/or Internet Access",
                "data transmission": "Data Transmission and/or Internet Access",
                "voice": "Voice",
            }
            for key, value in service_type_map.items():
                if key in service_type_lower:
                    filters["form_471_service_type_name"] = value
                    break
        
        # Use FRN Status dataset (qdmp-ygft)
        df = client.fetch_data(dataset='frn_status', year=data.year, filters=filters, limit=data.limit)
        
        if df.empty:
            return {"success": True, "count": 0, "results": []}
        
        # Clean NaN/Infinity values that aren't JSON serializable
        import math
        df = df.fillna('')  # Replace NaN with empty string
        df = df.replace([float('inf'), float('-inf')], '')  # Replace infinity
        
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
        
        # Transform results to frontend-expected field names
        def transform_result(r):
            """Map FRN Status dataset (qdmp-ygft) fields to frontend
            
            Actual field names from dataset:
            - ben, organization_name, state
            - form_471_frn_status_name (Funded/Denied/Pending)
            - funding_commitment_request, total_authorized_disbursement
            - form_471_service_type_name
            - funding_request_number (FRN)
            """
            # Funding amount
            funding = r.get('funding_commitment_request') or r.get('total_authorized_disbursement') or 0
            try:
                funding_amount = float(funding) if funding else 0
            except (ValueError, TypeError):
                funding_amount = 0
            
            # Status - form_471_frn_status_name is the actual status field!
            status = r.get('form_471_frn_status_name') or 'Unknown'
            
            # Service type
            service_type = r.get('form_471_service_type_name') or ''
            
            # Entity name
            entity_name = r.get('organization_name') or ''
            
            return {
                'ben': str(r.get('ben', '')),
                'name': entity_name,
                'state': r.get('state', ''),
                'city': '',  # Not in this dataset
                'status': status,
                'funding_amount': funding_amount,
                'service_type': service_type,
                'funding_year': r.get('funding_year', data.year),
                'application_number': r.get('application_number', ''),
                'frn': r.get('funding_request_number', ''),
                'committed_amount': float(r.get('funding_commitment_request') or 0),
                'funded_amount': float(r.get('total_authorized_disbursement') or 0),
                'category': '',
                '_raw': r
            }
        
        transformed_results = [transform_result(r) for r in results]
        
        # Pagination: slice transformed_results so total_count reflects post-filter total
        total_count = len(transformed_results)
        page_size = data.page_size if (data.page_size and data.page_size > 0) else data.limit
        page = max(1, data.page or 1)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_results = transformed_results[start_idx:end_idx]
        total_pages = max(1, (total_count + page_size - 1) // page_size) if total_count else 1
        
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
                results_count=total_count
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
            "count": len(paginated_results),
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_more": end_idx < total_count,
            "results": paginated_results,
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

# ==================== ENTITY ENRICHMENT ENDPOINT ====================

@router.get("/entity/{ben}/enrich")
async def enrich_entity(
    ben: str,
    year: Optional[int] = None,
    application_number: Optional[str] = None,
    frn: Optional[str] = None,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """
    Get comprehensive enriched data for an entity/school.
    
    Queries multiple USAC datasets to provide:
    - Entity information (name, address, type)
    - Application status and details
    - FRN history with actual status (Funded/Denied/Pending)
    - Contact information from Form 470 and Entity Supplemental data
    - Funding summary
    
    This is the primary endpoint for getting full lead details before saving.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        
        # Get comprehensive enriched data
        enriched = client.enrich_entity(
            ben=ben,
            year=year,
            application_number=application_number,
            frn=frn
        )
        
        if not enriched.get('success'):
            return {
                "success": False,
                "error": enriched.get('error', 'Failed to enrich entity'),
                "ben": ben
            }
        
        return {
            "success": True,
            "ben": ben,
            "entity": enriched.get('entity', {}),
            "applications": enriched.get('applications', []),
            "frns": enriched.get('frns', []),
            "frn_status": enriched.get('frn_status', {}),
            "contacts": enriched.get('contacts', []),
            "funding_summary": enriched.get('funding_summary', {}),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enrich entity: {str(e)}"
        )


# ==================== LEADS MANAGEMENT ENDPOINTS ====================

class SaveLeadRequest(BaseModel):
    """Request to save a school/application as a lead"""
    ben: str
    entity_name: str
    entity_state: str
    entity_city: Optional[str] = None
    entity_address: Optional[str] = None
    entity_zip: Optional[str] = None
    entity_phone: Optional[str] = None
    entity_website: Optional[str] = None
    entity_type: Optional[str] = None
    
    # Application details
    form_type: str = "471"
    application_number: Optional[str] = None
    frn: Optional[str] = None
    funding_year: Optional[int] = None
    application_status: Optional[str] = None
    frn_status: Optional[str] = None
    
    # Funding details
    funding_amount: Optional[int] = 0
    committed_amount: Optional[int] = 0
    funded_amount: Optional[int] = 0
    service_type: Optional[str] = None
    services: Optional[List[str]] = []
    categories: Optional[List[str]] = []
    
    # Contact info
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_title: Optional[str] = None
    all_contacts: Optional[List[Dict]] = []
    
    # Lead tracking
    lead_status: str = "new"
    notes: Optional[str] = None
    tags: Optional[List[str]] = []
    
    # Source data
    source_data: Optional[Dict] = {}


class UpdateLeadRequest(BaseModel):
    """Request to update a lead"""
    lead_status: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_title: Optional[str] = None
    all_contacts: Optional[List[Dict]] = None


@router.post("/leads")
async def save_lead(
    data: SaveLeadRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Save a school/application as a lead for follow-up.
    
    The lead includes:
    - Entity information (school/library details)
    - Application/FRN status from USAC
    - Contact information (enriched from USAC)
    - Lead tracking status (new, contacted, qualified, won, lost)
    - Notes and tags
    """
    try:
        from ...models.vendor import SavedLead
        
        # Check if lead already exists for this vendor
        existing = db.query(SavedLead).filter(
            SavedLead.vendor_profile_id == profile.id,
            SavedLead.ben == data.ben,
            SavedLead.application_number == data.application_number
        ).first()
        
        if existing:
            # Update existing lead
            existing.entity_name = data.entity_name
            existing.entity_state = data.entity_state
            existing.entity_city = data.entity_city
            existing.entity_address = data.entity_address
            existing.entity_zip = data.entity_zip
            existing.entity_phone = data.entity_phone
            existing.entity_website = data.entity_website
            existing.entity_type = data.entity_type
            existing.frn = data.frn
            existing.funding_year = data.funding_year
            existing.application_status = data.application_status
            existing.frn_status = data.frn_status
            existing.funding_amount = data.funding_amount
            existing.committed_amount = data.committed_amount
            existing.funded_amount = data.funded_amount
            existing.service_type = data.service_type
            existing.services = data.services
            existing.categories = data.categories
            existing.contact_name = data.contact_name
            existing.contact_email = data.contact_email
            existing.contact_phone = data.contact_phone
            existing.contact_title = data.contact_title
            existing.all_contacts = data.all_contacts
            existing.source_data = data.source_data
            existing.updated_at = datetime.utcnow()
            
            db.commit()
            db.refresh(existing)
            
            return {
                "success": True,
                "message": "Lead updated",
                "lead": existing.to_dict()
            }
        
        # Create new lead
        lead = SavedLead(
            vendor_profile_id=profile.id,
            ben=data.ben,
            entity_name=data.entity_name,
            entity_state=data.entity_state,
            entity_city=data.entity_city,
            entity_address=data.entity_address,
            entity_zip=data.entity_zip,
            entity_phone=data.entity_phone,
            entity_website=data.entity_website,
            entity_type=data.entity_type,
            form_type=data.form_type,
            application_number=data.application_number or '',
            frn=data.frn,
            funding_year=data.funding_year,
            application_status=data.application_status,
            frn_status=data.frn_status,
            funding_amount=data.funding_amount,
            committed_amount=data.committed_amount,
            funded_amount=data.funded_amount,
            service_type=data.service_type,
            services=data.services,
            categories=data.categories,
            contact_name=data.contact_name,
            contact_email=data.contact_email,
            contact_phone=data.contact_phone,
            contact_title=data.contact_title,
            all_contacts=data.all_contacts,
            lead_status=data.lead_status,
            notes=data.notes,
            tags=data.tags,
            source_data=data.source_data
        )
        
        db.add(lead)
        db.commit()
        db.refresh(lead)
        
        return {
            "success": True,
            "message": "Lead saved",
            "lead": lead.to_dict()
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save lead: {str(e)}"
        )


@router.get("/leads")
async def get_leads(
    lead_status: Optional[str] = None,
    state: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Get all saved leads for the vendor.
    
    Optional filters:
    - lead_status: Filter by lead status (new, contacted, qualified, won, lost)
    - state: Filter by entity state
    - year: Filter by funding year
    """
    try:
        from ...models.vendor import SavedLead
        
        query = db.query(SavedLead).filter(
            SavedLead.vendor_profile_id == profile.id
        )
        
        if lead_status:
            query = query.filter(SavedLead.lead_status == lead_status)
        if state:
            query = query.filter(SavedLead.entity_state == state.upper())
        if year:
            query = query.filter(SavedLead.funding_year == year)
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        leads = query.order_by(SavedLead.updated_at.desc()).offset(offset).limit(limit).all()
        
        # Calculate summary stats
        all_leads = db.query(SavedLead).filter(
            SavedLead.vendor_profile_id == profile.id
        ).all()
        
        status_counts = {}
        for lead in all_leads:
            status_counts[lead.lead_status] = status_counts.get(lead.lead_status, 0) + 1
        
        return {
            "success": True,
            "total": total,
            "count": len(leads),
            "leads": [lead.to_dict() for lead in leads],
            "summary": {
                "total_leads": len(all_leads),
                "by_status": status_counts
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch leads: {str(e)}"
        )


@router.get("/leads/{lead_id}")
async def get_lead(
    lead_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Get a specific lead by ID"""
    try:
        from ...models.vendor import SavedLead
        
        lead = db.query(SavedLead).filter(
            SavedLead.id == lead_id,
            SavedLead.vendor_profile_id == profile.id
        ).first()
        
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        return {
            "success": True,
            "lead": lead.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch lead: {str(e)}"
        )


@router.patch("/leads/{lead_id}")
async def update_lead(
    lead_id: int,
    data: UpdateLeadRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Update a lead's status, notes, or contact information.
    """
    try:
        from ...models.vendor import SavedLead
        
        lead = db.query(SavedLead).filter(
            SavedLead.id == lead_id,
            SavedLead.vendor_profile_id == profile.id
        ).first()
        
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        # Update fields if provided
        if data.lead_status is not None:
            lead.lead_status = data.lead_status
        if data.notes is not None:
            lead.notes = data.notes
        if data.tags is not None:
            lead.tags = data.tags
        if data.contact_name is not None:
            lead.contact_name = data.contact_name
        if data.contact_email is not None:
            lead.contact_email = data.contact_email
        if data.contact_phone is not None:
            lead.contact_phone = data.contact_phone
        if data.contact_title is not None:
            lead.contact_title = data.contact_title
        if data.all_contacts is not None:
            lead.all_contacts = data.all_contacts
        
        lead.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(lead)
        
        return {
            "success": True,
            "message": "Lead updated",
            "lead": lead.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update lead: {str(e)}"
        )


@router.delete("/leads/{lead_id}")
async def delete_lead(
    lead_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Delete a saved lead"""
    try:
        from ...models.vendor import SavedLead
        
        lead = db.query(SavedLead).filter(
            SavedLead.id == lead_id,
            SavedLead.vendor_profile_id == profile.id
        ).first()
        
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        
        db.delete(lead)
        db.commit()
        
        return {
            "success": True,
            "message": "Lead deleted"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete lead: {str(e)}"
        )


# ==================== PREDICTIVE LEAD INTELLIGENCE ($499/mo Premium) ====================

class PredictionFilterRequest(BaseModel):
    prediction_type: Optional[str] = None  # contract_expiry, equipment_refresh, c2_budget_reset
    states: Optional[List[str]] = None
    manufacturers: Optional[List[str]] = None
    min_confidence: float = 0.0
    min_deal_value: float = 0.0
    sort_by: str = "confidence_score"
    sort_order: str = "desc"
    limit: int = 50
    offset: int = 0


class PredictionStatusUpdate(BaseModel):
    status: str  # new, viewed, contacted, converted, dismissed


@router.get("/predicted-leads")
async def get_predicted_leads(
    prediction_type: Optional[str] = None,
    state: Optional[str] = None,
    manufacturer: Optional[str] = None,
    entity_type: Optional[str] = None,
    min_confidence: float = 0.0,
    min_deal_value: float = 0.0,
    max_deal_value: Optional[float] = None,
    sort_by: str = "confidence_score",
    sort_order: str = "desc",
    limit: int = 50,
    offset: int = 0,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Get predicted leads based on AI analysis of USAC data.
    Premium feature — requires Predictive Intelligence subscription ($499/mo).
    
    Prediction types:
    - contract_expiry: Contracts expiring in 3-12 months
    - equipment_refresh: Aging equipment due for replacement  
    - c2_budget_reset: Unspent C2 budget before cycle reset
    """
    from ...services.prediction_service import prediction_service
    from ...models.prediction import PredictionType, PredictionStatus
    
    # Map prediction type string to enum
    ptype = None
    if prediction_type:
        try:
            ptype = PredictionType(prediction_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid prediction_type. Valid: {[t.value for t in PredictionType]}"
            )
    
    # Parse filters
    states = [s.strip() for s in state.split(',')] if state else None
    manufacturers_list = [m.strip() for m in manufacturer.split(',')] if manufacturer else None
    entity_types_list = [e.strip() for e in entity_type.split(',')] if entity_type else None
    
    result = prediction_service.get_predictions(
        db=db,
        vendor_profile_id=profile.id,
        prediction_type=ptype,
        states=states,
        manufacturers=manufacturers_list,
        entity_types=entity_types_list,
        min_confidence=min_confidence,
        min_deal_value=min_deal_value,
        max_deal_value=max_deal_value,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=min(limit, 100),
        offset=offset,
    )
    
    return result


@router.get("/predicted-leads/stats")
async def get_predicted_leads_stats(
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Get summary statistics for the prediction dashboard."""
    from ...services.prediction_service import prediction_service
    
    return prediction_service.get_prediction_stats(db)


@router.get("/predicted-leads/{prediction_id}")
async def get_predicted_lead_detail(
    prediction_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Get a single predicted lead with full details. Marks as viewed."""
    from ...services.prediction_service import prediction_service
    
    result = prediction_service.get_prediction_by_id(db, prediction_id, mark_viewed=True)
    
    if not result:
        raise HTTPException(status_code=404, detail="Predicted lead not found")
    
    return {"success": True, "data": result}


@router.patch("/predicted-leads/{prediction_id}/status")
async def update_predicted_lead_status(
    prediction_id: int,
    body: PredictionStatusUpdate,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """Update the status of a predicted lead (contacted, converted, dismissed)."""
    from ...models.prediction import PredictionStatus
    from ...services.prediction_service import prediction_service
    
    try:
        new_status = PredictionStatus(body.status)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid: {[s.value for s in PredictionStatus]}"
        )
    
    success = prediction_service.update_prediction_status(db, prediction_id, new_status)
    
    if not success:
        raise HTTPException(status_code=404, detail="Predicted lead not found")
    
    return {"success": True, "message": f"Status updated to {body.status}"}


def _run_prediction_refresh(states: Optional[List[str]], force: bool):
    """
    Background worker that runs prediction refresh in a separate thread
    with its own DB session. This prevents blocking the async event loop.
    """
    import logging
    logger = logging.getLogger(__name__)
    from ...core.database import SessionLocal
    from ...services.prediction_service import prediction_service
    
    logger.info("Background prediction refresh started")
    db = SessionLocal()
    try:
        result = prediction_service.generate_all_predictions(
            db=db,
            states=states,
            force_refresh=force,
        )
        if result.get('success'):
            logger.info(
                f"Background prediction refresh complete: {result.get('total_predictions', 0)} predictions "
                f"in {result.get('duration_seconds', 0):.1f}s"
            )
        else:
            logger.error(f"Background prediction refresh failed: {result}")
    except Exception as e:
        logger.error(f"Background prediction refresh error: {e}")
    finally:
        db.close()


@router.post("/predicted-leads/refresh")
async def refresh_predictions(
    states: Optional[str] = None,
    force: bool = False,
    current_user: User = Depends(require_role("admin", "vendor", "super")),
    db: Session = Depends(get_db)
):
    """
    Trigger a manual prediction refresh.
    This fetches fresh data from USAC and re-runs all prediction algorithms.
    Runs in a background thread so the API remains responsive.
    Admin or premium vendor access required.
    """
    state_list = [s.strip() for s in states.split(',')] if states else None
    
    # Run in a background thread so we don't block the event loop
    thread = threading.Thread(
        target=_run_prediction_refresh,
        args=(state_list, force),
        daemon=True
    )
    thread.start()
    
    return {
        "success": True,
        "message": "Prediction refresh started in background. Check stats endpoint for progress.",
        "status": "processing"
    }


@router.post("/predicted-leads/{prediction_id}/save")
async def save_predicted_lead(
    prediction_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Save a predicted lead to the vendor's Saved Leads for follow-up.
    
    Converts prediction data into a SavedLead record, mapping all available
    fields (entity info, contact, funding, service type, manufacturer, etc.).
    Deduplicates by BEN + FRN to prevent double-saving.
    """
    from ...models.prediction import PredictedLead
    from ...models.vendor import SavedLead
    
    # Fetch the prediction
    prediction = db.query(PredictedLead).filter(PredictedLead.id == prediction_id).first()
    if not prediction:
        raise HTTPException(status_code=404, detail="Predicted lead not found")
    
    # Check if already saved (by BEN + FRN or BEN + application_number)
    existing_query = db.query(SavedLead).filter(
        SavedLead.vendor_profile_id == profile.id,
        SavedLead.ben == (prediction.ben or ""),
    )
    if prediction.frn:
        existing = existing_query.filter(SavedLead.frn == prediction.frn).first()
    elif prediction.application_number:
        existing = existing_query.filter(SavedLead.application_number == prediction.application_number).first()
    else:
        existing = existing_query.filter(SavedLead.form_type == "predicted").first()
    
    if existing:
        return {
            "success": False,
            "error": "This lead has already been saved",
            "lead": existing.to_dict()
        }
    
    # Create SavedLead from prediction data
    saved_lead = SavedLead(
        vendor_profile_id=profile.id,
        form_type="predicted",
        application_number=prediction.application_number or prediction.frn or str(prediction.id),
        ben=prediction.ben or "",
        frn=prediction.frn,
        entity_name=prediction.organization_name,
        entity_type=prediction.entity_type,
        entity_state=prediction.state,
        entity_city=prediction.city,
        contact_name=prediction.contact_name,
        contact_email=prediction.contact_email,
        contact_phone=prediction.contact_phone,
        funding_year=prediction.funding_year,
        service_type=prediction.service_type,
        manufacturers=[prediction.manufacturer] if prediction.manufacturer else [],
        lead_status="new",
        notes=f"Saved from Predicted Leads ({prediction.prediction_type}). {prediction.prediction_reason or ''}",
        source_data={
            "prediction_id": prediction.id,
            "prediction_type": prediction.prediction_type,
            "confidence_score": prediction.confidence_score,
            "estimated_deal_value": prediction.estimated_deal_value,
            "predicted_action_date": prediction.predicted_action_date.isoformat() if prediction.predicted_action_date else None,
            "contract_expiration_date": prediction.contract_expiration_date.isoformat() if prediction.contract_expiration_date else None,
            "current_provider_name": prediction.current_provider_name,
            "current_spin": prediction.current_spin,
            "manufacturer": prediction.manufacturer,
            "equipment_model": prediction.equipment_model,
        },
    )
    
    # Copy financial data if available
    if prediction.estimated_deal_value:
        saved_lead.funding_amount = int(prediction.estimated_deal_value)
    if prediction.discount_rate:
        saved_lead.source_data["discount_rate"] = prediction.discount_rate
    
    db.add(saved_lead)
    
    # Update prediction status to converted
    prediction.status = "converted"
    
    db.commit()
    db.refresh(saved_lead)
    
    return {
        "success": True,
        "lead": saved_lead.to_dict(),
        "message": "Lead saved! You can find it in your Saved Leads tab."
    }


@router.post("/predicted-leads/{prediction_id}/enrich")
async def enrich_predicted_lead(
    prediction_id: int,
    force_refresh: bool = False,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db)
):
    """
    Enrich a predicted lead with contact information via Hunter.io.
    
    Looks up the organization domain to find:
    - Email addresses of key contacts (IT, executive, management)
    - LinkedIn profile URLs
    - Phone numbers and titles
    
    Results are cached by domain (90-day expiry) so multiple vendors
    or repeated lookups don't waste API credits.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    from ...models.prediction import PredictedLead
    from ...models.vendor import OrganizationEnrichmentCache
    from ...services.enrichment_service import EnrichmentService
    
    prediction = db.query(PredictedLead).filter(PredictedLead.id == prediction_id).first()
    if not prediction:
        raise HTTPException(status_code=404, detail="Predicted lead not found")
    
    # Determine domain for enrichment
    email = prediction.contact_email
    name = prediction.contact_name
    domain = None
    
    # Try to extract domain from email
    if email and '@' in email:
        domain = email.split('@')[1]
    
    # If no domain from email, try to construct from org name
    if not domain and prediction.organization_name:
        # Try common patterns: orgname.org, orgname.edu, orgname.k12.state.us
        org_clean = prediction.organization_name.lower().strip()
        # For schools/libraries, try .org or .edu
        # We'll let the enrichment service handle domain discovery
        # For now, generate a LinkedIn search URL as fallback
        pass
    
    # Generate LinkedIn search URLs regardless (free, no API needed)
    enrichment_service = EnrichmentService()
    linkedin_url = enrichment_service.generate_linkedin_search_url(
        name=name,
        company=prediction.organization_name
    ) if name else None
    
    org_linkedin_url = enrichment_service.generate_linkedin_search_url(
        company=prediction.organization_name,
        title="Technology Director"
    ) if prediction.organization_name else None
    
    enrichment_result = {
        "success": True,
        "linkedin_search_url": linkedin_url,
        "org_linkedin_search_url": org_linkedin_url,
        "person": {},
        "company": {},
        "additional_contacts": [],
        "credits_used": 0,
        "from_cache": False,
    }
    
    if domain:
        logger.info(f"Enriching predicted lead {prediction_id} with domain: {domain}")
        
        try:
            enrichment_result = await enrichment_service.enrich_contact_with_cache(
                db=db,
                email=email,
                name=name,
                domain=domain,
                ben=prediction.ben,
                organization_name=prediction.organization_name,
                include_domain_search=True,  # Find additional contacts at the organization
                force_refresh=force_refresh
            )
        except Exception as e:
            logger.error(f"Enrichment API call failed: {e}")
            enrichment_result["error"] = str(e)
    else:
        enrichment_result["note"] = "No email domain available. Use LinkedIn search to find contacts."
    
    # Store enrichment data on the prediction record for future display
    prediction.contact_name = enrichment_result.get("person", {}).get("full_name") or prediction.contact_name
    prediction.contact_email = enrichment_result.get("person", {}).get("email") or prediction.contact_email
    prediction.contact_phone = enrichment_result.get("person", {}).get("phone_number") or prediction.contact_phone
    
    db.commit()
    
    return {
        "success": True,
        "enrichment": enrichment_result,
        "prediction": prediction.to_dict()
    }


# ==================== ALERT SUBSCRIPTIONS ====================
# Phase 1 of the Vendor Parity Plan v2. Stores the subscription configs;
# the actual scanner that fills `vendor_alert_matches` lives in P2, and
# the dispatcher (email/SMS/push) lives in P3-P7. These endpoints only
# expose the CRUD + read surface.

from ...models.vendor_alerts import (
    VendorAlertSubscription,
    VendorAlertMatch,
    VendorPushSubscription,
    VendorInAppNotification,
    DEFAULT_ALERT_CHANNELS,
)


class AlertChannels(BaseModel):
    email: bool = True
    sms: bool = False
    push: bool = False
    in_app: bool = False


class AlertSubscriptionCreate(BaseModel):
    name: str
    mode: str = "filter"  # 'filter' or 'watchlist'
    states: Optional[List[str]] = None
    service_categories: Optional[List[str]] = None
    applicant_types: Optional[List[str]] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    watchlist_bens: Optional[List[str]] = None
    channels: Optional[AlertChannels] = None
    email: Optional[str] = None
    phone_e164: Optional[str] = None
    active: bool = True


class AlertSubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    mode: Optional[str] = None
    states: Optional[List[str]] = None
    service_categories: Optional[List[str]] = None
    applicant_types: Optional[List[str]] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    watchlist_bens: Optional[List[str]] = None
    channels: Optional[AlertChannels] = None
    email: Optional[str] = None
    phone_e164: Optional[str] = None
    active: Optional[bool] = None


class AlertSubscriptionResponse(BaseModel):
    id: int
    name: str
    mode: str
    active: bool


class AlertPreviewRequest(BaseModel):
    """Either reference an existing saved subscription via `subscription_id`,
    OR supply a transient payload (the same fields as a create body) so a
    vendor can preview matches before saving the alert."""
    subscription_id: Optional[int] = None
    mode: str = "filter"
    states: Optional[List[str]] = None
    service_categories: Optional[List[str]] = None
    applicant_types: Optional[List[str]] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    watchlist_bens: Optional[List[str]] = None


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    ua: Optional[str] = None


class InAppNotificationResponse(BaseModel):
    id: int
    title: str
    body: str
    link: Optional[str] = None
    read_at: Optional[str] = None
    created_at: Optional[str] = None


def _has_any_filter_criteria(data) -> bool:
    return any(
        getattr(data, field, None)
        for field in (
            "states",
            "service_categories",
            "applicant_types",
            "min_amount",
            "max_amount",
        )
    )


def _normalize_channels(channels: Optional[AlertChannels]) -> dict:
    if channels is None:
        return dict(DEFAULT_ALERT_CHANNELS)
    return {
        "email": bool(channels.email),
        "sms": bool(channels.sms),
        "push": bool(channels.push),
        "in_app": bool(channels.in_app),
    }


def _get_owned_subscription(
    sub_id: int,
    profile: VendorProfile,
    db: Session,
) -> VendorAlertSubscription:
    sub = db.query(VendorAlertSubscription).filter(
        VendorAlertSubscription.id == sub_id,
        VendorAlertSubscription.vendor_profile_id == profile.id,
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Alert subscription not found")
    return sub


@router.get("/alerts")
async def list_alert_subscriptions(
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """List all alert subscriptions for the current vendor."""
    rows = db.query(VendorAlertSubscription).filter(
        VendorAlertSubscription.vendor_profile_id == profile.id,
    ).order_by(VendorAlertSubscription.created_at.desc()).all()

    return {
        "success": True,
        "subscriptions": [s.to_dict() for s in rows],
    }


@router.post("/alerts")
async def create_alert_subscription(
    data: AlertSubscriptionCreate,
    profile: VendorProfile = Depends(get_vendor_profile),
    current_user: User = Depends(require_role("admin", "vendor", "super")),
    db: Session = Depends(get_db),
):
    """Create a new alert subscription."""
    if data.mode not in ("filter", "watchlist"):
        raise HTTPException(status_code=400, detail="mode must be 'filter' or 'watchlist'")

    if data.mode == "watchlist":
        if not data.watchlist_bens or len(data.watchlist_bens) == 0:
            raise HTTPException(
                status_code=400,
                detail="watchlist_bens is required and must be non-empty for watchlist mode",
            )
    else:  # filter
        if not _has_any_filter_criteria(data):
            raise HTTPException(
                status_code=400,
                detail=(
                    "At least one of states, service_categories, applicant_types, "
                    "min_amount, or max_amount must be set for filter mode"
                ),
            )

    channels = _normalize_channels(data.channels)

    email = data.email
    if channels.get("email"):
        email = email or getattr(current_user, "email", None)
        if not email:
            raise HTTPException(
                status_code=400,
                detail="email is required when the email channel is enabled",
            )

    if channels.get("sms") and not data.phone_e164:
        raise HTTPException(
            status_code=400,
            detail="phone_e164 is required when the SMS channel is enabled",
        )

    sub = VendorAlertSubscription(
        vendor_profile_id=profile.id,
        name=data.name,
        mode=data.mode,
        states=data.states,
        service_categories=data.service_categories,
        applicant_types=data.applicant_types,
        min_amount=data.min_amount,
        max_amount=data.max_amount,
        watchlist_bens=data.watchlist_bens,
        channels=channels,
        email=email,
        phone_e164=data.phone_e164,
        active=data.active,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    return {"success": True, "subscription": sub.to_dict()}


@router.get("/alerts/{sub_id}")
async def get_alert_subscription(
    sub_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Get a single subscription by id (vendor-scoped)."""
    sub = _get_owned_subscription(sub_id, profile, db)
    return {"success": True, "subscription": sub.to_dict()}


@router.patch("/alerts/{sub_id}")
async def update_alert_subscription(
    sub_id: int,
    data: AlertSubscriptionUpdate,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Partial-update an existing subscription."""
    sub = _get_owned_subscription(sub_id, profile, db)

    if data.mode is not None and data.mode not in ("filter", "watchlist"):
        raise HTTPException(status_code=400, detail="mode must be 'filter' or 'watchlist'")

    payload = data.dict(exclude_unset=True)
    if "channels" in payload:
        payload["channels"] = _normalize_channels(data.channels)

    # Apply scalar fields.
    for field in (
        "name", "mode", "states", "service_categories", "applicant_types",
        "min_amount", "max_amount", "watchlist_bens", "channels",
        "email", "phone_e164", "active",
    ):
        if field in payload:
            setattr(sub, field, payload[field])

    # Re-validate channel-required fields against the *resulting* row.
    final_channels = sub.channels or dict(DEFAULT_ALERT_CHANNELS)
    if final_channels.get("sms") and not sub.phone_e164:
        raise HTTPException(
            status_code=400,
            detail="phone_e164 is required when the SMS channel is enabled",
        )
    if final_channels.get("email") and not sub.email:
        raise HTTPException(
            status_code=400,
            detail="email is required when the email channel is enabled",
        )

    db.commit()
    db.refresh(sub)
    return {"success": True, "subscription": sub.to_dict()}


@router.delete("/alerts/{sub_id}")
async def delete_alert_subscription(
    sub_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Delete a subscription (cascade removes its matches)."""
    sub = _get_owned_subscription(sub_id, profile, db)
    db.delete(sub)
    db.commit()
    return {"success": True}


@router.get("/alerts/{sub_id}/matches")
async def list_alert_matches(
    sub_id: int,
    limit: int = 50,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """List matches recorded for this subscription. Empty until the P2
    scanner is enabled."""
    sub = _get_owned_subscription(sub_id, profile, db)
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    rows = db.query(VendorAlertMatch).filter(
        VendorAlertMatch.subscription_id == sub.id,
    ).order_by(VendorAlertMatch.matched_at.desc()).limit(limit).all()

    return {
        "success": True,
        "subscription_id": sub.id,
        "matches": [m.to_dict() for m in rows],
    }


@router.post("/alerts/preview")
async def preview_alert_subscription(
    data: AlertPreviewRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Preview the matches a subscription would produce against postings
    from the last 30 days. Accepts either an existing `subscription_id`
    or a transient subscription payload."""
    from ...services.alert_matcher import preview_matches

    if data.subscription_id is not None:
        sub = _get_owned_subscription(data.subscription_id, profile, db)
    else:
        # Build a transient (unsaved) subscription instance from the body.
        mode = data.mode or "filter"
        if mode not in ("filter", "watchlist"):
            raise HTTPException(status_code=400, detail="mode must be 'filter' or 'watchlist'")
        if mode == "watchlist":
            if not data.watchlist_bens:
                raise HTTPException(
                    status_code=400,
                    detail="watchlist_bens required for watchlist mode preview",
                )
        else:
            if not _has_any_filter_criteria(data):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "At least one of states, service_categories, applicant_types, "
                        "min_amount, or max_amount must be set for filter mode preview"
                    ),
                )
        sub = VendorAlertSubscription(
            vendor_profile_id=profile.id,
            name="__preview__",
            mode=mode,
            states=data.states,
            service_categories=data.service_categories,
            applicant_types=data.applicant_types,
            min_amount=data.min_amount,
            max_amount=data.max_amount,
            watchlist_bens=data.watchlist_bens,
            channels=dict(DEFAULT_ALERT_CHANNELS),
            active=True,
        )

    result = preview_matches(sub, days_back=30, limit=25, db=db)
    return {
        "success": True,
        "count": result["count"],
        "matches": result["sample"],
        "window_days": result["window_days"],
    }


# ==================== VENDOR PUSH SUBSCRIPTIONS ====================

@router.post("/push/subscribe")
async def create_vendor_push_subscription(
    data: PushSubscriptionCreate,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Store a Web Push subscription for the current vendor. The actual
    push dispatcher lands in P6."""
    if not data.endpoint or not data.p256dh or not data.auth:
        raise HTTPException(
            status_code=400,
            detail="endpoint, p256dh, and auth are all required",
        )

    push = VendorPushSubscription(
        vendor_profile_id=profile.id,
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth=data.auth,
        ua=data.ua,
    )
    db.add(push)
    db.commit()
    db.refresh(push)
    return {"success": True, "push_subscription": push.to_dict()}


@router.delete("/push/{push_id}")
async def delete_vendor_push_subscription(
    push_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Delete a vendor push subscription (vendor-scoped)."""
    push = db.query(VendorPushSubscription).filter(
        VendorPushSubscription.id == push_id,
        VendorPushSubscription.vendor_profile_id == profile.id,
    ).first()
    if not push:
        raise HTTPException(status_code=404, detail="Push subscription not found")
    db.delete(push)
    db.commit()
    return {"success": True}


# ==================== IN-APP NOTIFICATIONS ====================

@router.get("/notifications")
async def list_vendor_notifications(
    unread_only: bool = False,
    limit: int = 50,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """List in-app notifications for the current vendor."""
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    q = db.query(VendorInAppNotification).filter(
        VendorInAppNotification.vendor_profile_id == profile.id,
    )
    if unread_only:
        q = q.filter(VendorInAppNotification.read_at.is_(None))
    rows = q.order_by(VendorInAppNotification.created_at.desc()).limit(limit).all()

    unread_count = db.query(VendorInAppNotification).filter(
        VendorInAppNotification.vendor_profile_id == profile.id,
        VendorInAppNotification.read_at.is_(None),
    ).count()

    return {
        "success": True,
        "notifications": [n.to_dict() for n in rows],
        "unread_count": unread_count,
    }


@router.post("/notifications/{notif_id}/read")
async def mark_vendor_notification_read(
    notif_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Mark a vendor in-app notification as read (vendor-scoped)."""
    notif = db.query(VendorInAppNotification).filter(
        VendorInAppNotification.id == notif_id,
        VendorInAppNotification.vendor_profile_id == profile.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not notif.read_at:
        notif.read_at = datetime.utcnow()
        db.commit()
        db.refresh(notif)
    return {"success": True, "notification": notif.to_dict()}
