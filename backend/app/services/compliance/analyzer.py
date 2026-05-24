"""
Compliance Analyzer — deterministic rule engine + RAG retrieval + Gemini LLM analysis.
Phase 2B: Rules run first, corpus retrieval enriches context, findings feed into LLM prompt.
"""

import json
import logging
import os
from typing import Optional

import google.generativeai as genai

from ...core.config import settings, get_settings
from .rules import run_all_rules, ENGINE_VERSION
from .rules.base import RuleFinding

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an E-Rate compliance analyst specializing in FCC/USAC regulations.

You are reviewing a Form 470 document for potential compliance issues BEFORE submission to USAC.

Your task:
1. Identify areas where the document may trigger USAC review flags or denials.
2. Score the overall USAC issue risk as Low, Medium, or High.
3. Cite specific FCC/USAC rules where possible (e.g., FCC Order 19-117, USAC Program Integrity Guidelines).
4. Focus on competitive bidding requirements, service eligibility, cost-effectiveness, and documentation completeness.
5. NEVER claim guaranteed approval or denial — this is advisory only.
6. DO NOT re-derive issues already covered in the VERIFIED RULE FINDINGS section below. Instead, look for ADDITIONAL issues not caught by the deterministic rules.
7. If SUPPORTING DOCUMENTS are provided (RFPs, addenda, vendor bids, scope-of-work), cross-reference them against the primary Form 470 to identify:
   - Scope mismatches (services in RFP but missing from Form 470 or vice versa)
   - Vendor restriction language that could violate competitive bidding rules
   - Inconsistencies in service descriptions, quantities, or technical specs
   - Timeline conflicts between documents
   - Any language that could be interpreted as pre-selecting a vendor

Return ONLY valid JSON in this exact format:
{
  "overall_risk": "Low" | "Medium" | "High",
  "summary": "Brief 1-2 sentence summary of compliance readiness",
  "findings": [
    {
      "severity": "low" | "medium" | "high",
      "area": "Category name (e.g., Competitive Bidding, Service Eligibility, Cost Allocation, Cross-Document Inconsistency)",
      "description": "What the issue is",
      "suggestion": "How to fix or mitigate",
      "rule_reference": "Specific FCC/USAC rule citation if applicable, or null"
    }
  ]
}

If the document appears compliant with no significant issues beyond those in VERIFIED RULE FINDINGS, return overall_risk "Low" with an empty or minimal findings array.
If the document does not appear to be a Form 470 or is unreadable, return overall_risk "High" with a single finding explaining the issue.
"""


def _format_rule_findings_for_prompt(findings: list[RuleFinding]) -> str:
    """Format deterministic rule findings as context for the LLM prompt."""
    if not findings:
        return "No deterministic rule violations detected."

    lines = []
    for f in findings:
        lines.append(
            f"- [{f.rule_id}] ({f.severity.value}) {f.area}: {f.description} "
            f"[Ref: {f.rule_reference}]"
        )
    return "\n".join(lines)


async def analyze_form470(
    document_text: str, metadata: Optional[dict] = None,
    supporting_documents: Optional[list[dict]] = None,
) -> Optional[dict]:
    """
    Analyze Form 470 text using deterministic rules + Gemini LLM.

    Phase 1 flow:
    1. Run deterministic rule engine (pure Python, no API calls)
    2. Feed rule findings into Gemini prompt for grounding
    3. Return both rule_findings and llm_findings separately

    Args:
        document_text: Extracted text content from the Form 470 PDF.
        metadata: Optional dict with filename, upload context, etc.
        supporting_documents: Optional list of dicts with 'filename' and 'text' keys
                              for cross-document analysis.

    Returns:
        Dict with rule_findings, llm_findings, merged findings, and risk.
    """
    if metadata is None:
        metadata = {}

    # --- Phase 1: Deterministic Rule Engine ---
    rule_findings: list[RuleFinding] = []
    try:
        rule_findings = run_all_rules(document_text, metadata)
        logger.info(
            "Rule engine returned %d findings (engine v%s)",
            len(rule_findings),
            ENGINE_VERSION,
        )
    except Exception as e:
        logger.error("Rule engine failed: %s", str(e))

    # --- Phase 2B: Corpus RAG Retrieval ---
    corpus_citations = []
    try:
        from .retriever import retrieve, is_indexed
        if is_indexed():
            # Build query from rule findings + truncated text
            query_parts = [f.description for f in rule_findings]
            query_parts.append(document_text[:500])
            query_text = " ".join(query_parts)[:1000]

            chunks = retrieve(query_text, k=3)
            corpus_citations = [
                {"citation_id": c.citation_id, "source_url": c.source_url,
                 "text": c.text, "score": c.score}
                for c in chunks
            ]
            logger.info("Retrieved %d corpus chunks for context", len(corpus_citations))
    except Exception as e:
        logger.warning("Corpus retrieval skipped: %s", str(e))

    # --- Phase 2A: Multi-Agent Pipeline (if enabled) ---
    app_settings = get_settings()
    if app_settings.COMPLIANCE_USE_AGENTS:
        try:
            from .agents import run_pipeline

            rule_findings_dicts = [f.model_dump() for f in rule_findings]
            # Convert severity enums to strings for agent consumption
            for rf in rule_findings_dicts:
                if hasattr(rf.get("severity"), "value"):
                    rf["severity"] = rf["severity"].value

            result = await run_pipeline(
                document_text=document_text,
                metadata=metadata,
                rule_findings=rule_findings_dicts,
                corpus_citations=corpus_citations,
                engine_version=ENGINE_VERSION,
                supporting_documents=supporting_documents,
            )
            logger.info(
                "Multi-agent pipeline complete: risk=%s, findings=%d, timings=%s",
                result.overall_risk, len(result.findings), result.agent_timings,
            )
            return result.model_dump()
        except Exception as e:
            logger.error("Multi-agent pipeline failed, falling back to single LLM: %s", str(e))
            # Fall through to single-LLM path below

    # --- Phase 1: LLM Analysis with rule grounding (fallback or agents disabled) ---
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    llm_result = None

    if api_key:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                system_instruction=SYSTEM_PROMPT,
            )

            # Truncate if extremely long
            max_chars = 120_000
            text_for_llm = document_text
            if len(text_for_llm) > max_chars:
                text_for_llm = text_for_llm[:max_chars] + "\n\n[Document truncated]"

            # Build prompt with rule findings context
            rule_context = _format_rule_findings_for_prompt(rule_findings)

            # Add corpus citations if available
            corpus_context = ""
            if corpus_citations:
                corpus_lines = []
                for cc in corpus_citations:
                    corpus_lines.append(
                        f"- [{cc['citation_id']}] {cc['text'][:300]} "
                        f"(Source: {cc['source_url']})"
                    )
                corpus_context = (
                    "\n\nRELEVANT CITATIONS (from indexed FCC/USAC corpus):\n"
                    + "\n".join(corpus_lines)
                )

            # Build supporting documents context
            supporting_context = ""
            if supporting_documents:
                # Calculate available budget for supporting docs
                # Reserve ~80K chars for primary doc, allocate rest proportionally
                max_supporting_chars = max(0, max_chars - len(text_for_llm) - 5000)
                per_doc_budget = max_supporting_chars // len(supporting_documents) if supporting_documents else 0

                sup_parts = []
                for i, sup_doc in enumerate(supporting_documents, 1):
                    doc_text = sup_doc["text"]
                    if per_doc_budget > 0 and len(doc_text) > per_doc_budget:
                        doc_text = doc_text[:per_doc_budget] + "\n[...document truncated due to length]"
                        logger.warning(
                            "Supporting doc '%s' truncated from %d to %d chars",
                            sup_doc["filename"], len(sup_doc["text"]), per_doc_budget,
                        )
                    sup_parts.append(
                        f"\n=== SUPPORTING DOCUMENT {i} ({sup_doc['filename']}) ===\n{doc_text}"
                    )
                supporting_context = "\n\nSUPPORTING DOCUMENTS (cross-reference against Form 470):" + "".join(sup_parts)

            prompt = (
                f"VERIFIED RULE FINDINGS (from deterministic engine — do not re-derive these):\n"
                f"{rule_context}\n"
                f"{corpus_context}\n\n"
                f"---\n\n"
                f"PRIMARY DOCUMENT (Form 470):\n\n{text_for_llm}\n"
                f"{supporting_context}\n\n"
                f"---\n\n"
                f"Analyze this Form 470 document for ADDITIONAL USAC compliance issues "
                f"not already covered above."
                f"{' Also cross-reference the supporting documents for inconsistencies, scope mismatches, or vendor restriction issues.' if supporting_documents else ''}\n\n"
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
                if "overall_risk" not in llm_result or "findings" not in llm_result:
                    logger.error("Gemini response missing required fields")
                    llm_result = None
                else:
                    valid_risks = ("Low", "Medium", "High")
                    if llm_result["overall_risk"] not in valid_risks:
                        llm_result["overall_risk"] = "Medium"

        except json.JSONDecodeError as e:
            logger.error("Failed to parse Gemini JSON response: %s", str(e))
        except Exception as e:
            logger.error("Gemini analysis failed: %s", str(e))
    else:
        logger.warning("No Gemini API key — returning rule findings only")

    # --- Merge results ---
    rule_findings_dicts = [f.model_dump() for f in rule_findings]

    # Convert rule findings to the same shape as LLM findings for merged list
    merged_findings = []
    for rf in rule_findings_dicts:
        merged_findings.append({
            "severity": rf["severity"].lower() if isinstance(rf["severity"], str) else rf["severity"],
            "area": rf["area"],
            "description": rf["description"],
            "suggestion": rf["suggestion"],
            "rule_reference": rf["rule_reference"],
            "source": "rule_engine",
            "rule_id": rf["rule_id"],
        })

    llm_findings = []
    if llm_result:
        for lf in llm_result.get("findings", []):
            lf["source"] = "llm"
            llm_findings.append(lf)
            merged_findings.append(lf)

    # Determine overall risk (take the higher of rule-derived and LLM-derived)
    risk_order = {"Low": 0, "Medium": 1, "High": 2}
    rule_max_risk = "Low"
    for rf in rule_findings:
        if risk_order.get(rf.severity.value, 0) > risk_order.get(rule_max_risk, 0):
            rule_max_risk = rf.severity.value

    llm_risk = llm_result["overall_risk"] if llm_result else "Low"
    overall_risk = (
        rule_max_risk
        if risk_order.get(rule_max_risk, 0) >= risk_order.get(llm_risk, 0)
        else llm_risk
    )

    summary = llm_result.get("summary") if llm_result else None
    if not summary and rule_findings:
        summary = f"Deterministic rules identified {len(rule_findings)} issue(s)."

    return {
        "overall_risk": overall_risk,
        "summary": summary,
        "findings": merged_findings,
        "rule_findings": rule_findings_dicts,
        "llm_findings": llm_findings,
        "corpus_citations": corpus_citations,
        "engine_version": ENGINE_VERSION,
        "disclaimer": "Advisory only. Not legal or USAC official guidance.",
    }
