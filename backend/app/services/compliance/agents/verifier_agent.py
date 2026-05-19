"""
Agent 4: Verifier.

Uses Claude 3.5 Sonnet as an independent second opinion on borderline (Medium risk) cases.
Only invoked when the compliance officer assigns "Medium" risk.
Sets disagreement_flag if it disagrees with the officer's assessment.

Advisory only. Not legal or USAC official guidance.
"""

import json
import logging
from typing import Optional

from pydantic import BaseModel, Field

from ....core.config import get_settings
from .compliance_officer_agent import ComplianceAssessment
from .bid_reviewer_agent import BidReviewNotes

logger = logging.getLogger(__name__)


class VerificationResult(BaseModel):
    """Result from the verifier agent."""
    disagrees: bool = False
    suggested_risk: Optional[str] = None  # Only set if disagrees
    reasoning: str = ""
    confidence: float = 0.0  # 0-1 scale


VERIFIER_PROMPT = """You are an independent E-Rate compliance verifier (second opinion).
A compliance officer assessed this Form 470 document as "Medium" risk.
Your job is to verify whether this assessment is correct.

Review the document text, the officer's assessment, and the bid reviewer's notes.
Determine if you AGREE or DISAGREE with the "Medium" risk classification.

If you disagree, suggest the correct risk level (Low or High) with reasoning.

OFFICER ASSESSMENT:
{assessment}

BID REVIEWER NOTES:
{review_notes}

DOCUMENT TEXT (first 8000 chars):
{document_text}

Return ONLY valid JSON:
{{
  "disagrees": true/false,
  "suggested_risk": "Low|High" or null if agrees,
  "reasoning": "1-2 sentence explanation",
  "confidence": 0.0-1.0
}}

Only disagree if you have strong regulatory basis. Err toward agreeing.
Advisory only. Not legal or USAC official guidance.
"""


async def verify_assessment(
    document_text: str,
    assessment: ComplianceAssessment,
    review: BidReviewNotes,
) -> VerificationResult:
    """
    Run Claude 3.5 Sonnet to verify a Medium-risk assessment.

    Args:
        document_text: Original document text.
        assessment: The compliance officer's assessment.
        review: Bid reviewer notes.

    Returns:
        VerificationResult indicating agreement or disagreement.
    """
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set, skipping verification")
        return VerificationResult(
            disagrees=False,
            reasoning="Verifier skipped — no Anthropic API key configured.",
            confidence=0.0,
        )

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        # Truncate document for context window
        doc_truncated = document_text[:8000]
        assessment_str = assessment.model_dump_json(indent=2)
        review_str = review.model_dump_json(indent=2)[:2000]

        prompt = VERIFIER_PROMPT.format(
            assessment=assessment_str,
            review_notes=review_str,
            document_text=doc_truncated,
        )

        message = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        raw_text = message.content[0].text.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()

        data = json.loads(raw_text)
        return VerificationResult(**data)

    except json.JSONDecodeError as e:
        logger.error("Verifier JSON parse error: %s", str(e))
        return VerificationResult(
            disagrees=False,
            reasoning="Verifier response could not be parsed.",
            confidence=0.0,
        )
    except Exception as e:
        logger.error("Verifier agent failed: %s", str(e))
        return VerificationResult(
            disagrees=False,
            reasoning=f"Verifier error: {str(e)[:100]}",
            confidence=0.0,
        )
