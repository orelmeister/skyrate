import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Search, BarChart3, Bell, Target, Users, TrendingUp, DollarSign, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Form 470 Lead Finder | SkyRate AI",
  description: "Find E-Rate Form 470 opportunities instantly. Track vendor SPIN status, analyze competitors, and discover school leads with AI-powered market intelligence.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/vendors" },
  openGraph: {
    title: "E-Rate Form 470 Lead Finder | SkyRate AI",
    description: "Find E-Rate Form 470 opportunities and track vendor intelligence.",
    url: "https://skyrate.ai/features/vendors",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function VendorsFeaturePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features/consultants" className="text-slate-300 hover:text-white text-sm transition-colors">
              For Consultants
            </Link>
            <Link href="/features/vendors" className="text-purple-300 text-sm font-medium">
              For Vendors
            </Link>
            <Link href="/features/applicants" className="text-slate-300 hover:text-white text-sm transition-colors">
              For Applicants
            </Link>
            <Link href="/pricing" className="text-slate-300 hover:text-white text-sm transition-colors">
              Pricing
            </Link>
            <Link href="/blog" className="text-slate-300 hover:text-white text-sm transition-colors">
              Blog
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-slate-300 hover:text-white text-sm transition-colors hidden sm:block"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-indigo-900/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <span className="inline-block text-purple-400 text-sm font-semibold tracking-wide uppercase mb-4">
            For E-Rate Vendors
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Find E-Rate Form 470 Opportunities{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Instantly
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Search Form 470 filings by manufacturer, track your SPIN status, analyze competitor
            activity, and discover new school leads — all powered by real-time USAC data.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg shimmer-btn"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 border border-slate-600 hover:border-slate-400 text-slate-200 hover:text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Pain Point Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Stop missing E-Rate opportunities.{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Start winning more bids.
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              E-Rate vendors waste hours sifting through USAC portals, searching for Form 470s
              that match their products. By the time you find a lead, competitors have already
              responded. SkyRate AI changes that.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Pain Points */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm font-bold">✕</span>
                Without SkyRate AI
              </h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Manually searching the USAC portal for Form 470 filings that match your products
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  No visibility into competitor bids, win rates, or market positioning
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Missing high-value opportunities because you discovered them too late
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Hours spent researching school budgets and contact information for each lead
                </li>
              </ul>
            </div>
            {/* Solutions */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-purple-200 ring-1 ring-purple-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold">✓</span>
                With SkyRate AI
              </h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Instantly search and filter Form 470s by manufacturer, category, or state
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Competitor analysis showing who&apos;s winning bids in your territory
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Real-time alerts when new Form 470s match your product lines
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Automatic contact enrichment and C2 budget lookups for every lead
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Everything you need to find and win E-Rate opportunities
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Purpose-built tools for E-Rate vendors who want to discover leads faster, understand
              market dynamics, and close more deals with schools and libraries.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1: Form 470 Lead Discovery */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Search className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Form 470 Lead Discovery
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Search and filter Form 470 filings by manufacturer, service category, state, and
                filing date. Find opportunities that match your product lines before your competitors
                do. SkyRate AI pulls directly from USAC&apos;s database so you always have the
                latest filings at your fingertips — no more manual portal searches.
              </p>
              <Link
                href="/features/form-470-tracking"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                Explore Form 470 search
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 2: SPIN Status Tracking */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Bell className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                SPIN Status Tracking
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Monitor your Service Provider Identification Number status in real time. Get instant
                alerts for status changes, compliance issues, and renewal deadlines. SkyRate AI
                tracks your SPIN across all USAC systems and flags any issues that could impact your
                eligibility to participate in the E-Rate program — keeping you compliant and ready
                to bid.
              </p>
            </article>

            {/* Feature 3: Competitor Intelligence */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Target className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Competitor Intelligence
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                See which vendors are winning bids in your territory and service categories. Analyze
                competitor pricing, win rates, and market positioning with data pulled directly from
                USAC records. Understand where your competitors are strong, where they&apos;re weak,
                and where you can carve out market share in the E-Rate ecosystem.
              </p>
            </article>

            {/* Feature 4: Market Intelligence */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <TrendingUp className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Market Intelligence
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Identify trends in E-Rate spending by category, region, and school size. Make
                data-driven decisions about which markets to target, which product lines to
                prioritize, and where to allocate your sales resources. SkyRate AI aggregates
                billions of dollars in E-Rate funding data to give you actionable market insights.
              </p>
            </article>

            {/* Feature 5: C2 Budget Research */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-5">
                <DollarSign className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                C2 Budget Research
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Look up Category 2 budgets for any school or library before you bid. Know exactly
                how much funding is available, what&apos;s already been committed, and what remains.
                SkyRate AI connects to USAC&apos;s C2 Budget Tool so you can qualify leads quickly
                and focus your effort on schools with real purchasing power.
              </p>
            </article>

            {/* Feature 6: Contact Enrichment */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <Users className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Contact Enrichment
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Automatically find decision-maker contact information for schools filing Form 470s.
                Powered by Hunter.io integration, SkyRate AI identifies technology directors, IT
                coordinators, and procurement officers at each school — giving you verified email
                addresses and direct contacts so you can reach the right person, fast.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-gradient-to-br from-purple-700 via-indigo-700 to-purple-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Real-time E-Rate market intelligence
            </h2>
            <p className="text-purple-200 text-lg">
              Powered by live USAC data updated daily.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">10,000+</p>
              <p className="text-purple-200 font-medium">Form 470s Tracked</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">$500M+</p>
              <p className="text-purple-200 font-medium">In Opportunities</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">Real-Time</p>
              <p className="text-purple-200 font-medium">USAC Data</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Start finding Form 470 leads today
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. Discover E-Rate opportunities
            faster, track your SPIN status, and outmaneuver the competition with AI-powered vendor
            intelligence from SkyRate AI.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 font-semibold text-lg transition-colors"
            >
              See vendor pricing
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-12">
            {/* Brand Column */}
            <div className="lg:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
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
              </Link>
              <p className="text-slate-400 text-sm leading-relaxed">
                AI-powered E-Rate funding intelligence for consultants, vendors, and applicants.
              </p>
            </div>

            {/* Features */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Features</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/features/consultants" className="text-slate-400 hover:text-white text-sm transition-colors">
                    For Consultants
                  </Link>
                </li>
                <li>
                  <Link href="/features/vendors" className="text-slate-400 hover:text-white text-sm transition-colors">
                    For Vendors
                  </Link>
                </li>
                <li>
                  <Link href="/features/applicants" className="text-slate-400 hover:text-white text-sm transition-colors">
                    For Applicants
                  </Link>
                </li>
                <li>
                  <Link href="/features/form-470-tracking" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Form 470 Tracking
                  </Link>
                </li>
              </ul>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/pricing" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/features/appeal-generator" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Appeal Generator
                  </Link>
                </li>
                <li>
                  <Link href="/features/frn-monitoring" className="text-slate-400 hover:text-white text-sm transition-colors">
                    FRN Monitoring
                  </Link>
                </li>
                <li>
                  <Link href="/features/denial-analysis" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Denial Analysis
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/about" className="text-slate-400 hover:text-white text-sm transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Blog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/terms" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center">
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
