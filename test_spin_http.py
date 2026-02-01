#!/usr/bin/env python
"""Test SPIN validation via HTTP"""
import requests
import json
import time

time.sleep(2)

# Test login
print("Testing vendor login...")
login_response = requests.post(
    "http://localhost:8001/api/v1/auth/login",
    json={"email": "test_vendor@example.com", "password": "test123"}
)

if login_response.status_code != 200:
    print(f"❌ Login failed: {login_response.status_code}")
    print(login_response.text)
    exit(1)

login_data = login_response.json()
token = login_data["access_token"]
print(f"✓ Login successful")

# Test SPIN validation
print("\nTesting SPIN validation (143032945)...")
spin_response = requests.post(
    "http://localhost:8001/api/v1/vendor/spin/validate",
    json={"spin": "143032945"},
    headers={"Authorization": f"Bearer {token}"}
)

if spin_response.status_code != 200:
    print(f"❌ SPIN validation failed: {spin_response.status_code}")
    print(spin_response.text)
    exit(1)

spin_data = spin_response.json()

if spin_data.get("valid"):
    print("✅ SPIN VALIDATION SUCCESSFUL!")
    print(f"Provider Name: {spin_data['provider']['service_provider_name']}")
    print(f"Status: {spin_data['provider']['status']}")
    print(f"Phone: {spin_data['provider']['phone_number']}")
else:
    print(f"❌ SPIN validation failed: {spin_data.get('error')}")
