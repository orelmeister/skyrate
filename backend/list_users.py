from app.core.database import SessionLocal
from app.models.user import User
import bcrypt

db = SessionLocal()
users = db.query(User).all()
print(f"Found {len(users)} users:")
for u in users:
    print(f"  - {u.email} (role: {u.role})")

# Create or reset vendor user
vendor = db.query(User).filter(User.email == 'test_vendor@example.com').first()
if not vendor:
    print("\nCreating vendor user...")
    from app.models.vendor import VendorProfile
    new_hash = bcrypt.hashpw('password123'.encode(), bcrypt.gensalt()).decode()
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
        company_name='Test Vendor Company',
        spin='143032945'
    )
    db.add(profile)
    db.commit()
    print(f"Created vendor: {vendor.email}")
else:
    print(f"\nResetting password for: {vendor.email}")
    new_hash = bcrypt.hashpw('password123'.encode(), bcrypt.gensalt()).decode()
    vendor.password_hash = new_hash
    db.commit()
    print("Password reset to: password123")

db.close()
