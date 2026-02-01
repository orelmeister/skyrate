#!/usr/bin/env python
"""Start backend server and test SPIN validation"""
import subprocess
import sys
import time
import requests
import json
import os

os.chdir('c:\\Dev\\skyrate')
os.environ['PYTHONPATH'] = 'c:\\Dev\\skyrate\\backend'

# Use the venv Python
venv_python = 'c:\\Dev\\skyrate\\venv\\Scripts\\python.exe'

# Start the backend server
print("Starting backend server...")
server_process = subprocess.Popen(
    [venv_python, '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8001'],
    cwd='c:\\Dev\\skyrate\\backend',
    env=os.environ,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
    universal_newlines=True
)

# Give server time to start and read startup output
time.sleep(4)
print("Server should be ready now...")

# Check if server is still running
if server_process.poll() is not None:
    stdout, _ = server_process.communicate()
    print("Server output:")
    print(stdout)
    print("Server died prematurely!")
    sys.exit(1)

try:
    # Test vendor login
    print("\n1. Testing vendor login...")
    login_response = requests.post(
        "http://localhost:8001/api/v1/auth/login",
        json={"email": "test_vendor@example.com", "password": "test123"},
        timeout=5
    )
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        print(login_response.text)
        sys.exit(1)
    
    login_data = login_response.json()
    token = login_data["access_token"]
    print(f"✅ Login successful")
    
    # Test SPIN validation
    print("\n2. Testing SPIN validation (143032945)...")
    spin_response = requests.post(
        "http://localhost:8001/api/v1/vendor/spin/validate",
        json={"spin": "143032945"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10
    )
    
    if spin_response.status_code != 200:
        print(f"❌ SPIN validation failed: {spin_response.status_code}")
        print(spin_response.text)
        sys.exit(1)
    
    spin_data = spin_response.json()
    
    if spin_data.get("valid"):
        print("✅ SPIN VALIDATION SUCCESSFUL!")
        print(f"   Provider Name: {spin_data['provider']['service_provider_name']}")
        print(f"   Status: {spin_data['provider']['status']}")
        print(f"   Phone: {spin_data['provider']['phone_number']}")
        print(f"\n✅ ALL TESTS PASSED - USAC credentials are working!")
    else:
        print(f"❌ SPIN validation failed: {spin_data.get('error')}")
        sys.exit(1)
        
finally:
    # Cleanup
    print("\nShutting down server...")
    server_process.terminate()
    try:
        server_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server_process.kill()
    print("Done.")
