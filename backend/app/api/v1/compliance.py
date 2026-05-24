"""
Compliance API Router — Universal USAC form compliance analysis.
Supports Form 470, 471, 472 (BEAR), 474 (SPI), 486, 500, 498, and generic documents.
Includes audit history and re-analysis comparison.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging

from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ...core.security import get_current_user
from ...core.database import get_db
from ...models.user import User
from ...models.compliance_analysis import ComplianceAnalysis
from ...services.compliance.extractor import extract_text_from_pdf, extract_text_from_file
from ...services.compliance.forms import dispatch_analysis, VALID_FORM_TYPES

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
    severity: str
    area: str
    description: str
    suggestion: str
    rule_reference: Optional[str] = None
    source: Optional[str] = None
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


class ComparisonResponse(BaseModel):
    resolved_issues: List[dict] = []
    remaining_issues: List[dict] = []
    new_issues: List[dict] = []
    ready_to_submit: bool = False
    verdict: str = ""


class UniversalAnalysisResponse(BaseModel):
    analysis_id: int
    form_type: str
    form_number: Optional[str] = None
    overall_risk: str
    summary: Optional[str] = None
    findings: List[ComplianceFinding] = []
    rule_findings: List[RuleFindingResponse] = []
    llm_findings: List[ComplianceFinding] = []
    comparison: Optional[ComparisonResponse] = None
    created_at: str
    engine_version: Optional[str] = None
    disclaimer: str = "Advisory only. Not legal or USAC official guidance."


class ComplianceAnalysisResponse(BaseModel):
    """Legacy response model for backward compatibility."""
    overall_risk: str
    summary: Optional[str] = None
    findings: List[ComplianceFinding]
    rule_findings: List[RuleFindingResponse] = []
    llm_findings: List[ComplianceFinding] = []
    engine_version: Optional[str] = None
    disclaimer: str = "Advisory only. Not legal or USAC official guidance."


class HistoryListItem(BaseModel):
    id: int
    form_type: str
    form_number: Optional[str] = None
    overall_risk: str
    summary: Optional[str] = None
    primary_filename: str
    created_at: str
    has_reanalysis: bool = False


class HistoryDetailResponse(BaseModel):
    id: int
    form_type: str
    form_number: Optional[str] = None
    overall_risk: str
    summary: Optional[str] = None
    primary_filename: str
    supporting_filenames: Optional[List[str]] = None
    result_json: Optional[dict] = None
    engine_version: Optional[str] = None
    notes: Optional[str] = None
    prior_analysis_id: Optional[int] = None
    created_at: str


# ==================== HELPER: EXTRACT + VALIDATE ====================

async def _validate_and_extract_files(
    file: UploadFile,
    supporting_files: List[UploadFile],
) -> tuple[str, str, List[dict]]:
    """Validate files and extract text. Returns (document_text, filename, supporting_docs_text)."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are accepted for the primary document.",
        )

    if len(supporting_files) > MAX_SUPPORTING_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_SUPPORTING_FILES} supporting documents allowed.",
        )

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

    document_text = extract_text_from_pdf(pdf_bytes)
    if not document_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from PDF. The file may be image-based or corrupted.",
        )

    supporting_docs_text: List[dict] = []
    for sup_file in supporting_files:
        if not sup_file.filename:
            continue
        lower_name = sup_file.filename.lower()
        if not any(lower_name.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type for '{sup_file.filename}'. Accepted: PDF, DOCX, DOC, TXT.",
            )
        sup_bytes = await sup_file.read()
        if len(sup_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Supporting file '{sup_file.filename}' exceeds 10 MB limit.",
            )
        if len(sup_bytes) == 0:
            continue
        sup_text = extract_text_from_file(sup_bytes, sup_file.filename)
        if sup_text:
            supporting_docs_text.append({
                "filename": sup_file.filename,
                "text": sup_text,
            })
        else:
            logger.warning("Could not extract text from supporting file: %s", sup_file.filename)

    return document_text, file.filename or "unknown.pdf", supporting_docs_text


# ==================== UNIVERSAL ANALYZE ENDPOINT ====================

@router.post(
    "/analyze",
    response_model=UniversalAnalysisResponse,
    summary="Analyze any USAC form for compliance risk",
)
async def analyze_universal_endpoint(
    file: UploadFile = File(...),
    supporting_files: List[UploadFile] = File(default=[]),
    form_type: str = Form(default="470"),
    form_number: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    prior_analysis_id: Optional[int] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a USAC form PDF and receive a structured compliance risk assessment.
    Supports Form 470, 471, 472 (BEAR), 474 (SPI), 486, 500, 498, or generic documents.
    """
    if form_type not in VALID_FORM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid form_type. Must be one of: {', '.join(VALID_FORM_TYPES)}",
        )

    document_text, filename, supporting_docs_text = await _validate_and_extract_files(
        file, supporting_files
    )

    # Load prior findings if re-analyzing
    prior_findings = None
    if prior_analysis_id:
        prior_record = db.execute(
            select(ComplianceAnalysis).where(
                ComplianceAnalysis.id == prior_analysis_id,
                ComplianceAnalysis.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        if not prior_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Prior analysis not found or does not belong to you.",
            )
        prior_findings = prior_record.result_json

    # Dispatch to form-specific analyzer
    result = await dispatch_analysis(
        form_type=form_type,
        document_text=document_text,
        supporting_documents=supporting_docs_text if supporting_docs_text else None,
        metadata={"filename": filename, "form_number": form_number},
        prior_findings=prior_findings,
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis service unavailable. Please try again later.",
        )

    # Persist to database
    supporting_fnames = [d["filename"] for d in supporting_docs_text] if supporting_docs_text else None
    analysis_record = ComplianceAnalysis(
        user_id=current_user.id,
        form_type=form_type,
        form_number=form_number,
        primary_filename=filename,
        supporting_filenames=supporting_fnames,
        overall_risk=result.get("overall_risk", "Medium"),
        summary=result.get("summary"),
        result_json=result,
        engine_version=result.get("engine_version"),
        notes=notes,
        prior_analysis_id=prior_analysis_id,
    )
    db.add(analysis_record)
    db.commit()
    db.refresh(analysis_record)

    logger.info(
        "Compliance analysis completed: user=%s, form=%s, risk=%s, id=%d",
        current_user.id, form_type, result.get("overall_risk"), analysis_record.id,
    )

    # Build response
    comparison = None
    if result.get("comparison"):
        comparison = ComparisonResponse(**result["comparison"])

    rule_findings_parsed = []
    for rf in result.get("rule_findings", []):
        try:
            rule_findings_parsed.append(RuleFindingResponse(**rf))
        except Exception:
            pass

    return UniversalAnalysisResponse(
        analysis_id=analysis_record.id,
        form_type=form_type,
        form_number=form_number,
        overall_risk=result["overall_risk"],
        summary=result.get("summary"),
        findings=[ComplianceFinding(**f) for f in result.get("findings", [])],
        rule_findings=rule_findings_parsed,
        llm_findings=[ComplianceFinding(**lf) for lf in result.get("llm_findings", [])],
        comparison=comparison,
        created_at=analysis_record.created_at.isoformat(),
        engine_version=result.get("engine_version"),
        disclaimer=result.get("disclaimer", "Advisory only. Not legal or USAC official guidance."),
    )


# ==================== LEGACY ENDPOINT (backward compat) ====================

@router.post(
    "/form470/analyze",
    response_model=ComplianceAnalysisResponse,
    summary="[DEPRECATED] Analyze a Form 470 PDF",
)
async def analyze_form470_endpoint(
    file: UploadFile = File(...),
    supporting_files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEPRECATED: Use POST /api/v1/compliance/analyze with form_type=470 instead."""
    document_text, filename, supporting_docs_text = await _validate_and_extract_files(
        file, supporting_files
    )

    result = await dispatch_analysis(
        form_type="470",
        document_text=document_text,
        supporting_documents=supporting_docs_text if supporting_docs_text else None,
        metadata={"filename": filename},
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI analysis service unavailable. Please try again later.",
        )

    # Persist for audit
    try:
        supporting_fnames = [d["filename"] for d in supporting_docs_text] if supporting_docs_text else None
        analysis_record = ComplianceAnalysis(
            user_id=current_user.id,
            form_type="470",
            primary_filename=filename,
            supporting_filenames=supporting_fnames,
            overall_risk=result.get("overall_risk", "Medium"),
            summary=result.get("summary"),
            result_json=result,
            engine_version=result.get("engine_version"),
        )
        db.add(analysis_record)
        db.commit()
    except Exception as e:
        logger.warning("Failed to persist legacy analysis: %s", str(e))

    rule_findings_parsed = []
    for rf in result.get("rule_findings", []):
        try:
            rule_findings_parsed.append(RuleFindingResponse(**rf))
        except Exception:
            pass

    return ComplianceAnalysisResponse(
        overall_risk=result["overall_risk"],
        summary=result.get("summary"),
        findings=[ComplianceFinding(**f) for f in result.get("findings", [])],
        rule_findings=rule_findings_parsed,
        llm_findings=[ComplianceFinding(**lf) for lf in result.get("llm_findings", [])],
        engine_version=result.get("engine_version"),
        disclaimer=result.get("disclaimer", "Advisory only. Not legal or USAC official guidance."),
    )


# ==================== HISTORY ENDPOINTS ====================

@router.get(
    "/history",
    response_model=List[HistoryListItem],
    summary="List user's compliance analysis history",
)
async def list_history(
    form_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get paginated list of user's past compliance analyses."""
    query = select(ComplianceAnalysis).where(
        ComplianceAnalysis.user_id == current_user.id
    )
    if form_type and form_type in VALID_FORM_TYPES:
        query = query.where(ComplianceAnalysis.form_type == form_type)
    query = query.order_by(desc(ComplianceAnalysis.created_at)).offset(offset).limit(limit)

    results = db.execute(query).scalars().all()

    items = []
    for r in results:
        has_reanalysis = db.execute(
            select(ComplianceAnalysis.id).where(
                ComplianceAnalysis.prior_analysis_id == r.id
            ).limit(1)
        ).scalar_one_or_none() is not None

        items.append(HistoryListItem(
            id=r.id,
            form_type=r.form_type,
            form_number=r.form_number,
            overall_risk=r.overall_risk,
            summary=r.summary[:200] if r.summary else None,
            primary_filename=r.primary_filename,
            created_at=r.created_at.isoformat(),
            has_reanalysis=has_reanalysis,
        ))

    return items


@router.get(
    "/history/{analysis_id}",
    response_model=HistoryDetailResponse,
    summary="Get full details of a specific compliance analysis",
)
async def get_history_detail(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full details of a single analysis including result_json."""
    record = db.execute(
        select(ComplianceAnalysis).where(
            ComplianceAnalysis.id == analysis_id,
            ComplianceAnalysis.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found.",
        )

    return HistoryDetailResponse(
        id=record.id,
        form_type=record.form_type,
        form_number=record.form_number,
        overall_risk=record.overall_risk,
        summary=record.summary,
        primary_filename=record.primary_filename,
        supporting_filenames=record.supporting_filenames,
        result_json=record.result_json,
        engine_version=record.engine_version,
        notes=record.notes,
        prior_analysis_id=record.prior_analysis_id,
        created_at=record.created_at.isoformat(),
    )


@router.delete(
    "/history/{analysis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a compliance analysis from history",
)
async def delete_history(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user's own analysis."""
    record = db.execute(
        select(ComplianceAnalysis).where(
            ComplianceAnalysis.id == analysis_id,
            ComplianceAnalysis.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found.",
        )

    db.delete(record)
    db.commit()
    return None
