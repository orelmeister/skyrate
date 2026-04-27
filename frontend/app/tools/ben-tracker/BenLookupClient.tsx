"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Loader2, Search, AlertCircle, CheckCircle2, Clock, XCircle, Building2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

type FRNSummary = {
  frn: string;
  funding_year?: string | null;
  status?: string | null;
  commitment_amount: number;
  spin_name?: string | null;
  service_type?: string | null;
};

type BENRecord = {
  ben: string;
  applicant_name?: string | null;
  state?: string | null;
  entity_type?: string | null;
  total_committed: number;
  total_frns: number;
  frns: FRNSummary[];
};

type BENLookupResponse = {
  success: boolean;
  found: boolean;
  ben: string;
  record?: BENRecord | null;
  message?: string | null;
};

function formatMoney(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return "$0";
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
  cancelled: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/40",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  unknown: {
    bg: "bg-slate-500/15",
    text: "text-slate-300",
    border: "border-slate-500/40",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

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
    try {
      const res = await fetch(`/api/v1/public/ben-lookup?ben=${encodeURIComponent(cleaned)}`);
      const data: BENLookupResponse = await res.json();
      if (!res.ok) {
        setError((data as unknown as { detail?: string })?.detail || "Lookup failed. Please try again.");
      } else {
        setResult(data);
        trackEvent("ben_tracker_result", {
          ben: cleaned,
          found: !!data.found,
          total_frns: data.record?.total_frns ?? 0,
        });
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
                    {result.message || "No USAC records found for this BEN. The entity may have never filed a certified Form 471 or the BEN may be incorrect."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            result.record && <BenResultCard record={result.record} />
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
        </div>
      )}
    </div>
  );
}

function BenResultCard({ record }: { record: BENRecord }) {
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
            <h3 className="text-2xl sm:text-3xl font-bold text-white truncate">{record.applicant_name || `BEN ${record.ben}`}</h3>
            <p className="text-slate-400 mt-1 text-sm">
              BEN {record.ben}
              {record.state ? ` · ${record.state}` : ""}
              {record.entity_type ? ` · ${record.entity_type}` : ""}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Total Committed</p>
            <p className="text-2xl font-bold text-emerald-300">{formatMoney(record.total_committed)}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Total FRNs</p>
            <p className="text-2xl font-bold text-indigo-300">{record.total_frns}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">State</p>
            <p className="text-2xl font-bold text-white">{record.state || "—"}</p>
          </div>
        </div>
      </div>

      {/* FRN List */}
      {record.frns && record.frns.length > 0 && (
        <div className="p-6">
          <h4 className="text-white font-semibold mb-4">Funding Request Numbers ({record.frns.length})</h4>
          <div className="space-y-2">
            {record.frns.map((frn) => {
              const bucket = statusBucket(frn.status);
              const style = STATUS_STYLES[bucket];
              return (
                <div key={frn.frn} className="flex items-center justify-between gap-3 p-3 bg-white/3 border border-white/5 rounded-xl text-sm flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-purple-300 font-mono font-semibold">{frn.frn}</span>
                    {frn.funding_year && <span className="text-slate-500">FY{frn.funding_year}</span>}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {frn.spin_name && (
                      <span className="text-slate-400 text-xs truncate max-w-[140px]">{frn.spin_name}</span>
                    )}
                    <span className="text-emerald-300 font-medium">{formatMoney(frn.commitment_amount)}</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium ${style.bg} ${style.text} ${style.border}`}
                    >
                      {style.icon}
                      {frn.status || "Unknown"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
