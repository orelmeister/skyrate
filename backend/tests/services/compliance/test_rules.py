"""
Regression tests for the compliance deterministic rule engine.
Phase 1: 15 well-chosen test cases covering all 5 rules.
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

class TestRule28DayWindow:
    """Tests for the 28-day competitive bidding window rule."""

    def test_pass_window_mentioned(self, metadata):
        """Document mentioning 28-day waiting period should pass."""
        text = """
        Form 470 for Funding Year 2026. The applicant will observe the
        28-day waiting period as required by FCC rules. The Form 470
        was posted on 01/15/2026 and the Form 471 will be filed after
        02/15/2026 to ensure full compliance with competitive bidding.
        """
        result = check_28_day(text, metadata)
        assert result is None

    def test_fail_insufficient_days(self, metadata):
        """Dates showing less than 28 days should trigger HIGH finding."""
        text = """
        Form 470 posted on 03/01/2026. We plan to file Form 471 on
        03/20/2026 to meet the district's timeline requirements.
        Internet access services requested for 12 school buildings.
        """
        result = check_28_day(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-001"
        assert result.severity.value == "High"
        assert "19 days" in result.description or "days" in result.description

    def test_fail_no_dates_no_mention(self, metadata):
        """Form 470 doc with no dates or window mention flags medium."""
        text = """
        This Form 470 requests internet access services for the district.
        We are seeking competitive bids from qualified vendors for
        broadband connectivity at 15 school locations.
        """
        result = check_28_day(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-001"
        assert result.severity.value == "Medium"


# ==================== RULE-002: Service Types ====================

class TestRuleServiceTypes:
    """Tests for service type identification rule."""

    def test_pass_category1_services(self, metadata):
        """Document with clear Category 1 services should pass."""
        text = """
        The district is requesting internet access and data transmission
        services for all school buildings. We need fiber optic connectivity
        at 1 Gbps to each site.
        """
        result = check_service_types(text, metadata)
        assert result is None

    def test_pass_category2_services(self, metadata):
        """Document with Category 2 equipment should pass."""
        text = """
        This Form 470 is for internal connections including wireless
        access points, network switches, and structured cabling for
        the new wing of Jefferson Middle School.
        """
        result = check_service_types(text, metadata)
        assert result is None

    def test_fail_no_services(self, metadata):
        """Document without any recognizable service types should fail."""
        text = """
        Our school district is filing this form to obtain funding
        for various technology needs. We have 5,000 students across
        12 buildings and need to improve our infrastructure.
        """
        result = check_service_types(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-002"
        assert result.severity.value == "High"


# ==================== RULE-003: Or Equivalent ====================

class TestRuleOrEquivalent:
    """Tests for brand name 'or equivalent' requirement."""

    def test_pass_brand_with_equivalent(self, metadata):
        """Brand name followed by 'or equivalent' should pass."""
        text = """
        The district requires Cisco Meraki or equivalent wireless
        access points capable of 802.11ax (Wi-Fi 6). Minimum 4x4
        MIMO required. Aruba or equivalent controllers acceptable.
        """
        result = check_or_equivalent(text, metadata)
        assert result is None

    def test_fail_brand_without_equivalent(self, metadata):
        """Brand name without 'or equivalent' should trigger finding."""
        text = """
        We require Cisco Catalyst 9300 switches for all MDF/IDF closets.
        Each closet needs a Fortinet FortiGate 60F firewall. Ruckus R750
        access points will be installed in every classroom.
        """
        result = check_or_equivalent(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-003"
        assert result.severity.value == "High"
        assert "brand" in result.description.lower()

    def test_pass_no_brands(self, metadata):
        """Document with no brand names should pass."""
        text = """
        We need managed Layer 3 switches with at least 48 ports per unit,
        PoE+ capable, supporting 10G uplinks. Enterprise-grade wireless
        access points with Wi-Fi 6 and cloud management required.
        """
        result = check_or_equivalent(text, metadata)
        assert result is None


# ==================== RULE-004: Evaluation Factors ====================

class TestRuleEvaluationFactors:
    """Tests for price as primary evaluation factor."""

    def test_pass_price_primary(self, metadata):
        """Evaluation criteria with price as most weighted should pass."""
        text = """
        Evaluation Criteria:
        1. Price of eligible products and services - most heavily weighted (50%)
        2. Technical capabilities - 25%
        3. Vendor experience - 15%
        4. References - 10%
        """
        result = check_eval_factors(text, metadata)
        assert result is None

    def test_fail_eval_no_price(self, metadata):
        """Evaluation criteria without price mentioned should fail HIGH."""
        text = """
        Proposals will be evaluated using the following Evaluation Criteria:
        - Technical approach and methodology (40%)
        - Vendor qualifications and experience (35%)
        - Project timeline and implementation plan (25%)
        """
        result = check_eval_factors(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-004"
        assert result.severity.value == "High"

    def test_fail_price_not_primary(self, metadata):
        """Price mentioned but not clearly primary should flag medium."""
        text = """
        The scoring criteria for this evaluation process include:
        technical merit, vendor experience, implementation timeline,
        and price. Each factor will be considered in the selection.
        """
        result = check_eval_factors(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-004"
        assert result.severity.value == "Medium"


# ==================== RULE-005: Cost Allocation ====================

class TestRuleCostAllocation:
    """Tests for cost allocation of mixed eligible/ineligible services."""

    def test_pass_allocation_present(self, metadata):
        """Mixed services with cost allocation should pass."""
        text = """
        The bundled service includes both eligible internet access and
        ineligible voice service components. Cost allocation methodology:
        the eligible portion (data) represents 70% of the total cost,
        calculated based on bandwidth allocation. E-Rate discount is
        requested only on the eligible portion.
        """
        result = check_cost_allocation(text, metadata)
        assert result is None

    def test_fail_mixed_no_allocation(self, metadata):
        """Mixed services without cost allocation should trigger finding."""
        text = """
        Our proposal includes a bundled service package that provides
        both internet access and telephone service on the same fiber
        connection. The monthly cost is $5,000 for the combined service
        including voice and data.
        """
        result = check_cost_allocation(text, metadata)
        assert result is not None
        assert result.rule_id == "RULE-005"
        assert "cost allocation" in result.description.lower()

    def test_pass_no_ineligible(self, metadata):
        """Pure eligible services without ineligible mention should pass."""
        text = """
        This request is for dedicated internet access service at 10 Gbps
        to the district office with failover. No voice or other services
        are included in this request.
        """
        result = check_cost_allocation(text, metadata)
        assert result is None


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
        # Should catch: brand names, price not primary, cost allocation, 28-day
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
        # Should be clean or very minimal
        assert len(findings) <= 1
