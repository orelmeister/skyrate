"""
Comparison logic for re-analysis delta computation.
Compares prior analysis findings with current to determine:
- Resolved issues (in prior, not in current)
- Remaining issues (in both)
- New issues (in current, not in prior)
- Ready-to-submit verdict
"""

import logging

logger = logging.getLogger(__name__)


def compare_analyses(prior: dict, current: dict) -> dict:
    """
    Compare prior and current analysis results.
    Returns a comparison block with resolved/remaining/new issues and verdict.
    """
    prior_findings = prior.get("findings", []) + prior.get("llm_findings", [])
    current_findings = current.get("findings", []) + current.get("llm_findings", [])

    # Normalize findings for comparison by creating fingerprints
    def fingerprint(f: dict) -> str:
        return f"{f.get('area', '').lower()}::{f.get('description', '').lower()[:80]}"

    prior_fps = {fingerprint(f): f for f in prior_findings}
    current_fps = {fingerprint(f): f for f in current_findings}

    prior_keys = set(prior_fps.keys())
    current_keys = set(current_fps.keys())

    resolved_keys = prior_keys - current_keys
    remaining_keys = prior_keys & current_keys
    new_keys = current_keys - prior_keys

    resolved_issues = [prior_fps[k] for k in resolved_keys]
    remaining_issues = [current_fps[k] for k in remaining_keys]
    new_issues = [current_fps[k] for k in new_keys]

    # Ready to submit: no high-severity remaining or new issues
    has_high = any(
        f.get("severity", "").lower() == "high"
        for f in remaining_issues + new_issues
    )
    ready_to_submit = not has_high and len(remaining_issues + new_issues) <= 2

    # Build verdict
    if ready_to_submit:
        verdict = "Document appears ready to submit. All major issues resolved."
    elif has_high:
        high_count = sum(
            1 for f in remaining_issues + new_issues
            if f.get("severity", "").lower() == "high"
        )
        verdict = f"Not ready — {high_count} high-severity issue(s) remain."
    else:
        total_remaining = len(remaining_issues) + len(new_issues)
        verdict = f"{len(resolved_issues)} issue(s) resolved, {total_remaining} remain. Review before submitting."

    return {
        "resolved_issues": resolved_issues,
        "remaining_issues": remaining_issues,
        "new_issues": new_issues,
        "ready_to_submit": ready_to_submit,
        "verdict": verdict,
    }
