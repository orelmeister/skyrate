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
import urllib.parse
from datetime import datetime
from typing import Any, Dict, List, Optional

from curl_cffi import requests as cffi_requests
from fastapi import APIRouter, Query, Response, status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fcc", tags=["FCC Broadband"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_FCC_BASE = "https://broadbandmap.fcc.gov/nbm/map/api"
_FILING_URL = f"{_FCC_BASE}/published/filing"
# Tile path template: /fixed/detail/hex/tile/{filingUuid}/{z}/{x}/{y}
_TILE_TMPL = _FCC_BASE + "/fixed/detail/hex/tile/{uuid}/{z}/{x}/{y}"

# --- Provider-level (single named provider) endpoints ----------------------
# Unlike the aggregate ``fixeddetailhex`` layer above, these return one specific
# provider's fiber footprint so a rep can see, e.g., exactly where "Everstream"
# reports fiber. Discovered by reverse-engineering the FCC "Provider Detail" map.
#   provider/list/{uuid}/{query}/{page}            -> provider search
#   provider/fixed/extent/{uuid}/{pid}/{tech}/{br}/0/0    -> bbox for zoom-to
#   fixed/provider/hex/tile/{uuid}/{pid}/{tech}/{br}/0/0/{z}/{x}/{y} -> MVT tile
# The MVT layer inside a provider tile is named ``fixedproviderhex`` and carries
# h3index, location_count, unit_count, total_locations, total_units, unit_pct.
# ``br`` selects the customer class: r=residential, b=business, rb=both. Fiber is
# technology code 50.
_PROVIDER_LIST_TMPL = _FCC_BASE + "/provider/list/{uuid}/{query}/{page}"
_PROVIDER_EXTENT_TMPL = _FCC_BASE + "/provider/fixed/extent/{uuid}/{pid}/{tech}/{br}/0/0"
_PROVIDER_TILE_TMPL = (
    _FCC_BASE + "/fixed/provider/hex/tile/{uuid}/{pid}/{tech}/{br}/0/0/{z}/{x}/{y}"
)
_FIBER_TECH_CODE = "50"  # Fiber to the Premises
_PROVIDER_LAYER = "fixedproviderhex"
# Provider tiles render from the national view down; allow a slightly lower floor
# than the aggregate layer so a selected provider is visible while zoomed out.
_PROVIDER_MIN_ZOOM = 4
_PROVIDER_MAX_ZOOM = 15
_ALLOWED_BR = {"r", "b", "rb"}

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
        "provider_layer": _PROVIDER_LAYER,
        "provider_min_zoom": _PROVIDER_MIN_ZOOM,
        "provider_max_zoom": _PROVIDER_MAX_ZOOM,
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


# ---------------------------------------------------------------------------
# Provider-level endpoints (single named provider footprint)
# ---------------------------------------------------------------------------


@router.get("/providers")
def provider_search(
    q: str = Query(..., min_length=2, max_length=80, description="Provider name query"),
) -> Dict[str, Any]:
    """Search FCC-registered fixed-broadband providers by (brand) name.

    Returns provider records de-duplicated by ``provider_id`` so the frontend can
    offer a "which provider's fiber do you want to see?" picker. Names come back as
    the FCC brand strings, e.g. ``Midwest Fiber Holdings LP (Everstream)``.
    """
    filing = _refresh_filing()
    if not filing:
        return {"success": False, "providers": []}

    url = _PROVIDER_LIST_TMPL.format(
        uuid=filing["uuid"], query=urllib.parse.quote(q.strip(), safe=""), page=1
    )
    try:
        resp = cffi_requests.get(
            url, headers=_BROWSER_HEADERS, impersonate=_IMPERSONATE, timeout=15
        )
        resp.raise_for_status()
        rows = resp.json().get("data", []) or []
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[fcc] provider search '{q}' failed: {exc}")
        return {"success": False, "providers": []}

    seen: set[str] = set()
    providers: List[Dict[str, Any]] = []
    for row in rows:
        pid = str(row.get("provider_id") or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        providers.append(
            {
                "provider_id": pid,
                "name": row.get("provider_name") or row.get("holding_company") or pid,
                "holding_company": row.get("holding_company"),
            }
        )
    return {"success": True, "providers": providers}


@router.get("/provider-extent/{provider_id}")
def provider_extent(provider_id: str) -> Dict[str, Any]:
    """Return the geographic extent of a provider's fiber footprint (for zoom-to).

    Tries customer classes in turn (both -> business -> residential) and returns the
    first non-empty bounding box, so the frontend can fit the map to whichever class
    the provider actually reports. Bounds are returned in Leaflet order:
    ``[[south, west], [north, east]]``.
    """
    if not provider_id.isdigit():
        return {"success": False, "bounds": None}

    filing = _refresh_filing()
    if not filing:
        return {"success": False, "bounds": None}

    for br in ("rb", "b", "r"):
        url = _PROVIDER_EXTENT_TMPL.format(
            uuid=filing["uuid"], pid=provider_id, tech=_FIBER_TECH_CODE, br=br
        )
        try:
            resp = cffi_requests.get(
                url, headers=_BROWSER_HEADERS, impersonate=_IMPERSONATE, timeout=15
            )
            resp.raise_for_status()
            data = (resp.json().get("data") or [{}])[0]
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"[fcc] provider extent {provider_id}/{br} failed: {exc}")
            continue

        bounds = data.get("bounds") or []
        center = data.get("center") or []
        # FCC bounds arrive as [minLon, minLat, maxLon, maxLat].
        if len(bounds) == 4:
            min_lon, min_lat, max_lon, max_lat = bounds
            return {
                "success": True,
                "br": br,
                "center": ([center[1], center[0]] if len(center) == 2 else None),
                "bounds": [[min_lat, min_lon], [max_lat, max_lon]],
            }

    return {"success": True, "br": None, "center": None, "bounds": None}


@router.get("/provider-tile/{provider_id}/{br}/{z}/{x}/{y}.pbf")
def provider_tile(provider_id: str, br: str, z: int, x: int, y: int) -> Response:
    """Proxy a single provider's fiber hex MVT tile (layer ``fixedproviderhex``).

    Same resilience contract as :func:`fiber_tile` — any out-of-range zoom, invalid
    argument, or upstream hiccup yields a 204 so the map keeps working.
    """
    if br not in _ALLOWED_BR or not provider_id.isdigit():
        return _empty_tile()
    if z < _PROVIDER_MIN_ZOOM or z > _PROVIDER_MAX_ZOOM:
        return _empty_tile()

    filing = _refresh_filing()
    if not filing:
        return _empty_tile()

    url = _PROVIDER_TILE_TMPL.format(
        uuid=filing["uuid"], pid=provider_id, tech=_FIBER_TECH_CODE, br=br, z=z, x=x, y=y
    )
    try:
        resp = cffi_requests.get(
            url, headers=_BROWSER_HEADERS, impersonate=_IMPERSONATE, timeout=_TILE_TIMEOUT
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug(f"[fcc] provider tile {provider_id}/{br} {z}/{x}/{y} error: {exc}")
        return _empty_tile()

    if resp.status_code == 204 or not resp.content:
        return _empty_tile()
    if resp.status_code != 200:
        logger.debug(
            f"[fcc] provider tile {provider_id}/{br} {z}/{x}/{y} status {resp.status_code}"
        )
        return _empty_tile()

    return Response(
        content=resp.content,
        media_type="application/x-protobuf",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-FCC-Filing": str(filing.get("subtype") or ""),
        },
    )
