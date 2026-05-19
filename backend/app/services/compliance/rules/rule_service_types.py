"""
Rule RULE-002: Valid Service Type Identification

FCC Citation: 47 CFR Section 54.502; USAC Eligible Services List (ESL)
Reference: Form 470 must request at least one eligible E-Rate service.
Category 1: Data Transmission Services, Internet Access
Category 2: Internal Connections, Managed Internal Broadband Services,
            Basic Maintenance of Internal Connections

This rule checks that the document references at least one valid E-Rate
service category or eligible service type.
"""

import re
from typing import Optional

from .base import RuleFinding, Severity

VERSION = "1.0.0"
RULE_ID = "RULE-002"
RULE_REFERENCE = "47 CFR Section 54.502; USAC Eligible Services List FY2026"

# Category 1 service keywords
CATEGORY_1_KEYWORDS = [
    r"data\s+transmission",
    r"internet\s+access",
    r"internet\s+service",
    r"broadband\s+(?:service|connection|access)",
    r"wide\s*area\s*network",
    r"wan\s+(?:service|connection)",
    r"fiber\s+(?:optic|connection|service|lit)",
    r"dark\s+fiber",
    r"ethernet",
    r"transport\s+(?:service|circuit)",
    r"cellular\s+(?:data|service)",
    r"wireless\s+internet",
    r"leased\s+(?:lit\s+)?fiber",
    r"self[- ]provisioned",
    r"isp\b",
    r"telecommunications",
    r"digital\s+transmission",
    r"lit\s+fiber",
]

# Category 2 service keywords
CATEGORY_2_KEYWORDS = [
    r"internal\s+connections",
    r"managed\s+internal\s+broadband",
    r"basic\s+maintenance",
    r"bmic",
    r"mibs",
    r"wireless\s+(?:access\s+point|controller|ap)",
    r"network\s+switch",
    r"router(?:s)?(?:\s+(?:and|&))?\s*(?:switch)?",
    r"firewall",
    r"rack(?:s)?\s+(?:mount|unit)",
    r"uPS\b",
    r"cabling\s*(?:infrastructure)?",
    r"structured\s+cabling",
    r"wi[\s-]*fi",
    r"access\s+point",
    r"network\s+equipment",
    r"switching\s+equipment",
]

# Generic category mentions
CATEGORY_MENTIONS = [
    r"category\s*[12]",
    r"cat(?:\.?)?\s*[12]",
    r"c[12]\s+(?:service|fund|budget)",
]


def check(text: str, metadata: dict) -> Optional[RuleFinding]:
    """
    Verify at least one valid E-Rate service type is identified.

    Returns a finding if no recognizable service type keywords are found.
    """
    text_lower = text.lower()

    found_cat1 = any(re.search(kw, text_lower) for kw in CATEGORY_1_KEYWORDS)
    found_cat2 = any(re.search(kw, text_lower) for kw in CATEGORY_2_KEYWORDS)
    found_category_mention = any(
        re.search(kw, text_lower) for kw in CATEGORY_MENTIONS
    )

    if found_cat1 or found_cat2 or found_category_mention:
        # Service types identified — no issue
        return None

    # Nothing found — flag it
    return RuleFinding(
        rule_id=RULE_ID,
        rule_version=VERSION,
        severity=Severity.HIGH,
        area="Service Eligibility",
        description=(
            "No recognizable E-Rate eligible service type found in the document. "
            "Form 470 must request services from Category 1 (Internet/Data Transmission) "
            "or Category 2 (Internal Connections/MIBS/BMIC)."
        ),
        suggestion=(
            "Ensure the Form 470 clearly identifies the service category and "
            "specific service types being requested per the USAC Eligible Services List."
        ),
        rule_reference=RULE_REFERENCE,
        confidence=0.75,
        evidence_snippet=None,
    )
