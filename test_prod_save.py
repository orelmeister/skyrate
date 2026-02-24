"""Test save + enrich against production."""
import requests

BASE = "https://skyrate.ai/api/v1"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email":"test_vendor@example.com","password":"TestPass123!"})
print("Login:", r.status_code)
token = r.json().get("access_token","")
headers = {"Authorization": f"Bearer {token}"}

# Get a lead
r = requests.get(f"{BASE}/vendor/predicted-leads?limit=3", headers=headers)
leads = r.json().get("leads",[])
print(f"Got {len(leads)} leads")

if leads:
    lead = leads[0]
    lid = lead["id"]
    print(f"\nTest lead: id={lid}, org={lead.get('organization_name')}, ben={lead.get('ben')}")
    
    # Test SAVE
    print("\n--- SAVE ---")
    r = requests.post(f"{BASE}/vendor/predicted-leads/{lid}/save", headers=headers, timeout=30)
    print(f"Status: {r.status_code}")
    try:
        data = r.json()
        print(f"Success: {data.get('success')}")
        if data.get("lead"):
            print(f"Lead ID: {data['lead'].get('id')}")
        if data.get("error"):
            print(f"Error: {data['error']}")
        if data.get("detail"):
            print(f"Detail: {str(data['detail'])[:200]}")
    except:
        print(f"Raw: {r.text[:300]}")
    
    # Test ENRICH on 2nd lead if available
    if len(leads) > 1:
        lead2 = leads[1]
        eid = lead2["id"]
        print(f"\n--- ENRICH ---")
        print(f"Lead: id={eid}, org={lead2.get('organization_name')}, email={lead2.get('contact_email')}")
        r = requests.post(f"{BASE}/vendor/predicted-leads/{eid}/enrich", headers=headers, timeout=60)
        print(f"Status: {r.status_code}")
        try:
            data = r.json()
            print(f"Success: {data.get('success')}")
            if data.get("enrichment"):
                e = data["enrichment"]
                print(f"Person: {e.get('person')}")
                print(f"Company: {e.get('company')}")
                print(f"Additional contacts: {len(e.get('additional_contacts',[]))}")
                print(f"Credits: {e.get('credits_used')}")
                print(f"LinkedIn: {e.get('linkedin_search_url')}")
                print(f"Org LinkedIn: {e.get('org_linkedin_search_url')}")
                print(f"From cache: {e.get('from_cache')}")
            if data.get("error"):
                print(f"Error: {data['error']}")
        except:
            print(f"Raw: {r.text[:300]}")
