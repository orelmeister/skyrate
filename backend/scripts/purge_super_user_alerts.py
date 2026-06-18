"""
Purge all historical alerts for user_id=5 (super@skyrate.ai).
This cleans their alert slate as part of the FRN Alert Pipeline upgrade.

Run from skyrate.ai/backend/:
    python -m scripts.purge_super_user_alerts
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.alert import Alert


def main():
    print("[INFO] Purging all historical alerts for user_id=5 (super@skyrate.ai)...")
    db = SessionLocal()
    try:
        count = db.query(Alert).filter(Alert.user_id == 5).count()
        print(f"[INFO] Found {count} alerts for user_id=5")

        if count == 0:
            print("[INFO] Nothing to purge. Done.")
            return

        deleted = db.query(Alert).filter(Alert.user_id == 5).delete(synchronize_session=False)
        db.commit()
        print(f"[OK] Deleted {deleted} alerts for user_id=5")
    except Exception as e:
        print(f"[ERROR] Failed to purge alerts: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
