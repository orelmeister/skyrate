import { Metadata } from "next";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import Link from "next/link";
import DemoClient from "./DemoClient";

export const metadata: Metadata = {
  title: "SkyRate Live Demo — See E-Rate Tracking in Action | SkyRate AI",
  description:
    "Walk through a live SkyRate AI dashboard with sample E-Rate funding data. See how consultants, vendors, and applicants track FRNs, BENs, and Form 470 filings in real time. No login required.",
  alternates: { canonical: "https://skyrate.ai/demo" },
  openGraph: {
    title: "SkyRate AI — Live Interactive Demo",
    description:
      "See how SkyRate AI tracks FRNs, BENs, and Form 470 filings. Sample data, no login required.",
    url: "https://skyrate.ai/demo",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const FAQ = [
  {
    q: "Is the data on this demo real?",
    a: "No — every BEN, FRN, applicant name, and dollar amount on the demo page is synthetic. It's modeled to mirror typical SkyRate dashboards but contains no real customer data.",
  },
  {
    q: "Do I need to sign up to see the demo?",
    a: "No. The demo is fully public. When you're ready to track your own BENs and FRNs, you can sign up for a 14-day free trial at /sign-up.",
  },
  {
    q: "What can SkyRate AI do that this demo shows?",
    a: "The demo simulates the consultant dashboard: a portfolio of schools/districts, FRN status across multiple funding years, denied applications eligible for AI appeal generation, and Form 470 filings under review.",
  },
  {
    q: "Can I try the AI appeal generator in the demo?",
    a: "The demo shows where AI appeal letters appear in the workflow but does not produce live letters — those require a paid account because they consume LLM tokens. Sign up for a free trial to generate one yourself.",
  },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <MarketingHeader />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-200">DEMO — Sample data only</p>
            <p className="text-sm text-amber-100/80">
              All BENs, FRNs, dollar amounts, and applicant names below are synthetic.
              {" "}
              Want to see it with <strong>your</strong> real USAC portfolio?{" "}
              <Link href="/book-demo?source=demo-banner" className="underline font-semibold hover:text-white">
                Book a 15-min custom demo
              </Link>
              .
            </p>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold mb-2">SkyRate AI Live Demo</h1>
        <p className="text-slate-400 mb-8 max-w-2xl">
          A walk-through of the consultant dashboard. Browse sample BENs across funding
          years FY2024–FY2026, click into FRNs to see USAC status, and explore where
          AI-generated appeal letters appear when an FRN is denied.
        </p>

        <DemoClient />

        <section className="mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold mb-4">Frequently asked</h2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <details key={f.q} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <summary className="font-semibold cursor-pointer">{f.q}</summary>
                <p className="text-slate-300 text-sm mt-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 border border-indigo-500/40 rounded-2xl p-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">Want this with your real USAC portfolio?</h2>
          <p className="text-slate-300 mb-5">15-minute custom walkthrough on your own BENs and FRNs · No commitment</p>
          <Link
            href="/book-demo?source=demo-cta"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition"
          >
            Book a custom demo →
          </Link>
          <p className="mt-4 text-sm text-slate-300">
            Prefer hands-on?{" "}
            <Link
              href="/sign-up?source=demo-page"
              className="font-semibold text-white underline hover:text-purple-200"
            >
              Start a 14-day free trial →
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
