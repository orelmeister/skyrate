"""
Rule RULE-003: Brand Name "Or Equivalent" Requirement

FCC Citation: 47 CFR Section 54.503(b)(2)
Reference: "If an applicant uses a brand name in its request for
services, it must specify 'or equivalent' so as not to unduly
restrict competition."

This rule detects brand-name references in the document and checks
whether "or equivalent" / "or equal" language follows.
"""

import re
from typing import Optional

from .base import RuleFinding, Severity

VERSION = "1.0.0"
RULE_ID = "RULE-003"
RULE_REFERENCE = "47 CFR Section 54.503(b)(2) — brand name 'or equivalent' requirement"

# Common networking/telecom brand names that might appear in Form 470
BRAND_NAMES = [
    "cisco", "meraki", "juniper", "aruba", "hpe", "hewlett packard",
    "dell", "fortinet", "fortigate", "palo alto", "sonicwall",
    "ubiquiti", "unifi", "ruckus", "extreme networks", "netgear",
    "arista", "brocade", "alcatel", "nokia", "calix", "adtran",
    "comcast", "at&t", "verizon", "spectrum", "t-mobile", "lumen",
    "centurylink", "windstream", "frontier", "cox", "charter",
    "zscaler", "cloudflare", "barracuda", "watchguard", "sophos",
    "mitel", "avaya", "polycom", "cradlepoint", "datto",
    "cambium", "mimosa", "siklu", "radwin",
]

# Phrases that satisfy the "or equivalent" requirement
EQUIVALENT_PHRASES = [
    r"or\s+equivalent",
    r"or\s+equal",
    r"or\s+comparable",
    r"or\s+similar",
    r"or\s+approved\s+equal",
    r"or\s+functional(?:ly)?\s+equivalent",
]


def _find_brand_without_equivalent(text: str) -> list[tuple[str, str]]:
    """
    Find brand names that appear without 'or equivalent' nearby.

    Returns list of (brand_name, evidence_snippet) tuples.
    """
    text_lower = text.lower()
    violations = []

    for brand in BRAND_NAMES:
        # Find all occurrences of the brand
        pattern = re.compile(re.escape(brand), re.IGNORECASE)
        for match in pattern.finditer(text_lower):
            start = match.start()
            # Check within 100 characters after the brand name
            window_after = text_lower[start:start + len(brand) + 100]
            # Also check slightly before (for constructs like "or equivalent to Cisco")
            window_start = max(0, start - 30)
            window_before = text_lower[window_start:start + len(brand)]

            has_equivalent = any(
                re.search(eq, window_after) for eq in EQUIVALENT_PHRASES
            ) or any(
                re.search(eq, window_before) for eq in EQUIVALENT_PHRASES
            )

            if not has_equivalent:
                # Get a snippet for evidence
                snippet_start = max(0, start - 20)
                snippet_end = min(len(text), start + len(brand) + 50)
                snippet = text[snippet_start:snippet_end].strip()
                violations.append((brand, snippet))
                break  # One violation per brand is enough

    return violations


def check(text: str, metadata: dict) -> Optional[RuleFinding]:
    """
    Detect brand-name references without 'or equivalent' language.

    FCC rules require that any brand-name specification include
    'or equivalent' to ensure open competition.
    """
    violations = _find_brand_without_equivalent(text)

    if not violations:
        return None

    brand_list = ", ".join(v[0].title() for v in violations[:3])
    evidence = violations[0][1] if violations else None

    return RuleFinding(
        rule_id=RULE_ID,
        rule_version=VERSION,
        severity=Severity.HIGH,
        area="Competitive Bidding",
        description=(
            f"Brand name(s) referenced without 'or equivalent' language: "
            f"{brand_list}. FCC rules require that brand-name specifications "
            f"include 'or equivalent' to avoid unduly restricting competition."
        ),
        suggestion=(
            "Add 'or equivalent' after each brand-name reference, or describe "
            "the required specifications in functional terms without naming "
            "specific brands."
        ),
        rule_reference=RULE_REFERENCE,
        confidence=0.9,
        evidence_snippet=evidence,
    )
