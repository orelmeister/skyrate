"""
Bid Compliance Copilot — analysis engine.

Combines three layers:

- Layer 1 (deterministic): rule-based checks over the parsed bid vs the Form 470
  requirements — responsiveness coverage, ineligible-item detection, pricing /
  itemization signals, structural completeness (SPIN, term, dates). Facts only,
  no LLM, never wrong about what is or isn't present.
- Layer 2 (RAG): retrieve the most relevant FCC-rule / ESL / appeal-precedent
  chunks for this bid's issues (see knowledge_base.retrieve).
- Layer 3 (grounded LLM): score 7 dimensions and produce cited findings + a
  refined bid draft, allowed to assert ONLY what resolves to a retrieved chunk
  (cite-or-abstain). Model id always from settings.GEMINI_MODEL; input capped;
  wrapped in asyncio.wait_for (the 2026-07 retired-model 502 lesson).

Everything degrades gracefully: if the LLM/key is unavailable, the deterministic
layer still returns real sub-scores and flags.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

import google.generativeai as genai

from ...core.config import settings
from .knowledge_base import retrieve

logger = logging.getLogger(__name__)

# Max chars of bid text sent to the LLM. Kept modest — input size drives latency,
# and 24k chars comfortably covers a typical proposal while staying well under the
# gateway timeout that produced the old Bid Analysis 504s.
MAX_BID_CHARS = 24_000
MAX_REFINED_STORE = 50_000  # keep stored refined text within MySQL TEXT bounds

# 7 scoring dimensions (weights sum to 100).
DIMENSIONS: List[Dict[str, Any]] = [
    {"key": "responsiveness", "label": "Responsiveness to the 470", "weight": 20,
     "anchor": "47 CFR § 54.503 (competitive bidding; fair & open)"},
    {"key": "eligibility", "label": "Service eligibility", "weight": 20,
     "anchor": "ESL; 47 CFR §§ 54.502 / 54.504 (cost allocation)"},
    {"key": "price", "label": "Price reasonableness", "weight": 18,
     "anchor": "47 CFR § 54.511 (price primary); § 54.500 LCP"},
    {"key": "fair_open", "label": "Fair & open / conflicts", "weight": 15,
     "anchor": "47 CFR § 54.503 (gift rules; integrity)"},
    {"key": "completeness", "label": "Completeness & clarity", "weight": 12,
     "anchor": "Program requirements; contract terms"},
    {"key": "pia_readiness", "label": "PIA-readiness", "weight": 10,
     "anchor": "USAC PIA review domains"},
    {"key": "documentation", "label": "Documentation trail", "weight": 5,
     "anchor": "47 CFR § 54.516 (recordkeeping)"},
]
_DIM_BY_KEY = {d["key"]: d for d in DIMENSIONS}
_TOTAL_WEIGHT = sum(d["weight"] for d in DIMENSIONS)

_LEVELS = ("pass", "warn", "fail")

# Keywords that commonly signal ineligible end-user devices / items bundled in a bid.
_INELIGIBLE_HINTS = (
    "laptop", "chromebook", "tablet", "ipad", "desktop", "workstation",
    "printer", "projector", "interactive whiteboard", "smartboard",
    "surveillance", "security camera", "cctv", "door lock", "hvac",
)
_ALLOCATION_HINTS = ("cost alloc", "cost-alloc", "allocation", "ineligible", "eligible portion")
_ITEMIZE_HINTS = ("unit price", "qty", "quantity", "line item", "itemized", "each", "per unit", "$")
# Category-1 (transport/internet) vs Category-2 (internal connections) signals, in
# tokenized form (see _tok: non-alphanumerics collapse to single spaces).
_C1_HINTS = ("internet access", "internet", "wan", "data transmission", "broadband",
             "lit fiber", "dark fiber", "ethernet", "mpls", "leased lit", "bandwidth",
             "fiber transport", "transport service")
_C2_HINTS = ("internal connection", "switch", "router", "access point", "wireless",
             "wi fi", "wifi", "firewall", "cabling", "uninterruptible", "patch panel",
             "cat6", "cat 6", "basic maintenance", "managed internal", "structured cabling")
_SPIN_RE = re.compile(r"\bspin\b|\b1[0-9]{8}\b", re.IGNORECASE)
_TERM_RE = re.compile(r"\b(\d+)\s*(year|yr|month|mo)s?\b", re.IGNORECASE)
_DATE_RE = re.compile(r"\b(20\d{2})\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")


def _tok(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


_CAT_LABELS = {"1": "Category 1", "2": "Category 2", "other": "other services"}


def _norm_cat(v: Any) -> str:
    """Normalize a 470 service_category value to '1' / '2' / 'other'."""
    s = _tok(v)
    if not s:
        return "other"
    if "2" in s or "two" in s or "internal" in s:
        return "2"
    if "1" in s or "one" in s:
        return "1"
    return "other"


def _cats_label(cats) -> str:
    labels = [_CAT_LABELS.get(c, f"Category {c}") for c in sorted(cats)]
    return " & ".join(labels) if labels else "n/a"


def _detect_bid_categories(low: str, terms_by_cat: Dict[str, List[str]]) -> set:
    """Which E-Rate category(ies) does this bid actually target? Explicit mention,
    keyword signals, or strong term coverage each count as targeting a category."""
    targeted: set = set()
    if any(p in low for p in ("category 1", "category one", "cat 1", "cat1")):
        targeted.add("1")
    if any(p in low for p in ("category 2", "category two", "cat 2", "cat2", "internal connection")):
        targeted.add("2")
    if sum(1 for h in _C1_HINTS if h in low) >= 2:
        targeted.add("1")
    if sum(1 for h in _C2_HINTS if h in low) >= 2:
        targeted.add("2")
    for cat, terms in terms_by_cat.items():
        if not terms:
            continue
        hit = [t for t in terms if _tok(t) and _tok(t) in low]
        if len(hit) / max(1, len(terms)) >= 0.34:
            targeted.add(cat)
    return targeted


# ---------------------------------------------------------------------------
# 470 context
# ---------------------------------------------------------------------------

def build_470_context(form_470_number: str) -> Dict[str, Any]:
    """Pull the Form 470 + requested services + RFP links for the target 470.

    Returns a normalized context dict (never raises)."""
    ctx: Dict[str, Any] = {
        "form_470_number": form_470_number,
        "found": False,
    }
    try:
        from utils.usac_client import USACDataClient
        client = USACDataClient()
        detail = client.get_470_detail(form_470_number)
    except Exception as e:
        logger.error("[bid_copilot] 470 fetch failed for %s: %s", form_470_number, e)
        detail = {"success": False, "error": str(e)}

    if not detail or not detail.get("success"):
        ctx["error"] = (detail or {}).get("error", "Form 470 not found")
        return ctx

    entity = detail.get("entity") or {}
    services = detail.get("services") or []
    rfp_links = []
    for s in services:
        rfp = s.get("rfp_documents")
        if rfp and isinstance(rfp, str) and rfp.startswith("http"):
            rfp_links.append(rfp)

    ctx.update({
        "found": True,
        "funding_year": detail.get("funding_year"),
        "status": detail.get("status"),
        "ben": entity.get("ben"),
        "applicant_name": entity.get("name"),
        "state": entity.get("state"),
        "city": entity.get("city"),
        "category_one_description": detail.get("category_one_description"),
        "category_two_description": detail.get("category_two_description"),
        "categories": detail.get("categories") or [],
        "service_types": detail.get("service_types") or [],
        "manufacturers": detail.get("manufacturers") or [],
        "services": [
            {
                "service_category": s.get("service_category"),
                "service_type": s.get("service_type"),
                "function": s.get("function"),
                "manufacturer": s.get("manufacturer"),
                "quantity": s.get("quantity"),
                "unit": s.get("unit"),
                "installation_required": s.get("installation_required"),
            }
            for s in services
        ],
        "total_services": len(services),
        "rfp_links": list(dict.fromkeys(rfp_links)),
    })
    return ctx


def _context_summary_text(ctx: Dict[str, Any]) -> str:
    """Compact text form of the 470 requirements for the LLM prompt."""
    if not ctx.get("found"):
        return "No Form 470 record was retrieved; judge the bid on its face and state that the 470 context was unavailable."
    lines = [
        f"Form 470: {ctx.get('form_470_number')}",
        f"Applicant: {ctx.get('applicant_name')} (BEN {ctx.get('ben')}), {ctx.get('city')}, {ctx.get('state')}",
        f"Funding Year: {ctx.get('funding_year')}   Status: {ctx.get('status')}",
        f"Categories: {', '.join(str(c) for c in ctx.get('categories') or []) or 'n/a'}",
    ]
    if ctx.get("category_one_description"):
        lines.append(f"Category One narrative: {str(ctx['category_one_description'])[:600]}")
    if ctx.get("category_two_description"):
        lines.append(f"Category Two narrative: {str(ctx['category_two_description'])[:600]}")
    svc = ctx.get("services") or []
    if svc:
        lines.append("Requested services:")
        for s in svc[:40]:
            lines.append(
                "  - "
                + " | ".join(
                    str(x) for x in [
                        s.get("service_category"), s.get("service_type"), s.get("function"),
                        s.get("manufacturer"),
                        (f"qty {s.get('quantity')} {s.get('unit') or ''}".strip() if s.get("quantity") else None),
                        ("install required" if str(s.get("installation_required") or "").lower() in ("yes", "y", "true", "1") else None),
                    ] if x
                )
            )
    if ctx.get("rfp_uploaded_text"):
        lines.append("RFP document (vendor-supplied) excerpt:")
        lines.append("  " + str(ctx["rfp_uploaded_text"])[:2000])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Layer 1 — deterministic
# ---------------------------------------------------------------------------

def run_deterministic(bid_text: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based checks. Returns {subscores:{key:int}, findings:[...], signals:{}}."""
    text = bid_text or ""
    low = _tok(text)
    findings: List[Dict[str, Any]] = []
    subscores: Dict[str, int] = {}

    # --- Responsiveness: does the bid address the requested services it is bidding on? ---
    # A 470 often lists BOTH Category 1 and Category 2, and a vendor is NOT required to
    # bid on both unless the RFP mandates bundling. Detect which category(ies) THIS bid
    # targets and score coverage only over those, so a compliant single-category bid is
    # not penalized for "missing" the other category (Ari 2026-09-01 feedback).
    terms_by_cat: Dict[str, List[str]] = {}
    for s in ctx.get("services") or []:
        cat = _norm_cat(s.get("service_category"))
        for field in ("service_type", "function", "manufacturer"):
            v = s.get(field)
            if v and isinstance(v, str) and len(v) > 2:
                terms_by_cat.setdefault(cat, []).append(v)
    for c in terms_by_cat:
        terms_by_cat[c] = list(dict.fromkeys(terms_by_cat[c]))
    requested_terms = list(dict.fromkeys(t for terms in terms_by_cat.values() for t in terms))

    present_cats = {c for c, terms in terms_by_cat.items() if terms}
    bid_cats = _detect_bid_categories(low, terms_by_cat) & present_cats
    scored_cats = bid_cats or set(present_cats)  # fall back to all when undetectable
    not_scored_cats = present_cats - scored_cats
    scored_terms = list(dict.fromkeys(t for c in scored_cats for t in terms_by_cat.get(c, [])))

    if scored_terms:
        hit = [t for t in scored_terms if _tok(t) and _tok(t) in low]
        coverage = len(hit) / max(1, len(scored_terms))
        subscores["responsiveness"] = int(round(coverage * 100))
        missing = [t for t in scored_terms if t not in hit][:8]
        if coverage < 0.5:
            findings.append(_f("responsiveness", "fail",
                              "The bid does not clearly address most of the services it is bidding on.",
                              f"Explicitly respond to each requested item: {', '.join(missing)}.",
                              rule_cite="47 CFR § 54.503"))
        elif missing:
            findings.append(_f("responsiveness", "warn",
                              f"The bid may not address every requested item ({len(missing)} not detected).",
                              f"Confirm coverage of: {', '.join(missing)}.",
                              rule_cite="47 CFR § 54.503"))
    else:
        subscores["responsiveness"] = 70  # no structured 470 lines available to check against

    # Partial-category bids are permitted — surface (do NOT penalize) the un-bid category.
    if not_scored_cats and len(present_cats) > 1:
        findings.append(_f("responsiveness", "pass",
                          f"Bid targets {_cats_label(scored_cats)} only; "
                          f"{_cats_label(not_scored_cats)} item(s) on the Form 470 were not scored.",
                          "Bidding on a single category is permitted unless the Form 470/RFP requires a bundled all-categories bid — confirm the RFP does not mandate one.",
                          rule_cite="47 CFR § 54.503"))

    # --- Eligibility: ineligible items without cost allocation ---
    found_ineligible = [w for w in _INELIGIBLE_HINTS if w in low]
    has_allocation = any(h in low for h in _ALLOCATION_HINTS)
    if found_ineligible and not has_allocation:
        subscores["eligibility"] = 55
        findings.append(_f("eligibility", "fail",
                          f"Potentially ineligible item(s) detected ({', '.join(sorted(set(found_ineligible)))}) with no cost allocation language.",
                          "Itemize and cost-allocate any ineligible components out of the eligible request, or remove them.",
                          rule_cite="47 CFR § 54.504"))
    elif found_ineligible:
        subscores["eligibility"] = 80
        findings.append(_f("eligibility", "warn",
                          f"Items that can be ineligible were mentioned ({', '.join(sorted(set(found_ineligible)))}); ensure the allocation is explicit.",
                          "Show the eligible vs ineligible split with dollar amounts.",
                          rule_cite="47 CFR § 54.504"))
    else:
        subscores["eligibility"] = 85

    # --- Price: itemization + pricing signals ---
    itemize_hits = sum(1 for h in _ITEMIZE_HINTS if h in low)
    if itemize_hits >= 3:
        subscores["price"] = 82
    elif itemize_hits >= 1:
        subscores["price"] = 68
        findings.append(_f("price", "warn",
                          "Pricing appears only partially itemized.",
                          "Provide unit price x quantity = extended cost for every line, split eligible vs ineligible.",
                          rule_cite="47 CFR § 54.511"))
    else:
        subscores["price"] = 45
        findings.append(_f("price", "fail",
                          "No clear itemized pricing detected.",
                          "Add an itemized price table (unit price, quantity, extended cost, one-time vs recurring).",
                          rule_cite="47 CFR § 54.511"))

    # --- Fair & open: red-flag language / neutral base ---
    subscores["fair_open"] = 78
    if any(p in low for p in ("we wrote", "helped write", "prepared the 470", "drafted the rfp")):
        subscores["fair_open"] = 40
        findings.append(_f("fair_open", "fail",
                          "Language suggests the bidder helped prepare the Form 470 / RFP.",
                          "Remove any indication of involvement in writing the 470/RFP; confirm arm's-length participation.",
                          rule_cite="47 CFR § 54.503"))

    # --- Completeness: SPIN, term, dates ---
    present = 0
    total_checks = 3
    has_spin = bool(_SPIN_RE.search(text))
    has_term = bool(_TERM_RE.search(text))
    has_dates = bool(_DATE_RE.search(text))
    present = sum([has_spin, has_term, has_dates])
    subscores["completeness"] = int(round((present / total_checks) * 100)) if total_checks else 70
    missing_struct = []
    if not has_spin:
        missing_struct.append("SPIN")
    if not has_term:
        missing_struct.append("contract term")
    if not has_dates:
        missing_struct.append("service/award dates")
    if missing_struct:
        findings.append(_f("completeness", "warn" if present >= 1 else "fail",
                          f"Missing structural element(s): {', '.join(missing_struct)}.",
                          "Add the provider SPIN, an explicit contract term with any voluntary extensions, and clear dates.",
                          rule_cite="47 CFR § 54.516"))

    # --- PIA-readiness & documentation: derived base, refined by LLM ---
    subscores["pia_readiness"] = int(round(
        0.5 * subscores.get("eligibility", 70) + 0.5 * subscores.get("completeness", 70)
    ))
    doc_hits = sum(1 for h in ("scope of work", "sow", "warranty", "sla", "terms") if h in low)
    subscores["documentation"] = 60 + min(40, doc_hits * 12)

    return {"subscores": subscores, "findings": findings,
            "signals": {"has_spin": has_spin, "has_term": has_term, "has_dates": has_dates,
                        "ineligible_hits": sorted(set(found_ineligible)),
                        "requested_terms": requested_terms,
                        "bid_categories": sorted(scored_cats),
                        "not_scored_categories": sorted(not_scored_cats)}}


def _f(dimension: str, level: str, message: str, fix: str,
       rule_cite: Optional[str] = None, precedent_id: Optional[int] = None,
       precedent_url: Optional[str] = None) -> Dict[str, Any]:
    if level not in _LEVELS:
        level = "warn"
    return {
        "dimension": dimension,
        "level": level,
        "message": message,
        "fix": fix,
        "rule_cite": rule_cite,
        "precedent_id": precedent_id,
        "precedent_url": precedent_url,
        "source": "deterministic",
    }


# ---------------------------------------------------------------------------
# Layer 3 — grounded LLM
# ---------------------------------------------------------------------------

_ANALYZE_SYSTEM = """You are an E-Rate (FCC Universal Service, Schools & Libraries) bid \
compliance analyst. A SERVICE PROVIDER (vendor) has uploaded THEIR OWN bid/proposal and wants \
to know, BEFORE they submit it, whether it is responsive to the applicant's Form 470 and \
compliant with the FCC rules — and exactly how to improve it.

You are given: (1) the vendor's bid text, (2) the Form 470 requirements, (3) deterministic \
findings already computed, and (4) RETRIEVED KNOWLEDGE-BASE PASSAGES (FCC rules / ESL / appeal \
precedents) each with a citation.

STRICT GROUNDING RULES:
- Every legal/compliance claim you make MUST cite one of the provided passages by its exact \
citation string. If no provided passage supports a point, set "rule_cite" to null and say so — \
NEVER invent a CFR section, docket, or case number.
- Deterministic facts (what is/ isn't present, arithmetic) come from the provided findings; do \
not contradict them.
- This is decision-support, NOT legal advice, and a high score is NOT a guarantee of funding.

Score each of these 7 dimensions 0-100 with a level of pass/warn/fail:
responsiveness, eligibility, price, fair_open, completeness, pia_readiness, documentation.

Return ONLY valid JSON in this exact shape:
{
  "subscores": {
    "responsiveness": {"score": 0-100, "level": "pass|warn|fail", "rationale": "one sentence"},
    "eligibility": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."},
    "price": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."},
    "fair_open": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."},
    "completeness": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."},
    "pia_readiness": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."},
    "documentation": {"score": 0-100, "level": "pass|warn|fail", "rationale": "..."}
  },
  "findings": [
    {"dimension": "one of the 7 keys", "level": "pass|warn|fail",
     "rule_cite": "exact citation from a provided passage or null",
     "message": "the specific problem or strength", "fix": "a concrete, actionable rewrite"}
  ],
  "summary": "2-3 sentence plain-English verdict",
  "refined_bid_text": "an improved, compliance-tightened version of the bid (or the key revised sections), itemized and cost-allocated where needed"
}
"""


def _build_kb_block(chunks: List[Dict[str, Any]]) -> str:
    if not chunks:
        return "(no passages retrieved)"
    parts = []
    for c in chunks:
        parts.append(f"[{c.get('citation')}] {c.get('title')}\n{(c.get('text') or '')[:900]}")
    return "\n\n".join(parts)


async def _gemini_json(system_prompt: str, user_prompt: str, timeout: int = 46) -> Dict[str, Any]:
    """Call Gemini and parse JSON. Returns {} on any failure (caller degrades)."""
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return {}
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name=(settings.GEMINI_MODEL or "gemini-2.5-flash"),
            system_instruction=system_prompt,
        )
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                user_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
                request_options={"timeout": 40},
            ),
            timeout=timeout,
        )
        raw = (response.text or "").strip()
        if not raw:
            return {}
        return json.loads(raw)
    except asyncio.TimeoutError:
        logger.warning("[bid_copilot] LLM timed out")
        return {"_error": "timeout"}
    except Exception as e:
        logger.error("[bid_copilot] LLM call failed: %s", e)
        return {"_error": str(e)}


def _valid_citations(chunks: List[Dict[str, Any]]) -> set:
    return {c.get("citation") for c in chunks if c.get("citation")}


async def analyze_bid(db, bid_text: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Full pipeline: deterministic + RAG + grounded LLM -> merged result."""
    det = run_deterministic(bid_text, ctx)

    # Category-scope note for the LLM: don't penalize a single-category bid for the
    # category it isn't bidding on (Ari 2026-09-01 feedback).
    _sig = det.get("signals", {})
    _bid_cats = [_CAT_LABELS.get(c, c) for c in (_sig.get("bid_categories") or [])]
    _not_scored = [_CAT_LABELS.get(c, c) for c in (_sig.get("not_scored_categories") or [])]
    cat_note = ""
    if _bid_cats:
        cat_note = f"=== BID CATEGORY SCOPE ===\nThis bid targets: {', '.join(_bid_cats)}."
        if _not_scored:
            cat_note += (
                f" The Form 470 also lists {', '.join(_not_scored)}, which this vendor is NOT bidding on. "
                "Do NOT lower the responsiveness score for the un-bid category — bidding on a single "
                "E-Rate category is permitted unless the 470/RFP requires a bundled all-categories bid."
            )
        cat_note += "\n\n"

    # Build a retrieval query from the 470 + the deterministic signals so we pull
    # the rules/precedents most relevant to THIS bid's likely issues.
    issue_terms = []
    for fnd in det["findings"]:
        issue_terms.append(fnd["dimension"])
        issue_terms.append(fnd["message"])
    query = " ".join([
        "E-Rate bid compliance responsiveness eligibility price fair open competitive bidding",
        " ".join(str(c) for c in ctx.get("categories") or []),
        " ".join(str(t) for t in ctx.get("service_types") or []),
        " ".join(issue_terms),
    ])
    chunks = retrieve(db, query, k=6)
    valid_cites = _valid_citations(chunks)

    bid_for_llm = (bid_text or "")[:MAX_BID_CHARS]
    det_findings_text = "\n".join(
        f"- [{f['dimension']}/{f['level']}] {f['message']} (fix: {f['fix']})" for f in det["findings"]
    ) or "(no deterministic flags)"

    user_prompt = (
        f"=== FORM 470 REQUIREMENTS ===\n{_context_summary_text(ctx)}\n\n"
        f"{cat_note}"
        f"=== DETERMINISTIC FINDINGS (facts already computed; do not contradict) ===\n{det_findings_text}\n\n"
        f"=== RETRIEVED KNOWLEDGE-BASE PASSAGES (cite ONLY these) ===\n{_build_kb_block(chunks)}\n\n"
        f"=== VENDOR BID TEXT ===\n{bid_for_llm}\n\n"
        f"---\nScore the 7 dimensions, produce cited findings (rule_cite MUST be one of: "
        f"{sorted(valid_cites)} or null), a plain-English summary, and a refined_bid_text. "
        f"Decision-support only; not legal advice."
    )

    llm = await _gemini_json(_ANALYZE_SYSTEM, user_prompt)
    llm_ok = bool(llm) and "_error" not in llm and isinstance(llm.get("subscores"), dict)

    # Merge sub-scores: prefer LLM (grounded judgment), fall back to deterministic.
    merged_subscores: List[Dict[str, Any]] = []
    for d in DIMENSIONS:
        key = d["key"]
        det_score = det["subscores"].get(key, 70)
        level = None
        score = det_score
        rationale = None
        if llm_ok:
            ls = llm["subscores"].get(key) or {}
            if isinstance(ls, dict) and ls.get("score") is not None:
                try:
                    score = max(0, min(100, int(round(float(ls["score"])))))
                except (TypeError, ValueError):
                    score = det_score
                level = ls.get("level") if ls.get("level") in _LEVELS else None
                rationale = ls.get("rationale")
        if level is None:
            level = "pass" if score >= 80 else ("warn" if score >= 60 else "fail")
        merged_subscores.append({
            "key": key, "label": d["label"], "weight": d["weight"],
            "anchor": d["anchor"], "score": score, "level": level, "rationale": rationale,
        })

    # Findings: deterministic + LLM (LLM citations filtered to valid set = cite-or-abstain).
    findings: List[Dict[str, Any]] = list(det["findings"])
    if llm_ok and isinstance(llm.get("findings"), list):
        for lf in llm["findings"]:
            if not isinstance(lf, dict):
                continue
            cite = lf.get("rule_cite")
            if cite and cite not in valid_cites:
                cite = None  # abstain rather than surface an unverifiable citation
            prec = _match_precedent(chunks, cite, lf.get("message", ""))
            findings.append({
                "dimension": lf.get("dimension") or "general",
                "level": lf.get("level") if lf.get("level") in _LEVELS else "warn",
                "message": lf.get("message") or "",
                "fix": lf.get("fix") or "",
                "rule_cite": cite,
                "precedent_id": (prec or {}).get("id"),
                "precedent_url": (prec or {}).get("url"),
                "source": "ai",
            })

    overall = _weighted_overall(merged_subscores)

    return {
        "overall_score": overall,
        "subscores": merged_subscores,
        "findings": findings,
        "summary": (llm.get("summary") if llm_ok else None) or _fallback_summary(overall, findings),
        "refined_bid_text": (llm.get("refined_bid_text") if llm_ok else None),
        "sources": [
            {"id": c.get("id"), "citation": c.get("citation"), "title": c.get("title"),
             "url": c.get("url"), "source_type": c.get("source_type"), "score": c.get("score")}
            for c in chunks
        ],
        "engine": (settings.GEMINI_MODEL or "gemini-2.5-flash") if llm_ok else "deterministic-only",
        "llm_used": llm_ok,
    }


def _match_precedent(chunks: List[Dict[str, Any]], cite: Optional[str], message: str) -> Optional[Dict[str, Any]]:
    """Link a finding to a retrieved appeal-precedent chunk when relevant."""
    for c in chunks:
        if c.get("source_type") == "fcc_appeal":
            if cite and c.get("citation") == cite:
                return c
    return None


def _weighted_overall(subscores: List[Dict[str, Any]]) -> int:
    if not subscores:
        return 0
    total = sum(s["score"] * s["weight"] for s in subscores)
    overall = int(round(total / max(1, _TOTAL_WEIGHT)))
    # A hard fail on eligibility or fair_open caps the overall (a bid that is
    # ineligible or tainted can't be "good" regardless of the other dimensions).
    for s in subscores:
        if s["key"] in ("eligibility", "fair_open") and s["level"] == "fail":
            overall = min(overall, 59)
    return max(0, min(100, overall))


def _fallback_summary(overall: int, findings: List[Dict[str, Any]]) -> str:
    fails = [f for f in findings if f["level"] == "fail"]
    warns = [f for f in findings if f["level"] == "warn"]
    band = "strong" if overall >= 80 else ("borderline" if overall >= 60 else "at risk")
    return (
        f"Deterministic compliance check: this bid scores {overall}/100 ({band}). "
        f"{len(fails)} hard flag(s) and {len(warns)} warning(s) to address before submitting. "
        f"AI grounding was unavailable, so this reflects the rule-based checks only."
    )


# ---------------------------------------------------------------------------
# Refine loop
# ---------------------------------------------------------------------------

_REFINE_SYSTEM = """You are the E-Rate Bid Compliance Copilot helping a vendor refine their bid. \
You are given the current bid/refined draft, the Form 470 requirements, the prior findings, the \
grounding passages, and the user's request. Apply the requested change while keeping the bid \
FCC-compliant and responsive to the 470. Cite only the provided passages; never invent citations. \
Decision-support only, not legal advice.

Return ONLY valid JSON:
{"reply": "a short explanation of what you changed and why (cite passages where relevant)",
 "refined_bid_text": "the full updated refined bid text"}
"""


async def refine_bid(db, analysis: Dict[str, Any], message: str) -> Dict[str, Any]:
    """Chat-refine the bid. analysis is a VendorBidAnalysis.to_dict()."""
    ctx = analysis.get("context") or {}
    current = analysis.get("refined_bid_text") or analysis.get("bid_excerpt") or ""
    query = f"{message} {' '.join(str(c) for c in ctx.get('categories') or [])} E-Rate compliance"
    chunks = retrieve(db, query, k=5)
    valid_cites = _valid_citations(chunks)

    user_prompt = (
        f"=== FORM 470 REQUIREMENTS ===\n{_context_summary_text(ctx)}\n\n"
        f"=== GROUNDING PASSAGES (cite ONLY these: {sorted(valid_cites)}) ===\n{_build_kb_block(chunks)}\n\n"
        f"=== CURRENT REFINED BID DRAFT ===\n{(current or '')[:MAX_BID_CHARS]}\n\n"
        f"=== USER REQUEST ===\n{message}\n"
    )
    llm = await _gemini_json(_REFINE_SYSTEM, user_prompt)
    if not llm or "_error" in llm:
        return {
            "reply": "The AI refine service is temporarily unavailable. Your draft is unchanged — please try again.",
            "refined_bid_text": current,
            "ok": False,
        }
    return {
        "reply": llm.get("reply") or "Updated.",
        "refined_bid_text": (llm.get("refined_bid_text") or current)[:MAX_REFINED_STORE],
        "sources": [{"citation": c.get("citation"), "url": c.get("url")} for c in chunks],
        "ok": True,
    }
