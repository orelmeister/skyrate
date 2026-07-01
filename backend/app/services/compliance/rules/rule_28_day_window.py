"""
Rule RULE-001: 28-Day Waiting Period

FCC Citation: 47 CFR Section 54.504(b)(1)
USAC Reference: "Applicants must allow at least 28 days from the date
the Form 470 is posted on USAC's website before filing Form 471."

This rule checks whether the Form 470 text mentions dates that indicate
the 28-day competitive bidding window may not be satisfied.
"""

import re
from datetime import datetime, timedelta
from typing import Optional

from .base import RuleFinding, Severity

VERSION = "1.1.0"
RULE_ID = "RULE-001"
RULE_REFERENCE = "47 CFR Section 54.504(b)(1) — 28-day waiting period"

# Common date patterns in Form 470 documents
DATE_PATTERNS = [
    r"(?:posted|filing|submitted|posted on|filed on)\s*(?:date)?[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*(?:posting|posted|filed|submitted)",
    r"(?:form\s*470\s*(?:was\s*)?(?:posted|filed|submitted))\s*(?:on\s*)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:form\s*471\s*(?:will be|to be)?\s*(?:filed|submitted))\s*(?:on\s*)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:allowable\s*contract\s*date|earliest\s*contract\s*date)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:post(?:ed)?|fil(?:e|ed|ing)|submit(?:ted)?)\s+(?:on\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:on|by)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:posting|filing)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
]

# Patterns indicating the window is mentioned
WINDOW_KEYWORDS = [
    r"28[\s-]*day",
    r"twenty[\s-]*eight[\s-]*day",
    r"waiting\s+period",
    r"competitive\s+bidding\s+(?:window|period)",
    r"posting\s+(?:period|window|requirement)",
]


def _parse_date(date_str: str) -> Optional[datetime]:
    """Try to parse a date string in common US formats."""
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def _extract_dates(text: str) -> list[tuple[str, datetime]]:
    """Extract all recognizable dates with their context."""
    found = []
    for pattern in DATE_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            date_str = match.group(1)
            parsed = _parse_date(date_str)
            if parsed:
                found.append((match.group(0), parsed))
    return found


def check(text: str, metadata: dict) -> Optional[RuleFinding]:
    """
    Check that the 28-day competitive bidding window is likely satisfied.

    Returns a finding only if dates are found that suggest less than
    28 days between Form 470 posting and Form 471 filing.
    """
    # Extract dates
    dates = _extract_dates(text)

    # If we find a pair of dates (posting + filing), check the gap
    if len(dates) >= 2:
        dates_sorted = sorted(dates, key=lambda x: x[1])
        earliest = dates_sorted[0][1]
        latest = dates_sorted[-1][1]
        gap_days = (latest - earliest).days

        if 0 < gap_days < 28:
            return RuleFinding(
                rule_id=RULE_ID,
                rule_version=VERSION,
                severity=Severity.HIGH,
                area="Competitive Bidding",
                description=(
                    f"Dates found suggest only {gap_days} days between "
                    f"Form 470 posting and Form 471 filing. "
                    f"The FCC requires a minimum of 28 calendar days."
                ),
                suggestion=(
                    "Verify posting and filing dates. Ensure at least 28 "
                    "calendar days elapse between when USAC posts the Form 470 "
                    "and when you file Form 471."
                ),
                rule_reference=RULE_REFERENCE,
                confidence=0.85,
                evidence_snippet=f"{dates_sorted[0][0]} ... {dates_sorted[-1][0]}",
            )

    # NOTE: We intentionally do NOT flag documents that simply lack a
    # reference to the 28-day waiting period. Neither Form 470 nor Form 471
    # is required to explicitly reference the 28-day window, so a missing
    # reference is not a compliance issue. We only surface a finding above
    # when actual posting/filing dates indicate the window was not satisfied.
    return None

