import requests
BASE = "https://skyrate.ai/api/v1"
r = requests.post(f"{BASE}/auth/login", json={"email":"test_vendor@example.com","password":"TestPass123!"})
t = r.json()["access_token"]
h = {"Authorization": f"Bearer {t}"}
r = requests.get(f"{BASE}/vendor/predicted-leads?limit=3", headers=h)
leads = r.json()["data"]
lead = leads[0]
print(f"Lead: id={lead['id']}, org={lead['organization_name']}")
print("--- SAVE ---")
r = requests.post(f"{BASE}/vendor/predicted-leads/{lead['id']}/save", headers=h, timeout=30)
print(f"Status: {r.status_code}")
d = r.json()
print(f"Success: {d.get('success')}")
if d.get("error"): print(f"Error: {d['error']}")
if d.get("lead"): print(f"Saved Lead ID: {d['lead'].get('id')}")
if d.get("detail"): print(f"Detail: {str(d['detail'])[:200]}")
if d.get("message"): print(f"Message: {d['message']}")
