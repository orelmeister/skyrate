"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Loader2, Search, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

// Phase 2 client component — handles the FRN lookup form, displays the result,
// and offers an optional email-alert capture below the result. No auth.

type FRNRecord = {
  frn: string;
  funding_year?: string | null;
  application_number?: string | null;
  status?: string | null;
  pending_reason?: string | null;
  fcdl_comment?: string | null;
  ben?: string | null;
  applicant_name?: string | null;
  state?: string | null;
  spin_name?: string | null;
  service_type?: string | null;
  service_category?: string | null;
  commitment_amount: number;
  disbursed_amount: number;
  discount_rate: number;
  award_date?: string | null;
  fcdl_date?: string | null;
  service_start?: string | null;
  service_end?: string | null;
  last_invoice_date?: string | null;
  wave_number?: string | null;
  updated_at?: string | null;
};

type LookupResponse = {
  success: boolean;
  found: boolean;
  frn: string;
  record?: FRNRecord | null;
  message?: string | null;
};

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function statusBucket(s?: string | null): "funded" | "denied" | "pending" | "cancelled" | "unknown" {
  if (!s) return "unknown";
  const l = s.toLowerCase();
  if (l.includes("denied")) return "denied";
  if (l.includes("funded") || l.includes("committed")) return "funded";
  if (l.includes("cancel") || l.includes("withdraw")) return "cancelled";
  return "pending";
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; icon: JSX.Element }> = {
  funded: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
  pending: {
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/40",
    icon: <Clock className="w-5 h-5" />,
  },
  denied: {
    bg: "bg-red-500/15",
    text: "text-red-300",
    border: "border-red-500/40",
    icon: <XCircle className="w-5 h-5" />,
  },
  cancelled: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/40",
    icon: <AlertCircle className="w-5 h-5" />,
  },
  unknown: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/40",
    icon: <AlertCircle className="w-5 h-5" />,
  },
};

export default function FrnLookupClient() {
  const [frn, setFrn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const cleaned = frn.replace(/\D/g, "");
    if (cleaned.length < 4) {
      setError("Please enter a valid FRN (4–20 digits).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/public/frn-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frn: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail || "Lookup failed. Please try again.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
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
            value={frn}
            onChange={(e) => setFrn(e.target.value)}
            placeholder="Enter your FRN (e.g. 2299012345)"
            aria-label="Funding Request Number"
            className="w-full pl-12 pr-4 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition text-base"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/30 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          {loading ? "Looking up…" : "Track FRN"}
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
                  <h3 className="text-white font-semibold text-lg mb-1">FRN {result.frn} — not found</h3>
                  <p className="text-slate-300 text-sm">
                    {result.message || "No public USAC record found. The FRN may be too new or never certified."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <FrnResultCard record={result.record!} />
          )}

          <div className="mt-6">
            <FrnAlertCapture frn={result.frn} found={result.found} />
          </div>

          <div className="mt-6 text-center">
            <Link
              href={`/sign-up?role=consultant&source=frn-tracker&prefill_frn=${encodeURIComponent(result.frn)}`}
              className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition shadow-lg shadow-indigo-500/30"
            >
              Track this FRN automatically + get email alerts →
            </Link>
            <p className="text-xs text-slate-500 mt-2">14-day free trial · No credit card</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FrnResultCard({ record }: { record: FRNRecord }) {
  const bucket = statusBucket(record.status);
  const style = STATUS_STYLES[bucket];

  const rows: { label: string; value: string | number | null | undefined }[] = [
    { label: "Applicant", value: record.applicant_name },
    { label: "BEN", value: record.ben },
    { label: "State", value: record.state },
    { label: "Funding Year", value: record.funding_year },
    { label: "Form 471 Application", value: record.application_number },
    { label: "Service Provider (SPIN)", value: record.spin_name },
    { label: "Service Type", value: record.service_type },
    { label: "Discount Rate", value: record.discount_rate ? `${record.discount_rate.toFixed(0)}%` : null },
    { label: "Wave", value: record.wave_number },
    { label: "Award Date", value: record.award_date },
    { label: "FCDL Date", value: record.fcdl_date },
    { label: "Service Start", value: record.service_start },
    { label: "Service End", value: record.service_end },
    { label: "Last Date to Invoice", value: record.last_invoice_date },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Funding Request Number</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-white">FRN {record.frn}</h3>
            {record.applicant_name && (
              <p className="text-slate-400 mt-1">{record.applicant_name}{record.state ? ` · ${record.state}` : ""}</p>
            )}
          </div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${style.bg} ${style.text} ${style.border} font-semibold text-sm`}
          >
            {style.icon}
            {record.status || "Unknown"}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Committed</p>
            <p className="text-2xl font-bold text-emerald-300">{formatMoney(record.commitment_amount)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Disbursed</p>
            <p className="text-2xl font-bold text-indigo-300">{formatMoney(record.disbursed_amount)}</p>
          </div>
        </div>
      </div>

      {(record.pending_reason || record.fcdl_comment) && (
        <div className="p-6 border-b border-white/10 bg-amber-500/5">
          {record.pending_reason && (
            <div className="mb-3">
              <p className="text-xs uppercase tracking-wider text-amber-400 mb-1">Pending Reason</p>
              <p className="text-slate-200 text-sm">{record.pending_reason}</p>
            </div>
          )}
          {record.fcdl_comment && (
            <div>
              <p className="text-xs uppercase tracking-wider text-amber-400 mb-1">FCDL Comment</p>
              <p className="text-slate-200 text-sm whitespace-pre-line">{record.fcdl_comment}</p>
            </div>
          )}
        </div>
      )}

      <div className="p-6">
        <h4 className="text-white font-semibold mb-3">FRN Details</h4>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 border-b border-white/5 pb-2">
              <dt className="text-slate-500">{r.label}</dt>
              <dd className="text-slate-200 font-medium text-right">{String(r.value)}</dd>
            </div>
          ))}
        </dl>
        {record.updated_at && (
          <p className="text-xs text-slate-600 mt-4">USAC last updated: {new Date(record.updated_at).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}

function FrnAlertCapture({ frn, found }: { frn: string; found: boolean }) {
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
          source: "frn-tracker-alert",
          notes: `Wants alerts for FRN ${frn}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.detail || "Could not save your email. Try again.");
      } else {
        setDone(true);
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
          We&apos;ll email you when FRN {frn} changes status. (One-time, no spam.)
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <h4 className="text-white font-semibold mb-1">Want alerts when FRN {frn} changes status?</h4>
      <p className="text-slate-400 text-sm mb-4">Drop your email — we&apos;ll ping you once when USAC updates this FRN. No signup required.</p>
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
          aria-label="Email"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-500 hover:to-purple-500 transition disabled:opacity-60"
        >
          {submitting ? "…" : "Notify me"}
        </button>
      </form>
      {err && <p className="text-red-300 text-sm mt-2">{err}</p>}
    </div>
  );
}
