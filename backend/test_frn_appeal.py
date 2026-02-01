"""
Direct test for appeal generation for specific FRN
Tests the ACTUAL code path used by the API
"""
import os
import sys
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add paths
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests

# Test FRN
TEST_FRN = "2599047928"

def fetch_usac_data(frn):
    """Fetch data from USAC API"""
    url = "https://opendata.usac.org/resource/srbr-2d59.json"
    params = {
        "$limit": 10,
        "$where": f"funding_request_number = '{frn}'",
    }
    
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()

def test_appeal_generation():
    """Test the full appeal generation flow"""
    print(f"\n{'='*80}")
    print(f"TESTING APPEAL GENERATION FOR FRN: {TEST_FRN}")
    print(f"{'='*80}")
    
    # Step 1: Fetch USAC data
    print("\n[1] Fetching USAC data...")
    try:
        usac_data = fetch_usac_data(TEST_FRN)
        if not usac_data:
            print(f"ERROR: FRN {TEST_FRN} not found in USAC database")
            return
        
        frn_data = usac_data[0]
        print(f"    Organization: {frn_data.get('organization_name')}")
        print(f"    Status: {frn_data.get('form_471_frn_status_name')}")
        print(f"    FCDL Comment: {frn_data.get('fcdl_comment', 'None')[:200]}...")
        print(f"    Amount: ${float(frn_data.get('funding_commitment_request') or 0):,.2f}")
    except Exception as e:
        print(f"ERROR fetching USAC data: {e}")
        return
    
    # Step 2: Check if it's denied
    status = str(frn_data.get('form_471_frn_status_name', '')).lower()
    print(f"\n[2] Status check: '{status}'")
    if 'denied' not in status:
        print(f"    WARNING: This FRN is not denied (status: {status})")
    
    # Step 3: Build denial details like the API does
    print("\n[3] Building denial details...")
    fcdl_comment = (
        frn_data.get("fcdl_comment") or 
        frn_data.get("denial_reason") or 
        frn_data.get("frn_denial_reason_desc") or 
        ""
    )
    
    violation_types = []
    if fcdl_comment:
        fcdl_lower = fcdl_comment.lower()
        if "bid" in fcdl_lower or "competitive" in fcdl_lower or "470" in fcdl_lower:
            violation_types.append("competitive_bidding")
        if "document" in fcdl_lower or "missing" in fcdl_lower:
            violation_types.append("documentation")
        if "eligible" in fcdl_lower:
            violation_types.append("eligibility")
        if "deadline" in fcdl_lower or "late" in fcdl_lower:
            violation_types.append("timing")
    if not violation_types:
        violation_types.append("procedural")
    
    denial_details = {
        "frn": TEST_FRN,
        "application_number": frn_data.get("application_number", ""),
        "funding_year": frn_data.get("funding_year"),
        "service_type": frn_data.get("form_471_service_type_name", ""),
        "service_description": frn_data.get("service_type_other_description") or frn_data.get("function") or "",
        "total_denied_amount": float(frn_data.get("funding_commitment_request") or 0),
        "fcdl_comment": fcdl_comment,
        "denial_reasons": [fcdl_comment] if fcdl_comment else [],
        "violation_types": violation_types,
        "overall_appealability": "medium",
        "organization_name": frn_data.get("organization_name", ""),
        "usac_context": {
            "service_provider_name": frn_data.get("service_provider_name", ""),
            "discount_pct": frn_data.get("discount_pct", 0),
            "establishing_fcc_form470_number": frn_data.get("establishing_fcc_form470_number", ""),
        },
    }
    
    print(f"    Org: {denial_details['organization_name']}")
    print(f"    FCDL Comment: {fcdl_comment[:200] if fcdl_comment else 'NONE'}...")
    print(f"    Violation Types: {violation_types}")
    
    # Step 4: Generate strategy
    print("\n[4] Generating appeal strategy...")
    from utils.appeals_strategy import AppealsStrategy
    appeals_strategy = AppealsStrategy()
    strategy = appeals_strategy.generate_strategy(denial_details)
    print(f"    Strategy keys: {list(strategy.keys())}")
    print(f"    Recommendations: {strategy.get('recommendations', [])[:2]}...")
    
    # Step 5: Generate appeal with AI
    print("\n[5] Generating appeal letter with AI...")
    from utils.ai_models import AIModelManager
    
    ai_manager = AIModelManager()
    print(f"    Available models: {ai_manager.get_available_models()}")
    
    # Use the simplified OpenData approach
    org_name = denial_details.get("organization_name", "the applicant")
    app_number = denial_details.get("application_number", "")
    frn = denial_details.get("frn", "Unknown")
    funding_year = denial_details.get("funding_year", "Unknown")
    amount = denial_details.get("total_denied_amount", 0)
    
    # OpenData style - simple data context
    data_context = str(denial_details)
    
    # OpenData style - simple prompt
    appeal_prompt = f"""Generate a formal E-Rate appeal letter for the following denied application:

Organization: {org_name}
Application Number: {app_number}
Funding Request Number: {frn}
Funding Year: {funding_year}
Amount Denied: ${amount:,.2f}
Service Type: {denial_details.get('service_type', 'E-Rate services')}

Denial Reason (FCDL Comment):
{fcdl_comment or 'No specific denial reason provided'}

Violation Types: {', '.join(violation_types) if violation_types else 'General procedural'}

Appeal Strategy Recommendations:
{json.dumps(strategy.get('recommendations', []), indent=2, default=str)}

Write a professional, comprehensive appeal letter that:
1. Addresses the USAC Appeals Committee formally
2. Includes Introduction, Background, Grounds for Appeal, Supporting Documentation, and Conclusion sections
3. Cites relevant FCC regulations (47 C.F.R. § 54.xxx) and precedents
4. Directly addresses each denial reason with specific counter-arguments
5. Argues for reversal of the denial decision
6. Is ready to submit (at least 1500 words)"""

    print(f"    Prompt length: {len(appeal_prompt)} chars")
    print(f"    Data context length: {len(data_context)} chars")
    
    print("\n[6] Calling AI (this may take 30-60 seconds)...")
    try:
        appeal_text = ai_manager.deep_analysis(data_context, appeal_prompt)
        
        print(f"\n{'='*80}")
        print("GENERATED APPEAL LETTER:")
        print(f"{'='*80}")
        print(f"Length: {len(appeal_text)} characters")
        print(f"\n{'-'*80}")
        print(appeal_text)
        print(f"{'-'*80}")
        
        # Check quality
        is_stub = any(marker in appeal_text.lower() for marker in ["unavailable", "api not configured", "stub"])
        has_structure = sum(1 for marker in ["dear", "appeal", "denial", "usac", "sincerely"] if marker in appeal_text.lower())
        
        print(f"\n[7] Quality Check:")
        print(f"    Is Stub Response: {is_stub}")
        print(f"    Structure Score: {has_structure}/5")
        print(f"    Length OK: {len(appeal_text) > 1000}")
        
        # Save to file
        with open(f"appeal_output_{TEST_FRN}.txt", "w", encoding="utf-8") as f:
            f.write(appeal_text)
        print(f"\n    Full appeal saved to: appeal_output_{TEST_FRN}.txt")
        
    except Exception as e:
        print(f"ERROR generating appeal: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_appeal_generation()
