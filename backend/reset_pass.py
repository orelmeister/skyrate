import bcrypt
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()

# Find user and reset password
user = db.query(User).filter(User.email == 'test_consultant@example.com').first()
if user:
    new_pass = 'password123'
    new_hash = bcrypt.hashpw(new_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.password_hash = new_hash
    db.commit()
    print(f'Reset password for {user.email} to "{new_pass}"')
    
    # Verify it works
    result = bcrypt.checkpw(new_pass.encode('utf-8'), new_hash.encode('utf-8'))
    print(f'Verification test: {result}')
else:
    print('User not found')

db.close()
