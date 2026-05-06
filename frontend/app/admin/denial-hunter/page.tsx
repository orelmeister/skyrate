"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stats = {
  total_leads: number;
  new: number;
  contacted: number;
  replied: number;
  won: number;
  lost: number;
  archived: number;
  total_potential_revenue: number;
  by_appealability: Record<string, number>;
  by_state: { state: string; cnt: number }[];
  by_funding_year: { funding_year: number; cnt: number }[];
  by_category: { denial_category: string; label: string; cnt: number }[];
  last_scan: null | {
    id: number;
    started_at: string;
    finished_at: string | null;
    funding_year: number | null;
    rows_pulled: number;
    rows_inserted: number;
    rows_skipped_dup: number;
    errors_json: string | null;
  };
};

type Lead = {
  id: number;
  ben: string | number | null;
  frn: string | number | null;
  application_number: string | null;
  funding_year: number | null;
  organization_name: string | null;
  state: string | null;
  service_type: string | null;
  requested_amount: number | null;
  fcdl_letter_date: string | null;
  appeal_deadline: string | null;
  denial_category: string | null;
  denial_category_human: string | null;
  appealability: string | null;
  appeal_confidence: number | null;
  scoring_source: string | null;
  cnct_name: string | null;
  cnct_email: string | null;
  cnct_phone: string | null;
  district_domain: string | null;
  scanned_at: string | null;
  outreach_status: string | null;
  notes: string | null;
  updated_at: string | null;
};

type LeadDetail = Lead & {
  fcdl_comment: string | null;
  primary_argument: string | null;
  fcc_precedent: string | null;
  pivot_offer: string | null;
  outreach_angle: string | null;
  supporting_arguments: string[] | null;
  documents_needed: string[] | null;
  cnct_first_name: string | null;
  raw: any;
};

type ScanRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  funding_year: number | null;
  rows_pulled: number;
  rows_inserted: number;
  rows_skipped_dup: number;
  errors_json: string | null;
  errors_count: number;
};

const STATUSES = ["new", "contacted", "replied", "won", "lost", "archived"] as const;
type Status = typeof STATUSES[number];

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  // Primary: Zustand persisted auth store
  try {
    const raw = localStorage.getItem("skyrate-auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      const t = parsed?.state?.token;
      if (typeof t === "string" && t) return t;
    }
  } catch {
    /* ignore */
  }
  // Fallback for any legacy callers
  return localStorage.getItem("access_token");
}

async function dhFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const url = `${API_BASE}/api/v1/admin/denial-hunter${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

function fmtUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function appealColor(level: string | null): string {
  const l = (level || "").toLowerCase();
  if (l === "high") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (l === "medium") return "bg-amber-100 text-amber-800 border-amber-300";
  if (l === "low") return "bg-rose-100 text-rose-800 border-rose-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function statusColor(s: string | null): string {
  switch ((s || "new").toLowerCase()) {
    case "new":
      return "bg-blue-100 text-blue-800";
    case "contacted":
      return "bg-violet-100 text-violet-800";
    case "replied":
      return "bg-amber-100 text-amber-800";
    case "won":
      return "bg-emerald-100 text-emerald-800";
    case "lost":
      return "bg-rose-100 text-rose-800";
    case "archived":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function deadlineColor(deadline: string | null): string {
  const d = daysUntil(deadline);
  if (d == null) return "text-slate-500";
  if (d <= 7) return "text-rose-700 font-semibold";
  if (d <= 14) return "text-amber-700 font-semibold";
  return "text-emerald-700";
}

function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {title ? <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3> : null}
      {children}
    </div>
  );
}

function KPI({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "blue" | "violet" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-900",
    blue: "text-blue-700",
    violet: "text-violet-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  };
  return (
    <Card className="text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${tones[tone]}`}>{value}</div>
    </Card>
  );
}

// Inline donut for appealability split
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) return <div className="text-sm text-slate-500">No data</div>;
  let acc = 0;
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {data.map((d) => {
          const frac = d.value / total;
          const dash = frac * c;
          const offset = -acc * c;
          acc += frac;
          return (
            <circle
              key={d.label}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
            />
          );
        })}
        <text x="60" y="58" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 18, fontWeight: 700 }}>
          {total}
        </text>
        <text x="60" y="76" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>
          leads
        </text>
      </svg>
      <ul className="text-sm space-y-1">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded" style={{ background: d.color }} />
            <span className="capitalize text-slate-700">{d.label}</span>
            <span className="text-slate-500 ml-2">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal bars for top states
function HBars({ data, max }: { data: { label: string; value: number }[]; max: number }) {
  if (data.length === 0) return <div className="text-sm text-slate-500">No data</div>;
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <div className="w-10 text-xs font-mono text-slate-600 text-right">{d.label}</div>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500"
              style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%` }}
            />
          </div>
          <div className="w-8 text-xs text-slate-700 text-right">{d.value}</div>
        </div>
      ))}
    </div>
  );
}

// Mini sparkline for scan runs
function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="text-sm text-slate-500">No runs yet</div>;
  const max = Math.max(...values, 1);
  const w = 220;
  const h = 50;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline fill="none" stroke="#7c3aed" strokeWidth="2" points={pts} />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * h} r="2.5" fill="#7c3aed" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DenialHunterDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  // Auth gate
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in?next=/admin/denial-hunter");
      return;
    }
    if (user?.role !== "admin" && user?.role !== "super") {
      router.push("/");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  // State
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [scanRuns, setScanRuns] = useState<ScanRun[]>([]);
  const [error, setError] = useState<string>("");
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterAppeal, setFilterAppeal] = useState<string>("");
  const [filterState, setFilterState] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Detail panel
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetchers
  const reloadStats = async () => {
    try {
      const s = await dhFetch<Stats>("/stats");
      setStats(s);
    } catch (e: any) {
      setError(e.message || "Failed to load stats");
    }
  };

  const reloadLeads = async () => {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterAppeal) params.set("appealability", filterAppeal);
      if (filterState) params.set("state", filterState);
      if (filterYear) params.set("funding_year", filterYear);
      if (search) params.set("search", search);
      params.set("limit", "200");
      const j = await dhFetch<{ rows: Lead[]; total: number }>(`/leads?${params}`);
      setLeads(j.rows);
      setLeadsTotal(j.total);
    } catch (e: any) {
      setError(e.message || "Failed to load leads");
    } finally {
      setLoadingLeads(false);
    }
  };

  const reloadScans = async () => {
    try {
      const j = await dhFetch<{ rows: ScanRun[] }>("/scan-runs?limit=20");
      setScanRuns(j.rows);
    } catch {
      /* non-fatal */
    }
  };

  // Initial load + auto-refresh stats every 60s
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated) return;
    if (user?.role !== "admin" && user?.role !== "super") return;
    reloadStats();
    reloadScans();
    const t = setInterval(reloadStats, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, isAuthenticated, user]);

  // Reload leads when filters change
  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated) return;
    if (user?.role !== "admin" && user?.role !== "super") return;
    const id = setTimeout(reloadLeads, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterAppeal, filterState, filterYear, search, _hasHydrated, isAuthenticated, user]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const d = await dhFetch<LeadDetail>(`/leads/${id}`);
      setDetail(d);
    } catch (e: any) {
      setError(e.message || "Failed to load lead detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (id: number, newStatus: Status) => {
    // optimistic
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, outreach_status: newStatus } : l)));
    if (detail && detail.id === id) {
      setDetail({ ...detail, outreach_status: newStatus });
    }
    try {
      await dhFetch(`/leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ outreach_status: newStatus }),
      });
      reloadStats();
    } catch (e: any) {
      setError(e.message || "Failed to update status");
      reloadLeads();
    }
  };

  // Derived filter options from current data
  const allStates = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.state && s.add(l.state));
    stats?.by_state.forEach((r) => r.state && s.add(r.state));
    return Array.from(s).sort();
  }, [leads, stats]);

  const allYears = useMemo(() => {
    const s = new Set<number>();
    leads.forEach((l) => l.funding_year && s.add(l.funding_year));
    stats?.by_funding_year.forEach((r) => r.funding_year && s.add(r.funding_year));
    return Array.from(s).sort((a, b) => b - a);
  }, [leads, stats]);

  if (!_hasHydrated || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        Verifying access…
      </div>
    );
  }

  // Donut data
  const donutData = stats
    ? [
        { label: "high", value: stats.by_appealability.high || 0, color: "#10b981" },
        { label: "medium", value: stats.by_appealability.medium || 0, color: "#f59e0b" },
        { label: "low", value: stats.by_appealability.low || 0, color: "#ef4444" },
        { label: "unknown", value: stats.by_appealability.unknown || 0, color: "#94a3b8" },
      ].filter((d) => d.value > 0)
    : [];

  const stateBars = (stats?.by_state || []).slice(0, 10).map((s) => ({
    label: s.state,
    value: s.cnt,
  }));
  const stateMax = stateBars.reduce((m, b) => Math.max(m, b.value), 0);

  const sparkValues = scanRuns
    .slice()
    .reverse()
    .map((r) => r.rows_pulled || 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Denial Hunter</h1>
            <p className="text-xs text-slate-500">
              USAC E-Rate denial monitoring &middot; reads from Hostinger MySQL written by the
              denial-hunter worker
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Logged in as <span className="font-medium text-slate-700">{user?.email}</span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="max-w-7xl mx-auto px-6 mt-4">
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-2 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs underline">
              dismiss
            </button>
          </div>
        </div>
      ) : null}

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPI strip */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPI label="Total Leads" value={stats?.total_leads ?? "—"} />
          <KPI label="New" value={stats?.new ?? "—"} tone="blue" />
          <KPI label="Contacted" value={stats?.contacted ?? "—"} tone="violet" />
          <KPI label="Replied" value={stats?.replied ?? "—"} tone="amber" />
          <KPI label="Won" value={stats?.won ?? "—"} tone="emerald" />
          <KPI
            label="Potential Revenue"
            value={stats ? fmtUSD(stats.total_potential_revenue) : "—"}
          />
        </section>

        {/* Last scan banner */}
        {stats?.last_scan ? (
          <Card className="!py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold text-slate-700">Last scan:</span>
              <span className="text-slate-600">
                started {fmtDateTime(stats.last_scan.started_at)}
              </span>
              <span className="text-slate-600">
                finished {fmtDateTime(stats.last_scan.finished_at)}
              </span>
              <span className="text-slate-600">
                pulled <span className="font-semibold">{stats.last_scan.rows_pulled}</span>
              </span>
              <span className="text-slate-600">
                inserted <span className="font-semibold">{stats.last_scan.rows_inserted}</span>
              </span>
              <span className="text-slate-600">
                skipped {stats.last_scan.rows_skipped_dup}
              </span>
            </div>
          </Card>
        ) : null}

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Appealability Mix">
            <Donut data={donutData} />
          </Card>
          <Card title="Top States">
            <HBars data={stateBars} max={stateMax} />
          </Card>
          <Card title="Scan Volume (last 20 runs)">
            <Sparkline values={sparkValues} />
            <div className="mt-2 text-xs text-slate-500">
              {scanRuns.length} run{scanRuns.length === 1 ? "" : "s"} recorded; latest{" "}
              {scanRuns[0] ? fmtDateTime(scanRuns[0].started_at) : "—"}
            </div>
          </Card>
        </section>

        {/* Filters */}
        <Card title="Leads">
          <div className="flex flex-wrap gap-2 mb-3 text-sm">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterAppeal}
              onChange={(e) => setFilterAppeal(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">All appealability</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">All states</option>
              {allStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">All FYs</option>
              {allYears.map((y) => (
                <option key={y} value={String(y)}>
                  FY{y}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search org / FRN / app # / BEN"
              className="border border-slate-300 rounded-md px-3 py-1.5 bg-white flex-1 min-w-[220px]"
            />
            <div className="ml-auto text-xs text-slate-500 self-center">
              Showing {leads.length} of {leadsTotal}
              {loadingLeads ? " · loading…" : ""}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Organization</th>
                  <th className="py-2 pr-3">ST</th>
                  <th className="py-2 pr-3">FY</th>
                  <th className="py-2 pr-3">Service</th>
                  <th className="py-2 pr-3 text-right">Requested</th>
                  <th className="py-2 pr-3">Appeal</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Deadline</th>
                  <th className="py-2 pr-3">Contact</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-slate-500">
                      {loadingLeads ? "Loading…" : "No leads match these filters."}
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => {
                    const days = daysUntil(l.appeal_deadline);
                    return (
                      <tr
                        key={l.id}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => openDetail(l.id)}
                      >
                        <td className="py-2 pr-3 font-medium text-slate-900 max-w-[260px]">
                          <div className="truncate">{l.organization_name || "—"}</div>
                          <div className="text-xs text-slate-500 truncate">
                            FRN {l.frn || "—"} · App {l.application_number || "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">{l.state || "—"}</td>
                        <td className="py-2 pr-3 text-slate-700">{l.funding_year || "—"}</td>
                        <td className="py-2 pr-3 text-slate-700">{l.service_type || "—"}</td>
                        <td className="py-2 pr-3 text-right text-slate-900 font-mono">
                          {fmtUSD(l.requested_amount)}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${appealColor(
                              l.appealability,
                            )}`}
                            title={
                              l.appeal_confidence != null
                                ? `confidence ${(l.appeal_confidence * 100).toFixed(0)}%`
                                : undefined
                            }
                          >
                            {l.appealability || "?"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          <div className="truncate max-w-[180px]">
                            {l.denial_category_human || l.denial_category || "—"}
                          </div>
                        </td>
                        <td className={`py-2 pr-3 ${deadlineColor(l.appeal_deadline)}`}>
                          {fmtDate(l.appeal_deadline)}
                          {days != null ? (
                            <div className="text-xs">
                              {days < 0 ? `${Math.abs(days)}d past` : `${days}d left`}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-slate-700">
                          {l.cnct_email ? (
                            <a
                              href={`mailto:${l.cnct_email}`}
                              className="text-violet-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {l.cnct_name || l.cnct_email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={(l.outreach_status as Status) || "new"}
                            onChange={(e) => updateStatus(l.id, e.target.value as Status)}
                            className={`text-xs rounded-md border border-slate-300 px-1.5 py-0.5 ${statusColor(
                              l.outreach_status,
                            )}`}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Scan run history */}
        <Card title="Recent Scan Runs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Finished</th>
                  <th className="py-2 pr-3">FY</th>
                  <th className="py-2 pr-3 text-right">Pulled</th>
                  <th className="py-2 pr-3 text-right">Inserted</th>
                  <th className="py-2 pr-3 text-right">Skipped</th>
                  <th className="py-2 pr-3 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {scanRuns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-slate-500">
                      No scan runs recorded yet.
                    </td>
                  </tr>
                ) : (
                  scanRuns.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono text-xs">{r.id}</td>
                      <td className="py-2 pr-3 text-slate-700">{fmtDateTime(r.started_at)}</td>
                      <td className="py-2 pr-3 text-slate-700">{fmtDateTime(r.finished_at)}</td>
                      <td className="py-2 pr-3 text-slate-700">{r.funding_year || "—"}</td>
                      <td className="py-2 pr-3 text-right">{r.rows_pulled}</td>
                      <td className="py-2 pr-3 text-right">{r.rows_inserted}</td>
                      <td className="py-2 pr-3 text-right">{r.rows_skipped_dup}</td>
                      <td
                        className={`py-2 pr-3 text-right ${
                          r.errors_count > 0 ? "text-rose-700 font-semibold" : "text-slate-500"
                        }`}
                      >
                        {r.errors_count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {/* Detail side panel */}
      {detail || detailLoading ? (
        <DetailPanel
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          onStatusChange={(newStatus) => detail && updateStatus(detail.id, newStatus)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail side panel
// ---------------------------------------------------------------------------

function DetailPanel({
  detail,
  loading,
  onClose,
  onStatusChange,
}: {
  detail: LeadDetail | null;
  loading: boolean;
  onClose: () => void;
  onStatusChange: (s: Status) => void;
}) {
  const [copied, setCopied] = useState(false);

  const emailDraft = useMemo(() => {
    if (!detail) return "";
    const name = detail.cnct_first_name || detail.cnct_name || "there";
    const amt = detail.requested_amount ? fmtUSD(detail.requested_amount) : "your funding";
    // Days remaining until appeal deadline
    let deadlineLine = "";
    if (detail.appeal_deadline) {
      const days = Math.ceil((new Date(detail.appeal_deadline).getTime() - Date.now()) / 86400000);
      if (days > 1) deadlineLine = `You only have ${days} days left to appeal (deadline ${fmtDate(detail.appeal_deadline)}) — after that the money is gone.`;
      else if (days === 1) deadlineLine = `You have 1 day left to appeal (deadline ${fmtDate(detail.appeal_deadline)}) — after that the money is gone.`;
      else if (days === 0) deadlineLine = `Your appeal deadline is TODAY (${fmtDate(detail.appeal_deadline)}).`;
      else deadlineLine = `Your appeal window has closed (${fmtDate(detail.appeal_deadline)}) — let's see if there's still a path.`;
    }
    return [
      `Subject: We can help you win back your E-Rate funding (FRN ${detail.frn})`,
      "",
      `Hi ${name},`,
      "",
      `We saw USAC denied your ${amt} E-Rate request. We've helped other schools overturn denials just like this one and get their funding back.`,
      "",
      deadlineLine,
      "",
      `Want to hop on a quick call so we can get you that money before it's too late?`,
      "",
      "Thanks,",
      "Ari",
      "SkyRate",
    ]
      .filter((l) => l !== "")
      .join("\n");
  }, [detail]);

  if (!detail && !loading) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(emailDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex-1 bg-slate-900/40"
      />
      <aside className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
        {loading || !detail ? (
          <div className="p-8 text-slate-500">Loading lead…</div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  FRN {detail.frn} · App {detail.application_number} · BEN {detail.ben}
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {detail.organization_name}
                </h2>
                <div className="text-sm text-slate-600 mt-0.5">
                  {detail.state} · FY{detail.funding_year} · {detail.service_type} ·{" "}
                  <span className="font-semibold">{fmtUSD(detail.requested_amount)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                aria-label="Close panel"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`inline-flex items-center px-2 py-0.5 font-semibold rounded-full border ${appealColor(
                  detail.appealability,
                )}`}
              >
                {detail.appealability || "?"} appealability
                {detail.appeal_confidence != null
                  ? ` · ${(detail.appeal_confidence * 100).toFixed(0)}%`
                  : ""}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {detail.denial_category_human || detail.denial_category || "uncategorized"}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                scored by {detail.scoring_source || "?"}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${deadlineColor(
                detail.appeal_deadline,
              )} bg-slate-50`}>
                Deadline {fmtDate(detail.appeal_deadline)}
              </span>
            </div>

            <Section title="Status">
              <div className="flex items-center gap-3">
                <select
                  value={(detail.outreach_status as Status) || "new"}
                  onChange={(e) => onStatusChange(e.target.value as Status)}
                  className={`text-sm rounded-md border border-slate-300 px-2 py-1 ${statusColor(
                    detail.outreach_status,
                  )}`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">
                  Updated {fmtDateTime(detail.updated_at)}
                </span>
              </div>
            </Section>

            <Section title="FCDL Comment">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {detail.fcdl_comment || "—"}
              </p>
            </Section>

            <Section title="Primary Argument">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {detail.primary_argument || "—"}
              </p>
            </Section>

            {detail.supporting_arguments && detail.supporting_arguments.length > 0 ? (
              <Section title="Supporting Arguments">
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                  {detail.supporting_arguments.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {detail.fcc_precedent ? (
              <Section title="FCC Precedent">
                <p className="text-sm text-slate-700">{detail.fcc_precedent}</p>
              </Section>
            ) : null}

            {detail.pivot_offer ? (
              <Section title="Pivot Offer">
                <p className="text-sm text-slate-700">{detail.pivot_offer}</p>
              </Section>
            ) : null}

            {detail.outreach_angle ? (
              <Section title="Outreach Angle">
                <p className="text-sm text-slate-700">{detail.outreach_angle}</p>
              </Section>
            ) : null}

            {detail.documents_needed && detail.documents_needed.length > 0 ? (
              <Section title="Documents Needed">
                <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                  {detail.documents_needed.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Contact">
              <div className="text-sm text-slate-700 space-y-1">
                <div>{detail.cnct_name || "—"}</div>
                {detail.cnct_email ? (
                  <a className="text-violet-700 hover:underline" href={`mailto:${detail.cnct_email}`}>
                    {detail.cnct_email}
                  </a>
                ) : null}
                {detail.cnct_phone ? <div>{detail.cnct_phone}</div> : null}
                {detail.district_domain ? (
                  <div className="text-xs text-slate-500">
                    domain: {detail.district_domain}
                  </div>
                ) : null}
              </div>
            </Section>

            <Section title="Outreach Email Draft">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <pre className="whitespace-pre-wrap text-xs text-slate-800 font-mono">
                  {emailDraft}
                </pre>
                <button
                  onClick={copy}
                  className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600 text-white hover:bg-violet-700"
                >
                  {copied ? "Copied!" : "Copy to clipboard"}
                </button>
              </div>
            </Section>

            {detail.notes ? (
              <Section title="Notes">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.notes}</p>
              </Section>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{title}</div>
      {children}
    </div>
  );
}

