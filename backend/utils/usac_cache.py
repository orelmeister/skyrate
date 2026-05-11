"""
USAC response cache (MySQL-backed).

Wraps slow USAC Open Data calls with a query-hash keyed cache. The
`usac_query_cache` table is created lazily on first use so this works on
both MySQL (production) and SQLite (local dev).

TTL guidance:
- search results (e.g. 470 leads): 6 hours
- FRN status: 1 hour
- historical commitments / 471 archives: 24 hours
"""
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional

from sqlalchemy import text

from app.core.database import SessionLocal, engine

logger = logging.getLogger(__name__)

_TABLE_READY = False


def _ensure_table() -> None:
    """Create usac_query_cache table if missing. Idempotent."""
    global _TABLE_READY
    if _TABLE_READY:
        return
    try:
        dialect = engine.dialect.name
        with engine.begin() as conn:
            if dialect == "mysql":
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS usac_query_cache (
                        query_hash CHAR(64) PRIMARY KEY,
                        response_json LONGTEXT NOT NULL,
                        cached_at DATETIME NOT NULL,
                        expires_at DATETIME NOT NULL,
                        INDEX ix_usac_cache_expires (expires_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """))
            else:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS usac_query_cache (
                        query_hash TEXT PRIMARY KEY,
                        response_json TEXT NOT NULL,
                        cached_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL
                    )
                """))
        _TABLE_READY = True
    except Exception as e:
        logger.warning(f"usac_query_cache init skipped: {e}")


def _hash_key(namespace: str, params: Dict[str, Any]) -> str:
    payload = json.dumps({"ns": namespace, "p": params}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_or_cache(
    namespace: str,
    params: Dict[str, Any],
    ttl_hours: float,
    fetch_fn: Callable[[], Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Return a cached USAC response if fresh, else fetch via `fetch_fn` and
    store. Only successful responses (success=True or no 'success' key) are
    cached.

    Args:
        namespace: short string identifying the call site (e.g. "470_leads")
        params: dict of request parameters; used as cache key
        ttl_hours: cache lifetime in hours
        fetch_fn: zero-arg callable returning the response dict
    """
    _ensure_table()
    key = _hash_key(namespace, params)
    now = datetime.utcnow()

    # Try cache
    try:
        with SessionLocal() as db:
            row = db.execute(
                text("SELECT response_json, expires_at FROM usac_query_cache WHERE query_hash = :k"),
                {"k": key},
            ).first()
            if row:
                expires_at = row[1] if isinstance(row[1], datetime) else datetime.fromisoformat(str(row[1]))
                if expires_at > now:
                    logger.info(f"[usac-cache] HIT ns={namespace} key={key[:10]} expires_in={(expires_at - now).total_seconds():.0f}s")
                    return json.loads(row[0])
                else:
                    logger.info(f"[usac-cache] EXPIRED ns={namespace} key={key[:10]}")
    except Exception as e:
        logger.warning(f"[usac-cache] read failed: {e}")

    # Cache miss -> fetch
    logger.info(f"[usac-cache] MISS ns={namespace} key={key[:10]} fetching...")
    result = fetch_fn()

    # Only cache successful responses
    if not isinstance(result, dict) or result.get("success") is False:
        return result

    try:
        expires = now + timedelta(hours=ttl_hours)
        payload = json.dumps(result, default=str)
        with engine.begin() as conn:
            if engine.dialect.name == "mysql":
                conn.execute(
                    text("""
                        INSERT INTO usac_query_cache (query_hash, response_json, cached_at, expires_at)
                        VALUES (:k, :v, :c, :e)
                        ON DUPLICATE KEY UPDATE response_json=VALUES(response_json),
                                                cached_at=VALUES(cached_at),
                                                expires_at=VALUES(expires_at)
                    """),
                    {"k": key, "v": payload, "c": now, "e": expires},
                )
            else:
                conn.execute(text("DELETE FROM usac_query_cache WHERE query_hash = :k"), {"k": key})
                conn.execute(
                    text("INSERT INTO usac_query_cache (query_hash, response_json, cached_at, expires_at) VALUES (:k, :v, :c, :e)"),
                    {"k": key, "v": payload, "c": now.isoformat(), "e": expires.isoformat()},
                )
        logger.info(f"[usac-cache] STORE ns={namespace} key={key[:10]} ttl={ttl_hours}h size={len(payload)}b")
    except Exception as e:
        logger.warning(f"[usac-cache] write failed: {e}")

    return result
