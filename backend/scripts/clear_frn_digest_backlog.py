"""
Clear FRN Digest Backlog (Phase 1)

Marks all unprocessed queue rows as processed and backfills
last_frn_digest_at on alert_configs so users don't get a replay
of historical changes when the digest is re-enabled.

Usage:
    python -m scripts.clear_frn_digest_backlog

Requires DATABASE_URL env var (same as the app).
"""
import os
import sys

# Allow running from backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[FAIL] DATABASE_URL env var is required")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

with engine.begin() as conn:
    # Count before
    row = conn.execute(text(
        "SELECT COUNT(*) AS cnt FROM frn_status_changes_queue WHERE processed=0"
    )).fetchone()
    pending_before = row[0]
    print(f"[INFO] Pending queue rows before: {pending_before}")

    row = conn.execute(text(
        "SELECT COUNT(*) AS cnt FROM alert_configs WHERE last_frn_digest_at IS NULL "
        "OR last_frn_digest_at < NOW() - INTERVAL 1 DAY"
    )).fetchone()
    stale_configs = row[0]
    print(f"[INFO] Alert configs needing cursor bump: {stale_configs}")

    # Mark all unprocessed as processed
    result = conn.execute(text(
        "UPDATE frn_status_changes_queue SET processed=1, processed_at=NOW() WHERE processed=0"
    ))
    print(f"[OK] Marked {result.rowcount} queue rows as processed")

    # Backfill last_frn_digest_at
    result = conn.execute(text(
        "UPDATE alert_configs SET last_frn_digest_at=NOW() "
        "WHERE last_frn_digest_at IS NULL OR last_frn_digest_at < NOW() - INTERVAL 1 DAY"
    ))
    print(f"[OK] Bumped last_frn_digest_at on {result.rowcount} alert_configs")

    # Count after
    row = conn.execute(text(
        "SELECT COUNT(*) AS cnt FROM frn_status_changes_queue WHERE processed=0"
    )).fetchone()
    print(f"[INFO] Pending queue rows after: {row[0]}")

print("[OK] Backlog clear complete.")
