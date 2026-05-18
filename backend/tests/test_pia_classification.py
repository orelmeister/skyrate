"""
Test PIA Classification System
Verifies that all template questions classify to their expected category,
and that all PIA_CATEGORIES have corresponding knowledge entries.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.pia_service import PIAService


def test_classify_frontend_templates():
    """
    Every frontend template question must classify to its expected category.
    This is the regression test that catches the original bug.
    """
    service = PIAService()
    # Reset singleton state for testing
    service._initialized = True

    # These match the frontend PIATemplateGallery.tsx questions + categories
    frontend_templates = [
        {
            "question": "Please provide documentation showing that you posted your Form 470, waited the required 28 days for competitive bidding, and solicited bids before signing a contract with your selected service provider.",
            "expected": "competitive_bidding",
        },
        {
            "question": "Please provide your bid evaluation matrix and explain how you determined that the selected service provider was the most cost-effective option with price as the primary factor.",
            "expected": "cost_effectiveness",
        },
        {
            "question": "Please confirm your entity is an eligible entity for E-Rate funding by providing your NCES ID, state accreditation, and non-profit documentation if applicable.",
            "expected": "entity_eligibility",
        },
        {
            "question": "Please explain how the requested services are eligible under the Eligible Services List (ESL) for this funding year and provide product specifications.",
            "expected": "service_eligibility",
        },
        {
            "question": "Please verify the school lunch data and NSLP percentage used to calculate your discount rate, including the data source documentation.",
            "expected": "discount_rate",
        },
        {
            "question": "Please provide your current student enrollment count and the source documentation (state report, direct certification, or NSLP roster) supporting the student counts used on Form 471.",
            "expected": "student_count",
        },
        {
            "question": "Please provide a copy of your signed contract showing the execution date and explain how the contract amounts match your Form 471 FRN.",
            "expected": "contracts",
        },
        {
            "question": "Please confirm that your entity has adopted an Internet Safety Policy and held the required public hearing for CIPA compliance.",
            "expected": "cipa",
        },
        {
            "question": "Please provide a cost allocation breakdown showing the eligible and ineligible components of this FRN and how ineligible costs comply with program rules.",
            "expected": "ineligible_services",
        },
    ]

    passed = 0
    failed = 0
    failures = []

    for template in frontend_templates:
        result = service.classify_question(template["question"])
        actual = result["category"]
        expected = template["expected"]
        if actual == expected:
            passed += 1
            print(f"  [PASS] '{expected}' - confidence: {result['confidence']:.2f}, keywords: {result['matched_keywords']}")
        else:
            failed += 1
            failures.append({
                "question": template["question"][:80] + "...",
                "expected": expected,
                "actual": actual,
                "matched": result.get("matched_keywords", []),
            })
            print(f"  [FAIL] Expected '{expected}', got '{actual}' - keywords: {result['matched_keywords']}")
            print(f"         Question: {template['question'][:80]}...")

    print(f"\nFrontend templates: {passed} passed, {failed} failed")
    return failures


def test_classify_backend_templates():
    """
    Every backend get_templates() entry must classify to its own category.
    """
    service = PIAService()
    service._initialized = True

    templates = service.get_templates()
    passed = 0
    failed = 0
    failures = []

    for category, questions in templates.items():
        for item in questions:
            result = service.classify_question(item["question"])
            actual = result["category"]
            expected = item["category"]
            if actual == expected:
                passed += 1
            else:
                failed += 1
                failures.append({
                    "question": item["question"][:80] + "...",
                    "expected": expected,
                    "actual": actual,
                })
                print(f"  [FAIL] Backend template: expected '{expected}', got '{actual}'")
                print(f"         Question: {item['question'][:80]}...")

    print(f"Backend templates: {passed} passed, {failed} failed")
    return failures


def test_knowledge_map_completeness():
    """
    Every key in PIA_CATEGORIES must have a corresponding entry in _get_category_knowledge().
    """
    service = PIAService()
    service._initialized = True

    passed = 0
    failed = 0
    failures = []

    for category_key in service.PIA_CATEGORIES:
        knowledge = service._get_category_knowledge(category_key)
        if knowledge and knowledge.get("what_they_want"):
            passed += 1
            # Also verify winning_phrases and attachments_note exist
            if not knowledge.get("winning_phrases"):
                print(f"  [WARN] '{category_key}' missing winning_phrases")
            if not knowledge.get("attachments_note"):
                print(f"  [WARN] '{category_key}' missing attachments_note")
        else:
            failed += 1
            failures.append(category_key)
            print(f"  [FAIL] No knowledge entry for category '{category_key}'")

    print(f"Knowledge map completeness: {passed} passed, {failed} failed")
    return failures


def test_document_checklist_completeness():
    """
    Every key in PIA_CATEGORIES must have a document checklist.
    """
    service = PIAService()
    service._initialized = True

    passed = 0
    failed = 0

    for category_key in service.PIA_CATEGORIES:
        checklist = service.get_document_checklist(category_key, {})
        if checklist and len(checklist) > 0:
            passed += 1
        else:
            failed += 1
            print(f"  [FAIL] No document checklist for category '{category_key}'")

    print(f"Document checklist completeness: {passed} passed, {failed} failed")
    return failed


def test_fallback_is_not_competitive_bidding():
    """
    When no keywords match, fallback must be 'general', not 'competitive_bidding'.
    """
    service = PIAService()
    service._initialized = True

    # Completely generic text with no category keywords
    result = service.classify_question("Hello, I have a question about my application.")
    assert result["category"] == "general", f"Expected 'general', got '{result['category']}'"
    assert result["confidence"] == 0.0, f"Expected confidence 0.0, got {result['confidence']}"
    print("  [PASS] Fallback is 'general' with confidence 0.0")
    return []


if __name__ == "__main__":
    print("=" * 60)
    print("PIA Classification Test Suite")
    print("=" * 60)

    all_failures = []

    print("\n--- Test 1: Frontend Template Classification ---")
    all_failures.extend(test_classify_frontend_templates())

    print("\n--- Test 2: Backend Template Classification ---")
    all_failures.extend(test_classify_backend_templates())

    print("\n--- Test 3: Knowledge Map Completeness ---")
    all_failures.extend(test_knowledge_map_completeness())

    print("\n--- Test 4: Document Checklist Completeness ---")
    checklist_fails = test_document_checklist_completeness()

    print("\n--- Test 5: Fallback Behavior ---")
    all_failures.extend(test_fallback_is_not_competitive_bidding())

    print("\n" + "=" * 60)
    total_failures = len(all_failures) + checklist_fails
    if total_failures == 0:
        print("ALL TESTS PASSED")
    else:
        print(f"FAILURES: {total_failures}")
        for f in all_failures:
            print(f"  - {f}")
    print("=" * 60)

    sys.exit(0 if total_failures == 0 else 1)
