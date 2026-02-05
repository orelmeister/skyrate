"""Quick test script for login endpoint"""
import requests
import json

url = "http://localhost:8001/api/v1/auth/login"
data = {
    "email": "test_applicant@example.com",
    "password": "TestPass123!"
}

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except requests.exceptions.ConnectionError:
    print("ERROR: Could not connect to server at http://localhost:8001")
    print("Make sure the backend is running!")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
