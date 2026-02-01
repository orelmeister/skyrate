"""
Test Script: Compare Appeal Generation Approaches

This script compares:
1. OpenData approach (simpler prompt, uses DenialAnalyzer + AppealsStrategy + deep_analysis)
2. Current SkyRate approach (more complex prompt, longer data context)

Run from backend folder:
    python test_appeal_comparison.py
"""

import os
import sys
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add utils to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.ai_models import AIModelManager
from utils.denial_analyzer import DenialAnalyzer
from utils.appeals_strategy import AppealsStrategy
from utils.usac_client import USACDataClient


def test_opendata_approach(frn: str) -> dict:
    """
    Test the OpenData repository approach.
    Uses simpler prompt and passes denial_details as string directly.
    """
    print("\n" + "="*80)
    print("TESTING OPENDATA APPROACH")
    print("="*80)
    
    try:
        # Initialize components
        client = USACDataClient()
        ai_manager = AIModelManager()
        denial_analyzer = DenialAnalyzer(client)
        appeals_strategy = AppealsStrategy()
        
        # 1. Fetch data from USAC
        print(f"\n[1] Fetching USAC data for FRN: {frn}")
        df = client.fetch_data(filters={"funding_request_number": frn}, limit=1)
        
        if df.empty:
            return {"error": f"FRN {frn} not found in USAC database"}
        
        record = df.iloc[0].to_dict()
        print(f"    Organization: {record.get('organization_name')}")
        print(f"    Status: {record.get('application_status')}")
        
        # 2. Analyze denial using DenialAnalyzer
        print("\n[2] Analyzing denial with DenialAnalyzer")
        denial_details = denial_analyzer.fetch_denial_details(frn)
        
        if not denial_details:
            # Build basic denial details from record
            denial_details = {
                "organization_name": record.get("organization_name"),
                "application_number": record.get("application_number"),
                "frn": frn,
                "frn_count": 1,
                "total_denied_amount": float(record.get("original_total_pre_discount_costs") or 0),
                "fcdl_comment": record.get("fcdl_comment") or record.get("denial_reason") or "",
                "denial_reasons": [],
            }
        
        print(f"    Denial Details Keys: {list(denial_details.keys())}")
        
        # 3. Generate strategy using AppealsStrategy
        print("\n[3] Generating strategy with AppealsStrategy")
        strategy = appeals_strategy.generate_strategy(denial_details)
        print(f"    Strategy Keys: {list(strategy.keys())}")
        
        # 4. Generate appeal letter with AI - OPENDATA STYLE
        # Note: OpenData uses a SIMPLER prompt
        print("\n[4] Generating appeal letter with deep_analysis (OpenData style)")
        
        appeal_prompt = f"""Generate a formal E-Rate appeal letter for the following denied application:

Organization: {denial_details.get('organization_name')}
Application Number: {denial_details.get('application_number')}
Denial Reasons: {denial_details.get('denial_reasons')}
Appeal Strategy: {strategy.get('recommended_approach', strategy.get('recommendations', []))}

Additional Context: None provided

Write a professional appeal letter that addresses each denial reason and argues for reconsideration."""

        print(f"\n    Prompt length: {len(appeal_prompt)} chars")
        print(f"    Data context length: {len(str(denial_details))} chars")
        
        appeal_text = ai_manager.deep_analysis(
            str(denial_details),
            appeal_prompt
        )
        
        print(f"\n    Appeal letter length: {len(appeal_text)} chars")
        print(f"    First 500 chars of appeal:\n{'-'*40}")
        print(appeal_text[:500])
        print(f"{'-'*40}")
        
        return {
            "success": True,
            "approach": "opendata",
            "frn": frn,
            "denial_details": denial_details,
            "strategy": strategy,
            "appeal_letter": appeal_text,
            "appeal_length": len(appeal_text),
            "prompt_length": len(appeal_prompt),
        }
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "approach": "opendata"}


def test_current_approach(frn: str) -> dict:
    """
    Test the current SkyRate repository approach.
    Uses more complex prompt with detailed data context.
    """
    print("\n" + "="*80)
    print("TESTING CURRENT SKYRATE APPROACH")
    print("="*80)
    
    try:
        # Initialize components
        ai_manager = AIModelManager()
        appeals_strategy = AppealsStrategy()
        
        # 1. Fetch data from USAC directly
        print(f"\n[1] Fetching USAC data for FRN: {frn}")
        import requests
        
        url = "https://opendata.usac.org/resource/srbr-2d59.json"
        params = {
            "$limit": 10,
            "$where": f"funding_request_number = '{frn}'",
        }
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        usac_data = response.json()
        
        if not usac_data:
            return {"error": f"FRN {frn} not found in USAC database"}
        
        frn_data = usac_data[0]
        print(f"    Organization: {frn_data.get('organization_name')}")
        print(f"    Status: {frn_data.get('form_471_frn_status_name')}")
        
        # 2. Build denial details (current approach)
        print("\n[2] Building denial details (current approach)")
        
        fcdl_comment = (
            frn_data.get("fcdl_comment") or 
            frn_data.get("denial_reason") or 
            frn_data.get("frn_denial_reason_desc") or 
            ""
        )
        
        violation_types = []
        if "bid" in fcdl_comment.lower() or "competitive" in fcdl_comment.lower():
            violation_types.append("competitive_bidding")
        if "document" in fcdl_comment.lower():
            violation_types.append("documentation")
        if not violation_types:
            violation_types.append("procedural")
        
        denial_details = {
            "frn": frn,
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
        
        print(f"    Denial Details Keys: {list(denial_details.keys())}")
        
        # 3. Generate strategy
        print("\n[3] Generating strategy with AppealsStrategy")
        strategy = appeals_strategy.generate_strategy(denial_details)
        print(f"    Strategy Keys: {list(strategy.keys())}")
        
        # 4. Generate appeal letter - CURRENT SKYRATE STYLE (verbose)
        print("\n[4] Generating appeal letter with deep_analysis (Current SkyRate style)")
        
        org_name = denial_details.get("organization_name", "the applicant")
        app_number = denial_details.get("application_number", "")
        funding_year = denial_details.get("funding_year", "Unknown")
        amount = denial_details.get("total_denied_amount", 0)
        usac_context = denial_details.get("usac_context", {})
        
        # Current approach: VERBOSE data context
        data_context = f"""
DENIED APPLICATION DETAILS:
- Organization: {org_name}
- Application Number: {app_number}
- Funding Request Number (FRN): {frn}
- Funding Year: {funding_year}
- Amount Denied: ${amount:,.2f}
- Service Type: {denial_details.get("service_type", "E-Rate services")}
- Service Description: {denial_details.get("service_description", "E-Rate eligible services")}

FCDL DENIAL COMMENT:
{fcdl_comment or "No specific denial comment provided"}

DENIAL REASONS IDENTIFIED:
{json.dumps(denial_details.get("denial_reasons", []), indent=2)}

VIOLATION TYPES:
{', '.join(violation_types)}

STRATEGY ANALYSIS:
{json.dumps(strategy, indent=2, default=str)}

ADDITIONAL USAC DATA:
{json.dumps(usac_context, indent=2)}
"""

        # Current approach: VERBOSE prompt
        appeal_prompt = f"""Generate a formal, professional E-Rate appeal letter for the following denied application.

REQUIREMENTS:
1. Address the letter to USAC Appeals Committee
2. Include proper formatting with clear sections (Introduction, Background, Grounds for Appeal, Supporting Documentation, Conclusion)
3. Reference specific FCC rules and regulations (47 C.F.R. § 54.xxx)
4. Address EACH denial reason with specific counter-arguments
5. Request specific relief (reversal of denial and approval of funding)
6. Use professional, legal language appropriate for administrative appeals
7. Include placeholders for dates and signatures
8. The letter should be comprehensive (at least 1000 words) and ready to submit

IMPORTANT:
- Be specific to the denial reasons mentioned
- Cite relevant FCC precedents where applicable
- Argue both procedural compliance and substantive eligibility
- If competitive bidding violations, address the 28-day posting requirement
- If documentation issues, address the applicant's good faith compliance
- Include a section listing supporting documentation to attach

Write a professional appeal letter that addresses each denial reason and argues persuasively for reconsideration."""

        print(f"\n    Prompt length: {len(appeal_prompt)} chars")
        print(f"    Data context length: {len(data_context)} chars")
        print(f"    TOTAL to AI: {len(appeal_prompt) + len(data_context)} chars")
        
        appeal_text = ai_manager.deep_analysis(data_context, appeal_prompt)
        
        print(f"\n    Appeal letter length: {len(appeal_text)} chars")
        print(f"    First 500 chars of appeal:\n{'-'*40}")
        print(appeal_text[:500])
        print(f"{'-'*40}")
        
        return {
            "success": True,
            "approach": "current_skyrate",
            "frn": frn,
            "denial_details": denial_details,
            "strategy": strategy,
            "appeal_letter": appeal_text,
            "appeal_length": len(appeal_text),
            "prompt_length": len(appeal_prompt),
            "data_context_length": len(data_context),
        }
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "approach": "current_skyrate"}


def compare_results(opendata_result: dict, current_result: dict):
    """Compare the two approach results."""
    print("\n" + "="*80)
    print("COMPARISON SUMMARY")
    print("="*80)
    
    print("\n### OpenData Approach ###")
    if "error" in opendata_result:
        print(f"  ERROR: {opendata_result['error']}")
    else:
        print(f"  Appeal Length: {opendata_result.get('appeal_length', 0)} chars")
        print(f"  Prompt Length: {opendata_result.get('prompt_length', 0)} chars")
        
    print("\n### Current SkyRate Approach ###")
    if "error" in current_result:
        print(f"  ERROR: {current_result['error']}")
    else:
        print(f"  Appeal Length: {current_result.get('appeal_length', 0)} chars")
        print(f"  Prompt Length: {current_result.get('prompt_length', 0)} chars")
        print(f"  Data Context Length: {current_result.get('data_context_length', 0)} chars")
    
    # Check for stub responses
    print("\n### Quality Analysis ###")
    
    opendata_appeal = opendata_result.get("appeal_letter", "")
    current_appeal = current_result.get("appeal_letter", "")
    
    def is_stub_response(text):
        stub_markers = ["unavailable", "api not configured", "please configure api key", "stub", "placeholder"]
        text_lower = text.lower()
        return any(marker in text_lower for marker in stub_markers)
    
    def has_appeal_structure(text):
        structure_markers = ["dear", "appeal", "denial", "usac", "funding", "sincerely", "respectfully"]
        text_lower = text.lower()
        return sum(1 for marker in structure_markers if marker in text_lower)
    
    print(f"\n  OpenData Response:")
    print(f"    Is Stub: {is_stub_response(opendata_appeal)}")
    print(f"    Structure Score: {has_appeal_structure(opendata_appeal)}/7 markers found")
    print(f"    Length Adequate: {len(opendata_appeal) > 500}")
    
    print(f"\n  Current SkyRate Response:")
    print(f"    Is Stub: {is_stub_response(current_appeal)}")
    print(f"    Structure Score: {has_appeal_structure(current_appeal)}/7 markers found")
    print(f"    Length Adequate: {len(current_appeal) > 500}")
    
    # Save full results to file
    output = {
        "opendata_approach": opendata_result,
        "current_skyrate_approach": current_result,
    }
    
    with open("test_appeal_comparison_results.json", "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"\n  Full results saved to: test_appeal_comparison_results.json")


def main():
    """Main test function."""
    # Test with a known denied FRN
    # You can change this to any denied FRN you want to test
    TEST_FRN = "2499004159"  # Example denied FRN
    
    print(f"\nTesting appeal generation for FRN: {TEST_FRN}")
    print(f"Environment check:")
    print(f"  ANTHROPIC_API_KEY: {'SET' if os.environ.get('ANTHROPIC_API_KEY') else 'NOT SET'}")
    print(f"  GEMINI_API_KEY: {'SET' if os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') else 'NOT SET'}")
    print(f"  DEEPSEEK_API_KEY: {'SET' if os.environ.get('DEEPSEEK_API_KEY') else 'NOT SET'}")
    
    # Run both approaches
    opendata_result = test_opendata_approach(TEST_FRN)
    current_result = test_current_approach(TEST_FRN)
    
    # Compare results
    compare_results(opendata_result, current_result)


if __name__ == "__main__":
    main()
