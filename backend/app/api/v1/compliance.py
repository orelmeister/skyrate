"""
Compliance API Router — Form 470 pre-review endpoints.
Phase 1: Upload PDF → extract text → deterministic rules + LLM analysis → structured findings.
Supports optional supporting documents (RFPs, addenda, vendor bids, etc.) for cross-document analysis.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from typing import List, Optional
import logging

from ...core.security import get_current_user
from ...models.user import User
from ...services.compliance.extractor import extract_text_from_pdf, extract_text_from_file
from ...services.compliance.analyzer import analyze_form470

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compliance", tags=["Compliance"])

# 10 MB upload limit per file
MAX_FILE_SIZE = 10 * 1024 * 1024
# Max 5 supporting documents
MAX_SUPPORTING_FILES = 5
# Supported file extensions for supporting docs
SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".doc", ".txt")


# ==================== RESPONSE MODELS ====================

class ComplianceFinding(BaseModel):
    severity: str  # "low", "medium", "high"
    area: str
    description: str
    suggestion: str
    rule_reference: Optional[str] = None
    source: Optional[str] = None  # "rule_engine" or "llm"
    rule_id: Optional[str] = None


class RuleFindingResponse(BaseModel):
    rule_id: str
    rule_version: str
    severity: str
    area: str
    description: str
    suggestion: str
    rule_reference: str
    confidence: float
    evidence_snippet: Optional[str] = None


class ComplianceAnalysisResponse(BaseModel):
    overall_risk: str  # "Low", "Medium", "High"
    summary: Optional[str] = None
    findings: List[ComplianceFinding]
    rule_findings: List[RuleFindingResponse] = []
    llm_findings: List[ComplianceFinding] = []
    engine_version: Optional[str] = None
    disclaimer: str = "Advisory only. Not legal or USAC official guidance."


# ==================== ENDPOINTS ====================

@router.post(
    "/form470/analyze",
    response_model=ComplianceAnalysisResponse,
    summary="Analyze a Form 470 PDF for compliance risk",
)
async def analyze_form470_endpoint(
    file: UploadFile = File(...),
    supporting_files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a Form 470 PDF and receive a structured compliance risk assessment.
    Optionally attach supporting documents (RFPs, addenda, vendor bids, scope-of-work)
    for cross-document compliance analysis.

    Returns USAC issue risk level and specific findings with suggestions.
    This is an advisory tool only — not a guarantee of USAC approval or denial.
    """
    # Validate primary file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted for the primary Form 470.",
        )

    # Validate content type
    if file.content_type and file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted for the primary Form 470.",
        )

    # Validate supporting file count
    if len(supporting_files) > MAX_SUPPORTING_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_SUPPORTING_FILES} supporting documents allowed.",
        )

    # Read and validate primary file size
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

    # Extract text from primary PDF
    document_text = extract_text_from_pdf(pdf_bytes)
    if not document_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from PDF. The file may be image-based or corrupted.",
        )

    # Process supporting documents
    supporting_docs_text: List[dict] = []
    for idx, sup_file in enumerate(supporting_files):
        if not sup_file.filename:
            continue

        # Validate extension
        lower_name = sup_file.filename.lower()
        if not any(lower_name.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type for '{sup_file.filename}'. Accepted: PDF, DOCX, DOC, TXT.",
            )

        # Read and validate size
        sup_bytes = await sup_file.read()
        if len(sup_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Supporting file '{sup_file.filename}' exceeds 10 MB limit.",
            )

        if len(sup_bytes) == 0:
            continue  # Skip empty files silently

        # Extract text
        sup_text = extract_text_from_file(sup_bytes, sup_file.filename)
        if sup_text:
            supporting_docs_text.append({
                "filename": sup_file.filename,
                "text": sup_text,
            })
        else:
            logger.warning(
                "Could not extract text from supporting file: %s", sup_file.filename
            )

    # Analyze with rule engine + Gemini
    result = await analyze_form470(
        document_text,
        {"filename": file.filename},
        supporting_documents=supporting_docs_text if supporting_docs_text else None,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis service unavailable. Please try again later.",
        )

    logger.info(
        "Compliance analysis completed for user %s: risk=%s, rule_findings=%d, llm_findings=%d, supporting_docs=%d",
        current_user.id,
        result.get("overall_risk"),
        len(result.get("rule_findings", [])),
        len(result.get("llm_findings", [])),
        len(supporting_docs_text),
    )

    return ComplianceAnalysisResponse(
        overall_risk=result["overall_risk"],
        summary=result.get("summary"),
        findings=[ComplianceFinding(**f) for f in result.get("findings", [])],
        rule_findings=[RuleFindingResponse(**rf) for rf in result.get("rule_findings", [])],
        llm_findings=[ComplianceFinding(**lf) for lf in result.get("llm_findings", [])],
        engine_version=result.get("engine_version"),
        disclaimer=result.get("disclaimer", "Advisory only. Not legal or USAC official guidance."),
    )
