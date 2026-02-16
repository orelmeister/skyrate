import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, BarChart3, Bell, Shield, Clock, DollarSign, FileText, Search, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Application Tracking | SkyRate AI",
  description: "Track your E-Rate applications in real time. Monitor FRN status, analyze denials, track Category 2 budgets, and never miss a deadline. Built for schools and libraries.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/applicants" },
  openGraph: {
    title: "E-Rate Application Tracking | SkyRate AI",
    description: "Track your E-Rate applications in real time. Built for schools and libraries.",
    url: "https://skyrate.ai/features/applicants",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function ApplicantsFeaturePage() {
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
            <Link href="/features/applicants" className="text-purple-300 text-sm font-medium">
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
            For Schools &amp; Libraries
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Track Your E-Rate Applications{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              in Real Time
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Monitor FRN funding status, understand denial reasons, track your Category 2 budget,
            and get deadline alerts — designed specifically for schools and libraries.
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

      {/* Problem / Solution Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              E-Rate is complex.{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Your tracking shouldn&apos;t be.
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Schools and libraries deserve a clear, simple way to track their E-Rate funding
              without relying on spreadsheets or manual USAC portal checks. SkyRate AI brings
              everything into one place — so you can focus on educating students, not chasing paperwork.
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
                  Manually logging into USAC portals to check FRN status updates
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  No idea why your application was denied or how to fix it
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Tracking Category 2 budgets in spreadsheets prone to errors
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Missing critical E-Rate deadlines because reminders fell through the cracks
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
                  Real-time dashboard showing every application, FRN, and funding amount
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  AI-powered denial analysis with clear explanations and next steps
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Automated Category 2 budget tracking with remaining balance alerts
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Smart deadline alerts via email and push so you never miss a window
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
              Everything you need to track E-Rate funding
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Purpose-built tools for schools and libraries that want complete visibility into
              their E-Rate applications, budgets, and deadlines — without the complexity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1: Application Dashboard */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <BarChart3 className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Application Dashboard
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                See all your E-Rate applications at a glance. Track funded, pending, and denied
                amounts with real-time data pulled directly from USAC. The dashboard provides a
                centralized view of every Form 471 you&apos;ve filed, organized by funding year, with
                color-coded status indicators so you can instantly see where each request stands in
                the review pipeline.
              </p>
            </article>

            {/* Feature 2: FRN Status Monitoring */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Bell className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                FRN Status Monitoring
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Get instant notifications when your Funding Request Number status changes. From
                pending to funded to denied — you&apos;ll know first. SkyRate AI continuously monitors
                USAC data feeds and alerts you the moment any of your FRNs move through the review
                process, so you can respond quickly to requests for information or plan next steps
                on denied items.
              </p>
              <Link
                href="/features/frn-monitoring"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                Learn about FRN monitoring
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 3: Denial Analysis */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <Search className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Denial Analysis
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                When applications are denied, understand exactly why with AI-powered analysis of
                denial codes and actionable recommendations. SkyRate AI maps every denial code to
                the underlying USAC rule, explains what went wrong in plain language, and provides
                step-by-step guidance on how to correct the issue or file a successful appeal with
                proper documentation.
              </p>
              <Link
                href="/features/denial-analysis"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                See denial analysis tool
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 4: Category 2 Budget Tracking */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mb-5">
                <DollarSign className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Category 2 Budget Tracking
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Know exactly how much Category 2 funding your school has available. Track
                allocations, commitments, and remaining balance across the five-year budget cycle.
                SkyRate AI pulls data from USAC&apos;s C2 Budget Tool and presents it in a clear
                dashboard, so you can plan purchases and maximize every dollar of internal
                connections funding available to your school or library.
              </p>
            </article>

            {/* Feature 5: Deadline Alerts */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Deadline Alerts
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Never miss an E-Rate filing deadline. Get email and push notifications for upcoming
                due dates, window openings, and status changes. SkyRate AI tracks the E-Rate
                program calendar — including Form 470 posting windows, Form 471 filing deadlines,
                invoice submission dates, and appeal windows — and sends you reminders well in
                advance so you always have time to prepare.
              </p>
            </article>

            {/* Feature 6: Funding Analytics */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <Zap className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Funding Analytics
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Visualize your E-Rate funding history over multiple years. See trends, identify
                patterns, and plan future applications with data-driven insights. SkyRate AI
                generates year-over-year comparisons, highlights approval rate changes, and shows
                how your funded amounts stack up — giving you the information you need to write
                stronger applications and secure more funding.
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
              Trusted by schools and libraries nationwide
            </h2>
            <p className="text-purple-200 text-lg">
              Helping applicants track and maximize their E-Rate funding every day.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">$500M+</p>
              <p className="text-purple-200 font-medium">Funding Tracked</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">2,500+</p>
              <p className="text-purple-200 font-medium">Schools &amp; Libraries</p>
            </div>
            <div className="text-center">
              <p className="text-4xl sm:text-5xl font-bold text-white mb-2">Real-Time</p>
              <p className="text-purple-200 font-medium">USAC Data Sync</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Start tracking your E-Rate applications today
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. See why schools and libraries
            across the country trust SkyRate AI to monitor their E-Rate applications, track budgets,
            and never miss a deadline.
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
              See applicant pricing
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
