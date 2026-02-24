"""Test save endpoint on production"""
import requests
import json

BASE = "https://skyrate.ai/api/v1"

# Login
r = requests.post(f"{BASE}/auth/login", json={"email": "test_vendor@example.com", "password": "TestPass123!"}, timeout=15)
print("Login:", r.status_code)
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get a prediction ID
r = requests.get(f"{BASE}/vendor/predicted-leads?limit=2", headers=headers, timeout=15)
print("Get leads:", r.status_code)
leads = r.json()["data"]
lead = leads[0]
lead_id = lead["id"]
print(f"Lead 1: id={lead_id}, org={lead['organization_name']}, ben={lead['ben']}, frn={lead.get('frn')}")

# Test SAVE
print("\n--- SAVE ---")
try:
    r = requests.post(f"{BASE}/vendor/predicted-leads/{lead_id}/save", headers=headers, timeout=30)
    print(f"Status: {r.status_code}")
    try:
        data = r.json()
        print(f"Success: {data.get('success')}")
        print(f"Error: {data.get('error')}")
        print(f"Detail: {data.get('detail')}")
        if data.get('lead'):
            print(f"Lead ID: {data['lead'].get('id')}")
    except:
        print(f"Raw body: {r.text[:300]}")
except Exception as e:
    print(f"Request failed: {e}")

# Test ENRICH with short timeout
print("\n--- ENRICH ---")
lead2 = leads[1] if len(leads) > 1 else lead
lead2_id = lead2["id"]
print(f"Lead 2: id={lead2_id}, org={lead2['organization_name']}, email={lead2.get('contact_email')}")
try:
    r = requests.post(f"{BASE}/vendor/predicted-leads/{lead2_id}/enrich", headers=headers, timeout=30)
    print(f"Status: {r.status_code}")
    try:
        data = r.json()
        print(f"Success: {data.get('success')}")
        enrichment = data.get('enrichment', {})
        print(f"LinkedIn: {enrichment.get('linkedin_search_url')}")
        print(f"Person: {enrichment.get('person')}")
        print(f"Credits: {enrichment.get('credits_used')}")
        print(f"Note: {enrichment.get('note')}")
    except:
        print(f"Raw body: {r.text[:300]}")
except Exception as e:
    print(f"Request failed: {e}")
