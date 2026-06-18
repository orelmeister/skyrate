"""
Clear all unprocessed queue entries for user_id=5 (super@skyrate.ai).
This prevents old historical/duplicate backlog from triggering alerts again.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.frn_status_change import FrnStatusChangeQueue


def main():
    print("[INFO] Clearing queue backlog for user_id=5...")
    db = SessionLocal()
    try:
        count = db.query(FrnStatusChangeQueue).filter(
            FrnStatusChangeQueue.user_id == 5,
            FrnStatusChangeQueue.processed == 0
        ).count()
        print(f"[INFO] Found {count} unprocessed entries in queue for user 5")

        if count == 0:
            print("[INFO] No backlog. Done.")
            return

        updated = db.query(FrnStatusChangeQueue).filter(
            FrnStatusChangeQueue.user_id == 5,
            FrnStatusChangeQueue.processed == 0
        ).update({"processed": 1, "processed_at": db.query(sqlalchemy.func.now()).scalar_subquery() if 'sqlalchemy' in globals() else None}, synchronize_session=False)
        
        # Or simpler:
        db.execute(sqlalchemy.text("UPDATE frn_status_changes_queue SET processed=1, processed_at=NOW() WHERE user_id=5 AND processed=0"))
        db.commit()
        print("[OK] Successfully marked all queue entries as processed")
    except Exception as e:
        # Let's try simple text UPDATE
        try:
            from sqlalchemy import text
            db.execute(text("UPDATE frn_status_changes_queue SET processed=1, processed_at=NOW() WHERE user_id=5 AND processed=0"))
            db.commit()
            print("[OK] Text-fallback successfully marked all queue entries as processed")
        except Exception as e2:
            print(f"[ERROR] Failed to clear queue backlog: {e2}")
            db.rollback()
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
