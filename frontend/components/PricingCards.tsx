"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Star, Zap, Shield, Users, BarChart3, Search, Bell, FileText, TrendingUp, Briefcase, Target } from "lucide-react";

const plans = [
  {
    name: "Consultant",
    description: "For E-Rate consultants managing school portfolios",
    monthlyPrice: 300,
    yearlyPrice: 3000,
    icon: Briefcase,
    color: "indigo",
    href: "/sign-up?plan=consultant",
    learnMore: "/features/consultants",
    learnMoreText: "Learn more about consultant features",
    features: [
      "AI-Powered Appeal Generation",
      "Portfolio Management (Multi-BEN)",
      "FRN Status Monitoring",
      "Denial Analysis & Insights",
      "Real-Time USAC Data",
      "Email & Push Alerts",
      "Priority Support",
    ],
  },
  {
    name: "Vendor",
    description: "For service providers finding E-Rate opportunities",
    monthlyPrice: 199,
    yearlyPrice: 1999,
    icon: Target,
    color: "purple",
    popular: true,
    href: "/sign-up?plan=vendor",
    learnMore: "/features/vendors",
    learnMoreText: "Learn more about vendor features",
    features: [
      "Form 470 Lead Discovery",
      "SPIN Status Tracking",
      "Competitor Intelligence",
      "Market Analysis Tools",
      "C2 Budget Research",
      "Contact Enrichment",
      "Email & Push Alerts",
    ],
  },
  {
    name: "Applicant",
    description: "For schools & libraries managing E-Rate applications",
    monthlyPrice: 200,
    yearlyPrice: 2000,
    icon: FileText,
    color: "violet",
    href: "/sign-up?plan=applicant",
    learnMore: "/features/applicants",
    learnMoreText: "Learn more about applicant features",
    features: [
      "Application Tracking",
      "FRN Status Monitoring",
      "Denial Analysis",
      "Budget Tracking",
      "Deadline Alerts",
      "Email Notifications",
    ],
  },
];

export default function PricingCards() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div>
      {/* ── Toggle ── */}
      <div className="flex items-center justify-center gap-4 mb-10 sm:mb-14">
        <span className={`text-sm font-medium transition ${!isYearly ? "text-slate-900" : "text-slate-400"}`}>
          Monthly
        </span>
        <button
          onClick={() => setIsYearly(!isYearly)}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            isYearly ? "bg-purple-600" : "bg-slate-300"
          }`}
          aria-label="Toggle yearly pricing"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300 ${
              isYearly ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
        <span className={`text-sm font-medium transition ${isYearly ? "text-slate-900" : "text-slate-400"}`}>
          Yearly
        </span>
        {isYearly && (
          <span className="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            Save up to 17%
          </span>
        )}
      </div>

      {/* ── Cards ── */}
      <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
          const period = isYearly ? "/yr" : "/mo";

          return (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 ${
                plan.popular
                  ? "bg-white border-2 border-purple-500 shadow-xl shadow-purple-500/10 scale-[1.02] md:scale-105"
                  : "bg-white border border-slate-200 shadow-lg hover:shadow-xl"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${
                  plan.popular
                    ? "bg-purple-100 text-purple-600"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold text-slate-900">
                    ${price.toLocaleString()}
                  </span>
                  <span className="text-slate-500 font-medium">{period}</span>
                </div>
                {isYearly && (
                  <p className="text-sm text-green-600 font-medium mt-1">
                    Save ${(plan.monthlyPrice * 12 - plan.yearlyPrice).toLocaleString()}/year
                  </p>
                )}
              </div>

              <Link
                href={plan.href}
                className={`block w-full text-center py-3 px-6 rounded-xl font-semibold transition-all duration-200 mb-6 ${
                  plan.popular
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-purple-500/25"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                Start Free Trial
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      plan.popular ? "text-purple-600" : "text-green-600"
                    }`} />
                    <span className="text-sm text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-5 border-t border-slate-100">
                <Link
                  href={plan.learnMore}
                  className="text-sm font-medium text-purple-600 hover:text-purple-700 transition inline-flex items-center gap-1"
                >
                  {plan.learnMoreText}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
