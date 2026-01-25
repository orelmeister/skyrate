"""
Migration script to add CRN and SPIN columns to consultant and vendor profiles
Run this script once to update the database schema.
"""
import sqlite3
import os

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), "skyrate.db")

def migrate():
    """Add CRN to consultant_profiles and SPIN to vendor_profiles tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if columns exist first
    cursor.execute("PRAGMA table_info(consultant_profiles)")
    consultant_columns = [col[1] for col in cursor.fetchall()]
    
    cursor.execute("PRAGMA table_info(vendor_profiles)")
    vendor_columns = [col[1] for col in cursor.fetchall()]
    
    migrations_run = []
    
    # Add CRN to consultant_profiles if not exists
    if "crn" not in consultant_columns:
        cursor.execute("ALTER TABLE consultant_profiles ADD COLUMN crn VARCHAR(50)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_consultant_profiles_crn ON consultant_profiles(crn)")
        migrations_run.append("Added 'crn' column to consultant_profiles")
        print("✓ Added CRN column to consultant_profiles")
    else:
        print("• CRN column already exists in consultant_profiles")
    
    # Add SPIN to vendor_profiles if not exists
    if "spin" not in vendor_columns:
        cursor.execute("ALTER TABLE vendor_profiles ADD COLUMN spin VARCHAR(50)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_vendor_profiles_spin ON vendor_profiles(spin)")
        migrations_run.append("Added 'spin' column to vendor_profiles")
        print("✓ Added SPIN column to vendor_profiles")
    else:
        print("• SPIN column already exists in vendor_profiles")
    
    conn.commit()
    conn.close()
    
    if migrations_run:
        print(f"\n✅ Migration complete! {len(migrations_run)} changes applied.")
    else:
        print("\n✅ No changes needed - database is up to date.")

if __name__ == "__main__":
    print("=" * 50)
    print("SkyRate AI v2 - Database Migration")
    print("Adding CRN/SPIN columns to profiles")
    print("=" * 50)
    
    if os.path.exists(DB_PATH):
        migrate()
    else:
        print(f"❌ Database not found at: {DB_PATH}")
        print("   The database will be created automatically when the server starts.")
