import bcrypt
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()

# Check if test user exists
user = db.query(User).filter(User.email == 'test_consultant@example.com').first()
if user:
    print(f'User exists: {user.email}')
    print(f'Password hash: {user.password_hash[:30]}...')
    # Try to verify with simple password
    test_pass = 'password123'
    try:
        result = bcrypt.checkpw(test_pass.encode('utf-8'), user.password_hash.encode('utf-8'))
        print(f'Password verify result for "password123": {result}')
    except Exception as e:
        print(f'Error verifying: {e}')
        # Create new password hash
        new_hash = bcrypt.hashpw(test_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.password_hash = new_hash
        db.commit()
        print(f'Updated password hash')
else:
    print('User not found - creating test user')
    new_hash = bcrypt.hashpw(b'password123', bcrypt.gensalt()).decode('utf-8')
    from app.models.consultant import ConsultantProfile
    new_user = User(
        email='test_consultant@example.com',
        password_hash=new_hash,
        role='consultant',
        first_name='Test',
        last_name='Consultant',
        is_active=True,
        is_verified=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    # Create consultant profile
    profile = ConsultantProfile(
        user_id=new_user.id,
        crn='TEST-CRN-123',
        company_name='Test Consulting'
    )
    db.add(profile)
    db.commit()
    print(f'Created user: {new_user.email}')

db.close()
