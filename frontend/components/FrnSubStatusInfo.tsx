"use client";

import { useEffect, useRef, useState } from "react";

/**
 * FrnSubStatusInfo
 * -----------------
 * A small "?" button that reveals plain-English explanations of the common
 * USAC FRN sub-statuses / pending reasons. Requested by vendors & consultants
 * so they can understand what each sub-status actually means at a glance.
 *
 * Used in both the Consultant portal and the Vendor portal FRN Status views.
 */

type SubStatusEntry = { term: string; meaning: string };

const SUB_STATUS_GLOSSARY: SubStatusEntry[] = [
  {
    term: "PIA Review",
    meaning:
      "Program Integrity Assurance is actively reviewing the application. USAC may reach out with questions before making a funding decision.",
  },
  {
    term: "Information Requested",
    meaning:
      "USAC has asked the applicant for additional documentation or clarification. The FRN cannot advance until the applicant responds.",
  },
  {
    term: "Wave Ready",
    meaning:
      "Review is complete and the FRN is queued to be committed in an upcoming funding wave. No action is typically needed.",
  },
  {
    term: "Pending",
    meaning:
      "The FRN has been received and is awaiting review. No decision has been issued yet.",
  },
  {
    term: "Committed / Funded",
    meaning:
      "USAC has approved the request and committed funding. An FCDL (Funding Commitment Decision Letter) has been or will be issued.",
  },
  {
    term: "Denied",
    meaning:
      "The funding request was denied. Review the FCDL denial reason — many denials are appealable within 60 days.",
  },
  {
    term: "Cancelled",
    meaning:
      "The FRN was cancelled (usually by the applicant, or because the service was not needed). No funding will be disbursed.",
  },
  {
    term: "Appeal Pending",
    meaning:
      "An appeal has been filed on this FRN and USAC (or the FCC) is reviewing it. The original decision stands until the appeal is resolved.",
  },
  {
    term: "MPER (Ministerial/Clerical Error)",
    meaning:
      "A minor correction request (a Ministerial and Clerical Error Reduction) is being processed to fix a clerical mistake without a full appeal.",
  },
  {
    term: "Outreach",
    meaning:
      "USAC has flagged the FRN for outreach — they are attempting to contact the applicant or service provider to resolve an open item.",
  },
  {
    term: "Initial Review",
    meaning:
      "The application is in the first PIA review stage. USAC is validating the basics before deeper review.",
  },
  {
    term: "Final Review",
    meaning:
      "The FRN has cleared earlier checks and is in the last review stage before a funding decision is issued.",
  },
  {
    term: "15-Day Response Deadline",
    meaning:
      "USAC has an open information request with a 15-calendar-day clock. Respond before it expires or the FRN risks denial — treat as urgent.",
  },
  {
    term: "FCDL Issued",
    meaning:
      "A Funding Commitment Decision Letter has been issued (funded, partially funded, or denied). Check the FCDL for the exact decision and invoicing deadline.",
  },
  {
    term: "First Extension",
    meaning:
      "USAC granted the applicant a first extension of time to respond to an open information request. The response clock has been reset to a new deadline.",
  },
  {
    term: "Second Extension",
    meaning:
      "USAC granted a second (final) extension to respond. This is typically the last extension available — respond before it expires or the FRN risks denial.",
  },
  {
    term: "Applicant Documentation Received",
    meaning:
      "The applicant submitted the requested documentation. USAC is now reviewing the response before continuing the funding decision.",
  },
  {
    term: "Service Provider Documentation Received",
    meaning:
      "The service provider submitted the documentation USAC requested. USAC is reviewing the response before continuing.",
  },
  {
    term: "Heightened Scrutiny / Detailed Review",
    meaning:
      "The FRN was selected for a more in-depth PIA review (additional documentation and validation). Expect a longer review timeline and possible information requests.",
  },
];

export function FrnSubStatusInfo({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-label="What do the sub-statuses mean?"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-500 text-[10px] font-bold leading-none hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
      >
        ?
      </button>
      {open && (
        <div className="absolute z-50 mt-2 left-0 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-4 text-left">
          <div className="text-sm font-semibold text-slate-800 mb-2">
            FRN Sub-Status Guide
          </div>
          <ul className="space-y-2">
            {SUB_STATUS_GLOSSARY.map((s) => (
              <li key={s.term} className="text-xs">
                <span className="font-semibold text-indigo-700">{s.term}</span>
                <span className="text-slate-600"> — {s.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FrnSubStatusInfo;
