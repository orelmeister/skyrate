import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Bell, Activity, Clock, Mail, BarChart3, Shield, Database, History } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate FRN Status Tracker | SkyRate AI",
  description: "Monitor E-Rate Funding Request Number status changes in real time. Get instant alerts for approvals, denials, and disbursements. Track multiple FRNs across schools.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/frn-monitoring" },
  openGraph: {
    title: "E-Rate FRN Status Tracker | SkyRate AI",
    description: "Monitor E-Rate FRN status changes in real time with instant alerts.",
    url: "https://skyrate.ai/features/frn-monitoring",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function FRNMonitoringFeaturePage() {
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
            FRN Status Tracker
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Monitor Every FRN Status Change{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              in Real Time
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Never miss a critical status update again. SkyRate AI continuously monitors your Funding
            Request Numbers across USAC and alerts you the moment anything changes — approvals,
            denials, disbursements, and every step in between.
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
              Stop manually checking USAC.{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Let SkyRate AI watch for you.
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              E-Rate consultants and applicants spend hours every week logging into USAC portals to
              check FRN statuses manually. With SkyRate AI, monitoring is automatic and continuous.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-sm font-bold">✕</span>
                Without SkyRate AI
              </h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Logging into USAC portals daily to check each FRN individually
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Missing critical status changes that require immediate action
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Tracking disbursement timelines in spreadsheets with no automation
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Appeal deadlines passing because a denial went unnoticed for days
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-purple-200 ring-1 ring-purple-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold">✓</span>
                With SkyRate AI
              </h3>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Automated monitoring checks FRN statuses continuously in the background
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Instant email and push alerts the moment any status changes
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Full disbursement tracking with projected timeline data
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Denial alerts with one-click access to the AI appeal generator
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
              Comprehensive FRN Monitoring Features
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Everything you need to stay on top of every Funding Request Number across your entire
              portfolio of schools and libraries.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Real-Time Status Tracking
              </h3>
              <p className="text-slate-600 leading-relaxed">
                SkyRate AI connects directly to USAC&apos;s data systems through the Socrata API to
                monitor Funding Request Number statuses in real time. Every change is captured and
                logged as it happens — from initial submission through review, approval or denial,
                and final disbursement. Your dashboard always reflects the latest status.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Database className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Multi-FRN Dashboard
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Track dozens or hundreds of FRNs from a single, unified dashboard. Filter by school,
                funding year, status, or category. See at a glance which FRNs need attention, which
                are progressing normally, and which have been flagged for issues. Sort, search, and
                drill into individual FRN details with one click.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Mail className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Email &amp; Push Alerts
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Configure granular notification preferences for each FRN or across your entire
                portfolio. Choose between instant alerts for critical changes, daily digest summaries,
                or weekly reports. Receive notifications via email or push notifications so you can
                respond to urgent status changes immediately.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <History className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Historical Status Timeline
              </h3>
              <p className="text-slate-600 leading-relaxed">
                View the complete history of every FRN status change over time. The timeline view
                shows exactly when each transition occurred, how long the FRN spent in each state,
                and any patterns that might indicate processing delays. Use historical data to set
                expectations with clients and plan ahead.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <BarChart3 className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Disbursement Tracking
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Once an FRN is approved, track disbursement progress from commitment through final
                payment. See how much has been disbursed, how much remains, and estimated timelines
                for completion. Monitor invoicing status and BEAR/SPI reimbursement progress for
                every funded request in your portfolio.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Deadline Protection
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Automated deadline tracking ensures you never miss an appeal window, invoice filing
                deadline, or service delivery date. SkyRate AI calculates critical dates based on FRN
                status transitions and sends proactive reminders well in advance so you have time to
                prepare and respond.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Related Tools Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Works with Your Other SkyRate AI Tools
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              FRN monitoring integrates seamlessly with denial analysis and appeal generation, so
              you can act on status changes the moment they happen.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <Link
              href="/features/denial-analysis"
              className="bg-white rounded-xl p-6 border border-slate-200 hover:border-purple-200 hover:shadow-md transition-all group text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
              <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors text-sm">Denial Analysis</p>
            </Link>
            <Link
              href="/features/consultants"
              className="bg-white rounded-xl p-6 border border-slate-200 hover:border-purple-200 hover:shadow-md transition-all group text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors text-sm">Consultant Features</p>
            </Link>
            <Link
              href="/features/applicants"
              className="bg-white rounded-xl p-6 border border-slate-200 hover:border-purple-200 hover:shadow-md transition-all group text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center mx-auto mb-3">
                <Bell className="w-5 h-5 text-violet-600" />
              </div>
              <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors text-sm">Applicant Features</p>
            </Link>
            <Link
              href="/features/appeal-generator"
              className="bg-white rounded-xl p-6 border border-slate-200 hover:border-purple-200 hover:shadow-md transition-all group text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center mx-auto mb-3">
                <Activity className="w-5 h-5 text-rose-600" />
              </div>
              <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors text-sm">Appeal Generator</p>
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof / Stats Section */}
      <section className="bg-gradient-to-br from-purple-700 via-indigo-700 to-purple-800 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Trusted by E-Rate professionals nationwide
            </h2>
            <p className="text-purple-200 text-lg">
              Real-time monitoring that keeps you ahead of every deadline.
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
            Ready to automate your FRN monitoring?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. Add your FRNs and start receiving
            real-time alerts within minutes. Never miss a critical status change again.
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
