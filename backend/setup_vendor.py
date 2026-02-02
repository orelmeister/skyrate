import bcrypt
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.user import User
from app.models.vendor import VendorProfile

db = SessionLocal()

# Check all users
users = db.query(User).all()
print(f"Found {len(users)} users:")
for u in users:
    print(f"  - {u.email} (role: {u.role})")

# Find or create vendor
vendor = db.query(User).filter(User.email == 'test_vendor@example.com').first()
if not vendor:
    print("\nCreating vendor user...")
    new_hash = bcrypt.hashpw(b'TestPass123!', bcrypt.gensalt()).decode()
    vendor = User(
        email='test_vendor@example.com',
        password_hash=new_hash,
        role='vendor',
        first_name='Vendor',
        last_name='User',
        is_active=True,
        is_verified=True
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    
    # Create vendor profile
    profile = VendorProfile(
        user_id=vendor.id,
        company_name='IKON Business Group, Inc',
        spin='143032945'
    )
    db.add(profile)
    db.commit()
    print(f"Created vendor: {vendor.email}")
else:
    print(f"\nResetting password for: {vendor.email}")
    new_hash = bcrypt.hashpw(b'TestPass123!', bcrypt.gensalt()).decode()
    vendor.password_hash = new_hash
    db.commit()
    print("Password reset to: TestPass123!")

db.close()
print("\nDone!")
