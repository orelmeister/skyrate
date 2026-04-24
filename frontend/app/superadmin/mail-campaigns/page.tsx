"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

// -----------------------------------------------------------------------------
// Types (shape matches backend /api/v1/mail/* responses)
// -----------------------------------------------------------------------------

type TierFunnelRow = {
  tier: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  unsubbed: number;
  open_pct: number;
  click_pct: number;
  reply_pct: number;
  unsub_pct: number;
};

type SenderHealth = {
  from_email: string;
  window_sends: number;
  window_bounces: number;
  bounce_pct: number;
  status?: string;
  updated_at?: string;
};

type SuppressionRow = {
  email: string;
  reason: string;
  source: string | null;
  created_at: string;
};

type CampaignReport = {
  id: number;
  created_at: string;
  report_type: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  // payload is arbitrary analyst JSON — we pretty-render whatever is inside
  payload: unknown;
};

type BudgetDay = {
  day: string;
  spend_usd: number;
  tokens_in: number;
  tokens_out: number;
  calls: number;
};

type DmarcFinding = {
  id: number;
  status: string;
  severity: string | null;
  title: string | null;
  recommendation: unknown;
  created_at: string;
  approved_at: string | null;
  admin_email: string | null;
};

type Experiment = {
  id: number;
  name: string | null;
  hypothesis: string | null;
  variant: string | null;
  metric: string | null;
  status: string;
  created_at: string;
  approved_at: string | null;
  admin_email: string | null;
  payload: unknown;
};

const TABS = ["live", "deliverability", "funnel", "suppression", "llm", "review"] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  live: "Live",
  deliverability: "Deliverability",
  funnel: "Funnel",
  suppression: "Suppression",
  llm: "LLM Insights",
  review: "Experiments & DMARC",
};

// -----------------------------------------------------------------------------
// Lightweight API helper (scoped to this page — no global api.ts changes)
// -----------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function mailFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const url = `${API_BASE}/api/v1/mail${path}`;
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

// -----------------------------------------------------------------------------
// Visual helpers
// -----------------------------------------------------------------------------

function healthColor(pct: number): string {
  if (pct < 1) return "bg-emerald-500";
  if (pct < 3) return "bg-amber-500";
  return "bg-rose-500";
}

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {title ? <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3> : null}
      {children}
    </div>
  );
}

function Badge({ kind, children }: { kind: "green" | "amber" | "rose" | "slate" | "purple"; children: React.ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    slate: "bg-slate-100 text-slate-700",
    purple: "bg-purple-100 text-purple-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${map[kind]}`}>
      {children}
    </span>
  );
}

function severityBadge(sev: string | null) {
  const s = (sev || "").toLowerCase();
  if (s === "critical" || s === "high") return <Badge kind="rose">{sev}</Badge>;
  if (s === "medium") return <Badge kind="amber">{sev}</Badge>;
  if (s === "low") return <Badge kind="green">{sev}</Badge>;
  return <Badge kind="slate">{sev || "info"}</Badge>;
}

// Simple horizontal bar used for hourly volume, funnel %, and budget spend
function Bar({ value, max, color = "bg-purple-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main page component
// -----------------------------------------------------------------------------

export default function MailCampaignsPage() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();
  const [tab, setTab] = useState<Tab>("live");
  const [authError, setAuthError] = useState<string>("");

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in?next=/superadmin/mail-campaigns");
      return;
    }
    if (user?.role !== "admin" && user?.role !== "super") {
      router.push("/");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  if (!_hasHydrated || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-600 text-sm">Loading&hellip;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/super" className="text-slate-500 hover:text-slate-900 text-sm">
              &larr; Super
            </Link>
            <span className="font-semibold text-slate-900">Mail Campaigns</span>
            <Badge kind="purple">mail.skyrate.ai</Badge>
          </div>
          <span className="text-xs text-slate-500">{user?.email}</span>
        </div>
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                tab === t
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {authError ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3 rounded-lg">
            {authError}
          </div>
        ) : null}
        {tab === "live" && <LiveTab onError={setAuthError} />}
        {tab === "deliverability" && <DeliverabilityTab onError={setAuthError} />}
        {tab === "funnel" && <FunnelTab onError={setAuthError} />}
        {tab === "suppression" && <SuppressionTab onError={setAuthError} />}
        {tab === "llm" && <LlmTab onError={setAuthError} />}
        {tab === "review" && <ReviewTab onError={setAuthError} />}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab 1 — Live
// -----------------------------------------------------------------------------

interface TabProps {
  onError: (msg: string) => void;
}

function LiveTab({ onError }: TabProps) {
  const [data, setData] = useState<{
    sends_by_tier_24h: Array<{ tier: string; status: string; cnt: number }>;
    hourly_24h: Array<{ hour: string; sent: number }>;
    sender_health: SenderHealth[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await mailFetch<typeof data>("/live");
        if (alive) setData(d);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [onError]);

  if (loading) return <p className="text-slate-500 text-sm">Loading live stats&hellip;</p>;
  if (!data) return <p className="text-slate-500 text-sm">No data.</p>;

  const maxHour = Math.max(1, ...data.hourly_24h.map((h) => h.sent));
  const tierTotals = data.sends_by_tier_24h.reduce<Record<string, number>>((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + r.cnt;
    return acc;
  }, {});
  const totalSends = Object.values(tierTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card title="24h Total" className="lg:col-span-1">
        <p className="text-4xl font-bold text-slate-900">{totalSends.toLocaleString()}</p>
        <p className="text-xs text-slate-500 mt-1">emails sent</p>
        <div className="mt-4 space-y-1">
          {Object.entries(tierTotals).map(([tier, n]) => (
            <div key={tier} className="flex justify-between text-sm">
              <span className="text-slate-600 capitalize">{tier}</span>
              <span className="font-semibold text-slate-900">{n.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Hourly Volume (last 24h)" className="lg:col-span-2">
        <div className="space-y-2">
          {data.hourly_24h.map((h) => (
            <div key={h.hour} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-32 flex-shrink-0 font-mono">{h.hour}</span>
              <div className="flex-1">
                <Bar value={h.sent} max={maxHour} />
              </div>
              <span className="text-xs font-semibold text-slate-700 w-10 text-right">{h.sent}</span>
            </div>
          ))}
          {data.hourly_24h.length === 0 && <p className="text-sm text-slate-500">No sends in the last 24h.</p>}
        </div>
      </Card>

      <Card title="Sender Health" className="lg:col-span-3">
        {data.sender_health.length === 0 ? (
          <p className="text-sm text-slate-500">sender_health table not available yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.sender_health.map((s) => (
              <div key={s.from_email} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 break-all">{s.from_email}</span>
                  <span className={`w-3 h-3 rounded-full ${healthColor(s.bounce_pct)}`}></span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Sends</p>
                    <p className="font-semibold text-slate-800">{s.window_sends}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Bounces</p>
                    <p className="font-semibold text-slate-800">{s.window_bounces}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Rate</p>
                    <p className="font-semibold text-slate-800">{s.bounce_pct}%</p>
                  </div>
                </div>
                {s.status ? (
                  <p className="mt-2 text-xs text-slate-500">status: {s.status}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab 2 — Deliverability
// -----------------------------------------------------------------------------

function DeliverabilityTab({ onError }: TabProps) {
  const [data, setData] = useState<{
    trailing_by_tier: Array<{ tier: string; total: number; bounces: number; bounce_pct: number }>;
    dmarc_7d: { available: boolean; total?: number; spf_alignment_pct?: number; dkim_alignment_pct?: number };
    failing_source_ips: Array<{ source_ip: string; volume: number; spf_pass: number; dkim_pass: number }>;
    sender_health: SenderHealth[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await mailFetch<typeof data>("/deliverability");
        setData(d);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <p className="text-slate-500 text-sm">Loading&hellip;</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card title="Trailing-200 Bounce Rate by Tier">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase">
                <th className="py-1">Tier</th>
                <th className="py-1">Sends</th>
                <th className="py-1">Bounces</th>
                <th className="py-1">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.trailing_by_tier.map((r) => (
                <tr key={r.tier} className="border-t border-slate-100">
                  <td className="py-2 capitalize">{r.tier}</td>
                  <td className="py-2">{r.total}</td>
                  <td className="py-2">{r.bounces}</td>
                  <td className="py-2">
                    <Badge kind={r.bounce_pct < 1 ? "green" : r.bounce_pct < 3 ? "amber" : "rose"}>
                      {r.bounce_pct}%
                    </Badge>
                  </td>
                </tr>
              ))}
              {data.trailing_by_tier.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-slate-500 text-sm">
                    No tier data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="DMARC Alignment (7d)">
          {data.dmarc_7d.available ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Messages reported: <span className="font-semibold text-slate-800">{data.dmarc_7d.total?.toLocaleString() ?? 0}</span>
              </p>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">SPF alignment</span>
                  <span className="font-semibold">{data.dmarc_7d.spf_alignment_pct ?? 0}%</span>
                </div>
                <Bar value={data.dmarc_7d.spf_alignment_pct ?? 0} max={100} color="bg-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">DKIM alignment</span>
                  <span className="font-semibold">{data.dmarc_7d.dkim_alignment_pct ?? 0}%</span>
                </div>
                <Bar value={data.dmarc_7d.dkim_alignment_pct ?? 0} max={100} color="bg-indigo-500" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No DMARC aggregate data yet.</p>
          )}
        </Card>
      </div>

      <Card title="Failing Source IPs (7d)">
        {data.failing_source_ips.length === 0 ? (
          <p className="text-sm text-slate-500">No failing source IPs.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 text-xs uppercase">
                <th className="py-1">Source IP</th>
                <th className="py-1">Volume</th>
                <th className="py-1">SPF pass</th>
                <th className="py-1">DKIM pass</th>
              </tr>
            </thead>
            <tbody>
              {data.failing_source_ips.map((r) => (
                <tr key={r.source_ip} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs">{r.source_ip}</td>
                  <td className="py-2">{r.volume}</td>
                  <td className="py-2">{r.spf_pass}</td>
                  <td className="py-2">{r.dkim_pass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab 3 — Funnel
// -----------------------------------------------------------------------------

function FunnelTab({ onError }: TabProps) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ days: number; funnel: TierFunnelRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const d = await mailFetch<typeof data>(`/funnel?days=${days}`);
        setData(d);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [days, onError]);

  const maxSent = useMemo(() => Math.max(1, ...(data?.funnel || []).map((r) => r.sent)), [data]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Window:</span>
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 text-sm rounded-md border transition ${
              days === d
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm">Loading&hellip;</p>
      ) : !data || data.funnel.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No sends in window.</p></Card>
      ) : (
        <div className="space-y-4">
          {data.funnel.map((r) => (
            <Card key={r.tier}>
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="text-lg font-semibold text-slate-900 capitalize">{r.tier}</h4>
                <span className="text-xs text-slate-500">{r.sent.toLocaleString()} sent</span>
              </div>
              <FunnelRow label="Sent"     value={r.sent}     max={maxSent} color="bg-slate-400" pct={null} />
              <FunnelRow label="Opened"   value={r.opened}   max={maxSent} color="bg-indigo-500" pct={r.open_pct} />
              <FunnelRow label="Clicked"  value={r.clicked}  max={maxSent} color="bg-purple-500" pct={r.click_pct} />
              <FunnelRow label="Replied"  value={r.replied}  max={maxSent} color="bg-emerald-500" pct={r.reply_pct} />
              <FunnelRow label="Unsubbed" value={r.unsubbed} max={maxSent} color="bg-rose-500"   pct={r.unsub_pct} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelRow({
  label, value, max, color, pct,
}: { label: string; value: number; max: number; color: string; pct: number | null }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-slate-600 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1">
        <Bar value={value} max={max} color={color} />
      </div>
      <span className="text-xs font-semibold text-slate-800 w-16 text-right">
        {value.toLocaleString()}
        {pct !== null ? <span className="text-slate-400 ml-1">({pct}%)</span> : null}
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab 4 — Suppression
// -----------------------------------------------------------------------------

function SuppressionTab({ onError }: TabProps) {
  const [reason, setReason] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [data, setData] = useState<{
    total: number;
    items: SuppressionRow[];
    reasons: Array<{ reason: string; cnt: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (reason) qs.set("reason", reason);
        const d = await mailFetch<typeof data>(`/suppression?${qs.toString()}`);
        setData(d);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [reason, offset, onError]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-600">Reason:</label>
        <select
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setOffset(0);
          }}
          className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white"
        >
          <option value="">All</option>
          {data?.reasons.map((r) => (
            <option key={r.reason} value={r.reason}>
              {r.reason} ({r.cnt})
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500 ml-auto">
          {data ? `${data.total.toLocaleString()} total` : ""}
        </span>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading&hellip;</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-slate-500">No suppressed addresses.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase">
                  <th className="py-1">Email</th>
                  <th className="py-1">Reason</th>
                  <th className="py-1">Source</th>
                  <th className="py-1">Added</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="border-t border-slate-100">
                    <td className="py-2 font-mono text-xs break-all">{r.email}</td>
                    <td className="py-2"><Badge kind="slate">{r.reason}</Badge></td>
                    <td className="py-2 text-slate-600">{r.source || "—"}</td>
                    <td className="py-2 text-xs text-slate-500">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && data.total > limit ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            disabled={offset === 0}
            className="px-3 py-1 text-sm border border-slate-200 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            {offset + 1} &ndash; {Math.min(offset + limit, data.total)}
          </span>
          <button
            onClick={() => setOffset((o) => o + limit)}
            disabled={offset + limit >= data.total}
            className="px-3 py-1 text-sm border border-slate-200 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tab 5 — LLM Insights
// -----------------------------------------------------------------------------

function LlmTab({ onError }: TabProps) {
  const [data, setData] = useState<{
    reports: CampaignReport[];
    budget_7d: BudgetDay[];
    daily_budget_ceiling_usd: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await mailFetch<typeof data>("/llm-insights");
        setData(d);
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  if (loading) return <p className="text-sm text-slate-500">Loading&hellip;</p>;
  if (!data) return null;

  const ceiling = data.daily_budget_ceiling_usd;
  const maxSpend = Math.max(ceiling, ...data.budget_7d.map((d) => Number(d.spend_usd) || 0));

  return (
    <div className="space-y-5">
      <Card title={`Daily LLM Spend (7d, ceiling $${ceiling.toFixed(2)})`}>
        {data.budget_7d.length === 0 ? (
          <p className="text-sm text-slate-500">No LLM spend recorded in the last 7 days.</p>
        ) : (
          <div className="space-y-2">
            {data.budget_7d.map((d) => {
              const spend = Number(d.spend_usd) || 0;
              const overCeiling = spend > ceiling;
              return (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-28 font-mono">{d.day}</span>
                  <div className="flex-1 relative">
                    <Bar value={spend} max={maxSpend} color={overCeiling ? "bg-rose-500" : "bg-indigo-500"} />
                    {/* ceiling marker */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-rose-400"
                      style={{ left: `${Math.min(100, (ceiling / maxSpend) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 w-20 text-right">
                    ${spend.toFixed(3)}
                  </span>
                  <span className="text-xs text-slate-500 w-16 text-right">{d.calls} calls</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Nightly Analyst Reports (last 30)</h3>
        {data.reports.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No campaign_reports rows yet.</p></Card>
        ) : (
          <div className="space-y-3">
            {data.reports.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge kind="purple">{r.report_type}</Badge>
                    {r.model ? <span className="text-xs text-slate-500">{r.model}</span> : null}
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
                </div>
                <ReportBody payload={r.payload} />
                <div className="mt-2 text-xs text-slate-500 flex gap-4">
                  <span>tokens in: {r.tokens_in ?? 0}</span>
                  <span>tokens out: {r.tokens_out ?? 0}</span>
                  <span>cost: ${(Number(r.cost_usd) || 0).toFixed(4)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportBody({ payload }: { payload: unknown }) {
  let parsed: unknown = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      /* keep as string */
    }
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const findings = obj.key_findings || obj.findings;
    const recs = obj.recommendations;
    if (Array.isArray(findings) || Array.isArray(recs)) {
      return (
        <div className="space-y-2 text-sm">
          {Array.isArray(findings) && findings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Key findings</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                {(findings as unknown[]).map((f, i) => (
                  <li key={i}>{typeof f === "string" ? f : JSON.stringify(f)}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(recs) && recs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Recommendations</p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                {(recs as unknown[]).map((r, i) => (
                  <li key={i}>{typeof r === "string" ? r : JSON.stringify(r)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
  }
  return (
    <pre className="text-xs bg-slate-50 border border-slate-100 rounded p-2 overflow-x-auto max-h-64">
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

// -----------------------------------------------------------------------------
// Tab 6 — Experiments & DMARC review
// -----------------------------------------------------------------------------

function ReviewTab({ onError }: TabProps) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [findings, setFindings] = useState<DmarcFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ex, dm] = await Promise.all([
        mailFetch<{ items: Experiment[] }>("/experiments"),
        mailFetch<{ findings: DmarcFinding[] }>("/dmarc"),
      ]);
      setExperiments(ex.items || []);
      setFindings(dm.findings || []);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    reload();
  }, [reload]);

  const act = async (kind: "dmarc" | "experiments", id: number, action: "approve" | "reject") => {
    try {
      await mailFetch(`/${kind}/${id}/${action}`, { method: "POST" });
      await reload();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const pendingExperiments = experiments.filter((e) => e.status === "pending");
  const otherExperiments = experiments.filter((e) => e.status !== "pending");
  const pendingFindings = findings.filter((f) => f.status === "pending");
  const otherFindings = findings.filter((f) => f.status !== "pending");

  if (loading) return <p className="text-sm text-slate-500">Loading&hellip;</p>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Pending Experiments ({pendingExperiments.length})</h3>
        {pendingExperiments.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No pending experiments.</p></Card>
        ) : (
          <div className="space-y-3">
            {pendingExperiments.map((e) => (
              <ExperimentCard key={e.id} item={e} onAct={(a) => act("experiments", e.id, a)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Pending DMARC Findings ({pendingFindings.length})</h3>
        {pendingFindings.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No pending findings.</p></Card>
        ) : (
          <div className="space-y-3">
            {pendingFindings.map((f) => (
              <DmarcCard key={f.id} item={f} onAct={(a) => act("dmarc", f.id, a)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-sm text-purple-700 hover:text-purple-900 font-medium"
        >
          {showHistory ? "Hide" : "Show"} history ({otherExperiments.length + otherFindings.length})
        </button>
        {showHistory && (
          <div className="mt-3 space-y-3">
            {otherExperiments.map((e) => (
              <ExperimentCard key={`h-e-${e.id}`} item={e} />
            ))}
            {otherFindings.map((f) => (
              <DmarcCard key={`h-d-${f.id}`} item={f} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ExperimentCard({ item, onAct }: { item: Experiment; onAct?: (a: "approve" | "reject") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge kind={statusKind(item.status)}>{item.status}</Badge>
            <h4 className="text-sm font-semibold text-slate-900">{item.name || `Experiment #${item.id}`}</h4>
          </div>
          {item.hypothesis && <p className="text-sm text-slate-700">Hypothesis: {item.hypothesis}</p>}
          {item.variant && <p className="text-xs text-slate-600 mt-1">Variant: {item.variant}</p>}
          {item.metric && <p className="text-xs text-slate-600">Metric: {item.metric}</p>}
          <p className="text-xs text-slate-500 mt-1">Created {formatDate(item.created_at)}</p>
          {item.approved_at && (
            <p className="text-xs text-slate-500">
              {item.status} by {item.admin_email || "?"} at {formatDate(item.approved_at)}
            </p>
          )}
          {open && (
            <pre className="mt-2 text-xs bg-slate-50 border border-slate-100 rounded p-2 overflow-x-auto max-h-64">
              {JSON.stringify(item.payload, null, 2)}
            </pre>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {onAct ? (
            <>
              <button
                onClick={() => onAct("approve")}
                className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                onClick={() => onAct("reject")}
                className="px-3 py-1 bg-rose-600 text-white text-xs font-semibold rounded-md hover:bg-rose-700"
              >
                Reject
              </button>
            </>
          ) : null}
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-200"
          >
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function DmarcCard({ item, onAct }: { item: DmarcFinding; onAct?: (a: "approve" | "reject") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge kind={statusKind(item.status)}>{item.status}</Badge>
            {severityBadge(item.severity)}
            <h4 className="text-sm font-semibold text-slate-900">{item.title || `Finding #${item.id}`}</h4>
          </div>
          <p className="text-xs text-slate-500 mt-1">Detected {formatDate(item.created_at)}</p>
          {item.approved_at && (
            <p className="text-xs text-slate-500">
              {item.status} by {item.admin_email || "?"} at {formatDate(item.approved_at)}
            </p>
          )}
          {open && (
            <pre className="mt-2 text-xs bg-slate-50 border border-slate-100 rounded p-2 overflow-x-auto max-h-64">
              {JSON.stringify(item.recommendation, null, 2)}
            </pre>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          {onAct ? (
            <>
              <button
                onClick={() => onAct("approve")}
                className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                onClick={() => onAct("reject")}
                className="px-3 py-1 bg-rose-600 text-white text-xs font-semibold rounded-md hover:bg-rose-700"
              >
                Reject
              </button>
            </>
          ) : null}
          <button
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-200"
          >
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function statusKind(s: string): "green" | "amber" | "rose" | "slate" | "purple" {
  if (s === "approved" || s === "applied") return "green";
  if (s === "pending") return "amber";
  if (s === "rejected") return "rose";
  if (s === "running") return "purple";
  return "slate";
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}
