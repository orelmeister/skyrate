"""
Schools API Endpoints
Provides school enrichment data from USAC APIs
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import json
import os

from ...core.database import get_db
from ...core.security import get_current_user, require_role
from ...models.user import User
from ...services.usac_service import get_usac_service

router = APIRouter(prefix="/schools", tags=["Schools"])

# Simple file-based cache for USAC enrichment data
CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'data', 'cache')
CACHE_TTL_HOURS = 24  # Cache data for 24 hours


def get_cache_path(ben: str) -> str:
    """Get cache file path for a BEN"""
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"ben_{ben}.json")


def get_cached_data(ben: str) -> Optional[Dict[str, Any]]:
    """Get cached enrichment data for a BEN if not expired"""
    cache_path = get_cache_path(ben)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r') as f:
                cached = json.load(f)
                cached_time = datetime.fromisoformat(cached.get('_cached_at', '2000-01-01'))
                if datetime.utcnow() - cached_time < timedelta(hours=CACHE_TTL_HOURS):
                    return cached
        except Exception:
            pass
    return None


def save_to_cache(ben: str, data: Dict[str, Any]):
    """Save enrichment data to cache"""
    cache_path = get_cache_path(ben)
    try:
        data['_cached_at'] = datetime.utcnow().isoformat()
        with open(cache_path, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    except Exception:
        pass  # Silently fail cache writes


@router.get("/{ben}")
async def get_school_info(
    ben: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get basic school information by BEN.
    Returns cached data or fetches from USAC.
    """
    # Check cache first
    cached = get_cached_data(ben)
    if cached and cached.get('organization_name'):
        return {
            "success": True,
            "source": "cache",
            "data": {
                "ben": ben,
                "school_name": cached.get('organization_name'),
                "entity_type": cached.get('entity_type'),
                "state": cached.get('state'),
                "city": cached.get('city'),
                "zip_code": cached.get('zip_code'),
                "status": cached.get('status', 'Unknown'),
            }
        }
    
    # Fetch from USAC
    usac_service = get_usac_service()
    
    try:
        # Get recent Form 471 data for this BEN
        applications = usac_service.fetch_form_471(
            filters={"ben": ben},
            limit=10
        )
        
        if not applications:
            raise HTTPException(
                status_code=404,
                detail=f"BEN {ben} not found in USAC database"
            )
        
        # Get most recent record
        latest = max(applications, key=lambda x: int(x.get('funding_year', 0) or 0))
        
        # Determine status from applications
        statuses = [app.get('application_status', '').lower() for app in applications]
        if any('denied' in s for s in statuses):
            status = "Has Denials"
        elif any('funded' in s for s in statuses):
            status = "Funded"
        elif any('pending' in s or 'review' in s for s in statuses):
            status = "Pending"
        else:
            status = "Active"
        
        result = {
            "ben": ben,
            "school_name": latest.get('organization_name') or latest.get('billed_entity_name'),
            "entity_type": latest.get('organization_entity_type_name') or latest.get('entity_type'),
            "state": latest.get('physical_state') or latest.get('state'),
            "city": latest.get('city'),
            "zip_code": latest.get('zip_code'),
            "status": status,
            "latest_year": latest.get('funding_year'),
            "applications_count": len(applications),
        }
        
        # Cache the result
        save_to_cache(ben, result)
        
        return {
            "success": True,
            "source": "usac",
            "data": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching school data: {str(e)}"
        )


@router.get("/{ben}/enrich")
async def enrich_school(
    ben: str,
    force_refresh: bool = Query(False, description="Force refresh from USAC (ignore cache)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get comprehensive enriched school data from USAC.
    
    Returns:
    - Entity information (name, type, address)
    - Funding history
    - Application statuses
    - Total committed funding
    - Active funding years
    """
    # Check cache unless force refresh
    if not force_refresh:
        cached = get_cached_data(ben)
        if cached and cached.get('_enriched'):
            return {
                "success": True,
                "source": "cache",
                "cached_at": cached.get('_cached_at'),
                "data": cached
            }
    
    usac_service = get_usac_service()
    
    try:
        # Fetch comprehensive data
        enriched = usac_service.enrich_ben(ben)
        
        if not enriched or not enriched.get('organization_name'):
            raise HTTPException(
                status_code=404,
                detail=f"BEN {ben} not found in USAC database"
            )
        
        # Mark as fully enriched and cache
        enriched['_enriched'] = True
        save_to_cache(ben, enriched)
        
        return {
            "success": True,
            "source": "usac",
            "data": enriched
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error enriching school data: {str(e)}"
        )


@router.get("/{ben}/history")
async def get_school_history(
    ben: str,
    years: int = Query(5, description="Number of years of history to fetch"),
    current_user: User = Depends(get_current_user)
):
    """
    Get funding history for a school.
    
    Returns:
    - Year-by-year funding data
    - Application statuses per year
    - Total amounts committed and disbursed
    """
    usac_service = get_usac_service()
    
    try:
        # Get all Form 471 applications
        applications = usac_service.fetch_form_471(
            filters={"ben": ben},
            limit=500
        )
        
        if not applications:
            raise HTTPException(
                status_code=404,
                detail=f"No funding history found for BEN {ben}"
            )
        
        # Group by funding year
        by_year = {}
        for app in applications:
            year = app.get('funding_year')
            if not year:
                continue
            
            if year not in by_year:
                by_year[year] = {
                    'year': year,
                    'applications': [],
                    'total_requested': 0,
                    'total_committed': 0,
                    'has_funded': False,
                    'has_denied': False,
                    'categories': set(),
                }
            
            by_year[year]['applications'].append({
                'application_number': app.get('application_number'),
                'frn': app.get('funding_request_number'),
                'status': app.get('application_status'),
                'service_type': app.get('service_type'),
                'requested': app.get('original_total_pre_discount_costs'),
                'committed': app.get('funding_commitment_request'),
            })
            
            status = (app.get('application_status') or '').lower()
            if 'funded' in status:
                by_year[year]['has_funded'] = True
            if 'denied' in status:
                by_year[year]['has_denied'] = True
            
            try:
                by_year[year]['total_requested'] += float(app.get('original_total_pre_discount_costs') or 0)
                by_year[year]['total_committed'] += float(app.get('funding_commitment_request') or 0)
            except (ValueError, TypeError):
                pass
            
            cat = app.get('service_type') or app.get('form_471_category')
            if cat:
                by_year[year]['categories'].add(cat)
        
        # Convert sets to lists and sort
        for year_data in by_year.values():
            year_data['categories'] = list(year_data['categories'])
        
        # Sort by year descending
        sorted_years = sorted(by_year.keys(), reverse=True)[:years]
        history = [by_year[y] for y in sorted_years]
        
        # Calculate totals
        total_committed = sum(y['total_committed'] for y in history)
        total_requested = sum(y['total_requested'] for y in history)
        
        return {
            "success": True,
            "ben": ben,
            "years_count": len(history),
            "total_committed": total_committed,
            "total_requested": total_requested,
            "history": history
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching funding history: {str(e)}"
        )


@router.get("/{ben}/applications")
async def get_school_applications(
    ben: str,
    year: Optional[int] = Query(None, description="Filter by funding year"),
    status: Optional[str] = Query(None, description="Filter by status (funded, denied, pending)"),
    current_user: User = Depends(get_current_user)
):
    """
    Get all Form 471 applications for a school.
    """
    usac_service = get_usac_service()
    
    try:
        filters = {"ben": ben}
        
        applications = usac_service.fetch_form_471(
            year=year,
            filters=filters,
            limit=500
        )
        
        if not applications:
            return {
                "success": True,
                "count": 0,
                "applications": []
            }
        
        # Filter by status if specified
        if status:
            status_lower = status.lower()
            applications = [
                app for app in applications
                if status_lower in (app.get('application_status') or '').lower()
            ]
        
        # Sort by year descending
        applications = sorted(
            applications,
            key=lambda x: (int(x.get('funding_year', 0) or 0), x.get('application_number', '')),
            reverse=True
        )
        
        return {
            "success": True,
            "count": len(applications),
            "applications": applications
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching applications: {str(e)}"
        )


@router.post("/{ben}/refresh-cache")
async def refresh_school_cache(
    ben: str,
    current_user: User = Depends(require_role("admin", "consultant"))
):
    """
    Force refresh cached data for a school.
    Requires consultant or admin role.
    """
    # Delete existing cache
    cache_path = get_cache_path(ben)
    if os.path.exists(cache_path):
        os.remove(cache_path)
    
    # Fetch fresh data
    usac_service = get_usac_service()
    
    try:
        enriched = usac_service.enrich_ben(ben)
        
        if enriched:
            enriched['_enriched'] = True
            save_to_cache(ben, enriched)
            
            return {
                "success": True,
                "message": f"Cache refreshed for BEN {ben}",
                "data": enriched
            }
        else:
            return {
                "success": False,
                "message": f"No data found for BEN {ben}"
            }
            
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error refreshing cache: {str(e)}"
        )
