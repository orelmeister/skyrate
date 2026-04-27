import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Activity, FileSearch, Users } from "lucide-react";
import { STATES, getStateBySlug } from "@/lib/states-data";

type Props = {
  params: { state: string };
};

export async function generateStaticParams() {
  return STATES.map((s) => ({ state: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stateData = getStateBySlug(params.state);
  if (!stateData) return { title: "Not Found" };

  return {
    title: `E-Rate Funding for ${stateData.name} Schools and Libraries | SkyRate AI`,
    description: `Track E-Rate funding for ${stateData.name} schools and libraries. ${stateData.entityCount.toLocaleString()} eligible entities, ${stateData.fundingHighlight} in annual opportunities. Free BEN tracking and FRN monitoring.`,
    keywords: [
      `e-rate funding ${stateData.name.toLowerCase()}`,
      `${stateData.name.toLowerCase()} schools e-rate`,
      `${stateData.name.toLowerCase()} libraries e-rate`,
      `${stateData.code.toLowerCase()} e-rate consultant`,
      `e-rate ${stateData.code.toLowerCase()} frn tracking`,
    ],
    alternates: { canonical: `https://skyrate.ai/states/${stateData.slug}` },
    openGraph: {
      title: `E-Rate Funding for ${stateData.name} Schools and Libraries`,
      description: `${stateData.entityCount.toLocaleString()} eligible entities in ${stateData.name}. Track FRNs, monitor Form 470s, and maximize E-Rate funding with SkyRate AI.`,
      url: `https://skyrate.ai/states/${stateData.slug}`,
      type: "website",
      siteName: "SkyRate AI",
    },
    twitter: {
      card: "summary_large_image",
      title: `E-Rate Funding for ${stateData.name} | SkyRate AI`,
      description: `Track ${stateData.entityCount.toLocaleString()} E-Rate entities in ${stateData.name}. Free FRN and BEN tracking.`,
    },
    robots: "index, follow",
  };
}

export default function StatePage({ params }: Props) {
  const stateData = getStateBySlug(params.state);
  if (!stateData) notFound();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://skyrate.ai" },
      { "@type": "ListItem", position: 2, name: "States", item: "https://skyrate.ai/states" },
      { "@type": "ListItem", position: 3, name: stateData.name, item: `https://skyrate.ai/states/${stateData.slug}` },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How much E-Rate funding do ${stateData.name} schools receive?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${stateData.name} schools and libraries receive an estimated ${stateData.fundingHighlight} per year through the federal E-Rate program. The exact amount varies by funding year and the applications submitted by the ${stateData.entityCount.toLocaleString()} eligible entities in the state.`,
        },
      },
      {
        "@type": "Question",
        name: `How do ${stateData.name} schools apply for E-Rate?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `${stateData.name} schools and libraries apply for E-Rate through USAC's EPC (E-Rate Productivity Center) portal. The process begins with posting a Form 470 (competitive bidding), followed by submitting a Form 471 (funding application). SkyRate AI helps ${stateData.name} applicants track deadlines, monitor FRN status, and generate appeal letters if denied.`,
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="text-white font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-slate-300 hover:text-white text-sm transition-colors">Features</Link>
            <Link href="/pricing" className="text-slate-300 hover:text-white text-sm transition-colors">Pricing</Link>
            <Link href="/tools/frn-tracker" className="text-slate-300 hover:text-white text-sm transition-colors">Free FRN Tracker</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-slate-300 hover:text-white text-sm transition-colors hidden sm:block">Sign In</Link>
            <Link href="/sign-up" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Start Free Trial
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/25 via-slate-950 to-indigo-900/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <span className="inline-block text-purple-400 text-sm font-semibold tracking-widest uppercase mb-4">
            {stateData.name} · E-Rate Program
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            E-Rate Funding for{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              {stateData.name}
            </span>{" "}
            Schools and Libraries
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10">
            Track every FRN, monitor Form 470 postings, and maximize federal E-Rate funding for all{" "}
            {stateData.entityCount.toLocaleString()} eligible entities in {stateData.name}.
            Real-time USAC data. No login required to start.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-500/30"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/tools/ben-tracker"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition"
            >
              Track Your BEN Free
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-white mb-1">{stateData.fundingHighlight}</p>
              <p className="text-slate-400 text-sm">Annual E-Rate funding</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white mb-1">{stateData.entityCount.toLocaleString()}</p>
              <p className="text-slate-400 text-sm">Eligible entities</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white mb-1">{stateData.schoolCount.toLocaleString()}</p>
              <p className="text-slate-400 text-sm">Schools</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white mb-1">{stateData.libraryCount.toLocaleString()}</p>
              <p className="text-slate-400 text-sm">Libraries</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How E-Rate Works in {stateData.name}
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            The E-Rate program subsidizes broadband and telecom for schools and libraries at{" "}
            discounts of 20–90% based on poverty level and rurality.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-purple-500/15 rounded-xl">
                <FileSearch className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-white font-semibold">Step 1: Post Form 470</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              {stateData.name} schools and libraries post a Form 470 to open a 28-day competitive
              bidding window, inviting service providers to submit proposals for broadband and telecom
              services.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-500/15 rounded-xl">
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold">Step 2: Submit Form 471</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              After selecting a vendor, the entity submits a Form 471 during the USAC application
              window (typically January–March). Each funding request line item receives a unique FRN
              for tracking.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-500/15 rounded-xl">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-white font-semibold">Step 3: Receive Funding</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              USAC reviews the application through PIA (Program Integrity Assurance). Committed FRNs
              receive an FCDL (Funding Commitment Decision Letter), and service providers invoice USAC
              directly or the applicant files BEAR forms.
            </p>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section className="bg-white/3 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              SkyRate AI for {stateData.name} E-Rate Participants
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Whether you are a consultant managing {stateData.name} districts, a vendor targeting{" "}
              Form 470 leads, or a school tracking your own FRNs — SkyRate has the right tool.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                href: "/features/consultants",
                title: "For E-Rate Consultants",
                desc: `Manage all your ${stateData.name} client portfolios, get instant FRN status alerts, and generate compliant appeal letters without manual USAC checks.`,
                color: "text-purple-400",
                bg: "bg-purple-500/15",
              },
              {
                href: "/features/vendors",
                title: "For Vendors",
                desc: `Monitor every new Form 470 posted by ${stateData.name} schools and libraries. Get lead alerts with entity size, category, and contact info the same day they post.`,
                color: "text-indigo-400",
                bg: "bg-indigo-500/15",
              },
              {
                href: "/features/applicants",
                title: "For Schools & Libraries",
                desc: `${stateData.name} schools and libraries can track their own BENs and FRNs for free. No consultant needed to stay informed about your E-Rate application status.`,
                color: "text-emerald-400",
                bg: "bg-emerald-500/15",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all"
              >
                <h3 className={`text-lg font-bold mb-3 ${item.color} group-hover:underline`}>
                  {item.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">{item.desc}</p>
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${item.color}`}>
                  Learn more <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">
          E-Rate FAQ for {stateData.name}
        </h2>
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2">
              How much E-Rate funding do {stateData.name} schools receive?
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              {stateData.name} schools and libraries receive an estimated {stateData.fundingHighlight}{" "}
              per year through the federal E-Rate program. The exact amount varies by funding year and
              the applications submitted by the {stateData.entityCount.toLocaleString()} eligible
              entities in the state.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2">
              How do {stateData.name} schools apply for E-Rate?
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              {stateData.name} schools and libraries apply through USAC&apos;s EPC portal by posting a
              Form 470 (competitive bidding), then submitting a Form 471 (funding application) during
              the annual filing window. SkyRate AI helps track deadlines, monitor FRN status, and
              generate appeal letters if denied.
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-2">
              What discount rates do {stateData.name} schools qualify for?
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              E-Rate discount rates in {stateData.name} range from 20% to 90%, calculated based on the
              percentage of students eligible for the National School Lunch Program (NSLP) and whether
              the entity is in an urban or rural area. Most Title I schools in {stateData.name} qualify
              for discounts above 70%.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Start Tracking {stateData.name} E-Rate Funding Today
        </h2>
        <p className="text-slate-400 text-lg mb-10">
          Join {stateData.name} consultants, vendors, and school districts who use SkyRate AI to stay
          ahead of USAC deadlines and maximize every dollar of E-Rate funding.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-500 hover:to-indigo-500 transition shadow-lg shadow-purple-500/30"
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/tools/ben-tracker"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition"
          >
            Track Your BEN Free
          </Link>
        </div>
        <p className="text-slate-500 text-sm mt-4">No credit card required. Free plan available.</p>
      </section>
    </main>
  );
}
