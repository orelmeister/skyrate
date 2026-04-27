"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Star, Briefcase, Target, FileText, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type Audience = "consultant" | "vendor" | "applicant";
type Billing = "monthly" | "yearly";

const AUDIENCES: { id: Audience; label: string; icon: typeof Briefcase; tagline: string }[] = [
  { id: "consultant", label: "Consultants", icon: Briefcase, tagline: "Manage school portfolios at scale" },
  { id: "vendor", label: "Vendors", icon: Target, tagline: "Find Form 470 opportunities daily" },
  { id: "applicant", label: "Applicants", icon: FileText, tagline: "Schools & libraries managing E-Rate" },
];

// Pro tier prices: yearly is exactly 20% off annualized monthly.
// 499 * 12 * 0.80 = 4790.40 → 4790
// 199 * 12 * 0.80 = 1910.40 → 1910
const PRO_PRICE: Record<Audience, { monthly: number; yearly: number }> = {
  consultant: { monthly: 499, yearly: 4790 },
  vendor: { monthly: 499, yearly: 4790 },
  applicant: { monthly: 199, yearly: 1910 },
};

const PRO_FEATURES: Record<Audience, string[]> = {
  consultant: [
    "Unlimited BEN portfolio (multi-school management)",
    "AI Appeal Generator with FCC Order 19-117 citations",
    "Real-time FRN status monitoring & email + push alerts",
    "Denial analysis with auto-drafted appeal letters",
    "Live USAC data sync (no manual PDF downloads)",
    "Form 470 lead discovery & competitor SPIN tracking",
    "C2 budget tracker per BEN",
    "Priority email support",
  ],
  vendor: [
    "Unlimited Form 470 lead discovery & filters",
    "Daily lead digest with new opportunities",
    "SPIN status & competitor win-rate intelligence",
    "Service-category & geography market analysis",
    "Contact enrichment for E-Rate decision-makers",
    "C2 budget research per applicant",
    "CSV export & API access (rate-limited)",
    "Priority email support",
  ],
  applicant: [
    "Multi-BEN application tracking",
    "AI denial analysis with plain-English explanations",
    "Real-time FRN status monitoring",
    "Deadline alerts (470, 471, PIA, appeal windows)",
    "C2 budget tracker with remaining-headroom view",
    "Funding history & disbursement reports",
    "Email + push notifications",
    "Priority email support",
  ],
};

const FREE_FEATURES: Record<Audience, string[]> = {
  consultant: [
    "14-day full-access trial (no credit card)",
    "Up to 3 BENs",
    "FRN status lookups",
    "Sample AI appeal generation",
    "Email-only support",
  ],
  vendor: [
    "14-day full-access trial (no credit card)",
    "10 Form 470 lookups per day",
    "Basic SPIN status checks",
    "Email-only support",
  ],
  applicant: [
    "14-day full-access trial (no credit card)",
    "Up to 1 BEN",
    "FRN status lookups",
    "Deadline calendar (read-only)",
    "Email-only support",
  ],
};

const ENTERPRISE_FEATURES: string[] = [
  "Everything in Pro, plus:",
  "Unlimited seats & role-based access (RBAC)",
  "Single sign-on (SAML / Google / Microsoft)",
  "Dedicated Customer Success Manager",
  "Onboarding & E-Rate workflow training",
  "Custom data exports & API quotas",
  "Quarterly portfolio reviews",
  "Procurement-ready security questionnaire",
  "Priority phone support & SLA",
];

export default function PricingClient() {
  const [audience, setAudience] = useState<Audience>("consultant");
  const [billing, setBilling] = useState<Billing>("yearly");

  useEffect(() => {
    trackEvent("pricing_view", { initial_audience: "consultant", initial_billing: "yearly" });
  }, []);

  const handleAudienceChange = (a: Audience) => {
    setAudience(a);
    trackEvent("pricing_audience_select", { audience: a });
  };

  const handleBillingToggle = (next: Billing) => {
    if (next === billing) return;
    setBilling(next);
    trackEvent("pricing_billing_toggle", { billing: next });
  };

  const handleTierCta = (tier: "free" | "pro" | "enterprise", href: string) => {
    trackEvent("pricing_tier_cta", { tier, audience, billing });
    if (tier === "pro" || tier === "free") {
      trackEvent("pricing_signup_click", { tier, audience, billing });
    }
    if (tier === "enterprise") {
      trackEvent("pricing_demo_click", { source: "enterprise_tier", audience });
    }
    return href;
  };

  const pro = PRO_PRICE[audience];
  const proDisplay = billing === "yearly" ? pro.yearly : pro.monthly;
  const proPeriod = billing === "yearly" ? "/year" : "/month";
  const annualSavings = pro.monthly * 12 - pro.yearly; // dollars saved per year on yearly plan

  return (
    <div>
      {/* ── Audience selector chips ── */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-6">
        <span className="text-sm text-slate-500 mr-1">I'm a:</span>
        {AUDIENCES.map(({ id, label, icon: Icon }) => {
          const active = audience === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleAudienceChange(id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-medium transition ${
                active
                  ? "border-purple-500 bg-purple-600 text-white shadow-sm shadow-purple-500/25"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-slate-500 mb-10">
        {AUDIENCES.find((a) => a.id === audience)?.tagline}
      </p>

      {/* ── Billing toggle (defaults to yearly) ── */}
      <div
        className="flex items-center justify-center gap-3 mb-12"
        role="tablist"
        aria-label="Billing period"
      >
        <button
          type="button"
          role="tab"
          aria-selected={billing === "monthly"}
          onClick={() => handleBillingToggle("monthly")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            billing === "monthly"
              ? "bg-slate-900 text-white shadow"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billing === "yearly"}
          onClick={() => handleBillingToggle("yearly")}
          className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition ${
            billing === "yearly"
              ? "bg-slate-900 text-white shadow"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Yearly
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
            Save 20%
          </span>
        </button>
      </div>

      {/* ── 3-tier grid ── */}
      <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
        {/* FREE */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-lg p-6 sm:p-8 flex flex-col">
          <div className="mb-5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 bg-slate-100 text-slate-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Free Trial</h3>
            <p className="text-sm text-slate-500 mt-1">Try every Pro feature for 14 days</p>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl sm:text-5xl font-bold text-slate-900">$0</span>
              <span className="text-slate-500 font-medium">/14 days</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">No credit card required</p>
          </div>
          <Link
            href={handleTierCta("free", `/sign-up?plan=${audience}&billing=${billing}&source=pricing-free`)}
            onClick={() => trackEvent("pricing_signup_click", { tier: "free", audience, billing })}
            className="block w-full text-center py-3 px-6 rounded-xl font-semibold transition bg-slate-900 text-white hover:bg-slate-800 mb-6"
          >
            Start Free Trial
          </Link>
          <ul className="space-y-3 flex-1">
            {FREE_FEATURES[audience].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600" />
                <span className="text-sm text-slate-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* PRO — Most Popular */}
        <div className="relative rounded-2xl bg-white border-2 border-purple-500 shadow-xl shadow-purple-500/10 scale-[1.02] md:scale-105 p-6 sm:p-8 flex flex-col">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg whitespace-nowrap">
              <Star className="w-3.5 h-3.5 fill-current" />
              Most Popular
            </span>
          </div>
          <div className="mb-5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 bg-purple-100 text-purple-600">
              <Star className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Pro</h3>
            <p className="text-sm text-slate-500 mt-1">Full platform for serious E-Rate work</p>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl sm:text-5xl font-bold text-slate-900">
                ${proDisplay.toLocaleString()}
              </span>
              <span className="text-slate-500 font-medium">{proPeriod}</span>
            </div>
            {billing === "yearly" ? (
              <p className="text-sm text-green-600 font-medium mt-1">
                Save ${annualSavings.toLocaleString()}/year vs monthly
              </p>
            ) : (
              <p className="text-sm text-slate-500 mt-1">
                Switch to yearly and save ${annualSavings.toLocaleString()}
              </p>
            )}
          </div>
          <Link
            href={handleTierCta("pro", `/sign-up?plan=${audience}&billing=${billing}&source=pricing-pro`)}
            onClick={() => trackEvent("pricing_signup_click", { tier: "pro", audience, billing })}
            className="block w-full text-center py-3 px-6 rounded-xl font-semibold transition mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-purple-500/25"
          >
            Start Free Trial
          </Link>
          <ul className="space-y-3 flex-1">
            {PRO_FEATURES[audience].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-purple-600" />
                <span className="text-sm text-slate-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ENTERPRISE */}
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-lg p-6 sm:p-8 flex flex-col">
          <div className="mb-5">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 bg-indigo-100 text-indigo-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Enterprise</h3>
            <p className="text-sm text-slate-500 mt-1">For districts, networks & large consultancies</p>
          </div>
          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl sm:text-5xl font-bold text-slate-900">Custom</span>
            </div>
            <p className="text-sm text-slate-500 mt-1">Volume pricing, multi-seat, dedicated CSM</p>
          </div>
          <Link
            href={handleTierCta("enterprise", "/demo?source=pricing-enterprise")}
            onClick={() => trackEvent("pricing_demo_click", { source: "enterprise_tier", audience })}
            className="block w-full text-center py-3 px-6 rounded-xl font-semibold transition bg-slate-900 text-white hover:bg-slate-800 mb-6"
          >
            Book a Demo
          </Link>
          <ul className="space-y-3 flex-1">
            {ENTERPRISE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-indigo-600" />
                <span className="text-sm text-slate-600">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
