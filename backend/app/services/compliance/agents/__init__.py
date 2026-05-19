"""
Multi-Agent Bid Scorer Pipeline (Phase 2A).

Pipeline: Extractor → Bid Reviewer → Compliance Officer → Verifier (conditional)

Advisory only. Not legal or USAC official guidance.
"""

import logging
import time
from typing import Optional

from pydantic import BaseModel, Field

from .extractor_agent import extract_document_data, ExtractedData
from .bid_reviewer_agent import review_bid, BidReviewNotes
from .compliance_officer_agent import produce_final_assessment, ComplianceAssessment
from .verifier_agent import verify_assessment, VerificationResult

logger = logging.getLogger(__name__)


class PipelineResult(BaseModel):
    """Final result from the multi-agent compliance pipeline."""
    overall_risk: str = Field(description="Low / Medium / High")
    summary: str
    findings: list[dict] = Field(default_factory=list)
    corpus_citations: list[dict] = Field(default_factory=list)
    extracted_data: Optional[dict] = None
    bid_review_notes: Optional[dict] = None
    verification: Optional[dict] = None
    disagreement_flag: bool = False
    agent_timings: dict = Field(default_factory=dict)
    engine_version: str = ""
    disclaimer: str = "Advisory only. Not legal or USAC official guidance."


async def run_pipeline(
    document_text: str,
    metadata: dict,
    rule_findings: list[dict],
    corpus_citations: list[dict],
    engine_version: str = "",
) -> PipelineResult:
    """
    Execute the multi-agent compliance pipeline.

    Args:
        document_text: Extracted text from the uploaded document.
        metadata: Dict with filename, upload_time, etc.
        rule_findings: Pre-computed deterministic rule findings.
        corpus_citations: Retrieved RAG corpus chunks.
        engine_version: Engine version string.

    Returns:
        PipelineResult with all agent outputs merged.
    """
    timings = {}

    # --- Agent 1: Extractor ---
    t0 = time.time()
    extracted = await extract_document_data(document_text, metadata)
    timings["extractor_ms"] = int((time.time() - t0) * 1000)
    logger.info("Agent 1 (Extractor): %dms, entities=%d",
                timings["extractor_ms"], len(extracted.entities))

    # --- Agent 2: Bid Reviewer ---
    t0 = time.time()
    review = await review_bid(extracted, rule_findings, corpus_citations)
    timings["bid_reviewer_ms"] = int((time.time() - t0) * 1000)
    logger.info("Agent 2 (Bid Reviewer): %dms, issues=%d",
                timings["bid_reviewer_ms"], len(review.issues))

    # --- Agent 3: Compliance Officer ---
    t0 = time.time()
    assessment = await produce_final_assessment(extracted, review, rule_findings)
    timings["compliance_officer_ms"] = int((time.time() - t0) * 1000)
    logger.info("Agent 3 (Compliance Officer): %dms, risk=%s",
                timings["compliance_officer_ms"], assessment.overall_risk)

    # --- Agent 4: Verifier (conditional — only on Medium risk) ---
    verification = None
    disagreement_flag = False
    if assessment.overall_risk == "Medium":
        t0 = time.time()
        verification = await verify_assessment(document_text, assessment, review)
        timings["verifier_ms"] = int((time.time() - t0) * 1000)
        disagreement_flag = verification.disagrees
        logger.info("Agent 4 (Verifier): %dms, disagrees=%s",
                    timings["verifier_ms"], verification.disagrees)
        # If verifier disagrees, escalate to High
        if verification.disagrees and verification.suggested_risk:
            assessment.overall_risk = verification.suggested_risk

    # --- Merge findings ---
    merged_findings = []
    # Rule findings first (highest confidence)
    for rf in rule_findings:
        merged_findings.append(rf)
    # Bid reviewer issues
    for issue in review.issues:
        merged_findings.append({
            "rule_id": issue.get("rule_id", "AGENT-REVIEW"),
            "severity": issue.get("severity", "medium"),
            "description": issue.get("description", ""),
            "source": "bid_reviewer",
        })
    # Compliance officer additional findings
    for finding in assessment.additional_findings:
        merged_findings.append({
            "rule_id": "AGENT-OFFICER",
            "severity": finding.get("severity", "low"),
            "description": finding.get("description", ""),
            "source": "compliance_officer",
        })

    return PipelineResult(
        overall_risk=assessment.overall_risk,
        summary=assessment.summary,
        findings=merged_findings,
        corpus_citations=corpus_citations,
        extracted_data=extracted.model_dump(),
        bid_review_notes=review.model_dump(),
        verification=verification.model_dump() if verification else None,
        disagreement_flag=disagreement_flag,
        agent_timings=timings,
        engine_version=engine_version,
        disclaimer="Advisory only. Not legal or USAC official guidance.",
    )
