import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Brain, Search, BarChart3, AlertTriangle, Layers, TrendingUp, FileText, Lightbulb } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Denial Analysis Tool | SkyRate AI",
  description: "Understand why your E-Rate application was denied. AI analyzes USAC denial codes, identifies patterns, and recommends corrective actions. Works with all denial types.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/denial-analysis" },
  openGraph: {
    title: "E-Rate Denial Analysis Tool | SkyRate AI",
    description: "Understand why your E-Rate application was denied with AI-powered analysis.",
    url: "https://skyrate.ai/features/denial-analysis",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function DenialAnalysisFeaturePage() {
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
            Denial Analysis Tool
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Understand Why Your E-Rate{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Was Denied
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Getting a denial letter from USAC is frustrating — but understanding the reason is the
            first step to winning your appeal. SkyRate AI analyzes denial codes, explains the
            underlying rules, identifies patterns across your applications, and recommends exactly
            what to do next.
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

      {/* How Denial Analysis Works */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              From Denial Code to{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Clear Action Plan
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              USAC denial codes can be cryptic and confusing. SkyRate AI translates them into plain
              English explanations with specific corrective actions you can take immediately.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-5">
                <Search className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Look Up the Denial Code</h3>
              <p className="text-slate-600 leading-relaxed">
                Enter your USAC denial code or FRN number. SkyRate AI instantly retrieves the denial
                details, including the specific code, the associated FCC rule, and the language USAC
                used in the denial letter. No manual lookup through documentation required.
              </p>
            </div>

            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-5">
                <Brain className="w-7 h-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">AI Analyzes the Denial</h3>
              <p className="text-slate-600 leading-relaxed">
                Our AI engine examines the denial reason against the applicable FCC rules, USAC
                guidelines, and historical appeal outcomes. It determines whether the denial is
                procedural (fixable) or substantive (requiring stronger evidence), and identifies the
                most effective path forward.
              </p>
            </div>

            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-5">
                <Lightbulb className="w-7 h-7 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Get Recommendations</h3>
              <p className="text-slate-600 leading-relaxed">
                Receive a detailed breakdown of what went wrong, what FCC rules apply, and specific
                recommendations for corrective action. If an appeal is warranted, you can generate
                one with a single click using the AI appeal generator — pre-loaded with all the
                denial context.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Powerful Denial Analysis Capabilities
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Go beyond simple denial code lookups. SkyRate AI provides deep analysis, pattern
              detection, and actionable intelligence for every denial in your portfolio.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Search className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Denial Code Lookup
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Instantly look up any USAC denial code and get a clear, plain-English explanation of
                what it means. SkyRate AI maintains a comprehensive database of all E-Rate denial
                codes, mapped to the specific FCC rules, USAC procedures, and prior appeal outcomes
                associated with each code. Understand the denial before you decide how to respond.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <Brain className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                AI-Powered Analysis
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Go deeper than a simple code lookup. SkyRate AI analyzes the context of your
                specific denial — the funding year, application type, school characteristics, and
                historical patterns — to provide tailored insights. The AI identifies whether the
                denial is likely a procedural error, a documentation gap, or a substantive
                eligibility issue.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Layers className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Portfolio Pattern Detection
              </h3>
              <p className="text-slate-600 leading-relaxed">
                E-Rate consultants managing multiple schools can identify denial patterns across
                their entire portfolio. SkyRate AI highlights when the same denial code appears
                repeatedly, when specific schools have higher denial rates, or when certain
                application types are consistently flagged. Use these insights to fix systemic
                issues proactively.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Risk Assessment
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Not every denial is worth appealing. SkyRate AI evaluates the strength of your
                potential appeal based on the denial type, available evidence, and historical success
                rates for similar appeals. Get an honest assessment of your chances before investing
                time and resources into the appeals process.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <TrendingUp className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Corrective Recommendations
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Receive specific, actionable recommendations for each denial. SkyRate AI suggests
                corrective steps — whether that means resubmitting documentation, filing an appeal,
                adjusting competitive bidding procedures, or modifying your application approach for
                the next funding year. Every recommendation cites the relevant FCC rule.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <FileText className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                One-Click Appeal Generation
              </h3>
              <p className="text-slate-600 leading-relaxed">
                When the analysis confirms that an appeal is warranted, generate a fully compliant
                appeal letter with a single click. The denial context, applicable rules, and
                recommended arguments are automatically passed to the AI appeal generator, producing
                a finished letter with proper citations and formatting.
              </p>
              <Link
                href="/features/appeal-generator"
                className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 font-medium text-sm transition-colors mt-3"
              >
                Generate an appeal letter
                <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* Common Denial Types Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
                Works with{" "}
                <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  All Denial Types
                </span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Whether your E-Rate application was denied for competitive bidding violations,
                eligibility issues, documentation deficiencies, or procedural errors, SkyRate AI can
                analyze the denial and recommend the best course of action. Our AI understands the
                full spectrum of USAC denial codes and the nuances of each category.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Competitive bidding issues</strong> — improper vendor selection, 28-day
                    wait period violations, insufficient bid evaluation documentation
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Eligibility denials</strong> — ineligible entities, ineligible services
                    or equipment, incorrect discount rates
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Documentation gaps</strong> — missing Form 470, incomplete Form 471
                    attachments, missing technology plan
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    <strong>Procedural errors</strong> — late filings, incorrect certifications,
                    CIPA compliance issues
                  </span>
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">
                Explore Related Tools
              </h3>
              <div className="space-y-4">
                <Link
                  href="/features/appeal-generator"
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">Appeal Letter Generator</p>
                    <p className="text-sm text-slate-500">Generate a compliant appeal letter from your denial analysis</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto shrink-0 transition-colors" />
                </Link>
                <Link
                  href="/features/consultants"
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <BarChart3 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">Consultant Platform</p>
                    <p className="text-sm text-slate-500">Portfolio-wide denial analysis and management</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto shrink-0 transition-colors" />
                </Link>
                <Link
                  href="/features/applicants"
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                    <Brain className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">Applicant Tools</p>
                    <p className="text-sm text-slate-500">Track and analyze your own E-Rate application denials</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto shrink-0 transition-colors" />
                </Link>
              </div>
            </div>
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
              Helping turn denials into approvals with AI-powered analysis.
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
            Ready to understand your E-Rate denials?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. Analyze your first denial in
            seconds, get actionable recommendations, and generate an appeal letter if needed — all
            from one platform.
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
