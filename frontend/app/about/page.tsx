import { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Users,
  ShoppingCart,
  GraduationCap,
  Zap,
  BarChart3,
  Database,
  Shield,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About SkyRate AI | E-Rate Intelligence",
  description:
    "SkyRate AI is an AI-powered E-Rate funding intelligence platform helping consultants, vendors, and school applicants maximize federal funding through smart automation.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/about" },
  openGraph: {
    title: "About SkyRate AI | E-Rate Intelligence",
    description:
      "AI-powered E-Rate funding intelligence for consultants, vendors, and schools.",
    url: "https://skyrate.ai/about",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function AboutPage() {
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
            About SkyRate AI
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            AI-Powered E-Rate Intelligence{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              for Everyone
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            We believe every school deserves access to modern technology, and the E-Rate program
            is the key. SkyRate AI uses artificial intelligence to make E-Rate funding simpler,
            faster, and more successful for everyone involved.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
              Our{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Mission
              </span>
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              The E-Rate program delivers billions in federal funding to connect schools and
              libraries to broadband and technology. But navigating the process — applications,
              compliance, denials, appeals — is overwhelming. SkyRate AI exists to change that.
              We combine real-time USAC data with multi-model AI to give every stakeholder the
              intelligence they need to succeed.
            </p>
          </div>

          {/* Who We Serve — 3 Cards */}
          <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-10">
            Who We Serve
          </h3>
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Consultants */}
            <Link
              href="/features/consultants"
              className="group bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-purple-600" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-purple-600 transition-colors">
                For E-Rate Consultants
              </h4>
              <p className="text-slate-600 leading-relaxed mb-4">
                Manage multi-school portfolios, generate AI-powered appeal letters, monitor FRN
                status changes, and analyze denial patterns — all from a single dashboard.
              </p>
              <span className="inline-flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Learn more <ArrowRight className="w-4 h-4" />
              </span>
            </Link>

            {/* Vendors */}
            <Link
              href="/features/vendors"
              className="group bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
                <ShoppingCart className="w-7 h-7 text-indigo-600" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                For E-Rate Vendors
              </h4>
              <p className="text-slate-600 leading-relaxed mb-4">
                Find Form 470 leads filtered by manufacturer, track SPIN status, run competitor
                analysis, and access market intelligence to close more E-Rate deals.
              </p>
              <span className="inline-flex items-center gap-1 text-indigo-600 font-medium text-sm group-hover:gap-2 transition-all">
                Learn more <ArrowRight className="w-4 h-4" />
              </span>
            </Link>

            {/* Applicants */}
            <Link
              href="/features/applicants"
              className="group bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 bg-violet-100 rounded-xl flex items-center justify-center mb-6">
                <GraduationCap className="w-7 h-7 text-violet-600" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-violet-600 transition-colors">
                For School Applicants
              </h4>
              <p className="text-slate-600 leading-relaxed mb-4">
                Track your own applications, manage C2 budgets, monitor funding status, and get
                AI-powered denial analysis to maximize your school&apos;s E-Rate funding.
              </p>
              <span className="inline-flex items-center gap-1 text-violet-600 font-medium text-sm group-hover:gap-2 transition-all">
                Learn more <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* What Makes SkyRate Different */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              What Makes SkyRate{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Different
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              We&apos;re not just another E-Rate tool — we&apos;re an intelligence platform
              built from the ground up with AI at the core.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Multi-Model AI</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Powered by DeepSeek, Google Gemini, and Claude — we pick the best AI for each
                task, from appeals to denial analysis.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                <Database className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Real-Time USAC Data</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Direct integration with USAC&apos;s Socrata API for live FRN status, funding
                data, Form 470 filings, and school information.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Smart Automation</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Automated alerts, status monitoring, and scheduled data syncs so you never miss
                a critical funding deadline or status change.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Secure & FERPA-Ready</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Enterprise-grade security with SSL encryption, role-based access, and
                FERPA-aware data handling for school data.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Trusted by E-Rate Professionals
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                $500M+
              </div>
              <p className="text-slate-600 font-medium">Funding Tracked</p>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                2,500+
              </div>
              <p className="text-slate-600 font-medium">Schools Served</p>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                98%
              </div>
              <p className="text-slate-600 font-medium">Appeal Success Rate</p>
            </div>
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                500+
              </div>
              <p className="text-slate-600 font-medium">E-Rate Professionals</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-200 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Join the E-Rate Intelligence Revolution
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Whether you&apos;re a consultant managing dozens of schools, a vendor chasing
            Form 470 leads, or a school applicant tracking your own funding — SkyRate AI
            gives you the edge.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 border border-white/30 hover:border-white/60 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
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
              <p className="text-slate-500 text-sm leading-relaxed">
                AI-powered E-Rate intelligence for consultants, vendors, and schools.
              </p>
            </div>

            {/* Solutions */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Solutions</h4>
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
