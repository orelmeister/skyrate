"""
USAC Data Cache Model
Caches USAC API responses to avoid repeated expensive external API calls.
Each cache entry has a TTL (default 24 hours).
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from sqlalchemy.sql import func
from datetime import datetime, timedelta

from ..core.database import Base


class USACCache(Base):
    __tablename__ = "usac_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(String(512), nullable=False, unique=True, index=True)
    cache_data = Column(Text, nullable=False)  # JSON serialized response
    created_at = Column(DateTime, default=func.now(), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    
    @staticmethod
    def make_key(endpoint: str, params: dict) -> str:
        """Generate a deterministic cache key from endpoint + params."""
        import hashlib
        import json
        # Sort params for consistent key generation
        sorted_params = json.dumps(params, sort_keys=True)
        raw = f"{endpoint}:{sorted_params}"
        return hashlib.sha256(raw.encode()).hexdigest()
    
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at
