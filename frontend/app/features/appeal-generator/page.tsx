import { Metadata } from "next";
import Link from "next/link";
import { Check, ArrowRight, Brain, FileText, Scale, Zap, Shield, Clock, Sparkles, BookOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Appeal Letter Generator | SkyRate AI",
  description: "Generate winning E-Rate appeal letters with AI. Trained on FCC Order 19-117 and USAC precedent. Analyze denial reasons and create compliant, persuasive appeals in seconds.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/features/appeal-generator" },
  openGraph: {
    title: "E-Rate Appeal Letter Generator | SkyRate AI",
    description: "Generate winning E-Rate appeal letters with AI trained on FCC precedent.",
    url: "https://skyrate.ai/features/appeal-generator",
    siteName: "SkyRate AI",
    type: "website",
  },
};

export default function AppealGeneratorFeaturePage() {
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
            AI Appeal Generator
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Generate Winning E-Rate Appeals{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              with AI
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10 leading-relaxed">
            Stop spending hours drafting appeal letters from scratch. SkyRate AI analyzes your denial
            reason, identifies the applicable FCC rules, and generates a fully compliant, persuasive
            appeal letter you can submit directly to USAC — in seconds, not hours.
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

      {/* How It Works Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              How It Works:{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Three Simple Steps
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From denial notification to submission-ready appeal letter in under a minute. No legal
              expertise required — our AI handles the heavy lifting.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-5">
                <span className="text-purple-700 font-bold text-xl">1</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Enter Your FRN or Denial Code</h3>
              <p className="text-slate-600 leading-relaxed">
                Paste your Funding Request Number or select the USAC denial code from the dropdown.
                SkyRate AI automatically retrieves the relevant application details and denial
                specifics from the USAC database to build context for your appeal.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-5">
                <span className="text-indigo-700 font-bold text-xl">2</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">AI Analyzes Against FCC Rules</h3>
              <p className="text-slate-600 leading-relaxed">
                Our AI engine cross-references your denial reason against FCC Order 19-117, relevant
                FCC rules and orders, prior USAC appeal decisions, and successful precedent. It
                identifies the strongest legal arguments for your specific situation.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-5">
                <span className="text-violet-700 font-bold text-xl">3</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">Get a Compliant Appeal Letter</h3>
              <p className="text-slate-600 leading-relaxed">
                Receive a professionally formatted appeal letter ready for submission. Each letter
                includes proper legal citations, addresses the specific denial reason, follows USAC
                formatting requirements, and is structured to maximize your chances of reversal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Built on Deep E-Rate Expertise
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Every appeal letter is backed by extensive training on FCC rules, USAC procedures, and
              real-world appeal outcomes. Here&apos;s what makes our AI different.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
                <Scale className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                FCC Order 19-117 Trained
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Our AI is specifically trained on FCC Order 19-117, the definitive E-Rate appeals
                framework. It understands which arguments carry the most weight with USAC reviewers
                and how to frame your case within established regulatory precedent. Every citation is
                accurate and relevant to your denial reason.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-5">
                <BookOpen className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Proper Legal Citations
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Each appeal letter automatically includes correct references to applicable FCC
                rules, orders, and USAC guidelines. No more guessing which regulation applies or
                searching through hundreds of pages of legal text. The AI pinpoints the exact
                provisions that support your appeal.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mb-5">
                <Sparkles className="w-6 h-6 text-violet-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Multiple AI Models
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Choose from DeepSeek, Google Gemini, or Claude to generate your appeal. Each model
                brings unique strengths — compare outputs, select the best arguments, and combine
                perspectives for the most comprehensive appeal possible. Switch models with one
                click.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center mb-5">
                <FileText className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Professional Formatting
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Every letter follows the format that USAC expects. Proper headers, structured
                arguments, clear statement of relief sought, and supporting evidence sections are
                all included automatically. Download as a formatted document ready for submission
                without any additional editing.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mb-5">
                <Clock className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Generated in Seconds
              </h3>
              <p className="text-slate-600 leading-relaxed">
                What used to take 2–4 hours of research and drafting now takes under 60 seconds.
                SkyRate AI instantly retrieves the relevant application data, analyzes the denial
                reason, and generates a comprehensive appeal letter — freeing you to focus on higher
                value work for your clients.
              </p>
            </article>

            <article className="group bg-slate-50 hover:bg-white rounded-2xl p-8 border border-slate-200 hover:border-purple-200 hover:shadow-lg transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-5">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-3">
                Denial-Code Specific
              </h3>
              <p className="text-slate-600 leading-relaxed">
                The AI tailors each appeal to the specific denial code issued by USAC. Whether
                it&apos;s a competitive bidding issue, eligibility question, or documentation
                deficiency, the appeal addresses the exact reason your application was denied —
                not generic boilerplate language.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* Why AI Appeals Win Section */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
                Why AI-Generated Appeals{" "}
                <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Win More Often
                </span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                E-Rate appeal letters succeed when they cite the right legal precedent, address the
                specific denial reason directly, and follow the structured format that USAC reviewers
                expect. Most consultants lack the time to research every applicable FCC order for
                every denial. SkyRate AI does this research instantly, drawing from a comprehensive
                knowledge base of E-Rate regulations, FCC orders, and successful appeal strategies.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    Consistent quality — every appeal meets the same high standard regardless of
                    volume or time pressure
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    Comprehensive citations — no relevant FCC order or USAC guideline is overlooked
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    Faster turnaround — meet tight appeal deadlines without sacrificing quality
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                  <span className="text-slate-700">
                    Scalable — generate appeals for your entire portfolio without additional staff
                  </span>
                </li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">
                Related Tools
              </h3>
              <div className="space-y-4">
                <Link
                  href="/features/denial-analysis"
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <Brain className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">Denial Analysis Tool</p>
                    <p className="text-sm text-slate-500">Understand why your application was denied before generating an appeal</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto shrink-0 transition-colors" />
                </Link>
                <Link
                  href="/features/consultants"
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">E-Rate Consultant Platform</p>
                    <p className="text-sm text-slate-500">Full portfolio management with appeal generation built in</p>
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
              Helping consultants and applicants win more appeals every day.
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
            Ready to generate your first AI-powered appeal?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Start your 14-day free trial. No credit card required. Generate your first appeal letter
            in under 60 seconds and see why E-Rate professionals trust SkyRate AI for their most
            critical funding decisions.
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
