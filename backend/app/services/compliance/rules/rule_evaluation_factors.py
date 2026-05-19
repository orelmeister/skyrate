"""
Rule RULE-004: Price Must Be Primary Evaluation Factor

FCC Citation: 47 CFR Section 54.503(b)(1)(i)
Reference: "Price of the eligible products and services must be
included as a factor and must be weighted as the most heavily
weighted factor in the evaluation."

This rule checks that:
1. Evaluation criteria/factors are mentioned
2. Price is listed as a factor
3. Price appears to be the most heavily weighted
"""

import re
from typing import Optional

from .base import RuleFinding, Severity

VERSION = "1.0.0"
RULE_ID = "RULE-004"
RULE_REFERENCE = "47 CFR Section 54.503(b)(1)(i) — price as primary evaluation factor"

# Patterns indicating evaluation criteria section
EVAL_SECTION_KEYWORDS = [
    r"evaluation\s+(?:criteria|factors?|process|methodology)",
    r"scoring\s+(?:criteria|factors?|methodology|rubric)",
    r"selection\s+(?:criteria|factors?|process)",
    r"bid\s+evaluation",
    r"proposal\s+evaluation",
    r"award\s+criteria",
    r"weighted\s+(?:criteria|factors?|scoring)",
]

# Price-related keywords
PRICE_KEYWORDS = [
    r"(?:price|cost|pricing|rate|fee)",
]

# Patterns suggesting price is primary/most weighted
PRICE_PRIMARY_PATTERNS = [
    r"price.*(?:most\s+(?:heavily\s+)?weighted|primary|highest\s+weight|greatest\s+weight)",
    r"(?:most\s+(?:heavily\s+)?weighted|primary|highest\s+weight|greatest\s+weight).*price",
    r"price.*(?:(?:\d+)\s*%|percent).*(?:highest|most|primary|greatest)",
    r"cost.*(?:most\s+(?:heavily\s+)?weighted|primary|highest\s+weight|greatest\s+weight)",
    r"(?:most\s+(?:heavily\s+)?weighted|primary|highest\s+weight|greatest\s+weight).*cost",
    # Common weight-based patterns (price > 50% implies primary)
    r"(?:price|cost)\s*[:=\-]\s*(?:[5-9]\d|100)\s*%",
    r"(?:[5-9]\d|100)\s*%\s*[-:=]?\s*(?:price|cost)",
]


def check(text: str, metadata: dict) -> Optional[RuleFinding]:
    """
    Verify that price is the most heavily weighted evaluation factor.

    Returns a finding if:
    - Evaluation factors are discussed but price is not primary
    - No evaluation criteria mentioned at all
    """
    text_lower = text.lower()

    # Check if evaluation criteria are mentioned
    has_eval_section = any(
        re.search(kw, text_lower) for kw in EVAL_SECTION_KEYWORDS
    )

    # Check if price is mentioned in the context of evaluation
    has_price_mention = any(
        re.search(kw, text_lower) for kw in PRICE_KEYWORDS
    )

    # Check if price is indicated as primary
    price_is_primary = any(
        re.search(p, text_lower) for p in PRICE_PRIMARY_PATTERNS
    )

    if has_eval_section and has_price_mention and price_is_primary:
        # All good — price is primary
        return None

    if has_eval_section and not has_price_mention:
        # Evaluation criteria exist but price is not mentioned at all
        return RuleFinding(
            rule_id=RULE_ID,
            rule_version=VERSION,
            severity=Severity.HIGH,
            area="Competitive Bidding",
            description=(
                "Evaluation criteria are discussed but price/cost is not "
                "mentioned as a factor. FCC rules require that price of "
                "eligible products/services be the most heavily weighted "
                "evaluation factor."
            ),
            suggestion=(
                "Add price of eligible products and services as an "
                "evaluation factor and ensure it carries the most weight "
                "(e.g., 40-60% or listed first as primary criterion)."
            ),
            rule_reference=RULE_REFERENCE,
            confidence=0.85,
            evidence_snippet=None,
        )

    if has_eval_section and has_price_mention and not price_is_primary:
        # Price is mentioned but not clearly primary
        return RuleFinding(
            rule_id=RULE_ID,
            rule_version=VERSION,
            severity=Severity.MEDIUM,
            area="Competitive Bidding",
            description=(
                "Price/cost appears in evaluation criteria but is not "
                "clearly indicated as the most heavily weighted factor. "
                "USAC may flag this during review."
            ),
            suggestion=(
                "Explicitly state that price is the most heavily weighted "
                "evaluation factor, or assign it the highest percentage "
                "weight among all criteria."
            ),
            rule_reference=RULE_REFERENCE,
            confidence=0.7,
            evidence_snippet=None,
        )

    if not has_eval_section:
        # No evaluation section at all — this might not be an RFP document
        # Only flag if document seems like it should have one
        rfp_indicators = re.findall(
            r"(?:request\s+for\s+proposal|rfp|bid\s+document|solicitation)",
            text_lower,
        )
        if rfp_indicators:
            return RuleFinding(
                rule_id=RULE_ID,
                rule_version=VERSION,
                severity=Severity.MEDIUM,
                area="Competitive Bidding",
                description=(
                    "Document appears to be a bid solicitation but no "
                    "evaluation criteria section was found. The FCC requires "
                    "that applicants specify evaluation factors with price "
                    "as the most heavily weighted."
                ),
                suggestion=(
                    "Include a clear evaluation criteria section listing "
                    "all factors with their relative weights. Price must "
                    "be the most heavily weighted factor."
                ),
                rule_reference=RULE_REFERENCE,
                confidence=0.6,
                evidence_snippet=rfp_indicators[0] if rfp_indicators else None,
            )

    return None
