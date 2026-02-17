import { Metadata } from "next";
import Link from "next/link";
import { SafeEmail } from "@/components/SafeEmail";
import {
  ArrowRight,
  Mail,
  Phone,
  Clock,
  MessageSquare,
  HelpCircle,
  FileText,
  Shield,
  Users,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | SkyRate AI Support",
  description:
    "Get help with SkyRate AI. Contact our support team for questions about E-Rate intelligence, account setup, or technical assistance.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://skyrate.ai/contact" },
  openGraph: {
    title: "Contact Us | SkyRate AI Support",
    description: "Get help with SkyRate AI E-Rate intelligence platform.",
    url: "https://skyrate.ai/contact",
    siteName: "SkyRate AI",
    type: "website",
  },
};

const faqs = [
  {
    question: "How do I get started with SkyRate AI?",
    answer:
      "Sign up for a free 14-day trial — no credit card required. Choose your role (Consultant, Vendor, or Applicant) during registration and you'll be guided through the setup process.",
    link: "/sign-up",
    linkText: "Start your free trial",
  },
  {
    question: "Which plan is right for me?",
    answer:
      "It depends on your role in the E-Rate ecosystem. Consultants managing multiple school portfolios, vendors tracking Form 470 leads, and school applicants each have a dedicated plan.",
    link: "/pricing",
    linkText: "Compare plans",
  },
  {
    question: "How does the AI appeal generator work?",
    answer:
      "Our multi-model AI analyzes your denial letter, identifies the specific denial reason, researches precedents, and generates a customized appeal letter with supporting arguments — all in minutes.",
    link: "/features/appeal-generator",
    linkText: "Learn about appeals",
  },
  {
    question: "Can I track Form 470 opportunities as a vendor?",
    answer:
      "Yes! Our vendor dashboard lets you search and filter Form 470 filings by manufacturer, category, state, and more. You can save leads, track SPIN status, and run competitor analysis.",
    link: "/features/vendors",
    linkText: "Explore vendor features",
  },
  {
    question: "Is my school data secure?",
    answer:
      "Absolutely. We use SSL encryption for all data in transit, role-based access controls, and FERPA-aware data handling. Your data is never shared with third parties.",
    link: "/privacy",
    linkText: "Read our privacy policy",
  },
  {
    question: "Do you offer support for consultants managing multiple schools?",
    answer:
      "Yes — the Consultant plan is designed for multi-school portfolio management. You can track FRN status, generate appeals, and monitor denials across all your client schools from one dashboard.",
    link: "/features/consultants",
    linkText: "See consultant features",
  },
];

export default function ContactPage() {
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
            Contact & Support
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Get Help with Your{" "}
            <span className="bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              E-Rate Intelligence
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Have a question about SkyRate AI? Our team is here to help you get the most
            out of the platform.
          </p>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="bg-white py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {/* Email */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Mail className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Email Us</h3>
              <p className="text-slate-600 mb-4">
                For general inquiries, account help, or technical support.
              </p>
              <SafeEmail
                className="text-purple-600 font-semibold hover:text-purple-700 transition-colors"
              />
            </div>

            {/* Phone */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Phone className="w-7 h-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Call Us</h3>
              <p className="text-slate-600 mb-4">
                Speak with a member of our support team directly.
              </p>
              <a
                href="tel:+18005551234"
                className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors"
              >
                (800) 555-1234
              </a>
            </div>

            {/* Business Hours */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-violet-100 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Clock className="w-7 h-7 text-violet-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Business Hours</h3>
              <p className="text-slate-600 mb-4">
                Our team is available during standard business hours.
              </p>
              <p className="text-violet-600 font-semibold">
                Mon–Fri, 9 AM – 6 PM ET
              </p>
            </div>
          </div>

          {/* In-App Support Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-20">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
              <MessageSquare className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Live Chat Support
              </h3>
              <p className="text-slate-600">
                Already a SkyRate AI user? Use the in-app chat widget for the fastest response.
                Our support team typically responds within minutes during business hours.
              </p>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
                Frequently Asked{" "}
                <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                  Questions
                </span>
              </h2>
              <p className="text-lg text-slate-600">
                Quick answers to common questions about SkyRate AI.
              </p>
            </div>
            <div className="space-y-6">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <HelpCircle className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {faq.question}
                      </h3>
                      <p className="text-slate-600 leading-relaxed mb-3">
                        {faq.answer}
                      </p>
                      <Link
                        href={faq.link}
                        className="inline-flex items-center gap-1 text-purple-600 font-medium text-sm hover:text-purple-700 transition-colors"
                      >
                        {faq.linkText}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="w-10 h-10 text-purple-200 mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Join hundreds of E-Rate professionals who use SkyRate AI to save time, win more
            funding, and stay ahead of the competition.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-white text-purple-700 hover:bg-purple-50 font-semibold px-8 py-3.5 rounded-xl transition-colors text-lg"
            >
              Start Free Trial
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
