"""
USAC Cache Service
Simple database-backed cache for USAC API responses.
Avoids repeated expensive external API calls.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Any

from sqlalchemy.orm import Session

from app.models.usac_cache import USACCache

logger = logging.getLogger(__name__)

# Default TTL: 6 hours (USAC data doesn't change that frequently)
DEFAULT_TTL_HOURS = 6


def get_cached(db: Session, cache_key: str) -> Optional[dict]:
    """
    Get cached data by key. Returns None if not found or expired.
    Automatically deletes expired entries.
    """
    try:
        entry = db.query(USACCache).filter(USACCache.cache_key == cache_key).first()
        if not entry:
            return None
        
        if entry.is_expired():
            db.delete(entry)
            db.commit()
            logger.info(f"Cache expired for key {cache_key[:16]}...")
            return None
        
        logger.info(f"Cache HIT for key {cache_key[:16]}...")
        return json.loads(entry.cache_data)
    except Exception as e:
        logger.warning(f"Cache read error (non-fatal): {e}")
        return None


def set_cached(db: Session, cache_key: str, data: dict, ttl_hours: int = DEFAULT_TTL_HOURS):
    """
    Store data in cache with TTL.
    """
    try:
        serialized = json.dumps(data, default=str)
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        
        entry = db.query(USACCache).filter(USACCache.cache_key == cache_key).first()
        if entry:
            entry.cache_data = serialized
            entry.expires_at = expires_at
            entry.created_at = datetime.utcnow()
        else:
            entry = USACCache(
                cache_key=cache_key,
                cache_data=serialized,
                expires_at=expires_at
            )
            db.add(entry)
        
        db.commit()
        logger.info(f"Cache SET for key {cache_key[:16]}... (expires in {ttl_hours}h)")
    except Exception as e:
        logger.warning(f"Cache write error (non-fatal): {e}")
        try:
            db.rollback()
        except:
            pass


def make_frn_cache_key(bens: list, year: Optional[int], status_filter: Optional[str], pending_reason: Optional[str]) -> str:
    """Generate cache key for FRN batch query."""
    import hashlib
    sorted_bens = sorted(bens)
    raw = f"frn_batch:{','.join(sorted_bens)}:y={year}:s={status_filter}:p={pending_reason}"
    return hashlib.sha256(raw.encode()).hexdigest()


def cleanup_expired(db: Session, max_delete: int = 100):
    """Delete expired cache entries (call periodically)."""
    try:
        expired = db.query(USACCache).filter(
            USACCache.expires_at < datetime.utcnow()
        ).limit(max_delete).all()
        
        for entry in expired:
            db.delete(entry)
        
        if expired:
            db.commit()
            logger.info(f"Cache cleanup: deleted {len(expired)} expired entries")
    except Exception as e:
        logger.warning(f"Cache cleanup error: {e}")
