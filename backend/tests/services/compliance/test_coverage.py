"""Coverage assertion: verify all 5 rules are loaded in the engine."""

from app.services.compliance.rules import _RULES


def test_all_rules_loaded():
    """Engine must have exactly 5 active rules."""
    assert len(_RULES) == 5, f"Expected 5 rules, got {len(_RULES)}"


def test_rule_modules_have_check_function():
    """Every rule module must expose a check() callable."""
    for rule in _RULES:
        assert hasattr(rule, "check"), f"{rule.__name__} missing check()"
        assert callable(rule.check), f"{rule.__name__}.check is not callable"


def test_rule_modules_have_ids():
    """Every rule module must have RULE_ID and VERSION."""
    for rule in _RULES:
        assert hasattr(rule, "RULE_ID"), f"{rule.__name__} missing RULE_ID"
        assert hasattr(rule, "VERSION"), f"{rule.__name__} missing VERSION"
