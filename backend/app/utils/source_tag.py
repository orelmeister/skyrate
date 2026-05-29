"""Structured perf telemetry — per-request source tagging.

Endpoints call ``tag_source(request, "snapshot_hit")`` before returning.
The PerfTimingMiddleware reads ``request.state.data_source`` to emit structured logs.
"""

from starlette.requests import Request


def tag_source(request: Request, source: str, *, rows: int = 0, partial: bool = False, user_id: int | None = None) -> None:
    """Stamp the current request with a data-source label for structured perf logging.

    Args:
        request: The Starlette/FastAPI request object.
        source: One of "snapshot_hit", "snapshot_miss", "usac_live", "cache_hit", etc.
        rows: Number of rows in the response payload (optional).
        partial: True if the response is paginated/incomplete.
        user_id: Authenticated user ID (optional).
    """
    request.state.data_source = source
    if rows:
        request.state.data_rows = rows
    if partial:
        request.state.data_partial = partial
    if user_id is not None:
        request.state.user_id = user_id
