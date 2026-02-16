import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Brain, Shield, BarChart3, Bell, Database, FileText, Users, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Consultant Software | SkyRate AI",
  description: "All-in-one E-Rate consultant software with AI-powered appeal generation, portfolio management, FRN monitoring, and denial analysis. Manage multiple schools from one dashboard.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/consultants" },
  openGraph: {
    title: "E-Rate Consultant Software | SkyRate AI",
    description: "All-in-one E-Rate consultant software with AI appeal generation and portfolio management.",
    url: "https://skyrate.ai/features/consultants",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function ConsultantsFeaturePage() {
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
            <Link href="/features/consultants" className="text-purple-300 text-sm font-medium">
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
            For E-Rate Consultants
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            The All-in-One Platform for{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              E-Rate Consultants
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Manage school portfolios, generate AI-powered appeals, monitor FRN status changes, and
            analyze denials — all from a single dashboard.
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
              E-Rate consulting is complex.{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                SkyRate AI makes it simple.
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Stop juggling spreadsheets, manual USAC lookups, and hours of appeal drafting.
              SkyRate AI centralizes everything you need to serve your clients efficiently.
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
                  Hours spent writing appeal letters from scratch for every denied FRN
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Manually checking USAC portals for each school&apos;s FRN status updates
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Scattered spreadsheets tracking denial codes and filing deadlines
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  Missed deadline windows because status changes went unnoticed
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
                  AI generates compliant appeal letters in seconds, citing FCC orders
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Automated FRN monitoring with instant alerts on status changes
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Centralized dashboard showing every school, every FRN, every deadline
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  Smart alerts ensure you never miss a critical deadline or change
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
              Everything you need to manage E-Rate portfolios
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Purpose-built tools for E-Rate consultants who manage multiple schools and need to
              maximize funding outcomes for every client.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1: AI Appeal Letter Generator */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Brain className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                AI Appeal Letter Generator
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Generate compliant, persuasive appeal letters in seconds using AI trained on FCC
                Order 19-117 and USAC precedent. Each letter cites relevant rules, addresses the
                specific denial code, and follows the format that USAC reviewers expect. Stop
                spending hours drafting appeals manually.
              </p>
              <Link
                href="/features/appeal-generator"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                Try the appeal generator
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 2: Multi-BEN Portfolio Management */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Users className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Multi-BEN Portfolio Management
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Track multiple schools and libraries from one dashboard. View funding status,
                denial rates, and compliance metrics across your entire portfolio. Whether you manage
                five schools or five hundred, SkyRate AI gives you a single pane of glass into every
                BEN&apos;s E-Rate activity.
              </p>
            </article>

            {/* Feature 3: FRN Status Monitoring */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Bell className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                FRN Status Monitoring
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Get real-time alerts when FRN statuses change. Never miss a deadline or status
                update again. SkyRate AI continuously monitors USAC data and notifies you the
                moment a Funding Request Number moves through the review pipeline — from pending to
                approved, denied, or any intermediate state.
              </p>
              <Link
                href="/features/frn-monitoring"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                Learn about FRN monitoring
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 4: E-Rate Denial Analysis */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <BarChart3 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                E-Rate Denial Analysis
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Understand exactly why applications are denied with AI-powered analysis of USAC
                denial codes and historical patterns. SkyRate AI maps each denial to the underlying
                rule, identifies common patterns across your portfolio, and suggests the most
                effective remediation strategy.
              </p>
              <Link
                href="/features/denial-analysis"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors"
              >
                See denial analysis
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>

            {/* Feature 5: Real-Time USAC Data */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <Database className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Real-Time USAC Data
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Access live data from USAC&apos;s Socrata database. Search schools by BEN or name,
                view complete funding histories, and track disbursements in real time. No more
                logging into the USAC portal and running manual queries — all the data you need is
                at your fingertips.
              </p>
            </article>

            {/* Feature 6: Smart Alerts & Notifications */}
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <Zap className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Smart Alerts &amp; Notifications
              </h3>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Email and push notification alerts for status changes, upcoming deadlines, and
                denial flags across your portfolio. Configure alert preferences per client or
                globally, and receive daily digests or instant notifications so you can act before
                deadlines pass.
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
              Trusted by E-Rate professionals nationwide
            </h2>
            <p className="text-purple-200 text-lg">
              Helping consultants maximize funding outcomes every day.
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
            Ready to streamline your E-Rate consulting?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. See why hundreds of E-Rate
            consultants trust SkyRate AI to manage their portfolios and maximize funding for their
            clients.
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
              See consultant pricing
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
