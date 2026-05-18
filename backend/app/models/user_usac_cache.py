"""
Per-user USAC cache + sync job log models (perf_v2).

- UserUsacCache: one row per user holding the latest hydrated USAC payloads
  (schools, dashboard stats, CRNs) so portal pages can render cache-first
  without waiting on Sodapy / USAC Open Data on every request.
- UsacSyncJob: log of every hydration attempt; powers polling on
  GET /v1/sync-usac/{job_id} and the /admin/perf-summary observability view.

Both tables are CREATE-only (see Alembic revision e0f1a2b3c4d5) and the
runtime read/write paths are gated by the PERF_V2_ENABLED feature flag.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..core.database import Base


# --- Enums ------------------------------------------------------------------

USAC_CACHE_STATUSES = ("fresh", "stale", "syncing", "error")
USAC_SYNC_TRIGGERS = ("signup", "login", "manual", "nightly", "backfill")
USAC_SYNC_JOB_STATUSES = ("pending", "running", "succeeded", "failed")


# --- Models -----------------------------------------------------------------

class UserUsacCache(Base):
    """Per-user pre-hydrated USAC payloads."""

    __tablename__ = "user_usac_cache"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_usac_cache_user_id"),
        Index("ix_user_usac_cache_last_synced_at", "last_synced_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # JSON-serialized payloads (Text for MySQL compatibility, parsed at read).
    schools_json = Column(Text, nullable=True)
    dashboard_stats_json = Column(Text, nullable=True)
    crns_json = Column(Text, nullable=True)

    last_synced_at = Column(DateTime, nullable=True)
    status = Column(
        Enum(*USAC_CACHE_STATUSES, name="usac_cache_status"),
        nullable=False,
        default="stale",
        server_default="stale",
    )
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", backref="usac_cache", uselist=False)


class UsacSyncJob(Base):
    """Log of every USAC hydration attempt."""

    __tablename__ = "usac_sync_jobs"
    __table_args__ = (
        Index("ix_usac_sync_jobs_user_id", "user_id"),
        Index("ix_usac_sync_jobs_status", "status"),
        Index("ix_usac_sync_jobs_created_at", "created_at"),
    )

    job_id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    trigger = Column(
        Enum(*USAC_SYNC_TRIGGERS, name="usac_sync_trigger"),
        nullable=False,
    )
    status = Column(
        Enum(*USAC_SYNC_JOB_STATUSES, name="usac_sync_job_status"),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
