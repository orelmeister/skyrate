"""
Portfolio Analyzer API Endpoint
Admin-only endpoint for universal CRN/BEN/SPIN portfolio analysis.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from typing import Optional, List
import logging
import traceback

from ...core.security import require_role
from ...models.user import User

router = APIRouter(prefix="/admin", tags=["Portfolio Analyzer"])

logger = logging.getLogger(__name__)

# ==================== SCHEMAS ====================

class PortfolioReportRequest(BaseModel):
    lookup_type: str  # "crn", "ben", or "spin"
    lookup_value: str
    funding_years: Optional[List[int]] = None

    @field_validator("lookup_type")
    @classmethod
    def validate_lookup_type(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ("crn", "ben", "spin"):
            raise ValueError("lookup_type must be 'crn', 'ben', or 'spin'")
        return v

    @field_validator("lookup_value")
    @classmethod
    def validate_lookup_value(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("lookup_value cannot be empty")
        return v


# ==================== DEPENDENCIES ====================

AdminUser = Depends(require_role("admin", "super"))


# ==================== ENDPOINTS ====================

@router.post("/portfolio-report")
async def generate_portfolio_report(
    request: PortfolioReportRequest,
    current_user: User = AdminUser,
):
    """
    Generate a comprehensive E-Rate portfolio report for a CRN, BEN, or SPIN.
    Admin/Super role required.
    """
    logger.info(
        f"[Portfolio Report] User {current_user.email} requested "
        f"{request.lookup_type} report for: {request.lookup_value}"
    )

    try:
        from ...services.portfolio_analyzer_service import PortfolioAnalyzerService

        service = PortfolioAnalyzerService()
        result = service.analyze(
            lookup_type=request.lookup_type,
            lookup_value=request.lookup_value,
            funding_years=request.funding_years,
        )

        return {
            "success": True,
            **result,
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"[Portfolio Report] Error: {e}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate portfolio report: {str(e)}",
        )
