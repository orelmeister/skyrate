"""Check current applicant profile and trigger manual sync if needed"""
from app.core.database import SessionLocal
from app.models.applicant import ApplicantProfile, ApplicantFRN
from app.api.v1.applicant import sync_applicant_data

db = SessionLocal()
p = db.query(ApplicantProfile).first()

if p:
    print(f"Profile ID: {p.id}")
    print(f"BEN: {p.ben}")
    print(f"Organization: {p.organization_name}")
    print(f"Sync Status: {p.sync_status}")
    print(f"City: {p.city}, State: {p.state}")
    
    frns = db.query(ApplicantFRN).filter(ApplicantFRN.applicant_profile_id==p.id).all()
    print(f"FRNs in DB: {len(frns)}")
    
    for f in frns[:10]:
        print(f"  - FRN {f.frn} (Y{f.funding_year}): {f.status} - ${f.amount_funded or 0:,.2f}")
    
    # If no FRNs or old BEN, trigger sync
    if len(frns) == 0 or p.ben == "123456789":
        print("\n--- Triggering manual sync ---")
        sync_applicant_data(p.id)
        
        # Refresh and check again
        db.refresh(p)
        frns = db.query(ApplicantFRN).filter(ApplicantFRN.applicant_profile_id==p.id).all()
        print(f"\nAfter sync:")
        print(f"Organization: {p.organization_name}")
        print(f"FRNs: {len(frns)}")
        for f in frns[:10]:
            print(f"  - FRN {f.frn} (Y{f.funding_year}): {f.status}")
else:
    print("No profile found")

db.close()
