import { Metadata } from "next";
import Link from "next/link";
import { BlogPostJsonLd } from "@/components/seo/BlogPostJsonLd";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Shield,
  ShieldCheck,
  CheckCircle,
  FileText,
  Calendar,
  Lock,
  Activity,
  Server,
  Bell,
  BarChart3,
} from "lucide-react";

export const metadata: Metadata = {
  title: "FCC Cybersecurity Pilot Program: Form 471 Guide | SkyRate",
  description:
    "The FCC's $200M Schools & Libraries Cybersecurity Pilot funds firewalls, endpoint & identity protection. See eligibility, the Form 471 process, and how to track your FRNs.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog/fcc-cybersecurity-pilot-program" },
  openGraph: {
    title: "FCC Cybersecurity Pilot Program: Form 471 Guide | SkyRate",
    description:
      "The FCC's $200M Schools & Libraries Cybersecurity Pilot funds firewalls, endpoint & identity protection. See eligibility, the Form 471 process, and how to track your FRNs.",
    url: "https://skyrate.ai/blog/fcc-cybersecurity-pilot-program",
    siteName: "SkyRate AI",
    type: "article",
    publishedTime: "2026-07-12T00:00:00Z",
    modifiedTime: "2026-07-12T00:00:00Z",
  },
  twitter: {
    card: "summary_large_image",
    title: "FCC Cybersecurity Pilot Program: Form 471 Guide | SkyRate",
    description:
      "The FCC's $200M Schools & Libraries Cybersecurity Pilot funds firewalls, endpoint & identity protection. See eligibility, the Form 471, and how to track your FRNs.",
  },
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is the FCC Schools and Libraries Cybersecurity Pilot Program?",
    a: "It is a three-year pilot that provides up to $200 million in Universal Service Fund support to selected schools, libraries, and consortia to purchase eligible cybersecurity services and equipment. The FCC adopted it in a June 2024 Report and Order to evaluate whether Universal Service funding should support cybersecurity on a permanent basis. It is separate from the E-Rate program.",
  },
  {
    q: "Is the Cybersecurity Pilot the same as E-Rate?",
    a: "No. The Cybersecurity Pilot is a distinct program with its own funding, forms, and Eligible Services List. Applicants file a Cybersecurity Pilot FCC Form 471 that is separate from the regular E-Rate Form 471. However, participants must meet the E-Rate program's eligibility requirements, and the workflow (competitive bidding, a Form 470, FCDLs, and reimbursement) will feel familiar to E-Rate applicants.",
  },
  {
    q: "What services and equipment does the Cybersecurity Pilot fund?",
    a: "Eligible services and equipment fall into four categories: Advanced/Next-Generation Firewalls; Endpoint Protection; Identity Protection and Authentication; and Monitoring, Detection, and Response. Reimbursement is subject to an overall per-participant budget cap. Always confirm specific items against the FCC's Cybersecurity Pilot Eligible Services List before you file.",
  },
  {
    q: "How does the Cybersecurity Pilot FCC Form 471 work?",
    a: "After being selected and completing competitive bidding with a Pilot FCC Form 470 (with a minimum 28-day waiting period), participants sign contracts and then file the Pilot FCC Form 471 to request the chosen services and equipment. USAC reviews the application and issues a Funding Commitment Decision Letter (FCDL) that approves or denies each Funding Request Number (FRN).",
  },
  {
    q: "Where can I see Cybersecurity Pilot funding data?",
    a: "USAC publishes Cybersecurity Pilot FCC Form 471 data through its Open Data platform. The dataset is updated nightly and includes application statuses, participant details, FRNs, funding request and line-item details, service delivery deadlines, and invoice deadlines. SkyRate reads this data so you can monitor your Pilot FRNs and status changes in real time.",
  },
  {
    q: "How can SkyRate help me track my Cybersecurity Pilot FRNs?",
    a: "SkyRate's FRN monitoring watches USAC data for every FRN you care about and alerts you when a commitment, denial, or status change is posted. For Pilot participants that means you learn about FCDL decisions and deadline changes as soon as they appear in USAC's nightly data, instead of manually re-checking the portal.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const ELIGIBLE = [
  {
    icon: Server,
    name: "Advanced / Next-Generation Firewalls",
    desc: "Firewall hardware, software, and subscription licenses that provide deep packet inspection, intrusion prevention, and application-aware filtering for school and library networks.",
  },
  {
    icon: Shield,
    name: "Endpoint Protection",
    desc: "Anti-malware, EDR (endpoint detection and response), and device-hardening tools that defend student, staff, and patron devices.",
  },
  {
    icon: Lock,
    name: "Identity Protection & Authentication",
    desc: "Multi-factor authentication, single sign-on, and identity governance that stop credential-based attacks — one of the most common entry points into K-12 networks.",
  },
  {
    icon: Activity,
    name: "Monitoring, Detection & Response",
    desc: "Security monitoring, managed detection and response, and incident-response services that catch and contain threats before they spread.",
  },
];

export default function CybersecurityPilotPage() {
  return (
    <>
      <BlogPostJsonLd
        title="FCC Cybersecurity Pilot Program: Form 471 Guide for Schools & Libraries"
        description="A plain-English guide to the FCC's $200M Schools and Libraries Cybersecurity Pilot Program — who's eligible, what it funds, how the Cybersecurity Pilot FCC Form 471 works, key deadlines, and how to track your FRNs in real time."
        slug="fcc-cybersecurity-pilot-program"
        datePublished="2026-07-12T00:00:00Z"
        dateModified="2026-07-12T00:00:00Z"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
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
              <span className="text-slate-900">FCC Cybersecurity Pilot Program</span>
            </div>

            {/* Article Header */}
            <header className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Guide</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 10 min read
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
                FCC Cybersecurity Pilot Program: The Schools &amp; Libraries Form 471 Guide
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                The FCC&apos;s Schools and Libraries Cybersecurity Pilot Program puts up to $200 million behind the cybersecurity that K-12 districts and libraries have needed for years. Here&apos;s what the pilot is, who&apos;s eligible, what it funds, how the Cybersecurity Pilot FCC Form 471 works, and how to track every Funding Request in real time.
              </p>
              <div className="flex items-center gap-3 text-sm text-slate-500 border-t border-slate-100 pt-6">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <span className="text-slate-900 font-medium">SkyRate AI Team</span>
                  <span className="mx-2">·</span>
                  <time dateTime="2026-07-12">July 12, 2026</time>
                </div>
              </div>
            </header>

            {/* Article Body */}
            <div className="prose prose-slate prose-lg max-w-none">
              {/* Section 1 */}
              <section id="what-it-is" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What is the Cybersecurity Pilot Program?</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  The <strong>Schools and Libraries Cybersecurity Pilot Program</strong> is a three-year pilot that provides up to <strong>$200 million</strong> in Universal Service Fund support to selected schools, libraries, and consortia so they can buy eligible cybersecurity services and equipment. The FCC adopted the program in a June 2024 Report and Order (FCC 24-63) and modeled it on the earlier Connected Care Pilot.
                </p>
                <p className="text-slate-700 leading-relaxed mb-4">
                  The goal is to test whether Universal Service funding should support cybersecurity for school and library networks on a permanent basis. Crucially, the pilot is <strong>separate from E-Rate</strong>. It has its own budget, its own Eligible Services List, and its own <strong>Cybersecurity Pilot FCC Form 471</strong> — distinct from the E-Rate Form 471 that applicants file every funding year.
                </p>
                <div className="not-prose bg-purple-50 border border-purple-200 rounded-xl p-5 my-6">
                  <p className="text-purple-900 text-sm leading-relaxed">
                    <strong>In short:</strong> the E-Rate cybersecurity pilot is a limited, competitive, $200M experiment — not an open, recurring entitlement. If you were selected, treat your funding like the finite, deadline-driven resource it is.
                  </p>
                </div>
              </section>

              {/* Section 2 */}
              <section id="who-is-eligible" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Who is eligible for the schools and libraries cybersecurity pilot?</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  Only schools, libraries, and consortia of schools and libraries that meet the <strong>E-Rate program&apos;s eligibility requirements</strong> could apply to participate. Notably, an applicant did <em>not</em> have to be a current or former E-Rate applicant to be eligible for the pilot.
                </p>
                <p className="text-slate-700 leading-relaxed mb-4">
                  Prospective participants had to submit <strong>FCC Form 484 Part 1</strong> during an application window that closed on November 1, 2024. The FCC announced the selected participants in a Public Notice released January 16, 2025 — more than 700 schools, libraries, and consortia were chosen to share in the $200 million over the three-year term. Selection prioritized applicants with the highest discount rate and National School Lunch Program (NSLP) percentages, with additional weight given to entity type, size, and geographic diversity.
                </p>
                <ul className="space-y-2 text-slate-700">
                  <li className="flex gap-2"><CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span>Public and non-profit private K-12 schools that meet E-Rate eligibility rules.</span></li>
                  <li className="flex gap-2"><CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span>Public and non-profit libraries and library systems.</span></li>
                  <li className="flex gap-2"><CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span>Consortia — regional or statewide groups that jointly applied.</span></li>
                </ul>
              </section>

              {/* Section 3 */}
              <section id="what-it-funds" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What the cybersecurity pilot funds: eligible services</h2>
                <p className="text-slate-700 leading-relaxed mb-6">
                  Participants can seek reimbursement for a wide range of cybersecurity services and equipment, subject to an overall per-participant budget cap. Eligible items fall into four categories:
                </p>
                <div className="not-prose grid sm:grid-cols-2 gap-4 mb-4">
                  {ELIGIBLE.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.name} className="border border-slate-200 rounded-xl p-5">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                          <Icon className="w-5 h-5 text-purple-600" />
                        </div>
                        <h3 className="font-bold text-slate-900 mb-1.5">{item.name}</h3>
                        <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-slate-700 leading-relaxed">
                  Because the pilot has a finite budget and a fixed Eligible Services List, always confirm a specific product against the FCC&apos;s current Cybersecurity Pilot Eligible Services List before you request it on a funding request.
                </p>
              </section>

              {/* Section 4 */}
              <section id="how-form-471-works" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How the Cybersecurity Pilot FCC Form 471 works</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  If you were selected, the path to funding follows an E-Rate-style sequence — but on the pilot&apos;s own forms:
                </p>
                <ol className="space-y-3 text-slate-700 mb-4">
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">1</span><span><strong>Submit FCC Form 484 Part 2</strong> with detailed cybersecurity information after selection.</span></li>
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">2</span><span><strong>Competitively bid</strong> using the <strong>Pilot FCC Form 470</strong>, then wait a minimum of 28 days before evaluating bids with price as the primary factor.</span></li>
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">3</span><span><strong>Sign contracts</strong> with your selected service provider(s).</span></li>
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">4</span><span><strong>File the Cybersecurity Pilot FCC Form 471</strong> requesting the chosen services and equipment during the application window.</span></li>
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">5</span><span><strong>Receive an FCDL.</strong> USAC reviews the application and issues a Funding Commitment Decision Letter approving or denying each Funding Request Number (FRN).</span></li>
                  <li className="flex gap-3"><span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white text-sm font-bold rounded-full flex items-center justify-center">6</span><span><strong>Get reimbursed.</strong> Once services start, participants pay their non-discounted share and then submit reimbursement requests to USAC.</span></li>
                </ol>
                <p className="text-slate-700 leading-relaxed">
                  Every one of those funding requests carries an FRN — and every FRN has a status that can change as USAC processes it. That is exactly where visibility matters most.
                </p>
              </section>

              {/* Section 5 */}
              <section id="deadlines" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Key cybersecurity pilot deadlines</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  The pilot is deadline-driven. The high-level milestones the FCC and USAC have published include:
                </p>
                <div className="not-prose border border-slate-200 rounded-xl overflow-hidden mb-4">
                  <div className="flex items-start gap-3 p-4 border-b border-slate-100">
                    <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div><span className="font-semibold text-slate-900">Sept 17 – Nov 1, 2024</span><p className="text-slate-600 text-sm">FCC Form 484 Part 1 application window (now closed).</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border-b border-slate-100">
                    <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div><span className="font-semibold text-slate-900">Jan 16, 2025</span><p className="text-slate-600 text-sm">FCC announces selected participants (Public Notice DA-25-53A1).</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border-b border-slate-100">
                    <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div><span className="font-semibold text-slate-900">Mar 18 – Sept 15, 2025</span><p className="text-slate-600 text-sm">Cybersecurity Pilot FCC Form 471 application filing window; FCC Form 484 Part 2 also due Sept 15, 2025.</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <Calendar className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div><span className="font-semibold text-slate-900">Per-FRN service delivery &amp; invoice deadlines</span><p className="text-slate-600 text-sm">Set on each funding commitment; published in USAC&apos;s nightly Open Data.</p></div>
                  </div>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  Because service-delivery and invoice deadlines are assigned per FRN, the safest way to stay compliant is to monitor the underlying USAC data rather than rely on memory or a spreadsheet.
                </p>
              </section>

              {/* Section 6 */}
              <section id="how-skyrate-helps" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How SkyRate tracks your Cybersecurity Pilot FRNs</h2>
                <p className="text-slate-700 leading-relaxed mb-4">
                  USAC publishes Cybersecurity Pilot FCC Form 471 data through its Open Data platform, updated <strong>nightly</strong>. That dataset includes application statuses, participant details, FRNs, funding request and line-item details, service delivery deadlines, and invoice deadlines. SkyRate reads that same authoritative data so you don&apos;t have to log into a portal and hunt for changes.
                </p>
                <p className="text-slate-700 leading-relaxed mb-4">
                  With <Link href="/features/frn-monitoring" className="text-purple-600 underline decoration-purple-300 font-medium">SkyRate FRN monitoring</Link>, you get:
                </p>
                <ul className="space-y-2 text-slate-700 mb-4">
                  <li className="flex gap-2"><Bell className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span><strong>Real-time status alerts</strong> the moment a commitment, denial, or status change posts to USAC data.</span></li>
                  <li className="flex gap-2"><BarChart3 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span><strong>Deadline visibility</strong> for service delivery and invoicing so nothing lapses silently.</span></li>
                  <li className="flex gap-2"><FileText className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" /><span><strong>FRN-level detail</strong> — requested vs. committed amounts, line items, and decision dates in one view.</span></li>
                </ul>
                <p className="text-slate-700 leading-relaxed">
                  And if one of your Cybersecurity Pilot funding requests is denied, SkyRate&apos;s <Link href="/features/appeal-generator" className="text-purple-600 underline decoration-purple-300 font-medium">AI appeal generator</Link> helps you build a documented, regulation-grounded response fast.
                </p>
              </section>

              {/* Section 7: CTA */}
              <section id="cta" className="mb-12">
                <div className="not-prose bg-slate-950 rounded-2xl p-8 text-center">
                  <Shield className="w-10 h-10 text-purple-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-3">Track every Cybersecurity Pilot FRN in real time</h2>
                  <p className="text-slate-300 mb-6 max-w-xl mx-auto">
                    Stop refreshing the USAC portal. Let SkyRate watch your Pilot Form 471 FRNs and alert you the moment USAC posts a decision.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                      href="/sign-up"
                      className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                    >
                      Start Free <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                    >
                      See Pricing
                    </Link>
                  </div>
                </div>
              </section>

              {/* FAQ */}
              <section id="faq" className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
                <div className="space-y-5">
                  {FAQS.map((f) => (
                    <div key={f.q} className="border border-slate-200 rounded-xl p-6">
                      <h3 className="font-bold text-slate-900 mb-2">{f.q}</h3>
                      <p className="text-slate-700 text-sm leading-relaxed">{f.a}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Disclaimer */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-10">
                <p className="text-purple-900 text-sm leading-relaxed">
                  <strong>Disclaimer:</strong> This article is for informational purposes only and is not legal or regulatory advice. Cybersecurity Pilot Program rules, dates, and eligible services are set by the FCC and administered by USAC and can change. Always confirm current requirements against the FCC&apos;s Cybersecurity Pilot Program page and USAC before filing.
                </p>
              </div>

              {/* Related Reading */}
              <section className="mb-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Related Reading</h2>
                <ul className="space-y-2">
                  <li>
                    <Link href="/blog/erate-form-470-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">
                      E-Rate Form 470 Guide 2026: Step-by-Step Filing Instructions
                    </Link>
                  </li>
                  <li>
                    <Link href="/blog/how-to-appeal-erate-denial" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">
                      How to Appeal an E-Rate Denial: Step-by-Step Guide
                    </Link>
                  </li>
                  <li>
                    <Link href="/features/frn-monitoring" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">
                      SkyRate FRN Monitoring: Real-Time USAC Status Alerts
                    </Link>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </article>

        {/* Footer */}
        <footer className="bg-slate-950 border-t border-white/10 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img
                  src="/images/logos/logo-icon-transparent.png"
                  alt=""
                  width={24}
                  height={24}
                  className="rounded"
                />
                <span className="text-slate-400 text-sm">
                  &copy; 2026 SkyRate LLC. All rights reserved.
                </span>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-500">
                <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
                <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
