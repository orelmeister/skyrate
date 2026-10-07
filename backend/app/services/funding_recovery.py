"""Approved-vs-received funding recovery rollup (demo differentiator).

Compares what USAC COMMITTED against what was actually DISBURSED for every
school in a consultant's book, straight from USAC Open Data (srbr-2d59).
The Challenge Prep case: $8K approved on paper, never collected - districts
leave committed money undisbursed because nobody reconciles the two numbers.

Read-only against public USAC data. No local tables, no migrations.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

USAC_FRN_URL = "https://opendata.usac.org/resource/srbr-2d59.json"

_REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SkyRateAI/1.0; +https://skyrate.ai)",
    "Accept": "application/json",
}

# FY2025 services are typically still being invoiced; only flag "stale"
# undisbursed commitments for funding years at or below this.
STALE_MAX_FY = 2024

_SELECT = ",".join([
    "ben",
    "funding_request_number",
    "funding_year",
    "form_471_frn_status_name",
    "funding_commitment_request",
    "total_authorized_disbursement",
])


def _f(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def fetch_funding_rows(
    bens: List[str],
    years: List[int],
    chunk_size: int = 50,
    row_limit_per_chunk: int = 25000,
) -> List[Dict[str, Any]]:
    """Chunked SoQL IN queries: all non-denied FRN rows for these BENs/years."""
    seen = set()
    clean: List[str] = []
    for ben in bens:
        cb = (str(ben) if ben is not None else "").strip()
        if cb and cb not in seen:
            seen.add(cb)
            clean.append(cb)

    yrs = " OR ".join("funding_year='{}'".format(y) for y in years)
    rows: List[Dict[str, Any]] = []
    for i in range(0, len(clean), chunk_size):
        chunk = clean[i:i + chunk_size]
        in_list = ",".join("'{}'".format(b.replace("'", "")) for b in chunk)
        where = (
            "ben in({bens}) AND ({yrs}) AND "
            "form_471_frn_status_name not in('Denied','Cancelled')"
        ).format(bens=in_list, yrs=yrs)
        try:
            resp = requests.get(
                USAC_FRN_URL,
                params={"$where": where, "$select": _SELECT, "$limit": row_limit_per_chunk},
                headers=_REQUEST_HEADERS,
                timeout=60,
            )
            resp.raise_for_status()
            rows.extend(resp.json())
        except (requests.RequestException, ValueError) as exc:
            logger.warning("funding-recovery chunk failed (%d BENs): %s", len(chunk), exc)
            continue
    return rows


def build_recovery_rollup(
    schools: List[Dict[str, Optional[str]]],
    years: List[int],
) -> Dict[str, Any]:
    """Per-school committed/disbursed/outstanding rollup + stale-FRN flags.

    schools: [{"ben": ..., "school_name": ...}, ...]
    """
    bens = [s["ben"] for s in schools if s.get("ben")]
    rows = fetch_funding_rows(bens, years)

    name_by_ben = {str(s["ben"]).strip(): s.get("school_name") for s in schools if s.get("ben")}
    per_ben: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        ben = (row.get("ben") or "").strip()
        if not ben:
            continue
        d = per_ben.setdefault(ben, {
            "ben": ben,
            "school_name": name_by_ben.get(ben),
            "n_frns": 0,
            "committed": 0.0,
            "disbursed": 0.0,
            "outstanding": 0.0,
            "stale_frns": [],  # committed > 0, $0 disbursed, FY <= STALE_MAX_FY
        })
        committed = _f(row.get("funding_commitment_request"))
        disbursed = _f(row.get("total_authorized_disbursement"))
        fy = int(_f(row.get("funding_year")) or 0)
        d["n_frns"] += 1
        d["committed"] += committed
        d["disbursed"] += disbursed
        if committed > 0 and disbursed <= 0 and fy and fy <= STALE_MAX_FY:
            d["stale_frns"].append({
                "frn": row.get("funding_request_number"),
                "funding_year": fy,
                "committed": committed,
                "status": row.get("form_471_frn_status_name"),
            })

    results: List[Dict[str, Any]] = []
    for d in per_ben.values():
        d["outstanding"] = max(0.0, d["committed"] - d["disbursed"])
        d["stale_amount"] = sum(f["committed"] for f in d["stale_frns"])
        d["pct_collected"] = (
            round(100.0 * d["disbursed"] / d["committed"], 1) if d["committed"] > 0 else None
        )
        d["stale_frns"].sort(key=lambda f: f["committed"], reverse=True)
        results.append(d)

    results.sort(key=lambda d: d["outstanding"], reverse=True)

    summary = {
        "schools_checked": len(bens),
        "schools_with_data": len(results),
        "total_committed": round(sum(d["committed"] for d in results), 2),
        "total_disbursed": round(sum(d["disbursed"] for d in results), 2),
        "total_outstanding": round(sum(d["outstanding"] for d in results), 2),
        "schools_with_stale": sum(1 for d in results if d["stale_frns"]),
        "total_stale_amount": round(sum(d["stale_amount"] for d in results), 2),
        "years": years,
        "stale_max_fy": STALE_MAX_FY,
    }
    return {"summary": summary, "schools": results}
