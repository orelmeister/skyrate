"""Check vendor user role"""
from app.core.database import SessionLocal
from app.models.user import User

db = SessionLocal()
user = db.query(User).filter(User.email == 'test_vendor@example.com').first()

if user:
    print(f'Email: {user.email}')
    print(f'Role: "{user.role}"')
    print(f'Role type: {type(user.role)}')
    print(f'Is active: {user.is_active}')
    print(f'Is verified: {user.is_verified}')
else:
    print('User not found')

db.close()
