"""
SAM.gov Entity Management API lookup.

Confirms whether an E-Rate applicant entity has an active SAM.gov registration
(and UEI), which is required to receive BEAR (Form 472) reimbursements. USAC
Open Data does NOT publish this, so we query the federal source directly.

Docs: https://open.gsa.gov/api/entity-api/
Endpoint: https://api.sam.gov/entity-information/v3/entities?api_key=...

Notes:
  - The response is matched by legal business name (+ optional state). Names in
    E-Rate (EPC) and SAM.gov can differ, so callers should treat results as
    CANDIDATES for a human to confirm rather than auto-writing them blindly.
  - A personal/no-role data.gov key is rate-limited (as low as 10 req/day), so
    lookups must be on-demand and cached, never bulk.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

import requests

from ..core.config import get_settings

logger = logging.getLogger(__name__)

SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities"

_ACTIVE_STATUSES = {"active"}


def _norm(name: str) -> str:
    """Normalize an org name for fuzzy comparison (drop punctuation/casing/common words)."""
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(the|inc|llc|district|school|schools|isd|usd|of|and)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _match_confidence(query_name: str, result_name: str) -> str:
    """Coarse confidence label based on normalized name overlap."""
    q, r = _norm(query_name), _norm(result_name)
    if not q or not r:
        return "low"
    if q == r:
        return "high"
    qs, rs = set(q.split()), set(r.split())
    if not qs or not rs:
        return "low"
    overlap = len(qs & rs) / len(qs | rs)
    if overlap >= 0.6:
        return "high"
    if overlap >= 0.3:
        return "medium"
    return "low"


def is_configured() -> bool:
    return bool(get_settings().SAM_GOV_API_KEY)


def check_entity(name: str, state: Optional[str] = None, limit: int = 5) -> Dict[str, Any]:
    """
    Look up an entity by legal business name (+ optional 2-letter state) in
    SAM.gov and return candidate registrations.

    Returns a dict:
      {
        "configured": bool,          # False if no API key set
        "error": Optional[str],
        "query": {"name": ..., "state": ...},
        "matches": [ {uei, legal_name, registration_status, active,
                      expiration_date, cage_code, physical_state, confidence} ],
        "best_match": Optional[match],   # highest-confidence active match, else best
      }
    """
    settings = get_settings()
    api_key = settings.SAM_GOV_API_KEY
    result: Dict[str, Any] = {
        "configured": bool(api_key),
        "error": None,
        "query": {"name": name, "state": state},
        "matches": [],
        "best_match": None,
    }
    if not api_key:
        result["error"] = "SAM.gov API key not configured"
        return result

    clean_name = (name or "").strip()
    if not clean_name:
        result["error"] = "Entity name is required"
        return result

    params: Dict[str, Any] = {
        "api_key": api_key,
        "legalBusinessName": clean_name,
        "includeSections": "entityRegistration",
        "registrationStatus": "A",  # include active; SAM still returns others in the section
    }
    if state and len(state) == 2 and state.isalpha():
        params["physicalAddressProvinceOrStateCode"] = state.upper()

    try:
        resp = requests.get(SAM_ENTITY_URL, params=params, timeout=30)
    except requests.RequestException as exc:
        logger.warning("SAM.gov request failed: %s", exc)
        result["error"] = "SAM.gov request failed"
        return result

    if resp.status_code == 429:
        result["error"] = "SAM.gov rate limit reached — try again later"
        return result
    if resp.status_code in (401, 403):
        result["error"] = "SAM.gov API key rejected"
        return result
    if resp.status_code != 200:
        result["error"] = f"SAM.gov returned HTTP {resp.status_code}"
        return result

    try:
        payload = resp.json()
    except ValueError:
        result["error"] = "SAM.gov returned a non-JSON response"
        return result

    # v3 returns {"totalRecords": N, "entityData": [ {"entityRegistration": {...}}, ...]}
    entity_data = payload.get("entityData") or payload.get("entities") or []
    matches: List[Dict[str, Any]] = []
    for entry in entity_data[: max(1, limit)]:
        reg = (entry or {}).get("entityRegistration") or {}
        core = (entry or {}).get("coreData") or {}
        phys = (core.get("physicalAddress") or {}) if isinstance(core, dict) else {}
        status = (reg.get("registrationStatus") or "").strip()
        legal_name = (reg.get("legalBusinessName") or "").strip()
        match = {
            "uei": reg.get("ueiSAM") or reg.get("uei"),
            "legal_name": legal_name,
            "registration_status": status or None,
            "active": status.lower() in _ACTIVE_STATUSES,
            "expiration_date": reg.get("registrationExpirationDate"),
            "cage_code": reg.get("cageCode"),
            "physical_state": phys.get("stateOrProvinceCode"),
            "confidence": _match_confidence(clean_name, legal_name),
        }
        matches.append(match)

    result["matches"] = matches

    # Best match: prefer an active registration with the highest name confidence.
    def _rank(m: Dict[str, Any]) -> tuple:
        conf_order = {"high": 3, "medium": 2, "low": 1}
        return (1 if m["active"] else 0, conf_order.get(m["confidence"], 0))

    if matches:
        result["best_match"] = sorted(matches, key=_rank, reverse=True)[0]

    return result
