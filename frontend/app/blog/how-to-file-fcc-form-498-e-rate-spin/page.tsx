import { Metadata } from "next";
import Link from "next/link";
import { BlogPostJsonLd } from "@/components/seo/BlogPostJsonLd";
import { ArrowRight, ArrowLeft, Clock, BookOpen, CheckCircle, FileText, Building2, Search, BadgeCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "How to File FCC Form 498 & Get Your E-Rate SPIN (2026 Step-by-Step)",
  description:
    "A plain-English guide to FCC Form 498 — what it is, how to file it, and how to get your E-Rate SPIN so your company can become a registered service provider and win district contracts.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog/how-to-file-fcc-form-498-e-rate-spin" },
  openGraph: {
    title: "How to File FCC Form 498 & Get Your E-Rate SPIN (2026 Step-by-Step)",
    description:
      "A plain-English guide to FCC Form 498 — what it is, how to file it, and how to get your E-Rate SPIN so your company can become a registered service provider and win district contracts.",
    url: "https://skyrate.ai/blog/how-to-file-fcc-form-498-e-rate-spin",
    siteName: "SkyRate AI",
    type: "article",
    publishedTime: "2026-07-01T00:00:00Z",
    modifiedTime: "2026-07-01T00:00:00Z",
  },
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How long does it take to get a SPIN?",
    a: "Plan on ~2 weeks once your UEI/DUNS/FCC RN are ready — your Company Officer has 14 days to certify, then USAC reviews.",
  },
  {
    q: "How much does it cost to register?",
    a: "USAC doesn't charge a fee to file the Form 498; our done-for-you service is $2,500 (software is separate).",
  },
  {
    q: "Do I need one SPIN per state?",
    a: "One 498 ID/SPIN lets you participate. You may want more than one if your business units are split by state or service type.",
  },
  {
    q: "Can you file it for me?",
    a: "Yes — that's exactly what we do.",
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

export default function HowToFileForm498Page() {
  return (
    <>
      <BlogPostJsonLd
        title="How to File FCC Form 498 & Get Your E-Rate SPIN (2026 Step-by-Step)"
        description="A plain-English guide to FCC Form 498 — what it is, how to file it, and how to get your E-Rate SPIN so your company can become a registered service provider and win district contracts."
        slug="how-to-file-fcc-form-498-e-rate-spin"
        datePublished="2026-07-01T00:00:00Z"
        dateModified="2026-07-01T00:00:00Z"
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
              <Link href="/become-a-vendor" className="text-slate-300 hover:text-white text-sm transition-colors">
                Become a Vendor
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
                href="/become-a-vendor"
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Get your SPIN
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
              <span className="text-slate-900">How to File FCC Form 498</span>
            </div>

            {/* Article Header */}
            <header className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">Guide</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 10 min read
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6">
                How to File FCC Form 498 and Get Your E-Rate SPIN (2026 Guide)
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-6">
                If your company sells internet, Wi-Fi, cabling, phones, or IT services to schools, the
                E-Rate program can reimburse those districts 20–90% of the cost — but only when they
                buy from a <em>registered</em> service provider. To become one, you need a{" "}
                <strong>SPIN</strong> (Service Provider Identification Number), and to get a SPIN you
                file <strong>FCC Form 498</strong>. This guide walks through exactly what that means
                and how to do it.
              </p>
              <div className="flex items-center gap-3 text-sm text-slate-500 border-t border-slate-100 pt-6">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <span className="text-slate-900 font-medium">SkyRate AI Team</span>
                  <span className="mx-2">·</span>
                  <time dateTime="2026-07-01">July 1, 2026</time>
                </div>
              </div>
            </header>

            {/* Article Body */}
            <div className="prose prose-slate prose-lg max-w-none">
              {/* Intro CTA box */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-10 not-prose">
                <p className="text-purple-900 text-sm leading-relaxed">
                  <strong>Don&apos;t want to deal with USAC yourself?</strong> We file it for you —{" "}
                  <Link href="/become-a-vendor" className="text-purple-600 underline font-medium">
                    Become an E-Rate Vendor →
                  </Link>
                </p>
              </div>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What is a SPIN number?</h2>
                <p className="text-slate-700 leading-relaxed mb-6">
                  Your SPIN (a.k.a. your &quot;498 ID&quot;) is a unique number USAC assigns to your
                  company as an E-Rate service provider. Schools reference it on their funding
                  paperwork, and USAC uses it to pay you. One company, one SPIN. (Note: &quot;SPIN
                  number&quot; also gets used for unrelated things like superannuation — in E-Rate it
                  always means this.)
                </p>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">What is FCC Form 498?</h2>
                <p className="text-slate-700 leading-relaxed mb-6">
                  FCC Form 498 is the form that tells USAC who you are and where to send the money —
                  your legal entity info, contacts, and banking/remittance details. Filing it is what
                  generates your SPIN.
                </p>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Who needs to file it?</h2>
                <p className="text-slate-700 leading-relaxed mb-6">
                  Any company that wants to be paid through E-Rate for eligible products/services to
                  schools and libraries: ISPs, MSPs, network/hardware resellers, AV integrators,
                  cabling and Wi-Fi installers, VoIP providers, and more. If you already sell to
                  schools but aren&apos;t E-Rate registered, this is for you.
                </p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 not-prose">
                  <p className="text-slate-900 font-semibold text-sm mb-1">Already selling to schools?</p>
                  <p className="text-slate-600 text-sm mb-3">
                    We can register your company and get your SPIN issued — done for you.
                  </p>
                  <Link href="/become-a-vendor" className="text-purple-600 font-medium text-sm hover:underline">
                    Become an E-Rate Vendor →
                  </Link>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Before you start (what you&apos;ll need)</h2>
                <ul className="space-y-3 mb-6">
                  {[
                    <span key="uei"><strong>A UEI (Unique Entity Identifier)</strong> — register free on SAM.gov</span>,
                    <span key="duns"><strong>A DUNS Number</strong> — free from Dun &amp; Bradstreet (still required on the Form 498)</span>,
                    <span key="fccrn"><strong>An FCC Registration Number (FCC RN)</strong> — get one at the FCC&apos;s CORES website</span>,
                    <span key="bank"><strong>Your banking + tax info</strong> (routing number, bank account number, EIN/Tax ID) plus a bank verification document to upload</span>,
                    <span key="officer"><strong>A Company Officer</strong> authorized to certify the form</span>,
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1.5" />
                      <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Step-by-step — how to file FCC Form 498 (per USAC)</h2>
                <ol className="space-y-5 mb-6">
                  {[
                    { t: "Register for a UEI on SAM.gov." },
                    { t: "Get a DUNS Number from Dun & Bradstreet." },
                    { t: "Get an FCC Registration Number at the FCC's CORES website." },
                    { t: 'Log in to USAC\u2019s E-File system (forms.universalservice.org/portal) → "Create an Account" → "Service Provider – 498 ID" → "Register Your Company."' },
                    { t: "Complete the FCC Form 498 and add your banking + tax info (upload the verification document)." },
                    { t: "Your Company Officer certifies the form — USAC emails them and they have 14 days to certify." },
                    { t: "USAC reviews and, on approval, assigns your 498 ID / SPIN and emails E-File login credentials." },
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white text-sm font-bold">{i + 1}</span>
                      </div>
                      <p className="text-slate-700 text-sm leading-relaxed pt-1">{step.t}</p>
                    </li>
                  ))}
                </ol>
                <p className="text-slate-700 leading-relaxed mb-6">
                  <em>
                    (Timeline: plan on roughly two weeks once your UEI/DUNS/FCC RN are in place — the
                    officer has 14 days to certify, then USAC reviews.)
                  </em>
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 not-prose">
                  <p className="text-amber-900 text-sm leading-relaxed">
                    <strong>Note:</strong> You can submit bids before your 498 is done, but USAC
                    can&apos;t commit funding to you until the FCC Form 498 is complete.
                  </p>
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">After you get your SPIN — what&apos;s next</h2>
                <ul className="space-y-3 mb-6">
                  {[
                    <span key="spac">File your <strong>SPAC</strong> (Service Provider Annual Certification / Form 473) each year to stay active.</span>,
                    <span key="470">Watch for <strong>Form 470s</strong> — schools post these when they&apos;re shopping; you respond with a bid (there&apos;s a 28-day minimum bidding window). See our <Link href="/blog/erate-form-470-guide" className="text-purple-600 hover:text-purple-800 font-medium underline decoration-purple-300">Form 470 guide</Link>.</span>,
                    <span key="pay">Win the contract, deliver, then get paid via <strong>SPI (Form 474)</strong> or the school&apos;s <strong>BEAR (Form 472)</strong>.</span>,
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1.5" />
                      <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Common mistakes that delay your SPIN</h2>
                <ul className="space-y-3 mb-6">
                  {[
                    "Wrong/mismatched legal entity name vs. your FCC registration",
                    "Incomplete banking info",
                    "The wrong person certifying",
                    "Missing the annual SPAC (your SPIN goes inactive)",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2.5" />
                      <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">How SkyRate helps</h2>
                <p className="text-slate-700 leading-relaxed mb-6">
                  We&apos;re E-Rate consultants — we file Form 498 and register vendors every day. We
                  can get your SPIN for you ($2,500, done-for-you), and our software then helps you
                  find bids, respond to Form 470s, track your funding, and invoice USAC — all in one
                  place.
                </p>
                <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl p-6 not-prose text-center">
                  <p className="text-white font-semibold text-lg mb-3">Become an E-Rate Vendor — get your SPIN</p>
                  <Link
                    href="/become-a-vendor"
                    className="inline-flex items-center gap-2 bg-white text-purple-700 px-6 py-3 rounded-lg font-semibold shadow-sm hover:shadow-md transition"
                  >
                    Check if you&apos;re eligible <ArrowRight className="w-4 h-4" aria-hidden />
                  </Link>
                </div>
              </section>

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
            </div>
          </div>
        </article>

        {/* Related Articles */}
        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">Related Articles</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Link
                href="/become-a-vendor"
                className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <BadgeCheck className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                  Become an E-Rate Vendor (Done-For-You)
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  We file your FCC Form 498, get your SPIN, and set you up to win district contracts.
                </p>
                <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                  Get started <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
              <Link
                href="/blog/erate-form-470-guide"
                className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                  <Search className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                  E-Rate Form 470 Guide 2026
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  How schools post bids and how vendors find and respond to Form 470 opportunities.
                </p>
                <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                  Read article <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
              <Link
                href="/features/vendors"
                className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="w-5 h-5 text-violet-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors mb-2">
                  SkyRate for E-Rate Vendors
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Find Form 470 leads, monitor your FRNs, and stay compliant — all in one platform.
                </p>
                <span className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                  Explore <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-slate-950 py-16 sm:py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <FileText className="w-10 h-10 text-purple-400 mx-auto mb-4" aria-hidden />
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to get your E-Rate SPIN?
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-8">
              We handle the FCC Form 498 filing end-to-end. Check your eligibility in 60 seconds.
            </p>
            <Link
              href="/become-a-vendor"
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-semibold shadow-lg transition"
            >
              Become an E-Rate Vendor <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
