"""
Manual sync script to update profile with BEN 16056315 and fetch USAC data
"""
import os
import sys

# Add the parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.applicant import ApplicantProfile, ApplicantFRN
from app.api.v1.applicant import sync_applicant_data

def main():
    db = SessionLocal()
    
    try:
        # Get the applicant profile
        profile = db.query(ApplicantProfile).first()
        
        if not profile:
            print("No applicant profile found!")
            return
        
        print(f"Current profile state:")
        print(f"  ID: {profile.id}")
        print(f"  BEN: {profile.ben}")
        print(f"  Organization: {profile.organization_name}")
        print(f"  Sync Status: {profile.sync_status}")
        print(f"  City: {profile.city}, State: {profile.state}")
        
        # Count FRNs
        frn_count = db.query(ApplicantFRN).filter(
            ApplicantFRN.applicant_profile_id == profile.id
        ).count()
        print(f"  FRNs in DB: {frn_count}")
        
        # Update BEN if needed and trigger sync
        if profile.ben != "16056315" or profile.organization_name is None:
            print(f"\n--- Updating BEN to 16056315 and triggering sync ---")
            profile.ben = "16056315"
            profile.sync_status = "pending"
            profile.organization_name = None  # Will be auto-populated
            db.commit()
        
        # Trigger sync
        print(f"\n--- Starting USAC data sync for BEN 16056315 ---")
        sync_applicant_data(profile.id)
        
        # Refresh and display results
        db.refresh(profile)
        
        frns = db.query(ApplicantFRN).filter(
            ApplicantFRN.applicant_profile_id == profile.id
        ).order_by(ApplicantFRN.funding_year.desc()).all()
        
        print(f"\n=== SYNC COMPLETED ===")
        print(f"Organization: {profile.organization_name}")
        print(f"City: {profile.city}, State: {profile.state}")
        print(f"Discount Rate: {profile.discount_rate}%")
        print(f"Entity Type: {profile.entity_type}")
        print(f"Sync Status: {profile.sync_status}")
        print(f"Total Applications: {profile.total_applications}")
        print(f"Total Funded: ${profile.total_funded or 0:,.2f}")
        print(f"Total Pending: ${profile.total_pending or 0:,.2f}")
        print(f"Total Denied: ${profile.total_denied or 0:,.2f}")
        print(f"\nFRNs ({len(frns)} total):")
        
        for frn in frns[:20]:
            funded = f"${frn.amount_funded:,.2f}" if frn.amount_funded else "N/A"
            print(f"  - FRN {frn.frn} (Y{frn.funding_year}): {frn.status} - {funded}")
            if frn.service_type:
                print(f"      Service: {frn.service_type}")
                
    except Exception as e:
        import traceback
        print(f"Error: {e}")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
