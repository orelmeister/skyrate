#!/usr/bin/env python3
"""Quick test to check FRN status for BEN 54120"""
import requests
import json

# FRN Status endpoint
url = 'https://opendata.usac.org/resource/qdmp-ygft.json'
params = {'$where': "ben = '54120'", '$limit': '10'}

print(f"Querying: {url}")
print(f"Params: {params}")
print()

r = requests.get(url, params=params, timeout=30)
print(f"HTTP Status: {r.status_code}")
data = r.json()
print(f"Records returned: {len(data)}")
print()

if data:
    # Show first record keys
    print("Available fields:", list(data[0].keys()))
    print()
    
    for i, rec in enumerate(data[:5]):
        print(f"--- Record {i+1} ---")
        print(f"  FRN: {rec.get('funding_request_number', 'N/A')}")
        print(f"  Year: {rec.get('funding_year', 'N/A')}")
        print(f"  Status (form_471_frn_status_name): {rec.get('form_471_frn_status_name', 'MISSING')}")
        print(f"  frn_status: {rec.get('frn_status', 'MISSING')}")
        print(f"  Application: {rec.get('application_number', 'N/A')}")
        print(f"  Service Type: {rec.get('form_471_service_type_name', 'N/A')}")
        print()
else:
    print("No records found - checking alternative endpoint...")
    
    # Try the 471 combined endpoint
    url2 = 'https://opendata.usac.org/resource/avi8-svp9.json'
    params2 = {'$where': "billed_entity_number = '54120'", '$limit': '5'}
    r2 = requests.get(url2, params=params2, timeout=30)
    data2 = r2.json()
    print(f"471 Combined endpoint records: {len(data2)}")
    if data2:
        print("Fields:", list(data2[0].keys())[:15])
        for rec in data2[:3]:
            print(f"  FRN: {rec.get('funding_request_number')}, Status: {rec.get('form_471_frn_status_name')}")
