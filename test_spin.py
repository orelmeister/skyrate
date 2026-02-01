#!/usr/bin/env python
"""Test SPIN validation directly"""
import sys
import os
sys.path.insert(0, 'c:\\Dev\\skyrate\\backend')
os.chdir('c:\\Dev\\skyrate\\backend')

from utils.usac_client import USACDataClient

print("Testing SPIN validation with test SPIN: 143032945")
client = USACDataClient()
result = client.validate_spin("143032945")

if result.get("valid"):
    print(f"✓ VALID SPIN")
    print(f"  Provider: {result.get('service_provider_name')}")
    print(f"  Status: {result.get('status')}")
else:
    print(f"✗ INVALID SPIN")
    print(f"  Error: {result.get('error')}")
