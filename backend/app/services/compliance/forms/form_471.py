"""
Form 471 — Funding Request analyzer.
Focus: Does the funding request match the RFP/Form 470 scope? Are service categories
consistent? Are eligible-services-list items correctly classified C1/C2?
Discount calculation sanity check.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

FORM_471_SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in Form 471 (Funding Request) review.

You are analyzing a Form 471 document and its supporting materials for compliance issues BEFORE submission to USAC.

Your specific focus areas for Form 471:
1. Does the funding request match the scope described in the corresponding Form 470 and RFP?
2. Are service categories (Category 1: Telecommunications/Internet Access vs Category 2: Internal Connections) correctly classified?
3. Are eligible services list (ESL) items properly categorized and described?
4. Is the discount calculation reasonable (based on NSLP percentages, urban/rural classification)?
5. Are there inconsistencies between the Form 471 line items and the supporting documentation?
6. Are cost allocations properly documented for shared services?
7. Is the contract term consistent across documents?
8. Are ineligible services bundled with eligible ones without proper cost allocation?

IMPORTANT: When SUPPORTING DOCUMENTS are provided (Form 470, RFP, vendor proposals):
- Cross-reference service categories between Form 470 and Form 471
- Verify that the funding request does not exceed what was posted on Form 470
- Check that the selected service provider was among the respondents
- Verify discount percentages match the applicant's eligibility

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief 1-2 sentence summary of compliance readiness",
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
    """Analyze a Form 471 document."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        logger.warning("No Gemini API key — returning empty analysis")
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=FORM_471_SYSTEM_PROMPT,
        )

        # Build prompt
        max_chars = 120_000
        text_for_llm = document_text[:max_chars]
        if len(document_text) > max_chars:
            text_for_llm += "\n\n[Document truncated]"

        supporting_context = _build_supporting_context(supporting_docs, max_chars - len(text_for_llm))
        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT (Form 471 — Funding Request):\n\n{text_for_llm}\n"
            f"{supporting_context}\n\n"
            f"---\n\n"
            f"Analyze this Form 471 for USAC compliance issues. Focus on service category "
            f"accuracy, discount calculation, and consistency with supporting documents.\n\n"
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
            # Mark all findings as LLM-sourced
            for f in result["llm_findings"]:
                f["source"] = "llm"
            for f in result["findings"]:
                f["source"] = "llm"

            if prior_findings:
                from .comparison import compare_analyses
                result["comparison"] = compare_analyses(prior_findings, result)

            return result

    except Exception as e:
        logger.error("Form 471 analysis failed: %s", str(e))

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
    return "\n\nSUPPORTING DOCUMENTS (cross-reference against Form 471):" + "".join(parts)


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
