import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Search, Filter, Bell, Target, MapPin, TrendingUp, Bookmark, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Form 470 Search Tool | SkyRate AI",
  description: "Search and track E-Rate Form 470 filings. Filter by manufacturer, category, state, and date. Find new school and library opportunities for your products and services.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/form-470-tracking" },
  openGraph: {
    title: "E-Rate Form 470 Search Tool | SkyRate AI",
    description: "Search and track E-Rate Form 470 filings to find new opportunities.",
    url: "https://skyrate.ai/features/form-470-tracking",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function Form470TrackingFeaturePage() {
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
            <Link href="/features/vendors" className="text-slate-300 hover:text-white text-sm transition-colors">
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
            Form 470 Search &amp; Tracking
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Search &amp; Track Form 470{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Opportunities
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Find the E-Rate opportunities that matter to your business. SkyRate AI indexes every
            Form 470 filing and lets you search by manufacturer, product category, state, and more —
            so you can discover leads before your competitors do.
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

      {/* Why Form 470 Tracking Matters */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Your Competitive Edge in{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                E-Rate Sales
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Every E-Rate funding cycle, schools and libraries file thousands of Form 470s requesting
              bids on technology products and services. The vendors who find these filings first win
              the most business. SkyRate AI gives you that first-mover advantage.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6">
                How Form 470 Lead Discovery Works
              </h3>
              <p className="text-slate-600 mb-6 leading-relaxed">
                When a school or library needs E-Rate-funded technology, they file a Form 470 with
                USAC to solicit competitive bids. This form describes exactly what products or
                services they need, their budget, timeline, and contact information. As an E-Rate
                vendor, these filings are your primary source of qualified leads.
              </p>
              <p className="text-slate-600 mb-6 leading-relaxed">
                SkyRate AI monitors the USAC database continuously, indexes new Form 470 filings as
                they appear, and alerts you when a filing matches your product categories,
                manufacturers, or target geography. Instead of manually searching USAC&apos;s
                clunky portal, you get curated leads delivered to your dashboard.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">Search by manufacturer name (Cisco, Aruba, Ruckus, Juniper, etc.)</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">Filter by E-Rate category (C1 or C2), state, and filing date</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">Get alerts when new filings match your criteria</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">Export lead lists for your CRM or sales team</span>
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Example Search Filters</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm font-medium text-slate-500 mb-1">Manufacturer</p>
                  <p className="text-slate-900 font-medium">Cisco Systems, Aruba Networks</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm font-medium text-slate-500 mb-1">Category</p>
                  <p className="text-slate-900 font-medium">Category 2 — Internal Connections</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm font-medium text-slate-500 mb-1">State</p>
                  <p className="text-slate-900 font-medium">California, Texas, Florida</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm font-medium text-slate-500 mb-1">Filing Date</p>
                  <p className="text-slate-900 font-medium">Last 30 days</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Powerful Form 470 Search &amp; Tracking Features
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Everything E-Rate vendors need to find, track, and win more Form 470 opportunities
              across the country.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Search className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Advanced Search Filters
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Search Form 470 filings with precision filters including manufacturer name, product
                category (Category 1 or Category 2), state, district, filing date range, and
                keyword. Combine multiple filters to zero in on the exact opportunities that match
                your product portfolio and sales territory.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Building2 className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Manufacturer-Based Lead Discovery
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Find every Form 470 that mentions your manufacturer or product line. Whether you
                sell Cisco, Aruba, Ruckus, Juniper, Fortinet, or any other E-Rate eligible brand,
                SkyRate AI surfaces filings where schools are specifically requesting your products.
                Stop missing opportunities hidden in dense filing documents.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Bell className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Real-Time Filing Alerts
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Set up saved searches and receive instant notifications when new Form 470 filings
                match your criteria. Be the first vendor to respond to a school&apos;s technology
                request. Alerts are delivered via email and dashboard notifications so you can act
                quickly regardless of where you are.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <Target className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Competitive Bidding Intelligence
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Understand the competitive landscape for each Form 470. See which vendors have
                responded to similar filings in the past, track win rates, and identify market gaps
                where your products have the strongest competitive advantage. Use data-driven
                insights to prioritize the opportunities most likely to convert.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <Bookmark className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Saved Lead Lists
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Save, organize, and export your best leads for follow-up. Create custom lead lists
                by region, product category, or priority level. Export to CSV for import into your
                CRM. Share lead lists with your sales team to coordinate outreach and avoid
                duplicate efforts across your organization.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <MapPin className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Geographic Targeting
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Focus your efforts on the states, districts, and regions where you have the
                strongest presence. SkyRate AI lets you define your target geography and
                automatically surfaces Form 470 filings within your territory. Expand into new
                markets strategically with data about filing volume by region.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Social Proof / Stats Section */}
      <section className="bg-gradient-to-br from-purple-700 via-indigo-700 to-purple-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Trusted by E-Rate vendors nationwide
            </h2>
            <p className="text-purple-200 text-lg">
              Helping vendors find and win more E-Rate opportunities every funding cycle.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">$500M+</p>
              <p className="text-purple-200 font-medium">Funding Tracked</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">2,500+</p>
              <p className="text-purple-200 font-medium">Schools Monitored</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">98%</p>
              <p className="text-purple-200 font-medium">Appeal Success Rate</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Ready to find your next E-Rate opportunity?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. Search Form 470 filings
            instantly and set up alerts for new opportunities matching your products and territory.
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
              See pricing
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Looking for the full vendor platform?{" "}
            <Link href="/features/vendors" className="text-purple-600 hover:text-purple-700 font-medium">
              See all vendor intelligence features
            </Link>
          </p>
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
                <li>
                  <Link href="/features/form-470-tracking" className="text-slate-400 hover:text-white text-sm transition-colors">
                    Form 470 Tracking
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
