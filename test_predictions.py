"""Quick test script to check prediction stats on production"""
import requests
import json
import sys

BASE = "https://skyrate.ai/api/v1"

print("1. Logging in...")
try:
    r = requests.post(f"{BASE}/auth/login", 
                      json={"email": "test_vendor@example.com", "password": "TestPass123!"},
                      timeout=60)
    print(f"   Status: {r.status_code}")
    if r.status_code != 200:
        print(f"   Error: {r.text[:300]}")
        sys.exit(1)
    token = r.json().get("access_token", "")
    print(f"   Token: {len(token)} chars")
except Exception as e:
    print(f"   Exception: {e}")
    sys.exit(1)

headers = {"Authorization": f"Bearer {token}"}

print("\n2. Checking prediction stats...")
try:
    r = requests.get(f"{BASE}/vendor/predicted-leads/stats", headers=headers, timeout=60)
    print(f"   Status: {r.status_code}")
    data = r.json()
    print(f"   Response: {json.dumps(data, indent=2)}")
except Exception as e:
    print(f"   Exception: {e}")

print("\n3. Fetching first page of predictions...")
try:
    r = requests.get(f"{BASE}/vendor/predicted-leads?page=1&page_size=5", headers=headers, timeout=60)
    print(f"   Status: {r.status_code}")
    data = r.json()
    if data.get("success"):
        print(f"   Total: {data.get('total', 0)}")
        for p in data.get("predictions", [])[:3]:
            print(f"   - {p.get('prediction_type')}: {p.get('applicant_name', 'N/A')} | confidence={p.get('confidence_score', 0)}")
    else:
        print(f"   Response: {json.dumps(data, indent=2)[:500]}")
except Exception as e:
    print(f"   Exception: {e}")

print("\nDone.")
