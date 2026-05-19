"""
Compliance Analyzer — calls Google Gemini to assess Form 470 compliance risk.
Phase 0: Single LLM pass, no rule engine or embeddings.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ...core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in FCC/USAC regulations.

You are reviewing a Form 470 document for potential compliance issues BEFORE submission to USAC.

Your task:
1. Identify areas where the document may trigger USAC review flags or denials.
2. Score the overall USAC issue risk as Low, Medium, or High.
3. Cite specific FCC/USAC rules where possible (e.g., FCC Order 19-117, USAC Program Integrity Guidelines).
4. Focus on competitive bidding requirements, service eligibility, cost-effectiveness, and documentation completeness.
5. NEVER claim guaranteed approval or denial — this is advisory only.

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief 1-2 sentence summary of compliance readiness",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name (e.g., Competitive Bidding, Service Eligibility, Cost Allocation)",
      "description": "What the issue is",
      "suggestion": "How to fix or mitigate",
      "rule_reference": "Specific FCC/USAC rule citation if applicable, or null"
    }
  ]
}

If the document appears compliant with no significant issues, return overall_risk "Low" with an empty or minimal findings array.
If the document does not appear to be a Form 470 or is unreadable, return overall_risk "High" with a single finding explaining the issue.
"""


async def analyze_form470(document_text: str) -> Optional[dict]:
    """
    Analyze Form 470 text for compliance issues using Gemini.

    Args:
        document_text: Extracted text content from the Form 470 PDF.

    Returns:
        Parsed JSON response with risk assessment, or None on failure.
    """
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        logger.error("No Gemini/Google API key configured")
        return None

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=SYSTEM_PROMPT,
        )

        # Truncate if extremely long (Gemini context is large but let's be safe)
        max_chars = 120_000
        if len(document_text) > max_chars:
            document_text = document_text[:max_chars] + "\n\n[Document truncated]"

        response = model.generate_content(
            f"Analyze this Form 470 document for USAC compliance readiness:\n\n{document_text}",
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        if not response.text:
            logger.error("Gemini returned empty response")
            return None

        # Parse JSON response
        result = json.loads(response.text)

        # Validate expected structure
        if "overall_risk" not in result or "findings" not in result:
            logger.error("Gemini response missing required fields: %s", response.text[:200])
            return None

        # Normalize overall_risk
        valid_risks = ("Low", "Medium", "High")
        if result["overall_risk"] not in valid_risks:
            result["overall_risk"] = "Medium"

        return result

    except json.JSONDecodeError as e:
        logger.error("Failed to parse Gemini JSON response: %s", str(e))
        return None
    except Exception as e:
        logger.error("Gemini analysis failed: %s", str(e))
        return None
