import type { Metadata } from "next";
import Link from "next/link";
import FundingGuardForm from "./FundingGuardForm";

export const metadata: Metadata = {
  title: "The 471-Season Funding Guard | SkyRate AI",
  description:
    "Free denial & clawback audit of your entire E-Rate book. We name the recoverable dollars before you pay a cent. Concierge onboarding before the FY2027 Form 471 window.",
  robots: { index: false, follow: false }, // unlisted while in review
};

const STEPS = [
  {
    step: "1",
    title: "Free Denial & Clawback Audit",
    body: "Send us your consultant book. Within 7 days we scan every BEN for recoverable denials and at-risk disbursements — and hand you a report with the dollars named. Your data, not a case study. You pay nothing for the audit.",
  },
  {
    step: "2",
    title: "Filing-Window Concierge Onboarding",
    body: "We import your BENs and FRNs and configure every alert before the FY2027 Form 471 window opens. You start the window live — not learning a new tool mid-season.",
  },
  {
    step: "3",
    title: "Your Whole Book, Watched All Season",
    body: "Every FRN monitored in real time, every denial answered with a drafted appeal citing FCC Order 19-117, every C2 budget tracked per BEN. You only subscribe after the audit shows you the money.",
  },
];

const FAQS = [
  {
    q: "What does the audit cost?",
    a: "Nothing. The Denial & Clawback Audit is free and runs on your real book. If it doesn't surface value, you walk away owing nothing.",
  },
  {
    q: "When do I pay?",
    a: "Only after the audit — if you decide the findings are worth protecting. Season coverage is $499/mo per book, or $4,790/yr. Districts can pay by purchase order with an annual invoice.",
  },
  {
    q: "Why is this capped at 10 books?",
    a: "Concierge onboarding is done personally, not by a ticket queue. Ten consultant books is the honest capacity for this season. The offer closes when the FY2027 471 window opens.",
  },
  {
    q: "What if the audit finds nothing?",
    a: "Then you pay nothing and keep the report. That's the point of running it before any payment.",
  },
];

export default function FundingGuardPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="border-b border-white/10">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/logos/logo-icon-transparent.png"
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>
          <Link
            href="/book-demo"
            className="text-sm text-slate-300 hover:text-white transition"
          >
            Book a demo
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold uppercase tracking-wide mb-6">
            For E-Rate consultants &middot; FY2027 471 season &middot; 10 books only
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-5">
            The 471-Season{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Funding Guard
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-4">
            A free denial &amp; clawback audit of your entire book — every
            recoverable denial and at-risk disbursement, named in dollars,
            within 7 days. <strong className="text-white">You pay only after we show you the money.</strong>
          </p>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto mb-8">
            Sold as a season outcome, not a software subscription: your whole
            book watched through the FY2027 Form 471 window, with cited appeal
            drafts for every denial.
          </p>
          <a
            href="#claim"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl font-semibold text-white shadow-lg shadow-purple-500/25 transition"
          >
            Claim your free audit
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </section>

        {/* How it works */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            How the Funding Guard works
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold flex items-center justify-center mb-4">
                  {s.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Guarantee */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center relative">
            <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Draft terms
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              The $25K Find-It Guarantee
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto mb-4">
              If the free audit plus your first 30 days don&apos;t identify at
              least <strong className="text-white">$25,000</strong> in
              recoverable or at-risk funding across your consultant book, you
              pay nothing for the season.
            </p>
            <p className="text-xs text-slate-500 max-w-xl mx-auto">
              Guarantee terms are in draft and subject to final written terms
              and eligibility conditions before any engagement. Ask us for the
              current terms when you claim your audit.
            </p>
          </div>
        </section>

        {/* Urgency */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-slate-300">
            <strong className="text-white">Why the cap is real:</strong>{" "}
            concierge onboarding is done personally. We take{" "}
            <strong className="text-white">10 consultant books</strong> this
            season — the offer closes when the FY2027 Form 471 window opens
            (expected Jan&ndash;Mar 2027).
          </p>
        </section>

        {/* Lead capture */}
        <section id="claim" className="max-w-xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-bold mb-2 text-center">
              Claim your free audit
            </h2>
            <p className="text-sm text-slate-400 text-center mb-6">
              Tell us where to send the report. No card, no commitment — the
              audit is free either way.
            </p>
            <FundingGuardForm />
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <h2 className="text-2xl font-bold text-center mb-8">Questions</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-semibold mb-1.5">{f.q}</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500">
        <p>
          SkyRate LLC &middot; 30 N Gould St Ste N, Sheridan, WY &middot;{" "}
          <a href="tel:+18557657291" className="hover:text-slate-300">(855) 765-7291</a>
        </p>
        <p className="mt-2">
          <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>{" "}
          &middot;{" "}
          <Link href="/terms" className="hover:text-slate-300">Terms</Link>
        </p>
      </footer>
    </div>
  );
}
