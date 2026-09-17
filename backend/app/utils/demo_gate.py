"""Demo account gating logic — shared across consultant, vendor, applicant endpoints."""

from ..models.user import User
from ..core.config import get_settings


def is_demo_user(user: User) -> bool:
    """Check if user is a demo/test/free user eligible for identity swaps.

    Returns True for:
      - admin / super roles
      - emails in TEST_ACCOUNT_EMAILS list
      - emails in TEST_EMAIL_ALLOWLIST (exact match)
    """
    settings = get_settings()
    if user.role in ("super", "admin"):
        return True
    if user.email.lower() in [e.lower() for e in settings.TEST_ACCOUNT_EMAILS]:
        return True
    email_lower = user.email.lower()
    for allowed in settings.TEST_EMAIL_ALLOWLIST:
        if email_lower == allowed.strip().lower():
            return True
    return False
