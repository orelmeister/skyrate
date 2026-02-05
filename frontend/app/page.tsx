import Link from "next/link";
import type { Metadata } from "next";

// SEO Metadata
export const metadata: Metadata = {
  title: "SkyRate AI - AI-Powered E-Rate Intelligence Platform | Maximize Your E-Rate Funding",
  description: "SkyRate AI helps E-Rate consultants and vendors maximize funding with AI-powered denial analysis, automated appeal generation, Form 470 lead tracking, and real-time USAC data. Start your 14-day free trial.",
  keywords: "E-Rate, E-Rate funding, E-Rate consultant, E-Rate vendor, USAC, FCC, school funding, Category 2, Form 470, Form 471, appeal generation, denial analysis",
  openGraph: {
    title: "SkyRate AI - AI-Powered E-Rate Intelligence Platform",
    description: "Maximize your E-Rate funding with AI-powered analysis. Track denials, generate appeals, discover Form 470 leads, and manage your portfolio efficiently.",
    type: "website",
    url: "https://skyrate.ai",
    siteName: "SkyRate AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkyRate AI - E-Rate Intelligence Platform",
    description: "AI-powered E-Rate funding intelligence for consultants and vendors.",
  },
  robots: "index, follow",
  alternates: {
    canonical: "https://skyrate.ai",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 px-6 py-4 bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/25">
              S
            </div>
            <span className="text-xl font-bold text-slate-900">
              SkyRate<span className="text-indigo-600">.AI</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-600 hover:text-indigo-600 transition font-medium">Features</a>
            <a href="#for-consultants" className="text-slate-600 hover:text-indigo-600 transition font-medium">For Consultants</a>
            <a href="#for-vendors" className="text-slate-600 hover:text-indigo-600 transition font-medium">For Vendors</a>
            <a href="#pricing" className="text-slate-600 hover:text-indigo-600 transition font-medium">Pricing</a>
            <a href="#faq" className="text-slate-600 hover:text-indigo-600 transition font-medium">FAQ</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link 
              href="/sign-in"
              className="text-slate-600 hover:text-slate-900 transition font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition shadow-lg shadow-indigo-500/25 font-medium"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 px-6 py-20 lg:py-28">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-200 rounded-full blur-3xl opacity-30"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 rounded-full blur-3xl opacity-30"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium mb-8">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Trusted by 500+ E-Rate Professionals
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              Stop Leaving <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">E-Rate Money</span> on the Table
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-3xl mx-auto leading-relaxed">
              SkyRate AI is the only platform that combines real-time USAC data, AI-powered denial analysis, and automated appeal generation to help you maximize E-Rate funding for your schools and clients.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                href="/sign-up"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition shadow-xl shadow-indigo-500/30 text-lg"
              >
                Start Your 14-Day Free Trial
              </Link>
              <a
                href="#demo"
                className="w-full sm:w-auto px-8 py-4 border-2 border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-white hover:border-indigo-300 transition text-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                Watch Demo
              </a>
            </div>
            <p className="text-sm text-slate-500">No credit card required • Cancel anytime • Full access to all features</p>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="py-16 px-6 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              E-Rate Funding is Getting Harder
            </h2>
            <p className="text-lg text-slate-600">
              You&apos;re facing unprecedented challenges in the E-Rate landscape
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-red-50 border border-red-100">
              <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center mb-6">
                <span className="text-3xl">⏰</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Time-Consuming Manual Research</h3>
              <p className="text-slate-600">
                Hours spent searching USAC portals, cross-referencing data, and manually tracking denial patterns across multiple schools and funding years.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-amber-50 border border-amber-100">
              <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center mb-6">
                <span className="text-3xl">📉</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Rising Denial Rates</h3>
              <p className="text-slate-600">
                Denial rates are increasing. Without systematic tracking and proven appeal strategies, you&apos;re losing winnable funding every cycle.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-orange-50 border border-orange-100">
              <div className="w-14 h-14 rounded-xl bg-orange-100 flex items-center justify-center mb-6">
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Missed Opportunities</h3>
              <p className="text-slate-600">
                Form 470 leads slip by. Competitor activities go unnoticed. Revenue opportunities disappear because you can&apos;t monitor everything.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution Overview */}
      <section id="features" className="py-20 px-6 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-300 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              SkyRate AI: Your Unfair Advantage
            </h2>
            <p className="text-xl text-purple-100">
              One platform. Complete E-Rate intelligence. Powered by AI.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 text-center">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-white mb-2">Real-Time USAC Data</h3>
              <p className="text-purple-100 text-sm">Direct API integration with USAC Open Data Portal</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 text-center">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold text-white mb-2">AI-Powered Analysis</h3>
              <p className="text-purple-100 text-sm">Advanced AI denial analysis and appeal generation</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-white mb-2">Portfolio Management</h3>
              <p className="text-purple-100 text-sm">Track schools, vendors, and funding across cycles</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-lg font-semibold text-white mb-2">Instant Insights</h3>
              <p className="text-purple-100 text-sm">Natural language queries return answers in seconds</p>
            </div>
          </div>
        </div>
      </section>

      {/* For Consultants Section */}
      <section id="for-consultants" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-6">
                📋 For E-Rate Consultants
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Manage More Schools.<br/>Recover More Funding.
              </h2>
              <p className="text-lg text-slate-600 mb-8">
                SkyRate AI gives consultants superpowers to manage larger portfolios, win more appeals, and deliver exceptional results for their clients.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">CRN Verification & Auto-Import</h4>
                    <p className="text-slate-600">Instantly verify your CRN and import all associated schools with one click</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">AI-Generated Appeal Letters</h4>
                    <p className="text-slate-600">Generate professional, USAC-compliant appeal letters in seconds using proven strategies</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Denial Pattern Analysis</h4>
                    <p className="text-slate-600">AI analyzes denial reasons and identifies the most effective appeal strategies</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Portfolio Dashboard</h4>
                    <p className="text-slate-600">Track all schools, C2 budgets, funding status, and application history in one view</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Natural Language Search</h4>
                    <p className="text-slate-600">Ask questions in plain English: &quot;Show denied schools in Texas for 2024&quot;</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Appeal Status Tracking</h4>
                    <p className="text-slate-600">Track pending, submitted, and resolved appeals with decision history</p>
                  </div>
                </li>
              </ul>
              <Link
                href="/sign-up?role=consultant"
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition mt-8"
              >
                Start Consultant Free Trial
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-2xl">
                <h4 className="text-lg font-semibold mb-6 opacity-90">Consultant Dashboard Preview</h4>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">127</div>
                    <div className="text-blue-100 text-sm">Total Schools</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">$4.2M</div>
                    <div className="text-blue-100 text-sm">C2 Budget Tracked</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">23</div>
                    <div className="text-blue-100 text-sm">Active Denials</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">87%</div>
                    <div className="text-blue-100 text-sm">Appeal Success</div>
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-green-400 flex items-center justify-center text-green-900 text-sm font-bold">AI</div>
                    <div className="text-sm font-medium">Appeal Strategy Generated</div>
                  </div>
                  <p className="text-sm text-blue-100 opacity-90">
                    Based on denial code 470-001, I recommend citing FCC Order 19-117 which established good faith exemptions for minor procedural errors...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Vendors Section */}
      <section id="for-vendors" className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-2xl">
                <h4 className="text-lg font-semibold mb-6 opacity-90">Vendor Portal Preview</h4>
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm mb-4">
                  <div className="text-sm text-purple-100 mb-2">Form 470 Lead Alert</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Cisco Equipment Request</div>
                      <div className="text-purple-200 text-sm">Los Angeles USD • $1.2M Budget</div>
                    </div>
                    <span className="px-3 py-1 bg-green-400 text-green-900 rounded-full text-xs font-bold">NEW</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">47</div>
                    <div className="text-purple-100 text-sm">Form 470 Leads</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <div className="text-3xl font-bold">$18M</div>
                    <div className="text-purple-100 text-sm">Pipeline Value</div>
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <div className="text-sm font-medium mb-2">Market Intelligence</div>
                  <div className="flex items-center gap-4 text-sm text-purple-100">
                    <span>📊 Your Win Rate: 34%</span>
                    <span>|</span>
                    <span>🏆 Top Competitor: 28%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-6">
                🏢 For E-Rate Vendors
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
                Win More E-Rate Contracts.<br/>Outpace Competitors.
              </h2>
              <p className="text-lg text-slate-600 mb-8">
                SkyRate AI gives vendors a competitive edge with Form 470 lead tracking, competitor analysis, and real-time market intelligence.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Form 470 Lead Generation</h4>
                    <p className="text-slate-600">Track Form 470 postings by your manufacturers (Cisco, Fortinet, Aruba, etc.) with real-time alerts</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">SPIN Validation & FRN Tracking</h4>
                    <p className="text-slate-600">Validate your SPIN and track all your FRNs in real-time with funding status updates</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Competitor Analysis</h4>
                    <p className="text-slate-600">Compare your win rates, response times, and market share against competitors</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Market Intelligence Dashboard</h4>
                    <p className="text-slate-600">See total market opportunity, your share, and identify high-value opportunities</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-green-600 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Response Deadline Tracking</h4>
                    <p className="text-slate-600">Never miss a Form 470 deadline with countdown timers and email alerts</p>
                  </div>
                </li>
              </ul>
              <Link
                href="/sign-up?role=vendor"
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition mt-8"
              >
                Start Vendor Free Trial
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Stats Section */}
      <section className="py-16 px-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl md:text-5xl font-bold text-indigo-600">$50M+</div>
              <div className="text-slate-600 mt-2">E-Rate Funding Tracked</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-indigo-600">5,000+</div>
              <div className="text-slate-600 mt-2">Schools Managed</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-indigo-600">87%</div>
              <div className="text-slate-600 mt-2">Appeal Success Rate</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-bold text-indigo-600">10hrs</div>
              <div className="text-slate-600 mt-2">Saved Per Week</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Get Started in 3 Simple Steps
            </h2>
            <p className="text-lg text-slate-600">
              Be up and running with full E-Rate intelligence in under 5 minutes
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Sign Up & Verify</h3>
              <p className="text-slate-600">
                Create your account and verify your CRN (consultants) or SPIN (vendors) to unlock full features
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Import Your Data</h3>
              <p className="text-slate-600">
                Auto-import schools from your CRN or track FRNs from your SPIN. Add manufacturers to monitor.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Start Winning</h3>
              <p className="text-slate-600">
                Use AI to generate appeals, discover leads, track competitors, and maximize your E-Rate success
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-slate-600">
              Choose the plan that fits your needs. All plans include a 14-day free trial.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Applicant Plan */}
            <div className="p-8 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🏫</span>
                <h3 className="text-2xl font-bold text-slate-900">Applicant</h3>
              </div>
              <p className="text-slate-600 mb-6">For schools and libraries managing their own E-Rate applications</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-900">$200</span>
                  <span className="text-slate-600">/month</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">or $2,000/year (save $400)</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Automatic FRN tracking
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Real-time status alerts
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> AI-generated appeal letters
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Deadline reminders
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Unlimited appeal refinements
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Email support
                </li>
              </ul>
              <Link
                href="/applicant/sign-up"
                className="block w-full py-3 text-center bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
              >
                Start Free Trial
              </Link>
            </div>
            {/* Consultant Plan */}
            <div className="p-8 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">MOST POPULAR</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">📋</span>
                <h3 className="text-2xl font-bold text-slate-900">Consultant</h3>
              </div>
              <p className="text-slate-600 mb-6">Perfect for E-Rate consultants managing school portfolios</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-900">$300</span>
                  <span className="text-slate-600">/month</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">or $3,000/year (save $600)</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Unlimited schools
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> AI appeal generation
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Denial pattern analysis
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> CRN auto-import
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Natural language search
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Email support
                </li>
              </ul>
              <Link
                href="/sign-up?role=consultant"
                className="block w-full py-3 text-center bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition"
              >
                Start Free Trial
              </Link>
            </div>
            {/* Vendor Plan */}
            <div className="p-8 rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🏢</span>
                <h3 className="text-2xl font-bold text-slate-900">Vendor</h3>
              </div>
              <p className="text-slate-600 mb-6">Ideal for E-Rate vendors tracking leads and competitors</p>
              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-900">$300</span>
                  <span className="text-slate-600">/month</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">or $3,000/year (save $600)</p>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Form 470 lead tracking
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Multi-manufacturer monitoring
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> FRN status tracking
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Competitor analysis
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Market intelligence dashboard
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <span className="text-green-500">✓</span> Priority support
                </li>
              </ul>
              <Link
                href="/sign-up?role=vendor"
                className="block w-full py-3 text-center bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-6 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">What data sources does SkyRate AI use?</h3>
              <p className="text-slate-600">
                SkyRate AI integrates directly with USAC&apos;s Open Data Portal APIs, including Form 471, Form 470, C2 Budget Tool, and FRN status data. All data is updated in real-time from official USAC sources.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">How does AI appeal generation work?</h3>
              <p className="text-slate-600">
                Our AI analyzes the specific denial reason, funding year, and relevant FCC orders to generate a customized appeal letter. It uses advanced AI with specialized training on E-Rate regulations to craft compelling, compliant appeals.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Is my data secure?</h3>
              <p className="text-slate-600">
                Yes. We use industry-standard encryption, secure authentication, and follow best practices for data protection. Your school and client data is never shared or sold. We&apos;re committed to FERPA compliance.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Can I cancel my subscription anytime?</h3>
              <p className="text-slate-600">
                Absolutely. You can cancel your subscription at any time with no penalties. Your access continues until the end of your billing period. We also offer a 14-day free trial so you can evaluate before committing.
              </p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">What&apos;s the difference between Consultant and Vendor plans?</h3>
              <p className="text-slate-600">
                The Consultant plan focuses on school portfolio management, denial tracking, and AI-powered appeal generation. The Vendor plan focuses on Form 470 lead tracking, FRN monitoring, and competitor analysis. Choose based on your role in the E-Rate ecosystem.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-300 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Maximize Your E-Rate Funding?
          </h2>
          <p className="text-xl text-purple-100 mb-10 max-w-2xl mx-auto">
            Join hundreds of E-Rate professionals who are already using SkyRate AI to save time, win more appeals, and discover new opportunities.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto px-8 py-4 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-slate-100 transition text-lg shadow-xl"
            >
              Start Your 14-Day Free Trial
            </Link>
            <a
              href="mailto:support@skyrate.ai"
              className="w-full sm:w-auto px-8 py-4 border-2 border-white/30 text-white rounded-xl font-semibold hover:bg-white/10 transition text-lg"
            >
              Contact Sales
            </a>
          </div>
          <p className="text-purple-200 text-sm mt-6">No credit card required • Full access • Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold">
                  S
                </div>
                <span className="text-xl font-bold text-white">SkyRate<span className="text-indigo-400">.AI</span></span>
              </div>
              <p className="text-sm">
                AI-powered E-Rate intelligence platform for consultants and vendors.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#for-consultants" className="hover:text-white transition">For Consultants</a></li>
                <li><a href="#for-vendors" className="hover:text-white transition">For Vendors</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
                <li><a href="/docs" className="hover:text-white transition">API Documentation</a></li>
                <li><a href="https://www.usac.org/e-rate/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">USAC E-Rate</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:support@skyrate.ai" className="hover:text-white transition">Contact</a></li>
                <li><a href="/privacy" className="hover:text-white transition">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm">© {new Date().getFullYear()} SkyRate AI. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">🔒 SSL Secured</span>
              <span className="flex items-center gap-1">✓ FERPA Ready</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}