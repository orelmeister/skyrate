import Link from "next/link";
import type { Metadata } from "next";
import {
  Shield,
  Zap,
  Clock,
  CreditCard,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from "lucide-react";
import PricingClient from "@/components/PricingClient";
import PricingFAQ, { type FAQItem } from "@/components/PricingFAQ";
import PricingStickyCTA from "@/components/PricingStickyCTA";

export const metadata: Metadata = {
  title: "E-Rate Consulting & Software Pricing 2026 | SkyRate AI",
  description:
    "Transparent E-Rate software pricing for consultants, vendors, and school applicants. Free plan available, Pro from $199/mo, Enterprise custom. Save 20% on annual. No setup fees, cancel anytime.",
  keywords: [
    "e-rate consulting pricing",
    "e-rate software pricing",
    "form 471 service pricing",
    "e-rate management software cost",
    "frn tracking software pricing",
    "e-rate appeal software cost",
  ],
  alternates: { canonical: "https://skyrate.ai/pricing" },
  openGraph: {
    title: "E-Rate Software Pricing — Free, Pro, Enterprise | SkyRate AI",
    description:
      "AI-powered E-Rate management for consultants, vendors, and applicants. Start free, scale to Pro from $199/mo. Save 20% annually.",
    url: "https://skyrate.ai/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "E-Rate Software Pricing | SkyRate AI",
    description: "Free, Pro, Enterprise plans for E-Rate consultants, vendors, and applicants.",
  },
};

const FAQS: FAQItem[] = [
  {
    id: "trial",
    q: "Is there really a free plan? Do I need a credit card?",
    a: "Yes — the Free plan is permanently free, no credit card required. You can track up to 3 BENs, see real-time FRN status, and use a limited number of AI appeal generations per month. Upgrade to Pro any time when you outgrow it.",
  },
  {
    id: "scope",
    q: "How is pricing different for consultants, vendors, and applicants?",
    a: "Each role has a tailored Pro plan: Consultants ($499/mo) get unlimited portfolios + white-label reports. Vendors ($499/mo) get Form 470 lead alerts + competitor SPIN intelligence. Applicants ($199/mo) get district-level FRN tracking + denial analysis. Pick the plan that matches how you participate in E-Rate.",
  },
  {
    id: "consultant-replace",
    q: "Does SkyRate replace my E-Rate consultant?",
    a: "No — SkyRate makes consultants and applicants faster, not redundant. Many of our customers are independent E-Rate consultants who use SkyRate to manage portfolios at scale; their applicant clients see reports and alerts in real time. Districts without a consultant use SkyRate to stay on top of deadlines, denials, and budgets directly.",
  },
  {
    id: "compliance",
    q: "Is the AI Appeal Generator FCC-compliant?",
    a: "The AI Appeal Generator drafts appeal letters that cite the specific paragraphs of FCC Order 19-117 and prior USAC guidance relevant to your denial. A licensed reviewer (your consultant or in-house staff) is always required to validate and submit through EPC. SkyRate is a tool, not a replacement for legal or filing certification.",
  },
  {
    id: "usac-sync",
    q: "How does SkyRate stay in sync with USAC data?",
    a: "We pull from the public USAC Open Data API (Socrata) on a continuous schedule, plus targeted EPC-page polling for FRN status changes. Most status updates show up in your dashboard within minutes of USAC publishing them — no manual PDF downloads required.",
  },
  {
    id: "data-ownership",
    q: "Who owns the data I put into SkyRate?",
    a: "You do. We never sell or share your data. If you cancel, you can export every BEN, FRN, application, and report you've created via the in-app export tool or by request. We retain backups for 30 days post-cancellation, then permanently delete.",
  },
  {
    id: "security",
    q: "How is my data secured? Are you FERPA-aware?",
    a: "All data is encrypted in transit with 256-bit TLS and at rest on managed cloud infrastructure. Access is role-based with audit logging on Pro and Enterprise plans. We're FERPA-aware: we don't ingest student PII, and we'll sign DPAs for districts that require one. SOC 2 Type II is in progress.",
  },
  {
    id: "contract",
    q: "Is this month-to-month or am I locked in?",
    a: "Monthly plans are month-to-month — cancel any time from account settings, no fees, no questions. Annual plans renew yearly and save you 20%; you can cancel auto-renew at any time. There are no setup fees on any plan.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "SkyRate AI — Pro Plan",
  description:
    "AI-powered E-Rate management software for consultants, vendors, and school applicants. Real-time FRN tracking, AI appeal generation, Form 470 lead discovery.",
  brand: { "@type": "Brand", name: "SkyRate AI" },
  offers: [
    {
      "@type": "Offer",
      name: "Applicant Pro (Annual)",
      price: "1910",
      priceCurrency: "USD",
      url: "https://skyrate.ai/pricing",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Consultant Pro (Annual)",
      price: "4790",
      priceCurrency: "USD",
      url: "https://skyrate.ai/pricing",
      availability: "https://schema.org/InStock",
    },
    {
      "@type": "Offer",
      name: "Vendor Pro (Annual)",
      price: "4790",
      priceCurrency: "USD",
      url: "https://skyrate.ai/pricing",
      availability: "https://schema.org/InStock",
    },
  ],
};

const COMPARISON_ROWS: Array<{ dim: string; skyrate: string; diy: string }> = [
  {
    dim: "Form 470 review turnaround",
    skyrate: "Same-day AI compliance check",
    diy: "Days of back-and-forth email",
  },
  {
    dim: "FRN status visibility",
    skyrate: "Real-time, all FRNs in one view",
    diy: "Log into EPC, click each FRN",
  },
  {
    dim: "Denial-to-appeal turnaround",
    skyrate: "Hours, with FCC-cited draft",
    diy: "Weeks of manual research",
  },
  {
    dim: "Filing-window deadline misses",
    skyrate: "Proactive 30/14/7-day alerts",
    diy: "Calendar reminders, hope for the best",
  },
  {
    dim: "Category 2 budget headroom tracking",
    skyrate: "Auto-calculated per BEN",
    diy: "Spreadsheets and recalculation",
  },
  {
    dim: "Audit-ready evidence trail",
    skyrate: "Built-in, exportable",
    diy: "Reconstruct from email + PDFs",
  },
];

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold gradient-text">SkyRate</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700">
              <Link href="/features" className="hover:text-purple-700 transition">Features</Link>
              <Link href="/case-studies" className="hover:text-purple-700 transition">Case Studies</Link>
              <Link href="/pricing" className="text-purple-700 font-semibold">Pricing</Link>
              <Link href="/blog" className="hover:text-purple-700 transition">Blog</Link>
            </nav>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/sign-in"
                className="hidden sm:inline-block text-sm font-medium text-slate-700 hover:text-purple-700 px-3 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up?source=pricing-header"
                className="text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-lg shadow-sm transition"
              >
                Start free
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8 sm:pb-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-xs sm:text-sm font-medium text-purple-700 mb-4 sm:mb-6">
              <Shield className="w-3.5 h-3.5" />
              <span>Trusted by E-Rate teams managing $100M+ in annual funding</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-4 sm:mb-6">
              E-Rate consulting software{" "}
              <span className="gradient-text">that pays for itself</span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Real-time FRN tracking, AI appeal generation, and Form 470 lead discovery — built specifically
              for consultants, vendors, and school applicants. Pick the plan for how you work in E-Rate.
            </p>
          </div>
        </section>

        {/* Pricing client (audience selector + cards) */}
        <PricingClient />

        {/* Trust row */}
        <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10 border-y border-slate-200 bg-white">
          <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
            {[
              { icon: CreditCard, title: "No credit card to start" },
              { icon: Clock, title: "Cancel anytime, no fees" },
              { icon: Shield, title: "256-bit TLS, FERPA-aware" },
              { icon: CheckCircle2, title: "SOC 2 Type II in progress" },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center gap-2">
                <item.icon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" aria-hidden />
                <p className="text-xs sm:text-sm font-medium text-slate-700">{item.title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Social proof — anonymized aggregates */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <p className="text-xs sm:text-sm uppercase tracking-wider text-purple-700 font-semibold mb-2">
                Real outcomes
              </p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900">
                What customers recover with SkyRate
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                {
                  stat: "$1.2M",
                  label: "Funding recovered for one consultant in a single funding year",
                  href: "/case-studies#consultant",
                },
                {
                  stat: "~35 hrs/wk",
                  label: "Saved by a consulting firm on portfolio status checks",
                  href: "/case-studies#consultant",
                },
                {
                  stat: "9 BENs",
                  label: "Tracked in real time by a single applicant district",
                  href: "/case-studies#applicant",
                },
              ].map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className="block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-200 transition p-6 sm:p-8 text-left"
                >
                  <div className="flex items-center gap-2 text-purple-600 mb-3">
                    <TrendingUp className="w-5 h-5" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-wider">Outcome</span>
                  </div>
                  <p className="text-3xl sm:text-4xl font-bold gradient-text mb-2">{card.stat}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">{card.label}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white border-y border-slate-200">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                SkyRate vs. doing it manually
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
                The same E-Rate work, reframed by what software automates and what stays manual.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-sm sm:text-base">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-4 font-semibold text-slate-700">
                      Workflow
                    </th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-4 font-semibold text-purple-700">
                      With SkyRate
                    </th>
                    <th className="text-left px-4 sm:px-6 py-3 sm:py-4 font-semibold text-slate-500">
                      Manual / DIY
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.dim} className="hover:bg-slate-50/50">
                      <td className="px-4 sm:px-6 py-3 sm:py-4 font-medium text-slate-900">
                        {row.dim}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-slate-700">
                        <span className="inline-flex items-start gap-2">
                          <CheckCircle2
                            className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <span>{row.skyrate}</span>
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-slate-500">
                        <span className="inline-flex items-start gap-2">
                          <XCircle
                            className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 flex-shrink-0 mt-0.5"
                            aria-hidden
                          />
                          <span>{row.diy}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                Pricing &amp; plan questions
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Still on the fence? These are the questions teams ask before switching to SkyRate.
              </p>
            </div>
            <PricingFAQ items={FAQS} />
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-gradient-to-br from-purple-600 via-purple-700 to-pink-600 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
              Start free. Upgrade when you outgrow it.
            </h2>
            <p className="text-base sm:text-lg text-white/90 mb-6 sm:mb-8 max-w-2xl mx-auto">
              No credit card. No setup fees. Cancel any time. Your team can be tracking FRNs in
              under 10 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/sign-up?source=pricing-bottom-cta"
                className="w-full sm:w-auto bg-white text-purple-700 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transition text-sm sm:text-base"
              >
                Start free trial
              </Link>
              <Link
                href="/demo?source=pricing-bottom-cta"
                className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border border-white/30 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold transition text-sm sm:text-base"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 text-slate-300 px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            <div className="col-span-2 md:col-span-1">
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">SkyRate</h4>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                AI-powered E-Rate management for consultants, vendors, and school applicants.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/features" className="hover:text-white transition">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
                <li><Link href="/demo" className="hover:text-white transition">Book a demo</Link></li>
                <li><Link href="/sign-up" className="hover:text-white transition">Start free</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Company</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/case-studies" className="hover:text-white transition">Case Studies</Link></li>
                <li><Link href="/blog" className="hover:text-white transition">Blog</Link></li>
                <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Legal</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/privacy" className="hover:text-white transition">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition">Terms</Link></li>
                <li><Link href="/security" className="hover:text-white transition">Security</Link></li>
              </ul>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-slate-800 text-xs sm:text-sm text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>&copy; 2026 SkyRate LLC. All rights reserved.</p>
            <p className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" aria-hidden /> Built for E-Rate teams.
            </p>
          </div>
        </footer>

        {/* Mobile sticky CTA */}
        <PricingStickyCTA />
      </div>
    </>
  );
}
