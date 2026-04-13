import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { SafeEmail } from "@/components/SafeEmail";
import WhatsAppButton from "@/components/WhatsAppButton";
import MobileContactBar from "@/components/MobileContactBar";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import EmailCaptureForm from "@/components/EmailCaptureForm";

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
    images: [{ url: '/images/marketing/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SkyRate AI - E-Rate Intelligence Platform",
    description: "AI-powered E-Rate funding intelligence for consultants and vendors.",
    images: ['/images/marketing/twitter.png'],
  },
  robots: "index, follow",
  alternates: { canonical: "https://skyrate.ai" },
};

/* ─── mobile nav toggle (CSS-only, no JS needed) ─── */
function MobileMenuButton() {
  return (
    <label htmlFor="mobile-menu-toggle" className="md:hidden cursor-pointer p-2 -mr-2">
      <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </label>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <ExitIntentPopup />
      {/* ════════════════════ HEADER ════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-6 py-3 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <Link href="/features/consultants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Consultants</Link>
            <Link href="/features/vendors" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Vendors</Link>
            <Link href="/features/applicants" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">For Applicants</Link>
            <Link href="/pricing" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">Pricing</Link>
            <Link href="/blog" className="text-slate-400 hover:text-white transition font-medium text-sm lg:text-base">Blog</Link>
          </nav>

          <div className="flex items-center gap-3">
            <a href="tel:855-765-7291" className="hidden lg:flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              (855) 765-7291
            </a>
            <a
              href={process.env.NEXT_PUBLIC_LINKEDIN_URL || "https://www.linkedin.com/company/skyrate-llc"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SkyRate on LinkedIn"
              className="hidden lg:flex items-center text-slate-400 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
            <Link href="/sign-in" className="hidden sm:inline text-slate-400 hover:text-white transition font-medium text-sm">
              Sign In
            </Link>
            <Link href="/sign-up" className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 font-medium text-sm">
              Start Free Trial
            </Link>
            <MobileMenuButton />
          </div>
        </div>

        {/* CSS-only mobile menu */}
        <input type="checkbox" id="mobile-menu-toggle" className="hidden peer" />
        <div className="hidden peer-checked:block md:!hidden border-t border-white/10 mt-3 pt-3 pb-1">
          <nav className="flex flex-col gap-3">
            <Link href="/features/consultants" className="text-slate-400 hover:text-white font-medium py-1">For Consultants</Link>
            <Link href="/features/vendors" className="text-slate-400 hover:text-white font-medium py-1">For Vendors</Link>
            <Link href="/features/applicants" className="text-slate-400 hover:text-white font-medium py-1">For Applicants</Link>
            <Link href="/pricing" className="text-slate-400 hover:text-white font-medium py-1">Pricing</Link>
            <Link href="/blog" className="text-slate-400 hover:text-white font-medium py-1">Blog</Link>
            <Link href="/sign-in" className="text-indigo-400 font-medium py-1 sm:hidden">Sign In</Link>
          </nav>
        </div>
      </header>

      {/* ════════════════════ HERO (Dark) ════════════════════ */}
      <section className="relative overflow-hidden px-4 sm:px-6 py-16 sm:py-20 lg:py-28 bg-slate-950">
        {/* Mesh gradient background */}
        <div className="mesh-gradient-bg" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pulse-glow" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pulse-glow" style={{ animationDelay: '2s' }} />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: Text content */}
            <div className="text-center lg:text-left animate-slide-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-300 rounded-full text-sm font-medium mb-6 sm:mb-8 border border-indigo-500/20">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                Trusted by 500+ E-Rate Professionals
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-5 sm:mb-6 leading-tight">
                Stop Losing{" "}
                <span className="gradient-text">E-Rate Funding</span>{" "}
                to Paperwork Mistakes
              </h1>
              <p className="text-base sm:text-lg lg:text-xl text-slate-400 mb-8 sm:mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                SkyRate automates Form 470/471 tracking, PIA responses, and funding analysis — so you can focus on your students, not USAC paperwork.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 sm:gap-4 mb-6">
                <Link
                  href="/sign-up"
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-xl shadow-indigo-500/30 text-base sm:text-lg animate-gentle-bounce"
                >
                  Start Your 14-Day Free Trial
                </Link>
                <a
                  href={process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/skyrate"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 border-2 border-white/30 rounded-xl font-semibold text-white hover:bg-white/10 transition text-base sm:text-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Book a Free Consultation
                </a>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                No credit card required • Cancel anytime • Full access
              </p>
            </div>

            {/* Right: Dashboard illustration */}
            <div className="hidden lg:block relative">
              <div className="floating">
                <div className="glassmorphism-card rounded-2xl p-6 subtle-glow">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-400/60"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400/60"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400/60"></div>
                    <span className="text-xs text-slate-500 ml-2">SkyRate AI Dashboard</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="text-2xl font-bold text-white">127</div>
                      <div className="text-xs text-slate-400">Schools Managed</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="text-2xl font-bold text-green-400">87%</div>
                      <div className="text-xs text-slate-400">Appeal Success</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="text-2xl font-bold text-indigo-400">$4.2M</div>
                      <div className="text-xs text-slate-400">Funding Tracked</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="text-2xl font-bold text-purple-400">23</div>
                      <div className="text-xs text-slate-400">Active Appeals</div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                        <Image src="/images/icons/ai.png" alt="AI" width={20} height={20} />
                      </div>
                      <span className="text-xs font-medium text-indigo-300">AI Appeal Strategy</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Based on denial code 470-001, citing FCC Order 19-117 for good faith exemptions on minor procedural errors...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ SOCIAL PROOF BAR ════════════════════ */}
      <section className="py-10 sm:py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center mb-8 sm:mb-10">
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900">$2.5B+</div>
              <div className="text-sm sm:text-base text-slate-600 mt-1">E-Rate Funding Analyzed</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900">500+</div>
              <div className="text-sm sm:text-base text-slate-600 mt-1">Schools &amp; Libraries Tracked</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900">50 States</div>
              <div className="text-sm sm:text-base text-slate-600 mt-1">Serving Districts Nationwide</div>
            </div>
          </div>
          {/* Trust badges */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="font-medium text-slate-700">USAC Open Data Integrated</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-medium text-slate-700">Bank-Level Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-slate-700">EPC Portal Compatible</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span className="font-medium text-slate-700">Built by E-Rate Consultants</span>
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">
            Works with USAC Open Data &amp; EPC Portal
          </p>
        </div>
      </section>

      {/* ════════════════════ PROBLEM STATEMENT (Light) ════════════════════ */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
            <div className="hidden lg:flex lg:col-span-2 justify-center">
              <Image
                src="/images/illustrations/erate.png"
                alt="E-Rate funding challenges"
                width={400}
                height={400}
                className="object-contain"
              />
            </div>
            <div className="lg:col-span-3">
              <div className="text-center lg:text-left max-w-3xl mx-auto lg:mx-0 mb-8 sm:mb-10">
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
                  E-Rate Funding is Getting Harder
                </h2>
                <p className="text-base sm:text-lg text-slate-600">
                  You&apos;re facing unprecedented challenges in the E-Rate landscape
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
                <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift">
                  <Image src="/images/icons/appeal.png" alt="" width={44} height={44} className="rounded-2xl mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Time-Consuming Research</h3>
                  <p className="text-sm sm:text-base text-slate-600">
                    Hours searching USAC portals and manually tracking denial patterns across schools.
                  </p>
                </div>
                <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift">
                  <Image src="/images/icons/funding.png" alt="" width={44} height={44} className="rounded-2xl mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Rising Denial Rates</h3>
                  <p className="text-sm sm:text-base text-slate-600">
                    Without systematic tracking, you&apos;re losing winnable funding every cycle.
                  </p>
                </div>
                <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift">
                  <Image src="/images/icons/vendor.png" alt="" width={44} height={44} className="rounded-2xl mb-4" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Missed Opportunities</h3>
                  <p className="text-sm sm:text-base text-slate-600">
                    Form 470 leads slip by and revenue opportunities disappear.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ FEATURES / BENTO GRID (Light) ════════════════════ */}
      <section id="features" className="py-14 sm:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              <span className="gradient-text-dark">Your Unfair Advantage</span>
            </h2>
            <p className="text-base sm:text-xl text-slate-600">
              One platform. Complete E-Rate intelligence. Powered by AI.
            </p>
          </div>
          {/* Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Large card - spans 2 cols */}
            <div className="sm:col-span-2 light-card p-6 sm:p-8 rounded-2xl hover-lift border-l-4 border-l-indigo-500">
              <Image src="/images/icons/ai.png" alt="" width={48} height={48} className="rounded-2xl mb-4" />
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">AI-Powered Analysis</h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Advanced AI <Link href="/features/denial-analysis" className="text-indigo-600 hover:text-indigo-700 font-medium">denial analysis</Link> and automated <Link href="/features/appeal-generator" className="text-indigo-600 hover:text-indigo-700 font-medium">appeal generation</Link>. Our AI understands E-Rate regulations, FCC orders, and USAC precedents to craft winning strategies for your schools.
              </p>
            </div>
            {/* Regular card */}
            <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift border-l-4 border-l-blue-500">
              <Image src="/images/icons/school.png" alt="" width={40} height={40} className="rounded-2xl mb-3" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1 sm:mb-2">Real-Time USAC Data</h3>
              <p className="text-slate-600 text-xs sm:text-sm">Direct API integration with USAC Open Data Portal for live updates.</p>
            </div>
            {/* Regular card */}
            <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift border-l-4 border-l-purple-500">
              <Image src="/images/icons/dashboard.png" alt="" width={40} height={40} className="rounded-2xl mb-3" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1 sm:mb-2">Portfolio Management</h3>
              <p className="text-slate-600 text-xs sm:text-sm">Track schools, vendors, and <Link href="/features/frn-monitoring" className="text-indigo-600 hover:text-indigo-700 font-medium">FRN status</Link> across cycles in one view.</p>
            </div>
            {/* Regular card */}
            <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift border-l-4 border-l-emerald-500">
              <Image src="/images/icons/funding.png" alt="" width={40} height={40} className="rounded-2xl mb-3" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1 sm:mb-2">Instant Insights</h3>
              <p className="text-slate-600 text-xs sm:text-sm">Natural language queries return answers in seconds, not hours.</p>
            </div>
            {/* Large card - spans 2 cols */}
            <div className="sm:col-span-2 light-card p-6 sm:p-8 rounded-2xl hover-lift border-l-4 border-l-pink-500">
              <Image src="/images/icons/appeal.png" alt="" width={48} height={48} className="rounded-2xl mb-4" />
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">Automated Appeal Generation</h3>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                Generate professional, USAC-compliant appeal letters in seconds with our <Link href="/features/appeal-generator" className="text-indigo-600 hover:text-indigo-700 font-medium">AI appeal letter generator</Link>. Our AI analyzes denial reasons, funding year rules, and relevant FCC orders to produce compelling appeals with an 87% success rate.
              </p>
            </div>
            {/* Regular card */}
            <div className="light-card p-5 sm:p-6 rounded-2xl hover-lift border-l-4 border-l-teal-500">
              <Image src="/images/icons/vendor.png" alt="" width={40} height={40} className="rounded-2xl mb-3" />
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1 sm:mb-2">Form 470 Tracking</h3>
              <p className="text-slate-600 text-xs sm:text-sm">Monitor <Link href="/features/form-470-tracking" className="text-indigo-600 hover:text-indigo-700 font-medium">Form 470 postings</Link> and never miss a lead opportunity.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOR APPLICANTS (NEW) ════════════════════ */}
      <section id="for-applicants" className="py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-br from-emerald-50 to-teal-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium mb-5 sm:mb-6">
                <Image src="/images/icons/school.png" alt="" width={24} height={24} className="rounded-lg" />
                For E-Rate Applicants
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 sm:mb-6">
                Maximize Your School&apos;s<br className="hidden sm:block" />
                E-Rate Funding.
              </h2>
              <p className="text-base sm:text-lg text-slate-600 mb-6 sm:mb-8">
                Whether you&apos;re a school, library, or consortium — SkyRate AI helps you track applications, recover denied funding, and never miss a deadline.
              </p>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  { t: "Automatic FRN Tracking", d: "Monitor all your funding requests and their status in real-time" },
                  { t: "AI-Generated Appeal Letters", d: "Turn denials into approvals with professionally crafted appeal letters" },
                  { t: "Deadline Alerts", d: "Never miss a filing window, response deadline, or appeal date" },
                  { t: "C2 Budget Dashboard", d: "Track your Category 2 budget utilization across all entities" },
                  { t: "Plain-English Search", d: 'Ask questions like "What\'s my remaining C2 budget for this year?"' },
                  { t: "Status Change Notifications", d: "Get instant alerts when your FRN status changes" },
                ].map((item) => (
                  <li key={item.t} className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-emerald-600 text-sm sm:text-lg">✓</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm sm:text-base">{item.t}</h4>
                      <p className="text-slate-600 text-xs sm:text-sm">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up?role=applicant"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition mt-6 sm:mt-8 text-sm sm:text-base shadow-lg shadow-emerald-500/20"
              >
                Start Applicant Free Trial
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <p className="text-xs text-slate-500 mt-2">No credit card required - Setup in 5 minutes</p>
            </div>

            {/* Applicant dashboard preview */}
            <div className="relative">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 sm:p-8 text-white shadow-2xl hover-lift">
                <h4 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 opacity-90">Applicant Dashboard Preview</h4>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">12</div>
                    <div className="text-emerald-100 text-xs sm:text-sm">Active FRNs</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">$1.8M</div>
                    <div className="text-emerald-100 text-xs sm:text-sm">Funding Requested</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">3</div>
                    <div className="text-emerald-100 text-xs sm:text-sm">Appeals Generated</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">92%</div>
                    <div className="text-emerald-100 text-xs sm:text-sm">Budget Utilized</div>
                  </div>
                </div>
                <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-2 sm:mb-3">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-yellow-400 flex items-center justify-center">
                      <Image src="/images/icons/notification.png" alt="" width={22} height={22} className="rounded-lg" />
                    </div>
                    <div className="text-xs sm:text-sm font-medium">Deadline Alert</div>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-100 opacity-90">
                    Your Form 471 appeal window for FRN #2431005678 closes in 5 days. AI-generated appeal letter is ready for review.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOR CONSULTANTS (Light) ════════════════════ */}
      <section id="for-consultants" className="py-14 sm:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-5 sm:mb-6">
                <Image src="/images/icons/consultant.png" alt="" width={24} height={24} className="rounded-lg" />
                For E-Rate Consultants
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 sm:mb-6">
                Manage More Schools.<br className="hidden sm:block" />
                Recover More Funding.
              </h2>
              <p className="text-base sm:text-lg text-slate-600 mb-6 sm:mb-8">
                SkyRate AI gives consultants superpowers to manage larger portfolios, win more appeals, and deliver exceptional results for their clients.
              </p>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  { t: "CRN Verification & Auto-Import", d: "Instantly verify your CRN and import all associated schools with one click" },
                  { t: "AI-Generated Appeal Letters", d: "Generate professional, USAC-compliant appeal letters in seconds" },
                  { t: "Denial Pattern Analysis", d: "AI identifies the most effective appeal strategies" },
                  { t: "Portfolio Dashboard", d: "Track all schools, C2 budgets, funding status in one view" },
                  { t: "Natural Language Search", d: 'Ask in plain English: "Show denied schools in Texas for 2024"' },
                  { t: "Appeal Status Tracking", d: "Track pending, submitted, and resolved appeals with history" },
                ].map((item) => (
                  <li key={item.t} className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-blue-600 text-sm sm:text-lg">✓</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm sm:text-base">{item.t}</h4>
                      <p className="text-slate-600 text-xs sm:text-sm">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up?role=consultant"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition mt-6 sm:mt-8 text-sm sm:text-base shadow-lg shadow-indigo-500/20"
              >
                Start Consultant Free Trial
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <p className="text-xs text-slate-500 mt-2">No credit card required - Cancel anytime</p>
            </div>

            {/* Dashboard preview card */}
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 sm:p-8 text-white shadow-2xl hover-lift">
                <h4 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 opacity-90">Consultant Dashboard Preview</h4>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">127</div>
                    <div className="text-blue-100 text-xs sm:text-sm">Total Schools</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">$4.2M</div>
                    <div className="text-blue-100 text-xs sm:text-sm">C2 Budget Tracked</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">23</div>
                    <div className="text-blue-100 text-xs sm:text-sm">Active Denials</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">87%</div>
                    <div className="text-blue-100 text-xs sm:text-sm">Appeal Success</div>
                  </div>
                </div>
                <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-2 sm:mb-3">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-green-400 flex items-center justify-center">
                      <Image src="/images/icons/ai.png" alt="AI" width={24} height={24} className="rounded-lg" />
                    </div>
                    <div className="text-xs sm:text-sm font-medium">Appeal Strategy Generated</div>
                  </div>
                  <p className="text-xs sm:text-sm text-blue-100 opacity-90">
                    Based on denial code 470-001, I recommend citing FCC Order 19-117 which established good faith exemptions for minor procedural errors...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ FOR VENDORS (Light) ════════════════════ */}
      <section id="for-vendors" className="py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Vendor preview card */}
            <div className="order-2 lg:order-1 relative">
              <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-5 sm:p-8 text-white shadow-2xl hover-lift">
                <h4 className="text-base sm:text-lg font-semibold mb-4 sm:mb-6 opacity-90">Vendor Portal Preview</h4>
                <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm mb-3 sm:mb-4">
                  <div className="text-xs sm:text-sm text-purple-100 mb-1 sm:mb-2">Form 470 Lead Alert</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm sm:text-base">Cisco Equipment Request</div>
                      <div className="text-purple-200 text-xs sm:text-sm">Los Angeles USD • $1.2M Budget</div>
                    </div>
                    <span className="px-2 sm:px-3 py-1 bg-green-400 text-green-900 rounded-full text-xs font-bold">NEW</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">47</div>
                    <div className="text-purple-100 text-xs sm:text-sm">Form 470 Leads</div>
                  </div>
                  <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <div className="text-2xl sm:text-3xl font-bold">$18M</div>
                    <div className="text-purple-100 text-xs sm:text-sm">Pipeline Value</div>
                  </div>
                </div>
                <div className="bg-white/15 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                  <div className="text-xs sm:text-sm font-medium mb-1 sm:mb-2">Market Intelligence</div>
                  <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-purple-100">
                    <span>📊 Your Win Rate: 40%</span>
                    <span className="hidden sm:inline">|</span>
                    <span>🏆 Top Competitor: 60%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vendor content */}
            <div className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-5 sm:mb-6">
                <Image src="/images/icons/vendor.png" alt="" width={24} height={24} className="rounded-lg" />
                For E-Rate Vendors
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4 sm:mb-6">
                Win More E-Rate Contracts.<br className="hidden sm:block" />
                Outpace Competitors.
              </h2>
              <p className="text-base sm:text-lg text-slate-600 mb-6 sm:mb-8">
                SkyRate AI gives vendors a competitive edge with Form 470 lead tracking, competitor analysis, and real-time market intelligence.
              </p>
              <ul className="space-y-3 sm:space-y-4">
                {[
                  { t: "Form 470 Lead Generation", d: "Track Form 470 postings by your manufacturers with real-time alerts" },
                  { t: "SPIN Validation & FRN Tracking", d: "Validate your SPIN and track all your FRNs in real-time" },
                  { t: "Competitor Analysis", d: "Compare win rates, response times, and market share" },
                  { t: "Market Intelligence Dashboard", d: "See total market opportunity and identify high-value targets" },
                  { t: "Response Deadline Tracking", d: "Never miss a Form 470 deadline with countdown timers" },
                ].map((item) => (
                  <li key={item.t} className="flex items-start gap-3">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-purple-600 text-sm sm:text-lg">✓</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm sm:text-base">{item.t}</h4>
                      <p className="text-slate-600 text-xs sm:text-sm">{item.d}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up?role=vendor"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition mt-6 sm:mt-8 text-sm sm:text-base shadow-lg shadow-purple-500/20"
              >
                Start Vendor Free Trial
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <p className="text-xs text-slate-500 mt-2">Free consultation available - Cancel anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ STATS (Light with accent) ════════════════════ */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
            {[
              { val: "$500M+", label: "E-Rate Funding Tracked", icon: "💰" },
              { val: "2,500+", label: "Schools Managed", icon: "🏫" },
              { val: "87%", label: "Appeal Success Rate", icon: "📈" },
              { val: "18hrs", label: "Saved Per Week", icon: "⏱️" },
            ].map((s) => (
              <div key={s.label} className="animate-slide-up">
                <div className="text-2xl mb-2">{s.icon}</div>
                <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">{s.val}</div>
                <div className="text-indigo-200 mt-1 sm:mt-2 text-sm sm:text-base">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ HOW IT WORKS (Light) ════════════════════ */}
      <section id="how-it-works" className="py-14 sm:py-20 px-4 sm:px-6 bg-white scroll-mt-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Get Started in 3 Simple Steps
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              Be up and running with full E-Rate intelligence in under 5 minutes
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center light-card rounded-2xl p-6 sm:p-8 hover-lift animate-slide-up-delay-1">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center mx-auto mb-4 sm:mb-6 text-2xl sm:text-3xl font-bold shadow-lg shadow-indigo-500/30">
                1
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">Connect Your Portfolio</h3>
              <p className="text-sm sm:text-base text-slate-600">
                Import your schools and libraries. SkyRate auto-syncs with USAC data so your portfolio is always up to date.
              </p>
            </div>
            <div className="text-center light-card rounded-2xl p-6 sm:p-8 hover-lift animate-slide-up-delay-2">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 text-white flex items-center justify-center mx-auto mb-4 sm:mb-6 text-2xl sm:text-3xl font-bold shadow-lg shadow-purple-500/30">
                2
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">AI Does the Heavy Lifting</h3>
              <p className="text-sm sm:text-base text-slate-600">
                Form tracking, PIA responses, appeal drafts, and funding analysis — all automated by AI that understands E-Rate compliance.
              </p>
            </div>
            <div className="text-center light-card rounded-2xl p-6 sm:p-8 hover-lift animate-slide-up-delay-3">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center mx-auto mb-4 sm:mb-6 text-2xl sm:text-3xl font-bold shadow-lg shadow-emerald-500/30">
                3
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">Stay Ahead of Deadlines</h3>
              <p className="text-sm sm:text-base text-slate-600">
                Real-time FRN monitoring, status change alerts, and deadline reminders. Never miss a filing window again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ TESTIMONIALS / CASE STUDIES ════════════════════ */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Real Results from E-Rate Professionals
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              See how SkyRate AI is transforming E-Rate workflow for consultants, vendors, and applicants
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md hover-lift border border-slate-100">
              <div className="text-indigo-300 text-4xl sm:text-5xl font-serif leading-none mb-3 select-none">&ldquo;</div>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed mb-5 sm:mb-6">
                Before SkyRate, our district spent 40+ hours per funding year on E-Rate paperwork. Now our consultants handle 3x the clients with the same team.
              </p>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">EC</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">E-Rate Consultant</div>
                  <div className="text-xs text-slate-500">Mid-Atlantic Region</div>
                </div>
              </div>
            </div>
            {/* Testimonial 2 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md hover-lift border border-slate-100">
              <div className="text-purple-300 text-4xl sm:text-5xl font-serif leading-none mb-3 select-none">&ldquo;</div>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed mb-5 sm:mb-6">
                The PIA Response Generator saved us from a potential $200K denial. It drafted a compliant response in 2 minutes that we submitted and won.
              </p>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">TD</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Technology Director</div>
                  <div className="text-xs text-slate-500">K-12 School District, Southeast</div>
                </div>
              </div>
            </div>
            {/* Testimonial 3 */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md hover-lift border border-slate-100 sm:col-span-2 lg:col-span-1">
              <div className="text-emerald-300 text-4xl sm:text-5xl font-serif leading-none mb-3 select-none">&ldquo;</div>
              <p className="text-sm sm:text-base text-slate-700 leading-relaxed mb-5 sm:mb-6">
                Finally, a tool that actually understands E-Rate compliance. The FRN monitoring alone has paid for itself ten times over.
              </p>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">IC</div>
                <div>
                  <div className="font-semibold text-slate-900 text-sm">Independent E-Rate Consultant</div>
                  <div className="text-xs text-slate-500">Western Region</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ EMAIL CAPTURE ════════════════════ */}
      <EmailCaptureForm id="email-capture" />

      {/* ════════════════════ PRICING (Light) ════════════════════ */}
      <section id="pricing" className="py-14 sm:py-20 px-4 sm:px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              Choose the plan that fits your needs. All plans include a 14-day free trial.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {/* Applicant — green accent */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border-2 border-emerald-200 shadow-lg hover-lift">
              <div className="flex items-center gap-3 mb-3 sm:mb-4">
                <Image src="/images/icons/school.png" alt="" width={36} height={36} className="rounded-xl" />
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Applicant</h3>
              </div>
              <p className="text-sm sm:text-base text-slate-600 mb-4 sm:mb-6">
                For schools and libraries managing their own E-Rate applications
              </p>
              <div className="mb-4 sm:mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-emerald-600">$199</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">or $1,999/year (save $389)</p>
              </div>
              <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 text-sm sm:text-base">
                {["Automatic FRN tracking", "Real-time status alerts", "AI-generated appeal letters", "Deadline reminders", "Unlimited appeal refinements", "Email support"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-700">
                    <span className="text-emerald-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up?role=applicant" className="block w-full py-2.5 sm:py-3 text-center bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition text-sm sm:text-base shadow-md shadow-emerald-500/20">
                Start Free Trial
              </Link>
              <p className="text-xs text-center text-slate-500 mt-2">No credit card required</p>
            </div>

            {/* Consultant — blue/indigo accent */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border-2 border-indigo-200 shadow-lg hover-lift">
              <div className="flex items-center gap-3 mb-3 sm:mb-4">
                <Image src="/images/icons/consultant.png" alt="" width={36} height={36} className="rounded-xl" />
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Consultant</h3>
              </div>
              <p className="text-sm sm:text-base text-slate-600 mb-4 sm:mb-6">
                Perfect for E-Rate consultants managing school portfolios
              </p>
              <div className="mb-4 sm:mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-indigo-600">$499</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">or $4,999/year (save $989)</p>
              </div>
              <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 text-sm sm:text-base">
                {["Unlimited schools", "AI appeal generation", "Denial pattern analysis", "CRN auto-import", "Natural language search", "Email support"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-700">
                    <span className="text-indigo-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up?role=consultant" className="block w-full py-2.5 sm:py-3 text-center bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition text-sm sm:text-base shadow-md shadow-indigo-500/20">
                Start Free Trial
              </Link>
              <p className="text-xs text-center text-slate-500 mt-2">Setup in 5 minutes - Cancel anytime</p>
            </div>

            {/* Vendor — purple accent */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl border-2 border-purple-200 shadow-lg sm:col-span-2 lg:col-span-1 hover-lift">
              <div className="flex items-center gap-3 mb-3 sm:mb-4">
                <Image src="/images/icons/vendor.png" alt="" width={36} height={36} className="rounded-xl" />
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Vendor</h3>
              </div>
              <p className="text-sm sm:text-base text-slate-600 mb-4 sm:mb-6">
                Ideal for E-Rate vendors tracking leads and competitors
              </p>
              <div className="mb-4 sm:mb-6">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-purple-600">$499</span>
                  <span className="text-slate-500">/month</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">or $4,999/year (save $989)</p>
              </div>
              <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 text-sm sm:text-base">
                {["Form 470 lead tracking", "Multi-manufacturer monitoring", "FRN status tracking", "Competitor analysis", "Market intelligence dashboard", "Priority support"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-slate-700">
                    <span className="text-purple-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up?role=vendor" className="block w-full py-2.5 sm:py-3 text-center bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition text-sm sm:text-base shadow-md shadow-purple-500/20">
                Start Free Trial
              </Link>
              <p className="text-xs text-center text-slate-500 mt-2">Free consultation available</p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ REQUEST A DEMO CTA ════════════════════ */}
      <section className="py-10 sm:py-14 px-4 sm:px-6 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto text-center">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3">
            Not ready to sign up?
          </h3>
          <p className="text-sm sm:text-base text-slate-600 mb-6 max-w-xl mx-auto">
            Schedule a free demo to see SkyRate with your district&apos;s real data. No commitment, no pressure — just a conversation about how we can help.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <a
              href={process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/skyrate"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 text-sm sm:text-base flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule a Free Demo
            </a>
            <a
              href="tel:+18557657291"
              className="w-full sm:w-auto px-6 py-3 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition text-sm sm:text-base flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call (855) 765-7291
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════ FAQ (Light) ════════════════════ */}
      <section id="faq" className="py-14 sm:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-4 sm:space-y-6">
            {[
              { q: "How does AI appeal generation work?", a: "Our AI analyzes the specific denial reason, funding year, and relevant FCC orders to generate a customized appeal letter. It uses advanced AI with specialized training on E-Rate regulations to craft compelling, compliant appeals." },
              { q: "Is my data secure?", a: "Yes. We use industry-standard encryption, secure authentication, and follow best practices for data protection. Your school and client data is never shared or sold. We're committed to FERPA compliance." },
              { q: "Can I cancel my subscription anytime?", a: "Absolutely. You can cancel your subscription at any time with no penalties. Your access continues until the end of your billing period. We also offer a 14-day free trial so you can evaluate before committing." },
              { q: "What's the difference between the plans?", a: "The Applicant plan is for schools managing their own E-Rate. The Consultant plan focuses on portfolio management, denial tracking, and AI-powered appeal generation. The Vendor plan focuses on Form 470 lead tracking and competitor analysis. Choose based on your role." },
            ].map((faq) => (
              <div key={faq.q} className="light-card rounded-xl p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-1.5 sm:mb-2">{faq.q}</h3>
                <p className="text-sm sm:text-base text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>

          {/* Lead Magnet CTA */}
          <div className="mt-8 sm:mt-10 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-5 sm:p-6 border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">Free Resource</p>
              <h4 className="text-base sm:text-lg font-bold text-slate-900">
                Download our 2026 E-Rate Filing Timeline &amp; Checklist
              </h4>
            </div>
            <a
              href="#email-capture"
              className="shrink-0 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/25 text-sm flex items-center gap-2"
            >
              Get the Checklist
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════ CONTACT HUB ════════════════════ */}
      <section id="contact" className="py-14 sm:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Get in Touch
            </h2>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
              We&apos;re available however you prefer to reach us
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* WhatsApp */}
            <a
              href="https://wa.me/18557657291?text=Hi%20SkyRate!%20I'm%20interested%20in%20E-Rate%20consulting%20services."
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
              className="light-card rounded-2xl p-5 sm:p-6 text-center hover-lift group"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#25D366]/10 flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:bg-[#25D366]/20 transition">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-1">WhatsApp</h3>
              <p className="text-xs sm:text-sm text-slate-500">Chat with us now</p>
            </a>

            {/* Phone */}
            <a
              href="tel:+18557657291"
              aria-label="Call (855) 765-7291"
              className="light-card rounded-2xl p-5 sm:p-6 text-center hover-lift group"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:bg-blue-500/20 transition">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-1">(855) 765-7291</h3>
              <p className="text-xs sm:text-sm text-slate-500">Toll-free, call anytime</p>
            </a>

            {/* Email */}
            <a
              href="mailto:support@skyrate.ai"
              aria-label="Email support@skyrate.ai"
              className="light-card rounded-2xl p-5 sm:p-6 text-center hover-lift group"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:bg-purple-500/20 transition">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-1">Email Us</h3>
              <p className="text-xs sm:text-sm text-slate-500">support@skyrate.ai</p>
            </a>

            {/* Book a Call */}
            <a
              href={process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/skyrate"}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Book a free strategy call"
              className="light-card rounded-2xl p-5 sm:p-6 text-center hover-lift group"
            >
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:bg-teal-500/20 transition">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900 text-sm sm:text-base mb-1">Book a Call</h3>
              <p className="text-xs sm:text-sm text-slate-500">Free 15-min strategy call</p>
            </a>
          </div>
        </div>
      </section>

      {/* ════════════════════ FINAL CTA ════════════════════ */}
      <section className="py-14 sm:py-20 px-4 sm:px-6 relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800">
        <div className="absolute inset-0 z-0">
          <Image src="/images/illustrations/success.png" alt="" fill className="object-cover opacity-10" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 sm:mb-6">
            Ready to Maximize Your E-Rate Funding?
          </h2>
          <p className="text-base sm:text-xl text-purple-100 mb-8 sm:mb-10 max-w-2xl mx-auto">
            Join hundreds of E-Rate professionals who are already using SkyRate AI to save time, win more appeals, and discover new opportunities.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-slate-100 transition text-base sm:text-lg shadow-xl animate-gentle-bounce"
            >
              Start Your 14-Day Free Trial
            </Link>
            <SafeEmail
              className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 border-2 border-white/30 text-white rounded-xl font-semibold hover:bg-white/10 transition text-base sm:text-lg"
              fallback="Contact Sales"
            >
              Contact Sales
            </SafeEmail>
          </div>
          <p className="text-purple-200 text-xs sm:text-sm mt-4 sm:mt-6">
            No credit card required • Full access • Cancel anytime
          </p>
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer className="bg-slate-900 text-slate-400 py-10 sm:py-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 sm:gap-8 mb-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <img src="/images/logos/logo-icon-transparent.png" alt="" width={28} height={28} className="rounded-lg" />
                <span className="text-white font-bold text-lg">SkyRate<span className="text-purple-400">.AI</span></span>
              </div>
              <p className="text-xs sm:text-sm">
                AI-powered E-Rate intelligence for applicants, consultants, and vendors.
              </p>
              <div className="mt-3 space-y-1">
                <a href="tel:855-765-7291" className="flex items-center gap-1.5 text-xs sm:text-sm hover:text-white transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  (855) 765-7291 <span className="text-green-400 text-[10px]">(Toll-Free)</span>
                </a>
                <a href="mailto:support@skyrate.ai" className="flex items-center gap-1.5 text-xs sm:text-sm hover:text-white transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  support@skyrate.ai
                </a>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <a
                  href={process.env.NEXT_PUBLIC_LINKEDIN_URL || "https://www.linkedin.com/company/skyrate-llc"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="SkyRate on LinkedIn"
                  className="text-slate-400 hover:text-white transition"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Features</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/features/consultants" className="hover:text-white transition">For Consultants</Link></li>
                <li><Link href="/features/vendors" className="hover:text-white transition">For Vendors</Link></li>
                <li><Link href="/features/applicants" className="hover:text-white transition">For Applicants</Link></li>
                <li><Link href="/features/appeal-generator" className="hover:text-white transition">Appeal Generator</Link></li>
                <li><Link href="/features/frn-monitoring" className="hover:text-white transition">FRN Monitoring</Link></li>
                <li><Link href="/features/form-470-tracking" className="hover:text-white transition">Form 470 Search</Link></li>
                <li><Link href="/features/denial-analysis" className="hover:text-white transition">Denial Analysis</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Product</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/pricing" className="hover:text-white transition">Pricing</Link></li>
                <li><Link href="/sign-up" className="hover:text-white transition">Free Trial</Link></li>
                <li><Link href="/sign-in" className="hover:text-white transition">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Resources</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/blog" className="hover:text-white transition">Blog</Link></li>
                <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
                <li><a href="https://www.usac.org/e-rate/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">USAC E-Rate</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Company</h4>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-xs sm:text-sm">© {new Date().getFullYear()} SkyRate AI. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs sm:text-sm">
              <span className="flex items-center gap-1">🔒 SSL Secured</span>
              <span className="flex items-center gap-1">✓ FERPA Ready</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating communication widgets — landing page only */}
      <WhatsAppButton />
      <MobileContactBar />
    </div>
  );
}
