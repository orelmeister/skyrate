"use client";

import React, { useState, useEffect, useMemo, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";
import { api, FrnTracking, FRNWatch } from "@/lib/api";
import { useTabParam } from "@/hooks/useTabParam";
import { downloadCsv, csvFilename } from "@/lib/csv-export";
import { TableExportBar } from "@/components/TableExportBar";
import { FrnSubStatusInfo, FRN_PENDING_REASON_OPTIONS } from "@/components/FrnSubStatusInfo";
import MissingIdentifierBanner from "@/components/MissingIdentifierBanner";
import { Home, FileText, Activity, Coins, Scale, Bell, Search, PanelLeft, Sun, Moon, LogOut, HelpCircle, ChevronRight, BadgeCheck, Building2, Settings, Send, PauseCircle, PlayCircle, Trash2 } from "lucide-react";

const APPLICANT_TABS = ["overview", "frns", "appeals", "changes", "frn-status", "disbursements"] as const;
type ApplicantTab = typeof APPLICANT_TABS[number];

/**
 * Applicant Dashboard
 * 
 * "boom he sees all the information ready for him about all of his denials everything"
 * 
 * This dashboard shows:
 * - All FRNs and their statuses
 * - Denials with auto-generated appeals
 * - Deadlines and alerts
 * - Recent changes
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface FRN {
  id: number;
  frn: string;
  application_number: string;
  funding_year: number;
  status: string;
  status_type: string;
  service_type: string;
  service_description?: string | null;
  amount_requested: number | null;
  amount_funded: number | null;
  amount_disbursed?: number | null;
  discount_rate?: number | null;
  is_denied: boolean;
  denial_reason: string | null;
  review_stage?: string | null;
  disbursement_status?: string | null;
  appeal_deadline: string | null;
  days_in_review: number | null;
}

interface Appeal {
  id: number;
  frn: string;
  funding_year: number;
  denial_reason: string;
  denial_category: string;
  appeal_letter: string;
  success_probability: number | null;
  status: string;
  appeal_deadline: string | null;
  days_until_deadline: number | null;
}

interface StatusChange {
  id: number;
  frn: string;
  change_type: string;
  previous_value: string | null;
  new_value: string;
  description: string;
  is_important: boolean;
  is_read: boolean;
  changed_at: string;
}

interface DashboardData {
  profile: {
    ben: string;
    organization_name: string;
    state: string;
    city: string;
    sync_status: string;
    last_sync_at: string | null;
    stats: {
      total_applications: number;
      total_funded: number;
      total_pending: number;
      total_denied: number;
      active_appeals_count: number;
      pending_deadlines_count: number;
    };
  };
  frns: FRN[];
  appeals: Appeal[];
  recent_changes: StatusChange[];
  summary: {
    total_frns: number;
    funded_count: number;
    pending_count: number;
    denied_count: number;
    total_funded_amount: number;
    total_pending_amount: number;
    total_denied_amount: number;
    appeals_ready: number;
    urgent_deadlines: number;
    unread_changes: number;
    sync_status: string;
    last_sync: string | null;
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// ApplicantCommandCenter
// Dark/light bento "command center" home for the applicant portal. Mirrors the
// consultant/vendor dashboard-revamp concept: greeting, funded-rate ring,
// funding-at-a-glance bars, applications summary, a "needs your attention"
// queue, recent activity, denials & appeals, and quick actions. Wired entirely
// to the applicant's real dashboard data (no placeholder metrics).
// ---------------------------------------------------------------------------
function ApplicantCommandCenter({
  profile, summary, frns, appeals, changes, dark,
  isDemoAccount, onReplaceBen, onTab, onOpenAppeal, formatCurrency, formatDate,
}: {
  profile: DashboardData["profile"];
  summary: DashboardData["summary"];
  frns: FRN[];
  appeals: Appeal[];
  changes: StatusChange[];
  dark: boolean;
  isDemoAccount: boolean;
  onReplaceBen: () => void;
  onTab: (t: ApplicantTab) => void;
  onOpenAppeal: (a: Appeal) => void;
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const org = profile.organization_name || "there";
  const totalFrns = summary.total_frns || 0;
  const funded = summary.funded_count || 0;
  const pending = summary.pending_count || 0;
  const denied = summary.denied_count || 0;
  const fundedPct = totalFrns > 0 ? Math.round((funded / totalFrns) * 100) : 0;
  const fundedAmt = summary.total_funded_amount || 0;
  const pendingAmt = summary.total_pending_amount || 0;
  const deniedAmt = summary.total_denied_amount || 0;
  const amtMax = Math.max(fundedAmt, pendingAmt, deniedAmt, 1);

  const attention: { key: string; label: string; sub: string; tone: "red" | "amber" | "blue"; tab: ApplicantTab }[] = [];
  if (denied > 0) attention.push({ key: "den", label: `${denied} denied FRN${denied !== 1 ? "s" : ""}`, sub: "Review and submit appeals", tone: "red", tab: "appeals" });
  if (summary.urgent_deadlines > 0) attention.push({ key: "urg", label: `${summary.urgent_deadlines} appeal deadline${summary.urgent_deadlines !== 1 ? "s" : ""} approaching`, sub: "File before the window closes", tone: "red", tab: "appeals" });
  if (summary.appeals_ready > 0) attention.push({ key: "rdy", label: `${summary.appeals_ready} appeal${summary.appeals_ready !== 1 ? "s" : ""} ready to send`, sub: "AI-drafted and waiting for review", tone: "amber", tab: "appeals" });
  if (pending > 0) attention.push({ key: "pen", label: `${pending} application${pending !== 1 ? "s" : ""} pending`, sub: "Monitor USAC review status", tone: "blue", tab: "frn-status" });
  if (summary.unread_changes > 0) attention.push({ key: "upd", label: `${summary.unread_changes} new update${summary.unread_changes !== 1 ? "s" : ""}`, sub: "Changes since your last visit", tone: "blue", tab: "changes" });

  const R = 34, CIRC = 2 * Math.PI * R;
  const ringPct = fundedPct / 100;
  const ringTrack = dark ? "#1e293b" : "#e2e8f0";

  const container = dark ? "bg-[#0a0a16] border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-900";
  const card = dark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const faint = dark ? "text-slate-500" : "text-slate-400";
  const link = dark ? "text-purple-300 hover:text-purple-200" : "text-purple-600 hover:text-purple-700";
  const rowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const softRow = dark ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-50 border-slate-200";
  const track = dark ? "bg-slate-800" : "bg-slate-100";
  const qaBtn = dark ? "bg-slate-900/60 border-slate-800 hover:border-purple-500/40 hover:bg-slate-800/60 text-slate-300 hover:text-white" : "bg-white border-slate-200 hover:border-purple-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm";
  const qaIcon = dark ? "bg-slate-800 text-purple-300" : "bg-slate-100 text-purple-600";
  const strong = dark ? "text-slate-200 font-medium" : "text-slate-800 font-medium";
  const toneCls = (t: string) => t === "red" ? "bg-red-500/20 text-red-500" : t === "amber" ? "bg-amber-500/20 text-amber-600" : "bg-sky-500/20 text-sky-500";

  const topFrns = [...frns]
    .sort((a, b) => (b.amount_funded || b.amount_requested || 0) - (a.amount_funded || a.amount_requested || 0))
    .slice(0, 5);

  return (
    <div className={`rounded-3xl border p-6 md:p-8 shadow-2xl ${container}`}>
      {/* Greeting header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold">{greeting}, <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{org}</span></h1>
          <div className={`mt-2 flex flex-wrap items-center gap-2 text-sm ${muted}`}>
            <span className={`font-mono rounded px-2 py-0.5 ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>BEN: {profile.ben}</span>
            {isDemoAccount && (
              <button onClick={onReplaceBen} className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition ${dark ? "text-amber-300 border-amber-400/40 hover:bg-amber-500/10" : "text-amber-600 border-amber-300 hover:bg-amber-50"}`} title="Replace this BEN with a different one (test/demo accounts only)">Replace</button>
            )}
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{profile.state || "—"} · E-Rate Applicant</span>
          </div>
          <p className={`mt-2 text-sm ${muted}`}>You track <span className={strong}>{totalFrns}</span> FRN{totalFrns !== 1 ? "s" : ""} — <span className={strong}>{funded}</span> funded, <span className={strong}>{formatCurrency(fundedAmt)}</span> committed.</p>
        </div>
        <Link href="/settings/bens" className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-1.5">Manage BENs <ChevronRight className="w-4 h-4" /></Link>
      </div>

      {/* Top bento row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className={`flex items-center gap-2 text-sm mb-3 ${muted}`}><BadgeCheck className="w-4 h-4" /> Funded rate</div>
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={R} fill="none" stroke={ringTrack} strokeWidth="8" />
                <circle cx="48" cy="48" r={R} fill="none" stroke="url(#acRing)" strokeWidth="8" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - ringPct)} transform="rotate(-90 48 48)" />
                <defs><linearGradient id="acRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#ec4899" /></linearGradient></defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold">{fundedPct}%</span></div>
            </div>
            <div className="min-w-0 text-sm space-y-1 flex-1">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className={muted}>Funded</span><span className="font-semibold ml-auto">{funded}</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className={muted}>Pending</span><span className="font-semibold ml-auto">{pending}</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /><span className={muted}>Denied</span><span className="font-semibold ml-auto">{denied}</span></div>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className={`flex items-center gap-2 text-sm mb-3 ${muted}`}><Coins className="w-4 h-4" /> Funding at a glance</div>
          <div className="text-3xl font-bold">{formatCurrency(fundedAmt)}</div>
          <div className={`text-xs ${muted}`}>Total funded across your FRNs</div>
          <div className="mt-4 space-y-2.5 text-xs">
            <div><div className="flex justify-between mb-1"><span className={muted}>Funded</span><span className="font-semibold">{formatCurrency(fundedAmt)}</span></div><div className={`h-1.5 rounded ${track}`}><div className="h-full rounded bg-gradient-to-r from-emerald-500 to-lime-500" style={{ width: `${Math.round(fundedAmt / amtMax * 100)}%` }} /></div></div>
            <div><div className="flex justify-between mb-1"><span className={muted}>Pending</span><span className="font-semibold">{formatCurrency(pendingAmt)}</span></div><div className={`h-1.5 rounded ${track}`}><div className="h-full rounded bg-gradient-to-r from-amber-500 to-yellow-500" style={{ width: `${Math.round(pendingAmt / amtMax * 100)}%` }} /></div></div>
            <div><div className="flex justify-between mb-1"><span className={muted}>Denied</span><span className="font-semibold">{formatCurrency(deniedAmt)}</span></div><div className={`h-1.5 rounded ${track}`}><div className="h-full rounded bg-gradient-to-r from-red-500 to-rose-500" style={{ width: `${Math.round(deniedAmt / amtMax * 100)}%` }} /></div></div>
          </div>
        </div>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className={`flex items-center gap-2 text-sm mb-3 ${muted}`}><Building2 className="w-4 h-4" /> Applications</div>
          <div className="text-3xl font-bold">{totalFrns}</div>
          <div className={`text-xs ${muted}`}>Total FRNs tracked</div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className={muted}>Funded</span><span className="font-semibold">{funded}</span></div>
            <div className="flex justify-between"><span className={muted}>Pending review</span><span className="font-semibold">{pending}</span></div>
            <div className="flex justify-between"><span className={muted}>Denied</span><span className="font-semibold">{denied}</span></div>
          </div>
        </div>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between mb-3"><div><div className="font-semibold">Needs your attention</div><div className={`text-xs ${muted}`}>Ranked by risk</div></div><Bell className={`w-4 h-4 ${faint}`} /></div>
          {attention.length > 0 ? (
            <div className="space-y-2">{attention.map((a) => (
              <div key={a.key} className={`flex items-center gap-3 rounded-xl border p-3 ${softRow}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${toneCls(a.tone)}`}>{a.tone === "red" ? <Scale className="w-4 h-4" /> : a.tone === "amber" ? <FileText className="w-4 h-4" /> : <Activity className="w-4 h-4" />}</div>
                <div className="flex-1 min-w-0"><div className="font-medium truncate text-sm">{a.label}</div><div className={`text-xs truncate ${muted}`}>{a.sub}</div></div>
                <button onClick={() => onTab(a.tab)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0 ${dark ? "bg-slate-700 hover:bg-slate-600 text-slate-100" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}>Open</button>
              </div>
            ))}</div>
          ) : (<div className={`text-sm py-8 text-center ${faint}`}>You&apos;re all caught up.</div>)}
        </div>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between mb-3"><div><div className="font-semibold">Recent activity</div><div className={`text-xs ${muted}`}>Latest changes to your applications</div></div><button onClick={() => onTab("changes")} className={`text-xs font-medium ${link}`}>View all →</button></div>
          {changes.length > 0 ? (
            <div className="space-y-1.5">{changes.slice(0, 6).map((c) => {
              const dot = c.change_type === "new_denial" ? "bg-red-500" : c.change_type === "appeal_generated" ? "bg-purple-500" : c.change_type === "status_change" ? "bg-amber-500" : "bg-slate-400";
              return (<div key={c.id} className={`flex items-start gap-3 rounded-xl px-3 py-2 ${rowHover}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{c.description}</div><div className={`text-xs truncate ${muted}`}>FRN {c.frn}</div></div>
                <span className={`text-xs shrink-0 whitespace-nowrap ${faint}`}>{formatDate(c.changed_at)}</span>
              </div>);
            })}</div>
          ) : (<div className={`text-sm py-8 text-center ${faint}`}>No recent updates yet.</div>)}
        </div>
      </div>

      {/* Denials & appeals, or top FRNs by funding */}
      {appeals.length > 0 ? (
        <div className={`rounded-2xl border p-5 mt-5 ${card}`}>
          <div className="flex items-center justify-between mb-3"><div><div className="font-semibold">Denials &amp; auto-generated appeals</div><div className={`text-xs ${muted}`}>AI-drafted, ready for your review</div></div><button onClick={() => onTab("appeals")} className={`text-xs font-medium ${link}`}>View all →</button></div>
          <div className="space-y-1.5">{appeals.slice(0, 5).map((a) => (
            <button key={a.id} onClick={() => onOpenAppeal(a)} className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${rowHover}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600"}`}><Scale className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">FRN {a.frn}</div><div className={`text-xs truncate ${muted}`}>{a.denial_category}: {a.denial_reason}</div></div>
              {typeof a.success_probability === "number" && (<span className={`text-sm font-semibold shrink-0 ${a.success_probability >= 70 ? "text-emerald-500" : a.success_probability >= 40 ? "text-amber-500" : "text-red-500"}`}>{a.success_probability}%</span>)}
              {a.days_until_deadline !== null && a.days_until_deadline <= 14 && (<span className="text-xs text-red-500 shrink-0 whitespace-nowrap">{a.days_until_deadline}d left</span>)}
            </button>
          ))}</div>
        </div>
      ) : topFrns.length > 0 ? (
        <div className={`rounded-2xl border p-5 mt-5 ${card}`}>
          <div className="flex items-center justify-between mb-3"><div><div className="font-semibold">Top FRNs by funding</div><div className={`text-xs ${muted}`}>Your highest-value requests</div></div><button onClick={() => onTab("frns")} className={`text-xs font-medium ${link}`}>View all →</button></div>
          <div className="space-y-1.5">{topFrns.map((f, i) => (
            <button key={f.id} onClick={() => onTab("frns")} className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${rowHover}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${dark ? "bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-purple-200" : "bg-gradient-to-br from-purple-100 to-pink-100 text-purple-600"}`}>{i + 1}</div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">FRN {f.frn}</div><div className={`text-xs ${muted}`}>FY{f.funding_year} · {f.service_type || "Service"}</div></div>
              <div className={`text-sm font-semibold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>{formatCurrency(f.amount_funded || f.amount_requested || 0)}</div>
            </button>
          ))}</div>
        </div>
      ) : null}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {([
          { label: "All FRNs", icon: <FileText className="w-5 h-5" />, fn: () => onTab("frns") },
          { label: "Live Status", icon: <Activity className="w-5 h-5" />, fn: () => onTab("frn-status") },
          { label: "Disbursements", icon: <Coins className="w-5 h-5" />, fn: () => onTab("disbursements") },
          { label: "Appeals", icon: <Scale className="w-5 h-5" />, fn: () => onTab("appeals") },
        ]).map((a) => (
          <button key={a.label} onClick={a.fn} className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all ${qaBtn}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${qaIcon}`}>{a.icon}</div><span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ApplicantDashboardWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <ApplicantDashboard />
    </Suspense>
  );
}

function ApplicantDashboard() {
  const router = useRouter();
  const { user, token, isAuthenticated, logout, _hasHydrated } = useAuthStore();
  const { verified: emailVerified, checking: checkingVerification } = useVerificationGuard();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useTabParam<ApplicantTab>("overview", APPLICANT_TABS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Dark / light theme for the whole applicant portal shell. On first load we
  // honor the visitor's OS preference (prefers-color-scheme); once they toggle,
  // that explicit choice is remembered per-browser and wins over the OS setting.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("applicant_theme");
    if (saved === "light" || saved === "dark") { setTheme(saved); return; }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
  }, []);
  const toggleTheme = () => setTheme((p) => {
    const next = p === "dark" ? "light" : "dark";
    try { localStorage.setItem("applicant_theme", next); } catch { /* ignore */ }
    return next;
  });
  const dark = theme === "dark";
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [selectedFrnId, setSelectedFrnId] = useState<number | null>(null);
  const [frnDetail, setFrnDetail] = useState<any | null>(null);
  const [loadingFrnDetail, setLoadingFrnDetail] = useState(false);
  
  // Report Monitors (automated FRN email reports) — global /frn-reports API,
  // scoped to the logged-in applicant. Mirrors the consultant FRN Status panel.
  const [frnWatches, setFrnWatches] = useState<FRNWatch[]>([]);
  const [showCreateWatch, setShowCreateWatch] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  
  // Disbursement state
  const [disbursementData, setDisbursementData] = useState<any>(null);
  const [disbursementLoading, setDisbursementLoading] = useState(false);
  const [disbursementYear, setDisbursementYear] = useState<number | undefined>(undefined);
  const [selectedFrnIds, setSelectedFrnIds] = useState<Set<number>>(new Set());

  // Replace BEN modal state (demo/test accounts)
  const [showReplaceBenModal, setShowReplaceBenModal] = useState(false);
  const [replaceBenInput, setReplaceBenInput] = useState("");
  const [replacingBenLoading, setReplacingBenLoading] = useState(false);
  const [replaceBenError, setReplaceBenError] = useState<string | null>(null);

  // ----- "All FRNs" tab: filters, sort, and per-FRN working tracking -----
  // The frns data is already loaded from the dashboard, so all filtering is
  // client-side. Mirrors the consultant / vendor FRN-status experience.
  const [frnsYear, setFrnsYear] = useState<string>("");
  const [frnsStatus, setFrnsStatus] = useState<string>("");
  const [frnsPendingReason, setFrnsPendingReason] = useState<string>("");
  const [frnsService, setFrnsService] = useState<string>("");
  const [frnsSearch, setFrnsSearch] = useState<string>("");
  const [frnsTrackingFilter, setFrnsTrackingFilter] = useState<string>("");
  const [frnsSort, setFrnsSort] = useState<{ field: string; dir: "asc" | "desc" } | null>(null);

  // Per-FRN working annotations (A6 install, A7 co-pay, notes). Funding status
  // and PIA come from USAC automatically and are shown in the table, so the
  // modal only tracks what USAC does not provide.
  const [frnTrackingMap, setFrnTrackingMap] = useState<Record<string, FrnTracking>>({});
  const [trackingModalFrn, setTrackingModalFrn] = useState<string | null>(null);
  const [trackingForm, setTrackingForm] = useState<FrnTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);

  const isDemoAccount = user?.email?.includes('test_') || user?.email?.includes('demo') || user?.role === 'admin' || user?.role === 'super';

  useEffect(() => {
    // Wait for Zustand hydration before checking auth
    if (!_hasHydrated || checkingVerification) return;
    // Check authentication and role
    if (!isAuthenticated || !token) {
      router.push('/sign-in');
      return;
    }
    // Verification guard handles redirect to /onboarding
    if (!emailVerified) return;
    if (user?.role !== 'applicant' && user?.role !== 'admin' && user?.role !== 'super') {
      // Redirect to appropriate dashboard
      const dashboard = user?.role === 'vendor' ? '/vendor' : '/consultant';
      router.push(dashboard);
      return;
    }
    fetchDashboard();
  }, [_hasHydrated, isAuthenticated, token, user, router, checkingVerification, emailVerified]);

  // Deep link handling: scroll to FRN from email links
  // URL format: /applicant?tab=frn-status&frn=XXXXX
  const searchParams = useSearchParams();
  const frnParam = searchParams.get('frn');
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (frnParam && !isLoading && !deepLinkHandled.current) {
      deepLinkHandled.current = true;
      setSelectedTab("frns");
      const tryScroll = () => {
        const el = document.querySelector(`[data-frn="${frnParam}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("frn-highlight");
          setTimeout(() => el.classList.remove("frn-highlight"), 2000);
          return true;
        }
        return false;
      };
      setTimeout(() => { if (!tryScroll()) setTimeout(tryScroll, 2500); }, 800);
    }
  }, [frnParam, isLoading]);

  // Back-compat: old email deep links used ?tab=frn-status ("Live Status").
  // That sparse tab was merged into "FRN Status" (id "frns"); redirect there.
  useEffect(() => {
    if (selectedTab === 'frn-status') setSelectedTab('frns');
  }, [selectedTab]);

  const fetchDashboard = async () => {
    if (!token) {
      router.push('/sign-in');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/applicant/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        logout();
        router.push('/sign-in');
        return;
      }

      if (response.status === 403) {
        // Not an applicant - redirect based on role
        const dashboard = user?.role === 'vendor' ? '/vendor' : '/consultant';
        router.push(dashboard);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard');
      }

      const dashboardData = await response.json();
      setData(dashboardData);
      loadFRNWatches();
    } catch (e) {
      console.error('Dashboard error:', e);
      setError('Failed to load dashboard. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerSync = async () => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/v1/applicant/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      // Refresh dashboard after starting sync
      setTimeout(fetchDashboard, 2000);
    } catch (e) {
      console.error('Sync error:', e);
    }
  };

  // Replace BEN handler (demo/test accounts)
  const handleReplaceBen = async () => {
    const newBen = replaceBenInput.trim();
    if (!newBen) {
      setReplaceBenError("Please enter the new BEN");
      return;
    }
    setReplacingBenLoading(true);
    setReplaceBenError(null);
    try {
      const response = await api.replaceApplicantBen(newBen);
      if (response.success && response.data) {
        const d = response.data;
        setShowReplaceBenModal(false);
        setReplaceBenInput("");
        // Refresh dashboard to reflect new BEN
        await fetchDashboard();
        alert(
          `[OK] Swapped to ${d.name || d.new_id}. Building snapshot in background...\n\n` +
          `Old BEN: ${d.old_id}\nNew BEN: ${d.new_id}`
        );
      } else {
        setReplaceBenError(response.error || "Failed to replace BEN");
      }
    } catch (error: any) {
      console.error("Failed to replace BEN:", error);
      setReplaceBenError(error?.message || "Failed to replace BEN");
    } finally {
      setReplacingBenLoading(false);
    }
  };

  const fetchFrnDetail = async (frnId: number) => {
    if (selectedFrnId === frnId) {
      // Toggle off if clicking the same row
      setSelectedFrnId(null);
      setFrnDetail(null);
      return;
    }
    setSelectedFrnId(frnId);
    setLoadingFrnDetail(true);
    setFrnDetail(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/applicant/frns/${frnId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const detail = await response.json();
        setFrnDetail(detail);
      }
    } catch (e) {
      console.error('Error fetching FRN detail:', e);
    } finally {
      setLoadingFrnDetail(false);
    }
  };

  const loadFRNWatches = async () => {
    try {
      const response = await api.getFRNWatches();
      if (response.data?.success) setFrnWatches(response.data.watches || []);
    } catch (error) {
      console.error("Failed to load report monitors:", error);
    }
  };

  // Disbursement Data
  const loadDisbursements = async (year?: number, forceRefresh?: boolean) => {
    setDisbursementLoading(true);
    try {
      const response = await api.getApplicantDisbursements(year, forceRefresh);
      if (response.success && response.data) {
        setDisbursementData(response.data);
      }
    } catch (error) {
      console.error("Failed to load disbursements:", error);
    } finally {
      setDisbursementLoading(false);
    }
  };

  // Load all of the account's FRN tracking rows once (drives at-a-glance badges).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.applicantGetFrnTracking();
        if (!cancelled && resp.success && resp.data?.success && resp.data.tracking && typeof resp.data.tracking === "object") {
          setFrnTrackingMap(resp.data.tracking as Record<string, FrnTracking>);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const openTrackingModal = async (frn: string, ben?: string | null) => {
    if (!frn) return;
    setTrackingModalFrn(frn);
    setTrackingLoading(true);
    setTrackingForm({ frn, ben: ben || null });
    try {
      const resp = await api.applicantGetFrnTracking(frn);
      const existing = resp.success && resp.data?.success ? (resp.data.tracking as FrnTracking | null) : null;
      setTrackingForm(existing ? { ...existing, frn, ben: existing.ben || ben || null } : { frn, ben: ben || null, installed: false, copay_paid: false });
    } catch {
      setTrackingForm({ frn, ben: ben || null, installed: false, copay_paid: false });
    } finally {
      setTrackingLoading(false);
    }
  };

  const saveTrackingModal = async () => {
    if (!trackingForm?.frn) return;
    setTrackingSaving(true);
    try {
      const resp = await api.applicantUpsertFrnTracking({
        frn: trackingForm.frn,
        ben: trackingForm.ben ?? null,
        working_status: trackingForm.working_status ?? null,
        installed: trackingForm.installed ?? false,
        install_date: trackingForm.install_date ?? null,
        copay_paid: trackingForm.copay_paid ?? false,
        copay_amount: trackingForm.copay_amount ?? null,
        pia_status: trackingForm.pia_status ?? null,
        notes: trackingForm.notes ?? null,
      });
      if (resp.success && resp.data?.success) {
        const saved = resp.data.tracking;
        setFrnTrackingMap(prev => ({ ...prev, [saved.frn]: saved }));
        setTrackingModalFrn(null);
        setTrackingForm(null);
      }
    } finally {
      setTrackingSaving(false);
    }
  };

  const toggleFrnsSort = (field: string) => {
    setFrnsSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: "asc" };
      if (prev.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  };

  // Distinct dropdown options derived from the loaded FRNs.
  const frnsAll = data?.frns || [];
  const frnsYearOptions = useMemo(() => {
    const set = new Set<number>();
    frnsAll.forEach(f => { if (f.funding_year) set.add(f.funding_year); });
    return Array.from(set).sort((a, b) => b - a);
  }, [data?.frns]);
  const frnsServiceOptions = useMemo(() => {
    const set = new Set<string>();
    frnsAll.forEach(f => { const s = (f.service_type || "").trim(); if (s) set.add(s); });
    return Array.from(set).sort();
  }, [data?.frns]);
  const frnsPendingReasonOptions = useMemo(() => {
    const set = new Set<string>(FRN_PENDING_REASON_OPTIONS);
    frnsAll.forEach(f => { const r = (f.review_stage || "").trim(); if (r) set.add(r); });
    return Array.from(set);
  }, [data?.frns]);

  // Filtered + sorted FRNs for the "All FRNs" table.
  const sortedFrns = useMemo(() => {
    let filtered = [...frnsAll];

    if (frnsYear) filtered = filtered.filter(f => String(f.funding_year) === frnsYear);

    if (frnsStatus) {
      filtered = filtered.filter(f => {
        const st = (f.status_type || "").toLowerCase();
        const raw = (f.status || "").toLowerCase();
        if (frnsStatus === "funded") return st === "funded" || raw.includes("funded") || raw.includes("committed");
        if (frnsStatus === "denied") return f.is_denied || st === "denied" || raw.includes("denied");
        if (frnsStatus === "pending") return !f.is_denied && st !== "funded" && st !== "denied";
        return true;
      });
    }

    if (frnsPendingReason.trim()) {
      const pr = frnsPendingReason.trim().toLowerCase();
      filtered = filtered.filter(f => (f.review_stage || "").toLowerCase().includes(pr));
    }

    if (frnsService) filtered = filtered.filter(f => (f.service_type || "") === frnsService);

    if (frnsSearch.trim()) {
      const s = frnsSearch.trim().toLowerCase();
      const benLower = (data?.profile?.ben || "").toLowerCase();
      const orgLower = (data?.profile?.organization_name || "").toLowerCase();
      filtered = filtered.filter(f =>
        (f.frn || "").toLowerCase().includes(s) ||
        (f.application_number || "").toLowerCase().includes(s) ||
        benLower.includes(s) ||
        orgLower.includes(s)
      );
    }

    if (frnsTrackingFilter) {
      filtered = filtered.filter(f => {
        const t = frnTrackingMap[f.frn];
        const flt = frnsTrackingFilter;
        if (flt === "tracked") return !!t;
        if (flt === "installed") return !!t?.installed;
        if (flt === "not_installed") return !t?.installed;
        if (flt === "copay_paid") return !!t?.copay_paid;
        if (flt === "copay_unpaid") return !t?.copay_paid;
        return true;
      });
    }

    if (!frnsSort) return filtered;
    const dir = frnsSort.dir === "asc" ? 1 : -1;
    const numeric = frnsSort.field === "funding_year" || frnsSort.field === "amount_funded" || frnsSort.field === "amount_disbursed";
    return [...filtered].sort((a, b) => {
      if (numeric) {
        const av = Number((a as any)[frnsSort.field] ?? 0);
        const bv = Number((b as any)[frnsSort.field] ?? 0);
        return (av - bv) * dir;
      }
      const av = ((a as any)[frnsSort.field] ?? "").toString().toLowerCase();
      const bv = ((b as any)[frnsSort.field] ?? "").toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [data?.frns, data?.profile, frnsYear, frnsStatus, frnsPendingReason, frnsService, frnsSearch, frnsTrackingFilter, frnsSort, frnTrackingMap]);

  // At-a-glance stat totals for the "All FRNs" tab (computed from frns data).
  const frnStats = useMemo(() => {
    let funded = 0, fundedAmt = 0, denied = 0, deniedAmt = 0, pending = 0, pendingAmt = 0;
    frnsAll.forEach(f => {
      const st = (f.status_type || "").toLowerCase();
      const isFunded = st === "funded";
      const isDenied = f.is_denied || st === "denied";
      if (isFunded) { funded += 1; fundedAmt += f.amount_funded || 0; }
      else if (isDenied) { denied += 1; deniedAmt += f.amount_requested || 0; }
      else { pending += 1; pendingAmt += f.amount_requested || 0; }
    });
    return { total: frnsAll.length, funded, fundedAmt, denied, deniedAmt, pending, pendingAmt };
  }, [data?.frns]);

  // Show loading spinner while store hydrates from localStorage
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your E-Rate dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <p className="text-slate-900 font-semibold mb-2">Something went wrong</p>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboard}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, frns, appeals, recent_changes, summary } = data;

  const handleExportFrns = () => {
    const base = selectedFrnIds.size > 0
      ? sortedFrns.filter(f => selectedFrnIds.has(f.id))
      : sortedFrns;
    const rowsToExport = base.map(f => {
      const t = frnTrackingMap[f.frn];
      return {
        ...f,
        installed: t?.installed ? "Yes" : "",
        install_date: t?.install_date ?? "",
        copay_paid: t?.copay_paid ? "Yes" : "",
        copay_amount: t?.copay_amount ?? "",
        tracking_notes: t?.notes ?? "",
      };
    });
    const columns = ['frn', 'application_number', 'funding_year', 'status', 'service_type', 'amount_requested', 'amount_funded', 'amount_disbursed', 'is_denied', 'denial_reason', 'appeal_deadline', 'installed', 'install_date', 'copay_paid', 'copay_amount', 'tracking_notes'];
    downloadCsv(csvFilename('my_frns'), columns, rowsToExport as unknown as Record<string, unknown>[]);
  };

  const navGroups: { label: string; items: { id: ApplicantTab; label: string; Icon: typeof Home; count?: number }[] }[] = [
    { label: "Overview", items: [
      { id: "overview", label: "Dashboard", Icon: Home },
    ]},
    { label: "Applications", items: [
      { id: "frns", label: "FRN Status", Icon: Activity, count: frns.length },
    ]},
    { label: "Funding & Compliance", items: [
      { id: "disbursements", label: "Disbursements", Icon: Coins },
      { id: "appeals", label: "Appeals", Icon: Scale, count: appeals.length },
    ]},
    { label: "Activity", items: [
      { id: "changes", label: "Updates", Icon: Bell, count: summary.unread_changes },
    ]},
  ];
  const allNav = navGroups.flatMap((g) => g.items);
  const activeLabel = allNav.find((i) => i.id === selectedTab)?.label || "Dashboard";

  const handleLogout = () => {
    logout();
    router.push('/sign-in');
  };

  // Theme-aware shell class fragments
  const shellSide = dark ? "bg-[#0f1020] border-slate-800" : "bg-white border-slate-200";
  const shellMain = dark ? "bg-[#0a0b15]" : "bg-slate-50";
  const shellTop = dark ? "bg-[#0c0d1a] border-slate-800" : "bg-white border-slate-200";
  const groupLabelCls = dark ? "text-slate-500" : "text-slate-400";
  const railText = dark ? "text-slate-300" : "text-slate-600";
  const railHover = dark ? "hover:bg-slate-800/60 hover:text-white" : "hover:bg-slate-50 hover:text-slate-900";
  const railActive = dark ? "bg-gradient-to-r from-purple-500/20 to-pink-500/10 text-white" : "bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700";
  const iconBtnCls = dark ? "border-slate-700 text-slate-300 hover:border-purple-500 hover:text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100";
  const crumbInk = dark ? "text-slate-100" : "text-slate-900";
  const crumbFaint = dark ? "text-slate-500" : "text-slate-400";
  const searchCls = dark ? "bg-slate-900 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500";

  // Theme fragments for the "All FRNs" tab (stat cards, filter bar, table).
  const tCard = dark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const tInk = dark ? "text-slate-100" : "text-slate-900";
  const tMuted = dark ? "text-slate-400" : "text-slate-500";
  const tFaint = dark ? "text-slate-500" : "text-slate-400";
  const tBorder = dark ? "border-slate-800" : "border-slate-200";
  const tRowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const tInput = dark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-white border-slate-300 text-slate-900";
  const tTheadBg = dark ? "bg-slate-900/40" : "bg-slate-50";
  const tThLabel = dark ? "text-slate-400" : "text-slate-600";
  const tInnerCard = dark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200";
  const frnStatusBadgeCls = (f: FRN) => {
    const st = (f.status_type || "").toLowerCase();
    const denied = f.is_denied || st === "denied";
    if (st === "funded") return dark ? "bg-green-500/15 text-green-300" : "bg-green-100 text-green-800";
    if (denied) return dark ? "bg-red-500/15 text-red-300" : "bg-red-100 text-red-800";
    return dark ? "bg-amber-500/15 text-amber-300" : "bg-amber-100 text-amber-800";
  };
  const sortArrow = (field: string) => frnsSort?.field === field ? (frnsSort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className={`min-h-screen ${shellMain}`}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r transform transition-transform duration-200 ease-in-out ${shellSide} ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col`}>
        {/* Logo */}
        <div className={`h-16 flex items-center gap-3 px-5 border-b ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="rounded-lg" />
            <div>
              <span className={`font-bold ${crumbInk}`}>SkyRate AI</span>
              <span className={`block text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                Applicant Portal{(user?.role === 'super' || user?.role === 'admin') ? ` (${user.role})` : ''}
              </span>
            </div>
          </Link>
        </div>

        {/* Grouped navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className={`px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider ${groupLabelCls}`}>{group.label}</div>
              {group.items.map((item) => {
                const active = selectedTab === item.id;
                const Ico = item.Icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSelectedTab(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${active ? `${railActive} font-medium` : `${railText} ${railHover}`}`}
                  >
                    <Ico className="w-[18px] h-[18px]" />
                    <span className="text-sm">{item.label}</span>
                    {item.count !== undefined && item.count > 0 ? (
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${active ? (dark ? 'bg-purple-500/30 text-purple-100' : 'bg-purple-100 text-purple-700') : (dark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')}`}>{item.count}</span>
                    ) : active ? (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Pinned footer: plan card + profile */}
        <div className={`border-t p-3 ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="rounded-2xl p-3 mb-2 bg-gradient-to-br from-purple-600 to-pink-600 text-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-90">
                {user?.role === 'super' || user?.role === 'admin' ? 'Full Access' : 'Pro Plan'}
              </span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-semibold">
                {user?.role === 'super' ? 'Super' : user?.role === 'admin' ? 'Admin' : 'Active'}
              </span>
            </div>
            <div className="text-lg font-bold mt-0.5">{frns.length} FRNs</div>
          </div>
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold shrink-0">
              {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${crumbInk}`}>{user?.full_name || user?.email}</div>
              <div className={`text-xs truncate ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{profile.organization_name}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className={`p-2 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
            >
              <LogOut className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <main className="lg:ml-64">
        {/* Top Bar */}
        <header className={`h-16 border-b flex items-center justify-between px-5 sticky top-0 z-40 ${shellTop}`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`lg:hidden w-9 h-9 rounded-lg border flex items-center justify-center ${iconBtnCls}`}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="text-sm truncate">
              <span className={crumbFaint}>SkyRate AI</span>
              <span className={`mx-1.5 ${crumbFaint}`}>·</span>
              <span className={`font-semibold ${crumbInk}`}>{activeLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`hidden md:flex items-center gap-2 rounded-lg border px-3 py-2 text-sm w-56 ${searchCls}`}>
              <Search className="w-4 h-4" />
              <span className="flex-1 truncate">Search or jump to…</span>
            </div>
            <button
              onClick={toggleTheme}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`w-9 h-9 rounded-lg border flex items-center justify-center ${iconBtnCls}`}
            >
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link
              href="/settings/notifications"
              className={`w-9 h-9 rounded-lg border flex items-center justify-center relative ${iconBtnCls}`}
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {summary.unread_changes > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </Link>
            <button className={`hidden sm:flex w-9 h-9 rounded-lg border items-center justify-center ${iconBtnCls}`} title="Help">
              <HelpCircle className="w-5 h-5" />
            </button>
            {summary.sync_status === 'syncing' ? (
              <div className="flex items-center gap-2 text-sm text-purple-400 px-2">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="hidden sm:inline">Syncing…</span>
              </div>
            ) : (
              <button
                onClick={triggerSync}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>
            )}
          </div>
        </header>


        {/* Soft-gate: prompt applicants without a BEN to finish onboarding */}
        <MissingIdentifierBanner />

        {/* Page Content */}
        <div className="p-6">
        {/* Overview / Dashboard - dark/light bento command center */}
        {selectedTab === 'overview' && (
          <ApplicantCommandCenter
            profile={profile}
            summary={summary}
            frns={frns}
            appeals={appeals}
            changes={recent_changes}
            dark={dark}
            isDemoAccount={isDemoAccount}
            onReplaceBen={() => { setReplaceBenInput(""); setReplaceBenError(null); setShowReplaceBenModal(true); }}
            onTab={setSelectedTab}
            onOpenAppeal={setSelectedAppeal}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        )}

        {selectedTab === 'frns' && (
          <div className="space-y-4">
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={`rounded-xl border p-4 ${tCard}`}>
                <div className={`text-xs font-medium ${tMuted}`}>Total FRNs</div>
                <div className={`text-2xl font-bold mt-1 ${tInk}`}>{frnStats.total}</div>
              </div>
              <div className={`rounded-xl border p-4 ${tCard}`}>
                <div className={`text-xs font-medium ${tMuted}`}>Funded</div>
                <div className="text-2xl font-bold mt-1 text-green-500">{frnStats.funded}</div>
                <div className={`text-xs mt-0.5 ${tFaint}`}>{formatCurrency(frnStats.fundedAmt)} committed</div>
              </div>
              <div className={`rounded-xl border p-4 ${tCard}`}>
                <div className={`text-xs font-medium ${tMuted}`}>Denied</div>
                <div className="text-2xl font-bold mt-1 text-red-500">{frnStats.denied}</div>
                <div className={`text-xs mt-0.5 ${tFaint}`}>{formatCurrency(frnStats.deniedAmt)} requested</div>
              </div>
              <div className={`rounded-xl border p-4 ${tCard}`}>
                <div className={`text-xs font-medium ${tMuted}`}>Pending</div>
                <div className="text-2xl font-bold mt-1 text-amber-500">{frnStats.pending}</div>
                <div className={`text-xs mt-0.5 ${tFaint}`}>{formatCurrency(frnStats.pendingAmt)} requested</div>
              </div>
            </div>

            {/* Filter bar */}
            <div className={`rounded-xl border p-4 ${tCard}`}>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className={`text-xs mb-1 block ${tMuted}`}>Funding Year</label>
                  <select value={frnsYear} onChange={(e) => setFrnsYear(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${tInput}`}>
                    <option value="">All Years</option>
                    {frnsYearOptions.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${tMuted}`}>Status</label>
                  <select value={frnsStatus} onChange={(e) => setFrnsStatus(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${tInput}`}>
                    <option value="">All Statuses</option>
                    <option value="funded">Funded</option>
                    <option value="denied">Denied</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className={`text-xs mb-1 flex items-center gap-1 ${tMuted}`}>Sub-status / Pending Reason <FrnSubStatusInfo /></label>
                  <select value={frnsPendingReason} onChange={(e) => setFrnsPendingReason(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm w-56 ${tInput}`} title="Filter by the FRN sub-status / pending reason (review stage)">
                    <option value="">All sub-statuses</option>
                    {frnsPendingReasonOptions.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${tMuted}`}>Service Type</label>
                  <select value={frnsService} onChange={(e) => setFrnsService(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${tInput}`} title="Sift FRNs by a particular service type">
                    <option value="">All service types</option>
                    {frnsServiceOptions.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${tMuted}`}>My Tracking</label>
                  <select value={frnsTrackingFilter} onChange={(e) => setFrnsTrackingFilter(e.target.value)} className={`px-3 py-2 border rounded-lg text-sm ${tInput}`} title="Filter by your own per-FRN tracking (installation, applicant co-pay)">
                    <option value="">All (my tracking)</option>
                    <option value="tracked">Has tracking</option>
                    <optgroup label="Install">
                      <option value="installed">Installed</option>
                      <option value="not_installed">Not installed</option>
                    </optgroup>
                    <optgroup label="Co-pay">
                      <option value="copay_paid">Co-pay paid</option>
                      <option value="copay_unpaid">Co-pay unpaid</option>
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className={`text-xs mb-1 block ${tMuted}`}>Search FRN / Entity / BEN</label>
                  <input type="text" value={frnsSearch} onChange={(e) => setFrnsSearch(e.target.value)} placeholder="e.g., 2699061470" className={`px-3 py-2 border rounded-lg text-sm w-56 ${tInput}`} />
                </div>
                {(frnsYear || frnsStatus || frnsPendingReason || frnsService || frnsSearch || frnsTrackingFilter) && (
                  <button
                    onClick={() => { setFrnsYear(""); setFrnsStatus(""); setFrnsPendingReason(""); setFrnsService(""); setFrnsSearch(""); setFrnsTrackingFilter(""); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${dark ? 'text-slate-300 hover:bg-slate-800 border border-slate-700' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    Clear filters
                  </button>
                )}
                <div className={`ml-auto text-xs self-center ${tFaint}`}>{sortedFrns.length} of {frnStats.total} FRNs</div>
              </div>
            </div>

            {/* FRN table */}
            <div className={`rounded-xl border overflow-hidden ${tCard}`}>
            <TableExportBar
              selectedCount={selectedFrnIds.size}
              totalCount={sortedFrns.length}
              onExportCsv={handleExportFrns}
              onClearSelection={() => setSelectedFrnIds(new Set())}
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${tTheadBg} border-b ${tBorder}`}>
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={sortedFrns.length > 0 && sortedFrns.every(f => selectedFrnIds.has(f.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFrnIds(new Set(sortedFrns.map(f => f.id)));
                          } else {
                            setSelectedFrnIds(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                    <th onClick={() => toggleFrnsSort('frn')} className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer select-none ${tThLabel} ${tRowHover}`}>FRN{sortArrow('frn')}</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${tThLabel}`}>Entity / BEN</th>
                    <th onClick={() => toggleFrnsSort('funding_year')} className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer select-none ${tThLabel} ${tRowHover}`}>Year{sortArrow('funding_year')}</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${tThLabel}`}>Service</th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${tThLabel}`}>Status</th>
                    <th onClick={() => toggleFrnsSort('amount_funded')} className={`px-4 py-3 text-right text-xs font-semibold uppercase cursor-pointer select-none ${tThLabel} ${tRowHover}`}>Commitment{sortArrow('amount_funded')}</th>
                    <th onClick={() => toggleFrnsSort('amount_disbursed')} className={`px-4 py-3 text-right text-xs font-semibold uppercase cursor-pointer select-none ${tThLabel} ${tRowHover}`}>Disbursed{sortArrow('amount_disbursed')}</th>
                    <th className={`px-4 py-3 text-center text-xs font-semibold uppercase ${tThLabel}`}>Track</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {sortedFrns.map((frn) => (
                    <React.Fragment key={frn.id}>
                    <tr 
                      key={frn.id} 
                      data-frn={frn.frn}
                      onClick={() => fetchFrnDetail(frn.id)}
                      className={`cursor-pointer transition-colors ${tRowHover} ${selectedFrnId === frn.id ? (dark ? 'bg-purple-500/10 border-l-4 border-l-purple-500' : 'bg-purple-50 border-l-4 border-l-purple-500') : ''}`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedFrnIds.has(frn.id)}
                          onChange={() => {
                            setSelectedFrnIds(prev => {
                              const next = new Set(prev);
                              if (next.has(frn.id)) next.delete(frn.id);
                              else next.add(frn.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs transition-transform ${tFaint} ${selectedFrnId === frn.id ? 'rotate-90' : ''}`}>▶</span>
                          <div>
                            <div className={`font-medium ${tInk}`}>{frn.frn}</div>
                            <div className={`text-xs ${tFaint}`}>{frn.application_number}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-sm ${tInk} max-w-[180px] truncate`} title={profile.organization_name}>{profile.organization_name || '—'}</div>
                        <div className={`text-xs ${tFaint}`}>BEN {profile.ben || '—'}</div>
                      </td>
                      <td className={`px-4 py-3 ${tMuted}`}>{frn.funding_year}</td>
                      <td className={`px-4 py-3 text-sm ${tMuted}`}>{frn.service_type || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${frnStatusBadgeCls(frn)}`}>
                            {frn.status}
                          </span>
                          {frn.review_stage && !frn.is_denied && (frn.status_type || '').toLowerCase() !== 'funded' && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${dark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-600 border border-slate-200'}`} title="FRN sub-status / review stage">
                              {frn.review_stage}
                            </span>
                          )}
                          {frn.is_denied && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const appeal = appeals.find(a => a.frn === frn.frn);
                                if (appeal) setSelectedAppeal(appeal);
                              }}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${dark ? 'bg-purple-500/20 text-purple-200 hover:bg-purple-500/30' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'} transition-colors`}
                            >
                              View Appeal
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`font-medium ${frn.amount_funded ? (dark ? 'text-green-300' : 'text-green-700') : tFaint}`}>
                          {frn.amount_funded ? formatCurrency(frn.amount_funded) : '—'}
                        </div>
                        {frn.amount_requested != null && frn.amount_funded !== frn.amount_requested && (
                          <div className={`text-xs ${tFaint}`}>
                            Req: {formatCurrency(frn.amount_requested)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`font-medium ${frn.amount_disbursed ? (dark ? 'text-blue-300' : 'text-blue-700') : tFaint}`}>
                          {frn.amount_disbursed ? formatCurrency(frn.amount_disbursed) : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openTrackingModal(frn.frn, profile.ben)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            title="Track installation, applicant co-pay, and notes for this FRN"
                          >
                            <Settings className="w-3 h-3" /> Track
                          </button>
                          {frnTrackingMap[frn.frn]?.installed && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${dark ? 'bg-green-500/15 text-green-300' : 'bg-green-100 text-green-700'}`} title="Equipment installed">Installed</span>
                          )}
                          {frnTrackingMap[frn.frn]?.copay_paid && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${dark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-100 text-blue-700'}`} title="Applicant co-pay paid">Co-pay</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* FRN Detail Panel */}
                    {selectedFrnId === frn.id && (
                      <tr key={`detail-${frn.id}`}>
                        <td colSpan={9} className="px-0 py-0">
                          <div className={`border-t border-b px-6 py-5 ${dark ? 'bg-slate-950/40 border-purple-500/20' : 'bg-gradient-to-br from-purple-50 to-slate-50 border-purple-200'}`}>
                            {loadingFrnDetail ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className={`ml-3 ${tMuted}`}>Loading FRN details...</span>
                              </div>
                            ) : frnDetail ? (
                              <div className="space-y-5">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h3 className={`text-lg font-semibold ${tInk}`}>
                                      FRN {frnDetail.frn} — {frnDetail.raw_data?.organization_name || 'Detailed View'}
                                    </h3>
                                    <p className={`text-sm mt-1 ${tMuted}`}>
                                      Application #{frnDetail.application_number} • FY{frnDetail.funding_year}
                                    </p>
                                  </div>
                                  <button onClick={() => { setSelectedFrnId(null); setFrnDetail(null); }} className={`text-sm ${dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>✕ Close</button>
                                </div>

                                {/* Key Metrics Grid - 5 columns */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className={`rounded-lg p-3 border ${tInnerCard}`}>
                                    <div className={`text-xs mb-1 ${tMuted}`}>Requested</div>
                                    <div className={`font-semibold ${tInk}`}>{frnDetail.amount_requested ? formatCurrency(frnDetail.amount_requested) : '—'}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${tInnerCard}`}>
                                    <div className={`text-xs mb-1 ${tMuted}`}>Committed</div>
                                    <div className={`font-semibold ${dark ? 'text-green-300' : 'text-green-700'}`}>{frnDetail.amount_funded ? formatCurrency(frnDetail.amount_funded) : '—'}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${tInnerCard}`}>
                                    <div className={`text-xs mb-1 ${tMuted}`}>Disbursed</div>
                                    <div className={`font-semibold ${dark ? 'text-blue-300' : 'text-blue-700'}`}>{frnDetail.amount_disbursed ? formatCurrency(frnDetail.amount_disbursed) : '—'}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${tInnerCard}`}>
                                    <div className={`text-xs mb-1 ${tMuted}`}>Discount</div>
                                    <div className={`font-semibold ${tInk}`}>{frnDetail.discount_rate ? `${frnDetail.discount_rate}%` : (frnDetail.raw_data?.discount_pct ? `${frnDetail.raw_data.discount_pct}%` : '—')}</div>
                                  </div>
                                  <div className={`rounded-lg p-3 border ${tInnerCard}`}>
                                    <div className={`text-xs mb-1 ${tMuted}`}>Category</div>
                                    <div className={`font-semibold ${dark ? 'text-purple-300' : 'text-purple-700'}`}>{frnDetail.service_type || frnDetail.raw_data?.form_471_service_type_name || '—'}</div>
                                  </div>
                                </div>

                                {/* Three-column info grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Status & Review */}
                                  <div className={`rounded-lg p-4 border ${tInnerCard}`}>
                                    <h4 className={`font-medium mb-3 text-sm flex items-center gap-2 ${tInk}`}>📊 Status & Review</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className={tMuted}>Status</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${frnStatusBadgeCls(frnDetail as FRN)}`}>{frnDetail.status || frnDetail.raw_data?.form_471_frn_status_name}</span>
                                      </div>
                                      {(frnDetail.review_stage || frnDetail.raw_data?.frn_complete_review_flag) && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Review Stage</span>
                                          <span className={tInk}>{frnDetail.review_stage || (frnDetail.raw_data?.frn_complete_review_flag === 'Y' ? 'Complete' : 'In Progress')}</span>
                                        </div>
                                      )}
                                      {(frnDetail.days_in_review != null || frnDetail.raw_data?.wave_number) && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>{frnDetail.days_in_review != null ? 'Days in Review' : 'Wave'}</span>
                                          <span className={tInk}>{frnDetail.days_in_review ?? frnDetail.raw_data?.wave_number}</span>
                                        </div>
                                      )}
                                      {(frnDetail.disbursement_status || frnDetail.raw_data?.disbursement_status) && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Disbursement</span>
                                          <span className={tInk}>{frnDetail.disbursement_status || frnDetail.raw_data?.disbursement_status}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.funding_commitment_request && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>FCR Amount</span>
                                          <span className={tInk}>{formatCurrency(parseFloat(frnDetail.raw_data.funding_commitment_request))}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Service Provider */}
                                  <div className={`rounded-lg p-4 border ${tInnerCard}`}>
                                    <h4 className={`font-medium mb-3 text-sm flex items-center gap-2 ${tInk}`}>🏢 Service Provider</h4>
                                    <div className="space-y-2 text-sm">
                                      {(frnDetail.raw_data?.spin || frnDetail.raw_data?.service_provider_number) && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>SPIN</span>
                                          <span className={`font-mono ${tInk}`}>{frnDetail.raw_data?.spin || frnDetail.raw_data?.service_provider_number}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.service_provider_name && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Provider</span>
                                          <span className={`text-right max-w-[150px] truncate ${tInk}`} title={frnDetail.raw_data.service_provider_name}>{frnDetail.raw_data.service_provider_name}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.establishing_fcc_form_470 && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Form 470</span>
                                          <span className={`font-mono ${tInk}`}>{frnDetail.raw_data.establishing_fcc_form_470}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.contract_expiration_date && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Contract Expires</span>
                                          <span className={tInk}>{formatDate(frnDetail.raw_data.contract_expiration_date)}</span>
                                        </div>
                                      )}
                                      {!frnDetail.raw_data?.spin && !frnDetail.raw_data?.service_provider_name && (
                                        <div className={`text-xs ${tFaint}`}>Provider info not available</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Service & Dates */}
                                  <div className={`rounded-lg p-4 border ${tInnerCard}`}>
                                    <h4 className={`font-medium mb-3 text-sm flex items-center gap-2 ${tInk}`}>📅 Service & Dates</h4>
                                    <div className="space-y-2 text-sm">
                                      {frnDetail.service_description && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Service</span>
                                          <span className={`text-right max-w-[150px] truncate ${tInk}`} title={frnDetail.service_description}>{frnDetail.service_description}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.ros_service_start_date && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Service Start</span>
                                          <span className={tInk}>{formatDate(frnDetail.raw_data.ros_service_start_date)}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.ros_service_end_date && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Service End</span>
                                          <span className={tInk}>{formatDate(frnDetail.raw_data.ros_service_end_date)}</span>
                                        </div>
                                      )}
                                      {frnDetail.invoice_deadline && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Invoice Deadline</span>
                                          <span className={`font-medium ${dark ? 'text-orange-300' : 'text-orange-600'}`}>{formatDate(frnDetail.invoice_deadline)}</span>
                                        </div>
                                      )}
                                      {frnDetail.fetched_at && (
                                        <div className="flex justify-between">
                                          <span className={tMuted}>Last Synced</span>
                                          <span className={tInk}>{formatDate(frnDetail.fetched_at)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Additional Details Row */}
                                {(frnDetail.raw_data?.product_type || frnDetail.raw_data?.fiber_type || frnDetail.raw_data?.purpose || frnDetail.raw_data?.function_text || frnDetail.raw_data?.bandwidth_speed || frnDetail.raw_data?.make || frnDetail.raw_data?.connection_type || frnDetail.raw_data?.quantity) && (
                                  <div className={`rounded-lg p-4 border ${tInnerCard}`}>
                                    <h4 className={`font-medium mb-3 text-sm flex items-center gap-2 ${tInk}`}>📋 Additional Details</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      {frnDetail.raw_data?.product_type && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Product Type</span>
                                          <span className={tInk}>{frnDetail.raw_data.product_type}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.make && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Make/Brand</span>
                                          <span className={tInk}>{frnDetail.raw_data.make}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.bandwidth_speed && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Bandwidth</span>
                                          <span className={tInk}>{frnDetail.raw_data.bandwidth_speed}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.connection_type && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Connection</span>
                                          <span className={tInk}>{frnDetail.raw_data.connection_type}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.fiber_type && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Fiber Type</span>
                                          <span className={tInk}>{frnDetail.raw_data.fiber_type}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.quantity || frnDetail.raw_data?.num_lines) && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Quantity</span>
                                          <span className={tInk}>{frnDetail.raw_data.quantity || frnDetail.raw_data.num_lines}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.purpose && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Purpose</span>
                                          <span className={tInk}>{frnDetail.raw_data.purpose}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.function_text && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Function</span>
                                          <span className={tInk}>{frnDetail.raw_data.function_text}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.total_monthly_cost || frnDetail.raw_data?.unit_cost) && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Monthly Cost</span>
                                          <span className={tInk}>{formatCurrency(parseFloat(frnDetail.raw_data.total_monthly_cost || frnDetail.raw_data.unit_cost))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.total_eligible_monthly_recurring_charges && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Eligible Monthly</span>
                                          <span className={tInk}>{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_monthly_recurring_charges))}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.total_eligible_one_time_charges || frnDetail.raw_data?.one_time_cost) && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>One-time Charges</span>
                                          <span className={tInk}>{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_one_time_charges || frnDetail.raw_data.one_time_cost))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.contract_number && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Contract #</span>
                                          <span className={`font-mono text-xs ${tInk}`}>{frnDetail.raw_data.contract_number}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.invoice_count && (
                                        <div>
                                          <span className={`block text-xs ${tMuted}`}>Invoices Filed</span>
                                          <span className={tInk}>{frnDetail.raw_data.invoice_count}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Denial Info (if applicable) */}
                                {frnDetail.is_denied && (
                                  <div className={`rounded-lg p-4 border ${dark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
                                    <h4 className={`font-medium mb-3 text-sm flex items-center gap-2 ${dark ? 'text-red-300' : 'text-red-800'}`}>🚨 Denial Information</h4>
                                    <div className="space-y-2 text-sm">
                                      {frnDetail.denial_reason && (
                                        <div>
                                          <span className={`font-medium ${dark ? 'text-red-400' : 'text-red-600'}`}>Reason: </span>
                                          <span className={dark ? 'text-red-200' : 'text-red-800'}>{frnDetail.denial_reason}</span>
                                        </div>
                                      )}
                                      {frnDetail.fcdl_comment && (
                                        <div>
                                          <span className={`font-medium ${dark ? 'text-red-400' : 'text-red-600'}`}>FCDL Comment: </span>
                                          <span className={dark ? 'text-red-200' : 'text-red-800'}>{frnDetail.fcdl_comment}</span>
                                        </div>
                                      )}
                                      <div className={`flex gap-4 text-xs mt-2 ${dark ? 'text-red-400' : 'text-red-600'}`}>
                                        {frnDetail.fcdl_date && <span>FCDL Date: {formatDate(frnDetail.fcdl_date)}</span>}
                                        {frnDetail.appeal_deadline && <span className="font-semibold">⏰ Appeal Deadline: {formatDate(frnDetail.appeal_deadline)}</span>}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Appeal Info (if exists) */}
                                {frnDetail.appeal && (
                                  <div className={`rounded-lg p-4 border ${dark ? 'bg-purple-500/10 border-purple-500/30' : 'bg-purple-50 border-purple-200'}`}>
                                    <h4 className={`font-medium mb-2 text-sm flex items-center gap-2 ${dark ? 'text-purple-200' : 'text-purple-800'}`}>📄 Auto-Generated Appeal Ready</h4>
                                    <div className="flex items-center gap-3 text-sm mb-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        frnDetail.appeal.status === 'ready' ? (dark ? 'bg-purple-500/20 text-purple-200' : 'bg-purple-100 text-purple-700') :
                                        frnDetail.appeal.status === 'submitted' ? (dark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700') :
                                        (dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600')
                                      }`}>{frnDetail.appeal.status?.toUpperCase()}</span>
                                      {frnDetail.appeal.success_probability != null && (
                                        <span className={`font-medium ${dark ? 'text-purple-300' : 'text-purple-700'}`}>✓ {frnDetail.appeal.success_probability}% Success Rate</span>
                                      )}
                                    </div>
                                    <p className={`text-xs line-clamp-2 ${dark ? 'text-purple-300' : 'text-purple-600'}`}>{frnDetail.appeal.appeal_letter?.substring(0, 200)}...</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={`text-center py-4 ${tMuted}`}>Failed to load details</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {sortedFrns.length === 0 && (
                    <tr>
                      <td colSpan={9} className={`px-4 py-10 text-center text-sm ${tMuted}`}>
                        No FRNs match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>

            {/* Report Monitors — automated FRN email reports (mirrors consultant FRN Status) */}
            <div className={`rounded-xl border p-6 ${tCard}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className={`text-lg font-semibold ${tInk}`}>Report Monitors</h3>
                  <p className={`text-sm ${tMuted}`}>Set up automated email reports for your FRN portfolio</p>
                </div>
                <button
                  onClick={() => setShowCreateWatch(!showCreateWatch)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {showCreateWatch ? 'Cancel' : '+ Create Monitor'}
                </button>
              </div>

              {showCreateWatch && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setWatchLoading(true);
                    const formData = new FormData(e.currentTarget);
                    try {
                      const response = await api.createFRNWatch({
                        name: formData.get('name') as string,
                        watch_type: (formData.get('watch_type') as any) || 'portfolio',
                        target_id: (formData.get('target_id') as string) || undefined,
                        frequency: (formData.get('frequency') as any) || 'weekly',
                        recipient_email: formData.get('recipient_email') as string,
                        include_funded: formData.get('include_funded') === 'on',
                        include_pending: formData.get('include_pending') === 'on',
                        include_denied: formData.get('include_denied') === 'on',
                        include_changes: formData.get('include_changes') === 'on',
                        delivery_mode: (formData.get('delivery_mode') as any) || 'full_email',
                      });
                      if (response?.data?.success) {
                        setShowCreateWatch(false);
                        loadFRNWatches();
                      }
                    } catch (error) {
                      console.error('Failed to create monitor:', error);
                    } finally {
                      setWatchLoading(false);
                    }
                  }}
                  className={`mb-6 p-4 rounded-lg border space-y-4 ${dark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>Monitor Name</label>
                      <input name="name" required placeholder="e.g., Weekly FRN Report" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`} />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>Recipient Email</label>
                      <input name="recipient_email" type="email" required defaultValue={user?.email || ''} placeholder="you@example.com" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`} />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>Watch Type</label>
                      <select name="watch_type" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`}>
                        <option value="portfolio">Entire Portfolio</option>
                        <option value="ben">Specific BEN</option>
                        <option value="frn">Specific FRN</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>Frequency</label>
                      <select name="frequency" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`}>
                        <option value="weekly">Weekly</option>
                        <option value="daily">Daily</option>
                        <option value="biweekly">Bi-Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>BEN or FRN (if applicable)</label>
                      <input name="target_id" placeholder="e.g., 123456" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`} />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-1 ${tMuted}`}>Delivery Mode</label>
                      <select name="delivery_mode" className={`w-full px-3 py-2 border rounded-lg text-sm ${tInput}`}>
                        <option value="full_email">Full Email Report</option>
                        <option value="notification_only">Notification Only</option>
                        <option value="in_app_only">In-App Only</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-2 text-sm ${tMuted}`}><input type="checkbox" name="include_funded" defaultChecked className="rounded" /> Include Funded</label>
                    <label className={`flex items-center gap-2 text-sm ${tMuted}`}><input type="checkbox" name="include_pending" defaultChecked className="rounded" /> Include Pending</label>
                    <label className={`flex items-center gap-2 text-sm ${tMuted}`}><input type="checkbox" name="include_denied" defaultChecked className="rounded" /> Include Denied</label>
                    <label className={`flex items-center gap-2 text-sm ${tMuted}`}><input type="checkbox" name="include_changes" defaultChecked className="rounded" /> Highlight Changes</label>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowCreateWatch(false)} className={`px-4 py-2 text-sm rounded-lg ${dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}>Cancel</button>
                    <button type="submit" disabled={watchLoading} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{watchLoading ? 'Creating...' : 'Create Monitor'}</button>
                  </div>
                </form>
              )}

              {frnWatches.length > 0 ? (
                <div className="space-y-3">
                  {frnWatches.map((watch) => (
                    <div key={watch.id} className={`flex items-center justify-between p-4 rounded-lg border ${watch.is_active ? (dark ? 'border-purple-800 bg-purple-900/20' : 'border-purple-200 bg-purple-50') : (dark ? 'border-slate-800 bg-slate-900/40 opacity-60' : 'border-slate-200 bg-slate-50 opacity-60')}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium text-sm truncate ${tInk}`}>{watch.name}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${watch.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{watch.is_active ? 'Active' : 'Paused'}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{watch.frequency}</span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">{watch.watch_type}</span>
                        </div>
                        <div className={`flex items-center gap-4 mt-1 text-xs ${tFaint}`}>
                          <span>To: {watch.recipient_email}</span>
                          {watch.send_count > 0 && <span>Sent: {watch.send_count}x</span>}
                          {watch.next_send_at && <span>Next: {new Date(watch.next_send_at).toLocaleDateString()}</span>}
                          {watch.last_error && <span className="text-red-500">Error: {watch.last_error}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button onClick={async () => { try { await api.sendFRNWatchNow(watch.id); loadFRNWatches(); } catch (err) { console.error(err); } }} className={`p-1.5 rounded-lg ${tMuted} hover:text-purple-600`} title="Send report now"><Send className="w-4 h-4" /></button>
                        <button onClick={async () => { try { await api.toggleFRNWatch(watch.id); loadFRNWatches(); } catch (err) { console.error(err); } }} className={`p-1.5 rounded-lg ${tMuted} hover:text-amber-600`} title={watch.is_active ? 'Pause' : 'Resume'}>{watch.is_active ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}</button>
                        <button onClick={async () => { if (confirm('Delete this monitor?')) { try { await api.deleteFRNWatch(watch.id); loadFRNWatches(); } catch (err) { console.error(err); } } }} className={`p-1.5 rounded-lg ${tMuted} hover:text-red-600`} title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !showCreateWatch ? (
                <div className={`text-center py-8 ${tMuted}`}>
                  <Bell className={`h-10 w-10 mx-auto mb-3 ${tFaint}`} />
                  <p className="text-sm font-medium">No report monitors yet</p>
                  <p className="text-xs mt-1">Create a monitor to receive periodic FRN status reports via email</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {selectedTab === 'appeals' && (
          <div className="space-y-4">
            {appeals.map((appeal) => (
              <div
                key={appeal.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900">FRN {appeal.frn}</h3>
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                        FY {appeal.funding_year}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        appeal.status === 'ready' ? 'bg-purple-100 text-purple-700' :
                        appeal.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        appeal.status === 'won' ? 'bg-green-100 text-green-700' :
                        appeal.status === 'lost' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {appeal.status}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600">
                      <span className="font-medium">{appeal.denial_category}:</span> {appeal.denial_reason}
                    </div>
                  </div>
                  <div className="text-right">
                    {appeal.success_probability && (
                      <div className={`text-xl font-bold ${
                        appeal.success_probability >= 70 ? 'text-green-600' :
                        appeal.success_probability >= 40 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {appeal.success_probability}%
                      </div>
                    )}
                    <div className="text-xs text-slate-500">success rate</div>
                  </div>
                </div>

                {appeal.appeal_deadline && (
                  <div className={`mb-4 p-3 rounded-lg ${
                    appeal.days_until_deadline !== null && appeal.days_until_deadline <= 7
                      ? 'bg-red-50 border border-red-200'
                      : appeal.days_until_deadline !== null && appeal.days_until_deadline <= 14
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-slate-50 border border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Appeal Deadline</span>
                      <span className="text-sm">
                        {formatDate(appeal.appeal_deadline)}
                        {appeal.days_until_deadline !== null && (
                          <span className={`ml-2 font-medium ${
                            appeal.days_until_deadline <= 7 ? 'text-red-600' :
                            appeal.days_until_deadline <= 14 ? 'text-yellow-600' : 'text-slate-600'
                          }`}>
                            ({appeal.days_until_deadline} days)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedAppeal(appeal)}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    View & Edit Appeal Letter
                  </button>
                  <button className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
                    Download PDF
                  </button>
                </div>
              </div>
            ))}
            {appeals.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No Denials!</h3>
                <p className="text-slate-600">
                  All your funding requests are in good standing. Great work!
                </p>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'disbursements' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Funding Year</label>
                  <select
                    value={disbursementYear || ''}
                    onChange={(e) => setDisbursementYear(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Years</option>
                    {Array.from({ length: 10 }, (_, i) => 2025 - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => loadDisbursements(disbursementYear)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  Load Disbursements
                </button>
                <button
                  onClick={() => loadDisbursements(disbursementYear, true)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium border border-slate-300"
                  title="Bypass cache and fetch fresh data from USAC"
                >
                  Force Refresh
                </button>
              </div>
            </div>

            {disbursementLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-slate-500">Loading disbursement data...</p>
              </div>
            ) : disbursementData ? (
              <>
                {/* Grand Totals */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <div className="text-sm text-slate-500">Total Authorized</div>
                    <div className="text-2xl font-bold text-slate-900">${(disbursementData.total_authorized || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 shadow-sm p-6">
                    <div className="text-sm text-green-600">Total Disbursed</div>
                    <div className="text-2xl font-bold text-green-700">${(disbursementData.total_disbursed || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-6">
                    <div className="text-sm text-blue-600">Disbursement Rate</div>
                    <div className="text-2xl font-bold text-blue-700">{(disbursementData.disbursement_rate || 0).toFixed(1)}%</div>
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(disbursementData.disbursement_rate || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Per-BEN Disbursements */}
                {disbursementData.bens && disbursementData.bens.length > 0 ? (
                  <div className="space-y-4">
                    {disbursementData.bens.map((ben: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-4 border-b border-slate-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-900">{ben.entity_name || `BEN ${ben.ben}`}</div>
                              <div className="text-sm text-slate-500">BEN: {ben.ben}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-green-600">
                                ${(ben.total_disbursed || 0).toLocaleString()} disbursed
                              </div>
                              <div className="text-xs text-slate-400">
                                of ${(ben.total_authorized || 0).toLocaleString()} authorized
                                ({(ben.disbursement_rate || 0).toFixed(1)}%)
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-green-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(ben.disbursement_rate || 0, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {(ben.disbursements || []).slice(0, 10).map((rec: any, rIdx: number) => (
                            <div key={rIdx} className="px-4 py-3 flex items-center justify-between text-sm">
                              <div>
                                <span className="font-mono text-slate-700">FRN {rec.funding_request_number}</span>
                                <span className="text-slate-400 ml-2">• {rec.service_type || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-right">
                                <div>
                                  <div className="text-slate-500">Authorized</div>
                                  <div className="font-medium">${(rec.total_authorized_amount || 0).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-green-500">Disbursed</div>
                                  <div className="font-medium text-green-700">${(rec.total_authorized_disbursement || 0).toLocaleString()}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(ben.disbursements || []).length > 10 && (
                            <div className="px-4 py-2 text-center text-xs text-slate-400">
                              + {(ben.disbursements || []).length - 10} more records
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="text-slate-500">No disbursement data found for your registered BENs.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="text-4xl mb-3">💰</div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Disbursement Tracking</h3>
                <p className="text-slate-500 mb-4">View disbursement data from USAC for your registered BENs.</p>
                <button
                  onClick={() => loadDisbursements(disbursementYear)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                >
                  Load Disbursements
                </button>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'changes' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="divide-y divide-slate-100">
              {recent_changes.map((change) => (
                <div
                  key={change.id}
                  className={`p-4 ${!change.is_read ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                      change.change_type === 'status_change' ? 'bg-yellow-100' :
                      change.change_type === 'new_denial' ? 'bg-red-100' :
                      change.change_type === 'appeal_generated' ? 'bg-purple-100' :
                      'bg-slate-100'
                    }`}>
                      {change.change_type === 'status_change' ? '🔄' :
                       change.change_type === 'new_denial' ? '❌' :
                       change.change_type === 'appeal_generated' ? '⚖️' :
                       change.change_type === 'new_frn' ? '📋' :
                       '📋'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-slate-900 font-medium">{change.description}</div>
                          {change.frn && (
                            <div className="text-sm text-slate-500 mt-1">FRN: {change.frn}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-500">{formatDate(change.changed_at)}</div>
                          {change.is_important && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded mt-1 inline-block">
                              Important
                            </span>
                          )}
                        </div>
                      </div>
                      {change.previous_value && change.new_value && (
                        <div className="mt-2 text-sm">
                          <span className="text-slate-500">{change.previous_value}</span>
                          <span className="mx-2">→</span>
                          <span className="font-medium text-slate-700">{change.new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {recent_changes.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  No recent updates to show
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Replace BEN Modal (demo/test accounts) */}
      {showReplaceBenModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !replacingBenLoading && setShowReplaceBenModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Replace BEN</h3>
            <p className="text-sm text-slate-500 mb-3">
              Swap <span className="font-mono font-semibold text-slate-900">{data?.profile?.ben || "current BEN"}</span> for a different Billed Entity.
              Profile is updated, old FRN data is cleared, and a fresh sync starts in the background.
            </p>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-3">
              <p className="text-[11px] text-amber-800">
                <strong>Demo helper</strong> — visible because this is a test/demo account. Lets you retarget onto any applicant BEN on the fly.
              </p>
            </div>

            <input
              type="text"
              value={replaceBenInput}
              onChange={(e) => setReplaceBenInput(e.target.value)}
              placeholder="Enter new BEN (e.g., 16056315)"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono mb-3"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !replacingBenLoading && handleReplaceBen()}
            />

            {replaceBenError && (
              <p className="text-xs text-red-600 mb-3">{replaceBenError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowReplaceBenModal(false)}
                disabled={replacingBenLoading}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReplaceBen}
                disabled={replacingBenLoading || !replaceBenInput.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                {replacingBenLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Replacing...
                  </>
                ) : 'Verify & Replace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FRN Working Tracking Modal (A6 install, A7 co-pay, notes) */}
      {trackingModalFrn && trackingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setTrackingModalFrn(null); setTrackingForm(null); }}>
          <div className={`rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${dark ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
              <div>
                <h3 className={`font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>FRN Tracking</h3>
                <p className={`text-xs font-mono ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{trackingModalFrn}</p>
              </div>
              <button onClick={() => { setTrackingModalFrn(null); setTrackingForm(null); }} className={`p-1 rounded ${dark ? 'hover:bg-slate-800 text-slate-500 hover:text-slate-300' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'}`}>✕</button>
            </div>
            {trackingLoading ? (
              <div className={`p-8 text-center text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Loading…</div>
            ) : (
              <div className="p-5 space-y-4">
                <p className={`text-[11px] rounded-lg p-2.5 border ${dark ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  Funding status and PIA status come automatically from USAC and are shown in the FRN
                  table &mdash; no need to set them here. Use this panel for the details USAC doesn&apos;t
                  track: installation, applicant co-pay, and your notes.
                </p>

                <div className={`rounded-lg border p-3 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <label className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" checked={!!trackingForm.installed} onChange={(e) => setTrackingForm(f => f ? { ...f, installed: e.target.checked } : f)} />
                    Equipment installed
                  </label>
                  {trackingForm.installed && (
                    <div className="mt-2">
                      <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Install date</label>
                      <input type="date" value={(trackingForm.install_date ?? '').slice(0, 10)} onChange={(e) => setTrackingForm(f => f ? { ...f, install_date: e.target.value || null } : f)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} />
                    </div>
                  )}
                </div>

                <div className={`rounded-lg border p-3 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <label className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" checked={!!trackingForm.copay_paid} onChange={(e) => setTrackingForm(f => f ? { ...f, copay_paid: e.target.checked } : f)} />
                    Applicant co-pay paid
                  </label>
                  <div className="mt-2">
                    <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Co-pay amount (non-discounted share)</label>
                    <input type="number" step="0.01" min="0" value={trackingForm.copay_amount ?? ''} onChange={(e) => setTrackingForm(f => f ? { ...f, copay_amount: e.target.value === '' ? null : parseFloat(e.target.value) } : f)} placeholder="0.00" className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Notes</label>
                  <textarea rows={3} value={trackingForm.notes ?? ''} onChange={(e) => setTrackingForm(f => f ? { ...f, notes: e.target.value } : f)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} placeholder="Working notes for this FRN…" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => { setTrackingModalFrn(null); setTrackingForm(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Cancel</button>
                  <button onClick={saveTrackingModal} disabled={trackingSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50">
                    {trackingSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Appeal Modal */}
      {selectedAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Appeal for FRN {selectedAppeal.frn}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedAppeal.denial_category}: {selectedAppeal.denial_reason}
                </p>
              </div>
              <button
                onClick={() => setSelectedAppeal(null)}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-center gap-4">
                {selectedAppeal.success_probability && (
                  <div className={`px-4 py-2 rounded-lg ${
                    selectedAppeal.success_probability >= 70 ? 'bg-green-100 text-green-800' :
                    selectedAppeal.success_probability >= 40 ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    <span className="font-bold">{selectedAppeal.success_probability}%</span> estimated success rate
                  </div>
                )}
                {selectedAppeal.appeal_deadline && (
                  <div className="text-sm text-slate-600">
                    Deadline: <span className="font-medium">{formatDate(selectedAppeal.appeal_deadline)}</span>
                  </div>
                )}
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <div className="text-sm font-medium text-slate-700 mb-2">AI-Generated Appeal Letter</div>
                <div className="text-xs text-slate-500 mb-3">
                  Review and edit before submitting to USAC
                </div>
                <textarea
                  className="w-full h-96 p-4 border border-slate-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                  defaultValue={selectedAppeal.appeal_letter}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                Save Changes
              </button>
              <button className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Download PDF
              </button>
              <button className="px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50">
                Mark as Submitted
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
