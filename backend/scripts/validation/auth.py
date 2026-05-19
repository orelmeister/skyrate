"""
Authentication helper for app.erateapp.com admin endpoints.

Logs in via /signin_a and returns a requests.Session with the PHPSESSID cookie.
Credentials are sourced from environment variables (never hardcoded).
"""

import os
import requests


class AuthError(Exception):
    """Raised when authentication fails or env vars are missing."""
    pass


def get_admin_session() -> requests.Session:
    """
    Authenticate with app.erateapp.com and return a session with admin cookie.

    Requires environment variables:
        ERATEAPP_ADMIN_EMAIL - Admin email address
        ERATEAPP_ADMIN_PASSWORD - Admin password

    Returns:
        requests.Session with PHPSESSID cookie set.

    Raises:
        AuthError: If env vars are missing or login fails.
    """
    email = os.environ.get("ERATEAPP_ADMIN_EMAIL")
    password = os.environ.get("ERATEAPP_ADMIN_PASSWORD")

    if not email or not password:
        raise AuthError(
            "Missing required environment variables: "
            "ERATEAPP_ADMIN_EMAIL and ERATEAPP_ADMIN_PASSWORD must be set."
        )

    session = requests.Session()

    login_url = "https://app.erateapp.com/signin_a"
    payload = {"email": email, "password": password}

    try:
        resp = session.post(login_url, json=payload, timeout=30)
    except requests.RequestException as e:
        raise AuthError(f"Network error during login: {e}") from e

    if resp.status_code != 200:
        raise AuthError(
            f"Login failed with HTTP {resp.status_code}: {resp.text[:200]}"
        )

    # Verify we got a session cookie
    if "PHPSESSID" not in session.cookies:
        # Some responses return success JSON but no cookie — check response body
        try:
            body = resp.json()
            if body.get("success") is False or body.get("error"):
                raise AuthError(
                    f"Login rejected: {body.get('error', 'invalid credentials')}"
                )
        except (ValueError, KeyError):
            pass
        raise AuthError(
            "Login response did not set PHPSESSID cookie. "
            "Check credentials and endpoint availability."
        )

    return session
