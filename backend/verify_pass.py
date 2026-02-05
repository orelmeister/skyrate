import bcrypt
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()

# Check vendor user
user = db.query(User).filter(User.email == 'test_vendor@example.com').first()
if user:
    print(f'User: {user.email}')
    print(f'Password hash: {user.password_hash}')
    
    # Test multiple passwords
    passwords = ['Test123!', 'TestPass123!', 'password123', 'Password123!']
    for pwd in passwords:
        try:
            result = bcrypt.checkpw(pwd.encode('utf-8'), user.password_hash.encode('utf-8'))
            print(f'  {pwd}: {result}')
        except Exception as e:
            print(f'  {pwd}: Error - {e}')
else:
    print('User not found')

db.close()
