#!/usr/bin/env python3
"""
Direct SPIN validation test - bypassing the web server
"""
import sys
import os

# Add the backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from utils.usac_client import USACDataClient
    
    print("Testing SPIN validation directly...")
    print("SPIN: 143032945")
    print("-" * 50)
    
    client = USACDataClient()
    result = client.validate_spin("143032945")
    
    print("Result:")
    print(f"Valid: {result.get('valid', False)}")
    print(f"Error: {result.get('error', 'None')}")
    
    if result.get('valid'):
        print("\nProvider Details:")
        for key, value in result.items():
            if key != 'valid':
                print(f"  {key}: {value}")
    
except Exception as e:
    print(f"Error during SPIN validation: {e}")
    import traceback
    traceback.print_exc()