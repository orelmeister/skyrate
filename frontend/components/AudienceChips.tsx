"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const CHIPS: { audience: "consultant" | "applicant" | "vendor"; href: string; label: string; primary?: boolean }[] = [
  { audience: "consultant", href: "/features/consultants", label: "Consultants", primary: true },
  { audience: "applicant", href: "/features/applicants", label: "Applicants" },
  { audience: "vendor", href: "/features/vendors", label: "Vendors" },
];

export default function AudienceChips() {
  return (
    <div
      className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-sm"
      data-testid="audience-chips"
    >
      <span className="text-slate-500">Built for:</span>
      {CHIPS.map((chip) => (
        <Link
          key={chip.audience}
          href={chip.href}
          onClick={() => trackEvent("audience_chip_click", { audience: chip.audience })}
          className={`px-3 py-1.5 rounded-full border transition font-medium ${
            chip.primary
              ? "border-purple-500/40 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}
