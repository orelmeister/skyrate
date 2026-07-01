"""
Industry Pulse API Endpoints

At-a-glance E-Rate industry analytics built entirely from USAC Open Data
(Form 471 view srbr-2d59). Every metric is produced with a single Socrata
aggregation query ($select sum/count + $group + $where) — no row dumps — and
the whole response is wrapped in the shared MySQL-backed USAC cache
(get_or_cache) with a long TTL since these are program-wide aggregates that
change slowly.

Data source: https://opendata.usac.org/resource/srbr-2d59.json
Fields used: funding_year, form_471_frn_status_name (Funded/Denied/Pending/
Cancelled), funding_commitment_request, state, form_471_service_type_name,
spin_name, crn_data ("{Consultant Name|CRN|email}"), ben.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...core.security import get_current_user
from ...models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/industry", tags=["Industry Pulse"])

# Statuses that carry committed dollars vs. the full status universe.
_FUNDED = "Funded"


# ==================== USAC AGGREGATION HELPERS ====================

def _client():
    """Reuse the shared USAC client (robust retrying session + app token)."""
    from utils.usac_client import USACDataClient
    return USACDataClient()


def _agg(
    select: str,
    where: Optional[str] = None,
    group: Optional[str] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Run ONE Socrata aggregation query against the Form 471 view and return the
    parsed JSON rows. Raises on HTTP error so the caller can surface a clean
    500 (and so a bad query never gets cached as a success).
    """
    from utils.usac_client import USAC_ENDPOINTS

    params: Dict[str, Any] = {"$select": select}
    if where:
        params["$where"] = where
    if group:
        params["$group"] = group
    if order:
        params["$order"] = order
    if limit is not None:
        params["$limit"] = limit

    client = _client()
    resp = client.session.get(USAC_ENDPOINTS["form_471"], params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


def _f(val: Any) -> float:
    from utils.usac_client import safe_float
    return safe_float(val)


def _i(val: Any) -> int:
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def _pct(part: float, whole: float) -> float:
    return round((part / whole) * 100, 1) if whole else 0.0


def _parse_consultant(crn_data: str) -> Dict[str, str]:
    """
    Parse the composite crn_data column "{Name|CRN|email}" into name + crn.
    Returns {'name': ..., 'crn': ...}. Falls back gracefully on odd formats.
    """
    raw = (crn_data or "").strip().strip("{}").strip()
    parts = [p.strip() for p in raw.split("|")]
    name = parts[0] if parts and parts[0] else "Unknown"
    crn = parts[1] if len(parts) > 1 else ""
    return {"name": name, "crn": crn}


def _available_years() -> List[int]:
    """Distinct funding years present in the dataset, newest first (cached)."""
    from utils.usac_cache import get_or_cache

    def fetch() -> Dict[str, Any]:
        rows = _agg(
            select="funding_year, count(*) as n",
            group="funding_year",
            order="funding_year DESC",
            limit=25,
        )
        years = sorted({_i(r.get("funding_year")) for r in rows if _i(r.get("funding_year")) > 0}, reverse=True)
        return {"success": True, "years": years}

    result = get_or_cache("industry_years", {}, ttl_hours=24, fetch_fn=fetch)
    return result.get("years", [])


def _resolve_year(year: Optional[int]) -> int:
    years = _available_years()
    if year and (not years or year in years):
        return year
    if years:
        return years[0]
    # Hard fallback if the years probe failed for some reason.
    return year or 2026


# ==================== COMPUTE (cache miss) FUNCTIONS ====================
# These build the payloads on a cache miss. They are module-level (not nested
# closures) so the scheduler's prewarm can reuse the EXACT same compute logic
# without duplicating it. The endpoints wrap these in get_or_cache with the
# same namespace/params/ttl they always used, so cache keys never drift.

def _compute_pulse(resolved_year: int) -> Dict[str, Any]:
    base = f"funding_year='{resolved_year}'"
    funded_where = f"{base} AND form_471_frn_status_name='{_FUNDED}'"

    # 1) status breakdown (one call) — counts + committed per status
    status_rows = _agg(
        select="form_471_frn_status_name, count(*) as n, sum(funding_commitment_request) as committed",
        where=base,
        group="form_471_frn_status_name",
        order="committed DESC",
    )

    # 2) funded totals incl. distinct applicants (one call)
    funded_rows = _agg(
        select="sum(funding_commitment_request) as committed, count(*) as frns, count(distinct ben) as applicants",
        where=funded_where,
    )

    # 3) committed by service type (funded) — one call
    service_rows = _agg(
        select="form_471_service_type_name, sum(funding_commitment_request) as committed, count(*) as n",
        where=funded_where,
        group="form_471_service_type_name",
        order="committed DESC",
    )

    # 4) top 10 states by committed (funded) — one call
    state_rows = _agg(
        select="state, sum(funding_commitment_request) as committed, count(*) as n",
        where=funded_where,
        group="state",
        order="committed DESC",
        limit=10,
    )

    # ---- shape the response ----
    total_frns = sum(_i(r.get("n")) for r in status_rows)
    by_status: Dict[str, Dict[str, Any]] = {}
    for r in status_rows:
        name = (r.get("form_471_frn_status_name") or "Unknown").strip()
        n = _i(r.get("n"))
        by_status[name] = {
            "status": name,
            "frns": n,
            "committed": _f(r.get("committed")),
            "pct_of_frns": _pct(n, total_frns),
        }

    funded = funded_rows[0] if funded_rows else {}
    total_committed = _f(funded.get("committed"))
    funded_frns = _i(funded.get("frns"))
    applicants = _i(funded.get("applicants"))

    by_service = [
        {
            "service_type": (r.get("form_471_service_type_name") or "Unknown").strip(),
            "committed": _f(r.get("committed")),
            "frns": _i(r.get("n")),
            "pct_of_committed": _pct(_f(r.get("committed")), total_committed),
        }
        for r in service_rows
    ]

    top_states = [
        {
            "state": (r.get("state") or "").strip().upper(),
            "committed": _f(r.get("committed")),
            "frns": _i(r.get("n")),
            "pct_of_committed": _pct(_f(r.get("committed")), total_committed),
        }
        for r in state_rows
        if (r.get("state") or "").strip()
    ]

    return {
        "success": True,
        "year": resolved_year,
        "available_years": _available_years(),
        "totals": {
            "total_committed": total_committed,
            "funded_frns": funded_frns,
            "total_frns": total_frns,
            "applicants": applicants,
            "funded_pct": _pct(funded_frns, total_frns),
        },
        "status_breakdown": {
            "funded": by_status.get("Funded", {"status": "Funded", "frns": 0, "committed": 0.0, "pct_of_frns": 0.0}),
            "pending": by_status.get("Pending", {"status": "Pending", "frns": 0, "committed": 0.0, "pct_of_frns": 0.0}),
            "denied": by_status.get("Denied", {"status": "Denied", "frns": 0, "committed": 0.0, "pct_of_frns": 0.0}),
            "cancelled": by_status.get("Cancelled", {"status": "Cancelled", "frns": 0, "committed": 0.0, "pct_of_frns": 0.0}),
        },
        "by_service_type": by_service,
        "top_states": top_states,
    }


def _compute_top_providers(resolved_year: int, limit: int) -> Dict[str, Any]:
    funded_where = (
        f"funding_year='{resolved_year}' AND form_471_frn_status_name='{_FUNDED}' "
        "AND spin_name IS NOT NULL"
    )
    rows = _agg(
        select="spin_name, sum(funding_commitment_request) as committed, count(*) as n",
        where=funded_where,
        group="spin_name",
        order="committed DESC",
        limit=limit,
    )
    providers = [
        {
            "rank": idx + 1,
            "spin_name": (r.get("spin_name") or "").strip(),
            "committed": _f(r.get("committed")),
            "frns": _i(r.get("n")),
        }
        for idx, r in enumerate(rows)
        if (r.get("spin_name") or "").strip()
    ]
    return {"success": True, "year": resolved_year, "count": len(providers), "providers": providers}


def _compute_top_consultants(resolved_year: int, limit: int) -> Dict[str, Any]:
    funded_where = (
        f"funding_year='{resolved_year}' AND form_471_frn_status_name='{_FUNDED}' "
        "AND crn_data IS NOT NULL"
    )
    rows = _agg(
        select="crn_data, sum(funding_commitment_request) as committed, count(*) as n",
        where=funded_where,
        group="crn_data",
        order="committed DESC",
        limit=limit,
    )
    consultants = []
    for idx, r in enumerate(rows):
        parsed = _parse_consultant(r.get("crn_data", ""))
        if parsed["name"] == "Unknown" and not parsed["crn"]:
            continue
        consultants.append({
            "rank": idx + 1,
            "name": parsed["name"],
            "crn": parsed["crn"],
            "committed": _f(r.get("committed")),
            "frns": _i(r.get("n")),
        })
    return {"success": True, "year": resolved_year, "count": len(consultants), "consultants": consultants}


# ==================== SCHEDULED CACHE PRE-WARM ====================

# The default limit the frontend Industry Pulse page requests for the
# providers/consultants tables. Kept in sync with the endpoint Query defaults
# (limit=10) so the prewarm populates the EXACT keys a default page load reads.
_PREWARM_LIMIT = 10


def prewarm_industry_cache() -> Dict[str, Any]:
    """
    Populate the Industry Pulse caches so users never hit a cold ~10s load.

    Warms the three namespaces for the latest 2 available funding years using
    the SAME namespace/params/ttl the endpoints use (limit=10, the frontend's
    default). Because the params dicts are identical, the endpoints get straight
    cache hits. Safe to call repeatedly (get_or_cache is idempotent within TTL).
    """
    from utils.usac_cache import get_or_cache

    years = _available_years()
    if not years:
        years = [_resolve_year(None)]
    target_years = years[:2]

    warmed = 0
    for yr in target_years:
        get_or_cache(
            namespace="industry_pulse",
            params={"year": yr},
            ttl_hours=12,
            fetch_fn=lambda y=yr: _compute_pulse(y),
        )
        get_or_cache(
            namespace="industry_top_providers",
            params={"year": yr, "limit": _PREWARM_LIMIT},
            ttl_hours=24,
            fetch_fn=lambda y=yr: _compute_top_providers(y, _PREWARM_LIMIT),
        )
        get_or_cache(
            namespace="industry_top_consultants",
            params={"year": yr, "limit": _PREWARM_LIMIT},
            ttl_hours=24,
            fetch_fn=lambda y=yr: _compute_top_consultants(y, _PREWARM_LIMIT),
        )
        warmed += 3

    logger.info(
        "[industry_prewarm] warmed %d cache entries across years=%s (3 namespaces x limit=%d)",
        warmed, target_years, _PREWARM_LIMIT,
    )
    return {"success": True, "years": target_years, "entries": warmed}


# ==================== ENDPOINTS ====================

@router.get("/pulse")
async def industry_pulse(
    year: Optional[int] = Query(None, description="Funding year; defaults to the latest available"),
    current_user: User = Depends(get_current_user),
):
    """
    Current funding-year industry overview: total committed (Funded), FRN and
    applicant counts, funded/denied/pending breakdown with percentages,
    committed by service type, and the top 10 states by committed dollars.
    """
    resolved_year = _resolve_year(year)
    from utils.usac_cache import get_or_cache

    try:
        return get_or_cache(
            namespace="industry_pulse",
            params={"year": resolved_year},
            ttl_hours=12,
            fetch_fn=lambda: _compute_pulse(resolved_year),
        )
    except Exception as e:
        logger.exception("industry_pulse failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build industry pulse: {str(e)}",
        )


@router.get("/top-providers")
async def top_providers(
    year: Optional[int] = Query(None, description="Funding year; defaults to the latest available"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """
    Top service providers by committed dollars for the given funding year
    (group by spin_name, sum funding_commitment_request where Funded).
    """
    resolved_year = _resolve_year(year)
    from utils.usac_cache import get_or_cache

    try:
        return get_or_cache(
            namespace="industry_top_providers",
            params={"year": resolved_year, "limit": limit},
            ttl_hours=24,
            fetch_fn=lambda: _compute_top_providers(resolved_year, limit),
        )
    except Exception as e:
        logger.exception("top_providers failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top providers: {str(e)}",
        )


@router.get("/top-consultants")
async def top_consultants(
    year: Optional[int] = Query(None, description="Funding year; defaults to the latest available"),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """
    Top E-Rate consultants by committed dollars for the given funding year.
    The consultant identity lives inside the composite crn_data column
    ("{Name|CRN|email}") which is identical for all FRNs of a given consultant,
    so grouping by crn_data == grouping by consultant. We fetch the top-N
    aggregated groups in ONE call and parse the display name in Python.
    """
    resolved_year = _resolve_year(year)
    from utils.usac_cache import get_or_cache

    try:
        return get_or_cache(
            namespace="industry_top_consultants",
            params={"year": resolved_year, "limit": limit},
            ttl_hours=24,
            fetch_fn=lambda: _compute_top_consultants(resolved_year, limit),
        )
    except Exception as e:
        logger.exception("top_consultants failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch top consultants: {str(e)}",
        )
