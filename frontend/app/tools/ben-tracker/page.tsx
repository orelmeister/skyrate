import type { Metadata } from "next";
import Link from "next/link";
import BenLookupClient from "./BenLookupClient";

export const metadata: Metadata = {
  title: "Free BEN Tracker — Look Up Any School's E-Rate Funding | SkyRate AI",
  description:
    "Enter a Billed Entity Number (BEN) to see all FRNs, funding history, and real-time E-Rate status for any school or library. Free, no signup required.",
  keywords:
    "BEN tracker, billed entity number lookup, school E-Rate funding, library E-Rate BEN, USAC BEN lookup, free BEN tool, E-Rate funding history",
  openGraph: {
    title: "Free BEN Tracker — Look Up Any School's E-Rate Funding",
    description:
      "Enter any Billed Entity Number to see the entity's complete E-Rate funding history — FRN list, status, committed amounts, and service providers. Free, no login.",
    url: "https://skyrate.ai/tools/ben-tracker",
    type: "website",
    siteName: "SkyRate AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free BEN Tracker — E-Rate BEN Lookup",
    description: "Free, no-signup BEN tracker. Real-time E-Rate data from USAC.",
  },
  robots: "index, follow",
  alternates: { canonical: "https://skyrate.ai/tools/ben-tracker" },
};

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is a BEN (Billed Entity Number)?",
    a: "A BEN is the unique identifier USAC assigns to every school, library, or library system that participates in the E-Rate program. Each entity has exactly one BEN, and it persists through funding years. Looking up a BEN shows you the entity's complete E-Rate funding history.",
  },
  {
    q: "How do I find a school's BEN?",
    a: "You can find a BEN in USAC's EPC portal, on any USAC commitment letter (FCDL), or by searching the USAC Open Data Portal. If you're a consultant, your clients' BENs are in their EPC accounts under 'Entity Information'.",
  },
  {
    q: "Where does this BEN tracker get its data?",
    a: "All data is sourced directly from the USAC Open Data Portal. We query USAC's public Form 471 FRN dataset in real time so the funding figures and statuses reflect USAC's most recent published data.",
  },
  {
    q: "Is this BEN tracker really free? Do I need an account?",
    a: "Yes — completely free, no signup required. Look up any BEN instantly. If you want ongoing monitoring and automatic alerts when an entity's FRNs change status, you can create a free SkyRate account.",
  },
  {
    q: "Why are no FRNs showing for a BEN?",
    a: "An entity may have no USAC records if it has never filed a certified Form 471, if the BEN is very new, or if the entity's BEN recently changed. Try searching for the entity in USAC's EPC portal to confirm the correct BEN.",
  },
];

export default function BenTrackerPage() {
  const webAppJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SkyRate Free BEN Tracker",
    url: "https://skyrate.ai/tools/ben-tracker",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Free, no-signup E-Rate Billed Entity Number (BEN) lookup showing all FRNs and funding history for any school or library.",
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
      { "@type": "ListItem", position: 3, name: "Free BEN Tracker", item: "https://skyrate.ai/tools/ben-tracker" },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/tools/frn-tracker" className="text-slate-300 hover:text-white text-sm transition-colors">
              FRN Tracker
            </Link>
            <Link href="/features" className="text-slate-300 hover:text-white text-sm transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-slate-300 hover:text-white text-sm transition-colors">
              Pricing
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-slate-300 hover:text-white text-sm transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/sign-up" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-indigo-900/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <span className="inline-block text-purple-400 text-sm font-semibold tracking-wide uppercase mb-4">
            Free Public Tool
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4">
            Free{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              BEN Tracker
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            Look up any school or library&apos;s complete E-Rate funding history by Billed Entity Number.
            Real-time data from USAC. No login required.
          </p>

          <BenLookupClient />
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">
          What You&apos;ll See for Each BEN
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { step: "1", title: "Entity Profile", desc: "Entity name, state, entity type, and USAC registration details." },
            { step: "2", title: "Funding Summary", desc: "Total committed funding across all years, total FRNs, and a status breakdown." },
            { step: "3", title: "FRN History", desc: "Every Funding Request Number — year, status badge, committed amount, and service provider." },
          ].map((s) => (
            <div key={s.step} className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-lg mx-auto mb-4">
                {s.step}
              </div>
              <h3 className="text-white font-semibold mb-2">{s.title}</h3>
              <p className="text-slate-400 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-2">{item.q}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          Want Automated BEN Monitoring?
        </h2>
        <p className="text-slate-400 mb-8">
          Track unlimited BENs automatically, get instant FRN status alerts, and manage full E-Rate
          portfolios with SkyRate AI.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-500/30"
          >
            Start Free Trial
          </Link>
          <Link
            href="/tools/frn-tracker"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition"
          >
            Try FRN Tracker Instead
          </Link>
        </div>
        <p className="text-slate-500 text-xs mt-4">14-day free trial. No credit card required.</p>
      </section>
    </main>
  );
}
