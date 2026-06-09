"use client";

/**
 * Universal FRN redirect page.
 *
 * URL: /frn/<FRN>?ben=<BEN>
 *
 * This single URL is what we put in digest emails. It looks up the user's
 * current role at click time and forwards them to the matching portal page
 * with the right query params. If the user is not authenticated it bounces
 * them through /sign-in?redirect=<same /frn URL> so they land back here
 * after logging in.
 *
 * The per-portal page (consultant / vendor / applicant) already has its own
 * deep-link handler that reads ?tab=frn-status&frn=<FRN> and either opens
 * the FRN detail modal or scrolls to / highlights the row.
 */

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function FRNRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return;

    const rawFrn = Array.isArray(params?.frn) ? params.frn[0] : (params?.frn as string | undefined);
    const frn = (rawFrn || "").replace(/\D/g, "");
    const ben = (searchParams.get("ben") || "").replace(/\D/g, "");

    if (!frn) {
      router.replace("/");
      return;
    }

    if (!isAuthenticated || !user) {
      const back = `/frn/${frn}${ben ? `?ben=${ben}` : ""}`;
      router.replace(`/sign-in?redirect=${encodeURIComponent(back)}`);
      return;
    }

    let path: string;
    if (user.role === "vendor") {
      path = `/vendor?tab=frn-status&frn=${frn}`;
    } else if (user.role === "applicant") {
      path = `/applicant?tab=frn-status&frn=${frn}`;
    } else {
      // consultant + super + admin all use the consultant portal, which
      // accepts those roles and handles ?frn=&ben= (opens detail modal).
      path = `/consultant?tab=frn-status&frn=${frn}${ben ? `&ben=${ben}` : ""}`;
    }
    router.replace(path);
  }, [_hasHydrated, isAuthenticated, user, router, params, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">Opening FRN…</p>
      </div>
    </div>
  );
}
