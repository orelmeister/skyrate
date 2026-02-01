"""Create vendor test account"""
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.models.vendor import VendorProfile
from app.core.security import hash_password

db = SessionLocal()

# Check if vendor user exists
existing = db.query(User).filter(User.email == 'test_vendor@example.com').first()
if existing:
    print(f'Vendor user already exists with id: {existing.id}')
    user = existing
else:
    # Create new vendor user
    user = User(
        email='test_vendor@example.com',
        password_hash=hash_password('test123'),
        role=UserRole.VENDOR.value,
        first_name='Vendor',
        last_name='User',
        company_name='Test Vendor Company',
        is_active=True,
        is_verified=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f'Created vendor user with id: {user.id}')

# Check/create vendor profile
profile = db.query(VendorProfile).filter(VendorProfile.user_id == user.id).first()
if profile:
    print(f'Vendor profile exists, updating SPIN to 143032945')
    profile.spin = '143032945'
else:
    profile = VendorProfile(
        user_id=user.id,
        spin='143032945',
        company_name='Test Vendor Company',
        contact_name='Vendor User',
        services_offered=['Internet Access', 'Data Transmission'],
        service_areas=['NY', 'CA', 'TX']
    )
    db.add(profile)
    print('Created vendor profile with SPIN 143032945')

db.commit()

print()
print('=== Vendor Test Account Ready ===')
print('Email: test_vendor@example.com')
print('Password: test123')
print('SPIN: 143032945')
print('Role: vendor')

db.close()
