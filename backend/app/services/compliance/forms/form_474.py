"""
Form 474 — SPI (Service Provider Invoice) analyzer.
Similar to BEAR invoice cross-check from the service provider side.
Verify discount calculation matches commitment.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

FORM_474_SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in Form 474 (SPI - Service Provider Invoice) review.

You are analyzing a Form 474 filing from a service provider seeking reimbursement from USAC.

Your CRITICAL focus areas for Form 474 (SPI):
1. INVOICE CROSS-CHECK: Extract the total amount being invoiced to USAC. Cross-check against supporting invoices to the applicant. Verify the discount portion matches the commitment decision.
2. DISCOUNT CALCULATION: The SPI should claim only the E-Rate discount portion. Verify: (Total Service Cost) x (Discount %) = Amount Claimed. Flag any discrepancy.
3. SERVICE PERIOD: Invoices must be for services delivered within the approved funding year.
4. COMMITMENT MATCH: Verify that services invoiced match the original Form 471 commitment.
5. SPIN VERIFICATION: Service provider identification should be consistent across documents.
6. DUPLICATE CLAIMS: Check for any signs the same services are being claimed on both BEAR (by applicant) and SPI (by provider).

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief summary including discount calculation verification",
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
    """Analyze a Form 474 (SPI) document."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=FORM_474_SYSTEM_PROMPT,
        )

        max_chars = 120_000
        text_for_llm = document_text[:max_chars]
        if len(document_text) > max_chars:
            text_for_llm += "\n\n[Document truncated]"

        supporting_context = _build_supporting_context(supporting_docs, max_chars - len(text_for_llm))
        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT (Form 474 — SPI Service Provider Invoice):\n\n{text_for_llm}\n"
            f"{supporting_context}\n\n"
            f"---\n\n"
            f"Analyze this Form 474 SPI. Verify discount calculation, service period, "
            f"and cross-check invoice amounts against commitment.\n\n"
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
        logger.error("Form 474 analysis failed: %s", str(e))

    return _empty_result("Analysis failed.")


def _build_supporting_context(docs: Optional[list[dict]], budget: int) -> str:
    if not docs:
        return ""
    per_doc = max(2000, budget // len(docs))
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
