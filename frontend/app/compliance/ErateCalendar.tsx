"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, CheckCircle2, Lock } from "lucide-react";
import { api, type Form471WindowResponse } from "@/lib/api";

/**
 * E-Rate Annual Calendar (Ari feedback #12).
 *
 * A full timeline of the E-Rate program year phases, with the current phase
 * highlighted, wired into the live Form 470 (28-day, #2) and Form 471 (January
 * window, #3) guardrails. USAC publishes exact dates each year; the ranges here
 * are the typical/estimated cadence and are labeled as such.
 */

type Phase = {
  key: string;
  title: string;
  window: string;
  /** inclusive month range (1-12) used to highlight the current phase */
  months: [number, number];
  description: string;
  forms?: string;
};

const PHASES: Phase[] = [
  {
    key: "bidding",
    title: "Competitive Bidding — Form 470",
    window: "July – January",
    months: [7, 1],
    forms: "Form 470",
    description:
      "Post your Form 470 to open competitive bidding. It must be posted for at least 28 days before you can select a vendor or file the Form 471.",
  },
  {
    key: "vendor",
    title: "Vendor Selection & Contracts",
    window: "After 28-day bid window",
    months: [12, 2],
    description:
      "Once the 28-day bidding window closes, evaluate bids, select the most cost-effective vendor, and sign contracts ahead of the Form 471 window.",
  },
  {
    key: "application",
    title: "Application Filing — Form 471",
    window: "Mid-January – Late March",
    months: [1, 3],
    forms: "Form 471",
    description:
      "File the Form 471 during USAC's annual application window. This is the funding request for Category 1 and Category 2 services.",
  },
  {
    key: "pia",
    title: "PIA Review",
    window: "February – August",
    months: [2, 8],
    description:
      "USAC's Program Integrity Assurance team reviews applications and may request additional information. Respond promptly to avoid delays.",
  },
  {
    key: "fcdl",
    title: "Funding Commitments — FCDL",
    window: "May – rolling",
    months: [5, 9],
    description:
      "USAC issues Funding Commitment Decision Letters (FCDLs). Review commitments and file appeals within 60 days if needed.",
  },
  {
    key: "cipa",
    title: "Service Start & CIPA — Form 486",
    window: "By ~October",
    months: [7, 10],
    forms: "Form 486",
    description:
      "File Form 486 to confirm services have started and CIPA compliance. Due 120 days after the FCDL date or the service start date, whichever is later.",
  },
  {
    key: "invoicing",
    title: "Invoicing — BEAR / SPI",
    window: "After services delivered",
    months: [10, 6],
    forms: "Form 472 (BEAR) / Form 474 (SPI)",
    description:
      "Invoice USAC for delivered services. Reimbursement is limited to installed equipment or the monthly charges for internet/maintenance. Recurring-service delivery deadline is generally September 30 of the following funding year.",
  },
];

function inRange(month: number, [start, end]: [number, number]): boolean {
  // handles ranges that wrap the calendar year (e.g. Jul–Jan)
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

export default function ErateCalendar() {
  const [win, setWin] = useState<Form471WindowResponse | null>(null);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">E-Rate Annual Calendar</h2>
            <p className="text-sm text-slate-500">
              The program-year cycle at a glance. Exact dates are set by USAC each year — ranges
              below are the typical cadence.
            </p>
          </div>
        </div>

        {/* Live Form 471 window tie-in (#3) */}
        {win && (
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${
              win.window_open
                ? "border-emerald-200 bg-emerald-50"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            {win.window_open ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            ) : (
              <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            )}
            <div className="text-sm">
              <p className={`font-medium ${win.window_open ? "text-emerald-800" : "text-amber-800"}`}>
                {win.window_open
                  ? `The FY${win.funding_year} Form 471 filing window is OPEN.`
                  : `The FY${win.funding_year} Form 471 filing window is not open yet.`}
              </p>
              <p className={win.window_open ? "text-emerald-700" : "text-amber-700"}>
                Expected window: {win.opens_on} – {win.closes_on}
                {win.expected ? " (estimated — pending USAC confirmation)" : ""}.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ol className="relative space-y-4 border-l border-slate-200 pl-6">
          {PHASES.map((phase) => {
            const isCurrent = inRange(currentMonth, phase.months);
            return (
              <li key={phase.key} className="relative">
                <span
                  className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                    isCurrent ? "bg-indigo-600" : "bg-slate-300"
                  }`}
                />
                <div
                  className={`rounded-xl border p-4 ${
                    isCurrent ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{phase.title}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
                        Current phase
                      </span>
                    )}
                    {phase.forms && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {phase.forms}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{phase.window}</p>
                  <p className="mt-1.5 text-sm text-slate-600">{phase.description}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>
            Key guardrails: the Form 470 must be posted at least 28 days before vendor selection or
            filing the Form 471, and the Form 471 can only be filed during USAC&apos;s annual
            January–March window. Both are enforced in the Document Review and Bid Analysis tabs.
          </p>
        </div>
      </div>
    </div>
  );
}
