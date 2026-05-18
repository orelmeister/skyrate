"""
perf_v2 observability — lightweight in-memory request timing ring buffer.

Stores at most _MAX_SAMPLES recent samples per (method, path) tuple. Exposes
helpers to compute p50/p95/p99 latencies and a cache-hit ratio. Reads through
GET /v1/admin/perf-summary (admin-only).

This is intentionally process-local. For production fleet-wide telemetry use
Datadog / Honeycomb / OpenTelemetry — this module is for the perf_v2
before/after audit harness only.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from statistics import median
from typing import Deque, Dict, List, Optional, Tuple

_MAX_SAMPLES = 500
_lock = threading.Lock()
_samples: Dict[Tuple[str, str], Deque[dict]] = defaultdict(
    lambda: deque(maxlen=_MAX_SAMPLES)
)


def record(method: str, path: str, duration_ms: float, status_code: int, cache_hit: bool) -> None:
    """Append one timing sample."""
    with _lock:
        _samples[(method, path)].append(
            {
                "ts": time.time(),
                "ms": duration_ms,
                "status": status_code,
                "cache_hit": cache_hit,
            }
        )


def _percentile(sorted_values: List[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = max(0, min(len(sorted_values) - 1, int(round(pct / 100.0 * (len(sorted_values) - 1)))))
    return sorted_values[k]


def summary(path_prefix: Optional[str] = None) -> dict:
    """Return aggregated stats across the buffer.

    Args:
        path_prefix: optional filter (e.g. "/v1/consultant") to scope the report.
    """
    out: dict = {"endpoints": [], "totals": None}
    with _lock:
        items = list(_samples.items())

    total_ms: List[float] = []
    total_hits = 0
    total_count = 0
    for (method, path), buf in items:
        if path_prefix and not path.startswith(path_prefix):
            continue
        ms_values = sorted([s["ms"] for s in buf])
        hits = sum(1 for s in buf if s.get("cache_hit"))
        count = len(buf)
        if count == 0:
            continue
        out["endpoints"].append(
            {
                "method": method,
                "path": path,
                "count": count,
                "p50_ms": round(median(ms_values), 1),
                "p95_ms": round(_percentile(ms_values, 95), 1),
                "p99_ms": round(_percentile(ms_values, 99), 1),
                "avg_ms": round(sum(ms_values) / count, 1),
                "cache_hit_ratio": round(hits / count, 3),
            }
        )
        total_ms.extend(ms_values)
        total_hits += hits
        total_count += count

    total_ms.sort()
    if total_count:
        out["totals"] = {
            "count": total_count,
            "p50_ms": round(median(total_ms), 1),
            "p95_ms": round(_percentile(total_ms, 95), 1),
            "p99_ms": round(_percentile(total_ms, 99), 1),
            "cache_hit_ratio": round(total_hits / total_count, 3),
        }
    # Sort endpoints by p95 descending so the slowest float to the top.
    out["endpoints"].sort(key=lambda e: e["p95_ms"], reverse=True)
    return out


def reset() -> None:
    with _lock:
        _samples.clear()
