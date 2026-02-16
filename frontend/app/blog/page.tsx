import { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileText,
  AlertTriangle,
  DollarSign,
  Users,
  ShoppingCart,
  BookOpen,
  Bell,
  Sparkles,
  Search,
} from "lucide-react";

export const metadata: Metadata = {
  title: "E-Rate Blog: News, Tips & Guides | SkyRate AI",
  description:
    "Stay informed about E-Rate funding with expert tips, guides, and industry news. Learn how to maximize your school's E-Rate funding with SkyRate AI.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/blog" },
  openGraph: {
    title: "E-Rate Blog: News, Tips & Guides | SkyRate AI",
    description:
      "Expert E-Rate tips, guides, and industry news from SkyRate AI.",
    url: "https://skyrate.ai/blog",
    siteName: "SkyRate AI",
    type: "website",
  },
};

const articles = [
  {
    title: "How to Appeal an E-Rate Denial: Step-by-Step Guide",
    teaser:
      "Learn the exact process for crafting a winning E-Rate appeal, from analyzing your denial letter to submitting supporting documentation. Our AI-powered approach has a 98% success rate.",
    icon: FileText,
    color: "purple",
    link: "/features/appeal-generator",
    category: "Guide",
  },
  {
    title: "Understanding E-Rate Form 470: A Complete Guide",
    teaser:
      "Form 470 is the starting point for E-Rate competitive bidding. We break down every section, common mistakes, and how vendors can find opportunities before anyone else.",
    icon: Search,
    color: "indigo",
    link: "/features/form-470-tracking",
    category: "Guide",
  },
  {
    title: "Top 10 E-Rate Denial Reasons and How to Fix Them",
    teaser:
      "From missing documentation to competitive bidding violations — we analyze the most common E-Rate denial codes and show you how to prevent and resolve each one.",
    icon: AlertTriangle,
    color: "violet",
    link: "/features/denial-analysis",
    category: "Analysis",
  },
  {
    title: "E-Rate Category 2 Budget: Everything You Need to Know",
    teaser:
      "Category 2 budgets fund internal connections, Wi-Fi, and managed broadband services. Understand your school's C2 budget cap, five-year cycles, and how to maximize every dollar.",
    icon: DollarSign,
    color: "purple",
    link: "/features/applicants",
    category: "Guide",
  },
  {
    title: "E-Rate Consultant Software: What to Look For",
    teaser:
      "Managing E-Rate across multiple schools requires the right tools. We compare key features every consultant needs — from portfolio management to AI-powered appeals.",
    icon: Users,
    color: "indigo",
    link: "/features/consultants",
    category: "Industry",
  },
  {
    title: "E-Rate Vendor Strategy: Finding Form 470 Opportunities",
    teaser:
      "Discover how E-Rate vendors use data intelligence to find Form 470 leads, track competitor SPINs, and prioritize the highest-value opportunities in their territory.",
    icon: ShoppingCart,
    color: "violet",
    link: "/features/vendors",
    category: "Strategy",
  },
];

const colorMap: Record<string, { bg: string; text: string; badge: string }> = {
  purple: {
    bg: "bg-purple-100",
    text: "text-purple-600",
    badge: "bg-purple-100 text-purple-700",
  },
  indigo: {
    bg: "bg-indigo-100",
    text: "text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700",
  },
  violet: {
    bg: "bg-violet-100",
    text: "text-violet-600",
    badge: "bg-violet-100 text-violet-700",
  },
};

export default function BlogPage() {
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
            <Link href="/blog" className="text-purple-300 text-sm font-medium">
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
            SkyRate AI Blog
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            E-Rate Intelligence{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Blog
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Expert insights, guides, and news to help you maximize E-Rate funding
          </p>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Latest{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                Articles
              </span>
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              In-depth guides, analysis, and strategies for E-Rate success — curated by
              our team of funding intelligence experts.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((article, i) => {
              const colors = colorMap[article.color];
              const Icon = article.icon;
              return (
                <Link
                  key={i}
                  href={article.link}
                  className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  {/* Card Header */}
                  <div className="bg-slate-50 px-6 pt-6 pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`w-10 h-10 ${colors.bg} rounded-lg flex items-center justify-center`}
                      >
                        <Icon className={`w-5 h-5 ${colors.text}`} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}
                        >
                          {article.category}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                          Coming Soon
                        </span>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors leading-snug">
                      {article.title}
                    </h3>
                  </div>

                  {/* Card Body */}
                  <div className="px-6 py-5 flex-1 flex flex-col">
                    <p className="text-slate-600 text-sm leading-relaxed flex-1">
                      {article.teaser}
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-purple-600 font-medium text-sm group-hover:gap-2 transition-all">
                      Read more <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Newsletter Teaser */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Bell className="w-7 h-7 text-purple-600" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Stay in the{" "}
            <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Loop
            </span>
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto leading-relaxed">
            Subscribe to get notified when new articles are published. E-Rate tips,
            platform updates, and industry news — delivered to your inbox.
          </p>
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <span className="text-slate-900 font-semibold">Newsletter Coming Soon</span>
            </div>
            <p className="text-slate-500 text-sm mb-6">
              We&apos;re preparing our first edition. In the meantime, create your free
              account to stay connected.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors w-full justify-center"
            >
              Create Free Account
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-200 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Maximize Your E-Rate Funding?
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Don&apos;t wait for the blog — start using AI-powered E-Rate intelligence today.
            Free 14-day trial, no credit card required.
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
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
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
              <p className="text-slate-500 text-sm leading-relaxed">
                AI-powered E-Rate intelligence for consultants, vendors, and schools.
              </p>
            </div>

            {/* Solutions */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Solutions</h4>
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
