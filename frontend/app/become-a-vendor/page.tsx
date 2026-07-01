import Link from "next/link";
import type { Metadata } from "next";
import {
  Shield,
  Zap,
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
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold gradient-text">SkyRate</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700">
              <Link href="/features" className="hover:text-purple-700 transition">Features</Link>
              <Link href="/case-studies" className="hover:text-purple-700 transition">Case Studies</Link>
              <Link href="/pricing" className="hover:text-purple-700 transition">Pricing</Link>
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
                href="#eligibility"
                className="text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-lg shadow-sm transition"
              >
                Check eligibility
              </Link>
            </div>
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
                <li><Link href="/become-a-vendor" className="hover:text-white transition">Become a Vendor</Link></li>
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
      </div>
    </>
  );
}
