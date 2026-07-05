"""
Bid Analysis service — AI-powered evaluation and ranking of competing vendor bids
received in response to a Form 470.

Reuses the same Gemini LLM client pattern used by the compliance form analyzers
(see forms/generic.py, analyzer.py). The LLM extracts structured fields from each
bid and scores each on standard E-Rate evaluation metrics (0-100). Weighted totals
and ranking are computed deterministically in Python so the price-primary rule
(FCC Order 19-117) is enforced transparently.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai

from ...core.config import settings
from .rules import ENGINE_VERSION

logger = logging.getLogger(__name__)

# Metric keys and their default weights (must sum to 100).
# PRICE carries the highest default weight to satisfy the E-Rate requirement that
# the price of eligible products/services be the PRIMARY evaluation factor.
DEFAULT_WEIGHTS: dict[str, float] = {
    "price": 50.0,
    "tco": 20.0,
    "technical": 15.0,
    "support": 10.0,
    "experience": 5.0,
}

METRIC_LABELS: dict[str, str] = {
    "price": "Price of Eligible Products/Services",
    "tco": "Total Cost of Ownership",
    "technical": "Technical Fit / Capabilities",
    "support": "Support / SLA",
    "experience": "Vendor Experience / Prior Performance",
}

# Max characters of bid text sent to the LLM (shared budget across all bids).
MAX_TOTAL_CHARS = 120_000

SYSTEM_PROMPT = """You are an E-Rate bid evaluation analyst helping a school or library \
review the competing vendor bids it received in response to a Form 470 competitive bidding \
notice.

You must follow the FCC/USAC competitive bidding rules (FCC Order 19-117):
- The PRICE of the eligible products and services MUST be the single most heavily weighted \
factor in the evaluation. It can never be tied for or outweighed by any other factor.
- Other factors legitimately matter: total cost of ownership, technical fit/capabilities, \
support/SLA, and vendor experience/prior performance.

For EACH bid you are given, do two things:

1. EXTRACT structured fields (use null/empty when a field is not stated in the bid):
   - vendor_name
   - total_price (numeric, the total/contract price if stated; else null)
   - monthly_cost (numeric or null)
   - one_time_cost (numeric or null)
   - contract_term (e.g. "3 years", or null)
   - products_services (short list of the products/services offered)
   - key_specs (short list of notable technical specifications)
   - notable_terms (short list of noteworthy contract terms, warranties, or caveats)

2. SCORE the bid from 0-100 on each metric, judged COMPARATIVELY across all the bids \
provided (the strongest bid on a metric should approach 100, the weakest lower):
   - price: score the price competitiveness of the eligible products/services. The LOWEST \
priced compliant bid should score highest.
   - tco: total cost of ownership over the contract term (install, maintenance, recurring).
   - technical: how well the offered products/services and specs meet typical E-Rate needs.
   - support: quality of support commitments and SLA.
   - experience: vendor experience and prior performance signals present in the bid.

Also provide a one-sentence rationale per bid.

Return ONLY valid JSON in this exact shape:
{
  "bids": [
    {
      "source_index": 0,
      "vendor_name": "string",
      "total_price": number | null,
      "monthly_cost": number | null,
      "one_time_cost": number | null,
      "contract_term": "string" | null,
      "products_services": ["string"],
      "key_specs": ["string"],
      "notable_terms": ["string"],
      "scores": {
        "price": 0-100,
        "tco": 0-100,
        "technical": 0-100,
        "support": 0-100,
        "experience": 0-100
      },
      "rationale": "one sentence"
    }
  ]
}

The "source_index" MUST match the index of the bid as labeled in the input. Never invent \
bids that were not provided. This is an advisory decision-support tool, not an official \
USAC determination.
"""


def normalize_weights(raw: Optional[dict]) -> tuple[dict[str, float], bool]:
    """
    Normalize a caller-supplied weight map to sum to 100 across the known metrics.
    Missing metrics fall back to their default weight. Returns (weights, price_is_primary).
    price_is_primary is True when price has a strictly greater weight than every other metric.
    """
    weights: dict[str, float] = {}
    if not raw:
        weights = dict(DEFAULT_WEIGHTS)
    else:
        for key in DEFAULT_WEIGHTS:
            try:
                val = float(raw.get(key, DEFAULT_WEIGHTS[key]))
            except (TypeError, ValueError):
                val = DEFAULT_WEIGHTS[key]
            weights[key] = max(0.0, val)

    total = sum(weights.values())
    if total <= 0:
        weights = dict(DEFAULT_WEIGHTS)
        total = sum(weights.values())

    # Scale to sum to exactly 100.
    weights = {k: round(v * 100.0 / total, 2) for k, v in weights.items()}

    price_w = weights.get("price", 0.0)
    price_is_primary = all(
        price_w > weights.get(k, 0.0) for k in weights if k != "price"
    )
    return weights, price_is_primary


def _clamp_score(val) -> float:
    try:
        f = float(val)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, f))


def _empty_result(message: str, weights: dict[str, float], price_is_primary: bool) -> dict:
    return {
        "bids": [],
        "ranking": [],
        "winner": None,
        "weights": weights,
        "price_is_primary": price_is_primary,
        "rationale": message,
        "compliance_note": _compliance_note(price_is_primary),
        "engine_version": ENGINE_VERSION,
        "disclaimer": "Advisory only. Not legal or USAC official guidance.",
    }


def _compliance_note(price_is_primary: bool) -> str:
    base = (
        "Under FCC Order 19-117, the price of eligible products and services must be the "
        "single most heavily weighted factor when evaluating E-Rate bids."
    )
    if not price_is_primary:
        return (
            base
            + " WARNING: the weights you selected do NOT make price the primary factor. "
            "Increase the Price weight above every other factor before relying on this "
            "ranking for an actual award."
        )
    return base + " Your selected weights keep price as the primary factor."


def _build_bids_context(bids: list[dict]) -> tuple[str, int]:
    """Concatenate bid texts with index labels, sharing a character budget. Returns (text, used)."""
    if not bids:
        return "", 0
    per_bid = max(2000, MAX_TOTAL_CHARS // len(bids))
    parts = []
    for i, bid in enumerate(bids):
        text = (bid.get("text") or "")[:per_bid]
        if len((bid.get("text") or "")) > per_bid:
            text += "\n[...bid truncated due to length]"
        parts.append(
            f"\n=== BID {i} (filename: {bid.get('filename', f'bid_{i}')}) ===\n{text}"
        )
    joined = "".join(parts)
    return joined, len(joined)


async def analyze_bids(
    bids: list[dict],
    weights: Optional[dict] = None,
    form470_reference: Optional[str] = None,
) -> dict:
    """
    Evaluate and rank competing vendor bids.

    Args:
        bids: list of dicts with 'filename' and 'text' keys (one per uploaded bid).
        weights: optional metric weight map (price/tco/technical/support/experience).
        form470_reference: optional text describing the Form 470 requirements/scope.

    Returns:
        Dict with per-bid extracted fields + scores + weighted totals, a ranked list,
        the recommended winner, the applied weights, a compliance note, and a rationale.
    """
    norm_weights, price_is_primary = normalize_weights(weights)

    if not bids:
        return _empty_result("No bids were provided.", norm_weights, price_is_primary)

    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        return _empty_result("No AI API key configured.", norm_weights, price_is_primary)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            system_instruction=SYSTEM_PROMPT,
        )

        bids_context, used = _build_bids_context(bids)

        ref_context = ""
        if form470_reference and form470_reference.strip():
            budget = max(0, MAX_TOTAL_CHARS - used - 2000)
            ref_text = form470_reference.strip()[:budget] if budget else ""
            if ref_text:
                ref_context = (
                    "\n\nFORM 470 REQUIREMENTS / SCOPE (evaluate technical fit against this):\n"
                    + ref_text
                )

        weight_summary = ", ".join(
            f"{METRIC_LABELS[k]}={norm_weights[k]}%" for k in DEFAULT_WEIGHTS
        )

        prompt = (
            f"There are {len(bids)} competing vendor bids to evaluate.\n"
            f"The evaluator's chosen metric weights are: {weight_summary}.\n"
            f"Remember: price must remain the primary (most heavily weighted) factor.\n"
            f"{ref_context}\n\n"
            f"BIDS:\n{bids_context}\n\n"
            f"---\n\n"
            f"Extract the structured fields and comparative 0-100 scores for every bid, "
            f"keyed by source_index. Advisory only. Not legal or USAC official guidance."
        )

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        # Safely extract the model text. With google.generativeai, accessing
        # response.text raises a ValueError when the candidate was safety-
        # blocked or returned no content. Inspect feedback/candidates first so
        # we can surface a SPECIFIC reason to the user instead of collapsing
        # every failure into a generic "Bid analysis failed."
        block_reason = None
        try:
            pf = getattr(response, "prompt_feedback", None)
            block_reason = getattr(pf, "block_reason", None) if pf else None
        except Exception:
            block_reason = None
        if block_reason:
            return _empty_result(
                f"The AI blocked this request (reason: {block_reason}). "
                f"Try removing scanned images or sensitive content from the files.",
                norm_weights, price_is_primary,
            )

        raw_text = ""
        try:
            raw_text = response.text or ""
        except Exception:
            # response.text raised — reconstruct from candidate parts and report
            # the finish reason if there is genuinely nothing usable.
            try:
                cand = (getattr(response, "candidates", None) or [None])[0]
                finish = getattr(cand, "finish_reason", None) if cand else None
                content = getattr(cand, "content", None) if cand else None
                parts = getattr(content, "parts", []) if content else []
                raw_text = "".join(getattr(p, "text", "") for p in parts)
                if not raw_text:
                    return _empty_result(
                        f"The AI returned no usable content (finish reason: {finish}). "
                        f"Please try again or use fewer/smaller files.",
                        norm_weights, price_is_primary,
                    )
            except Exception:
                return _empty_result(
                    "The AI returned no response. Please try again.",
                    norm_weights, price_is_primary,
                )

        if not raw_text:
            return _empty_result(
                "The AI returned no response. Please try again.",
                norm_weights, price_is_primary,
            )

        parsed = json.loads(raw_text)
        raw_bids = parsed.get("bids", []) if isinstance(parsed, dict) else []
        if not raw_bids:
            return _empty_result(
                "AI could not extract any bids from the uploaded files.",
                norm_weights,
                price_is_primary,
            )

        # Map extracted bids back to source files by index, compute weighted totals.
        evaluated: list[dict] = []
        for i, bid in enumerate(bids):
            match = None
            for rb in raw_bids:
                if isinstance(rb, dict) and rb.get("source_index") == i:
                    match = rb
                    break
            if match is None and i < len(raw_bids):
                match = raw_bids[i]
            if not isinstance(match, dict):
                match = {}

            scores = match.get("scores") or {}
            clean_scores = {m: _clamp_score(scores.get(m)) for m in DEFAULT_WEIGHTS}
            weighted_total = round(
                sum(clean_scores[m] * norm_weights[m] for m in DEFAULT_WEIGHTS) / 100.0,
                1,
            )

            evaluated.append({
                "source_index": i,
                "filename": bid.get("filename", f"bid_{i}"),
                "vendor_name": match.get("vendor_name") or bid.get("filename") or f"Bid {i + 1}",
                "total_price": match.get("total_price"),
                "monthly_cost": match.get("monthly_cost"),
                "one_time_cost": match.get("one_time_cost"),
                "contract_term": match.get("contract_term"),
                "products_services": match.get("products_services") or [],
                "key_specs": match.get("key_specs") or [],
                "notable_terms": match.get("notable_terms") or [],
                "scores": clean_scores,
                "weighted_total": weighted_total,
                "rationale": match.get("rationale") or "",
            })

        # Rank by weighted total (highest first).
        evaluated.sort(key=lambda b: b["weighted_total"], reverse=True)
        for rank, b in enumerate(evaluated, 1):
            b["rank"] = rank

        winner = evaluated[0] if evaluated else None
        ranking = [
            {
                "rank": b["rank"],
                "vendor_name": b["vendor_name"],
                "weighted_total": b["weighted_total"],
                "source_index": b["source_index"],
            }
            for b in evaluated
        ]

        rationale = ""
        if winner:
            rationale = (
                f"{winner['vendor_name']} is the most advantageous bid with a weighted "
                f"score of {winner['weighted_total']} out of 100 under the selected "
                f"weighting (price weighted at {norm_weights['price']}%)."
            )

        return {
            "bids": evaluated,
            "ranking": ranking,
            "winner": winner,
            "weights": norm_weights,
            "price_is_primary": price_is_primary,
            "rationale": rationale,
            "compliance_note": _compliance_note(price_is_primary),
            "engine_version": ENGINE_VERSION,
            "disclaimer": "Advisory only. Not legal or USAC official guidance.",
        }

    except json.JSONDecodeError as e:
        logger.error("Bid analysis: failed to parse LLM JSON: %s", str(e))
        return _empty_result("AI response could not be parsed.", norm_weights, price_is_primary)
    except Exception as e:
        # Surface the actual error type/message so the UI shows WHY it failed
        # instead of an opaque generic message.
        logger.exception("Bid analysis failed")
        return _empty_result(
            f"Bid analysis failed: {type(e).__name__}: {e}",
            norm_weights, price_is_primary,
        )
