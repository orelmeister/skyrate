"""
Temporary one-off script to verify a user's email in production.
DO NOT COMMIT. Delete after use.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("[FAIL] No DATABASE_URL found in environment")
    sys.exit(1)

# Parse the SQLAlchemy URL to get pymysql connection params
from sqlalchemy.engine import make_url

parsed = make_url(DATABASE_URL)
db_user = parsed.username
db_pass = parsed.password
db_host = parsed.host
db_port = parsed.port or 3306
db_name = parsed.database

TARGET_EMAIL = "ken@ikonbusinessgroup.com"

import pymysql

try:
    conn = pymysql.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_pass,
        database=db_name,
        connect_timeout=15
    )
    print("[OK] Connected to production database")

    cursor = conn.cursor(pymysql.cursors.DictCursor)

    # Step 1: Check current user status
    cursor.execute(
        "SELECT id, email, first_name, last_name, role, is_active, is_verified, email_verified, email_verified_at, created_at FROM users WHERE email = %s",
        (TARGET_EMAIL,)
    )
    user = cursor.fetchone()

    if not user:
        print(f"[FAIL] No user found with email: {TARGET_EMAIL}")
        conn.close()
        sys.exit(1)

    print(f"\n--- BEFORE UPDATE ---")
    for k, v in user.items():
        print(f"  {k}: {v}")

    # Step 2: Update verification status
    cursor.execute(
        "UPDATE users SET is_verified = 1, email_verified = 1, email_verified_at = NOW() WHERE email = %s",
        (TARGET_EMAIL,)
    )
    conn.commit()
    print(f"\n[OK] Updated verification flags for {TARGET_EMAIL}")

    # Step 3: Verify the update
    cursor.execute(
        "SELECT id, email, is_verified, email_verified, email_verified_at FROM users WHERE email = %s",
        (TARGET_EMAIL,)
    )
    updated = cursor.fetchone()
    print(f"\n--- AFTER UPDATE ---")
    for k, v in updated.items():
        print(f"  {k}: {v}")

    if updated["is_verified"] and updated["email_verified"]:
        print(f"\n[OK] SUCCESS: {TARGET_EMAIL} is now verified!")
    else:
        print(f"\n[FAIL] Verification flags did not update correctly")

    cursor.close()
    conn.close()

except pymysql.err.OperationalError as e:
    print(f"[FAIL] Database connection error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"[FAIL] Error: {e}")
    sys.exit(1)
