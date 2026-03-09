"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Hook that redirects unverified users to /onboarding.
 * 
 * Checks if the authenticated user has verified their email (is_verified === true).
 * If not, redirects them to the onboarding flow to complete verification.
 * 
 * Returns `{ verified, checking }`:
 * - `checking`: true while auth state is loading / being evaluated
 * - `verified`: true once the user is confirmed verified
 * 
 * Usage in dashboard pages:
 * ```ts
 * const { verified, checking } = useVerificationGuard();
 * if (checking || !verified) return <LoadingSpinner />;
 * ```
 */
// Test/demo accounts that bypass verification (matches backend TEST_ACCOUNT_EMAILS)
const TEST_ACCOUNT_EMAILS = [
  "admin@skyrate.ai",
  "super@skyrate.ai",
  "test_consultant@example.com",
  "test_vendor@example.com",
  "test_applicant@example.com",
  "demo@skyrate.ai",
];

function isTestAccount(email?: string): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return (
    TEST_ACCOUNT_EMAILS.includes(lower) ||
    lower.startsWith("test_") ||
    lower.startsWith("test@") ||
    lower.startsWith("demo@") ||
    lower.startsWith("demo_")
  );
}

export function useVerificationGuard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, _hasHydrated } = useAuthStore();
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!_hasHydrated || isLoading) return;

    // Not authenticated — let the page's own auth guard handle this
    if (!isAuthenticated || !user) {
      setChecking(false);
      return;
    }

    // Admin and super users bypass verification
    if (user.role === "admin" || user.role === "super") {
      setVerified(true);
      setChecking(false);
      return;
    }

    // Test/demo accounts bypass verification
    if (isTestAccount(user.email)) {
      setVerified(true);
      setChecking(false);
      return;
    }

    // Check if user has completed email verification
    if (user.is_verified || user.email_verified) {
      setVerified(true);
      setChecking(false);
      return;
    }

    // User is not verified — redirect to onboarding
    router.push("/onboarding");
  }, [_hasHydrated, isLoading, isAuthenticated, user, router]);

  return { verified, checking };
}
