#!/usr/bin/env python3
"""
Test script for appeal generation debugging
"""

import os
import sys
import json
from pathlib import Path

# Add backend to Python path
backend_path = Path(__file__).parent
sys.path.insert(0, str(backend_path))
sys.path.insert(0, str(backend_path / "utils"))

from app.services.ai_service import get_ai_service
from utils.ai_models import AIModelManager, AIModel
import requests

def test_ai_models():
    """Test AI model availability and basic functionality"""
    print("=== Testing AI Models ===")
    
    manager = AIModelManager()
    available_models = manager.get_available_models()
    print(f"Available models: {available_models}")
    
    # Test each model with a simple prompt
    test_prompt = "Write a brief introduction for an E-Rate appeal letter."
    
    if manager.is_model_available(AIModel.GEMINI):
        print("\n--- Testing Gemini ---")
        try:
            response = manager.call_gemini(test_prompt)
            print(f"Response length: {len(response)}")
            print(f"Response preview: {response[:200]}...")
        except Exception as e:
            print(f"Gemini error: {e}")
    
    if manager.is_model_available(AIModel.CLAUDE):
        print("\n--- Testing Claude ---")
        try:
            response = manager.call_claude([{"role": "user", "content": test_prompt}])
            print(f"Response length: {len(response)}")
            print(f"Response preview: {response[:200]}...")
        except Exception as e:
            print(f"Claude error: {e}")
    
    if manager.is_model_available(AIModel.DEEPSEEK):
        print("\n--- Testing DeepSeek ---")
        try:
            response = manager.call_deepseek([{"role": "user", "content": test_prompt}])
            print(f"Response length: {len(response)}")
            print(f"Response preview: {response[:200]}...")
        except Exception as e:
            print(f"DeepSeek error: {e}")

def test_usac_data_fetch():
    """Test fetching sample USAC data"""
    print("\n=== Testing USAC Data Fetch ===")
    
    # Test FRN lookup
    test_frn = "1999000001"  # Sample FRN
    url = f"https://opendata.usac.org/resource/srbr-2d59.json"
    params = {
        "$limit": 5,
        "$where": f"funding_request_number = '{test_frn}'"
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        print(f"Sample USAC query returned {len(data)} records")
        if data:
            print(f"Sample record keys: {list(data[0].keys())}")
            print(f"Sample FRN status: {data[0].get('form_471_frn_status_name', 'N/A')}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"USAC API error: {e}")
        return []

def create_test_denial_details():
    """Create test denial details for appeal generation"""
    return {
        "frn": "2391012345",
        "application_number": "123456789",
        "funding_year": "2024",
        "service_type": "Category Two",
        "service_description": "Internal Connections - Wireless Local Area Network",
        "total_denied_amount": 150000.00,
        "fcdl_comment": "The application was denied because the applicant failed to demonstrate that they followed proper competitive bidding procedures as required under 47 C.F.R. § 54.503. Specifically, the applicant did not post their Form 470 for the required 28-day waiting period before selecting a service provider. The Form 470 was posted on January 15, 2024, but the contract was executed on February 5, 2024, which is only 21 days later.",
        "denial_reasons": [
            "Competitive bidding violation - insufficient waiting period",
            "Form 470 posting requirements not met"
        ],
        "violation_types": ["competitive_bidding"],
        "overall_appealability": "high",
        "usac_context": {
            "form_471_status": "Denied",
            "service_provider_name": "TechNet Solutions",
            "discount_pct": 80,
            "total_monthly_cost": 12500,
            "months_of_service": 12,
            "establishing_fcc_form470_number": "470123456789"
        },
        "form_470_data": {
            "form_470_number": "470123456789",
            "posting_date": "2024-01-15",
            "allowable_contract_date": "2024-02-12",
            "certified_date": "2024-01-15"
        }
    }

def test_appeal_generation():
    """Test the full appeal generation process"""
    print("\n=== Testing Appeal Generation ===")
    
    ai_service = get_ai_service()
    denial_details = create_test_denial_details()
    
    organization_info = {
        "organization_name": "Springfield Elementary School",
        "ben": "123456",
        "state": "IL",
        "city": "Springfield",
        "entity_type": "School"
    }
    
    print("Testing denial reason analysis...")
    try:
        denial_analysis = ai_service.analyze_denial_reasons(denial_details["fcdl_comment"])
        print(f"Denial analysis type: {type(denial_analysis)}")
        if isinstance(denial_analysis, dict):
            print(f"Analysis keys: {list(denial_analysis.keys())}")
        else:
            print(f"Analysis preview: {str(denial_analysis)[:300]}...")
    except Exception as e:
        print(f"Denial analysis error: {e}")
    
    print("\nTesting appeal strategy generation...")
    try:
        appeal_text = ai_service.generate_appeal_strategy(denial_details, organization_info)
        print(f"Appeal text length: {len(appeal_text)}")
        print(f"Appeal quality indicators:")
        print(f"  - Contains FRN: {'2391012345' in appeal_text}")
        print(f"  - Contains amount: {'150,000' in appeal_text or '$150000' in appeal_text}")
        print(f"  - Contains competitive bidding: {'competitive bidding' in appeal_text.lower()}")
        print(f"  - Contains Form 470: {'form 470' in appeal_text.lower()}")
        print(f"  - Contains 28-day: {'28' in appeal_text}")
        print(f"  - Professional structure: {'Dear' in appeal_text and 'Respectfully' in appeal_text}")
        
        # Check for stub response indicators
        is_stub = any(indicator in appeal_text.lower() for indicator in [
            'api not configured',
            'unavailable',
            'placeholder',
            'please configure'
        ])
        print(f"  - Is stub response: {is_stub}")
        
        if len(appeal_text) < 500:
            print("WARNING: Appeal text is very short!")
        
        print(f"\nAppeal preview (first 500 chars):")
        print(appeal_text[:500])
        print("...")
        print(f"\nAppeal ending (last 300 chars):")
        print(appeal_text[-300:])
        
    except Exception as e:
        print(f"Appeal generation error: {e}")
        import traceback
        traceback.print_exc()

def test_full_workflow():
    """Test the complete workflow as called by the API"""
    print("\n=== Testing Full API Workflow ===")
    
    # Simulate what happens in the appeals API
    from app.api.v1.appeals import _build_denial_details, _generate_appeal_letter
    from app.services import get_appeals_service
    
    # Create a mock application object
    class MockApplication:
        def __init__(self):
            self.frn = "2391012345"
            self.application_number = "123456789"
            self.funding_year = "2024"
            self.service_type = "Category Two"
            self.service_description = "Internal Connections - WLAN"
            self.amount_requested = 150000.00
            self.fcdl_comment = "The application was denied because the applicant failed to demonstrate that they followed proper competitive bidding procedures as required under 47 C.F.R. § 54.503. Specifically, the applicant did not post their Form 470 for the required 28-day waiting period before selecting a service provider."
            self.denial_reasons = ["Competitive bidding violation"]
            self.appeal_deadline = None
    
    # Test USAC data integration
    frn_data = {
        "funding_request_number": "2391012345",
        "form_471_frn_status_name": "Denied",
        "fcdl_comment": "Competitive bidding procedures not followed properly",
        "service_provider_name": "TechNet Solutions",
        "discount_pct": "80",
        "establishing_fcc_form470_number": "470123456789"
    }
    
    # Build denial details
    application = MockApplication()
    denial_details = _build_denial_details(application, frn_data)
    print(f"Built denial details with keys: {list(denial_details.keys())}")
    
    # Generate strategy
    appeals_service = get_appeals_service()
    strategy = appeals_service.generate_full_strategy(denial_details)
    print(f"Strategy keys: {list(strategy.keys())}")
    if "error" in strategy:
        print(f"Strategy error: {strategy['error']}")
    
    # Generate appeal letter
    organization_info = {
        "organization_name": "Springfield Elementary School",
        "ben": "123456",
        "state": "IL"
    }
    
    appeal_text = _generate_appeal_letter(strategy, denial_details, organization_info)
    print(f"Final appeal text length: {len(appeal_text)}")
    
    # Quality check
    is_high_quality = (
        len(appeal_text) > 1000 and
        "competitive bidding" in appeal_text.lower() and
        "2391012345" in appeal_text and
        "150,000" in appeal_text and
        not any(indicator in appeal_text.lower() for indicator in ['unavailable', 'api not configured'])
    )
    
    print(f"Appeal passes quality check: {is_high_quality}")
    
    if not is_high_quality:
        print("DEBUGGING: Appeal quality issues detected")
        print("Appeal content preview:")
        print(appeal_text[:1000])

if __name__ == "__main__":
    print("SkyRate AI - Appeal Generation Test")
    print("=" * 50)
    
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Run tests
    test_ai_models()
    test_usac_data_fetch()
    test_appeal_generation()
    test_full_workflow()
    
    print("\n" + "=" * 50)
    print("Test completed!")