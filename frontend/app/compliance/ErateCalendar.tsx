"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, CheckCircle2, Lock } from "lucide-react";
import { api, type Form471WindowResponse } from "@/lib/api";

/**
 * E-Rate Annual Calendar / Planning Timeline (Ari feedback #12).
 *
 * A practical 12-step roadmap for a successful E-Rate funding year — mirrors the
 * SkyRate "Plan. Procure. Fund. Implement. Reimburse." planning timeline. The
 * current planning phase is highlighted by month, and the live Form 471 window
 * (#3) is surfaced up top. USAC publishes exact dates each year; ranges below
 * are the typical cadence and are labeled as such.
 */

type Phase = {
  step: number;
  month: string;
  title: string;
  icon: string;
  bullets: string[];
  /** planning-cycle months (1-12) used to highlight the current phase */
  months?: number[];
  /** continuous / post-year phases that run alongside the cycle */
  continuous?: boolean;
};

const PHASES: Phase[] = [
  {
    step: 1,
    month: "July",
    title: "Strategic Planning Begins",
    icon: "🗂️",
    months: [7],
    bullets: [
      "Assess technology needs for the upcoming funding year",
      "Review expiring contracts",
      "Meet with IT staff and stakeholders",
      "Develop an E-Rate procurement strategy",
    ],
  },
  {
    step: 2,
    month: "August",
    title: "Requirements & Data Collection",
    icon: "📊",
    months: [8],
    bullets: [
      "Verify enrollment and discount data",
      "Define bandwidth and equipment needs",
      "Build technical specifications",
      "Prepare procurement documents",
    ],
  },
  {
    step: 3,
    month: "September",
    title: "Form 470 Preparation & Early Posting",
    icon: "📝",
    months: [9],
    bullets: [
      "Finalize bid specifications",
      "Develop evaluation criteria",
      "Many applicants begin posting FCC Forms 470",
      "Competitive bidding begins",
    ],
  },
  {
    step: 4,
    month: "October",
    title: "Competitive Bidding",
    icon: "🤝",
    months: [10],
    bullets: [
      "Continue posting Form 470s",
      "Vendors submit proposals",
      "Respond to vendor questions",
      "Begin bid evaluations",
    ],
  },
  {
    step: 5,
    month: "November",
    title: "Vendor Evaluation & Selection",
    icon: "🏅",
    months: [11],
    bullets: [
      "Complete bid evaluations",
      "Select the most cost-effective solution",
      "Negotiate final contract terms",
      "Prepare contracts for execution",
    ],
  },
  {
    step: 6,
    month: "December",
    title: "Contract Execution & Form 471 Preparation",
    icon: "✍️",
    months: [12],
    bullets: [
      "Execute contracts",
      "Verify funding requests",
      "Organize supporting documentation",
      "Prepare FCC Form 471",
    ],
  },
  {
    step: 7,
    month: "January – February",
    title: "Form 471 Filing",
    icon: "📨",
    months: [1, 2],
    bullets: [
      "Submit FCC Form 471",
      "Review FRNs",
      "Verify funding requests",
      "Prepare for PIA review",
    ],
  },
  {
    step: 8,
    month: "March – April",
    title: "PIA Review",
    icon: "🔎",
    months: [3, 4],
    bullets: [
      "Respond to Program Integrity Assurance requests",
      "Submit supporting documentation",
      "Monitor application status",
    ],
  },
  {
    step: 9,
    month: "May – June",
    title: "Funding Commitments",
    icon: "🏛️",
    months: [5, 6],
    bullets: [
      "Review Funding Commitment Decision Letters (FCDLs)",
      "Prepare implementation plans",
      "Coordinate service delivery",
      "Confirm CIPA and other compliance requirements",
    ],
  },
  {
    step: 10,
    month: "July (Funding Year Begins)",
    title: "Service Delivery",
    icon: "🚚",
    continuous: true,
    bullets: [
      "Begin eligible services",
      "Track installations and implementation",
      "Monitor project milestones",
      "Maintain documentation",
    ],
  },
  {
    step: 11,
    month: "Ongoing (Throughout Year)",
    title: "Invoicing & Reimbursement",
    icon: "🧾",
    continuous: true,
    bullets: [
      "File BEAR or SPI invoices",
      "Track reimbursement status",
      "Maintain audit documentation",
      "Prepare for post-commitment reviews",
    ],
  },
  {
    step: 12,
    month: "Post-Funding Year",
    title: "Closeout & Record Retention",
    icon: "📦",
    continuous: true,
    bullets: [
      "Ensure all reimbursements are received",
      "Address any remaining issues",
      "Retain records for the required retention period (typically 10 years)",
    ],
  },
];

export default function ErateCalendar() {
  const [win, setWin] = useState<Form471WindowResponse | null>(null);
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await api.getForm471Window();
        if (active && resp.success && resp.data) setWin(resp.data);
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // The single "current" planning phase = the first cycle step whose months
  // include the current month (steps 1-9). Continuous phases (10-12) are marked
  // separately as always-running.
  const currentStep = PHASES.find((p) => p.months?.includes(currentMonth))?.step ?? null;

  return (
    <div className="space-y-6">
      {/* Intro / tagline */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">E-Rate Planning Timeline</h2>
            <p className="mt-1 text-indigo-100">A practical roadmap for a successful E-Rate funding year.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              {["Plan", "Procure", "Fund", "Implement", "Reimburse"].map((w) => (
                <span key={w} className="rounded-full bg-white/15 px-3 py-1">{w}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Live Form 471 window tie-in (#3) */}
        {win && (
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl border p-3 ${
              win.window_open ? "border-emerald-300/40 bg-emerald-500/20" : "border-amber-300/40 bg-amber-500/20"
            }`}
          >
            {win.window_open ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-200" />
            ) : (
              <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-200" />
            )}
            <div className="text-sm">
              <p className="font-medium">
                {win.window_open
                  ? `The FY${win.funding_year} Form 471 filing window is OPEN.`
                  : `The FY${win.funding_year} Form 471 filing window is not open yet.`}
              </p>
              <p className="text-white/80">
                Expected window: {win.opens_on} – {win.closes_on}
                {win.expected ? " (estimated — pending USAC confirmation)" : ""}.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Timeline grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PHASES.map((phase) => {
          const isCurrent = phase.step === currentStep;
          return (
            <div
              key={phase.step}
              className={`relative rounded-2xl border p-5 transition-shadow ${
                isCurrent
                  ? "border-indigo-400 bg-indigo-50/70 shadow-md ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:shadow-sm"
              }`}
            >
              <div className="mb-2 flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isCurrent ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {phase.step}
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {phase.month}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {phase.continuous && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Ongoing
                    </span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white">
                      Now
                    </span>
                  )}
                </div>
              </div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span aria-hidden>{phase.icon}</span>
                {phase.title}
              </h3>
              <ul className="mt-2 space-y-1">
                {phase.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-600">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Guardrail footnote */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p>
          Key guardrails: the Form 470 must be posted at least 28 days before vendor selection or
          filing the Form 471, and the Form 471 can only be filed during USAC&apos;s annual
          January–March window. Both are enforced in the Document Review and Bid Analysis tabs.
          This timeline reflects common E-Rate planning milestones — actual filing dates may vary
          based on applicant needs and FCC filing windows.
        </p>
      </div>
    </div>
  );
}
