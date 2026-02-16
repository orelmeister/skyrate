"""Quick production test for admin system"""
import requests
import time
import sys

BASE = "https://skyrate.ai/api/v1"

def test():
    # 1. Test admin login
    print("1. Testing admin login...")
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@skyrate.ai", "password": "SkyRateAdmin2024!"})
    print(f"   Status: {r.status_code}")
    if r.status_code != 200:
        print(f"   Response: {r.text[:200]}")
        print("   >>> Admin login failed - deploy may still be building")
        return False
    
    token = r.json()["access_token"]
    role = r.json()["user"]["role"]
    print(f"   Role: {role}")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Test admin dashboard
    print("2. Testing admin dashboard...")
    r = requests.get(f"{BASE}/admin/dashboard", headers=headers)
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        d = r.json()["dashboard"]
        print(f"   Users: {d['users']['total']}, Open tickets: {d['tickets']['open']}, FRNs: {d['frn_monitoring']['total_tracked']}")
    else:
        print(f"   Error: {r.text[:200]}")
    
    # 3. Test support ticket creation (as guest)
    print("3. Testing guest support ticket...")
    r = requests.post(f"{BASE}/support/tickets", json={
        "subject": "Test ticket from deploy verification",
        "message": "This is an automated test ticket. Please ignore.",
        "category": "general",
        "source": "landing_page",
        "guest_name": "Deploy Test",
        "guest_email": "test@example.com"
    })
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        ticket_id = r.json()["ticket"]["id"]
        print(f"   Ticket created: #{ticket_id}")
    else:
        print(f"   Error: {r.text[:200]}")
    
    # 4. Test FRN monitor
    print("4. Testing FRN monitor...")
    r = requests.get(f"{BASE}/admin/frn-monitor", headers=headers)
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        s = r.json().get("summary", {})
        print(f"   FRN Summary: {s}")
    
    # 5. Test admin tickets list
    print("5. Testing admin tickets list...")
    r = requests.get(f"{BASE}/admin/tickets", headers=headers)
    print(f"   Status: {r.status_code}")
    if r.status_code == 200:
        print(f"   Total tickets: {r.json()['total']}")
    
    print("\n=== ALL TESTS PASSED ===")
    return True

if __name__ == "__main__":
    test()
