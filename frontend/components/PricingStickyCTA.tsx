"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

export default function PricingStickyCTA() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-2xl">
      <div className="flex items-center gap-2">
        <Link
          href="/demo?source=pricing-sticky"
          onClick={() => trackEvent("pricing_demo_click", { source: "sticky_cta" })}
          className="flex-1 text-center py-2.5 rounded-lg font-semibold text-sm border border-slate-300 text-slate-800 hover:bg-slate-50"
        >
          Book a Demo
        </Link>
        <Link
          href="/sign-up?source=pricing-sticky"
          onClick={() => trackEvent("pricing_signup_click", { tier: "free", source: "sticky_cta" })}
          className="flex-1 text-center py-2.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow"
        >
          Start Free Trial
        </Link>
      </div>
    </div>
  );
}
