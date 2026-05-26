"""
Control Tests for the Compliance Rule Engine.

Defines 3 negative controls (compliant — should fire NO rules or specific subset)
and 3 positive controls (non-compliant — should fire specific rules).

Usage:
    python -m scripts.validation.control_tests

Exits 0 if all 6 controls pass, 1 otherwise.
"""

import os
import sys
from pathlib import Path

# Ensure backend is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.services.compliance.rules import run_all_rules


# ==================== CONTROL DEFINITIONS ====================

CONTROLS = [
    # --- NEGATIVE CONTROLS (compliant — should trigger NO findings) ---
    {
        "name": "NEG-01: Fully compliant RFP with eval criteria and or-equivalent",
        "expected_findings": [],
        "narrative": (
            "Form 470 Application - Funding Year 2026\n"
            "Posted: January 5, 2026\n"
            "Filing Form 471 after: February 5, 2026 (28-day window satisfied)\n\n"
            "SERVICE DESCRIPTION:\n"
            "The district seeks Category 1 Internet Access services and Wide Area "
            "Network (WAN) transport for 12 school buildings.\n\n"
            "SPECIFICATIONS:\n"
            "- Enterprise-grade managed switches with 48 ports and PoE+, "
            "Cisco or equivalent models acceptable.\n"
            "- Firewall appliances: Fortinet or equivalent next-generation firewalls "
            "with SSL inspection and threat prevention.\n"
            "- Minimum 1Gbps dedicated Internet access at the main hub.\n\n"
            "EVALUATION CRITERIA:\n"
            "Proposals will be evaluated using the following weighted factors:\n"
            "1. Price - 60% (most heavily weighted factor)\n"
            "2. Technical approach and network design - 25%\n"
            "3. Vendor qualifications and references - 10%\n"
            "4. Implementation timeline - 5%\n\n"
            "Cost allocation: 100% of services requested are eligible for E-Rate "
            "discount. No ineligible components are included in this request."
        ),
        "metadata": {
            "filename": "control_neg01.pdf",
            "form_nickname": "SUNNYDALE UNIFIED SCHOOL DISTRICT FY 2026 C1",
        },
    },
    {
        "name": "NEG-02: Category 2 internal connections with proper timeline",
        "expected_findings": [],
        "narrative": (
            "Form 470 Application Number 260099887 - Funding Year 2026\n"
            "Date Posted: December 15, 2025\n"
            "28-Day Competitive Bidding Window: December 15, 2025 through January 14, 2026\n"
            "Form 471 Filing: After January 14, 2026\n\n"
            "CATEGORY 2 - Internal Connections\n"
            "Service Type: Internal Connections\n\n"
            "The district requires wireless access points (Wi-Fi 6E or newer), "
            "network switches (Layer 2/3 managed), and structured cabling for 8 buildings.\n\n"
            "All brand-name references are illustrative only. Aruba or equivalent, "
            "Meraki or equivalent, or any functionally equivalent product will be accepted.\n\n"
            "EVALUATION FACTORS:\n"
            "- Price: 51% (most heavily weighted)\n"
            "- Prior experience with similar school installations: 20%\n"
            "- Quality of proposed solution: 20%\n"
            "- Project timeline and availability: 9%\n\n"
            "COST ALLOCATION:\n"
            "All requested components are 100% eligible for E-Rate Category 2 funding. "
            "No ineligible costs are bundled with this request."
        ),
        "metadata": {
            "filename": "control_neg02.pdf",
            "form_nickname": "RIVERSIDE CHARTER SCHOOL OF TECHNOLOGY FY 2026 C2",
        },
    },
    {
        "name": "NEG-03: ISP services with price-weighted evaluation",
        "expected_findings": [],
        "narrative": (
            "Form 470 - Funding Year 2026\n"
            "Posted Date: February 1, 2026\n"
            "The 28-day competitive bidding period will be fully observed before "
            "Form 471 filing. Earliest filing date: March 3, 2026.\n\n"
            "SERVICES REQUESTED:\n"
            "Category 1 - Internet Access\n"
            "- 10Gbps dedicated fiber Internet connection at main campus\n"
            "- 1Gbps connections at 4 satellite campuses\n"
            "- Redundant path with automatic failover\n\n"
            "All qualified Internet service providers are encouraged to bid. "
            "No specific carrier is required.\n\n"
            "EVALUATION CRITERIA (per FCC requirements, price weighted highest):\n"
            "1. Cost: 55% (most heavily weighted factor)\n"
            "2. Network reliability and SLA guarantees - 20%\n"
            "3. Installation timeline - 15%\n"
            "4. Vendor experience with E-Rate program - 10%\n\n"
            "All costs in this request are 100% eligible for E-Rate discount."
        ),
        "metadata": {
            "filename": "control_neg03.pdf",
            "form_nickname": "GREENFIELD PUBLIC SCHOOLS FY 2026 C1",
        },
    },
    # --- POSITIVE CONTROLS (non-compliant — should trigger specific rules) ---
    {
        "name": "POS-01: Brand names without or-equivalent (RULE-003)",
        "expected_findings": ["RULE-003"],
        "narrative": (
            "Form 470 Application - Funding Year 2026\n"
            "Posted: 01/10/2026. Filing 471 after: 02/10/2026.\n\n"
            "SERVICE DESCRIPTION:\n"
            "Category 2 Internal Connections for 6 school buildings.\n\n"
            "REQUIRED EQUIPMENT:\n"
            "- Cisco Catalyst 9300 switches in every MDF/IDF closet\n"
            "- Meraki MR46 wireless access points in all classrooms\n"
            "- Palo Alto PA-5250 firewall at the data center\n\n"
            "These specific models are required for compatibility with our "
            "existing Cisco DNA Center management platform.\n\n"
            "EVALUATION CRITERIA:\n"
            "1. Price: 60% (most heavily weighted factor)\n"
            "2. Technical compatibility - 25%\n"
            "3. Installation speed - 15%\n\n"
            "Cost allocation: 100% eligible for E-Rate."
        ),
        "metadata": {
            "filename": "control_pos01.pdf",
            "form_nickname": "NORTHSIDE ACADEMY FY 2026 C2",
        },
    },
    {
        "name": "POS-02: No evaluation criteria at all (RULE-004)",
        "expected_findings": ["RULE-004"],
        "narrative": (
            "Form 470 - Funding Year 2026\n"
            "Posted: 03/01/2026. Filing 471 after: 03/30/2026.\n\n"
            "REQUEST FOR PROPOSAL\n\n"
            "SERVICES REQUESTED:\n"
            "Category 1 - Internet Access and Transport\n"
            "- 1Gbps dedicated Internet at 10 locations\n"
            "- Dark fiber WAN connecting all sites\n\n"
            "All qualified service providers are invited to submit proposals. "
            "No brand preference; any provider meeting technical requirements "
            "or equivalent will be considered.\n\n"
            "Please submit your best pricing and proposed solution by the "
            "deadline. The district will select the vendor that best meets "
            "our needs.\n\n"
            "Cost allocation: 100% eligible for E-Rate category 1 discount."
        ),
        "metadata": {
            "filename": "control_pos02.pdf",
            "form_nickname": "LAKEWOOD SCHOOL DISTRICT FY 2026 C1",
        },
    },
    {
        "name": "POS-03: Vague specs + brand lock-in + no eval (RULE-003, RULE-004)",
        "expected_findings": ["RULE-003", "RULE-004"],
        "narrative": (
            "Request for Proposal - Form 470 for FY2026\n"
            "Posted 01/20/2026. Filing after 02/18/2026.\n\n"
            "We need technology upgrades across the district. Specifically:\n"
            "- Comcast Business Internet at all 8 sites\n"
            "- SonicWall firewalls for network security\n"
            "- Ruckus wireless access points in every building\n\n"
            "Our current infrastructure is built on these platforms and we "
            "need to maintain compatibility. Only these vendors can integrate "
            "with our existing management systems.\n\n"
            "Vendors should submit proposals with their best pricing. "
            "We will choose the most suitable option.\n\n"
            "Budget: $450,000 over 3 years. All eligible for E-Rate funding."
        ),
        "metadata": {
            "filename": "control_pos03.pdf",
            "form_nickname": "WESTFIELD MAGNET SCHOOL OF ARTS FY 2026 C1",
        },
    },
]


# ==================== EXECUTION ====================

def run_single_control(control: dict) -> dict:
    """Run a single control and compare findings to expected."""
    name = control["name"]
    expected = set(control["expected_findings"])
    narrative = control["narrative"]
    metadata = control["metadata"]

    try:
        findings = run_all_rules(narrative, metadata)
    except Exception as e:
        return {
            "name": name,
            "passed": False,
            "expected": sorted(expected),
            "actual": [],
            "error": str(e),
        }

    # Extract rule IDs from findings
    actual_ids = set(f.rule_id for f in findings)

    # For negative controls: NO rules should fire
    # For positive controls: expected rules MUST fire (extras OK)
    if not expected:
        passed = len(actual_ids) == 0
    else:
        passed = expected.issubset(actual_ids)

    return {
        "name": name,
        "passed": passed,
        "expected": sorted(expected),
        "actual": sorted(actual_ids),
        "error": None,
    }


def run_all_controls() -> list[dict]:
    """Run all 6 controls sequentially."""
    results = []
    for control in CONTROLS:
        result = run_single_control(control)
        results.append(result)
    return results


def print_matrix(results: list[dict]) -> None:
    """Print a clean pass/fail matrix table."""
    print("\n" + "=" * 78)
    print("  COMPLIANCE CONTROL TEST MATRIX")
    print("=" * 78)
    print(f"{'#':<4} {'Control Name':<55} {'Result':<8} {'Details'}")
    print("-" * 78)

    for i, r in enumerate(results, 1):
        status = "PASS" if r["passed"] else "FAIL"
        if r["error"]:
            details = f"ERROR: {r['error'][:30]}"
        elif not r["passed"]:
            details = f"expected={r['expected']} actual={r['actual']}"
        else:
            details = f"fired={r['actual']}" if r["actual"] else "clean"
        print(f"{i:<4} {r['name'][:55]:<55} {status:<8} {details}")

    print("-" * 78)
    total_pass = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"  TOTAL: {total_pass}/{total} passed")
    if total_pass == total:
        print("  STATUS: ALL CONTROLS PASSED")
    else:
        print("  STATUS: FAILURES DETECTED")
    print("=" * 78 + "\n")


def main():
    results = run_all_controls()
    print_matrix(results)

    all_passed = all(r["passed"] for r in results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
