"""
Regression tests for the compliance deterministic rule engine.
Phase 2: 100+ expert-labeled test cases covering all 5 rules.
Uses pytest parametrize for compact representation.
"""

import pytest

from app.services.compliance.rules import run_all_rules
from app.services.compliance.rules.rule_28_day_window import check as check_28_day
from app.services.compliance.rules.rule_service_types import check as check_service_types
from app.services.compliance.rules.rule_or_equivalent import check as check_or_equivalent
from app.services.compliance.rules.rule_evaluation_factors import check as check_eval_factors
from app.services.compliance.rules.rule_cost_allocation import check as check_cost_allocation


# ==================== FIXTURES ====================

@pytest.fixture
def metadata():
    return {"filename": "test_form470.pdf"}


# ==================== RULE-001: 28-Day Window ====================

# Positive cases: rule should fire (non-compliance detected)
RULE_001_POSITIVE = [
    pytest.param(
        "Form 470 posted on 03/01/2026. We plan to file Form 471 on 03/20/2026 to meet the district timeline.",
        "High", "19 days short of 28-day window",
        id="r001-pos-19-days"
    ),
    pytest.param(
        "Posted date: 01/10/2026. Filing date: 02/05/2026. Internet access for 10 schools.",
        "High", "26 days between dates",
        id="r001-pos-26-days"
    ),
    pytest.param(
        "Form 470 was submitted on 04/01/2026. Form 471 filing scheduled for 04/15/2026.",
        "High", "14 days only",
        id="r001-pos-14-days"
    ),
    pytest.param(
        "USAC posting date 02/01/2026. The earliest contract date is 02/20/2026.",
        "High", "19 days earliest contract",
        id="r001-pos-earliest-contract"
    ),
    pytest.param(
        "Posted on 05/15/2026, filing by 06/10/2026 per board schedule. Category 1 services.",
        "High", "day 26 boundary miss",
        id="r001-pos-day-26"
    ),
    pytest.param(
        "Form 470 filed on 03/05/2026. Submitted Form 471 on 03/31/2026. Total 26 calendar days.",
        "High", "explicit 26-day gap",
        id="r001-pos-explicit-26"
    ),
    pytest.param(
        "Form 470 posted 01/02/2026. 471 filed 01/29/2026. WAN services requested.",
        "High", "day 27 boundary - exactly one day short",
        id="r001-pos-day-27-boundary"
    ),
    pytest.param(
        "Posting: 07/01/2026. Filing: 07/08/2026. Need broadband quickly for new wing.",
        "High", "only 7 days",
        id="r001-pos-7-days"
    ),
    pytest.param(
        "Our Form 470 requests internet service for the district. We have 5,000 students "
        "across 12 buildings and need to improve our broadband infrastructure.",
        "Medium", "no dates and no window mention",
        id="r001-pos-no-dates-no-mention"
    ),
    pytest.param(
        "This Form 470 is for Funding Year 2026. The district seeks fiber connectivity "
        "at all 8 locations. Budget approved by board on January 5, 2026.",
        "Medium", "form 470 context but no window dates",
        id="r001-pos-form470-no-window"
    ),
    pytest.param(
        "Form 470 application number 260001234. Submitted 02/15/2026, "
        "filing 471 on 03/10/2026 to align with state budget cycle.",
        "High", "23 days gap",
        id="r001-pos-23-days"
    ),
    pytest.param(
        "Filed Form 470 on 11/01/2025. Plan to submit 471 on 11/25/2025 before Thanksgiving.",
        "High", "24 days holiday rush",
        id="r001-pos-24-days-holiday"
    ),
]

# Negative cases: rule should NOT fire (document is compliant)
RULE_001_NEGATIVE = [
    pytest.param(
        "Form 470 posted on 01/15/2026. The 28-day waiting period will be fully observed. "
        "Form 471 will be filed after 02/15/2026.",
        "pass", "28-day mentioned and dates comply",
        id="r001-neg-compliant-dates"
    ),
    pytest.param(
        "The 28-day competitive bidding window has been satisfied. Bids were evaluated "
        "over a 35-day period to allow maximum vendor participation.",
        "pass", "explicit 28-day confirmation",
        id="r001-neg-window-mentioned"
    ),
    pytest.param(
        "Form 470 posted 01/01/2026. Filing Form 471 on 02/01/2026. Internet access "
        "for 5 campuses.",
        "pass", "exactly 31 days",
        id="r001-neg-31-days"
    ),
    pytest.param(
        "Posted: 03/01/2026. Filed: 04/10/2026. The waiting period of 28 days exceeded.",
        "pass", "40 days gap with mention",
        id="r001-neg-40-days"
    ),
    pytest.param(
        "This is a budget proposal for school construction. Roof repairs "
        "and HVAC upgrades are the priority items for the coming year.",
        "pass", "not a Form 470 document",
        id="r001-neg-not-form470"
    ),
    pytest.param(
        "Competitive bidding posting period requirements met. USAC has confirmed the "
        "form was posted for the required duration. Services include broadband.",
        "pass", "posting period confirmed",
        id="r001-neg-posting-confirmed"
    ),
    pytest.param(
        "The twenty-eight day waiting period was observed per FCC rules before proceeding.",
        "pass", "spelled out twenty-eight",
        id="r001-neg-spelled-out"
    ),
    pytest.param(
        "This grant application covers math textbooks and lab equipment for grades 6-8. "
        "No technology or telecommunications services are requested.",
        "pass", "completely unrelated doc",
        id="r001-neg-unrelated"
    ),
]


class TestRule28DayWindow:
    """Tests for the 28-day competitive bidding window rule."""

    @pytest.mark.parametrize("text,expected_severity,desc", RULE_001_POSITIVE)
    def test_positive(self, metadata, text, expected_severity, desc):
        """Rule should fire with expected severity."""
        result = check_28_day(text, metadata)
        assert result is not None, f"Rule should fire: {desc}"
        assert result.rule_id == "RULE-001"
        assert result.severity.value == expected_severity

    @pytest.mark.parametrize("text,expected,desc", RULE_001_NEGATIVE)
    def test_negative(self, metadata, text, expected, desc):
        """Rule should NOT fire on compliant text."""
        result = check_28_day(text, metadata)
        assert result is None, f"Rule should not fire: {desc}"


# ==================== RULE-002: Service Types ====================

RULE_002_POSITIVE = [
    pytest.param(
        "Our school district is filing this form to obtain funding for various "
        "technology needs. We have 5,000 students across 12 buildings.",
        "High", "no service keywords",
        id="r002-pos-generic-tech"
    ),
    pytest.param(
        "This request is for professional development training for our IT staff "
        "and curriculum software licenses.",
        "High", "non-eligible services only",
        id="r002-pos-pd-training"
    ),
    pytest.param(
        "The district needs new computers, laptops, and tablets for student use "
        "in the classroom. Budget: $500,000.",
        "High", "end-user devices not eligible",
        id="r002-pos-devices"
    ),
    pytest.param(
        "We are seeking proposals for our annual technology plan including "
        "assessment tools, learning management systems, and digital content.",
        "High", "ed-tech software not eligible",
        id="r002-pos-edtech"
    ),
    pytest.param(
        "Applicant seeks qualified vendors for building security upgrades "
        "including door access controls, cameras, and alarm systems.",
        "High", "physical security not eligible",
        id="r002-pos-security"
    ),
    pytest.param(
        "District RFP for managed print services across 20 locations. "
        "Seeking bids for copier leases and printer maintenance contracts.",
        "High", "print services not eligible",
        id="r002-pos-print"
    ),
    pytest.param(
        "Technology consulting services needed. The district requires a "
        "network assessment and strategic planning engagement.",
        "High", "consulting not eligible service",
        id="r002-pos-consulting"
    ),
    pytest.param(
        "Our library system seeks proposals for an integrated library system "
        "(ILS) and digital media catalog management platform.",
        "High", "library software not eligible",
        id="r002-pos-library-sw"
    ),
    pytest.param(
        "Bond measure funds will support the renovation of school facilities "
        "including HVAC upgrades and roof repairs.",
        "High", "facilities not E-Rate",
        id="r002-pos-facilities"
    ),
    pytest.param(
        "RFP for student information system implementation. Must integrate with "
        "PowerSchool and support 15,000 student records.",
        "High", "SIS not eligible",
        id="r002-pos-sis"
    ),
    pytest.param(
        "We need to upgrade our phone system. Looking for a complete PBX replacement.",
        "High", "voice not eligible post-FY2020",
        id="r002-pos-phone-only"
    ),
    pytest.param(
        "The school board has approved funding for ergonomic furniture "
        "and standing desks in all administrative offices.",
        "High", "furniture not eligible",
        id="r002-pos-furniture"
    ),
]

RULE_002_NEGATIVE = [
    pytest.param(
        "The district requests internet access and data transmission services "
        "for all school buildings at 1 Gbps fiber.",
        "pass", "clear cat1",
        id="r002-neg-internet-access"
    ),
    pytest.param(
        "This Form 470 is for internal connections including wireless access "
        "points, network switches, and structured cabling.",
        "pass", "clear cat2",
        id="r002-neg-internal-connections"
    ),
    pytest.param(
        "Category 1 services requested: broadband connectivity via fiber optic "
        "transport at 10 Gbps per building.",
        "pass", "explicit category mention",
        id="r002-neg-category-explicit"
    ),
    pytest.param(
        "We need WAN connectivity between our 8 sites. Looking for MPLS or "
        "SD-WAN solutions with minimum 500 Mbps per site.",
        "pass", "WAN synonym for data transmission",
        id="r002-neg-wan"
    ),
    pytest.param(
        "This request covers managed internal broadband services (MIBS) for "
        "our network infrastructure across 12 buildings.",
        "pass", "MIBS explicit",
        id="r002-neg-mibs"
    ),
    pytest.param(
        "The district needs dark fiber between the main office and 3 remote sites, "
        "plus lit fiber to 5 elementary schools.",
        "pass", "dark/lit fiber",
        id="r002-neg-dark-fiber"
    ),
    pytest.param(
        "C2 budget request for Wi-Fi 6E access points and network switching "
        "equipment across all instructional spaces.",
        "pass", "C2 abbreviation + wifi keywords",
        id="r002-neg-c2-wifi"
    ),
    pytest.param(
        "Wide area network services and ISP connectivity for the consortium "
        "of 4 school districts.",
        "pass", "wide area network spelled out",
        id="r002-neg-wide-area-network"
    ),
]


class TestRuleServiceTypes:
    """Tests for service type identification rule."""

    @pytest.mark.parametrize("text,expected_severity,desc", RULE_002_POSITIVE)
    def test_positive(self, metadata, text, expected_severity, desc):
        """Rule should fire - no eligible service detected."""
        result = check_service_types(text, metadata)
        assert result is not None, f"Rule should fire: {desc}"
        assert result.rule_id == "RULE-002"
        assert result.severity.value == expected_severity

    @pytest.mark.parametrize("text,expected,desc", RULE_002_NEGATIVE)
    def test_negative(self, metadata, text, expected, desc):
        """Rule should NOT fire - valid services identified."""
        result = check_service_types(text, metadata)
        assert result is None, f"Rule should not fire: {desc}"


# ==================== RULE-003: Or Equivalent ====================

RULE_003_POSITIVE = [
    pytest.param(
        "We require Cisco Catalyst 9300 switches for all MDF/IDF closets. "
        "Ruckus R750 access points in every classroom.",
        "High", "two brands no equivalent",
        id="r003-pos-two-brands"
    ),
    pytest.param(
        "The network design specifies Fortinet FortiGate 60F firewalls at "
        "each building. Non-negotiable for security compliance.",
        "High", "single brand emphatic",
        id="r003-pos-fortinet-only"
    ),
    pytest.param(
        "All classrooms must have Ubiquiti UniFi access points installed. "
        "The controller will be a Ubiquiti Dream Machine Pro.",
        "High", "ubiquiti double mention",
        id="r003-pos-ubiquiti"
    ),
    pytest.param(
        "We need Palo Alto PA-3260 next-gen firewalls with Threat Prevention "
        "and WildFire licenses.",
        "High", "palo alto specific model",
        id="r003-pos-palo-alto"
    ),
    pytest.param(
        "The WAN solution must use Comcast Business Internet at each site. "
        "No other provider can meet our SLA requirements.",
        "High", "ISP brand no alternative",
        id="r003-pos-isp-brand"
    ),
    pytest.param(
        "Deploy Aruba Instant On switches and APs throughout the campus. "
        "Centralized management via Aruba Central required.",
        "High", "aruba products no equivalent",
        id="r003-pos-aruba"
    ),
    pytest.param(
        "The district requires Juniper EX4300 switches for the core network "
        "and Juniper SRX345 for perimeter security.",
        "High", "juniper product line",
        id="r003-pos-juniper"
    ),
    pytest.param(
        "Our standard is Dell PowerSwitch S5248F-ON in every closet. "
        "Compatibility with existing Dell infrastructure required.",
        "High", "dell lock-in language",
        id="r003-pos-dell"
    ),
    pytest.param(
        "SonicWall TZ570 will be deployed at all 6 sites. Currently running "
        "SonicWall and need to maintain license continuity.",
        "High", "sonicwall continuity excuse",
        id="r003-pos-sonicwall"
    ),
    pytest.param(
        "Verizon Fios Business will provide 1Gbps symmetric internet to each "
        "of our 4 locations under a 3-year contract.",
        "High", "verizon brand ISP",
        id="r003-pos-verizon"
    ),
    pytest.param(
        "The Meraki MR46 access points and MS390 switches form the basis of "
        "our network refresh project.",
        "High", "meraki specific models",
        id="r003-pos-meraki-models"
    ),
    pytest.param(
        "Need Extreme Networks X465 core switches compatible with our existing "
        "ExtremeCloud IQ management platform.",
        "High", "extreme networks",
        id="r003-pos-extreme"
    ),
]

RULE_003_NEGATIVE = [
    pytest.param(
        "Cisco Meraki or equivalent wireless access points capable of Wi-Fi 6. "
        "Aruba or equivalent controllers acceptable.",
        "pass", "proper or-equivalent language",
        id="r003-neg-or-equivalent"
    ),
    pytest.param(
        "Enterprise-grade managed switches with 48 ports, PoE+, 10G uplinks. "
        "No specific brand required.",
        "pass", "functional spec no brands",
        id="r003-neg-functional-spec"
    ),
    pytest.param(
        "Firewalls with next-gen threat prevention, SSL inspection, and "
        "cloud-based management. Fortinet or equal products accepted.",
        "pass", "or equal language",
        id="r003-neg-or-equal"
    ),
    pytest.param(
        "We need Layer 3 switches supporting BGP, OSPF, and VXLAN. Must have "
        "at least 48 1GbE ports with 4x 10G SFP+ uplinks.",
        "pass", "pure technical requirements",
        id="r003-neg-pure-technical"
    ),
    pytest.param(
        "Ubiquiti or comparable wireless infrastructure with cloud management "
        "and minimum 4x4 MU-MIMO.",
        "pass", "or comparable language",
        id="r003-neg-or-comparable"
    ),
    pytest.param(
        "Internet connectivity at 10Gbps dedicated. Seeking proposals from all "
        "qualified service providers in the region.",
        "pass", "no brand ISP generic",
        id="r003-neg-generic-isp"
    ),
    pytest.param(
        "Juniper or functionally equivalent routing and switching platform. "
        "Must support EVPN-VXLAN fabric architecture.",
        "pass", "or functionally equivalent",
        id="r003-neg-functionally-equivalent"
    ),
    pytest.param(
        "Wireless access points supporting Wi-Fi 6E (802.11ax), cloud-managed, "
        "with integrated IoT radio. Examples include Cisco, Aruba, or similar.",
        "pass", "or similar at end",
        id="r003-neg-or-similar"
    ),
]


class TestRuleOrEquivalent:
    """Tests for brand name 'or equivalent' requirement."""

    @pytest.mark.parametrize("text,expected_severity,desc", RULE_003_POSITIVE)
    def test_positive(self, metadata, text, expected_severity, desc):
        """Rule should fire - brand without equivalent language."""
        result = check_or_equivalent(text, metadata)
        assert result is not None, f"Rule should fire: {desc}"
        assert result.rule_id == "RULE-003"
        assert result.severity.value == expected_severity

    @pytest.mark.parametrize("text,expected,desc", RULE_003_NEGATIVE)
    def test_negative(self, metadata, text, expected, desc):
        """Rule should NOT fire - equivalent language present or no brands."""
        result = check_or_equivalent(text, metadata)
        assert result is None, f"Rule should not fire: {desc}"


# ==================== RULE-004: Evaluation Factors ====================

RULE_004_POSITIVE = [
    pytest.param(
        "Proposals will be evaluated using the following criteria: "
        "Technical approach (40%), Vendor qualifications (35%), "
        "Project timeline (25%).",
        "High", "eval criteria no price at all",
        id="r004-pos-no-price"
    ),
    pytest.param(
        "Evaluation Criteria: vendor experience (50%), implementation plan (30%), "
        "references (20%). Best qualified vendor will be selected.",
        "High", "weighted criteria without price",
        id="r004-pos-weighted-no-price"
    ),
    pytest.param(
        "Selection factors include: technical capabilities (45%), local presence (30%), "
        "and support response time (25%).",
        "High", "selection factors no price",
        id="r004-pos-selection-no-price"
    ),
    pytest.param(
        "Award criteria: reliability (40%), scalability (35%), "
        "customer support quality (25%).",
        "High", "award criteria no price",
        id="r004-pos-award-no-price"
    ),
    pytest.param(
        "Scoring rubric: technical merit 50 points, past performance 30 points, "
        "management approach 20 points. Total 100 points.",
        "High", "point scoring no price",
        id="r004-pos-points-no-price"
    ),
    pytest.param(
        "The scoring criteria for this evaluation process include: "
        "technical merit, vendor experience, implementation timeline, "
        "and price. Each factor will be considered.",
        "Medium", "price mentioned but not primary",
        id="r004-pos-price-not-primary"
    ),
    pytest.param(
        "Evaluation factors (equal weight): price, technical qualifications, "
        "past performance, management approach.",
        "Medium", "price equal weight not primary",
        id="r004-pos-equal-weight"
    ),
    pytest.param(
        "Bid evaluation methodology: 1) Technical solution (35%), "
        "2) Price (25%), 3) Vendor stability (20%), 4) References (20%).",
        "Medium", "price listed but at 25% not primary",
        id="r004-pos-price-25-pct"
    ),
    pytest.param(
        "Proposals will be evaluated on: quality of service proposed, vendor "
        "reputation, cost considerations, and local support capability.",
        "Medium", "cost mentioned informally not primary",
        id="r004-pos-cost-informal"
    ),
    pytest.param(
        "Bid evaluation methodology: technical fit (40%), price (20%), "
        "vendor reputation (25%), support coverage (15%).",
        "Medium", "price secondary at 20%",
        id="r004-pos-price-secondary"
    ),
    pytest.param(
        "Evaluation process: vendor demos (40%), pricing (20%), "
        "references (20%), SLA terms (20%).",
        "Medium", "pricing at 20% not primary",
        id="r004-pos-pricing-20-pct"
    ),
    pytest.param(
        "Bid scoring methodology: experience and references are weighted "
        "highest, followed by cost and implementation approach.",
        "Medium", "cost not primary explicitly",
        id="r004-pos-cost-not-primary"
    ),
]

RULE_004_NEGATIVE = [
    pytest.param(
        "Evaluation Criteria: Price of eligible products and services is the "
        "most heavily weighted factor (55%). Technical 25%. References 20%.",
        "pass", "price explicitly primary at 55%",
        id="r004-neg-price-55-pct"
    ),
    pytest.param(
        "Price is the primary evaluation factor. Other criteria include "
        "vendor experience and technical approach.",
        "pass", "price stated as primary",
        id="r004-neg-price-primary-stated"
    ),
    pytest.param(
        "Scoring: Cost - 60%, Technical Merit - 25%, Past Performance - 15%. "
        "Cost is the most heavily weighted criterion.",
        "pass", "cost 60% most heavily weighted",
        id="r004-neg-cost-60-pct"
    ),
    pytest.param(
        "The evaluation process weighs price as the greatest weight among all "
        "factors per FCC competitive bidding requirements.",
        "pass", "greatest weight language",
        id="r004-neg-greatest-weight"
    ),
    pytest.param(
        "This is a simple internet access request for broadband service. "
        "The district just needs dedicated fiber at 1Gbps to each site.",
        "pass", "no eval section at all",
        id="r004-neg-no-eval-section"
    ),
    pytest.param(
        "Price of eligible services: 50%. Technical capabilities: 30%. "
        "Vendor qualifications: 20%. Price has the highest weight.",
        "pass", "price highest at 50%",
        id="r004-neg-price-50-pct"
    ),
    pytest.param(
        "Cost: 70%. Implementation timeline: 20%. Vendor references: 10%. "
        "Proposals are ranked primarily by total cost of ownership.",
        "pass", "cost 70% clearly primary",
        id="r004-neg-cost-70-pct"
    ),
    pytest.param(
        "Purchasing decisions based on best value with price being the most "
        "heavily weighted factor as required by E-Rate rules.",
        "pass", "most heavily weighted explicit",
        id="r004-neg-most-heavily-weighted"
    ),
]


class TestRuleEvaluationFactors:
    """Tests for price as primary evaluation factor."""

    @pytest.mark.parametrize("text,expected_severity,desc", RULE_004_POSITIVE)
    def test_positive(self, metadata, text, expected_severity, desc):
        """Rule should fire - price not clearly primary."""
        result = check_eval_factors(text, metadata)
        assert result is not None, f"Rule should fire: {desc}"
        assert result.rule_id == "RULE-004"
        assert result.severity.value == expected_severity

    @pytest.mark.parametrize("text,expected,desc", RULE_004_NEGATIVE)
    def test_negative(self, metadata, text, expected, desc):
        """Rule should NOT fire - price is primary or no eval section."""
        result = check_eval_factors(text, metadata)
        assert result is None, f"Rule should not fire: {desc}"


# ==================== RULE-005: Cost Allocation ====================

RULE_005_POSITIVE = [
    pytest.param(
        "Our bundled service package provides internet and telephone on the "
        "same fiber. Monthly cost $5,000 for combined voice and data.",
        "High", "bundled voice+data no allocation",
        id="r005-pos-bundled-voice-data"
    ),
    pytest.param(
        "The package includes both eligible internet access and ineligible "
        "voice service components in a single monthly fee.",
        "High", "explicitly mixed bundle",
        id="r005-pos-explicit-bundle"
    ),
    pytest.param(
        "Combined service offering: data + hosted voice for $3,500/month. "
        "Single circuit serves both applications.",
        "High", "combined offering no split",
        id="r005-pos-combined-no-split"
    ),
    pytest.param(
        "The solution includes video surveillance cameras integrated with "
        "the network infrastructure being requested.",
        "Medium", "ineligible video security",
        id="r005-pos-video-surveillance"
    ),
    pytest.param(
        "This proposal covers telephone service and handsets for the "
        "administrative offices alongside the data network.",
        "Medium", "telephone mentioned no allocation",
        id="r005-pos-telephone-no-allocation"
    ),
    pytest.param(
        "Service includes analog lines for fax machines at each building "
        "plus the fiber internet connectivity.",
        "Medium", "fax analog lines ineligible",
        id="r005-pos-fax-lines"
    ),
    pytest.param(
        "The WAN service package is bundled with voice service for all "
        "administrative phone lines at 20 locations.",
        "High", "bundled WAN + voice",
        id="r005-pos-wan-voice-bundle"
    ),
    pytest.param(
        "Staff personal use of the network is included. The solution "
        "supports employee personal devices on a separate VLAN.",
        "Medium", "staff personal use mentioned",
        id="r005-pos-personal-use"
    ),
    pytest.param(
        "The proposal includes paging system integration with the network "
        "switches being procured under this Form 470.",
        "Medium", "paging system ineligible",
        id="r005-pos-paging"
    ),
    pytest.param(
        "Non-instructional areas (bus garage, maintenance shed) will also "
        "receive connectivity under this request.",
        "Medium", "non-instructional areas",
        id="r005-pos-non-instructional"
    ),
    pytest.param(
        "The bundled service solution includes eligible and ineligible "
        "components. Total monthly cost is $8,500.",
        "High", "explicit eligible/ineligible no methodology",
        id="r005-pos-explicit-mixed"
    ),
    pytest.param(
        "Cell phones for administrators are included in the technology "
        "refresh alongside the network switches.",
        "Medium", "cell phones ineligible",
        id="r005-pos-cell-phones"
    ),
]

RULE_005_NEGATIVE = [
    pytest.param(
        "The bundled service includes both eligible internet and ineligible "
        "voice. Cost allocation: data is 70% of total cost based on bandwidth. "
        "E-Rate discount requested only on the eligible portion.",
        "pass", "proper allocation methodology",
        id="r005-neg-proper-allocation"
    ),
    pytest.param(
        "This request is for dedicated internet access at 10 Gbps to the "
        "district office with failover. Pure data service only.",
        "pass", "pure eligible no ineligible",
        id="r005-neg-pure-eligible"
    ),
    pytest.param(
        "Internal connections project: switches, APs, and cabling only. "
        "All components are Category 2 eligible equipment.",
        "pass", "pure cat2 equipment",
        id="r005-neg-cat2-only"
    ),
    pytest.param(
        "The eligible portion represents 80% of the total. Ineligible portion "
        "is 20%. Pro-rated based on port count methodology.",
        "pass", "pro-rata allocation present",
        id="r005-neg-prorata"
    ),
    pytest.param(
        "Service costs have been split: separate line items for eligible "
        "broadband ($4,000) and ineligible voice ($1,000).",
        "pass", "separate line items",
        id="r005-neg-separate-lines"
    ),
    pytest.param(
        "90% educational use allocation documented. The ineligible portion "
        "is excluded from E-Rate request. Cost allocation per FCC guidelines.",
        "pass", "explicit percentage allocation",
        id="r005-neg-90-pct-educational"
    ),
    pytest.param(
        "Cost allocation methodology appended as Exhibit B. Eligible costs "
        "calculated per FCC guidelines on mixed-use circuits.",
        "pass", "allocation methodology referenced",
        id="r005-neg-methodology-referenced"
    ),
    pytest.param(
        "Fiber optic internet access at 1Gbps symmetric. This is a pure "
        "Category 1 internet service with no bundled components.",
        "pass", "pure internet no bundle",
        id="r005-neg-pure-internet"
    ),
]


class TestRuleCostAllocation:
    """Tests for cost allocation of mixed eligible/ineligible services."""

    @pytest.mark.parametrize("text,expected_severity,desc", RULE_005_POSITIVE)
    def test_positive(self, metadata, text, expected_severity, desc):
        """Rule should fire - ineligible content without allocation."""
        result = check_cost_allocation(text, metadata)
        assert result is not None, f"Rule should fire: {desc}"
        assert result.rule_id == "RULE-005"

    @pytest.mark.parametrize("text,expected,desc", RULE_005_NEGATIVE)
    def test_negative(self, metadata, text, expected, desc):
        """Rule should NOT fire - proper allocation or no ineligible content."""
        result = check_cost_allocation(text, metadata)
        assert result is None, f"Rule should not fire: {desc}"


# ==================== EDGE CASES ====================

class TestEdgeCases:
    """Cross-cutting edge cases testing boundary conditions."""

    def test_28_day_exactly_28_days(self, metadata):
        """Exactly 28 days should pass (boundary)."""
        text = "Form 470 posted on 01/01/2026. Filed Form 471 on 01/29/2026."
        result = check_28_day(text, metadata)
        assert result is None, "Exactly 28 days should pass"

    def test_28_day_day_29(self, metadata):
        """29 days should pass (one day over boundary)."""
        text = "Form 470 posted on 01/01/2026. Filed Form 471 on 01/30/2026."
        result = check_28_day(text, metadata)
        assert result is None, "29 days should pass"

    def test_brand_cisco_compatible(self, metadata):
        """Partial brand phrase 'Cisco-compatible' should still trigger."""
        text = "The network requires Cisco switches in every closet. Must be " \
               "Cisco-compatible for interoperability with existing stack."
        result = check_or_equivalent(text, metadata)
        assert result is not None, "Cisco without 'or equivalent' should trigger"

    def test_brand_at_and_t_with_ampersand(self, metadata):
        """AT&T brand detection with special characters."""
        text = "AT&T will provide dedicated fiber connectivity to all sites."
        result = check_or_equivalent(text, metadata)
        assert result is not None, "AT&T without equivalent should trigger"

    def test_service_type_wan_abbreviation(self, metadata):
        """WAN abbreviation should count as valid service."""
        text = "This Form 470 requests WAN services connecting our 5 campuses."
        result = check_service_types(text, metadata)
        assert result is None, "WAN should be recognized as Category 1"

    def test_cost_allocation_implicit_90_educational(self, metadata):
        """Implicit '90% educational' should satisfy allocation."""
        text = "The circuit is 90% educational use. Cost allocation methodology " \
               "is based on bandwidth split between instructional and admin traffic."
        result = check_cost_allocation(text, metadata)
        assert result is None, "90% educational should count as allocation"

    def test_eval_factors_price_spelled_differently(self, metadata):
        """'Pricing' as most weighted should pass."""
        text = "Evaluation criteria: pricing is the most heavily weighted " \
               "factor at 50%. Technical merit (30%). Timeline (20%)."
        result = check_eval_factors(text, metadata)
        assert result is None, "pricing as most heavily weighted should pass"

    def test_service_type_synonym_telecom(self, metadata):
        """'Telecommunications' should be recognized as eligible."""
        text = "This Form 470 requests telecommunications services for the " \
               "school district including all campus locations."
        result = check_service_types(text, metadata)
        assert result is None, "telecommunications should match"

# ==================== INTEGRATION: run_all_rules ====================

class TestRunAllRules:
    """Integration test for the full rule engine."""

    def test_multiple_violations(self, metadata):
        """Document with multiple issues triggers multiple rules."""
        text = """
        Form 470 for Springfield School District.
        We are requesting Cisco Meraki MS425 switches and Palo Alto
        PA-3260 firewalls for our network upgrade. The RFP evaluation
        criteria are: technical fit (60%), vendor reputation (25%),
        and delivery timeline (15%). The bundled service includes
        telephone service as well. Posted 04/01/2026, filing 04/15/2026.
        """
        findings = run_all_rules(text, metadata)
        rule_ids = [f.rule_id for f in findings]
        assert len(findings) >= 3
        assert "RULE-003" in rule_ids  # brand names
        assert "RULE-004" in rule_ids  # no price in eval

    def test_clean_document(self, metadata):
        """Well-formed document should trigger zero or minimal findings."""
        text = """
        Form 470 Application - Funding Year 2026
        28-day waiting period will be observed per FCC requirements.

        Services Requested: Internet Access (Category 1)
        Fiber optic data transmission service at 10 Gbps.

        Evaluation Criteria:
        Price of eligible products and services is the most heavily weighted
        factor at 55%. Technical qualifications 25%. References 20%.
        """
        findings = run_all_rules(text, metadata)
        assert len(findings) <= 1

    def test_all_rules_fire(self, metadata):
        """Maximally non-compliant document triggers all 5 rules."""
        text = """
        Form 470 for Acme School District.
        Posted 03/01/2026, filing 03/15/2026.
        We need Cisco switches and Fortinet firewalls.
        Our technology needs include various improvements.
        Evaluation Criteria: vendor reputation (50%), experience (30%),
        local presence (20%).
        The bundled service includes telephone and hosted voice along
        with internet access. Total monthly fee is $10,000.
        """
        findings = run_all_rules(text, metadata)
        rule_ids = [f.rule_id for f in findings]
        assert "RULE-001" in rule_ids
        assert "RULE-003" in rule_ids
        assert "RULE-004" in rule_ids
        assert "RULE-005" in rule_ids

    def test_empty_document(self, metadata):
        """Empty document should not crash the engine."""
        findings = run_all_rules("", metadata)
        assert isinstance(findings, list)

    def test_very_long_document(self, metadata):
        """10,000 char document should not timeout or crash."""
        text = "Form 470 internet access fiber broadband " * 250
        findings = run_all_rules(text, metadata)
        assert isinstance(findings, list)
