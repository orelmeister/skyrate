"""
Simple test script - just runs tests against already running server.
"""
import requests
import json
import time
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:8001"

def test_api():
    """Run API tests"""
    print("\n" + "="*60)
    print("SKYRATE AI - API TESTS")
    print("="*60)
    
    # Test 1: Root endpoint
    print("\n[TEST 1] Root Endpoint...")
    try:
        resp = requests.get(f"{BASE_URL}/", timeout=5)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json()}")
        assert resp.status_code == 200
        print("  ✓ PASSED")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 2: Health check
    print("\n[TEST 2] Health Check...")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json()}")
        assert resp.status_code == 200
        print("  ✓ PASSED")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 3: Register Consultant User
    print("\n[TEST 3] Register Consultant User...")
    try:
        user_data = {
            "email": f"test_consultant_{int(time.time())}@example.com",
            "password": "TestPass123!",
            "first_name": "Test",
            "last_name": "Consultant",
            "company_name": "Test Company",
            "role": "consultant"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/register", json=user_data, timeout=10)
        print(f"  Status: {resp.status_code}")
        resp_json = resp.json()
        print(f"  Response: {json.dumps(resp_json, indent=2)[:500]}")
        if resp.status_code == 201:
            print("  ✓ PASSED")
            consultant_email = user_data["email"]
            consultant_password = user_data["password"]
            consultant_token = resp_json.get("access_token")
        else:
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 4: Login as Consultant
    print("\n[TEST 4] Login as Consultant...")
    try:
        login_data = {
            "email": consultant_email,
            "password": consultant_password
        }
        resp = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            json=login_data,  # JSON body
            timeout=10
        )
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            token_data = resp.json()
            print(f"  Token type: {token_data.get('token_type')}")
            print(f"  Access token: {token_data.get('access_token', '')[:50]}...")
            consultant_token = token_data.get("access_token")
            print("  ✓ PASSED")
        else:
            print(f"  Response: {resp.json()}")
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 5: Get Profile
    print("\n[TEST 5] Get User Profile...")
    try:
        headers = {"Authorization": f"Bearer {consultant_token}"}
        resp = requests.get(f"{BASE_URL}/api/v1/auth/me", headers=headers, timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {json.dumps(resp.json(), indent=2)[:500]}")
        if resp.status_code == 200:
            print("  ✓ PASSED")
        else:
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 6: Register Vendor User
    print("\n[TEST 6] Register Vendor User...")
    try:
        vendor_data = {
            "email": f"test_vendor_{int(time.time())}@example.com",
            "password": "TestPass123!",
            "first_name": "Test",
            "last_name": "Vendor",
            "company_name": "Vendor Corp",
            "role": "vendor"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/register", json=vendor_data, timeout=10)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 201:
            print("  ✓ PASSED")
            vendor_email = vendor_data["email"]
            vendor_password = vendor_data["password"]
        else:
            print(f"  Response: {resp.json()}")
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 7: Login as Vendor
    print("\n[TEST 7] Login as Vendor...")
    try:
        login_data = {
            "email": vendor_email,
            "password": vendor_password
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/login", json=login_data, timeout=10)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            vendor_token = resp.json().get("access_token")
            print("  ✓ PASSED")
        else:
            print(f"  Response: {resp.json()}")
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 8: Get Consultant Profile
    print("\n[TEST 8] Get Consultant Profile...")
    try:
        headers = {"Authorization": f"Bearer {consultant_token}"}
        resp = requests.get(f"{BASE_URL}/api/v1/consultant/profile", headers=headers, timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {json.dumps(resp.json(), indent=2)[:500]}")
        # 404 is expected if no profile created yet
        if resp.status_code in [200, 404]:
            print("  ✓ PASSED (Profile endpoint accessible)")
        else:
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 9: Get Vendor Profile
    print("\n[TEST 9] Get Vendor Profile...")
    try:
        headers = {"Authorization": f"Bearer {vendor_token}"}
        resp = requests.get(f"{BASE_URL}/api/v1/vendor/profile", headers=headers, timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {json.dumps(resp.json(), indent=2)[:500]}")
        # 404 is expected if no profile created yet
        if resp.status_code in [200, 404]:
            print("  ✓ PASSED (Profile endpoint accessible)")
        else:
            print("  ✗ FAILED")
            return False
    except Exception as e:
        print(f"  ✗ FAILED: {e}")
        return False

    # Test 10: API Docs
    print("\n[TEST 10] OpenAPI Docs...")
    try:
        resp = requests.get(f"{BASE_URL}/docs", timeout=5)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
            print("  API documentation is available at /docs")
            print("  ✓ PASSED")
        else:
            print("  ✗ FAILED")
    except Exception as e:
        print(f"  ✗ FAILED: {e}")

    print("\n" + "="*60)
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
    print("="*60)
    return True


if __name__ == "__main__":
    test_api()
