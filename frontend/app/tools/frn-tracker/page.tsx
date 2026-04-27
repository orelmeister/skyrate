import type { Metadata } from "next";
import Link from "next/link";
import FrnLookupClient from "./FrnLookupClient";

// Phase 2 (commit shipping this): /tools/frn-tracker — free public FRN status
// lookup powered by USAC Open Data. No login. No email-wall. Pure SEO + lead-gen.

export const metadata: Metadata = {
  title: "Free FRN Tracker 2026 — Real-Time E-Rate FRN Status Lookup | SkyRate",
  description:
    "Free, no-signup E-Rate FRN tracker. Look up real-time Funding Request Number status, commitment amount, disbursements, and denial reasons directly from USAC Open Data.",
  keywords:
    "FRN tracker, FRN status, E-Rate FRN lookup, USAC FRN, funding request number, free FRN tool, real-time FRN status, FRN check",
  openGraph: {
    title: "Free FRN Tracker 2026 — Real-Time E-Rate FRN Status Lookup",
    description:
      "Look up any E-Rate Funding Request Number for free. Real-time status, commitment, disbursement and denial data sourced from USAC Open Data. No signup required.",
    url: "https://skyrate.ai/tools/frn-tracker",
    type: "website",
    siteName: "SkyRate AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free FRN Tracker — E-Rate FRN Status Lookup",
    description:
      "Free, no-signup E-Rate FRN status tracker. Real-time data from USAC.",
  },
  robots: "index, follow",
  alternates: { canonical: "https://skyrate.ai/tools/frn-tracker" },
};

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is an FRN (Funding Request Number)?",
    a: "An FRN is a unique identifier USAC assigns to each funding request submitted on a Form 471. Every line item on your Form 471 receives its own FRN, and USAC uses it to track status, commitments, and disbursements for that specific request.",
  },
  {
    q: "Where does this FRN tracker get its data?",
    a: "All status data comes directly from the USAC Open Data Portal (the official Form 471 FRN Status dataset, qdmp-ygft). We re-query USAC live each time you look up an FRN, so the information is as current as USAC's public dataset.",
  },
  {
    q: "Is this FRN tracker really free? Do I need an account?",
    a: "Yes — completely free, no signup required, no email wall. Look up as many FRNs as you want (up to a fair-use rate limit per hour). If you want automated email alerts when an FRN status changes, you can optionally add your email below the result.",
  },
  {
    q: "Why is my FRN not found?",
    a: "USAC Open Data only includes FRNs that have been certified on a Form 471. Very recently filed FRNs, draft FRNs, or FRNs from applications that were never certified will not appear. Try again in a few weeks if your application is brand-new.",
  },
  {
    q: "What do the FRN status values mean?",
    a: "Common values: 'Funded'/'Committed' means USAC approved the request. 'Pending' means USAC is still reviewing (often during PIA). 'Denied' means the request was rejected — you typically have 60 days to appeal. 'Cancelled'/'Withdrawn' means the applicant or USAC removed the request.",
  },
];

export default function FrnTrackerPage() {
  const webAppJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SkyRate Free FRN Tracker",
    url: "https://skyrate.ai/tools/frn-tracker",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Free, no-signup E-Rate Funding Request Number (FRN) status lookup powered by USAC Open Data.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: {
      "@type": "Organization",
      name: "SkyRate LLC",
      url: "https://skyrate.ai",
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://skyrate.ai" },
      { "@type": "ListItem", position: 2, name: "Tools", item: "https://skyrate.ai/tools/frn-tracker" },
      { "@type": "ListItem", position: 3, name: "Free FRN Tracker", item: "https://skyrate.ai/tools/frn-tracker" },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Header */}
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/blog/erate-form-470-guide" className="text-slate-400 hover:text-white transition hidden sm:inline">
              Form 470 Guide
            </Link>
            <Link href="/features/frn-monitoring" className="text-slate-400 hover:text-white transition hidden sm:inline">
              Auto-Track FRNs
            </Link>
            <Link
              href="/sign-up?source=frn-tracker"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:from-indigo-500 hover:to-purple-500 transition"
            >
              Free Trial
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 rounded-full text-sm font-medium mb-6 border border-indigo-500/20">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Live USAC Data · Free · No Signup
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-5">
            Free <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">FRN Tracker</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Look up any E-Rate Funding Request Number in seconds. Real-time status,
            commitment amount, disbursements and denial reasons — sourced live from
            USAC Open Data.
          </p>

          <FrnLookupClient />

          <p className="text-xs text-slate-500 mt-4">
            Powered by <a href="https://opendata.usac.org" target="_blank" rel="noopener" className="underline hover:text-slate-300">USAC Open Data</a>.
            Fair-use limit: 30 lookups per hour per IP.
          </p>
        </div>
      </section>

      {/* What you get */}
      <section className="px-4 sm:px-6 py-12 bg-slate-900/50 border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">What this free tool shows you</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { t: "Real-time status", d: "Funded, Pending, Denied, Cancelled — straight from USAC." },
              { t: "Commitment & disbursement", d: "How much was committed and how much has actually been paid out." },
              { t: "Applicant & SPIN", d: "BEN, applicant name, state, and the service provider on the FRN." },
              { t: "Denial / pending reasons", d: "FCDL comments and PIA pending reasons — useful for appeals." },
            ].map((card) => (
              <div key={card.t} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/40 transition">
                <h3 className="text-white font-semibold mb-2">{card.t}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{card.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Internal links + lead capture */}
      <section className="px-4 sm:px-6 py-14">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-purple-500/30 rounded-2xl p-6">
            <h3 className="text-white font-bold text-xl mb-2">Track all your FRNs automatically</h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-4">
              SkyRate consultants monitor 500+ FRNs in one dashboard with email
              and SMS alerts the moment USAC changes status. Start a free trial —
              no credit card required.
            </p>
            <Link
              href="/sign-up?role=consultant&source=frn-tracker"
              className="inline-block px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-500 hover:to-purple-500 transition"
            >
              Start Free Trial
            </Link>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-white font-bold text-xl mb-2">Learn more about E-Rate</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/blog/erate-form-470-guide" className="text-indigo-400 hover:text-indigo-300 underline">Form 470 Guide 2026 — step by step</Link></li>
              <li><Link href="/blog/erate-category-2-budget-guide" className="text-indigo-400 hover:text-indigo-300 underline">Category 2 Budget Guide 2026</Link></li>
              <li><Link href="/blog/top-erate-denial-reasons" className="text-indigo-400 hover:text-indigo-300 underline">Top E-Rate Denial Reasons (and fixes)</Link></li>
              <li><Link href="/features/frn-monitoring" className="text-indigo-400 hover:text-indigo-300 underline">SkyRate FRN Status Tracker (paid)</Link></li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 sm:px-6 py-14 bg-slate-900/50 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-8 text-center">FRN Tracker — Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="group bg-white/5 border border-white/10 rounded-xl p-5">
                <summary className="cursor-pointer text-white font-semibold flex items-center justify-between">
                  {item.q}
                  <span className="text-purple-400 transition group-open:rotate-180">▾</span>
                </summary>
                <p className="text-slate-400 text-sm leading-relaxed mt-3">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 sm:px-6 py-10 border-t border-white/10 text-center">
        <p className="text-sm text-slate-500">
          © {new Date().getFullYear()} SkyRate LLC. Data sourced from USAC Open Data.
          SkyRate is not affiliated with USAC or the FCC.
        </p>
        <p className="text-xs text-slate-600 mt-2">
          <Link href="/" className="hover:text-slate-400">Home</Link>
          {" · "}
          <Link href="/pricing" className="hover:text-slate-400">Pricing</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-slate-400">Privacy</Link>
          {" · "}
          <Link href="/terms" className="hover:text-slate-400">Terms</Link>
        </p>
      </footer>
    </main>
  );
}
