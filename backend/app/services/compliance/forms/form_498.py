"""
Form 498 — Service Provider Information Form analyzer.
Lighter check — completeness, banking info consistency.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

FORM_498_SYSTEM_PROMPT = """You are an E-Rate compliance analyst reviewing a Form 498 (Service Provider Information Form).

This form registers or updates a service provider's identifying and banking information with USAC.

Your focus areas for Form 498:
1. COMPLETENESS: Are all required fields filled (SPIN, legal name, DBA, address, EIN/TIN, banking info)?
2. CONSISTENCY: Does the company name match across all sections? Does the EIN format look valid?
3. BANKING INFO: Are routing and account numbers present and properly formatted? (Do NOT flag the actual numbers as security issues — just verify format completeness.)
4. CONTACT INFO: Is there a valid contact person, phone, and email?
5. CERTIFICATION: Is the authorized person certification section complete?

This is a lighter-touch review. Focus on completeness and internal consistency rather than deep compliance analysis.

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief summary of form completeness",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name",
      "description": "What the issue is",
      "suggestion": "How to fix",
      "rule_reference": null
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
    """Analyze a Form 498 document."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=FORM_498_SYSTEM_PROMPT,
        )

        max_chars = 60_000  # Form 498 is typically short
        text_for_llm = document_text[:max_chars]

        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT (Form 498 — Service Provider Information):\n\n{text_for_llm}\n\n"
            f"---\n\n"
            f"Review this Form 498 for completeness and internal consistency.\n\n"
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
                "overall_risk": llm_result.get("overall_risk", "Low"),
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
        logger.error("Form 498 analysis failed: %s", str(e))

    return _empty_result("Analysis failed.")


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
        "overall_risk": "Low",
        "summary": summary,
        "findings": [],
        "rule_findings": [],
        "llm_findings": [],
        "engine_version": ENGINE_VERSION,
        "disclaimer": "Advisory only. Not legal or USAC official guidance.",
    }
