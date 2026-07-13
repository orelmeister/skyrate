"""
Compliance API Router — Universal USAC form compliance analysis.
Supports Form 470, 471, 472 (BEAR), 474 (SPI), 486, 500, 498, and generic documents.
Includes audit history and re-analysis comparison.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import json
import logging

from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from ...core.security import get_current_user
from ...core.database import get_db
from ...models.user import User
from ...models.compliance_analysis import ComplianceAnalysis
from ...services.compliance.extractor import extract_text_from_pdf, extract_text_from_file
from ...services.compliance.forms import dispatch_analysis, VALID_FORM_TYPES
from ...services.compliance.bid_analysis import analyze_bids, DEFAULT_WEIGHTS, METRIC_LABELS

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


# ==================== BID ANALYSIS ====================

class BidScoreBreakdown(BaseModel):
    price: float
    tco: float
    technical: float
    support: float
    experience: float


class BidEvaluation(BaseModel):
    source_index: int
    rank: int
    filename: str
    vendor_name: str
    total_price: Optional[float] = None
    monthly_cost: Optional[float] = None
    one_time_cost: Optional[float] = None
    contract_term: Optional[str] = None
    products_services: List[str] = []
    key_specs: List[str] = []
    notable_terms: List[str] = []
    scores: BidScoreBreakdown
    weighted_total: float
    rationale: str = ""


class BidRankingItem(BaseModel):
    rank: int
    vendor_name: str
    weighted_total: float
    source_index: int


class BidAnalysisResponse(BaseModel):
    bids: List[BidEvaluation] = []
    ranking: List[BidRankingItem] = []
    winner: Optional[BidEvaluation] = None
    weights: Dict[str, float]
    metric_labels: Dict[str, str]
    price_is_primary: bool
    rationale: str = ""
    compliance_note: str = ""
    engine_version: Optional[str] = None
    disclaimer: str = "Advisory only. Not legal or USAC official guidance."


# Max bid files per request
MAX_BID_FILES = 8


@router.post(
    "/bid-analysis",
    response_model=BidAnalysisResponse,
    summary="Score and rank competing vendor bids received for a Form 470",
)
async def bid_analysis_endpoint(
    bids: List[UploadFile] = File(...),
    weights: Optional[str] = Form(default=None),
    form470_reference: Optional[str] = Form(default=None),
    form470_file: Optional[UploadFile] = File(default=None),
    current_user: User = Depends(get_current_user),
):
    """
    Upload the competing vendor bids received in response to a Form 470 and receive an
    AI-scored, ranked comparison. Price is enforced as the primary (most heavily weighted)
    evaluation factor per FCC Order 19-117.

    - **bids**: 2-8 bid files (PDF, DOCX, DOC, TXT), max 10 MB each.
    - **weights**: optional JSON string of metric weights, e.g.
      `{"price": 60, "tco": 15, "technical": 15, "support": 5, "experience": 5}`.
    - **form470_reference**: optional text describing the Form 470 scope/requirements.
    - **form470_file**: optional Form 470 / RFP document (PDF, DOCX, DOC, TXT). Its text is
      used as the requirements yardstick to judge each bid against — it is NOT scored as a bid.
    """
    real_bids = [b for b in bids if b and b.filename]
    if len(real_bids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload at least 2 bid files to compare.",
        )
    if len(real_bids) > MAX_BID_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_BID_FILES} bid files allowed per analysis.",
        )

    parsed_weights: Optional[dict] = None
    if weights:
        try:
            parsed_weights = json.loads(weights)
            if not isinstance(parsed_weights, dict):
                parsed_weights = None
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="'weights' must be a valid JSON object.",
            )

    bid_docs: List[dict] = []
    for bid_file in real_bids:
        lower_name = (bid_file.filename or "").lower()
        if not any(lower_name.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type for '{bid_file.filename}'. Accepted: PDF, DOCX, DOC, TXT.",
            )
        raw = await bid_file.read()
        if len(raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Bid file '{bid_file.filename}' exceeds 10 MB limit.",
            )
        if len(raw) == 0:
            continue
        text = extract_text_from_file(raw, bid_file.filename)
        if not text:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not extract text from '{bid_file.filename}'. It may be image-based or corrupted.",
            )
        bid_docs.append({"filename": bid_file.filename, "text": text})

    if len(bid_docs) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract readable text from at least 2 bids.",
        )

    # Optional Form 470 / RFP document. Its text becomes the requirements yardstick the AI
    # judges each bid against — it is NEVER added to the bid set (that was the bug that made
    # an uploaded RFP get scored as a losing bid).
    combined_reference = (form470_reference or "").strip()
    if form470_file and form470_file.filename:
        ref_name = form470_file.filename.lower()
        if not any(ref_name.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported Form 470 / RFP file type '{form470_file.filename}'. Accepted: PDF, DOCX, DOC, TXT.",
            )
        ref_raw = await form470_file.read()
        if len(ref_raw) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Form 470 / RFP file '{form470_file.filename}' exceeds 10 MB limit.",
            )
        if ref_raw:
            ref_text = extract_text_from_file(ref_raw, form470_file.filename)
            if not ref_text:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Could not extract text from Form 470 / RFP '{form470_file.filename}'. It may be image-based or corrupted.",
                )
            combined_reference = (
                f"{combined_reference}\n\n{ref_text}".strip() if combined_reference else ref_text
            )

    result = await analyze_bids(
        bids=bid_docs,
        weights=parsed_weights,
        form470_reference=combined_reference or None,
    )

    if not result or not result.get("bids"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.get("rationale") if result else "AI bid analysis unavailable. Please try again later.",
        )

    logger.info(
        "Bid analysis completed: user=%s, bids=%d, winner=%s",
        current_user.id, len(result.get("bids", [])),
        (result.get("winner") or {}).get("vendor_name"),
    )

    result["metric_labels"] = METRIC_LABELS
    return BidAnalysisResponse(**result)


# ==================== FORM 470 28-DAY BID WINDOW ====================

@router.get(
    "/form470-window/{application_number}",
    summary="Check the 28-day competitive bidding window for a Form 470",
)
async def form470_bid_window(
    application_number: str,
    current_user: User = Depends(get_current_user),
):
    """
    Look up a Form 470's Allowable Contract Date (ACD) — the earliest date an
    applicant may close competitive bidding, evaluate bids and select a vendor
    (28 days after the 470 is posted, per FCC rules). Returns whether the
    bid-evaluation window is still locked (today < ACD) and the unlock date.

    Fail-open: if the 470 can't be found or the ACD can't be parsed, ``locked``
    is False so the tool never blocks a user on a lookup error.
    """
    app_num = (application_number or "").strip()
    if not app_num:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Application number required.",
        )

    def _parse_date(val):
        if not val:
            return None
        s = str(val).strip()
        if not s:
            return None
        # USAC returns ISO like '2026-02-12T00:00:00.000'
        s = s.replace("Z", "").split("T")[0].split(" ")[0]
        for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        return None

    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        detail = client.get_470_detail(app_num)
    except Exception as e:
        logger.warning("form470-window lookup failed for %s: %s", app_num, e)
        return {
            "success": False,
            "application_number": app_num,
            "found": False,
            "locked": False,
            "message": "Could not look up this Form 470. Bid evaluation is not blocked.",
        }

    if not detail or not detail.get("success"):
        return {
            "success": False,
            "application_number": app_num,
            "found": False,
            "locked": False,
            "message": "Form 470 not found. Double-check the application number.",
        }

    acd = _parse_date(detail.get("allowable_contract_date"))
    posting = _parse_date(detail.get("posting_date"))
    today = datetime.utcnow().date()

    locked = bool(acd and today < acd)
    days_remaining = (acd - today).days if (acd and locked) else 0

    if locked:
        message = (
            f"Bid evaluation is locked until {acd.isoformat()} — the 28-day "
            f"competitive bidding window has not closed."
        )
    elif acd:
        message = (
            f"The 28-day competitive bidding window closed on {acd.isoformat()}. "
            f"You may evaluate bids and select a vendor."
        )
    else:
        message = (
            "No Allowable Contract Date on file for this Form 470; bid evaluation "
            "is not blocked."
        )

    return {
        "success": True,
        "application_number": app_num,
        "found": True,
        "entity_name": (detail.get("entity") or {}).get("name"),
        "status": detail.get("status"),
        "posting_date": posting.isoformat() if posting else None,
        "allowable_contract_date": acd.isoformat() if acd else None,
        "locked": locked,
        "days_remaining": days_remaining,
        "message": message,
    }


# ==================== FORM 471 FILING WINDOW GUARDRAIL ====================

@router.get(
    "/form471-window",
    summary="Check whether the annual Form 471 filing window is open",
)
async def form471_filing_window(
    current_user: User = Depends(get_current_user),
):
    """
    Compute the current/next USAC Form 471 application filing window.

    USAC opens the Form 471 window once a year (historically mid-January) and
    closes it in late March. Applicants cannot file a Form 471 — or finalize
    Category 2 vendor selections tied to that funding year — until the window
    opens. This guardrail is *forward-looking*: it derives the next window from
    today's date rather than a hard-coded past year.

    Exact USAC dates for future funding years are not published far in advance,
    so ``expected`` is True and the returned dates are estimates until USAC
    confirms the official window.
    """
    from datetime import date, timedelta

    def _window(year: int):
        # USAC historically opens mid-January and closes late March.
        return date(year, 1, 15), date(year, 3, 28)

    today = datetime.utcnow().date()
    year = today.year
    opens_on, closes_on = _window(year)
    if today > closes_on:
        # This year's window has already closed; the next one is next January.
        year += 1
        opens_on, closes_on = _window(year)

    window_open = opens_on <= today <= closes_on
    days_until_open = (opens_on - today).days if today < opens_on else 0
    days_remaining = (closes_on - today).days if window_open else 0

    if window_open:
        message = (
            f"The FY{year} Form 471 filing window is open "
            f"(estimated {opens_on.isoformat()} - {closes_on.isoformat()}). "
            f"You may file Form 471 and finalize Category 2 vendor selections."
        )
    else:
        message = (
            f"The FY{year} Form 471 filing window has not opened yet. USAC "
            f"typically opens the window in mid-January; the expected window is "
            f"{opens_on.isoformat()} - {closes_on.isoformat()} "
            f"(about {days_until_open} days away). Hold off on filing Form 471 or "
            f"finalizing Category 2 vendor selection until the window opens."
        )

    return {
        "success": True,
        "funding_year": year,
        "window_open": window_open,
        "opens_on": opens_on.isoformat(),
        "closes_on": closes_on.isoformat(),
        "expected": True,
        "days_until_open": days_until_open,
        "days_remaining": days_remaining,
        "today": today.isoformat(),
        "message": message,
    }


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
