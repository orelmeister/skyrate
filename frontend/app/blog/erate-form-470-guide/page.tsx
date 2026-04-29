import { Metadata } from "next";
import Link from "next/link";
import { SafeEmail } from "@/components/SafeEmail";
import { BlogPostJsonLd } from "@/components/seo/BlogPostJsonLd";
import { ArrowRight, ArrowLeft, FileText, Search, Clock, CheckCircle, Sparkles, BookOpen, Users, ShoppingCart, Target, BarChart3, Filter } from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Form 470 Guide 2026 — File & Win Bids | SkyRate",
  description: "Learn exactly how to file E-Rate Form 470 in FY2026. Covers the 28-day bid window, vendor pitfalls, and the free SkyRate checklist used by 500+ districts.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog/erate-form-470-guide" },
  openGraph: {
    title: "E-Rate Form 470 Guide 2026 — File & Win Bids | SkyRate",
    description: "Learn exactly how to file E-Rate Form 470 in FY2026. Covers the 28-day bid window, vendor pitfalls, and the free SkyRate checklist used by 500+ districts.",
    url: "https://skyrate.ai/blog/erate-form-470-guide",
    siteName: "SkyRate AI",
    type: "article",
    publishedTime: "2026-02-16T00:00:00Z",
    modifiedTime: "2026-05-01T00:00:00Z",
  },
};

export default function ErateForm470GuidePage() {
  return (
    <>
    <BlogPostJsonLd
      title="E-Rate Form 470 Guide 2026 — File & Win Bids | SkyRate"
      description="Learn exactly how to file E-Rate Form 470 in FY2026. Covers the 28-day bid window, vendor pitfalls, and the free SkyRate checklist used by 500+ districts."
      slug="erate-form-470-guide"
      datePublished="2026-02-16T00:00:00Z"
      dateModified="2026-05-01T00:00:00Z"
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
            <span className="text-slate-900">E-Rate Form 470 Guide</span>
          </div>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">Guide</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 12 min read
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
              E-Rate Form 470 Guide 2026: Step-by-Step Filing Instructions
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Form 470 is the gateway to E-Rate funding. This complete guide covers who must file, the FY2026 filing timeline, step-by-step EPC instructions, the 28-day competitive bidding window, common USAC rejection reasons, and how Form 470 connects to Form 471. Updated April 2026.
            </p>
            <div className="flex items-center gap-3 text-sm text-slate-500 border-t border-slate-100 pt-6">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-indigo-600" />
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
            <nav aria-label="Article contents" className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-10">
              <p className="text-sm font-bold text-slate-900 mb-3">In This Guide</p>
              <ol className="space-y-1.5 text-sm text-slate-700 list-decimal list-inside">
                <li><a href="#what-is-form-470" className="text-indigo-600 hover:underline">What Is E-Rate Form 470?</a></li>
                <li><a href="#who-must-file" className="text-indigo-600 hover:underline">Who Must File Form 470?</a></li>
                <li><a href="#fy2026-timeline" className="text-indigo-600 hover:underline">FY2026 Filing Timeline</a></li>
                <li><a href="#how-to-file" className="text-indigo-600 hover:underline">Step-by-Step: How to File Form 470 in EPC</a></li>
                <li><a href="#vendor-search" className="text-indigo-600 hover:underline">How to Search Form 470 Filings (Vendors)</a></li>
                <li><a href="#bidding-strategies" className="text-indigo-600 hover:underline">Response Deadlines and Bidding Strategies</a></li>
                <li><a href="#mistakes" className="text-indigo-600 hover:underline">Common Form 470 Mistakes</a></li>
                <li><a href="#form-470-vs-471" className="text-indigo-600 hover:underline">Form 470 vs Form 471</a></li>
                <li><a href="#faq" className="text-indigo-600 hover:underline">Frequently Asked Questions</a></li>
              </ol>
            </nav>

            <section id="what-is-form-470" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What Is E-Rate Form 470?</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                E-Rate Form 470, officially known as the &quot;Description of Services Requested and Certification Form,&quot; is the document that kicks off the competitive bidding process in the E-Rate program. Filed by schools and libraries (applicants), it publicly announces the telecommunications and internet access services that an institution needs and invites service providers to submit competitive bids.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                Think of Form 470 as a public request for proposals (RFP). When a school district needs to purchase internet service, network equipment, or other E-Rate eligible services, they must first post a Form 470 on USAC&apos;s website to notify potential vendors of the opportunity. This ensures transparency and competition — two core principles of the E-Rate program.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                The form is filed through USAC&apos;s E-Rate Productivity Center (EPC) and becomes publicly available for vendors to search and review. Once posted, there is a mandatory 28-day waiting period during which vendors can review the request and submit their proposals. This waiting period ensures that all interested providers have a fair chance to respond.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="who-must-file" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Who Must File Form 470?</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Form 470 is filed by E-Rate eligible entities — primarily K-12 schools, school districts, and public libraries. These applicants file the form whenever they need to procure eligible services, which broadly fall into two categories:
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    Category 1
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    <strong>Data Transmission Services and Internet Access</strong> — This includes internet service (fiber, cable, DSL), wide area networking (WAN), and data transport between buildings. Category 1 services receive the highest discount rates (20–90% depending on poverty level).
                  </p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
                  <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-600" />
                    Category 2
                  </h3>
                  <p className="text-slate-700 text-sm leading-relaxed">
                    <strong>Internal Connections and Managed Broadband</strong> — This includes network switches, routers, wireless access points, cabling, and managed internal broadband services. Category 2 has a per-student budget cap over a five-year cycle.
                  </p>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                Applicants file a new Form 470 whenever their current service contracts expire, when they need new services, or when they want to explore better pricing for existing services. Many districts file annually for Category 1 services and periodically for Category 2 based on their budget cycle. E-Rate <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">consultants</Link> often manage the Form 470 filing process on behalf of multiple school districts and libraries.
              </p>
            </section>

            <section id="fy2026-timeline" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">FY2026 E-Rate Form 470 Filing Timeline</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                For Funding Year 2026, Form 470 must be filed and the 28-day competitive bidding window must close before the Form 471 application deadline of <strong>May 29, 2026</strong>. This means applicants must file Form 470 <strong>no later than May 1, 2026</strong>. Earlier filing — ideally in October or November 2025 — allows more time to receive and evaluate bids.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-600" />
                  FY2026 Key Dates
                </h3>
                <ul className="space-y-3 text-slate-700 text-sm">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>October 1, 2025:</strong> FY2026 application window opens. You may begin filing Form 470 immediately.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Day of Form 470 posting:</strong> The 28-day competitive bidding window starts automatically upon submission to EPC.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span><strong>Day 29 or later:</strong> Earliest you may select a vendor and sign a service contract. Do not commit to a vendor before this date.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span><strong>May 1, 2026 (latest recommended Form 470 date):</strong> Filing after this date risks not completing the 28-day window before the Form 471 deadline.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <span><strong>May 29, 2026:</strong> Form 471 filing deadline for FY2026. All funding requests must be submitted by this date.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                    <span><strong>Summer–Fall 2026:</strong> USAC PIA review period. FRN commitment decisions are issued. Track status with <Link href="/features/frn-monitoring" className="text-indigo-600 font-medium underline">SkyRate FRN monitoring</Link>.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section id="how-to-file" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Step-by-Step: How to File Form 470 in EPC</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Form 470 is filed through USAC&apos;s E-Rate Productivity Center (EPC) at <strong>usac.org</strong>. Filings require an authorized EPC account holder — typically a district IT director, business manager, or authorized E-Rate consultant. Follow these ten steps:
              </p>
              <ol className="space-y-5 mb-6">
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">1</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Log in to EPC and verify your entity profile</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Before filing, confirm your entity&apos;s profile is current — especially student enrollment counts, NSLP data, and building addresses. Outdated information affects your discount rate and <Link href="/blog/erate-category-2-budget-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Category 2 budget calculations</Link>.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Navigate to Form 470 and select Funding Year 2026</p>
                    <p className="text-slate-700 text-sm leading-relaxed">From the EPC dashboard, select &quot;FCC Form 470&quot; and choose Funding Year 2026. Select the entity or entities being covered. Districts with multiple schools may file a single Form 470 covering all buildings or file per building.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">3</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Select eligible service types</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Choose Category 1 (Data Transmission and Internet Access) and/or Category 2 (Internal Connections, MIBS, or Basic Maintenance). Both categories can appear on one Form 470. Select service types that match your needs: &quot;Internet Access Service,&quot; &quot;Managed Internal Broadband Services,&quot; or &quot;Network Equipment.&quot;</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">4</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Describe your minimum service requirements (technology-neutral)</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Describe what you need functionally, not which vendor to use. Example: &quot;Internet access providing minimum 1 Gbps symmetrical bandwidth for 400 students across 3 buildings.&quot; Avoid specifying brand names or proprietary requirements that would limit fair competition unless genuinely necessary and documented.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">5</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Attach an RFP or technical specifications (highly recommended)</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Well-written RFPs attract better bids and serve as audit evidence. Attach evaluation criteria and a statement of work. This helps vendors understand your needs and helps USAC reviewers trace your competitive bidding process.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">6</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Review the certifications carefully before signing</p>
                    <p className="text-slate-700 text-sm leading-relaxed">By certifying Form 470 you attest that your entity is eligible, you will evaluate all bids received, price will be the primary selection factor, and no vendor agreements were made before the 28-day window closes. Knowingly false certifications can result in debarment from the E-Rate program.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">7</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Submit and record your Form 470 application number</p>
                    <p className="text-slate-700 text-sm leading-relaxed">After submission, USAC assigns a unique Form 470 number. Save this — you&apos;ll need it when filing Form 471. The form becomes publicly available within minutes and the 28-day clock starts immediately.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">8</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Wait the full 28 calendar days for vendor bids</p>
                    <p className="text-slate-700 text-sm leading-relaxed">The 28-day competitive bidding window is a federal requirement with no exceptions. You cannot select a vendor or sign a contract before Day 29. You may communicate with interested vendors but cannot commit to any provider during this window.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">9</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Evaluate all bids — price must be the primary factor</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Evaluate every bid received. Per FCC Order 19-117, <strong>price must be the primary factor</strong> — weighted more heavily than all other criteria combined. Document your evaluation in writing. USAC may request records during a Program Integrity Assurance (PIA) review.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-sm font-bold">10</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">Sign your vendor contract and file Form 471 by May 29, 2026</p>
                    <p className="text-slate-700 text-sm leading-relaxed">Once you&apos;ve selected a vendor and executed a contract, file Form 471 — the actual funding request. Reference your Form 470 number, the vendor&apos;s SPIN, services, and contract details. Review your <Link href="/blog/erate-category-2-budget-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Category 2 budget</Link> before submitting to confirm amounts are within your allocation.</p>
                  </div>
                </li>
              </ol>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                <p className="text-amber-900 text-sm leading-relaxed">
                  <strong>After filing Form 471:</strong> Use SkyRate AI&apos;s <Link href="/features/frn-monitoring" className="text-amber-700 font-medium underline">FRN monitoring tool</Link> to track each Funding Request Number (FRN) status in real time — from USAC PIA review through commitment and disbursement.
                </p>
              </div>
            </section>

            <section id="vendor-search" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How to Search and Filter Form 470 Filings</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                For vendors, the ability to efficiently search and filter Form 470 filings is the difference between finding opportunities early and missing them entirely. USAC makes all Form 470 filings publicly available through their EPC system, but the native search tools can be limited and cumbersome.
              </p>
              <p className="text-slate-700 leading-relaxed mb-6">
                Here&apos;s what to look for when reviewing Form 470 filings:
              </p>
              <ul className="space-y-4 mb-6">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Service type and category:</span>
                    <span className="text-slate-700"> Filter by Category 1 (internet/WAN) or Category 2 (internal connections) to focus on services your company provides.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Target className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Geographic location:</span>
                    <span className="text-slate-700"> Filter by state, county, or city to find opportunities in your service territory. Many vendors only serve specific regions.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Entity size and discount rate:</span>
                    <span className="text-slate-700"> Larger districts with higher discount rates represent bigger revenue opportunities. The discount rate indicates the percentage that E-Rate subsidizes.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Filing date and deadline:</span>
                    <span className="text-slate-700"> The 28-day competitive bidding window starts from the date the Form 470 is posted. Prioritize recent filings where the window is still open.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">RFP attachments:</span>
                    <span className="text-slate-700"> Many applicants attach detailed RFP documents to their Form 470 that provide specifications, evaluation criteria, and submission instructions.</span>
                  </div>
                </li>
              </ul>
              <p className="text-slate-700 leading-relaxed mb-6">
                SkyRate AI&apos;s <Link href="/features/form-470-tracking" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Form 470 Tracking</Link> tool automates this entire process. It continuously monitors new Form 470 filings, filters them by your preferred criteria (service type, geography, manufacturer mentions, entity size), and delivers qualified leads directly to your dashboard — so you never miss a relevant opportunity.
              </p>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What Vendors Should Look for in Form 470 Postings</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Not all Form 470 filings are created equal. Experienced E-Rate vendors know how to quickly evaluate which opportunities are worth pursuing. Here are the key signals to look for:
              </p>
              <ul className="list-disc pl-6 space-y-3 text-slate-700 mb-6">
                <li><strong>Specific product or manufacturer mentions:</strong> If a Form 470 or its attached RFP mentions specific brands or products (e.g., Cisco Meraki, Aruba, Ruckus), that&apos;s a strong signal of what the applicant is looking for. If you sell or resell those products, it&apos;s a high-value lead.</li>
                <li><strong>Existing vendor SPIN:</strong> Check whether the applicant is already working with a specific E-Rate Service Provider (identified by their SPIN number). If they have an existing vendor, winning the business may require a stronger value proposition.</li>
                <li><strong>Contract duration:</strong> Multi-year contract opportunities represent recurring revenue. A three-year or five-year deal is significantly more valuable than a single-year engagement.</li>
                <li><strong>Entity details:</strong> Research the applicant. How many buildings do they have? What is their student count? What discount rate do they qualify for? Larger entities with higher discount rates mean larger funded amounts.</li>
                <li><strong>Timing patterns:</strong> Some districts file their Form 470s at the same time every year. Tracking these patterns helps you prepare proposals in advance and build relationships before the formal bidding window opens.</li>
              </ul>
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
              <h2 id="bidding-strategies" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Response Deadlines and Bidding Strategies</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                The E-Rate competitive bidding process has strict timeline requirements that both applicants and vendors must follow:
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-600" />
                  Key Timeline
                </h3>
                <ul className="space-y-3 text-slate-700 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Day 0:</strong> Applicant files Form 470 on USAC&apos;s EPC system.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Days 1–28:</strong> Mandatory competitive bidding window. Vendors review filings and submit bids.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>After Day 28:</strong> Applicant evaluates bids using price as the primary factor (per FCC rules).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Vendor selection:</strong> Applicant selects a vendor and negotiates the final contract.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Form 471 filing:</strong> Applicant files Form 471 referencing the Form 470, selected vendor, and contract.</span>
                  </li>
                </ul>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                For vendors, the 28-day window is your critical window of opportunity. Here are strategies to maximize your success:
              </p>
              <ol className="list-decimal pl-6 space-y-3 text-slate-700 mb-6">
                <li><strong>Respond early.</strong> While you have 28 days, responding within the first week shows the applicant that you&apos;re attentive and organized. Early responders often get more facetime with the applicant.</li>
                <li><strong>Tailor your proposal.</strong> Don&apos;t send a generic bid. Reference the specific services requested in the Form 470, address any RFP requirements, and show that you understand the applicant&apos;s needs.</li>
                <li><strong>Price competitively.</strong> FCC rules require that applicants weight price as the most important factor in vendor selection. Ensure your pricing is competitive for the specific services requested.</li>
                <li><strong>Highlight your E-Rate experience.</strong> Applicants value vendors who understand E-Rate compliance, invoicing procedures, and SPIN requirements. Emphasize your track record with E-Rate-funded projects.</li>
                <li><strong>Follow up.</strong> After submitting your bid, follow up with the applicant&apos;s contact person. Building a relationship increases your chances of being selected, especially when bids are close in price.</li>
              </ol>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How SkyRate AI Automates Form 470 Lead Discovery</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Manually searching USAC&apos;s database for relevant Form 470 filings is time-consuming and easy to miss opportunities. SkyRate AI was built specifically to solve this problem for E-Rate vendors.
              </p>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  What SkyRate AI Does for Vendors
                </h3>
                <ul className="space-y-3 text-purple-900 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Automated monitoring:</strong> Continuously scans new Form 470 filings as they&apos;re posted to USAC&apos;s system.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Smart filtering:</strong> Matches filings to your product lines, service territory, and preferred entity sizes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Manufacturer detection:</strong> Identifies filings that mention specific manufacturers or products you sell.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Competitor tracking:</strong> Monitor which SPINs are winning business in your territory with <Link href="/features/vendors" className="text-purple-700 font-semibold underline">vendor intelligence tools</Link>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <span><strong>Contact enrichment:</strong> Automatically finds contact information for applicant decision-makers.</span>
                  </li>
                </ul>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                Instead of spending hours each week sifting through USAC filings, SkyRate AI delivers qualified Form 470 leads directly to your <Link href="/features/vendors" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">vendor dashboard</Link>. You see exactly which schools and libraries need the services you provide, in the areas you serve, with the deadline information you need to respond on time.
              </p>
            </section>

            <section className="mb-12">
              <h2 id="mistakes" className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Common Form 470 Mistakes to Avoid</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                Whether you&apos;re an applicant filing a Form 470 or a vendor responding to one, avoiding these common mistakes will save you time, money, and frustration:
              </p>
              <ul className="space-y-4 mb-6">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">For applicants — being too specific or too vague:</span>
                    <span className="text-slate-700"> A Form 470 that specifies a single vendor&apos;s product by name can raise competitive bidding concerns. But a Form 470 that&apos;s so broad it doesn&apos;t convey what you actually need won&apos;t attract quality responses.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">For vendors — missing the 28-day window:</span>
                    <span className="text-slate-700"> If you don&apos;t have a system for tracking new Form 470 posts, you may not discover an opportunity until the bidding window has already closed.</span>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0">
                    <span className="text-red-600 text-xs font-bold">!</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">Selecting the wrong service category:</span>
                    <span className="text-slate-700"> Mislabeling services between Category 1 and Category 2 can lead to application denials down the line when the Form 471 is reviewed.</span>
                  </div>
                </li>
              </ul>
            </section>

            <section id="form-470-vs-471" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Form 470 vs Form 471: What Comes Next</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Form 470 and Form 471 work in sequence — you cannot file Form 471 without a valid Form 470. Here is how they differ:
              </p>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-indigo-600 text-white">
                      <th className="text-left p-3 rounded-tl-lg">Feature</th>
                      <th className="text-left p-3">Form 470</th>
                      <th className="text-left p-3 rounded-tr-lg">Form 471</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td className="p-3 font-semibold text-slate-800">Purpose</td>
                      <td className="p-3 text-slate-700">Announce competitive bidding / post RFP</td>
                      <td className="p-3 text-slate-700">Request E-Rate funding for selected services</td>
                    </tr>
                    <tr className="bg-white border-b border-slate-200">
                      <td className="p-3 font-semibold text-slate-800">When filed</td>
                      <td className="p-3 text-slate-700">Before selecting a vendor</td>
                      <td className="p-3 text-slate-700">After 28-day window closes and vendor is selected</td>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td className="p-3 font-semibold text-slate-800">FY2026 deadline</td>
                      <td className="p-3 text-slate-700">No later than May 1, 2026</td>
                      <td className="p-3 text-slate-700">May 29, 2026</td>
                    </tr>
                    <tr className="bg-white border-b border-slate-200">
                      <td className="p-3 font-semibold text-slate-800">Key contents</td>
                      <td className="p-3 text-slate-700">Service description, RFP, entity info</td>
                      <td className="p-3 text-slate-700">Vendor SPIN, FRN details, contract, funding amounts</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="p-3 font-semibold text-slate-800">Result</td>
                      <td className="p-3 text-slate-700">Public bid solicitation posted on USAC</td>
                      <td className="p-3 text-slate-700">FRN created; USAC issues commitment decision</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-700 leading-relaxed mb-6">
                The most critical rule: you must wait at least 28 calendar days after posting Form 470 before signing any contract or filing Form 471. Filing Form 471 without a valid Form 470, or filing before the 28-day window closes, is one of the most common reasons USAC denies E-Rate funding requests. See our <Link href="/blog/top-erate-denial-reasons" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Top E-Rate Denial Reasons guide</Link> for the full list of filing errors that lead to denials.
              </p>
            </section>

            <section id="faq" className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Frequently Asked Questions About Form 470</h2>
              <div className="space-y-5">
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">When is the deadline to file Form 470 for FY2026?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">There is no specific opening deadline, but Form 470 must be posted at least 28 calendar days before you intend to select a vendor. For FY2026, since Form 471 is due <strong>May 29, 2026</strong>, file Form 470 no later than <strong>May 1, 2026</strong>. Filing in October or November 2025 is strongly recommended for adequate bid evaluation time.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Can I reuse last year&apos;s Form 470 for FY2026?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">No — each funding year requires a new Form 470 for services being renewed or newly procured. Exception: if you have a multi-year contract that was competitively bid in a prior year and is still active, you may be able to file Form 471 without a new Form 470. Consult an E-Rate compliance advisor if uncertain.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">What if I only receive one bid?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Receiving only one bid is acceptable — there is no minimum number of bids required. You must still evaluate the bid with price as the primary factor and document your process. USAC may scrutinize single-bid selections, so thorough written documentation is essential.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Can I name a specific brand or vendor on Form 470?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">Generally, no. USAC requires vendor-neutral descriptions so all qualified providers have a fair opportunity. You may reference technical standards or performance specifications that match a specific product if you can document a legitimate technical reason and you accept equivalent products from other vendors.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">Does filing Form 470 commit me to using E-Rate?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">No. Filing Form 470 only initiates competitive bidding. You are not obligated to file Form 471 or use E-Rate. However, if you do ultimately procure the services described, the competitive bidding process is a prerequisite for receiving E-Rate discounts.</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-6">
                  <h3 className="font-bold text-slate-900 mb-2">How can SkyRate AI help with Form 470?</h3>
                  <p className="text-slate-700 text-sm leading-relaxed">SkyRate AI helps <Link href="/features/applicants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">applicants</Link> plan Category 2 budgets and track FRN status after Form 471 filing. For <Link href="/features/vendors" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">vendors</Link>, it monitors new Form 470 filings in real time and delivers qualified leads. For <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">consultants</Link>, it tracks deadlines and FRN commitments across an entire client portfolio.</p>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Conclusion</h2>
              <p className="text-slate-700 leading-relaxed mb-6">
                Form 470 is the gateway to E-Rate funding. For applicants, it&apos;s the required first step in the competitive bidding process that ensures transparency and fair pricing. For vendors, it&apos;s the primary source of E-Rate sales opportunities — a window into what schools and libraries need and when they need it.
              </p>
              <p className="text-slate-700 leading-relaxed">
                Whether you&apos;re an <Link href="/features/applicants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">applicant</Link> looking to file your Form 470 correctly, a <Link href="/features/consultants" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">consultant</Link> managing filings for multiple clients, or a vendor wanting to find leads faster, understanding the Form 470 process inside and out gives you a competitive edge. And with SkyRate AI&apos;s <Link href="/features/form-470-tracking" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Form 470 Tracking</Link>, the most tedious parts of the process are automated — letting you focus on what matters most: winning business and delivering connectivity to schools.
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
          <h2 className="text-2xl font-bold text-slate-900 mb-8">Related Articles</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/blog/how-to-appeal-erate-denial"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                How to Appeal an E-Rate Denial: Step-by-Step Guide
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Complete guide to appealing E-Rate denials with templates, strategies, and FCC precedent citations.
              </p>
              <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                Read article <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              href="/blog/top-erate-denial-reasons"
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                <ShoppingCart className="w-5 h-5 text-violet-600" />
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
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                E-Rate Category 2 Budget 2026: $167/Student Calculator
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Calculate your district&apos;s exact Wi-Fi budget — $167 per student, $132,300 per library, with the full 5-year cycle guide.
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
            Never Miss a Form 470 Opportunity Again
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            SkyRate AI monitors every Form 470 filing and delivers qualified leads to your dashboard. Filter by service type, geography, and manufacturer — so you can focus on winning business.
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
