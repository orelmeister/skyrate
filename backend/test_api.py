"""
Test script for SkyRate AI Backend API
"""
import requests
import json

BASE_URL = "http://localhost:8001/api/v1"

def test_api():
    print("=" * 50)
    print("SkyRate AI Backend - API Tests")
    print("=" * 50)
    
    # 1. Test Root
    print("\n1. Testing Root Endpoint...")
    r = requests.get("http://localhost:8001/")
    print(f"   Status: {r.status_code}")
    print(f"   Response: {r.json()}")
    
    # 2. Test Health
    print("\n2. Testing Health Endpoint...")
    r = requests.get("http://localhost:8001/health")
    print(f"   Status: {r.status_code}")
    print(f"   Response: {r.json()}")
    
    # 3. Register a Consultant
    print("\n3. Testing User Registration (Consultant)...")
    register_data = {
        "email": "testconsultant@example.com",
        "password": "TestPass123!",
        "role": "consultant",
        "first_name": "Test",
        "last_name": "Consultant",
        "company_name": "Test Consulting LLC"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=register_data)
    print(f"   Status: {r.status_code}")
    resp = r.json()
    print(f"   Response: {json.dumps(resp, indent=2)[:500]}")
    
    # 4. Login
    print("\n4. Testing Login...")
    login_data = {
        "email": "testconsultant@example.com",
        "password": "TestPass123!"
    }
    r = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    print(f"   Status: {r.status_code}")
    login_resp = r.json()
    print(f"   Access Token: {login_resp.get('access_token', 'N/A')[:50]}...")
    
    access_token = login_resp.get("access_token")
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # 5. Get Profile
    print("\n5. Testing Get Profile...")
    r = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:500]}")
    
    # 6. Get Consultant Profile
    print("\n6. Testing Consultant Profile...")
    r = requests.get(f"{BASE_URL}/consultant/profile", headers=headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:500]}")
    
    # 7. Add a School to Portfolio
    print("\n7. Testing Add School to Portfolio...")
    school_data = {
        "ben": "123456",
        "school_name": "Test Elementary School",
        "state": "CA",
        "city": "Los Angeles"
    }
    r = requests.post(f"{BASE_URL}/consultant/schools", json=school_data, headers=headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:500]}")
    
    # 8. List Schools in Portfolio
    print("\n8. Testing List Schools...")
    r = requests.get(f"{BASE_URL}/consultant/schools", headers=headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:500]}")
    
    # 9. Register a Vendor
    print("\n9. Testing Vendor Registration...")
    vendor_data = {
        "email": "testvendor@example.com",
        "password": "TestPass123!",
        "role": "vendor",
        "first_name": "Test",
        "last_name": "Vendor",
        "company_name": "Test Networking Inc"
    }
    r = requests.post(f"{BASE_URL}/auth/register", json=vendor_data)
    print(f"   Status: {r.status_code}")
    
    # 10. Login as Vendor
    print("\n10. Testing Vendor Login...")
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "testvendor@example.com",
        "password": "TestPass123!"
    })
    vendor_token = r.json().get("access_token")
    vendor_headers = {"Authorization": f"Bearer {vendor_token}"}
    print(f"   Status: {r.status_code}")
    
    # 11. Get Vendor Profile
    print("\n11. Testing Vendor Profile...")
    r = requests.get(f"{BASE_URL}/vendor/profile", headers=vendor_headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:500]}")
    
    # 12. Get Equipment Types
    print("\n12. Testing Equipment Types...")
    r = requests.get(f"{BASE_URL}/vendor/equipment-types", headers=vendor_headers)
    print(f"   Status: {r.status_code}")
    print(f"   Response: {json.dumps(r.json(), indent=2)[:800]}")
    
    print("\n" + "=" * 50)
    print("All tests completed!")
    print("=" * 50)

if __name__ == "__main__":
    test_api()
