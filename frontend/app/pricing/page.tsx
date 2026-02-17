import Link from "next/link";
import type { Metadata } from "next";
import { Shield, Zap, Clock, CreditCard, HelpCircle } from "lucide-react";
import PricingCards from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "E-Rate Software Pricing & Plans | SkyRate AI",
  description:
    "Transparent pricing for E-Rate management software. Plans for consultants ($300/mo), vendors ($199/mo), and school applicants ($200/mo). Start your 14-day free trial.",
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
    a: "Yes — annual plans save you up to 17% compared to monthly billing. For example, the Vendor plan is $199/mo monthly but only $1,999/year (equivalent to ~$167/mo).",
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
