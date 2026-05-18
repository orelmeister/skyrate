"""perf_v2 — per-request ContextVar for cache-hit signalling.

The PerfTimingMiddleware reads ``get_cache_hit()`` after the response is
produced. Endpoint code calls ``set_cache_hit(True)`` when it serves a
response from user_usac_cache without touching USAC's remote API.
"""

from contextvars import ContextVar

_cache_hit: ContextVar[bool] = ContextVar("perf_v2_cache_hit", default=False)


def set_cache_hit(value: bool) -> None:
    _cache_hit.set(bool(value))


def get_cache_hit() -> bool:
    try:
        return _cache_hit.get()
    except LookupError:
        return False


def reset_cache_hit() -> None:
    try:
        _cache_hit.set(False)
    except Exception:
        pass
