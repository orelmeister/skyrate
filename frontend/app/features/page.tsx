import Link from "next/link";
import type { Metadata } from "next";
import {
  Users,
  Building2,
  GraduationCap,
  Activity,
  FileSearch,
  FileText,
  XCircle,
  ArrowRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "SkyRate AI Features — E-Rate Intelligence Platform",
  description:
    "Explore every feature of the SkyRate AI platform: FRN monitoring, Form 470 tracking, AI appeal generation, denial analysis, and dedicated portals for consultants, vendors, and applicants.",
  keywords: [
    "e-rate software features",
    "frn tracking",
    "form 470 lead tracking",
    "e-rate appeal generator",
    "e-rate consultant portal",
    "e-rate vendor portal",
    "e-rate denial analysis",
  ],
  alternates: { canonical: "https://skyrate.ai/features" },
  openGraph: {
    title: "SkyRate AI Features — E-Rate Intelligence Platform",
    description:
      "FRN monitoring, Form 470 tracking, AI appeals, denial analysis — everything you need to win E-Rate funding.",
    url: "https://skyrate.ai/features",
    type: "website",
    siteName: "SkyRate AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkyRate AI Features",
    description:
      "Full feature set of the SkyRate E-Rate intelligence platform for consultants, vendors, and applicants.",
  },
  robots: "index, follow",
};

const FEATURES = [
  {
    href: "/features/consultants",
    icon: Users,
    iconColor: "text-purple-400",
    iconBg: "bg-purple-500/15",
    badge: "Consultant Portal",
    title: "Consultant Portal",
    description:
      "Manage unlimited client portfolios, track every BEN and FRN, generate AI-powered appeal letters, and deliver white-label reports — all from one dashboard.",
  },
  {
    href: "/features/vendors",
    icon: Building2,
    iconColor: "text-indigo-400",
    iconBg: "bg-indigo-500/15",
    badge: "Vendor Portal",
    title: "Vendor Portal",
    description:
      "Discover active Form 470 leads the moment they post, monitor competitor SPINs, and qualify prospects by category, state, and funding year before your sales team calls.",
  },
  {
    href: "/features/applicants",
    icon: GraduationCap,
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/15",
    badge: "Applicant Portal",
    title: "Applicant Portal",
    description:
      "Schools and libraries get real-time FRN status, budget tracking, deadline alerts, and step-by-step application guidance without needing a dedicated E-Rate consultant.",
  },
  {
    href: "/features/frn-monitoring",
    icon: Activity,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/15",
    badge: "Real-Time Monitoring",
    title: "FRN Status Monitoring",
    description:
      "Get instant alerts the moment USAC commits, denies, or modifies any of your Funding Request Numbers. Never miss a status change across hundreds of FRNs.",
  },
  {
    href: "/features/form-470-tracking",
    icon: FileSearch,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/15",
    badge: "Lead Intelligence",
    title: "Form 470 Tracking",
    description:
      "Monitor new Form 470 postings filtered by state, category, technology type, and entity size. Get lead alerts before your competition even sees the posting.",
  },
  {
    href: "/features/appeal-generator",
    icon: FileText,
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/15",
    badge: "AI-Powered",
    title: "AI Appeal Generator",
    description:
      "Generate FCC Order 19-117 compliant appeal letters in minutes. The AI cites the exact denial reason, applicable rule paragraphs, and supporting evidence from your application.",
  },
  {
    href: "/features/denial-analysis",
    icon: XCircle,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/15",
    badge: "Root Cause Analysis",
    title: "Denial Analysis",
    description:
      "Understand why each FRN was denied with plain-language explanations, appeal deadlines, and a recommended action plan — no decoding cryptic FCDL comments manually.",
  },
];

export default function FeaturesIndexPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://skyrate.ai" },
      { "@type": "ListItem", position: 2, name: "Features", item: "https://skyrate.ai/features" },
    ],
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Nav */}
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
            <Link href="/features" className="text-white text-sm font-medium">
              Features
            </Link>
            <Link href="/pricing" className="text-slate-300 hover:text-white text-sm transition-colors">
              Pricing
            </Link>
            <Link href="/tools/frn-tracker" className="text-slate-300 hover:text-white text-sm transition-colors">
              Free FRN Tracker
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
              Start Free Trial
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/25 via-slate-950 to-indigo-900/25" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-800/15 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <span className="inline-block text-purple-400 text-sm font-semibold tracking-widest uppercase mb-4">
            Platform Features
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Win E-Rate Funding
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto mb-10">
            SkyRate AI gives consultants, vendors, and applicants the intelligence, automation, and
            compliance tools they need to maximize every dollar of federal E-Rate funding.
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
              href="/demo"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Built for Every Role in E-Rate
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Whether you file 5 applications or 500, SkyRate has dedicated tools for your role.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all duration-200"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className={`flex-shrink-0 p-3 rounded-xl ${feature.iconBg}`}>
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <span className={`inline-block text-xs font-semibold uppercase tracking-wider mt-1 ${feature.iconColor}`}>
                    {feature.badge}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  {feature.description}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-purple-400 group-hover:gap-2 transition-all">
                  Learn More
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Stats Strip */}
      <section className="border-t border-b border-white/10 bg-white/3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { value: "$4.8B+", label: "E-Rate funding tracked" },
              { value: "15,000+", label: "Entities monitored" },
              { value: "50", label: "States covered" },
              { value: "Real-time", label: "USAC data sync" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-slate-400 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Ready to Maximize Your E-Rate Funding?
        </h2>
        <p className="text-slate-400 text-lg mb-10">
          Join consultants, vendors, and school districts who use SkyRate AI to stay ahead of USAC
          deadlines, win appeals, and never miss a funding opportunity.
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
            href="/demo"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold hover:bg-white/15 transition"
          >
            Book a Demo
          </Link>
        </div>
        <p className="text-slate-500 text-sm mt-4">No credit card required. Free plan available.</p>
      </section>
    </main>
  );
}
