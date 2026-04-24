import { Metadata } from "next";
import Link from "next/link";
import { SafeEmail } from "@/components/SafeEmail";
import { BlogPostJsonLd } from "@/components/seo/BlogPostJsonLd";
import { ArrowRight, ArrowLeft, Clock, Sparkles, BookOpen, DollarSign, Calculator, Laptop, Wifi, Server, CheckCircle, AlertTriangle, TrendingUp, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Category 2 Budget 2026: $167/Student Calculator",
  description: "$167/student and $132,300/building — official FY2026 Category 2 E-Rate budgets. Calculate your district total and see all eligible Wi-Fi equipment. Updated April 2026.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog/erate-category-2-budget-guide" },
  openGraph: {
    title: "E-Rate Category 2 Budget 2026: $167/Student Calculator",
    description: "$167/student and $132,300/building — official FY2026 Category 2 E-Rate budgets. Calculate your district total and see all eligible Wi-Fi equipment.",
    url: "https://skyrate.ai/blog/erate-category-2-budget-guide",
    siteName: "SkyRate AI",
    type: "article",
    publishedTime: "2026-02-16T00:00:00Z",
    modifiedTime: "2026-04-24T00:00:00Z",
  },
};

export default function ErateCategory2BudgetGuidePage() {
  return (
    <>
    <BlogPostJsonLd
      title="E-Rate Category 2 Budget 2026: $167/Student Calculator"
      description="$167/student for schools and $132,300 per library building — official FY2026 Category 2 E-Rate budget amounts. Full calculator, eligible equipment, and 5-year cycle rules."
      slug="erate-category-2-budget-guide"
      datePublished="2026-02-16T00:00:00Z"
      dateModified="2026-04-22T00:00:00Z"
    />
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
            <span className="text-slate-900">E-Rate Category 2 Budget Guide</span>
          </div>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Guide</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 12 min read
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
              E-Rate Category 2 Budget Calculator 2026: Per-Student Funding Amounts
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              FY2026 Category 2 budgets are $167 per student for schools and $132,300 per library building over the five-year cycle. This guide covers eligible equipment, how to calculate your district&apos;s exact allocation, the 5-year budget cycle rules, common mistakes, and strategies to maximize every dollar. Updated April 2026.
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
            {/* Disclaimer */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-10">
              <p className="text-purple-900 text-sm leading-relaxed">
                <strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute legal, regulatory, or compliance advice. E-Rate rules are complex and change frequently. For specific guidance on your situation, <Link href="/contact" className="text-purple-600 underline font-medium">contact our team</Link> or <Link href="/sign-up" className="text-purple-600 underline font-medium">try SkyRate AI</Link> for personalized analysis.
              </p>
            </div>

            {/* Table of Contents */}
            <nav aria-label="Article contents" className="bg-purple-50 border border-purple-100 rounded-xl p-6 mb-10">
              <p className="text-sm font-bold text-slate-900 mb-3">In This Guide</p>
              <ol className="space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
                <li><a href="#what-is-c2" className="text-purple-600 hover:underline">What Is Category 2 Funding?</a></li>
                <li><a href="#budget-calculation" className="text-purple-600 hover:underline">How C2 Budgets Are Calculated</a></li>
                <li><a href="#budget-table" className="text-purple-600 hover:underline">FY2026 Budget Reference Table</a></li>
                <li><a href="#budget-cycles" className="text-purple-600 hover:underline">Budget Cycles: The 5-Year Window</a></li>
                <li><a href="#discount-rates" className="text-purple-600 hover:underline">How Discount Rates Work with C2</a></li>
                <li><a href="#mistakes" className="text-purple-600 hover:underline">Common C2 Budget Mistakes</a></li>
                <li><a href="#maximizing" className="text-purple-600 hover:underline">Tips for Maximizing Your C2 Budget</a></li>
                <li><a href="#faq" className="text-purple-600 hover:underline">Frequently Asked Questions</a></li>
              </ol>
            </nav>

            <section className="mb-12">
              <p className="text-slate-700 leading-relaxed mb-6">, provides over $4 billion annually in discounts to eligible schools and libraries for telecommunications, internet access, and internal networking equipment. While Category 1 covers data transmission services and internet access, <strong>Category 2 (C2)</strong> focuses on internal connections — the networking infrastructure that delivers connectivity within buildings and across campuses.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                For many <Link href="/features/applicants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">applicants</Link>, Category 2 represents a significant funding opportunity that can cover Wi-Fi access points, managed internal broadband services, switches, routers, cabling, and basic maintenance of internal connections. However, the budget-based nature of C2 funding means applicants must understand how their budgets are calculated — and plan strategically to make the most of every dollar.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="what-is-c2" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What Is Category 2 Funding?</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Category 2 funding covers the internal networking equipment and services that schools and libraries need to distribute broadband connectivity to classrooms, offices, and patron areas. Unlike Category 1 (which has no budget cap and is funded based on demand and discount rate), Category 2 operates on a per-student or per-square-foot budget system.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-purple-600" />
                  Eligible Category 2 Equipment &amp; Services
                </h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Wireless access points (WAPs)</strong> — the most commonly funded C2 item</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Network switches</strong> — managed and unmanaged, including PoE switches</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Internal routers</strong> — for routing traffic within a campus or building</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Structured cabling</strong> — UTP/fiber, connectors, patch panels, and racks</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>UPS/battery backup</strong> — to support eligible networking equipment</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Managed internal broadband services (MIBS)</strong> — cloud-managed networking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-700"><strong>Basic Maintenance of Internal Connections (BMIC)</strong> — support contracts for eligible equipment</span>
                  </li>
                </ul>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                Notably, end-user devices like laptops, tablets, and interactive whiteboards are <strong>not</strong> eligible under Category 2. Firewalls and content filters were moved to a separate category treatment in recent years and have specific rules. Always check the current Eligible Services List (ESL) published by USAC for the most up-to-date eligibility information.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="budget-calculation" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How C2 Budgets Are Calculated</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Category 2 budgets are calculated on a <strong>pre-discount</strong> basis, meaning the budget cap applies to the total cost before the E-Rate discount percentage is applied. The calculation differs slightly for schools and libraries:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-purple-600" />
                    <h3 className="font-bold text-slate-900">Schools</h3>
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    <strong>$167 per student</strong> (pre-discount) based on the student count reported in the school&apos;s enrollment data. Minimum budget floor of $25,000 per school building ensures small schools receive meaningful funding.
                  </p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-slate-900">Libraries</h3>
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    <strong>$132,300 per library building</strong> (pre-discount) for the five-year cycle. The minimum budget floor of $25,000 per building applies here as well.
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Calculator className="w-5 h-5 text-amber-600" />
                  Example Calculation
                </h3>
                <p className="text-slate-700 text-sm leading-relaxed">
                  A school with 500 students has a pre-discount C2 budget of <strong>500 × $167 = $83,500</strong> over the 5-year budget cycle. If the school has an 80% discount rate, the E-Rate program would cover $66,800 and the school would be responsible for the remaining $16,700 non-discount share. The school can spread this budget across any or all years within the cycle.
                </p>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                It&apos;s important to note that the budget is per <strong>entity</strong> (individual school building or library branch), not per district. A district with 10 schools calculates each school&apos;s budget independently based on that building&apos;s enrollment. District-level applicants can then allocate spending flexibly across buildings as long as no individual building exceeds its budget cap.
              </p>
            </section>

            <section id="budget-table" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">FY2026 Category 2 Budget Reference Table</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Use this table to estimate your school&apos;s total Category 2 budget for the FY2026&ndash;2030 cycle. All amounts are <strong>pre-discount</strong> totals for the full five years. Multiply by your discount rate to find the E-Rate contribution.
              </p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-purple-600 text-white">
                      <th className="text-left p-3 rounded-tl-lg">Enrollment</th>
                      <th className="text-right p-3">5-Year C2 Budget</th>
                      <th className="text-right p-3">At 80% Discount</th>
                      <th className="text-right p-3 rounded-tr-lg">At 50% Discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td className="p-3 font-medium text-slate-800">Under 150 students</td>
                      <td className="p-3 text-right text-slate-700">$25,000 (minimum floor)</td>
                      <td className="p-3 text-right text-green-700 font-medium">$20,000</td>
                      <td className="p-3 text-right text-slate-600">$12,500</td>
                    </tr>
                    <tr className="bg-white border-b border-slate-200">
                      <td className="p-3 font-medium text-slate-800">200 students</td>
                      <td className="p-3 text-right text-slate-700">$33,400</td>
                      <td className="p-3 text-right text-green-700 font-medium">$26,720</td>
                      <td className="p-3 text-right text-slate-600">$16,700</td>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td className="p-3 font-medium text-slate-800">500 students</td>
                      <td className="p-3 text-right text-slate-700">$83,500</td>
                      <td className="p-3 text-right text-green-700 font-medium">$66,800</td>
                      <td className="p-3 text-right text-slate-600">$41,750</td>
                    </tr>
                    <tr className="bg-white border-b border-slate-200">
                      <td className="p-3 font-medium text-slate-800">1,000 students</td>
                      <td className="p-3 text-right text-slate-700">$167,000</td>
                      <td className="p-3 text-right text-green-700 font-medium">$133,600</td>
                      <td className="p-3 text-right text-slate-600">$83,500</td>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td className="p-3 font-medium text-slate-800">2,000 students</td>
                      <td className="p-3 text-right text-slate-700">$334,000</td>
                      <td className="p-3 text-right text-green-700 font-medium">$267,200</td>
                      <td className="p-3 text-right text-slate-600">$167,000</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="p-3 font-medium text-slate-800">Per library building</td>
                      <td className="p-3 text-right text-slate-700">$132,300</td>
                      <td className="p-3 text-right text-green-700 font-medium">$105,840</td>
                      <td className="p-3 text-right text-slate-600">$66,150</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-600 text-xs italic mb-4">
                FY2026&ndash;2030 cycle. Schools: $167/student pre-discount, minimum $25,000/building. Libraries: $132,300/building pre-discount. E-Rate pays Budget &times; Discount Rate; applicant pays the remainder.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                For a district with 10 schools averaging 400 students each, the total five-year Category 2 budget is approximately <strong>$668,000 pre-discount</strong>. At an average 75% discount rate, E-Rate contributes $501,000 toward network equipment and installation &mdash; funds that can transform classroom connectivity across an entire district.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="budget-cycles" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Budget Cycles: The 5-Year Window</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Category 2 budgets operate on a <strong>five-year cycle</strong>. The current cycle structure is:
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs font-bold text-slate-600">1</span>
                  </div>
                  <div className="text-slate-700">
                    <strong>Cycle 1:</strong> FY2021–FY2025 — this cycle is ending, and any unused budget <strong>does not</strong> roll forward.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-purple-200 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-xs font-bold text-purple-700">2</span>
                  </div>
                  <div className="text-slate-700">
                    <strong>Cycle 2:</strong> FY2026–FY2030 — the new cycle with <strong>freshly reset budgets</strong> for every eligible entity.
                  </div>
                </li>
              </ul>
              <p className="text-slate-700 leading-relaxed mb-6">
                The cycle reset is a critically important event. When a new cycle begins, every school and library receives their full C2 budget again — regardless of how much they spent in the previous cycle. This means an entity that used its entire FY2021–2025 budget gets a brand-new allocation for FY2026–2030. Conversely, unused budget from the previous cycle <strong>does not carry over</strong>.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                For <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">E-Rate consultants</Link> managing school portfolios, tracking C2 budget utilization across the cycle is essential. SkyRate AI&apos;s <Link href="/features/frn-monitoring" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">FRN monitoring tools</Link> can help you track remaining budgets in real time so no funding goes to waste.
              </p>
            </section>

            {/* Mid-Article CTA */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 my-10">
              <p className="text-slate-900 font-semibold mb-2">Feeling overwhelmed? You don&apos;t have to do this alone.</p>
              <p className="text-slate-600 text-sm mb-4">
                SkyRate AI automates the complex parts of E-Rate management so you can focus on what matters. Our platform handles denial analysis, appeal generation, FRN monitoring, and more.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/sign-up" className="inline-flex items-center gap-1 bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
                  Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link href="/contact" className="inline-flex items-center gap-1 border border-purple-300 text-purple-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-50 transition-colors">
                  Contact Us for Help
                </Link>
              </div>
            </div>

            <section className="mb-12">
              <h2 id="discount-rates" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How Discount Rates Work with C2</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                E-Rate discount rates range from 20% to 85% for Category 2, based on the school or library&apos;s poverty level and urban/rural status. The discount rate determines what percentage of the pre-discount cost E-Rate will cover, with the applicant responsible for the non-discount share.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                The discount rate matrix for C2 is slightly different from Category 1 — Category 2 discounts max out at 85% (compared to 90% for Category 1 in some cases). High-poverty, rural schools typically receive the highest discount rates, while wealthier suburban districts may see rates as low as 20%.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                A key planning consideration: since your budget cap is pre-discount, a higher discount rate means more E-Rate dollars from the same budget. A school with an 85% discount and a $100,000 C2 budget gets $85,000 in E-Rate funding, while a school at 50% gets only $50,000 from the same budget.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="mistakes" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Common C2 Budget Mistakes</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Even experienced applicants and consultants make errors with Category 2 budgets. Here are the most frequent pitfalls:
              </p>
              <ul className="space-y-4 mb-6">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Confusing pre-discount and post-discount budgets:</span>
                    <span className="text-slate-700"> The $167/student cap is pre-discount. Many applicants mistakenly think they can spend $167 per student in E-Rate funds, when in reality the $167 includes both the E-Rate share and the applicant&apos;s co-pay.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Incorrect student counts:</span>
                    <span className="text-slate-700"> Budget calculations use the student enrollment figure from the entity&apos;s E-Rate profile. If this number is outdated or incorrect, the budget will be wrong. Verify enrollment data annually.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Waiting too long in the cycle:</span>
                    <span className="text-slate-700"> Applicants who save their entire budget for the last year of a cycle risk running into procurement delays, installation problems, or filing errors that could cause them to lose unspent funds entirely.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Not planning across the full cycle:</span>
                    <span className="text-slate-700"> A strategic five-year technology refresh plan aligned to the C2 cycle can help schools prioritize spending and ensure every building gets the infrastructure it needs.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Requesting ineligible equipment:</span>
                    <span className="text-slate-700"> Including ineligible items (like end-user devices or software licenses not tied to eligible equipment) on a C2 FRN can lead to denial of the entire request. Always cross-reference the ESL.</span>
                  </div>
                </li>
              </ul>
            </section>

            <section className="mb-12">
              <h2 id="maximizing" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Tips for Maximizing Your C2 Budget</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Smart planning can help you stretch your Category 2 budget significantly. Here are expert strategies used by top <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">E-Rate consultants</Link>:
              </p>
              <div className="space-y-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    Create a Multi-Year Technology Plan
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Map out your infrastructure needs across all five years of the budget cycle. Prioritize buildings with the oldest equipment in Year 1 and work through the rest systematically. This prevents last-minute rushes and ensures competitive bidding timelines are met.
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    Leverage the $25,000 Floor
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Small schools with fewer than 150 students automatically receive the $25,000 minimum budget — which is more per student than larger schools. If you have small schools in your district, prioritize their C2 requests to take full advantage of this floor.
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <Laptop className="w-5 h-5 text-green-600" />
                    Consider MIBS Instead of Equipment Purchases
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Managed Internal Broadband Services allow you to lease networking equipment and pay for cloud management annually, spreading costs across the cycle instead of front-loading a large equipment purchase. This can be especially useful for districts with limited up-front capital.
                  </p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <Server className="w-5 h-5 text-green-600" />
                    Bundle BMIC with Equipment Requests
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    Basic Maintenance of Internal Connections covers support contracts and hardware warranties for eligible equipment. Adding BMIC to your FRN protects your investment and counts against the same C2 budget — it&apos;s money well spent to extend equipment life.
                  </p>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                Need help tracking your C2 budget across multiple schools? SkyRate AI provides real-time budget utilization tracking through its <Link href="/features/frn-monitoring" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">FRN monitoring dashboard</Link>, so you always know exactly how much budget remains for each entity in your portfolio.
              </p>
            </section>

            <section id="faq" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Frequently Asked Questions: Category 2 E-Rate Funding</h2>
              <div className="space-y-5">
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">What is the FY2026 Category 2 budget per student?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">For FY2026, the Category 2 budget is <strong>$167 per student</strong> (pre-discount) per school building over the FY2026–FY2030 five-year cycle, with a minimum floor of $25,000 per building. For public library buildings, the budget is <strong>$132,300 per building</strong> over the same cycle.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Can unused Category 2 budget carry forward to the next year?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes — within a budget cycle, unused budget carries forward to future years in that same cycle. However, budget does <strong>not</strong> carry over from one cycle to the next. Unused FY2021–2025 budget does not roll into the FY2026–2030 cycle.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Are firewalls eligible under Category 2?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Firewalls and security appliances have specific eligibility rules in E-Rate. These items are treated separately from standard Category 2 network equipment and may require meeting specific USAC criteria. Always check the current USAC Eligible Services List (ESL) for the funding year before including them in your funding request.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">What happens if my project exceeds my Category 2 budget?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">USAC will only fund equipment costs up to the Category 2 budget cap. Costs above the cap are your entity&apos;s responsibility. Consider spreading equipment purchases across multiple funding years or prioritizing buildings with the highest need to stay within your annual budget plan.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Does my Category 2 budget reset with the new FY2026 cycle?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes. FY2026 starts the new FY2026–2030 Category 2 cycle. Every eligible entity receives a full, fresh allocation regardless of how much was spent in the FY2021–2025 cycle. This is a major planning opportunity for schools that did not fully utilize their prior cycle budgets.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Do I need to file Form 470 to access Category 2 funding?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes. All E-Rate funding requires a competitive bidding process. You must file <Link href="/blog/erate-form-470-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Form 470</Link>, allow the 28-day bidding window, select a vendor, sign a contract, and then file Form 471. Your Category 2 budget determines the maximum USAC will fund; actual amounts depend on equipment requested and your discount rate.</p>
                </div>
              </div>
            </section>

            <section id="faq" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Frequently Asked Questions: Category 2 E-Rate Funding</h2>
              <div className="space-y-5">
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">What is the FY2026 Category 2 budget per student?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">For FY2026, the Category 2 budget is <strong>$167 per student</strong> (pre-discount) per school building over the FY2026&ndash;FY2030 five-year cycle, with a minimum floor of $25,000 per building. For public library buildings, the budget is <strong>$132,300 per building</strong> over the same cycle.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Can unused Category 2 budget carry forward to the next year?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes &mdash; within a budget cycle, unused budget carries forward to future years in that same cycle. However, budget does <strong>not</strong> carry over from one cycle to the next. Unused FY2021&ndash;2025 budget does not roll into the FY2026&ndash;2030 cycle.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Are firewalls eligible under Category 2?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Firewalls and security appliances have specific eligibility rules in E-Rate and are treated separately from standard Category 2 network equipment. Always check the current USAC Eligible Services List (ESL) for the funding year before including them in your funding request.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">What happens if my project exceeds my Category 2 budget?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">USAC will only fund equipment costs up to the Category 2 budget cap. Costs above the cap are your entity&apos;s responsibility. Consider spreading equipment purchases across multiple funding years or prioritizing buildings with the highest need to stay within your annual plan.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Does my Category 2 budget reset with the new FY2026 cycle?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes. FY2026 starts the new FY2026&ndash;2030 Category 2 cycle. Every eligible entity receives a full, fresh allocation regardless of how much was spent in the FY2021&ndash;2025 cycle &mdash; a major opportunity for schools that did not fully utilize their prior cycle budget.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Do I need to file Form 470 to access Category 2 funding?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Yes. All E-Rate funding requires a competitive bidding process. You must file <Link href="/blog/erate-form-470-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Form 470</Link>, allow the 28-day bidding window, select a vendor, sign a contract, and then file Form 471. Your Category 2 budget determines the maximum USAC will fund; actual amounts depend on the equipment requested and your discount rate.</p>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Looking Ahead: FY2026–2030 Cycle</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                The FY2026–2030 budget cycle represents a fresh start for every school and library in the country. With budgets fully reset, now is the ideal time to assess your networking infrastructure and develop a comprehensive upgrade plan. Schools that plan early can take advantage of better pricing through competitive bidding and ensure installation is completed before the start of the school year.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                Whether you&apos;re an <Link href="/features/applicants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">applicant managing your own funding</Link> or a <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">consultant overseeing multiple districts</Link>, understanding Category 2 budgets inside and out is essential to maximizing your E-Rate funding. The difference between strategic C2 planning and ad-hoc requests can mean tens or hundreds of thousands of dollars in equipment your schools receive — or miss out on.
              </p>
              <p className="text-slate-700 leading-relaxed">
                SkyRate AI is built to help you track, plan, and execute your Category 2 strategy with confidence. From <Link href="/features/frn-monitoring" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">FRN status monitoring</Link> to <Link href="/features/denial-analysis" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">denial analysis</Link>, our AI-powered platform gives you the tools to ensure every dollar of your C2 budget is put to work.
              </p>
            </section>

            {/* Need Help? */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 my-10">
              <p className="text-slate-900 font-semibold mb-2">Not sure where to start? We&apos;re here to help.</p>
              <p className="text-slate-600 text-sm mb-3">
                E-Rate can be complex, and every situation is different. If you&apos;re unsure about your next step or want expert guidance, our team is ready to assist. Reach out to us at <SafeEmail className="text-purple-600 underline font-medium" /> or let our AI platform analyze your case automatically.
              </p>
              <Link href="/contact" className="text-purple-600 font-medium text-sm hover:underline">Contact our team →</Link>
            </div>
          </div>
        </div>
      </article>

      {/* Related Articles */}
      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-10">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              href="/blog/how-to-appeal-erate-denial"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                How to Appeal an E-Rate Denial: Step-by-Step Guide
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Learn the complete appeals process — from understanding denial codes to submitting a winning appeal letter.
              </p>
              <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Read article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              href="/blog/erate-form-470-guide"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <DollarSign className="w-5 h-5 text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                E-Rate Form 470 Guide: Everything You Need to Know
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Complete guide to understanding Form 470, searching filings, and finding E-Rate business opportunities.
              </p>
              <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Read article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              href="/blog/top-erate-denial-reasons"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                Top 10 E-Rate Denial Reasons 2026
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                USAC denied 30%+ of FY2026 applications. Learn the most common mistakes and how to fix or appeal each one.
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
            Maximize Your Category 2 Budget with AI
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            SkyRate AI tracks your C2 budget utilization across every school in your portfolio — so you never leave funding on the table. Start your free trial today.
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
    </>
  );
}
