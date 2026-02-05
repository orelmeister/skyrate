from app.core.database import SessionLocal
from app.models.user import User
from app.models.consultant import ConsultantProfile
from app.models.vendor import VendorProfile

db = SessionLocal()

# Get all users with their profiles
users = db.query(User).all()
print("=" * 60)
print("USERS:")
print("=" * 60)
for u in users:
    print(f'  Email: {u.email}')
    print(f'  Role: {u.role}, ID: {u.id}, Active: {u.is_active}')
    print()
    
# Consultant profiles
consultants = db.query(ConsultantProfile).all()
print("=" * 60)
print("CONSULTANT PROFILES:")
print("=" * 60)
for c in consultants:
    print(f'  User ID: {c.user_id}')
    print(f'  CRN: {c.crn}')
    print(f'  Company: {c.company_name}')
    print()

# Vendor profiles  
vendors = db.query(VendorProfile).all()
print("=" * 60)
print("VENDOR PROFILES:")
print("=" * 60)
for v in vendors:
    print(f'  User ID: {v.user_id}')
    print(f'  SPIN: {v.spin}')
    print(f'  Company: {v.company_name}')
    print()

# Check for applicant-related tables
try:
    from sqlalchemy import text
    result = db.execute(text("SELECT * FROM applicant_bens LIMIT 5"))
    rows = result.fetchall()
    print("=" * 60)
    print("APPLICANT BENS:")
    print("=" * 60)
    for r in rows:
        print(f'  {r}')
except Exception as e:
    print(f"No applicant_bens table or error: {e}")

# Check consultant_schools
try:
    result = db.execute(text("SELECT ben, school_name, state FROM consultant_schools LIMIT 5"))
    rows = result.fetchall()
    print("=" * 60)
    print("CONSULTANT SCHOOLS (sample):")
    print("=" * 60)
    for r in rows:
        print(f'  BEN: {r[0]}, Name: {r[1]}, State: {r[2]}')
except Exception as e:
    print(f"Error with consultant_schools: {e}")

db.close()
