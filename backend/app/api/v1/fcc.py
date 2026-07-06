"""
FCC National Broadband Map proxy — fiber-coverage overlay tiles.

Why this exists
---------------
The FCC National Broadband Map (broadbandmap.fcc.gov) publishes fixed-broadband
availability as standard Mapbox Vector Tiles (MVT), keyed by a *filing UUID*
that rotates every data vintage. Those tiles power a "fiber coverage" overlay on
our Opportunity Map so reps can see sellable E-Rate prospects sitting on top of
real fiber footprint (the map4.net play), using free, public U.S.-government data.

We proxy the tiles server-side instead of fetching them from the browser because:
  1. The FCC endpoint is behind Akamai bot protection and sends no permissive
     CORS headers, so a direct cross-origin fetch from skyrate.ai is blocked.
  2. The filing UUID changes each vintage; caching it here means the frontend
     never has to know it.
  3. Akamai blocks ordinary programmatic clients (python-requests hangs), so we
     use curl_cffi with Chrome TLS impersonation to fetch like a real browser.

Endpoints (mounted under /v1, reachable as /api/v1/fcc/...):
  GET /fcc/status                       -> current filing metadata + reachability
  GET /fcc/fiber-tile/{z}/{x}/{y}.pbf   -> proxied MVT hex tile (application/x-protobuf)

The layer inside each tile is named ``fixeddetailhex``; the frontend styles it
with Leaflet.VectorGrid.

All data: FCC Broadband Data Collection (public domain, 47 U.S.C. — no copyright).
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, Optional

from curl_cffi import requests as cffi_requests
from fastapi import APIRouter, Response, status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fcc", tags=["FCC Broadband"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_FCC_BASE = "https://broadbandmap.fcc.gov/nbm/map/api"
_FILING_URL = f"{_FCC_BASE}/published/filing"
# Tile path template: /fixed/detail/hex/tile/{filingUuid}/{z}/{x}/{y}
_TILE_TMPL = _FCC_BASE + "/fixed/detail/hex/tile/{uuid}/{z}/{x}/{y}"

# The FCC map only renders hexes between these zooms; outside this range the
# upstream returns nothing useful, so we short-circuit with an empty tile.
_MIN_ZOOM = 5
_MAX_ZOOM = 15

# Browser TLS impersonation profile for curl_cffi — required to pass Akamai.
_IMPERSONATE = "chrome"
# Extra headers that further mimic the real map client (belt and suspenders).
_BROWSER_HEADERS = {
    "Accept": "application/x-protobuf,*/*",
    "Referer": "https://broadbandmap.fcc.gov/location-summary/fixed",
    "Origin": "https://broadbandmap.fcc.gov",
}

_FILING_TTL_SECONDS = 6 * 3600  # refresh the filing UUID at most every 6h
_TILE_TIMEOUT = 20  # seconds per upstream tile fetch

# ---------------------------------------------------------------------------
# Filing-UUID cache (which data vintage to request tiles for)
# ---------------------------------------------------------------------------

_filing_lock = threading.Lock()
_filing_cache: Dict[str, Any] = {"uuid": None, "subtype": None, "fetched_at": 0.0}


def _parse_subtype_date(subtype: str) -> datetime:
    """Parse an FCC filing_subtype like 'December 31, 2025' -> datetime."""
    try:
        return datetime.strptime(subtype.strip(), "%B %d, %Y")
    except Exception:
        return datetime.min


def _refresh_filing(force: bool = False) -> Optional[Dict[str, Any]]:
    """Return the newest published filing {uuid, subtype}, cached with a TTL."""
    now = time.time()
    with _filing_lock:
        fresh = (
            _filing_cache["uuid"]
            and (now - _filing_cache["fetched_at"]) < _FILING_TTL_SECONDS
        )
        if fresh and not force:
            return {"uuid": _filing_cache["uuid"], "subtype": _filing_cache["subtype"]}

    try:
        resp = cffi_requests.get(
            _FILING_URL, headers=_BROWSER_HEADERS, impersonate=_IMPERSONATE, timeout=15
        )
        resp.raise_for_status()
        rows = resp.json().get("data", []) or []
        if not rows:
            raise ValueError("no filings returned")
        newest = max(rows, key=lambda r: _parse_subtype_date(r.get("filing_subtype", "")))
        uuid = newest.get("process_uuid")
        subtype = newest.get("filing_subtype")
        if not uuid:
            raise ValueError("newest filing missing process_uuid")
        with _filing_lock:
            _filing_cache.update(uuid=uuid, subtype=subtype, fetched_at=now)
        logger.info(f"[fcc] active filing = {subtype} ({uuid})")
        return {"uuid": uuid, "subtype": subtype}
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[fcc] filing refresh failed: {exc}")
        # Fall back to a stale-but-usable cached value if we have one.
        with _filing_lock:
            if _filing_cache["uuid"]:
                return {"uuid": _filing_cache["uuid"], "subtype": _filing_cache["subtype"]}
        return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/status")
def fcc_status() -> Dict[str, Any]:
    """Report the active FCC data vintage and whether the upstream is reachable."""
    filing = _refresh_filing()
    return {
        "success": bool(filing),
        "filing": filing,
        "layer": "fixeddetailhex",
        "min_zoom": _MIN_ZOOM,
        "max_zoom": _MAX_ZOOM,
        "source": "FCC National Broadband Map (Broadband Data Collection)",
        "attribution": "Data: FCC National Broadband Map",
    }


def _empty_tile() -> Response:
    """204 tells Leaflet.VectorGrid there is simply nothing to draw for this tile."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/fiber-tile/{z}/{x}/{y}.pbf")
def fiber_tile(z: int, x: int, y: int) -> Response:
    """Proxy a single FCC fixed-broadband hex MVT tile.

    Returns the raw protobuf so Leaflet.VectorGrid can render it directly. On any
    upstream error or out-of-range zoom we return 204 (empty) so the base map and
    opportunity pins keep working even if the overlay is unavailable.
    """
    if z < _MIN_ZOOM or z > _MAX_ZOOM:
        return _empty_tile()

    filing = _refresh_filing()
    if not filing:
        return _empty_tile()

    url = _TILE_TMPL.format(uuid=filing["uuid"], z=z, x=x, y=y)
    try:
        resp = cffi_requests.get(
            url, headers=_BROWSER_HEADERS, impersonate=_IMPERSONATE, timeout=_TILE_TIMEOUT
        )
    except Exception as exc:  # noqa: BLE001 — curl_cffi raises its own error types
        logger.debug(f"[fcc] tile {z}/{x}/{y} fetch error: {exc}")
        return _empty_tile()

    if resp.status_code == 204 or not resp.content:
        return _empty_tile()
    if resp.status_code != 200:
        logger.debug(f"[fcc] tile {z}/{x}/{y} upstream status {resp.status_code}")
        return _empty_tile()

    return Response(
        content=resp.content,
        media_type="application/x-protobuf",
        headers={
            # Tiles are static per vintage — cache aggressively at the edge/browser.
            "Cache-Control": "public, max-age=86400",
            "X-FCC-Filing": str(filing.get("subtype") or ""),
        },
    )
