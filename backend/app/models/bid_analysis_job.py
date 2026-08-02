"""
Async job log for AI bid analysis (WS-B / Q5 decision).

A Bid Analysis run makes a single, slow Gemini call (up to ~44s) over several
uploaded vendor bids. To avoid front-end request timeouts on large uploads the
work is dispatched to a FastAPI BackgroundTask: the POST endpoint parses/extracts
the files (fast), inserts a `pending` row, and returns a job_id immediately. The
background task runs `analyze_bids`, stores the JSON result on the row, and the
front-end polls `GET /v1/compliance/bid-analysis/jobs/{job_id}` until it reaches
`succeeded` or `failed`.

This is a brand-new, CREATE-only table (picked up by Base.metadata.create_all at
startup, same as usac_sync_jobs) — it never alters existing tables.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Enum,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from ..core.database import Base


BID_ANALYSIS_JOB_STATUSES = ("pending", "running", "succeeded", "failed")


class BidAnalysisJob(Base):
    """Log + result store for one async bid-analysis run."""

    __tablename__ = "bid_analysis_jobs"
    __table_args__ = (
        Index("ix_bid_analysis_jobs_user_id", "user_id"),
        Index("ix_bid_analysis_jobs_status", "status"),
        Index("ix_bid_analysis_jobs_created_at", "created_at"),
    )

    job_id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    status = Column(
        Enum(*BID_ANALYSIS_JOB_STATUSES, name="bid_analysis_job_status"),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    # Number of bid documents in the run (for progress display).
    bid_count = Column(Integer, nullable=True)

    # JSON-serialized BidAnalysisResponse payload (Text for MySQL compatibility).
    result_json = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    user = relationship("User")
