import Link from "next/link";
import type { Metadata } from "next";
import {
  Shield,
  Zap,
  Clock,
  CreditCard,
  HelpCircle,
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
    "Transparent E-Rate software pricing for consultants, vendors, and school applicants. Free 14-day trial, no credit card required. Pro from $199/mo. Annual plans save 20%. AI-powered Form 471, FRN tracking & appeal generation.",
  keywords: [
    "e-rate consulting pricing",
    "e-rate software pricing",
    "form 471 service pricing",
    "form 470 software cost",
    "e-rate management software",
    "frn tracker pricing",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/pricing" },
  openGraph: {
    title: "E-Rate Consulting & Software Pricing 2026 | SkyRate AI",
    description:
      "Free 14-day trial. Pro plans from $199/mo for school applicants, $499/mo for consultants & vendors. Save 20% annually.",
    url: "https://skyrate.ai/pricing",
    siteName: "SkyRate AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "E-Rate Pricing | SkyRate AI",
    description: "Transparent E-Rate software pricing. 14-day free trial. Save 20% on annual plans.",
  },
};

const FAQS: FAQItem[] = [
  {
    id: "trial",
    q: "What happens after my 14-day free trial?",
    a: "You get full access to every Pro feature for 14 days with no credit card required. When the trial ends, you can choose a plan to continue, or your account will pause — you'll keep your data for 30 days in case you decide to come back.",
  },
  {
    id: "scope",
    q: "Does SkyRate work for both Category 1 and Category 2 funding?",
    a: "Yes. The platform tracks FRNs, Form 470s, Form 471s, and PIA reviews across both Category 1 (data transmission and Internet access) and Category 2 (internal connections, managed internal broadband services, and basic maintenance). C2 budget tracking is included in every Pro plan.",
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

const COMPARISON_ROWS: { dimension: string; skyrate: string; diy: string }[] = [
  {
    dimension: "Time to review one Form 470",
    skyrate: "Under 2 minutes (filtered, structured)",
    diy: "20–40 minutes (USAC PDF download)",
  },
  {
    dimension: "FRN status visibility",
    skyrate: "Real-time alerts the day USAC posts",
    diy: "Manual EPC logins, easy to miss",
  },
  {
    dimension: "Denial-to-appeal turnaround",
    skyrate: "Hours, with AI-drafted FCC citations",
    diy: "Days of FCC Order 19-117 research",
  },
  {
    dimension: "Deadline misses (470, 471, PIA, appeal)",
    skyrate: "Push + email alerts before each window",
    diy: "Spreadsheets and manual calendar entries",
  },
  {
    dimension: "C2 budget headroom per BEN",
    skyrate: "One click, live USAC numbers",
    diy: "Cross-reference USAC reports manually",
  },
  {
    dimension: "Audit-ready evidence trail",
    skyrate: "Auto-archived bid evaluations & contracts",
    diy: "Hunt through email and shared drives",
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

      <div className="min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/images/logos/logo-icon-transparent.png"
                alt=""
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-white font-bold text-xl">
                SkyRate<span className="text-purple-400">.AI</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              <Link href="/#features" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                Features
              </Link>
              <Link href="/features/consultants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Consultants
              </Link>
              <Link href="/features/vendors" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Vendors
              </Link>
              <Link href="/features/applicants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Applicants
              </Link>
              <Link href="/pricing" className="text-white transition font-medium text-sm lg:text-base">
                Pricing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/sign-in"
                className="hidden sm:inline text-slate-400 hover:text-white transition font-medium text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up?source=pricing-header"
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 font-medium text-sm"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 lg:py-24 bg-slate-950">
          <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pulse-glow" />
          <div
            className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pulse-glow"
            style={{ animationDelay: "2s" }}
          />
          <div className="mesh-gradient-bg" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 rounded-full text-sm font-medium mb-6 border border-indigo-500/20">
              <Zap className="w-4 h-4" />
              14-day free trial · No credit card · Cancel anytime
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 leading-tight">
              <span className="gradient-text">E-Rate consulting</span> software
              <br className="hidden sm:block" />
              that pays for itself
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Recover denied funding, find Form 470 leads, and never miss a deadline.
              Pick the plan for your role — or pick all three for your team.
            </p>
          </div>
        </section>

        {/* PRICING */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <PricingClient />
          </div>
        </section>

        {/* TRUST ROW */}
        <section className="px-4 sm:px-6 py-10 bg-white border-t border-slate-100">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { icon: CreditCard, title: "No credit card required" },
              { icon: Clock, title: "Cancel anytime" },
              { icon: Shield, title: "256-bit TLS · FERPA-aware" },
              { icon: CheckCircle2, title: "SOC 2 Type II in progress" },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mb-2">
                  <item.icon className="w-5 h-5" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-700">{item.title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold mb-2">
                Real outcomes
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                What customers do with SkyRate
              </h2>
              <p className="text-slate-600 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
                Composite results from districts, charter networks, and library systems
                using SkyRate AI. Identifying details have been generalized.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  metric: "$1.2M",
                  label: "Recovered in denied FY2024 funding",
                  detail: "12-school district · 3 Category 2 FRN appeals",
                  href: "/case-studies#12-school-district-recovers-denied-fy2024",
                },
                {
                  metric: "~35 hrs/wk",
                  label: "Reclaimed from Form 470 review",
                  detail: "14-campus charter network · Midwest",
                  href: "/case-studies#charter-network-form-470-review-time",
                },
                {
                  metric: "9 BENs",
                  label: "C2 budget locked in 6 months early",
                  detail: "Multi-branch library system · Northeast",
                  href: "/case-studies#library-system-c2-budget-locked-in",
                },
              ].map((c) => (
                <Link
                  key={c.metric}
                  href={c.href}
                  className="group block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg p-6 transition"
                >
                  <div className="flex items-center gap-2 text-purple-600 mb-3">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-3xl font-bold">{c.metric}</span>
                  </div>
                  <p className="text-slate-900 font-semibold mb-1">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                  <p className="mt-4 text-sm font-medium text-purple-600 group-hover:text-purple-700">
                    Read case study →
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
                SkyRate vs. doing it yourself
              </h2>
              <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto">
                What the manual E-Rate workflow looks like — and where the platform changes it.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-sm sm:text-base">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold w-1/3">
                      What you're doing
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold text-purple-700">
                      With SkyRate
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold text-slate-500">
                      Without SkyRate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.dimension}>
                      <td className="px-4 sm:px-6 py-4 font-medium text-slate-900 align-top">
                        {row.dimension}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-slate-700 align-top">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>{row.skyrate}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-slate-500 align-top">
                        <div className="flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span>{row.diy}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-600 mb-4">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Pricing & plan questions
              </h2>
              <p className="text-slate-600 mt-3 text-sm sm:text-base">
                Built for E-Rate buyers who've already read FCC Order 19-117.
              </p>
            </div>

            <PricingFAQ items={FAQS} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 bg-slate-950">
          <div className="absolute top-10 right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />

          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to maximize your{" "}
              <span className="gradient-text">E-Rate funding</span>?
            </h2>
            <p className="text-slate-400 text-base sm:text-lg mb-8 max-w-xl mx-auto">
              Start the 14-day free trial — full access, no credit card.
              Or book a 20-minute demo and we'll walk you through your real BENs.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up?source=pricing-bottom-cta"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-xl shadow-indigo-500/30 text-lg"
              >
                Start Free Trial
              </Link>
              <Link
                href="/demo?source=pricing-bottom-cta"
                className="w-full sm:w-auto px-8 py-4 border border-white/20 rounded-xl font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition text-lg"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bg-slate-900 text-slate-400 py-10 sm:py-12 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <img
                    src="/images/logos/logo-icon-transparent.png"
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-lg"
                  />
                  <span className="text-white font-bold text-lg">
                    SkyRate<span className="text-purple-400">.AI</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm">
                  AI-powered E-Rate intelligence for applicants, consultants, and vendors.
                </p>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Product
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
                  <li><Link href="/features/consultants" className="hover:text-white transition">For Consultants</Link></li>
                  <li><Link href="/features/vendors" className="hover:text-white transition">For Vendors</Link></li>
                  <li><Link href="/features/applicants" className="hover:text-white transition">For Applicants</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Resources
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/case-studies" className="hover:text-white transition">Case Studies</Link></li>
                  <li><Link href="/blog" className="hover:text-white transition">Blog</Link></li>
                  <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Legal
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <p className="text-xs sm:text-sm">
                © {new Date().getFullYear()} SkyRate AI. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-xs sm:text-sm">
                <span>SSL Secured</span>
                <span>FERPA Ready</span>
              </div>
            </div>
          </div>
        </footer>

        {/* Mobile sticky CTA */}
        <PricingStickyCTA />
      </div>
    </>
  );
}
import Link from "next/link";
import type { Metadata } from "next";
import {
  Shield,
  Zap,
  Clock,
  CreditCard,
  HelpCircle,
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
    "Transparent E-Rate software pricing for consultants, vendors, and school applicants. Free 14-day trial, no credit card required. Pro from $199/mo. Annual plans save 20%. AI-powered Form 471, FRN tracking & appeal generation.",
  keywords: [
    "e-rate consulting pricing",
    "e-rate software pricing",
    "form 471 service pricing",
    "form 470 software cost",
    "e-rate management software",
    "frn tracker pricing",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/pricing" },
  openGraph: {
    title: "E-Rate Consulting & Software Pricing 2026 | SkyRate AI",
    description:
      "Free 14-day trial. Pro plans from $199/mo for school applicants, $499/mo for consultants & vendors. Save 20% annually.",
    url: "https://skyrate.ai/pricing",
    siteName: "SkyRate AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "E-Rate Pricing | SkyRate AI",
    description: "Transparent E-Rate software pricing. 14-day free trial. Save 20% on annual plans.",
  },
};

const FAQS: FAQItem[] = [
  {
    id: "trial",
    q: "What happens after my 14-day free trial?",
    a: "You get full access to every Pro feature for 14 days with no credit card required. When the trial ends, you can choose a plan to continue, or your account will pause — you'll keep your data for 30 days in case you decide to come back.",
  },
  {
    id: "scope",
    q: "Does SkyRate work for both Category 1 and Category 2 funding?",
    a: "Yes. The platform tracks FRNs, Form 470s, Form 471s, and PIA reviews across both Category 1 (data transmission and Internet access) and Category 2 (internal connections, managed internal broadband services, and basic maintenance). C2 budget tracking is included in every Pro plan.",
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

const COMPARISON_ROWS: { dimension: string; skyrate: string; diy: string }[] = [
  {
    dimension: "Time to review one Form 470",
    skyrate: "Under 2 minutes (filtered, structured)",
    diy: "20–40 minutes (USAC PDF download)",
  },
  {
    dimension: "FRN status visibility",
    skyrate: "Real-time alerts the day USAC posts",
    diy: "Manual EPC logins, easy to miss",
  },
  {
    dimension: "Denial-to-appeal turnaround",
    skyrate: "Hours, with AI-drafted FCC citations",
    diy: "Days of FCC Order 19-117 research",
  },
  {
    dimension: "Deadline misses (470, 471, PIA, appeal)",
    skyrate: "Push + email alerts before each window",
    diy: "Spreadsheets and manual calendar entries",
  },
  {
    dimension: "C2 budget headroom per BEN",
    skyrate: "One click, live USAC numbers",
    diy: "Cross-reference USAC reports manually",
  },
  {
    dimension: "Audit-ready evidence trail",
    skyrate: "Auto-archived bid evaluations & contracts",
    diy: "Hunt through email and shared drives",
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

      <div className="min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/images/logos/logo-icon-transparent.png"
                alt=""
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-white font-bold text-xl">
                SkyRate<span className="text-purple-400">.AI</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              <Link href="/#features" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                Features
              </Link>
              <Link href="/features/consultants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Consultants
              </Link>
              <Link href="/features/vendors" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Vendors
              </Link>
              <Link href="/features/applicants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
                For Applicants
              </Link>
              <Link href="/pricing" className="text-white transition font-medium text-sm lg:text-base">
                Pricing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/sign-in"
                className="hidden sm:inline text-slate-400 hover:text-white transition font-medium text-sm"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up?source=pricing-header"
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 font-medium text-sm"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </header>

        {/* HERO */}
        <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 lg:py-24 bg-slate-950">
          <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pulse-glow" />
          <div
            className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pulse-glow"
            style={{ animationDelay: "2s" }}
          />
          <div className="mesh-gradient-bg" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 rounded-full text-sm font-medium mb-6 border border-indigo-500/20">
              <Zap className="w-4 h-4" />
              14-day free trial · No credit card · Cancel anytime
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 leading-tight">
              <span className="gradient-text">E-Rate consulting</span> software
              <br className="hidden sm:block" />
              that pays for itself
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Recover denied funding, find Form 470 leads, and never miss a deadline.
              Pick the plan for your role — or pick all three for your team.
            </p>
          </div>
        </section>

        {/* PRICING */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto">
            <PricingClient />
          </div>
        </section>

        {/* TRUST ROW */}
        <section className="px-4 sm:px-6 py-10 bg-white border-t border-slate-100">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { icon: CreditCard, title: "No credit card required" },
              { icon: Clock, title: "Cancel anytime" },
              { icon: Shield, title: "256-bit TLS · FERPA-aware" },
              { icon: CheckCircle2, title: "SOC 2 Type II in progress" },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mb-2">
                  <item.icon className="w-5 h-5" />
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-700">{item.title}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold mb-2">
                Real outcomes
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                What customers do with SkyRate
              </h2>
              <p className="text-slate-600 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
                Composite results from districts, charter networks, and library systems
                using SkyRate AI. Identifying details have been generalized.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  metric: "$1.2M",
                  label: "Recovered in denied FY2024 funding",
                  detail: "12-school district · 3 Category 2 FRN appeals",
                  href: "/case-studies#12-school-district-recovers-denied-fy2024",
                },
                {
                  metric: "~35 hrs/wk",
                  label: "Reclaimed from Form 470 review",
                  detail: "14-campus charter network · Midwest",
                  href: "/case-studies#charter-network-form-470-review-time",
                },
                {
                  metric: "9 BENs",
                  label: "C2 budget locked in 6 months early",
                  detail: "Multi-branch library system · Northeast",
                  href: "/case-studies#library-system-c2-budget-locked-in",
                },
              ].map((c) => (
                <Link
                  key={c.metric}
                  href={c.href}
                  className="group block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg p-6 transition"
                >
                  <div className="flex items-center gap-2 text-purple-600 mb-3">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-3xl font-bold">{c.metric}</span>
                  </div>
                  <p className="text-slate-900 font-semibold mb-1">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                  <p className="mt-4 text-sm font-medium text-purple-600 group-hover:text-purple-700">
                    Read case study →
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON TABLE */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
                SkyRate vs. doing it yourself
              </h2>
              <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto">
                What the manual E-Rate workflow looks like — and where the platform changes it.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-sm sm:text-base">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold w-1/3">
                      What you're doing
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold text-purple-700">
                      With SkyRate
                    </th>
                    <th scope="col" className="px-4 sm:px-6 py-4 font-semibold text-slate-500">
                      Without SkyRate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.dimension}>
                      <td className="px-4 sm:px-6 py-4 font-medium text-slate-900 align-top">
                        {row.dimension}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-slate-700 align-top">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>{row.skyrate}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-slate-500 align-top">
                        <div className="flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span>{row.diy}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-600 mb-4">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Pricing & plan questions
              </h2>
              <p className="text-slate-600 mt-3 text-sm sm:text-base">
                Built for E-Rate buyers who've already read FCC Order 19-117.
              </p>
            </div>

            <PricingFAQ items={FAQS} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 bg-slate-950">
          <div className="absolute top-10 right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />

          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to maximize your{" "}
              <span className="gradient-text">E-Rate funding</span>?
            </h2>
            <p className="text-slate-400 text-base sm:text-lg mb-8 max-w-xl mx-auto">
              Start the 14-day free trial — full access, no credit card.
              Or book a 20-minute demo and we'll walk you through your real BENs.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up?source=pricing-bottom-cta"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-xl shadow-indigo-500/30 text-lg"
              >
                Start Free Trial
              </Link>
              <Link
                href="/demo?source=pricing-bottom-cta"
                className="w-full sm:w-auto px-8 py-4 border border-white/20 rounded-xl font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition text-lg"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bg-slate-900 text-slate-400 py-10 sm:py-12 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <img
                    src="/images/logos/logo-icon-transparent.png"
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-lg"
                  />
                  <span className="text-white font-bold text-lg">
                    SkyRate<span className="text-purple-400">.AI</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm">
                  AI-powered E-Rate intelligence for applicants, consultants, and vendors.
                </p>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Product
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
                  <li><Link href="/features/consultants" className="hover:text-white transition">For Consultants</Link></li>
                  <li><Link href="/features/vendors" className="hover:text-white transition">For Vendors</Link></li>
                  <li><Link href="/features/applicants" className="hover:text-white transition">For Applicants</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Resources
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/case-studies" className="hover:text-white transition">Case Studies</Link></li>
                  <li><Link href="/blog" className="hover:text-white transition">Blog</Link></li>
                  <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                  Legal
                </h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <p className="text-xs sm:text-sm">
                © {new Date().getFullYear()} SkyRate AI. All rights reserved.
              </p>
              <div className="flex items-center gap-4 text-xs sm:text-sm">
                <span>SSL Secured</span>
                <span>FERPA Ready</span>
              </div>
            </div>
          </div>
        </footer>

        {/* Mobile sticky CTA */}
        <PricingStickyCTA />
      </div>
    </>
  );
}
import Link from "next/link";
import type { Metadata } from "next";
import { Shield, Zap, Clock, CreditCard, HelpCircle } from "lucide-react";
import PricingCards from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "E-Rate Software Pricing & Plans | SkyRate AI",
  description:
    "Transparent pricing for E-Rate management software. Plans for consultants ($499/mo), vendors ($499/mo), and school applicants ($199/mo). Start your 14-day free trial.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/pricing" },
  openGraph: {
    title: "E-Rate Software Pricing & Plans | SkyRate AI",
    description:
      "Transparent pricing for E-Rate management software. Start your 14-day free trial.",
    url: "https://skyrate.ai/pricing",
    siteName: "SkyRate AI",
    type: "website",
  },
};

const faqs = [
  {
    q: "What happens after my 14-day free trial?",
    a: "After your trial ends, you'll be prompted to choose a subscription plan to continue using SkyRate AI. You won't be charged during the trial period, and you can cancel at any time before it ends.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes! You can upgrade or downgrade your plan at any time from your account settings. If you upgrade, the change takes effect immediately with prorated billing. Downgrades apply at the start of your next billing cycle.",
  },
  {
    q: "Is there a discount for paying annually?",
    a: "Yes — annual plans save you up to 17% compared to monthly billing. For example, the Vendor plan is $499/mo monthly but only $4,999/year (equivalent to ~$417/mo).",
  },
  {
    q: "Do you offer discounts for multiple users?",
    a: "We offer custom enterprise pricing for organizations that need multiple seats. Contact us to discuss volume pricing for your team.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover) processed securely through Stripe. We also support ACH bank transfers for annual plans.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. We use 256-bit SSL encryption for all data in transit, and our infrastructure is hosted on secure cloud servers. We are FERPA-aware and never share your data with third parties. See our Privacy Policy for full details.",
  },
  {
    q: "Can I cancel my subscription at any time?",
    a: "Yes, you can cancel any time from your account settings. You'll continue to have access until the end of your current billing period. We don't charge cancellation fees.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ════════════════════ HEADER ════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/logos/logo-icon-transparent.png"
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="text-white font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link href="/#features" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
              Features
            </Link>
            <Link href="/features/consultants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
              For Consultants
            </Link>
            <Link href="/features/vendors" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
              For Vendors
            </Link>
            <Link href="/features/applicants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">
              For Applicants
            </Link>
            <Link href="/pricing" className="text-white transition font-medium text-sm lg:text-base">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="hidden sm:inline text-slate-400 hover:text-white transition font-medium text-sm"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 font-medium text-sm"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* ════════════════════ HERO (Dark) ════════════════════ */}
      <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 lg:py-24 bg-slate-950">
        <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pulse-glow" />
        <div
          className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pulse-glow"
          style={{ animationDelay: "2s" }}
        />
        <div className="mesh-gradient-bg" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 rounded-full text-sm font-medium mb-6 border border-indigo-500/20">
            <Zap className="w-4 h-4" />
            14-Day Free Trial — No Credit Card Required
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 leading-tight">
            Simple, Transparent{" "}
            <span className="gradient-text">E-Rate Software</span> Pricing
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your role. Every plan includes full access to AI-powered tools,
            real-time USAC data, and dedicated support.
          </p>
        </div>
      </section>

      {/* ════════════════════ PRICING CARDS (Light) ════════════════════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <PricingCards />
        </div>
      </section>

      {/* ════════════════════ ALL PLANS INCLUDE ════════════════════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-10">
            All Plans Include
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              {
                icon: Clock,
                title: "14-Day Free Trial",
                desc: "Full access to every feature, no strings attached",
              },
              {
                icon: CreditCard,
                title: "No Credit Card Required",
                desc: "Start exploring immediately — pay when you're ready",
              },
              {
                icon: Zap,
                title: "Cancel Anytime",
                desc: "No long-term contracts or cancellation fees",
              },
              {
                icon: Shield,
                title: "256-Bit Encryption",
                desc: "Enterprise-grade security for all your data",
              },
            ].map((item) => (
              <div key={item.title} className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-1">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ FAQ ════════════════════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-100 text-purple-600 mb-4">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <summary className="flex items-center justify-between cursor-pointer px-5 sm:px-6 py-4 sm:py-5 text-left font-semibold text-slate-900 hover:text-purple-700 transition text-sm sm:text-base list-none">
                  {faq.q}
                  <svg
                    className="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <div className="px-5 sm:px-6 pb-4 sm:pb-5 text-sm sm:text-base text-slate-600 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ CTA ════════════════════ */}
      <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 bg-slate-950">
        <div className="absolute top-10 right-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Maximize Your{" "}
            <span className="gradient-text">E-Rate Funding</span>?
          </h2>
          <p className="text-slate-400 text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Join hundreds of E-Rate professionals already using SkyRate AI to save time,
            win more appeals, and never miss a funding opportunity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-xl shadow-indigo-500/30 text-lg"
            >
              Start Your 14-Day Free Trial
            </Link>
            <Link
              href="/#demo"
              className="w-full sm:w-auto px-8 py-4 border border-white/20 rounded-xl font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition text-lg flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
              Watch Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer className="bg-slate-900 text-slate-400 py-10 sm:py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <img
                  src="/images/logos/logo-icon-transparent.png"
                  alt=""
                  width={28}
                  height={28}
                  className="rounded-lg"
                />
                <span className="text-white font-bold text-lg">
                  SkyRate<span className="text-purple-400">.AI</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm">
                AI-powered E-Rate intelligence for applicants, consultants, and vendors.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                Product
              </h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li>
                  <Link href="/pricing" className="hover:text-white transition">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/features/consultants" className="hover:text-white transition">
                    For Consultants
                  </Link>
                </li>
                <li>
                  <Link href="/features/vendors" className="hover:text-white transition">
                    For Vendors
                  </Link>
                </li>
                <li>
                  <Link href="/features/applicants" className="hover:text-white transition">
                    For Applicants
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                Resources
              </h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li>
                  <Link href="/blog" className="hover:text-white transition">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-white transition">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">
                Legal
              </h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li>
                  <Link href="/privacy" className="hover:text-white transition">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white transition">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm">
              © {new Date().getFullYear()} SkyRate AI. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs sm:text-sm">
              <span className="flex items-center gap-1">🔒 SSL Secured</span>
              <span className="flex items-center gap-1">✓ FERPA Ready</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
