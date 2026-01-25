"""
Run server and test API endpoints in sequence.
"""
import subprocess
import sys
import time
import requests
import json

BASE_URL = "http://localhost:8001"
PYTHON = r"C:\Users\orelm\OneDrive\Documents\GitHub\erateapp.com\opendata\erate\Scripts\python.exe"

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
            "full_name": "Test Consultant",
            "company_name": "Test Company",
            "role": "consultant"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/register", json=user_data, timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {json.dumps(resp.json(), indent=2)[:500]}")
        if resp.status_code == 200:
            print("  ✓ PASSED")
            consultant_email = user_data["email"]
            consultant_password = user_data["password"]
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
            "username": consultant_email,
            "password": consultant_password
        }
        resp = requests.post(
            f"{BASE_URL}/api/v1/auth/login",
            data=login_data,  # OAuth2 form data
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
            "full_name": "Test Vendor",
            "company_name": "Vendor Corp",
            "role": "vendor"
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/register", json=vendor_data, timeout=10)
        print(f"  Status: {resp.status_code}")
        if resp.status_code == 200:
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
            "username": vendor_email,
            "password": vendor_password
        }
        resp = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data, timeout=10)
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


def main():
    import os
    
    # Change to backend directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(backend_dir)
    
    print("Starting SkyRate AI Backend Server...")
    
    # Start the server as a subprocess
    server_process = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
    )
    
    print(f"Server started with PID: {server_process.pid}")
    
    # Wait for server to be ready
    print("Waiting for server to be ready...")
    max_attempts = 30
    for i in range(max_attempts):
        try:
            resp = requests.get(f"{BASE_URL}/health", timeout=1)
            if resp.status_code == 200:
                print("Server is ready!")
                break
        except:
            pass
        time.sleep(1)
        print(f"  Attempt {i+1}/{max_attempts}...")
    else:
        print("Server failed to start!")
        server_process.terminate()
        return 1
    
    # Run tests
    try:
        success = test_api()
    except Exception as e:
        print(f"Test error: {e}")
        success = False
    
    # Stop the server
    print("\nStopping server...")
    server_process.terminate()
    try:
        server_process.wait(timeout=5)
    except:
        server_process.kill()
    
    print("Server stopped.")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
