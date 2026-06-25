"use client";

/**
 * MissingIdentifierBanner
 *
 * Soft-gate banner shown at the top of role dashboards (consultant / vendor /
 * applicant) when the signed-in user has not yet provided their USAC entity
 * identifier (CRN / SPIN / BEN). Clicking the CTA deep-links them straight to
 * `/onboarding` so they can finish the funnel.
 *
 * Funnel events:
 *   - dashboard_identifier_banner_view (fires once per page render, debounced)
 *   - dashboard_identifier_banner_click (fires on CTA click)
 *
 * The banner is intentionally non-dismissible: every additional day a
 * dashboard renders without an identifier is wasted activation. Hiding logic
 * lives in this component so each dashboard just renders <MissingIdentifierBanner />.
 */

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { trackEvent } from "@/lib/analytics";

type Role = "consultant" | "vendor" | "applicant";

interface IdentifierMeta {
  short: string;
  long: string;
}

const META: Record<Role, IdentifierMeta> = {
  consultant: { short: "CRN", long: "Consultant Registration Number" },
  vendor: { short: "SPIN", long: "Service Provider ID Number" },
  applicant: { short: "BEN", long: "Billed Entity Number" },
};

function hasIdentifier(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const u = user as Record<string, unknown>;
  const role = u.role as string | undefined;

  // Backend exposes role profiles via the /auth/me payload. We treat any
  // non-empty CRN / SPIN / BEN as "identifier present".
  if (role === "consultant") {
    const profile = u.consultant_profile as { crn?: string | null } | undefined;
    if (profile?.crn && String(profile.crn).trim().length > 0) return true;
  }
  if (role === "vendor") {
    const profile = u.vendor_profile as { spin?: string | null } | undefined;
    if (profile?.spin && String(profile.spin).trim().length > 0) return true;
  }
  if (role === "applicant") {
    const profile = u.applicant_profile as { ben?: string | null } | undefined;
    if (profile?.ben && String(profile.ben).trim().length > 0) return true;
  }
  // Fallback: a successful USAC verification flips users.verified_entity = true.
  if (u.verified_entity === true) return true;
  return false;
}

export function MissingIdentifierBanner(): JSX.Element | null {
  const { user, _hasHydrated } = useAuthStore();
  const eventFiredRef = useRef(false);

  const role = (user?.role as Role | undefined) ?? undefined;
  const meta = role && META[role] ? META[role] : null;
  const shouldShow = useMemo(() => {
    if (!_hasHydrated || !user || !meta) return false;
    // Team seats inherit the account owner's CRN/portfolio, so the
    // "add your CRN" soft-gate never applies to them.
    if ((user as { is_seat?: boolean }).is_seat) return false;
    return !hasIdentifier(user);
  }, [_hasHydrated, user, meta]);

  useEffect(() => {
    if (!shouldShow || eventFiredRef.current || !role) return;
    eventFiredRef.current = true;
    trackEvent("dashboard_identifier_banner_view", { role });
  }, [shouldShow, role]);

  if (!shouldShow || !meta || !role) return null;

  return (
    <div
      role="alert"
      data-testid="missing-identifier-banner"
      className="mx-4 mt-4 mb-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-5 py-4 shadow-sm sm:mx-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Your portfolio is empty until we have your {meta.short}.
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Add your {meta.long} ({meta.short}) and we&rsquo;ll auto-pull every E-Rate
              funding request, deadline, and status alert tied to your entity.
            </p>
          </div>
        </div>
        <Link
          href="/onboarding"
          onClick={() => trackEvent("dashboard_identifier_banner_click", { role })}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-purple-200 transition-all hover:from-purple-700 hover:to-indigo-700"
        >
          Add my {meta.short}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default MissingIdentifierBanner;
