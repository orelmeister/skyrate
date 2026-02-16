import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Clock, Sparkles, BookOpen, Monitor, BarChart3, Zap, Shield, Users, Brain, FileText, CheckCircle, AlertTriangle, Search, TrendingUp } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Consultant Software: What to Look For | SkyRate AI",
  description: "Find the best E-Rate consultant software. Compare features like FRN tracking, denial analysis, appeal generation, and portfolio management to grow your practice.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog/erate-consultant-software-guide" },
  openGraph: {
    title: "E-Rate Consultant Software: What to Look For",
    description: "Guide to choosing the right E-Rate consultant software for your practice.",
    url: "https://skyrate.ai/blog/erate-consultant-software-guide",
    siteName: "SkyRate AI",
    type: "article",
    publishedTime: "2026-02-16T00:00:00Z",
  },
};

export default function ErateConsultantSoftwareGuidePage() {
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
            <Link href="/blog" className="text-purple-300 text-sm font-medium flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Blog
            </Link>
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

      {/* Article */}
      <article className="bg-white py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-8">
            <Link href="/blog" className="hover:text-purple-600 transition-colors">Blog</Link>
            <span>/</span>
            <span className="text-slate-900">E-Rate Consultant Software Guide</span>
          </div>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Guide</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 11 min read
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
              E-Rate Consultant Software: What to Look For
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              The E-Rate consulting landscape is evolving fast. Spreadsheets and manual tracking can&apos;t keep up with the complexity of modern portfolios. Here&apos;s what to look for in software that actually moves the needle for your practice.
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-500 border-t border-slate-100 pt-6">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <span className="text-slate-900 font-medium">SkyRate AI Team</span>
                <span className="mx-2">·</span>
                <time dateTime="2026-02-16">February 16, 2026</time>
              </div>
            </div>
          </header>

          {/* Article Body */}
          <div className="prose prose-slate prose-lg max-w-none">
            <section className="mb-12">
              <p className="text-slate-700 leading-relaxed mb-6">
                E-Rate consulting is a specialized, high-stakes profession. The consultants who help schools and libraries navigate the federal E-Rate program are responsible for millions of dollars in funding decisions every year. They manage competitive bidding, file complex applications, track FRN statuses across multiple funding years, respond to Program Integrity Assurance (PIA) reviews, and — when things go wrong — build appeals to recover denied funding.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                For decades, many consultants have relied on spreadsheets, email folders, and USAC&apos;s own (sometimes sluggish) web tools to manage this work. But as portfolios grow and E-Rate rules become more nuanced, the limitations of manual tracking become painfully clear: missed deadlines, overlooked denials, hours spent cross-referencing FRN data, and the constant risk of letting funding slip through the cracks.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                Purpose-built E-Rate consultant software solves these problems — but not all solutions are created equal. Here&apos;s what to look for when evaluating software for your E-Rate practice.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Why Consultants Need Dedicated Software</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                The E-Rate program is uniquely complex. It overlays federal telecommunications policy, school finance, competitive procurement rules, and an ever-changing regulatory environment managed by both USAC and the FCC. Generic project management tools or CRMs simply aren&apos;t designed to handle:
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="text-slate-700"><strong>FRN-level tracking</strong> across multiple funding years, USAC statuses, and COMAD/RFCDL cycles</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="text-slate-700"><strong>Denial code analysis</strong> that maps USAC rejection reasons to specific FCC rules and appeal precedents</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="text-slate-700"><strong>Multi-client portfolio management</strong> where one consultant may oversee dozens of districts and hundreds of individual entities</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="text-slate-700"><strong>Category 2 budget utilization tracking</strong> across 5-year cycles on a per-entity basis</span>
                </li>
              </ul>
              <p className="text-slate-700 leading-relaxed mb-6">
                When your spreadsheet can&apos;t tell you which of your 150 clients has an FRN that just moved to &quot;denied&quot; yesterday — or that a denial deadline for appeal is in 10 days — you have a serious operational gap. That gap costs your clients money and costs you credibility.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Key Features to Look For</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Not all E-Rate software is built the same. When evaluating solutions, prioritize these capabilities:
              </p>

              <div className="space-y-6 mb-6">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Monitor className="w-5 h-5 text-purple-600" />
                    1. Real-Time FRN Status Monitoring
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed mb-3">
                    The backbone of any E-Rate management platform. You need software that pulls FRN status data directly from USAC&apos;s systems and alerts you when statuses change — from &quot;In Review&quot; to &quot;Funded&quot; to &quot;Denied.&quot; Look for platforms that provide automated notifications rather than requiring you to manually check USAC&apos;s portal for every FRN.
                  </p>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    SkyRate AI&apos;s <Link href="/features/frn-monitoring" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">FRN monitoring system</Link> tracks status changes across your entire portfolio and sends proactive alerts so you never miss a critical update.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Search className="w-5 h-5 text-red-600" />
                    2. Denial Analysis &amp; Pattern Recognition
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed mb-3">
                    When an FRN is denied, the clock starts ticking. You need to understand the denial reason immediately, assess whether it&apos;s appealable, and begin building your case. The best software maps denial codes to specific FCC rules and precedents, identifies patterns across your portfolio, and suggests the strongest appeal strategy.
                  </p>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    SkyRate AI&apos;s <Link href="/features/denial-analysis" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">denial analysis engine</Link> automatically categorizes denials and surfaces the relevant FCC orders and prior appeal decisions that apply to each case.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-indigo-600" />
                    3. AI-Powered Appeal Generation
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed mb-3">
                    Writing appeal letters is one of the most time-intensive tasks in E-Rate consulting. A strong appeal requires understanding the specific denial reason, citing relevant FCC precedent, constructing a compliant legal argument, and formatting the letter to USAC&apos;s requirements. AI-powered tools can draft high-quality appeal letters in minutes rather than hours.
                  </p>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    SkyRate AI&apos;s <Link href="/features/appeal-generator" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">appeal generator</Link> uses multiple AI models trained on thousands of successful E-Rate appeals to produce ready-to-submit letters tailored to each specific denial.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-green-600" />
                    4. Portfolio Management
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Consultants managing 10, 50, or 100+ clients need a centralized view of their entire portfolio. Look for dashboard-level visibility into all clients&apos; FRN statuses, upcoming deadlines, denied FRNs, funded amounts, and C2 budget utilization — all in one place, with drill-down capability to individual entities.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-amber-600" />
                    5. USAC Data Integration
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    The software should connect directly to USAC/Socrata data sources for real-time information on FRN statuses, school eligibility, BEN numbers, Form 470 filings, and more. Manual data entry is error-prone and unsustainable at scale. Native integration with USAC APIs is a must-have for serious consultant tools.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How AI Is Transforming E-Rate Consulting</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Artificial intelligence is fundamentally changing what&apos;s possible in E-Rate consulting. Tasks that previously required hours of manual research and writing can now be completed in minutes with AI assistance. Here&apos;s where the impact is most significant:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <Zap className="w-5 h-5 text-purple-600 mb-2" />
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Appeal Letters</h3>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    AI drafts appeal letters in 2-3 minutes that previously took 2-3 hours — complete with FCC citations and structured legal arguments.
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <BarChart3 className="w-5 h-5 text-purple-600 mb-2" />
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Denial Analysis</h3>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    AI instantly categorizes denial reasons, identifies patterns, and surfaces the most relevant precedent cases for each unique situation.
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <Search className="w-5 h-5 text-purple-600 mb-2" />
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Natural Language Search</h3>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    Ask questions about USAC data in plain English — &quot;Show me all denied FRNs for District X in FY2025&quot; — and get structured results instantly.
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <TrendingUp className="w-5 h-5 text-purple-600 mb-2" />
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Predictive Insights</h3>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    AI models can flag FRNs that are likely to face PIA review or denial based on historical patterns, allowing proactive intervention.
                  </p>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                The consultants who adopt AI-powered tools now will be able to serve more clients, deliver better outcomes, and differentiate their practice from competitors still relying on manual processes.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What Makes SkyRate AI Different</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">SkyRate AI was built specifically for E-Rate professionals</Link>. Unlike generic project management tools adapted for E-Rate use, every feature in SkyRate AI is designed around the unique workflows of E-Rate consultants, vendors, and applicants:
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700"><strong>Multi-model AI:</strong> Choose from DeepSeek, Google Gemini, and Claude for denial analysis and appeal generation — ensuring the best output for each use case.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700"><strong>Direct USAC integration:</strong> Real-time data from USAC/Socrata APIs — no manual data entry, no stale information.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700"><strong>Portfolio-wide visibility:</strong> Monitor every client, every FRN, every status change from a single dashboard with customizable alerts.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700"><strong>Appeal letter generation:</strong> Produce FCC-precedent-backed appeal letters in minutes, with customizable templates and multi-model comparison.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700"><strong>C2 budget tracking:</strong> Per-entity budget utilization across the 5-year cycle with remaining balance visibility.</span>
                </li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">ROI Analysis: The Business Case for E-Rate Software</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Investing in dedicated E-Rate software isn&apos;t just about convenience — it&apos;s about measurable return on investment. Here&apos;s how the numbers typically work for a mid-size E-Rate practice:
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                      <span className="text-xs font-bold text-green-700">$</span>
                    </div>
                    <div className="text-slate-700 text-sm">
                      <strong>Time saved per appeal:</strong> AI-generated appeal drafts cut writing time from 3-4 hours to 15-30 minutes per letter. At a consultant&apos;s effective rate of $150-250/hour, that&apos;s $450-1,000+ saved per appeal.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                      <span className="text-xs font-bold text-green-700">$</span>
                    </div>
                    <div className="text-slate-700 text-sm">
                      <strong>Denials caught faster:</strong> Automated monitoring means you discover denials days or weeks earlier, giving you more time to build a strong appeal before deadlines expire.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                      <span className="text-xs font-bold text-green-700">$</span>
                    </div>
                    <div className="text-slate-700 text-sm">
                      <strong>More clients served:</strong> Operational efficiency from automated tracking and AI analysis means you can grow your portfolio by 30-50% without proportionally increasing overhead.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                      <span className="text-xs font-bold text-green-700">$</span>
                    </div>
                    <div className="text-slate-700 text-sm">
                      <strong>Funding recovered:</strong> Catching and appealing denials that would otherwise be missed directly translates to recovered funding for your clients — strengthening your value proposition.
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed">
                For most consultants, the software pays for itself within the first month through time savings alone. The additional revenue from being able to serve more clients and recover more denied funding makes it a clear investment. Check our <Link href="/pricing" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">pricing page</Link> for current plans.
              </p>
            </section>
          </div>
        </div>
      </article>

      {/* Related Articles */}
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-10">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/blog/top-erate-denial-reasons"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                Top 10 E-Rate Denial Reasons and How to Fix Them
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Discover the most common E-Rate denial reasons and actionable strategies to fix and prevent each one.
              </p>
              <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Read article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              href="/blog/erate-category-2-budget-guide"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                E-Rate Category 2 Budget: Everything You Need to Know
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Master C2 budgets — learn how they&apos;re calculated, which equipment qualifies, and how to maximize your allocation.
              </p>
              <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Read article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-200 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Built for E-Rate Consultants Who Mean Business
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            SkyRate AI gives you the FRN monitoring, denial analysis, and AI-powered appeal generation tools to serve more clients and recover more funding. Start your free trial today.
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
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 mb-4">
                <img src="/images/logos/logo-icon-transparent.png" alt="" width={28} height={28} className="rounded-lg" />
                <span className="text-white font-bold text-lg">SkyRate<span className="text-purple-400">.AI</span></span>
              </Link>
              <p className="text-slate-500 text-sm leading-relaxed">AI-powered E-Rate intelligence for consultants, vendors, and schools.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Solutions</h4>
              <ul className="space-y-2.5">
                <li><Link href="/features/consultants" className="text-slate-400 hover:text-white text-sm transition-colors">For Consultants</Link></li>
                <li><Link href="/features/vendors" className="text-slate-400 hover:text-white text-sm transition-colors">For Vendors</Link></li>
                <li><Link href="/features/applicants" className="text-slate-400 hover:text-white text-sm transition-colors">For Applicants</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li><Link href="/pricing" className="text-slate-400 hover:text-white text-sm transition-colors">Pricing</Link></li>
                <li><Link href="/features/appeal-generator" className="text-slate-400 hover:text-white text-sm transition-colors">Appeal Generator</Link></li>
                <li><Link href="/features/frn-monitoring" className="text-slate-400 hover:text-white text-sm transition-colors">FRN Monitoring</Link></li>
                <li><Link href="/features/denial-analysis" className="text-slate-400 hover:text-white text-sm transition-colors">Denial Analysis</Link></li>
                <li><Link href="/features/form-470-tracking" className="text-slate-400 hover:text-white text-sm transition-colors">Form 470 Tracking</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Company</h4>
              <ul className="space-y-2.5">
                <li><Link href="/about" className="text-slate-400 hover:text-white text-sm transition-colors">About</Link></li>
                <li><Link href="/contact" className="text-slate-400 hover:text-white text-sm transition-colors">Contact</Link></li>
                <li><Link href="/blog" className="text-slate-400 hover:text-white text-sm transition-colors">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li><Link href="/terms" className="text-slate-400 hover:text-white text-sm transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-slate-400 hover:text-white text-sm transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center">
            <p className="text-slate-500 text-sm">&copy; {new Date().getFullYear()} SkyRate AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
