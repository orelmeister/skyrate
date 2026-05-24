"""
Form 472 — BEAR (Billed Entity Applicant Reimbursement) analyzer.
CRITICAL: Extract dollar amounts from invoices in supporting docs and cross-check
against BEAR claimed amounts. Flag over-billing or under-billing risks.
Also check service period alignment.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ....core.config import settings
from ..rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

FORM_472_SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in Form 472 (BEAR - Billed Entity Applicant Reimbursement) review.

You are analyzing a Form 472 reimbursement request and its supporting invoices for compliance issues.

Your CRITICAL focus areas for Form 472 (BEAR):
1. INVOICE CROSS-CHECK: Extract the total dollar amount claimed on the BEAR form. Then extract individual invoice totals from the supporting documents. Compare them:
   - If BEAR claimed total > sum of invoice totals: FLAG HIGH RISK (over-billing / potential fraud)
   - If BEAR claimed total significantly < sum of invoice totals: FLAG MEDIUM (under-billing — money left on table)
   - Document each invoice total you extract and show the math.
2. SERVICE PERIOD ALIGNMENT: Verify that invoice dates fall within the approved funding year service delivery period (typically July 1 - June 30, or contract-specific dates).
3. DISCOUNT RATE: Verify the discount percentage applied matches the commitment decision letter.
4. ELIGIBLE SERVICES: Check that invoiced items are eligible E-Rate services matching the original Form 471 commitment.
5. DUPLICATE BILLING: Look for any signs of duplicate invoice numbers or overlapping service periods.
6. VENDOR MATCH: Verify the service provider on invoices matches the SPIN/vendor on the commitment.

IMPORTANT NUMERIC EXTRACTION:
- For each invoice in supporting documents, extract: invoice number, date, total amount, and service period.
- Sum all invoice totals and compare against the BEAR claimed amount.
- Show your calculation clearly in the findings.

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief summary including: BEAR claimed amount vs. invoice total comparison",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name (e.g., Invoice Cross-Check, Service Period, Discount Rate, Eligibility)",
      "description": "What the issue is — include specific dollar amounts where relevant",
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
    """Analyze a Form 472 (BEAR) document with invoice cross-checking."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        logger.warning("No Gemini API key — returning empty analysis")
        return _empty_result("No AI API key configured.")

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=FORM_472_SYSTEM_PROMPT,
        )

        max_chars = 120_000
        text_for_llm = document_text[:max_chars]
        if len(document_text) > max_chars:
            text_for_llm += "\n\n[Document truncated]"

        supporting_context = _build_supporting_context(supporting_docs, max_chars - len(text_for_llm))
        prior_context = _build_prior_context(prior_findings)

        prompt = (
            f"{prior_context}"
            f"PRIMARY DOCUMENT (Form 472 — BEAR Reimbursement Request):\n\n{text_for_llm}\n"
            f"{supporting_context}\n\n"
            f"---\n\n"
            f"Analyze this Form 472 BEAR filing. CRITICAL: Extract and compare dollar amounts "
            f"from the BEAR form vs. supporting invoices. Check service period alignment and "
            f"discount rate accuracy.\n\n"
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
        logger.error("Form 472 analysis failed: %s", str(e))

    return _empty_result("Analysis failed.")


def _build_supporting_context(docs: Optional[list[dict]], budget: int) -> str:
    if not docs:
        return "\n\n[WARNING: No invoices attached. Cannot perform invoice cross-check.]"
    per_doc = max(2000, budget // len(docs))
    parts = []
    for i, doc in enumerate(docs, 1):
        text = doc["text"][:per_doc]
        if len(doc["text"]) > per_doc:
            text += "\n[...truncated]"
        parts.append(f"\n=== INVOICE/SUPPORTING DOCUMENT {i} ({doc['filename']}) ===\n{text}")
    return "\n\nSUPPORTING INVOICES (extract totals and cross-check against BEAR amounts):" + "".join(parts)


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
