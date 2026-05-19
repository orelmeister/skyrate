"""
Agent 2: Bid Reviewer.

Analyzes extracted document data against rule findings and corpus citations.
Produces structured review notes with identified issues.

Advisory only. Not legal or USAC official guidance.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai
from pydantic import BaseModel, Field

from ....core.config import get_settings
from .extractor_agent import ExtractedData

logger = logging.getLogger(__name__)


class BidReviewNotes(BaseModel):
    """Structured output from the bid reviewer agent."""
    issues: list[dict] = Field(default_factory=list)
    observations: list[str] = Field(default_factory=list)
    risk_indicators: list[str] = Field(default_factory=list)
    recommended_risk: str = "Low"  # Low / Medium / High


REVIEW_PROMPT = """You are an E-Rate compliance bid reviewer. Your job is to analyze
extracted Form 470 data alongside deterministic rule findings and relevant FCC/USAC citations.

Identify ADDITIONAL compliance issues NOT already captured by the rule engine.
Focus on:
1. Bid evaluation criteria completeness and fairness
2. Service category accuracy
3. Timeline compliance (28-day posting window)
4. Cost allocation concerns
5. Restrictive language that could limit competition
6. Missing required information

Return ONLY valid JSON:
{{
  "issues": [
    {{"rule_id": "REVIEW-xxx", "severity": "low|medium|high", "description": "..."}}
  ],
  "observations": ["neutral observations about the bid"],
  "risk_indicators": ["factors that increase compliance risk"],
  "recommended_risk": "Low|Medium|High"
}}

Rules:
- Do NOT duplicate findings from the RULE ENGINE FINDINGS below.
- severity: low = minor improvement suggested, medium = potential USAC issue, high = likely rejection/appeal trigger.
- Be conservative: only flag genuine issues with regulatory basis.

RULE ENGINE FINDINGS (already identified — do not repeat):
{rule_findings}

RELEVANT CITATIONS:
{corpus_citations}

EXTRACTED DOCUMENT DATA:
{extracted_data}

Advisory only. Not legal or USAC official guidance.
"""


async def review_bid(
    extracted: ExtractedData,
    rule_findings: list[dict],
    corpus_citations: list[dict],
) -> BidReviewNotes:
    """
    Run Gemini Flash to review the bid for additional compliance issues.

    Args:
        extracted: Structured data from the extractor agent.
        rule_findings: Pre-computed deterministic rule findings.
        corpus_citations: RAG-retrieved FCC/USAC citations.

    Returns:
        BidReviewNotes with issues, observations, and risk indicators.
    """
    settings = get_settings()

    # Format inputs for prompt
    rule_str = json.dumps(rule_findings, indent=2, default=str)[:3000]
    corpus_str = json.dumps(corpus_citations, indent=2, default=str)[:2000]
    extracted_str = extracted.model_dump_json(indent=2)[:4000]

    prompt = REVIEW_PROMPT.format(
        rule_findings=rule_str,
        corpus_citations=corpus_str,
        extracted_data=extracted_str,
    )

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        raw_text = response.text.strip()
        data = json.loads(raw_text)

        return BidReviewNotes(**data)

    except json.JSONDecodeError as e:
        logger.error("Bid reviewer JSON parse error: %s", str(e))
        return BidReviewNotes()
    except Exception as e:
        logger.error("Bid reviewer agent failed: %s", str(e))
        return BidReviewNotes()
