"""Fix password hash for test user"""
import bcrypt
import sqlite3

# Generate password hash
password = b'password123'
salt = bcrypt.gensalt()
hashed = bcrypt.hashpw(password, salt)

print(f"Generated hash: {hashed}")
print(f"Hash type: {type(hashed)}")

# Verify it works before saving
verify = bcrypt.checkpw(password, hashed)
print(f"Verification before save: {verify}")

# Save to database
conn = sqlite3.connect('skyrate.db')
cur = conn.cursor()

# Store as string
hash_str = hashed.decode('utf-8')
print(f"Hash string: {hash_str}")

cur.execute('UPDATE users SET password_hash = ? WHERE email = ?', 
            (hash_str, 'test_consultant@example.com'))
conn.commit()

# Read back and verify
cur.execute('SELECT password_hash FROM users WHERE email = ?', 
            ('test_consultant@example.com',))
stored_hash = cur.fetchone()[0]
print(f"Stored hash: {stored_hash}")
print(f"Stored hash type: {type(stored_hash)}")

# Verify the stored hash works
stored_hash_bytes = stored_hash.encode('utf-8')
verify_stored = bcrypt.checkpw(password, stored_hash_bytes)
print(f"Verification after retrieval: {verify_stored}")

conn.close()
print("\nPassword reset complete! Login with:")
print("Email: test_consultant@example.com")
print("Password: password123")
