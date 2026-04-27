"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

type DemoFRN = {
  frn: string;
  fy: string;
  ben: string;
  applicant: string;
  state: string;
  status: "Funded" | "Denied" | "Pending" | "Canceled";
  committed: number;
  disbursed: number;
  spin: string;
  service: "Internet Access" | "Internal Connections" | "Managed Internal Broadband";
};

const DEMO_BENS: { ben: string; name: string; state: string; students: number }[] = [
  { ben: "16056315", name: "Eastside Unified School District (DEMO)", state: "CA", students: 38_240 },
  { ben: "17042199", name: "Cascade Charter Network (DEMO)", state: "OR", students: 9_870 },
  { ben: "15003245", name: "Riverbend Public Library System (DEMO)", state: "IL", students: 0 },
  { ben: "18092011", name: "Northgate Community School Authority (DEMO)", state: "MI", students: 4_310 },
  { ben: "19011774", name: "Coastal Tribal Education Consortium (DEMO)", state: "WA", students: 2_080 },
];

const DEMO_FRNS: DemoFRN[] = [
  { frn: "2399012101", fy: "2026", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Pending", committed: 482_300, disbursed: 0, spin: "143032945", service: "Internet Access" },
  { frn: "2399012102", fy: "2026", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Pending", committed: 1_215_000, disbursed: 0, spin: "143032945", service: "Internal Connections" },
  { frn: "2399012103", fy: "2026", ben: "17042199", applicant: "Cascade Charter (DEMO)", state: "OR", status: "Denied", committed: 89_400, disbursed: 0, spin: "143015277", service: "Managed Internal Broadband" },
  { frn: "2399012104", fy: "2026", ben: "15003245", applicant: "Riverbend Library (DEMO)", state: "IL", status: "Funded", committed: 35_200, disbursed: 12_400, spin: "143018210", service: "Internet Access" },
  { frn: "2299012055", fy: "2025", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Funded", committed: 412_700, disbursed: 398_100, spin: "143032945", service: "Internet Access" },
  { frn: "2299012056", fy: "2025", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Funded", committed: 990_000, disbursed: 875_000, spin: "143032945", service: "Internal Connections" },
  { frn: "2299012057", fy: "2025", ben: "17042199", applicant: "Cascade Charter (DEMO)", state: "OR", status: "Funded", committed: 71_900, disbursed: 71_900, spin: "143015277", service: "Internet Access" },
  { frn: "2299012058", fy: "2025", ben: "18092011", applicant: "Northgate CSA (DEMO)", state: "MI", status: "Canceled", committed: 0, disbursed: 0, spin: "143020881", service: "Internet Access" },
  { frn: "2299012059", fy: "2025", ben: "19011774", applicant: "Coastal Tribal Ed (DEMO)", state: "WA", status: "Funded", committed: 22_500, disbursed: 22_500, spin: "143020881", service: "Managed Internal Broadband" },
  { frn: "2199011001", fy: "2024", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Funded", committed: 380_000, disbursed: 380_000, spin: "143032945", service: "Internet Access" },
  { frn: "2199011002", fy: "2024", ben: "16056315", applicant: "Eastside USD (DEMO)", state: "CA", status: "Denied", committed: 0, disbursed: 0, spin: "143032945", service: "Internal Connections" },
  { frn: "2199011003", fy: "2024", ben: "17042199", applicant: "Cascade Charter (DEMO)", state: "OR", status: "Funded", committed: 64_400, disbursed: 64_400, spin: "143015277", service: "Internet Access" },
  { frn: "2199011004", fy: "2024", ben: "15003245", applicant: "Riverbend Library (DEMO)", state: "IL", status: "Funded", committed: 31_100, disbursed: 31_100, spin: "143018210", service: "Internet Access" },
  { frn: "2199011005", fy: "2024", ben: "18092011", applicant: "Northgate CSA (DEMO)", state: "MI", status: "Funded", committed: 18_900, disbursed: 18_900, spin: "143020881", service: "Internet Access" },
  { frn: "2199011006", fy: "2024", ben: "19011774", applicant: "Coastal Tribal Ed (DEMO)", state: "WA", status: "Funded", committed: 15_200, disbursed: 15_200, spin: "143020881", service: "Internet Access" },
];

const STATUS_BADGE: Record<DemoFRN["status"], string> = {
  Funded: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Denied: "bg-red-500/20 text-red-300 border-red-500/40",
  Pending: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  Canceled: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};

function fmt(n: number) {
  return n === 0 ? "$0" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function DemoClient() {
  const [year, setYear] = useState<"all" | "2024" | "2025" | "2026">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DemoFRN["status"]>("all");

  useEffect(() => {
    trackEvent("demo_viewed", {});
  }, []);

  const visible = DEMO_FRNS.filter(
    (f) => (year === "all" || f.fy === year) && (statusFilter === "all" || f.status === statusFilter),
  );

  const totals = visible.reduce(
    (acc, f) => {
      acc.committed += f.committed;
      acc.disbursed += f.disbursed;
      if (f.status === "Funded") acc.funded += 1;
      if (f.status === "Denied") acc.denied += 1;
      if (f.status === "Pending") acc.pending += 1;
      return acc;
    },
    { committed: 0, disbursed: 0, funded: 0, denied: 0, pending: 0 },
  );

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Total Committed" value={fmt(totals.committed)} accent="text-emerald-300" />
        <Stat label="Total Disbursed" value={fmt(totals.disbursed)} accent="text-indigo-300" />
        <Stat label="Funded FRNs" value={String(totals.funded)} accent="text-emerald-300" />
        <Stat label="Pending / Denied" value={`${totals.pending} / ${totals.denied}`} accent="text-amber-300" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <span className="text-slate-500">Funding Year:</span>
        {(["all", "2026", "2025", "2024"] as const).map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`px-3 py-1 rounded-full border transition ${
              year === y
                ? "bg-purple-600 border-purple-400 text-white"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {y === "all" ? "All" : `FY${y}`}
          </button>
        ))}
        <span className="text-slate-500 ml-3">Status:</span>
        {(["all", "Funded", "Pending", "Denied", "Canceled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full border transition ${
              statusFilter === s
                ? "bg-purple-600 border-purple-400 text-white"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-slate-400">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">FRN</th>
              <th className="text-left px-4 py-3 font-semibold">FY</th>
              <th className="text-left px-4 py-3 font-semibold">Applicant (BEN)</th>
              <th className="text-left px-4 py-3 font-semibold">State</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-4 py-3 font-semibold">Committed</th>
              <th className="text-right px-4 py-3 font-semibold">Disbursed</th>
              <th className="text-left px-4 py-3 font-semibold">Service</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.frn} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-purple-300">{f.frn}</td>
                <td className="px-4 py-3 text-slate-300">FY{f.fy}</td>
                <td className="px-4 py-3 text-slate-200">
                  {f.applicant}
                  <span className="block text-xs text-slate-500 font-mono">BEN {f.ben}</span>
                </td>
                <td className="px-4 py-3 text-slate-300">{f.state}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${STATUS_BADGE[f.status]}`}
                  >
                    {f.status}
                  </span>
                  {f.status === "Denied" && (
                    <span className="block text-xs text-red-300 mt-1">AI appeal letter ready →</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{fmt(f.committed)}</td>
                <td className="px-4 py-3 text-right text-indigo-300 tabular-nums">{fmt(f.disbursed)}</td>
                <td className="px-4 py-3 text-slate-300">{f.service}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No FRNs match this filter combination. Try widening it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-semibold mb-2 text-white">Sample BEN Portfolio ({DEMO_BENS.length} entities)</h3>
          <ul className="space-y-2 text-sm">
            {DEMO_BENS.map((b) => (
              <li key={b.ben} className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-slate-200">{b.name}</span>
                <span className="text-slate-500 font-mono text-xs">BEN {b.ben} · {b.state}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="font-semibold mb-2 text-white">What you can do in a real account</h3>
          <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
            <li>Auto-import every BEN in your CRN-linked portfolio from USAC</li>
            <li>Get email alerts when any FRN status changes</li>
            <li>Generate AI appeal letters for denied applications using FCC Order 19-117 logic</li>
            <li>Track Form 470 filings for vendor lead discovery</li>
            <li>Monitor C2 budget remaining per BEN, per funding year</li>
          </ul>
          <Link
            href="/sign-up?source=demo-features"
            className="inline-block mt-4 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg font-semibold text-sm hover:from-indigo-500 hover:to-purple-500 transition"
          >
            Try it on your real BENs →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent} tabular-nums`}>{value}</p>
    </div>
  );
}
