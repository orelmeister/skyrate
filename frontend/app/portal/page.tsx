"use client";

/**
 * SkyRate Entity Portal (Phase-1 embed).
 *
 * Renders the applicant's erateapp filing-journey workspace inside the SkyRate
 * shell, white-labeled, after establishing an SSO session. The heavy lifting
 * (SSO token mint) happens server-side via /api/v1/erateapp/portal-session; this
 * page just requests the session URL and frames it.
 *
 * The bridge is INERT until an operator provisions the shared secret, so this
 * page shows a friendly "coming soon" state (503) until then — safe to ship.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

type State =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "disabled" }
  | { kind: "no-ben" }
  | { kind: "error"; message: string };

export default function EntityPortalPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/sign-in?next=/portal");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await api.getErateappPortalSession();
      if (cancelled) return;
      if (res.success && res.data?.embed_url) {
        setState({ kind: "ready", url: res.data.embed_url });
      } else {
        // Distinguish the "not enabled yet" (503) and "no BEN" (400) cases from
        // the generic error so we can show the right message.
        const msg = (res.error || res.message || "").toLowerCase();
        if (msg.includes("not yet enabled") || msg.includes("not enabled") || msg.includes("503")) {
          setState({ kind: "disabled" });
        } else if (msg.includes("ben")) {
          setState({ kind: "no-ben" });
        } else {
          setState({ kind: "error", message: res.error || res.message || "Unable to open your portal right now." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router]);

  if (state.kind === "ready") {
    return (
      <div className="fixed inset-0 top-0 bg-white">
        <iframe
          src={state.url}
          title="SkyRate Entity Portal"
          className="w-full h-full border-0"
          // allow same-origin behavior once served via the reverse-proxy
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full text-center">
        {state.kind === "loading" && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
            <p className="text-slate-600">Opening your portal…</p>
          </>
        )}

        {state.kind === "disabled" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Your portal is almost ready</h1>
            <p className="text-slate-600 text-sm">
              We&apos;re finishing the setup that connects your SkyRate account to your
              filing workspace. This will be available shortly — check back soon.
            </p>
          </div>
        )}

        {state.kind === "no-ben" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-800 mb-2">No entity linked yet</h1>
            <p className="text-slate-600 text-sm">
              There&apos;s no BEN associated with your account yet, so there&apos;s no filing
              workspace to open. Add your BEN in your account settings, or contact your
              consultant.
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-800 mb-2">Couldn&apos;t open your portal</h1>
            <p className="text-slate-600 text-sm">{state.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
