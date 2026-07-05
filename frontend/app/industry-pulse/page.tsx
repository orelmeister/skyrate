"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/lib/auth-store";
import {
  api,
  type IndustryPulseResponse,
  type IndustryProvider,
  type IndustryConsultant,
} from "@/lib/api";
import {
  ArrowLeft,
  Activity,
  DollarSign,
  Building2,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  MapPin,
  Network,
  Users,
  BarChart3,
  LogOut,
} from "lucide-react";

// ==================== FORMAT HELPERS ====================

function fmtCompactUSD(n: number): string {
  if (!n || n <= 0) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtInt(n: number): string {
  return (n || 0).toLocaleString("en-US");
}

const STATUS_STYLES: Record<string, { label: string; badge: string; bar: string }> = {
  funded: { label: "Funded", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  pending: { label: "Pending", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  denied: { label: "Denied", badge: "bg-red-100 text-red-700", bar: "bg-red-500" },
  cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
};

// ==================== PAGE ====================

function IndustryPulseInner() {
  const router = useRouter();
  const { user, isAuthenticated, logout, _hasHydrated } = useAuthStore();

  // Return to the page the user came from (preserving its ?tab=), falling back
  // to the vendor portal for direct/deep-link entries. /dashboard does not exist.
  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/vendor");
    }
  }, [router]);

  const [year, setYear] = useState<number | undefined>(undefined);
  const [pulse, setPulse] = useState<IndustryPulseResponse | null>(null);
  const [providers, setProviders] = useState<IndustryProvider[]>([]);
  const [consultants, setConsultants] = useState<IndustryConsultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetYear?: number) => {
    setLoading(true);
    setError(null);
    try {
      const [pulseRes, provRes, consRes] = await Promise.all([
        api.getIndustryPulse(targetYear),
        api.getIndustryTopProviders(targetYear, 10),
        api.getIndustryTopConsultants(targetYear, 10),
      ]);

      if (pulseRes.success && pulseRes.data) {
        setPulse(pulseRes.data);
        if (targetYear === undefined) setYear(pulseRes.data.year);
      } else {
        throw new Error(pulseRes.error || "Failed to load industry data");
      }
      setProviders(provRes.success && provRes.data ? provRes.data.providers : []);
      setConsultants(consRes.success && consRes.data ? consRes.data.consultants : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load industry data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (_hasHydrated && isAuthenticated) {
      load(undefined);
    }
  }, [_hasHydrated, isAuthenticated, load]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    load(newYear);
  };

  // Auth guard
  if (_hasHydrated && !isAuthenticated) {
    router.push("/sign-in");
    return null;
  }

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totals = pulse?.totals;
  const statusOrder: Array<keyof NonNullable<IndustryPulseResponse["status_breakdown"]>> = [
    "funded",
    "pending",
    "denied",
    "cancelled",
  ];
  const maxServiceCommitted = pulse?.by_service_type.reduce((m, s) => Math.max(m, s.committed), 0) || 1;
  const maxStateCommitted = pulse?.top_states.reduce((m, s) => Math.max(m, s.committed), 0) || 1;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBack}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Image
                src="/images/logos/logo-icon-transparent.png"
                alt="SkyRate AI"
                width={36}
                height={36}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  Industry Pulse
                </h1>
                <p className="text-sm text-slate-500">Live E-Rate market overview</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden sm:block text-sm text-slate-500">{user.email}</span>
            )}
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-slate-500">
              A snapshot of national E-Rate funding activity, sourced directly from USAC Open Data.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="year-select" className="text-sm font-medium text-slate-600">
              Funding Year
            </label>
            <select
              id="year-select"
              value={year ?? ""}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              disabled={loading || !pulse}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {(pulse?.available_years ?? (year ? [year] : [])).map((y) => (
                <option key={y} value={y}>
                  FY{y}
                </option>
              ))}
            </select>
            <button
              onClick={() => load(year)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && !loading && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button onClick={() => load(year)} className="ml-3 underline font-medium">
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !pulse && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-xl border border-slate-200 bg-white animate-pulse"
              />
            ))}
          </div>
        )}

        {pulse && totals && (
          <>
            {/* Headline stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
                label="Total Committed"
                value={fmtCompactUSD(totals.total_committed)}
                sub={`${fmtInt(totals.funded_frns)} funded FRNs`}
                accent="from-emerald-500 to-teal-500"
              />
              <StatCard
                icon={<Building2 className="w-5 h-5 text-purple-600" />}
                label="Applicants Funded"
                value={fmtInt(totals.applicants)}
                sub="unique billed entities"
                accent="from-purple-500 to-pink-500"
              />
              <StatCard
                icon={<CheckCircle2 className="w-5 h-5 text-blue-600" />}
                label="Funded Rate"
                value={`${totals.funded_pct.toFixed(1)}%`}
                sub={`of ${fmtInt(totals.total_frns)} total FRNs`}
                accent="from-blue-500 to-indigo-500"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5 text-amber-600" />}
                label="Funding Year"
                value={`FY${pulse.year}`}
                sub={
                  pulse.status_breakdown.pending.frns > pulse.status_breakdown.funded.frns
                    ? "Mid-cycle (in review)"
                    : "Reporting complete"
                }
                accent="from-amber-500 to-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Status breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Application Status Breakdown
                  </h2>
                </div>
                <div className="space-y-4">
                  {statusOrder.map((key) => {
                    const bucket = pulse.status_breakdown[key];
                    const style = STATUS_STYLES[key];
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-xs font-medium ${style.badge}`}
                            >
                              {style.label}
                            </span>
                            <span className="text-slate-500">{fmtInt(bucket.frns)} FRNs</span>
                          </span>
                          <span className="font-medium text-slate-700">
                            {fmtCompactUSD(bucket.committed)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${style.bar}`}
                            style={{ width: `${Math.min(bucket.pct_of_frns, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Service types */}
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Network className="w-5 h-5 text-purple-600" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Committed by Service Type
                  </h2>
                </div>
                {pulse.by_service_type.length === 0 ? (
                  <p className="text-sm text-slate-400">No service-type data for this year yet.</p>
                ) : (
                  <div className="space-y-4">
                    {pulse.by_service_type.map((s) => (
                      <div key={s.service_type}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-700">{s.service_type}</span>
                          <span className="font-medium text-slate-700">
                            {fmtCompactUSD(s.committed)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600"
                            style={{ width: `${(s.committed / maxServiceCommitted) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top states */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Top States by Committed Funding
                </h2>
              </div>
              {pulse.top_states.length === 0 ? (
                <p className="text-sm text-slate-400">No state data for this year yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {pulse.top_states.map((st, idx) => (
                    <div key={st.state} className="flex items-center gap-3">
                      <span className="w-6 text-xs font-semibold text-slate-400">
                        {idx + 1}
                      </span>
                      <span className="w-10 font-semibold text-slate-700">{st.state}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${(st.committed / maxStateCommitted) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-sm font-medium text-slate-700">
                        {fmtCompactUSD(st.committed)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tables: providers + consultants */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RankTable
                icon={<Network className="w-5 h-5 text-purple-600" />}
                title="Top Service Providers"
                emptyText="No provider data for this year yet."
                nameHeader="Provider"
                rows={providers.map((p) => ({
                  rank: p.rank,
                  name: p.spin_name,
                  committed: p.committed,
                  frns: p.frns,
                }))}
              />
              <RankTable
                icon={<Users className="w-5 h-5 text-purple-600" />}
                title="Top Consultants"
                emptyText="No consultant data for this year yet."
                nameHeader="Consultant"
                rows={consultants.map((c) => ({
                  rank: c.rank,
                  name: c.name,
                  committed: c.committed,
                  frns: c.frns,
                }))}
              />
            </div>

            <p className="mt-8 text-xs text-slate-400">
              Source: USAC E-Rate Open Data (Form 471 commitments). Figures are aggregated across
              all applicants nationwide and cached for performance. FY{pulse.year} totals update as
              USAC processes applications.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

function RankTable({
  icon,
  title,
  emptyText,
  nameHeader,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  emptyText: string;
  nameHeader: string;
  rows: Array<{ rank: number; name: string; committed: number; frns: number }>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">{nameHeader}</th>
                <th className="py-2 px-2 text-right">Committed</th>
                <th className="py-2 pl-2 text-right">FRNs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.name}`} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-2 text-slate-400 font-semibold">{r.rank}</td>
                  <td className="py-2 pr-2 text-slate-700 font-medium">{r.name}</td>
                  <td className="py-2 px-2 text-right font-semibold text-slate-900">
                    {fmtCompactUSD(r.committed)}
                  </td>
                  <td className="py-2 pl-2 text-right text-slate-500">{fmtInt(r.frns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function IndustryPulsePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <IndustryPulseInner />
    </Suspense>
  );
}
