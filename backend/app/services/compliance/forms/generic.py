"""
Generic USAC document analyzer — fallback for "other" form type.
General document review for any USAC-related filing.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

GENERIC_SYSTEM_PROMPT = """You are an E-Rate compliance analyst reviewing a USAC-related document.

The user has uploaded a document that doesn't fit the standard USAC form categories (470, 471, 472, 474, 486, 500, 498). It may be:
- A letter, appeal, or response to USAC
- A compliance attachment or supplementary filing
- A contract, service agreement, or amendment
- An internal policy document related to E-Rate
- Any other document related to the E-Rate program

Your task:
1. Identify what type of document this appears to be.
2. Check for general E-Rate compliance issues, completeness, and internal consistency.
3. If it references specific FCC/USAC rules or forms, verify those references make sense.
4. Flag any obvious errors, missing information, or potential compliance risks.

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief summary including what type of document this appears to be",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name",
      "description": "What the issue is",
      "suggestion": "How to fix or mitigate",
      "rule_reference": "Specific rule citation if applicable, or null"
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
    """Analyze a generic USAC document."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=GENERIC_SYSTEM_PROMPT,
        )

        max_chars = 120_000
        text_for_llm = document_text[:max_chars]
        if len(document_text) > max_chars:
            text_for_llm += "\n\n[Document truncated]"

        supporting_context = _build_supporting_context(supporting_docs, max_chars - len(text_for_llm))
        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT:\n\n{text_for_llm}\n"
            f"{supporting_context}\n\n"
            f"---\n\n"
            f"Review this document for E-Rate compliance issues, completeness, "
            f"and internal consistency.\n\n"
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
        logger.error("Generic document analysis failed: %s", str(e))

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
