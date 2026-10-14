/**
 * lib/siteConfig.ts — SINGLE SOURCE OF TRUTH for company facts, metrics and
 * advertised pricing shown anywhere on the marketing site.
 *
 * Rule (external CRO audit, 2026-10-14): never hard-code a phone number,
 * support email, funding metric or price in page copy without matching the
 * values here. When a number changes, change it HERE first, then sweep.
 */

export const CONTACT = {
  phoneDisplay: "(855) 765-7291",
  phoneHref: "tel:+18557657291",
  supportEmail: "support@skyrate.ai",
  address: "30 N Gould St Ste N, Sheridan, WY 82801",
  linkedin: "https://www.linkedin.com/company/skyrate-llc",
} as const;

/** Defensible, sourced metrics only (see founder/ground-truth.md). */
export const METRICS = {
  /** Full USAC open dataset ingested; annual E-Rate commitments analyzed. */
  fundingAnalyzed: "$2.5B+",
  fundingAnalyzedLabel: "E-Rate Funding Analyzed",
  /** Entities tracked in the platform (understated; DB holds 15k+). */
  entitiesTracked: "500+",
  entitiesTrackedLabel: "Schools & Libraries Tracked",
  statesCovered: "50 States",
  statesCoveredLabel: "Serving Districts Nationwide",
  /** Do NOT publish an appeal success-rate % — no audited source exists. */
  monitoring: "24/7",
  monitoringLabel: "USAC Data Monitoring",
  trialDays: 14,
} as const;

/** Advertised prices — must match Stripe live prices and backend config. */
export const PRICES = {
  consultantMonthly: "$499",
  consultantYearly: "$4,790",
  consultantYearlySave: "$1,198",
  vendorMonthly: "$499",
  vendorYearly: "$4,790",
  vendorYearlySave: "$1,198",
  applicantMonthly: "$199",
  applicantYearly: "$1,910",
  applicantYearlySave: "$478",
} as const;

export const CALENDAR_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendar.app.google/edkn1FDx2mBngFGs9";
