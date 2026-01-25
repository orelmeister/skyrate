"""
Migration script to add status fields to consultant_schools table
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'skyrate.db')
print(f"Database path: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check existing columns
cursor.execute('PRAGMA table_info(consultant_schools)')
existing_columns = [row[1] for row in cursor.fetchall()]
print(f"Existing columns: {existing_columns}")

# Add new columns if they don't exist
new_columns = [
    ('status', 'VARCHAR(50)'),
    ('status_color', 'VARCHAR(20)'),
    ('latest_year', 'INTEGER'),
    ('applications_count', 'INTEGER DEFAULT 0'),
]

for col_name, col_type in new_columns:
    if col_name not in existing_columns:
        try:
            cursor.execute(f'ALTER TABLE consultant_schools ADD COLUMN {col_name} {col_type}')
            print(f"✅ Added column: {col_name}")
        except Exception as e:
            print(f"❌ Error adding {col_name}: {e}")
    else:
        print(f"✓ Column already exists: {col_name}")

conn.commit()
conn.close()

print("\n✅ Migration complete!")
