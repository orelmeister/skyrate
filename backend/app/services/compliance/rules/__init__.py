"""
Deterministic Compliance Rule Engine
Phase 1: Runs before LLM analysis, feeds verified findings into prompt.
"""

from typing import Optional

from .base import RuleFinding
from . import (
    rule_28_day_window,
    rule_service_types,
    rule_or_equivalent,
    rule_evaluation_factors,
    rule_cost_allocation,
)

ENGINE_VERSION = "1.0.0"

# Registry of all active rules
_RULES = [
    rule_28_day_window,
    rule_service_types,
    rule_or_equivalent,
    rule_evaluation_factors,
    rule_cost_allocation,
]


def run_all_rules(extracted_text: str, metadata: dict) -> list[RuleFinding]:
    """
    Execute all deterministic compliance rules against extracted text.

    Args:
        extracted_text: Full text content extracted from the Form 470 PDF.
        metadata: Additional context (e.g., filename, upload date, user info).

    Returns:
        List of RuleFinding objects from rules that triggered.
    """
    findings: list[RuleFinding] = []

    for rule_module in _RULES:
        try:
            result: Optional[RuleFinding] = rule_module.check(extracted_text, metadata)
            if result is not None:
                findings.append(result)
        except Exception:
            # Individual rule failures should not block other rules
            # Logged at the caller level
            continue

    return findings
