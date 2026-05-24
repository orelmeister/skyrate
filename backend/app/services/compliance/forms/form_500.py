"""
Form 500 — Funding Commitment Adjustment Request analyzer.
Verify justification matches scope-change documentation.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

FORM_500_SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in Form 500 (Funding Commitment Adjustment Request) review.

You are analyzing a Form 500 that requests modification to an existing E-Rate funding commitment.

Your focus areas for Form 500:
1. JUSTIFICATION: Does the stated reason for the adjustment match the supporting documentation?
2. ADJUSTMENT TYPE: Is the request to reduce, cancel, or modify the commitment? Is the type appropriate?
3. SERVICE SUBSTITUTION: If requesting a service substitution, does the new service meet the original intent and eligibility requirements?
4. TIMELINE: Is the request being made within the allowable timeframe?
5. COST IMPACT: Does the cost change align with documented contract amendments or change orders?
6. DOCUMENTATION: Are all required supporting documents (amended contracts, cost comparisons, change orders) provided?
7. COMPLIANCE: Does the adjustment maintain E-Rate program compliance rules?

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief summary of Form 500 compliance assessment",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name",
      "description": "What the issue is",
      "suggestion": "How to fix or mitigate",
      "rule_reference": "Specific FCC/USAC rule citation if applicable, or null"
    }
  ]
}
"""


async def analyze(
    document_text: str,
    supporting_docs: Optional[list[dict]] = None,
    metadata: Optional[dict] = None,
    prior_findings: Optional[dict] = None,
) -> dict:
    """Analyze a Form 500 document."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=FORM_500_SYSTEM_PROMPT,
        )

        max_chars = 120_000
        text_for_llm = document_text[:max_chars]
        if len(document_text) > max_chars:
            text_for_llm += "\n\n[Document truncated]"

        supporting_context = _build_supporting_context(supporting_docs, max_chars - len(text_for_llm))
        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT (Form 500 — Funding Commitment Adjustment):\n\n{text_for_llm}\n"
            f"{supporting_context}\n\n"
            f"---\n\n"
            f"Analyze this Form 500. Verify the justification matches documentation "
            f"and the adjustment maintains program compliance.\n\n"
            f"Advisory only. Not legal or USAC official guidance."
        )

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        if response.text:
            llm_result = json.loads(response.text)
            result = {
                "overall_risk": llm_result.get("overall_risk", "Medium"),
                "summary": llm_result.get("summary"),
                "findings": llm_result.get("findings", []),
                "rule_findings": [],
                "llm_findings": llm_result.get("findings", []),
                "engine_version": ENGINE_VERSION,
                "disclaimer": "Advisory only. Not legal or USAC official guidance.",
            }
            for f in result["llm_findings"]:
                f["source"] = "llm"
            for f in result["findings"]:
                f["source"] = "llm"

            if prior_findings:
                from .comparison import compare_analyses
                result["comparison"] = compare_analyses(prior_findings, result)

            return result

    except Exception as e:
        logger.error("Form 500 analysis failed: %s", str(e))

    return _empty_result("Analysis failed.")


def _build_supporting_context(docs: Optional[list[dict]], budget: int) -> str:
    if not docs:
        return ""
    per_doc = max(1000, budget // len(docs))
    parts = []
    for i, doc in enumerate(docs, 1):
        text = doc["text"][:per_doc]
        if len(doc["text"]) > per_doc:
            text += "\n[...truncated]"
        parts.append(f"\n=== SUPPORTING DOCUMENT {i} ({doc['filename']}) ===\n{text}")
    return "\n\nSUPPORTING DOCUMENTS:" + "".join(parts)


def _build_prior_context(prior: Optional[dict]) -> str:
    if not prior:
        return ""
    findings = prior.get("findings", []) + prior.get("llm_findings", [])
    if not findings:
        return ""
    lines = ["PRIOR ANALYSIS FINDINGS (determine which are resolved, remaining, or new):\n"]
    for f in findings[:20]:
        lines.append(f"- [{f.get('severity', 'medium')}] {f.get('area', 'N/A')}: {f.get('description', '')}")
    lines.append("\n---\n\n")
    return "\n".join(lines)


def _empty_result(summary: str) -> dict:
    return {
        "overall_risk": "Medium",
        "summary": summary,
        "findings": [],
        "rule_findings": [],
        "llm_findings": [],
        "engine_version": ENGINE_VERSION,
        "disclaimer": "Advisory only. Not legal or USAC official guidance.",
    }
