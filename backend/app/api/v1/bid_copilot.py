"""
Bid Compliance Copilot API — vendor-side pre-submission bid scoring.

Prefix: /vendor/bid-copilot  (reached from the frontend as /api/v1/vendor/bid-copilot/...)

A vendor uploads their bid and picks the Form 470 they're responding to; we pull
the 470 + requested services + RFP links, run the deterministic + RAG + grounded-LLM
pipeline, and return a 0-100 compliance score with cited findings and a refined draft.
"""

import io
import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...core.security import require_role
from ...models.user import User
from ...models.vendor import VendorProfile
from ...models.bid_copilot import VendorBidAnalysis, AppealPrecedent
from ...services.compliance.extractor import extract_text_from_file
from ...services.bid_copilot import service as copilot
from ...services.bid_copilot.knowledge_base import seed_knowledge_base
from .vendor import get_vendor_profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vendor/bid-copilot", tags=["Vendor Bid Copilot"])

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".doc", ".txt")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_BID_STORE = 50_000  # keep stored bid text within MySQL TEXT bounds


class RefineRequest(BaseModel):
    message: str


# ==================== 470 CONTEXT ====================

@router.get("/470-context")
async def get_470_context(
    form470: str,
    profile: VendorProfile = Depends(get_vendor_profile),
):
    """Pull the Form 470 + requested services + RFP links for the picker."""
    form_470 = (form470 or "").strip()
    if not form_470:
        raise HTTPException(status_code=400, detail="form470 is required")
    ctx = await _run_in_threadpool_ctx(form_470)
    return {"success": True, "context": ctx}


async def _run_in_threadpool_ctx(form_470: str):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(copilot.build_470_context, form_470)


# ==================== ANALYZE ====================

@router.post("/analyze")
async def analyze(
    bid: UploadFile = File(...),
    form_470_number: str = Form(...),
    rfp_file: Optional[UploadFile] = File(default=None),
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Upload a bid + target 470 -> run the full pipeline -> score + findings."""
    form_470 = (form_470_number or "").strip()
    if not form_470:
        raise HTTPException(status_code=400, detail="form_470_number is required")

    # --- read + extract bid text ---
    name = (bid.filename or "").lower()
    if not any(name.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
        raise HTTPException(status_code=400,
                            detail=f"Unsupported file type for '{bid.filename}'. Accepted: PDF, DOCX, DOC, TXT.")
    raw = await bid.read()
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"Bid file exceeds {MAX_FILE_SIZE // (1024*1024)} MB limit.")
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded bid file is empty.")
    bid_text = extract_text_from_file(raw, bid.filename)
    if not bid_text or not bid_text.strip():
        raise HTTPException(status_code=422,
                            detail="Could not extract text from the bid. It may be image-based or corrupted.")

    # --- optional RFP upload (extra requirements context) ---
    rfp_text = None
    if rfp_file and rfp_file.filename:
        rname = (rfp_file.filename or "").lower()
        if not any(rname.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(status_code=400,
                                detail=f"Unsupported RFP file type '{rfp_file.filename}'. Accepted: PDF, DOCX, DOC, TXT.")
        rfp_raw = await rfp_file.read()
        if len(rfp_raw) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="RFP file exceeds 10 MB limit.")
        if rfp_raw:
            rfp_text = extract_text_from_file(rfp_raw, rfp_file.filename)

    # --- 470 context (blocking USAC fetch off the event loop) ---
    from starlette.concurrency import run_in_threadpool
    ctx = await run_in_threadpool(copilot.build_470_context, form_470)
    if rfp_text:
        ctx["rfp_uploaded_text"] = rfp_text[:4000]

    # --- run the pipeline ---
    try:
        result = await copilot.analyze_bid(db, bid_text, ctx)
    except Exception as e:
        logger.error("[bid_copilot] analyze failed: %s", e)
        raise HTTPException(status_code=502, detail="Bid analysis failed. Please try again.")

    # --- persist ---
    row = VendorBidAnalysis(
        vendor_profile_id=profile.id,
        form_470_number=form_470,
        ben=ctx.get("ben"),
        funding_year=ctx.get("funding_year"),
        applicant_name=ctx.get("applicant_name"),
        bid_filename=bid.filename,
        bid_text=(bid_text or "")[:MAX_BID_STORE],
        overall_score=result.get("overall_score"),
        subscores_json=result.get("subscores"),
        findings_json=result.get("findings"),
        context_json=ctx,
        sources_json=result.get("sources"),
        refined_bid_text=(result.get("refined_bid_text") or None),
        chat_history_json=[],
        status="scored" if result.get("llm_used") else "draft",
        engine=result.get("engine"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    payload = row.to_dict()
    payload["summary"] = result.get("summary")
    payload["llm_used"] = result.get("llm_used")
    payload["disclaimer"] = (
        "Decision-support only — not legal advice. A high score does not guarantee funding; "
        "USAC/FCC make the final determination."
    )
    return {"success": True, "analysis": payload}


# ==================== LIST / GET ====================

@router.get("")
async def list_analyses(
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """List the vendor's past bid analyses (newest first)."""
    rows = (
        db.query(VendorBidAnalysis)
        .filter(VendorBidAnalysis.vendor_profile_id == profile.id)
        .order_by(VendorBidAnalysis.created_at.desc())
        .limit(max(1, min(200, limit)))
        .all()
    )
    return {"success": True, "analyses": [r.to_summary() for r in rows]}


@router.get("/precedent/{precedent_id}")
async def get_precedent(
    precedent_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Open a cited appeal / denial precedent (source link + summary)."""
    row = db.query(AppealPrecedent).filter(AppealPrecedent.id == precedent_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Precedent not found")
    return {"success": True, "precedent": row.to_dict()}


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: int,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Fetch one saved analysis (scoped to the vendor account)."""
    row = _get_owned(db, analysis_id, profile.id)
    return {"success": True, "analysis": row.to_dict()}


# ==================== REFINE ====================

@router.post("/{analysis_id}/refine")
async def refine(
    analysis_id: int,
    body: RefineRequest,
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Chat-refine the bid / regenerate the improved draft."""
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="message is required")
    row = _get_owned(db, analysis_id, profile.id)

    result = await copilot.refine_bid(db, row.to_dict(), msg)

    history = list(row.chat_history_json or [])
    history.append({"role": "user", "content": msg, "ts": datetime.utcnow().isoformat()})
    history.append({"role": "assistant", "content": result.get("reply", ""), "ts": datetime.utcnow().isoformat()})
    row.chat_history_json = history[-40:]  # keep the last 40 turns
    if result.get("ok") and result.get("refined_bid_text"):
        row.refined_bid_text = result["refined_bid_text"][:MAX_BID_STORE]
        row.status = "finalized"
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)

    return {
        "success": True,
        "reply": result.get("reply"),
        "refined_bid_text": row.refined_bid_text,
        "chat_history": row.chat_history_json,
        "ok": result.get("ok", False),
    }


# ==================== EXPORT ====================

@router.get("/{analysis_id}/export")
async def export_analysis(
    analysis_id: int,
    fmt: str = "md",
    profile: VendorProfile = Depends(get_vendor_profile),
    db: Session = Depends(get_db),
):
    """Download the refined bid + a compliance summary sheet (Markdown/plain text)."""
    row = _get_owned(db, analysis_id, profile.id)
    doc = _render_export(row)
    filename = f"bid-compliance-{row.id}.{'md' if fmt == 'md' else 'txt'}"
    return StreamingResponse(
        io.BytesIO(doc.encode("utf-8")),
        media_type="text/markdown" if fmt == "md" else "text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


# ==================== SEED (admin) ====================

@router.post("/seed-kb")
async def seed_kb(
    current_user: User = Depends(require_role("admin", "super")),
    db: Session = Depends(get_db),
):
    """Idempotently (re)seed the FCC knowledge base + precedent library."""
    counts = seed_knowledge_base(db, force=True)
    return {"success": True, **counts}


# ==================== HELPERS ====================

def _get_owned(db: Session, analysis_id: int, vendor_profile_id: int) -> VendorBidAnalysis:
    row = (
        db.query(VendorBidAnalysis)
        .filter(
            VendorBidAnalysis.id == analysis_id,
            VendorBidAnalysis.vendor_profile_id == vendor_profile_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row


def _render_export(row: VendorBidAnalysis) -> str:
    d = row.to_dict()
    lines: List[str] = []
    lines.append(f"# Bid Compliance Report — Form 470 {d.get('form_470_number') or 'N/A'}")
    lines.append("")
    lines.append(f"- **Applicant:** {d.get('applicant_name') or 'N/A'} (BEN {d.get('ben') or 'N/A'})")
    lines.append(f"- **Funding Year:** {d.get('funding_year') or 'N/A'}")
    lines.append(f"- **Overall compliance score:** {d.get('overall_score')}/100")
    lines.append(f"- **Bid file:** {d.get('bid_filename') or 'N/A'}")
    lines.append(f"- **Generated:** {d.get('created_at')}")
    lines.append("")
    lines.append("## Sub-scores")
    for s in d.get("subscores") or []:
        lines.append(f"- {s.get('label')}: {s.get('score')}/100 ({s.get('level')}) — weight {s.get('weight')}%")
    lines.append("")
    lines.append("## Findings")
    for f in d.get("findings") or []:
        cite = f" [{f.get('rule_cite')}]" if f.get("rule_cite") else ""
        lines.append(f"- **[{str(f.get('level')).upper()}] {f.get('dimension')}**{cite}: {f.get('message')}")
        if f.get("fix"):
            lines.append(f"    - Fix: {f.get('fix')}")
    lines.append("")
    if d.get("refined_bid_text"):
        lines.append("## Refined bid draft")
        lines.append("")
        lines.append(d["refined_bid_text"])
        lines.append("")
    lines.append("## Sources")
    for s in d.get("sources") or []:
        lines.append(f"- {s.get('citation')}: {s.get('title')} ({s.get('url')})")
    lines.append("")
    lines.append("---")
    lines.append("Decision-support only — not legal advice. A high score does not guarantee funding; "
                 "USAC/FCC make the final determination.")
    return "\n".join(lines)
