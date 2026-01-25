"""
Query API Endpoints
Handles natural language queries and direct USAC searches
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import sys
import os
import math


def sanitize_for_json(data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sanitize data to ensure it's JSON serializable.
    Replaces NaN, Infinity, and -Infinity with None.
    """
    def clean_value(v):
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v):
                return None
        return v
    
    return [
        {k: clean_value(v) for k, v in record.items()}
        for record in data
    ]

# Add skyrate-ai to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', 'skyrate-ai'))

from ...core.database import get_db
from ...core.security import get_current_user
from ...models.user import User
from ...models.application import QueryHistory

router = APIRouter(prefix="/query", tags=["Query"])


# ==================== SCHEMAS ====================

class QueryRequest(BaseModel):
    query: str
    year: Optional[int] = None
    limit: int = 100


class DirectSearchRequest(BaseModel):
    year: Optional[int] = None
    state: Optional[str] = None
    status: Optional[str] = None
    ben: Optional[str] = None
    service_type: Optional[str] = None
    applicant_name: Optional[str] = None
    consultant_name: Optional[str] = None
    limit: int = 100


class AnalysisRequest(BaseModel):
    records: List[Dict[str, Any]]
    analysis_type: str = "standard"
    custom_prompt: Optional[str] = None


# ==================== ENDPOINTS ====================

@router.post("/natural")
async def natural_language_query(
    data: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Process a natural language query about E-Rate data.
    Uses AI to interpret the query and fetch relevant data.
    """
    try:
        from utils.usac_client import USACDataClient
        from utils.ai_models import AIModelManager
        
        # Initialize
        client = USACDataClient()
        ai_manager = AIModelManager()
        
        # Interpret query with AI
        interpretation = ai_manager.interpret_query(data.query)
        
        if not interpretation:
            interpretation = {
                "year": str(data.year) if data.year else None,
                "filters": {},
                "explanation": f"Searching for: {data.query}"
            }
        
        # Extract filters
        filters = interpretation.get("filters", {})
        year = data.year or (int(interpretation.get("year")) if interpretation.get("year") else None)
        
        # Fetch data
        df = client.fetch_data(year=year, filters=filters, limit=data.limit)
        
        # Convert to list and sanitize for JSON (handle NaN values)
        results = sanitize_for_json(df.to_dict('records')) if not df.empty else []
        
        # Generate title for history
        title = interpretation.get("explanation", data.query)[:100]
        
        # Save to history
        history = QueryHistory(
            user_id=current_user.id,
            query_text=data.query,
            display_title=title,
            interpretation=interpretation,
            results_count=len(results)
        )
        db.add(history)
        db.commit()
        
        return {
            "success": True,
            "interpretation": interpretation,
            "count": len(results),
            "data": results
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query failed: {str(e)}"
        )


@router.post("/search")
async def direct_search(
    data: DirectSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Direct search with explicit filters (no AI interpretation).
    Faster for known queries.
    """
    try:
        from utils.usac_client import USACDataClient
        
        client = USACDataClient()
        filters = {}
        
        if data.state:
            filters["state"] = data.state.upper()
        if data.status:
            filters["application_status"] = data.status
        if data.ben:
            filters["ben"] = data.ben
        if data.service_type:
            filters["form_471_service_type_name"] = data.service_type
        if data.applicant_name:
            filters["organization_name"] = data.applicant_name
        if data.consultant_name:
            filters["cnct_name"] = data.consultant_name
        
        df = client.fetch_data(year=data.year, filters=filters, limit=data.limit)
        results = sanitize_for_json(df.to_dict('records')) if not df.empty else []
        
        # Save to history
        history = QueryHistory(
            user_id=current_user.id,
            query_text=f"Direct search: {filters}",
            display_title=f"Search: {data.state or ''} {data.status or ''} {data.year or ''}".strip(),
            interpretation={"filters": filters, "year": data.year},
            results_count=len(results)
        )
        db.add(history)
        db.commit()
        
        return {
            "success": True,
            "count": len(results),
            "data": results
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/analyze")
async def analyze_records(
    data: AnalysisRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Perform AI analysis on selected records.
    Supports standard analysis, denial analysis, and custom prompts.
    """
    if not data.records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No records provided for analysis"
        )
    
    try:
        from utils.ai_models import AIModelManager
        
        ai_manager = AIModelManager()
        
        if data.analysis_type == "denial":
            from utils.denial_analyzer import DenialAnalyzer
            from utils.usac_client import USACDataClient
            
            client = USACDataClient()
            analyzer = DenialAnalyzer(client)
            
            analyses = []
            for record in data.records[:10]:  # Limit to 10 records
                frn = record.get("funding_request_number")
                if frn:
                    details = analyzer.fetch_denial_details(frn)
                    if details:
                        analyses.append(details)
            
            return {
                "success": True,
                "analysis_type": "denial",
                "analyses": analyses
            }
        
        else:
            # Standard or custom analysis
            prompt = data.custom_prompt or "Analyze these E-Rate funding records and provide insights on patterns, issues, and recommendations."
            
            analysis = ai_manager.deep_analysis(
                str(data.records[:20]),  # Limit context size
                prompt
            )
            
            return {
                "success": True,
                "analysis_type": data.analysis_type,
                "analysis": analysis
            }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )


@router.get("/history")
async def get_query_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's query history"""
    history = db.query(QueryHistory).filter(
        QueryHistory.user_id == current_user.id
    ).order_by(QueryHistory.executed_at.desc()).limit(limit).all()
    
    return {
        "success": True,
        "count": len(history),
        "history": [h.to_dict() for h in history]
    }


@router.delete("/history/{query_id}")
async def delete_query_history(
    query_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a query from history"""
    query = db.query(QueryHistory).filter(
        QueryHistory.id == query_id,
        QueryHistory.user_id == current_user.id
    ).first()
    
    if not query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Query not found"
        )
    
    db.delete(query)
    db.commit()
    
    return {"success": True, "message": "Query deleted"}
