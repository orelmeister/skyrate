"""
Agent 3: Compliance Officer.

Produces the final user-facing compliance assessment.
Synthesizes rule findings, bid review notes, and extracted data into
a clear summary with actionable recommendations.

Uses Gemini Flash by default; Gemini Pro if COMPLIANCE_USE_PRO=true.

Advisory only. Not legal or USAC official guidance.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai
from pydantic import BaseModel, Field

from ....core.config import get_settings
from .extractor_agent import ExtractedData
from .bid_reviewer_agent import BidReviewNotes

logger = logging.getLogger(__name__)


class ComplianceAssessment(BaseModel):
    """Final compliance assessment from the officer agent."""
    overall_risk: str = "Low"  # Low / Medium / High
    summary: str = ""
    key_concerns: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    additional_findings: list[dict] = Field(default_factory=list)
    confidence_note: str = ""


OFFICER_PROMPT = """You are a senior E-Rate compliance officer producing a final assessment
for a Form 470 document. Synthesize all inputs into a clear, actionable report.

Your assessment must:
1. Assign an overall USAC issue risk level (Low / Medium / High)
2. Provide a 2-3 sentence executive summary
3. List key concerns in order of severity
4. Give specific, actionable recommendations
5. Note any additional findings not covered by rules or reviewer

RISK DEFINITIONS:
- Low: Document is compliant; minor improvements optional
- Medium: Potential issues that could trigger USAC review or delay
- High: Likely compliance failures that risk denial or appeal

INPUTS:

RULE ENGINE FINDINGS (deterministic, highest confidence):
{rule_findings}

BID REVIEWER NOTES (AI-identified additional issues):
{review_notes}

EXTRACTED DOCUMENT DATA:
{extracted_data}

Return ONLY valid JSON:
{{
  "overall_risk": "Low|Medium|High",
  "summary": "2-3 sentence executive summary",
  "key_concerns": ["concern 1", "concern 2"],
  "recommendations": ["specific action 1", "specific action 2"],
  "additional_findings": [{{"severity": "low|medium|high", "description": "..."}}],
  "confidence_note": "brief note on assessment confidence"
}}

Advisory only. Not legal or USAC official guidance.
"""


async def produce_final_assessment(
    extracted: ExtractedData,
    review: BidReviewNotes,
    rule_findings: list[dict],
) -> ComplianceAssessment:
    """
    Run the compliance officer agent to produce the final assessment.

    Args:
        extracted: Structured data from extractor.
        review: Bid reviewer notes.
        rule_findings: Deterministic rule findings.

    Returns:
        ComplianceAssessment with risk level, summary, and recommendations.
    """
    settings = get_settings()

    # Select model based on config
    model_name = "gemini-1.5-pro" if settings.COMPLIANCE_USE_PRO else "gemini-2.0-flash"

    # Format inputs
    rule_str = json.dumps(rule_findings, indent=2, default=str)[:3000]
    review_str = review.model_dump_json(indent=2)[:3000]
    extracted_str = extracted.model_dump_json(indent=2)[:3000]

    prompt = OFFICER_PROMPT.format(
        rule_findings=rule_str,
        review_notes=review_str,
        extracted_data=extracted_str,
    )

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY)
        model = genai.GenerativeModel(model_name)

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        raw_text = response.text.strip()
        data = json.loads(raw_text)

        return ComplianceAssessment(**data)

    except json.JSONDecodeError as e:
        logger.error("Compliance officer JSON parse error: %s", str(e))
        # Fallback: derive risk from rule findings
        return _fallback_assessment(rule_findings, review)
    except Exception as e:
        logger.error("Compliance officer agent failed: %s", str(e))
        return _fallback_assessment(rule_findings, review)


def _fallback_assessment(rule_findings: list[dict], review: BidReviewNotes) -> ComplianceAssessment:
    """Produce a basic assessment when the LLM fails."""
    high_count = sum(1 for f in rule_findings if f.get("severity") == "high")
    medium_count = sum(1 for f in rule_findings if f.get("severity") == "medium")

    if high_count > 0:
        risk = "High"
    elif medium_count >= 2:
        risk = "Medium"
    else:
        risk = "Low"

    return ComplianceAssessment(
        overall_risk=risk,
        summary=f"Assessment based on {len(rule_findings)} rule findings. "
                f"LLM analysis unavailable — showing rule-based assessment only.",
        key_concerns=[f.get("description", "") for f in rule_findings[:3]],
        recommendations=["Review flagged items and consult E-Rate compliance guidance."],
        confidence_note="Reduced confidence — LLM officer agent unavailable.",
    )
