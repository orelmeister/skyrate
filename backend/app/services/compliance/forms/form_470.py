"""
Form 470 — Competitive Bidding Notice analyzer.
Wraps the existing analyze_form470 function with the universal interface.
"""

import logging
from typing import Optional
from ..analyzer import analyze_form470

logger = logging.getLogger(__name__)


async def analyze(
    document_text: str,
    supporting_docs: Optional[list[dict]] = None,
    metadata: Optional[dict] = None,
    prior_findings: Optional[dict] = None,
) -> dict:
    """
    Analyze a Form 470 document. Delegates to existing analyzer.
    If prior_findings is provided, includes comparison in the result.
    """
    result = await analyze_form470(
        document_text=document_text,
        metadata=metadata or {},
        supporting_documents=supporting_docs,
    )

    if not result:
        return {
            "overall_risk": "High",
            "summary": "Analysis failed — unable to process document.",
            "findings": [],
            "rule_findings": [],
            "llm_findings": [],
            "engine_version": None,
            "disclaimer": "Advisory only. Not legal or USAC official guidance.",
        }

    # If prior findings are provided, build comparison
    if prior_findings:
        result["comparison"] = _build_comparison(prior_findings, result)

    return result


def _build_comparison(prior: dict, current: dict) -> dict:
    """Compare prior analysis findings with current to determine delta."""
    from .comparison import compare_analyses
    return compare_analyses(prior, current)
