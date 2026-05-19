"""
Rule RULE-005: Cost Allocation for Mixed Eligible/Ineligible Services

FCC Citation: 47 CFR Section 54.504(e); FCC Order 19-117
Reference: When a service request includes both eligible and ineligible
components, the applicant must allocate costs appropriately, requesting
E-Rate discounts only on the eligible portion.

This rule flags documents that mention both eligible and ineligible
services/components without cost allocation language.
"""

import re
from typing import Optional

from .base import RuleFinding, Severity

VERSION = "1.1.0"
RULE_ID = "RULE-005"
RULE_REFERENCE = "47 CFR Section 54.504(e); FCC Order 19-117 — cost allocation"

# Ineligible services/components keywords
INELIGIBLE_KEYWORDS = [
    r"(?:ineligible|non[\s-]*eligible)\s+(?:service|component|item|cost|portion)",
    r"telephone\s+(?:service|line|handset)",
    r"voice\s+(?:service|only|component)",
    r"paging\s+system",
    r"video\s+(?:surveillance|camera|security)",
    r"content\s+filtering\s+(?:beyond\s+cipa)?",
    r"cell\s*phone(?:s)?(?!\s+data)",
    r"fax\s+(?:machine|service|line)",
    r"administrative\s+(?:phone|telephone)",
    r"non[\s-]*instructional",
    r"(?:staff|employee)\s+(?:personal|private)\s+use",
    r"hosted\s+voice",
    r"analog\s+(?:line|phone)",
]

# Negation patterns — if these precede ineligible keywords, ignore
NEGATION_PATTERNS = [
    r"no\s+(?:voice|telephone|ineligible|phone|fax)",
    r"(?:not|without)\s+(?:including?|any)\s+(?:voice|telephone|ineligible)",
    r"(?:does|do)\s+not\s+include",
    r"(?:excluded?|excluding|not\s+included)",
    r"no\s+(?:other\s+)?(?:ineligible|non[\s-]*eligible)",
]

# Eligible + ineligible bundle indicators
BUNDLE_KEYWORDS = [
    r"bundled?\s+(?:service|package|solution|offering)",
    r"(?:includes?|including)\s+(?:both\s+)?(?:eligible\s+and\s+ineligible|e-?rate\s+and\s+non)",
    r"package\s+(?:includes?|with|containing)",
    r"combined\s+(?:service|solution|offering)",
    r"mixed\s+(?:use|service|eligibility)",
]

# Cost allocation language
ALLOCATION_KEYWORDS = [
    r"cost\s+allocat(?:ion|e|ed|ing)",
    r"allocat(?:ion|e|ed|ing)\s+(?:of\s+)?cost",
    r"eligible\s+(?:portion|share|percentage|amount|cost)",
    r"ineligible\s+(?:portion|share|percentage|amount|cost)",
    r"pro[\s-]*rat(?:a|ed|ing)",
    r"(?:\d+)\s*%\s*(?:eligible|educational|instructional)",
    r"separate\s+line\s+item",
    r"(?:split|divide|separate)\s+(?:the\s+)?(?:cost|charge|expense)",
    r"discount(?:ed)?\s+(?:only\s+)?(?:on\s+)?(?:the\s+)?eligible",
    r"(?:educational|instructional)\s+use\s+allocat",
    r"use\s+allocation\s+(?:document|method|calculat)",
    r"excluded?\s+from\s+e-?rate",
]


def check(text: str, metadata: dict) -> Optional[RuleFinding]:
    """
    Flag mixed eligible/ineligible services without cost allocation.

    Returns a finding if:
    - Both eligible and ineligible components are referenced
    - No cost allocation language is present
    - The ineligible mention is not negated (e.g., "No voice services included")
    """
    text_lower = text.lower()

    # Check for negation patterns first — if the document explicitly says
    # ineligible services are NOT included, don't flag
    has_negation = any(
        re.search(kw, text_lower) for kw in NEGATION_PATTERNS
    )

    # Check for ineligible service mentions
    has_ineligible = any(
        re.search(kw, text_lower) for kw in INELIGIBLE_KEYWORDS
    )

    # If ineligible keywords found but preceded by negation, skip
    if has_ineligible and has_negation:
        has_ineligible = False

    # Check for bundle/mixed indicators
    has_bundle = any(
        re.search(kw, text_lower) for kw in BUNDLE_KEYWORDS
    )

    # Check for cost allocation language
    has_allocation = any(
        re.search(kw, text_lower) for kw in ALLOCATION_KEYWORDS
    )

    if (has_ineligible or has_bundle) and not has_allocation:
        # Find evidence snippet
        evidence = None
        for kw in INELIGIBLE_KEYWORDS + BUNDLE_KEYWORDS:
            match = re.search(kw, text_lower)
            if match:
                start = max(0, match.start() - 20)
                end = min(len(text), match.end() + 50)
                evidence = text[start:end].strip()
                break

        severity = Severity.HIGH if has_bundle else Severity.MEDIUM

        return RuleFinding(
            rule_id=RULE_ID,
            rule_version=VERSION,
            severity=severity,
            area="Cost Allocation",
            description=(
                "Document references ineligible services or bundled "
                "eligible/ineligible components but does not include "
                "cost allocation language. E-Rate discounts may only "
                "apply to the eligible portion of services."
            ),
            suggestion=(
                "Add a cost allocation methodology that clearly separates "
                "eligible from ineligible costs. Request E-Rate discounts "
                "only on the eligible portion. Include line-item breakdowns "
                "where possible."
            ),
            rule_reference=RULE_REFERENCE,
            confidence=0.8,
            evidence_snippet=evidence,
        )

    return None
