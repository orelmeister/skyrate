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

    // Admin users bypass verification
    if (user.role === "admin") {
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
