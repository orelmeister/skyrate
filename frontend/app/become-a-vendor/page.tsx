import Link from "next/link";
import type { Metadata } from "next";
import {
  Shield,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Trophy,
  Wifi,
  Cable,
  Phone,
  Server,
  Globe,
  ArrowRight,
} from "lucide-react";
import VendorEligibilityForm from "./VendorEligibilityForm";

export const metadata: Metadata = {
  title: "Become an E-Rate Vendor — Get Your SPIN (Done-For-You) | SkyRate",
  description:
    "Already selling to schools? Get registered as an E-Rate service provider. We file your FCC Form 498, get your SPIN, and set you up to win district contracts. Done-for-you for $2,500.",
  keywords: [
    "become an e-rate vendor",
    "e-rate service provider registration",
    "get an e-rate spin number",
    "fcc form 498",
    "e-rate spin",
  ],
  alternates: { canonical: "https://skyrate.ai/become-a-vendor" },
  openGraph: {
    title: "Become an E-Rate Vendor — Get Your SPIN (Done-For-You) | SkyRate",
    description:
      "Already selling to schools? We file your FCC Form 498, get your SPIN, and set you up to win district contracts. Done-for-you for $2,500.",
    url: "https://skyrate.ai/become-a-vendor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Become an E-Rate Vendor — Get Your SPIN | SkyRate",
    description:
      "We file your FCC Form 498, get your SPIN, and set you up to win district contracts. Done-for-you for $2,500.",
  },
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What's a SPIN?",
    a: "A Service Provider Identification Number (also called your 498 ID). It's your federal ID as an E-Rate vendor — issued when you file FCC Form 498. Without it, a school can't pay you through E-Rate.",
  },
  {
    q: "How long does it take?",
    a: "Typically a couple of weeks once we have your info. We handle the filing; you just provide company + banking details and certify.",
  },
  {
    q: "Do I need E-Rate experience?",
    a: "No. That's the point — we're the E-Rate experts. You stay focused on selling.",
  },
  {
    q: "What does it cost the school?",
    a: "Nothing extra — E-Rate reimburses the district. Being registered just makes you the eligible vendor.",
  },
  {
    q: "What's the catch?",
    a: "No catch. There's a one-time filing certification only your company's authorized officer can sign — we prep everything and walk you through it.",
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

const serviceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "E-Rate Vendor Onboarding — Done-For-You SPIN Registration",
  description:
    "We register your company as an E-Rate service provider: file your FCC Form 498, get your SPIN issued, and set up your EPC account so you can win district contracts.",
  provider: { "@type": "Organization", name: "SkyRate LLC" },
  areaServed: "US",
  offers: {
    "@type": "Offer",
    price: "2500",
    priceCurrency: "USD",
    url: "https://skyrate.ai/become-a-vendor",
    availability: "https://schema.org/InStock",
  },
};

const SELL_ITEMS = [
  { icon: Globe, label: "Internet / broadband / fiber" },
  { icon: Wifi, label: "Wi-Fi, switches, routers, firewalls, access points" },
  { icon: Cable, label: "Structured cabling & low-voltage" },
  { icon: Phone, label: "Phone / VoIP systems" },
  { icon: Server, label: "Managed IT / network services" },
];

const STEPS = [
  {
    icon: ClipboardCheck,
    title: "Eligibility check",
    body: "Answer a few questions (60 seconds). We confirm you're a fit.",
  },
  {
    icon: FileCheck2,
    title: "We register you",
    body: "We set up your EPC account, file your FCC Form 498, and get your SPIN issued — plus your annual certification (SPAC).",
  },
  {
    icon: Trophy,
    title: "You start winning",
    body: "You're now a registered E-Rate vendor. Use SkyRate to find bids, respond to Form 470s, track your funding, and invoice USAC.",
  },
];

const INCLUDED = [
  "Get your prerequisites in order: UEI (SAM.gov), FCC Registration Number (FCC CORES), and DUNS",
  "File your FCC Form 498 in USAC's E-File system → your 498 ID / SPIN issued",
  "Banking + tax setup (routing/account #, EIN) so USAC can pay you, incl. verification docs",
  "E-Rate Productivity Center (EPC) account setup so you can file program forms and respond to bids",
  "We prep everything so your Company Officer just certifies (USAC gives them 14 days)",
  "A walkthrough of how to respond to Form 470 bids and how to get paid (SPI/BEAR)",
  "Guidance on staying active year to year (annual certification)",
];

export default function BecomeAVendorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />

      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        {/* Header — matches site-wide header */}
        <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
              <span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 lg:gap-8">
              <Link href="/features/consultants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Consultants</Link>
              <Link href="/features/vendors" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Vendors</Link>
              <Link href="/features/applicants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Applicants</Link>
              <Link href="/pricing" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">Pricing</Link>
              <Link href="/blog" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">Blog</Link>
            </nav>

            <div className="flex items-center gap-3">
              <a href="tel:855-765-7291" className="hidden lg:flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                (855) 765-7291
              </a>
              <a
                href={process.env.NEXT_PUBLIC_LINKEDIN_URL || "https://www.linkedin.com/company/skyrate-llc"}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="SkyRate on LinkedIn"
                className="hidden lg:flex items-center text-slate-400 hover:text-white transition"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
              </a>
              <Link href="/sign-in" className="hidden sm:inline text-slate-400 hover:text-white transition font-medium text-sm">
                Sign In
              </Link>
              <Link href="/sign-up?source=become-a-vendor-header" className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 font-medium text-sm">
                Start Free Trial
              </Link>
              <label htmlFor="mobile-menu-toggle" className="md:hidden cursor-pointer text-slate-300 hover:text-white p-2 -mr-2" aria-label="Toggle menu">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </label>
            </div>
          </div>

          {/* CSS-only mobile menu */}
          <input type="checkbox" id="mobile-menu-toggle" className="hidden peer" />
          <div className="hidden peer-checked:block md:!hidden border-t border-white/10 mt-3 pt-3 pb-1">
            <nav className="flex flex-col gap-3">
              <Link href="/features/consultants" className="text-slate-400 hover:text-white font-medium py-1">For Consultants</Link>
              <Link href="/features/vendors" className="text-slate-400 hover:text-white font-medium py-1">For Vendors</Link>
              <Link href="/features/applicants" className="text-slate-400 hover:text-white font-medium py-1">For Applicants</Link>
              <Link href="/pricing" className="text-slate-400 hover:text-white font-medium py-1">Pricing</Link>
              <Link href="/blog" className="text-slate-400 hover:text-white font-medium py-1">Blog</Link>
              <Link href="/sign-in" className="text-indigo-400 font-medium py-1 sm:hidden">Sign In</Link>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section className="px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-8 sm:pb-12">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-xs sm:text-sm font-medium text-purple-700 mb-4 sm:mb-6">
              <Shield className="w-3.5 h-3.5" />
              <span>Run by E-Rate consultants who file with USAC every day</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-4 sm:mb-6">
              Sell to schools?{" "}
              <span className="gradient-text">Get paid through E-Rate.</span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto mb-6 sm:mb-8">
              E-Rate reimburses school districts 20–90% for the internet, Wi-Fi, cabling, phones,
              and equipment they buy — but only from <em>registered</em> service providers. We get
              you registered, get you your SPIN, and set you up to start winning district contracts.
              Done for you.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="#eligibility"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transition text-sm sm:text-base"
              >
                Check if you&apos;re eligible (60 seconds) <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
              <Link
                href="/contact"
                className="w-full sm:w-auto inline-flex items-center justify-center bg-white text-slate-800 border border-slate-300 hover:border-purple-300 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold shadow-sm transition text-sm sm:text-base"
              >
                Book a free call
              </Link>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-4">
              No USAC experience required on your end.
            </p>
          </div>
        </section>

        {/* The Problem */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white border-y border-slate-200">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-10">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                You may be leaving money on the table
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
                If your company sells any of these to K-12 schools:
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-8">
              {SELL_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"
                >
                  <item.icon className="w-5 h-5 text-purple-600 flex-shrink-0" aria-hidden />
                  <span className="text-sm sm:text-base text-slate-800">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-700 leading-relaxed text-center max-w-3xl mx-auto">
              Schools get most of that reimbursed by the federal E-Rate program — but the rules say
              the district can only pay a vendor who has a <strong>SPIN</strong> (Service Provider
              Identification Number). No SPIN = you&apos;re not eligible to be the vendor of record =
              the school goes with someone who is.
            </p>
          </div>
        </section>

        {/* The Solution — 3 steps */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <p className="text-xs sm:text-sm uppercase tracking-wider text-purple-700 font-semibold mb-2">
                What we do
              </p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                We handle the paperwork so you don&apos;t have to learn USAC
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
                We&apos;re E-Rate consultants. Here&apos;s how it works — 3 steps.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                      <step.icon className="w-5 h-5 text-purple-600" aria-hidden />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What's included */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white border-y border-slate-200">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                What&apos;s included — the $2,500 package
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Onboarding only. Software to run your vendor business is separate — see pricing below.
              </p>
            </div>
            <ul className="space-y-3">
              {INCLUDED.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 sm:px-5 py-3.5"
                >
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden />
                  <span className="text-sm sm:text-base text-slate-800 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                Simple, done-for-you pricing
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
                One-time onboarding gets you your SPIN. The software to run your vendor business is
                billed separately.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Onboarding card */}
              <div className="bg-white rounded-2xl border-2 border-purple-200 shadow-md p-6 sm:p-8 flex flex-col">
                <span className="inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-100 text-xs font-semibold text-purple-700 mb-4">
                  Done-for-you
                </span>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Vendor Onboarding</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-slate-900">$2,500</span>
                  <span className="text-slate-500 text-sm">one-time</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Everything in the package above. We do the filing; you get your SPIN. One tier,
                  done for you.
                </p>
                <Link
                  href="#eligibility"
                  className="mt-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-semibold shadow-sm transition"
                >
                  Get started — $2,500 <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
              </div>

              {/* Software card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col">
                <span className="inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 mb-4">
                  Billed separately
                </span>
                <h3 className="text-lg font-bold text-slate-900 mb-1">SkyRate Vendor Software</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-slate-900">$499</span>
                  <span className="text-slate-500 text-sm">/month</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">or $5,000/year (save ~$1,000)</p>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                  Find and respond to E-Rate bids, monitor your FRNs, get paid faster, and stay
                  compliant — all in one platform.
                </p>
                <Link
                  href="/pricing"
                  className="mt-auto inline-flex items-center justify-center bg-white text-slate-800 border border-slate-300 hover:border-purple-300 px-6 py-3 rounded-lg font-semibold shadow-sm transition"
                >
                  See software pricing
                </Link>
              </div>
            </div>
            <p className="text-center text-sm text-slate-500 mt-6">
              Not sure yet?{" "}
              <Link href="/contact" className="text-purple-700 font-medium hover:underline">
                Book a free call
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Eligibility checker */}
        <section id="eligibility" className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                Check if you&apos;re eligible
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                60 seconds. We&apos;ll confirm your fit and reach out within 1 business day.
              </p>
            </div>
            <VendorEligibilityForm />
          </div>
        </section>

        {/* Why SkyRate */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900">
                Why SkyRate
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                "We file with USAC every day — this is what we do.",
                "One place for the whole journey: get registered, then run your vendor business in the same platform.",
                "You focus on selling; we handle the federal paperwork.",
              ].map((item) => (
                <div
                  key={item}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left"
                >
                  <CheckCircle2 className="w-6 h-6 text-purple-600 mb-3" aria-hidden />
                  <p className="text-sm text-slate-700 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-white border-y border-slate-200">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
                Frequently asked questions
              </h2>
            </div>
            <div className="space-y-4">
              {FAQS.map((f) => (
                <div key={f.q} className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">{f.q}</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-16 bg-gradient-to-br from-purple-600 via-purple-700 to-pink-600 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4">
              Ready to get paid through E-Rate?
            </h2>
            <p className="text-base sm:text-lg text-white/90 mb-6 sm:mb-8 max-w-2xl mx-auto">
              Check your eligibility in 60 seconds, or book a free call with our team.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="#eligibility"
                className="w-full sm:w-auto bg-white text-purple-700 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transition text-sm sm:text-base"
              >
                Check eligibility
              </Link>
              <Link
                href="/contact"
                className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border border-white/30 px-6 sm:px-8 py-3 sm:py-4 rounded-lg font-semibold transition text-sm sm:text-base"
              >
                Book a free call
              </Link>
            </div>
          </div>
        </section>

        {/* Footer — matches site-wide footer */}
        <footer className="bg-slate-900 text-slate-400 py-10 sm:py-12 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6 sm:gap-8 mb-8">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <img src="/images/logos/logo-icon-transparent.png" alt="" width={28} height={28} className="rounded-lg" />
                  <span className="text-white font-bold text-lg">SkyRate<span className="text-purple-400">.AI</span></span>
                </div>
                <p className="text-xs sm:text-sm">
                  AI-powered E-Rate intelligence for applicants, consultants, and vendors.
                </p>
                <div className="mt-3 space-y-1">
                  <a href="tel:855-765-7291" className="flex items-center gap-1.5 text-xs sm:text-sm hover:text-white transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    (855) 765-7291 <span className="text-green-400 text-[10px]">(Toll-Free)</span>
                  </a>
                  <a href="mailto:support@skyrate.ai" className="flex items-center gap-1.5 text-xs sm:text-sm hover:text-white transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    support@skyrate.ai
                  </a>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <a
                    href={process.env.NEXT_PUBLIC_LINKEDIN_URL || "https://www.linkedin.com/company/skyrate-llc"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="SkyRate on LinkedIn"
                    className="text-slate-400 hover:text-white transition"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                  </a>
                </div>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Features</h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/features/consultants" className="hover:text-white transition">For Consultants</Link></li>
                  <li><Link href="/features/vendors" className="hover:text-white transition">For Vendors</Link></li>
                  <li><Link href="/features/applicants" className="hover:text-white transition">For Applicants</Link></li>
                  <li><Link href="/features/appeal-generator" className="hover:text-white transition">Appeal Generator</Link></li>
                  <li><Link href="/features/frn-monitoring" className="hover:text-white transition">FRN Monitoring</Link></li>
                  <li><Link href="/features/form-470-tracking" className="hover:text-white transition">Form 470 Search</Link></li>
                  <li><Link href="/features/denial-analysis" className="hover:text-white transition">Denial Analysis</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Product</h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
                  <li><Link href="/become-a-vendor" className="hover:text-white transition">Become a Vendor</Link></li>
                  <li><Link href="/sign-up" className="hover:text-white transition">Free Trial</Link></li>
                  <li><Link href="/sign-in" className="hover:text-white transition">Sign In</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Resources</h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/blog" className="hover:text-white transition">Blog</Link></li>
                  <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
                  <li><a href="https://www.usac.org/e-rate/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">USAC E-Rate</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Company</h4>
                <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                  <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                  <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                  <li><Link href="/case-studies" className="hover:text-white transition">Case Studies</Link></li>
                  <li><Link href="/security" className="hover:text-white transition">Security</Link></li>
                  <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <p className="text-xs sm:text-sm">&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</p>
              <div className="flex items-center gap-4 text-xs sm:text-sm">
                <span className="flex items-center gap-1">SSL Secured</span>
                <span className="flex items-center gap-1">FERPA Ready</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
