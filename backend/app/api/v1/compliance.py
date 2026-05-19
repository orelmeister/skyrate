"""
Compliance API Router — Form 470 pre-review endpoints.
Phase 0: Upload PDF → extract text → LLM analysis → structured findings.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from typing import List, Optional
import logging

from ...core.security import get_current_user
from ...models.user import User
from ...services.compliance.extractor import extract_text_from_pdf
from ...services.compliance.analyzer import analyze_form470

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["Compliance"])

# 10 MB upload limit
MAX_FILE_SIZE = 10 * 1024 * 1024


# ==================== RESPONSE MODELS ====================

class ComplianceFinding(BaseModel):
    severity: str  # "low", "medium", "high"
    area: str
    description: str
    suggestion: str
    rule_reference: Optional[str] = None


class ComplianceAnalysisResponse(BaseModel):
    overall_risk: str  # "Low", "Medium", "High"
    summary: Optional[str] = None
    findings: List[ComplianceFinding]


# ==================== ENDPOINTS ====================

@router.post(
    "/form470/analyze",
    response_model=ComplianceAnalysisResponse,
    summary="Analyze a Form 470 PDF for compliance risk",
)
async def analyze_form470_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a Form 470 PDF and receive a structured compliance risk assessment.

    Returns USAC issue risk level and specific findings with suggestions.
    This is an advisory tool only — not a guarantee of USAC approval or denial.
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted.",
        )

    # Validate content type
    if file.content_type and file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted.",
        )

    # Read and validate file size
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit.",
        )

    if len(pdf_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # Extract text from PDF
    document_text = extract_text_from_pdf(pdf_bytes)
    if not document_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from PDF. The file may be image-based or corrupted.",
        )

    # Analyze with Gemini
    result = await analyze_form470(document_text)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis service unavailable. Please try again later.",
        )

    logger.info(
        "Compliance analysis completed for user %s: risk=%s, findings=%d",
        current_user.id,
        result.get("overall_risk"),
        len(result.get("findings", [])),
    )

    return ComplianceAnalysisResponse(
        overall_risk=result["overall_risk"],
        summary=result.get("summary"),
        findings=[ComplianceFinding(**f) for f in result.get("findings", [])],
    )
