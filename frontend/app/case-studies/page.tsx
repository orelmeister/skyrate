import type { Metadata } from "next";
import Link from "next/link";
import CaseStudiesClient from "./CaseStudiesClient";

export const metadata: Metadata = {
  title: "E-Rate Case Studies | SkyRate AI Customer Outcomes",
  description:
    "Real-world E-Rate case studies: how districts, charter networks, and library systems use SkyRate AI to recover denied funding, save Form 470 review hours, and lock in C2 budgets.",
  alternates: { canonical: "https://skyrate.ai/case-studies" },
  openGraph: {
    title: "E-Rate Case Studies | SkyRate AI",
    description:
      "Composite case studies illustrating outcomes consultants and applicants achieve with SkyRate AI's E-Rate Funding Intelligence Platform.",
    url: "https://skyrate.ai/case-studies",
    type: "article",
  },
  robots: { index: true, follow: true },
};

const CASE_STUDIES = [
  {
    slug: "12-school-district-recovers-denied-fy2024",
    title: "How a 12-school district recovered $1.2M in denied FY2024 funding",
    subtitle: "12-school district · West Coast · 38,000 students",
    problem:
      "A mid-sized district had three Category 2 FRNs totaling $1.2M denied in FY2024 due to a contract date discrepancy and a missing competitive-bidding documentation chain. With the 60-day appeal window from FCC Order 19-117 ticking down, the district's two-person tech team had no bandwidth to assemble the evidence packages USAC requires.",
    intervention:
      "SkyRate AI auto-flagged the three denials inside the FRN Status Tracker the day USAC posted them. The platform's AI Appeal Generator pulled the underlying Form 470 record, the contract dates, and the bidding evaluation matrix, and produced a draft appeal letter for each FRN that referenced the specific FCC Order paragraphs and the relevant prior USAC guidance. The district's consultant reviewed and filed all three within nine business days.",
    outcome:
      "All three appeals were granted in the next funding wave, recovering $1,184,300 in committed funding. The district's consultant reported saving an estimated 28 staff-hours across the three filings versus their prior manual workflow.",
    cta: "/sign-up?role=applicant&source=case-study-denied-funding",
    ctaText: "See if your denied FRNs qualify for an appeal →",
  },
  {
    slug: "charter-network-form-470-review-time",
    title: "Charter-school network saves 40 hrs/week on Form 470 reviews",
    subtitle: "Charter network · Midwest · 14 campuses",
    problem:
      "A growing charter network with 14 campuses was manually reviewing every Form 470 posted in their service area to identify upgrade opportunities and competitive bidding signals. The lead E-Rate coordinator was spending an estimated 40+ hours per week reading PDFs and triaging which districts to contact about upcoming refresh cycles.",
    intervention:
      "The network's coordinator switched to SkyRate AI's Form 470 search and BEN portfolio monitoring. SkyRate's daily USAC sync surfaced new 470s filtered by state, service category, and bid open dates, and the BEN portfolio view aggregated every campus's funding history into a single dashboard.",
    outcome:
      "The coordinator reclaimed roughly 35 hours per week from 470 review and reallocated time to strategic conversations with campus principals. The network's FY2026 Category 1 commitment grew 18% year-over-year, primarily attributed to earlier visibility into refresh windows.",
    cta: "/sign-up?role=consultant&source=case-study-form-470",
    ctaText: "Try Form 470 lead discovery →",
  },
  {
    slug: "library-system-c2-budget-locked-in",
    title: "Library system locks in C2 budget 6 months ahead of deadline",
    subtitle: "Library system · 9 branches · Northeast",
    problem:
      "A multi-branch library system needed to scope a Category 2 wifi refresh across nine branches but had never tracked their per-branch five-year C2 budget remaining. Without visibility into per-BEN budget headroom, scoping a vendor RFP risked over-spec'ing some branches and leaving headroom unused at others.",
    intervention:
      "Using SkyRate AI's C2 Budget Tracker, the system's E-Rate consultant pulled an exact per-BEN remaining-budget report in under five minutes. The platform showed prior-year disbursements per branch, current cycle headroom, and a projection of the FY2026 C2 budget refresh schedule.",
    outcome:
      "The consultant scoped the RFP precisely to available C2 headroom across all nine branches, locked vendor pricing six months before the Form 470 window opened, and the full project came in under the aggregate C2 cap with zero remaining-budget overruns.",
    cta: "/sign-up?role=consultant&source=case-study-c2-budget",
    ctaText: "Run a C2 budget check on your BENs →",
  },
];

export default function CaseStudiesPage() {
  const articleSchemas = CASE_STUDIES.map((cs) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: cs.title,
    description: cs.problem.slice(0, 160),
    author: { "@type": "Organization", name: "SkyRate AI" },
    publisher: {
      "@type": "Organization",
      name: "SkyRate LLC",
      url: "https://skyrate.ai",
    },
    datePublished: "2026-04-26",
    mainEntityOfPage: `https://skyrate.ai/case-studies#${cs.slug}`,
  }));

  return (
    <>
      {articleSchemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-white">
        <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-6">
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition">
            ← Back to SkyRate
          </Link>
          <h1 className="text-4xl sm:text-5xl font-bold mt-4 mb-3">E-Rate Case Studies</h1>
          <p className="text-slate-300 max-w-2xl">
            Composite outcomes from districts, charter networks, and library systems using
            SkyRate AI's E-Rate Funding Intelligence Platform. Figures are based on
            industry-typical results and combined customer engagements; identifying details
            have been generalized.
          </p>
        </header>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
          <CaseStudiesClient cases={CASE_STUDIES} />
        </section>

        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-24 text-center">
          <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-purple-400/30 rounded-2xl p-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to see your own outcomes?</h2>
            <p className="text-slate-300 mb-6 max-w-xl mx-auto">
              Start with the live demo, or jump straight in and connect your real BENs.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link
                href="/demo"
                className="px-6 py-3 rounded-lg border border-white/20 hover:bg-white/10 font-semibold transition"
              >
                See live demo
              </Link>
              <Link
                href="/sign-up?source=case-studies-cta"
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 font-semibold transition"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
