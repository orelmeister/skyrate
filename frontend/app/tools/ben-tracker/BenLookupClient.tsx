"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Loader2, Search, AlertCircle, CheckCircle2, Clock, XCircle, Building2, AlertTriangle } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

// USAC Open Data — FRN line-item dataset (same one the erateapp.com free audit uses).
// Filterable by billed_entity_number; richer than the FRN-status summary feed.
const USAC_FRN_LINEITEMS_API = "https://opendata.usac.org/resource/avi8-svp9.json";
const CURRENT_FY = new Date().getFullYear();

type FRNSummary = {
  frn: string;
  funding_year: string;
  category: string;
  status: string;
  commitment_amount: number;
  sortKey: number;
};

type CurrentYearIssue = {
  frn: string;
  status: string;
  year: number;
};

type BENRecord = {
  ben: string;
  applicant_name: string;
  state: string;
  city: string;
  total_committed: number;
  total_frns: number;
  counts: { funded: number; denied: number; pending: number; other: number };
  frns: FRNSummary[];
  currentYearIssues: CurrentYearIssue[];
};

type BENLookupResponse = {
  found: boolean;
  ben: string;
  record?: BENRecord | null;
};

type USACRecord = Record<string, unknown>;

function getStr(rec: USACRecord, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function getNum(rec: USACRecord, keys: string[]): number {
  for (const k of keys) {
    const v = rec[k];
    if (v !== undefined && v !== null && v !== "") {
      const n = parseFloat(String(v));
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return "$0";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function classifyStatus(raw: string | null | undefined): "funded" | "denied" | "pending" | "other" {
  const s = (raw || "").toLowerCase();
  if (s.includes("fund") && !s.includes("not") && !s.includes("denied")) return "funded";
  if (s.includes("commit") && !s.includes("not")) return "funded";
  if (s.includes("denied") || s.includes("not funded") || s.includes("cancel")) return "denied";
  if (s.includes("pending") || s.includes("review") || s.includes("process")) return "pending";
  return "other";
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  funded: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  pending: {
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/40",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  denied: {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-500/40",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  other: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/40",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

function buildRecordFromUSAC(ben: string, rows: USACRecord[]): BENRecord {
  let applicantName = "";
  let state = "";
  let city = "";
  const frnMap: Record<string, FRNSummary> = {};
  const currentYearIssues: CurrentYearIssue[] = [];

  for (const r of rows) {
    if (!applicantName) applicantName = getStr(r, ["organization_name", "ros_entity_name"]);
    if (!state) state = getStr(r, ["org_state", "ros_physical_state"]);
    if (!city) city = getStr(r, ["org_city", "ros_physical_city"]);

    const frn = getStr(r, ["funding_request_number"]);
    if (!frn) continue;

    if (!frnMap[frn]) {
      frnMap[frn] = {
        frn,
        funding_year: getStr(r, ["funding_year"]),
        category: getStr(r, ["chosen_category_of_service"]) || "—",
        status:
          getStr(r, ["form_471_frn_status_name"]) ||
          getStr(r, ["form_471_status_name"]) ||
          "Unknown",
        commitment_amount: 0,
        sortKey: parseInt(getStr(r, ["funding_year"]) || "0", 10) || 0,
      };
    }
    // Sum post-discount eligible line-item costs across this FRN's line items
    frnMap[frn].commitment_amount += getNum(r, ["post_discount_extended_eligible_line_item_costs"]);

    // Prefer the most decisive status across line items (funded wins)
    const newStatus = getStr(r, ["form_471_frn_status_name"]);
    if (newStatus && classifyStatus(newStatus) === "funded") {
      frnMap[frn].status = newStatus;
    }

    // Current-year denial/cancel tracking
    const fy = parseInt(getStr(r, ["funding_year"]) || "0", 10);
    const statusName = getStr(r, ["form_471_frn_status_name"]);
    const sLower = statusName.toLowerCase();
    if (fy === CURRENT_FY && (sLower.includes("denied") || sLower.includes("cancel"))) {
      if (!currentYearIssues.find((x) => x.frn === frn)) {
        currentYearIssues.push({ frn, status: statusName, year: fy });
      }
    }
  }

  const counts = { funded: 0, denied: 0, pending: 0, other: 0 };
  let totalCommitted = 0;
  const frns: FRNSummary[] = [];
  for (const k in frnMap) {
    const f = frnMap[k];
    const c = classifyStatus(f.status);
    counts[c] = (counts[c] || 0) + 1;
    if (c === "funded") totalCommitted += f.commitment_amount;
    frns.push(f);
  }
  frns.sort((a, b) => (b.sortKey !== a.sortKey ? b.sortKey - a.sortKey : a.frn.localeCompare(b.frn)));

  return {
    ben,
    applicant_name: applicantName,
    state,
    city,
    total_committed: totalCommitted,
    total_frns: frns.length,
    counts,
    frns,
    currentYearIssues,
  };
}

function buildInsights(record: BENRecord): string[] {
  const out: string[] = [];
  const { counts, total_frns, total_committed, ben } = record;

  if (total_frns === 0) {
    out.push(
      `No FRNs found in USAC public data for BEN ${ben}. This can happen for brand-new applicants or if the BEN is incorrect — a SkyRate consultant can verify.`,
    );
    return out;
  }

  out.push(
    `Found <strong>${total_frns} funding request${total_frns === 1 ? "" : "s"}</strong> on file, with <strong>${formatMoney(
      total_committed,
    )}</strong> in committed funding across all years.`,
  );

  if (counts.denied > 0) {
    out.push(
      `<strong>${counts.denied} denied or cancelled FRN${counts.denied === 1 ? "" : "s"}</strong> identified. Most E-Rate denials can be appealed within 60 days of the FCDL — common winnable reasons include cost-allocation disputes, competitive-bidding documentation, and discount-rate calculation errors.`,
    );
  } else {
    out.push(
      `No denials detected — strong filing track record. SkyRate can help you maximize your Category 2 budget and lock in next-year funding earlier.`,
    );
  }

  if (counts.pending > 0) {
    out.push(
      `<strong>${counts.pending} pending or in-review FRN${counts.pending === 1 ? "" : "s"}</strong>. PIA reviews often request supporting documentation within tight deadlines — missing a response can convert a pending FRN into a denial.`,
    );
  }

  if (counts.funded > 0 && counts.denied === 0 && counts.pending === 0) {
    out.push(
      `Every FRN on file is funded — excellent. A strategy session can identify whether you are leaving Category 2 budget on the table or qualify for a higher discount rate.`,
    );
  }

  return out;
}

export default function BenLookupClient() {
  const [ben, setBen] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BENLookupResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const cleaned = ben.replace(/\D/g, "");
    if (cleaned.length < 4) {
      setError("Please enter a valid BEN (4–12 digits).");
      return;
    }
    setLoading(true);
    trackEvent("ben_tracker_search", { ben: cleaned });

    // 30s client-side timeout — guards against transient USAC slowness.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const url =
        `${USAC_FRN_LINEITEMS_API}?billed_entity_number=${encodeURIComponent(cleaned)}` +
        `&$limit=500&$order=funding_year DESC`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        setError(`USAC API error (HTTP ${res.status}). Please try again in a moment.`);
        return;
      }
      const rows = (await res.json()) as USACRecord[];
      const record = buildRecordFromUSAC(cleaned, rows || []);
      const found = record.total_frns > 0;
      setResult({ found, ben: cleaned, record: found ? record : null });
      trackEvent("ben_tracker_result", {
        ben: cleaned,
        found,
        total_frns: record.total_frns,
        denied_count: record.counts.denied,
        current_year_denied: record.currentYearIssues.length,
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setError(
        isAbort
          ? "Lookup is taking longer than usual. USAC may be slow right now — please try again in a moment."
          : "Network error. Please try again.",
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={ben}
            onChange={(e) => setBen(e.target.value)}
            placeholder="Enter BEN (e.g. 16056315)"
            aria-label="Billed Entity Number"
            className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-base"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/30 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          {loading ? "Looking up..." : "Track BEN"}
        </button>
      </form>

      {error && (
        <div className="max-w-2xl mx-auto mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="max-w-3xl mx-auto mt-8 text-left">
          {!result.found ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-300 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-white font-semibold text-lg mb-1">BEN {result.ben} — not found</h3>
                  <p className="text-slate-300 text-sm">
                    No FRNs found in USAC public data for this BEN. This is normal for brand-new applicants or if the BEN is mistyped — a SkyRate consultant can help either way.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            result.record && (
              <>
                {result.record.currentYearIssues.length > 0 && (
                  <UrgentBanner record={result.record} />
                )}
                <BenResultCard record={result.record} />
              </>
            )
          )}

          <div className="mt-6">
            <BenLeadCapture ben={result.ben} found={result.found} />
          </div>

          <div className="mt-6 text-center">
            <Link
              href={`/sign-up?source=ben-tracker&prefill_ben=${encodeURIComponent(result.ben)}`}
              className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/30"
            >
              Monitor this BEN automatically + get FRN alerts
            </Link>
            <p className="text-xs text-slate-500 mt-2">14-day free trial · No credit card</p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Data source:{" "}
            <a
              href="https://opendata.usac.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-300"
            >
              USAC Open Data Platform
            </a>
            . Summary generated in your browser at the time of search.
          </p>
        </div>
      )}
    </div>
  );
}

function UrgentBanner({ record }: { record: BENRecord }) {
  const issues = record.currentYearIssues;
  if (issues.length === 0) return null;
  const first = issues[0];
  const statusLabel = first.status.toLowerCase().includes("cancel") ? "Cancelled" : "Denied";
  const extra = issues.length > 1 ? ` (and ${issues.length - 1} other${issues.length - 1 === 1 ? "" : "s"})` : "";
  return (
    <div className="mb-6 bg-red-500/10 border border-red-500/40 rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-white font-semibold text-lg">
            Urgent: FY{CURRENT_FY} application {statusLabel.toLowerCase()}{extra}.
          </h3>
          <p className="text-slate-300 text-sm mt-1">
            Appeals must typically be filed within <strong>60 days of the FCDL</strong>. SkyRate can help you recover this funding — talk to a consultant now.
          </p>
          <Link
            href={`/sign-up?source=ben-tracker-urgent&prefill_ben=${encodeURIComponent(record.ben)}`}
            className="mt-3 inline-flex items-center gap-1 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg text-sm font-semibold transition"
          >
            Book my urgent appeal call →
          </Link>
        </div>
      </div>
    </div>
  );
}

function BenResultCard({ record }: { record: BENRecord }) {
  const insights = buildInsights(record);
  const topFrns = record.frns.slice(0, 5);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* Entity Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 bg-purple-500/15 rounded-xl">
            <Building2 className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Billed Entity Number</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-white truncate">
              {record.applicant_name || `BEN ${record.ben}`}
            </h3>
            <p className="text-slate-400 mt-1 text-sm">
              BEN {record.ben}
              {record.city ? ` · ${record.city}` : ""}
              {record.state ? ` · ${record.state}` : ""}
            </p>
          </div>
        </div>

        {/* Stat tiles — match free-audit grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          <StatTile label="Total FRNs" value={String(record.total_frns)} tone="indigo" />
          <StatTile label="Total Committed" value={formatMoney(record.total_committed)} tone="emerald" />
          <StatTile label="Funded" value={String(record.counts.funded)} tone="emerald" />
          <StatTile label="Denied / Cancelled" value={String(record.counts.denied)} tone="red" />
          <StatTile label="Pending / Review" value={String(record.counts.pending)} tone="amber" />
          <StatTile label="Other" value={String(record.counts.other)} tone="slate" />
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="p-6 border-b border-white/10 bg-white/[0.02]">
          <h4 className="text-white font-semibold mb-3">Audit Insights</h4>
          <ul className="space-y-2 text-sm text-slate-300 list-disc pl-5">
            {insights.map((html, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: html }} />
            ))}
          </ul>
        </div>
      )}

      {/* FRN Table — most recent 5 */}
      {topFrns.length > 0 && (
        <div className="p-6">
          <h4 className="text-white font-semibold mb-4">Most Recent FRNs</h4>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-white/10">
                  <th className="py-2 px-2 font-medium">FRN</th>
                  <th className="py-2 px-2 font-medium">FY</th>
                  <th className="py-2 px-2 font-medium">Category</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {topFrns.map((frn) => {
                  const bucket = classifyStatus(frn.status);
                  const style = STATUS_STYLES[bucket];
                  return (
                    <tr key={frn.frn} className="text-slate-300">
                      <td className="py-3 px-2 font-mono text-purple-300">{frn.frn}</td>
                      <td className="py-3 px-2 text-slate-400">{frn.funding_year || "—"}</td>
                      <td className="py-3 px-2 text-slate-400">{frn.category}</td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${style.bg} ${style.text} ${style.border}`}
                        >
                          {style.icon}
                          {frn.status || "Unknown"}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-emerald-300 font-medium">
                        {formatMoney(frn.commitment_amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {record.frns.length > 5 && (
            <p className="text-xs text-slate-500 mt-3">
              Showing 5 of {record.frns.length} FRNs. Sign up to monitor every FRN automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TONE_STYLES: Record<string, { value: string; bg: string }> = {
  indigo:  { value: "text-indigo-300",  bg: "bg-white/5" },
  emerald: { value: "text-emerald-300", bg: "bg-white/5" },
  red:     { value: "text-red-300",     bg: "bg-red-500/5" },
  amber:   { value: "text-amber-300",   bg: "bg-amber-500/5" },
  slate:   { value: "text-slate-300",   bg: "bg-white/5" },
};

function StatTile({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONE_STYLES }) {
  const t = TONE_STYLES[tone] || TONE_STYLES.slate;
  return (
    <div className={`rounded-xl p-4 border border-white/10 ${t.bg}`}>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${t.value}`}>{value}</p>
    </div>
  );
}

function BenLeadCapture({ ben, found }: { ben: string; found: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!found) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !name.trim()) {
      setErr("Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/leads/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: "unsure",
          source: "ben-tracker-alert",
          notes: `Wants alerts for BEN ${ben}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr((data as { detail?: string })?.detail || "Could not save your email. Try again.");
      } else {
        setDone(true);
        trackEvent("ben_tracker_lead_capture", { ben });
        trackEvent("lead_capture_submit", { source: "ben-tracker-alert", ben });
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
        <h4 className="text-white font-semibold">You&apos;re on the list</h4>
        <p className="text-slate-300 text-sm mt-1">
          We&apos;ll email you when BEN {ben} has FRN status changes. (One-time, no spam.)
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <h4 className="text-white font-semibold mb-1">Want alerts when BEN {ben} has FRN updates?</h4>
      <p className="text-slate-400 text-sm mb-4">Drop your email — we&apos;ll notify you once when USAC updates any FRN for this entity. No signup required.</p>
      <form onSubmit={submit} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Your name"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="Email address"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-500 hover:to-purple-500 transition disabled:opacity-60"
        >
          {submitting ? "..." : "Notify me"}
        </button>
      </form>
      {err && <p className="text-red-300 text-sm mt-2">{err}</p>}
    </div>
  );
}
