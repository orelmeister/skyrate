#!/usr/bin/env python
"""Debug script to check USAC API field names"""
import sys
sys.path.insert(0, '.')

from app.services.usac_service import USACService

def main():
    usac = USACService()
    
    # Fetch a few apps for one BEN
    print("Fetching apps for BEN 17012285...")
    apps = usac.fetch_form_471(filters={'ben': '17012285'}, limit=3)
    
    print(f"Found {len(apps)} applications")
    
    if apps:
        print("\n=== Sample App Keys ===")
        print(list(apps[0].keys()))
        
        print("\n=== First App Details ===")
        app = apps[0]
        
        # Check service type fields
        print("\nService Type Fields:")
        for key in ['form_471_service_type_name', 'frn_service_type', 'service_type', 
                    'category_of_service', 'form_471_category']:
            val = app.get(key)
            if val:
                print(f"  {key}: {val}")
        
        # Check committed amount fields
        print("\nCommitted Amount Fields:")
        for key in ['original_funding_commitment_request', 'original_committed_amount', 
                    'committed_amount', 'funding_commitment_request', 'total_authorized_disbursement']:
            val = app.get(key)
            if val:
                print(f"  {key}: {val}")
        
        # Check status
        print(f"\nStatus: {app.get('application_status')}")
        print(f"Funding Year: {app.get('funding_year')}")

if __name__ == "__main__":
    main()
