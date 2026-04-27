"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

type CaseStudy = {
  slug: string;
  title: string;
  subtitle: string;
  problem: string;
  intervention: string;
  outcome: string;
  cta: string;
  ctaText: string;
};

export default function CaseStudiesClient({ cases }: { cases: CaseStudy[] }) {
  useEffect(() => {
    trackEvent("case_study_viewed", { slug: "index" });
  }, []);

  return (
    <div className="space-y-8">
      {cases.map((cs) => (
        <article
          key={cs.slug}
          id={cs.slug}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur"
        >
          <p className="text-xs uppercase tracking-wider text-purple-300 mb-2">{cs.subtitle}</p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-5">{cs.title}</h2>

          <div className="grid md:grid-cols-3 gap-5 mb-6">
            <Block label="Problem" body={cs.problem} />
            <Block label="SkyRate intervention" body={cs.intervention} accent />
            <Block label="Outcome" body={cs.outcome} />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <Link
              href={cs.cta}
              onClick={() => trackEvent("case_study_viewed", { slug: cs.slug, action: "cta_click" })}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold text-sm transition"
            >
              {cs.ctaText}
            </Link>
            <Link
              href="/tools/frn-tracker"
              className="px-5 py-2.5 rounded-lg border border-white/20 hover:bg-white/10 font-semibold text-sm transition"
            >
              Check an FRN free
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function Block({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        accent ? "bg-purple-500/10 border-purple-400/30" : "bg-white/5 border-white/10"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-slate-400 mb-2 font-semibold">{label}</p>
      <p className="text-slate-200 text-sm leading-relaxed">{body}</p>
    </div>
  );
}
