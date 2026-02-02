"""Reset demo accounts with consistent passwords"""
import bcrypt
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.user import User

DEMO_PASSWORD = b'TestPass123!'

def main():
    db = SessionLocal()
    
    demo_accounts = [
        ('test_consultant@example.com', 'consultant'),
        ('test_vendor@example.com', 'vendor'),
    ]
    
    for email, role in demo_accounts:
        user = db.query(User).filter(User.email == email).first()
        if user:
            new_hash = bcrypt.hashpw(DEMO_PASSWORD, bcrypt.gensalt()).decode()
            user.password_hash = new_hash
            db.commit()
            print(f"✓ Reset password for {email}")
        else:
            print(f"✗ User not found: {email}")
    
    db.close()
    print("\nDemo accounts ready:")
    print("  Consultant: test_consultant@example.com / TestPass123!")
    print("  Vendor:     test_vendor@example.com / TestPass123!")

if __name__ == '__main__':
    main()
