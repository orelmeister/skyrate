"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";
import { api } from "@/lib/api";
import { useTabParam } from "@/hooks/useTabParam";
import { downloadCsv, csvFilename } from "@/lib/csv-export";
import { TableExportBar } from "@/components/TableExportBar";
import MissingIdentifierBanner from "@/components/MissingIdentifierBanner";
import { Home, FileText, Activity, Coins, Scale, Bell, Search, PanelLeft, Sun, Moon, LogOut, HelpCircle, ChevronRight, BadgeCheck, Building2 } from "lucide-react";

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
  amount_requested: number | null;
  amount_funded: number | null;
  is_denied: boolean;
  denial_reason: string | null;
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

function getStatusColor(statusType: string): string {
  switch (statusType) {
    case 'funded':
      return 'bg-green-100 text-green-800';
    case 'denied':
      return 'bg-red-100 text-red-800';
    case 'pending_review':
    case 'in_review':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
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
  
  // Live FRN Status state
  const [liveFrnData, setLiveFrnData] = useState<any>(null);
  const [liveFrnLoading, setLiveFrnLoading] = useState(false);
  const [liveFrnYear, setLiveFrnYear] = useState<number | undefined>(undefined);
  const [liveFrnStatusFilter, setLiveFrnStatusFilter] = useState<string>("");
  const [liveFrnPendingReason, setLiveFrnPendingReason] = useState<string>("");
  
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
      setSelectedTab("frn-status");
      // Auto-load live FRN data if not already loaded so the row to scroll
      // to actually exists in the DOM.
      if (!liveFrnData) {
        loadLiveFrnStatus(liveFrnYear, liveFrnStatusFilter, liveFrnPendingReason);
      }
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

  // Auto-load data when switching to live tabs
  useEffect(() => {
    // FRN status is NOT auto-loaded — user must click "Load Live Status"
    // Disbursements is NOT auto-loaded — user must click "Load Disbursements"
    // Both make expensive USAC API calls
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

  // Live FRN Status from USAC
  const loadLiveFrnStatus = async (year?: number, statusFilter?: string, pendingReason?: string) => {
    setLiveFrnLoading(true);
    try {
      const response = await api.getApplicantLiveFRNStatus(year, statusFilter || undefined, pendingReason || undefined);
      if (response.success && response.data) {
        setLiveFrnData(response.data);
      }
    } catch (error) {
      console.error("Failed to load live FRN status:", error);
    } finally {
      setLiveFrnLoading(false);
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
    const rowsToExport = selectedFrnIds.size > 0
      ? frns.filter(f => selectedFrnIds.has(f.id))
      : frns;
    const columns = ['frn', 'application_number', 'funding_year', 'status', 'service_type', 'amount_requested', 'amount_funded', 'is_denied', 'denial_reason', 'appeal_deadline'];
    downloadCsv(csvFilename('my_frns'), columns, rowsToExport as unknown as Record<string, unknown>[]);
  };

  const navGroups: { label: string; items: { id: ApplicantTab; label: string; Icon: typeof Home; count?: number }[] }[] = [
    { label: "Overview", items: [
      { id: "overview", label: "Dashboard", Icon: Home },
    ]},
    { label: "Applications", items: [
      { id: "frns", label: "All FRNs", Icon: FileText, count: frns.length },
      { id: "frn-status", label: "Live Status", Icon: Activity },
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <TableExportBar
              selectedCount={selectedFrnIds.size}
              totalCount={frns.length}
              onExportCsv={handleExportFrns}
              onClearSelection={() => setSelectedFrnIds(new Set())}
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedFrnIds.size === frns.length && frns.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedFrnIds(new Set(frns.map(f => f.id)));
                          } else {
                            setSelectedFrnIds(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">FRN</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Year</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Service</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Amount</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Appeal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {frns.map((frn) => (
                    <React.Fragment key={frn.id}>
                    <tr 
                      key={frn.id} 
                      onClick={() => fetchFrnDetail(frn.id)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedFrnId === frn.id ? 'bg-purple-50 border-l-4 border-l-purple-500' : ''}`}
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
                          <span className={`text-xs transition-transform ${selectedFrnId === frn.id ? 'rotate-90' : ''}`}>▶</span>
                          <div>
                            <div className="font-medium text-slate-900">{frn.frn}</div>
                            <div className="text-xs text-slate-500">{frn.application_number}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{frn.funding_year}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(frn.status_type)}`}>
                          {frn.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{frn.service_type}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium text-slate-900">
                          {frn.amount_funded ? formatCurrency(frn.amount_funded) : '-'}
                        </div>
                        {frn.amount_requested && frn.amount_funded !== frn.amount_requested && (
                          <div className="text-xs text-slate-500">
                            Requested: {formatCurrency(frn.amount_requested)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {frn.is_denied && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const appeal = appeals.find(a => a.frn === frn.frn);
                              if (appeal) setSelectedAppeal(appeal);
                            }}
                            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium hover:bg-purple-200 transition-colors"
                          >
                            View Appeal
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* FRN Detail Panel */}
                    {selectedFrnId === frn.id && (
                      <tr key={`detail-${frn.id}`}>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="bg-gradient-to-br from-purple-50 to-slate-50 border-t border-b border-purple-200 px-6 py-5">
                            {loadingFrnDetail ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                <span className="ml-3 text-slate-500">Loading FRN details...</span>
                              </div>
                            ) : frnDetail ? (
                              <div className="space-y-5">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h3 className="text-lg font-semibold text-slate-900">
                                      FRN {frnDetail.frn} — {frnDetail.raw_data?.organization_name || 'Detailed View'}
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                      Application #{frnDetail.application_number} • FY{frnDetail.funding_year}
                                    </p>
                                  </div>
                                  <button onClick={() => { setSelectedFrnId(null); setFrnDetail(null); }} className="text-slate-400 hover:text-slate-600 text-sm">✕ Close</button>
                                </div>

                                {/* Key Metrics Grid - 5 columns */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <div className="text-xs text-slate-500 mb-1">Requested</div>
                                    <div className="font-semibold text-slate-900">{frnDetail.amount_requested ? formatCurrency(frnDetail.amount_requested) : '—'}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <div className="text-xs text-slate-500 mb-1">Committed</div>
                                    <div className="font-semibold text-green-700">{frnDetail.amount_funded ? formatCurrency(frnDetail.amount_funded) : '—'}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <div className="text-xs text-slate-500 mb-1">Disbursed</div>
                                    <div className="font-semibold text-blue-700">{frnDetail.amount_disbursed ? formatCurrency(frnDetail.amount_disbursed) : '—'}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <div className="text-xs text-slate-500 mb-1">Discount</div>
                                    <div className="font-semibold text-slate-900">{frnDetail.discount_rate ? `${frnDetail.discount_rate}%` : (frnDetail.raw_data?.discount_pct ? `${frnDetail.raw_data.discount_pct}%` : '—')}</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-3 border border-slate-200">
                                    <div className="text-xs text-slate-500 mb-1">Category</div>
                                    <div className="font-semibold text-purple-700">{frnDetail.service_type || frnDetail.raw_data?.form_471_service_type_name || '—'}</div>
                                  </div>
                                </div>

                                {/* Three-column info grid */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Status & Review */}
                                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                                    <h4 className="font-medium text-slate-900 mb-3 text-sm flex items-center gap-2">📊 Status & Review</h4>
                                    <div className="space-y-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Status</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(frnDetail.status_type)}`}>{frnDetail.status || frnDetail.raw_data?.form_471_frn_status_name}</span>
                                      </div>
                                      {(frnDetail.review_stage || frnDetail.raw_data?.frn_complete_review_flag) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Review Stage</span>
                                          <span className="text-slate-900">{frnDetail.review_stage || (frnDetail.raw_data?.frn_complete_review_flag === 'Y' ? 'Complete' : 'In Progress')}</span>
                                        </div>
                                      )}
                                      {(frnDetail.days_in_review != null || frnDetail.raw_data?.wave_number) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">{frnDetail.days_in_review != null ? 'Days in Review' : 'Wave'}</span>
                                          <span className="text-slate-900">{frnDetail.days_in_review ?? frnDetail.raw_data?.wave_number}</span>
                                        </div>
                                      )}
                                      {(frnDetail.disbursement_status || frnDetail.raw_data?.disbursement_status) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Disbursement</span>
                                          <span className="text-slate-900">{frnDetail.disbursement_status || frnDetail.raw_data?.disbursement_status}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.funding_commitment_request && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">FCR Amount</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.funding_commitment_request))}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Service Provider */}
                                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                                    <h4 className="font-medium text-slate-900 mb-3 text-sm flex items-center gap-2">🏢 Service Provider</h4>
                                    <div className="space-y-2 text-sm">
                                      {(frnDetail.raw_data?.spin || frnDetail.raw_data?.service_provider_number) && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">SPIN</span>
                                          <span className="text-slate-900 font-mono">{frnDetail.raw_data?.spin || frnDetail.raw_data?.service_provider_number}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.service_provider_name && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Provider</span>
                                          <span className="text-slate-900 text-right max-w-[150px] truncate" title={frnDetail.raw_data.service_provider_name}>{frnDetail.raw_data.service_provider_name}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.establishing_fcc_form_470 && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Form 470</span>
                                          <span className="text-slate-900 font-mono">{frnDetail.raw_data.establishing_fcc_form_470}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.contract_expiration_date && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Contract Expires</span>
                                          <span className="text-slate-900">{formatDate(frnDetail.raw_data.contract_expiration_date)}</span>
                                        </div>
                                      )}
                                      {!frnDetail.raw_data?.spin && !frnDetail.raw_data?.service_provider_name && (
                                        <div className="text-slate-400 text-xs">Provider info not available</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Service & Dates */}
                                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                                    <h4 className="font-medium text-slate-900 mb-3 text-sm flex items-center gap-2">📅 Service & Dates</h4>
                                    <div className="space-y-2 text-sm">
                                      {frnDetail.service_description && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Service</span>
                                          <span className="text-slate-900 text-right max-w-[150px] truncate" title={frnDetail.service_description}>{frnDetail.service_description}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.ros_service_start_date && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Service Start</span>
                                          <span className="text-slate-900">{formatDate(frnDetail.raw_data.ros_service_start_date)}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.ros_service_end_date && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Service End</span>
                                          <span className="text-slate-900">{formatDate(frnDetail.raw_data.ros_service_end_date)}</span>
                                        </div>
                                      )}
                                      {frnDetail.invoice_deadline && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Invoice Deadline</span>
                                          <span className="text-orange-600 font-medium">{formatDate(frnDetail.invoice_deadline)}</span>
                                        </div>
                                      )}
                                      {frnDetail.fetched_at && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Last Synced</span>
                                          <span className="text-slate-900">{formatDate(frnDetail.fetched_at)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Additional Details Row */}
                                {(frnDetail.raw_data?.product_type || frnDetail.raw_data?.fiber_type || frnDetail.raw_data?.purpose || frnDetail.raw_data?.function_text || frnDetail.raw_data?.bandwidth_speed || frnDetail.raw_data?.make || frnDetail.raw_data?.connection_type || frnDetail.raw_data?.quantity) && (
                                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                                    <h4 className="font-medium text-slate-900 mb-3 text-sm flex items-center gap-2">📋 Additional Details</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      {frnDetail.raw_data?.product_type && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Product Type</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.product_type}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.make && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Make/Brand</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.make}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.bandwidth_speed && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Bandwidth</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.bandwidth_speed}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.connection_type && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Connection</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.connection_type}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.fiber_type && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Fiber Type</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.fiber_type}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.quantity || frnDetail.raw_data?.num_lines) && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Quantity</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.quantity || frnDetail.raw_data.num_lines}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.purpose && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Purpose</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.purpose}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.function_text && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Function</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.function_text}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.total_monthly_cost || frnDetail.raw_data?.unit_cost) && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Monthly Cost</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_monthly_cost || frnDetail.raw_data.unit_cost))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.total_eligible_monthly_recurring_charges && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Eligible Monthly</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_monthly_recurring_charges))}</span>
                                        </div>
                                      )}
                                      {(frnDetail.raw_data?.total_eligible_one_time_charges || frnDetail.raw_data?.one_time_cost) && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">One-time Charges</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_one_time_charges || frnDetail.raw_data.one_time_cost))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.contract_number && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Contract #</span>
                                          <span className="text-slate-900 font-mono text-xs">{frnDetail.raw_data.contract_number}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.invoice_count && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Invoices Filed</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.invoice_count}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Denial Info (if applicable) */}
                                {frnDetail.is_denied && (
                                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                                    <h4 className="font-medium text-red-800 mb-3 text-sm flex items-center gap-2">🚨 Denial Information</h4>
                                    <div className="space-y-2 text-sm">
                                      {frnDetail.denial_reason && (
                                        <div>
                                          <span className="text-red-600 font-medium">Reason: </span>
                                          <span className="text-red-800">{frnDetail.denial_reason}</span>
                                        </div>
                                      )}
                                      {frnDetail.fcdl_comment && (
                                        <div>
                                          <span className="text-red-600 font-medium">FCDL Comment: </span>
                                          <span className="text-red-800">{frnDetail.fcdl_comment}</span>
                                        </div>
                                      )}
                                      <div className="flex gap-4 text-xs text-red-600 mt-2">
                                        {frnDetail.fcdl_date && <span>FCDL Date: {formatDate(frnDetail.fcdl_date)}</span>}
                                        {frnDetail.appeal_deadline && <span className="font-semibold">⏰ Appeal Deadline: {formatDate(frnDetail.appeal_deadline)}</span>}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Appeal Info (if exists) */}
                                {frnDetail.appeal && (
                                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                    <h4 className="font-medium text-purple-800 mb-2 text-sm flex items-center gap-2">📄 Auto-Generated Appeal Ready</h4>
                                    <div className="flex items-center gap-3 text-sm mb-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        frnDetail.appeal.status === 'ready' ? 'bg-purple-100 text-purple-700' :
                                        frnDetail.appeal.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>{frnDetail.appeal.status?.toUpperCase()}</span>
                                      {frnDetail.appeal.success_probability != null && (
                                        <span className="text-purple-700 font-medium">✓ {frnDetail.appeal.success_probability}% Success Rate</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-purple-600 line-clamp-2">{frnDetail.appeal.appeal_letter?.substring(0, 200)}...</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-slate-500">Failed to load details</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
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

        {selectedTab === 'frn-status' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
                  <select
                    value={liveFrnYear || ''}
                    onChange={(e) => setLiveFrnYear(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Years</option>
                    {Array.from({ length: 10 }, (_, i) => 2025 - i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={liveFrnStatusFilter}
                    onChange={(e) => setLiveFrnStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="Funded">Funded</option>
                    <option value="Pending">Pending</option>
                    <option value="Denied">Denied</option>
                    <option value="Committed">Committed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pending Reason</label>
                  <input
                    type="text"
                    value={liveFrnPendingReason}
                    onChange={(e) => setLiveFrnPendingReason(e.target.value)}
                    placeholder="Filter by reason..."
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <button
                  onClick={() => loadLiveFrnStatus(liveFrnYear, liveFrnStatusFilter, liveFrnPendingReason)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {liveFrnLoading ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-slate-500">Loading live FRN status from USAC...</p>
              </div>
            ) : liveFrnData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <div className="text-sm text-slate-500">Total FRNs</div>
                    <div className="text-2xl font-bold text-slate-900">{liveFrnData.summary?.total_frns || 0}</div>
                    <div className="text-xs text-slate-400 mt-1">${(liveFrnData.summary?.total_amount || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
                    <div className="text-sm text-green-600">Funded</div>
                    <div className="text-2xl font-bold text-green-700">{liveFrnData.summary?.funded || 0}</div>
                    <div className="text-xs text-green-500 mt-1">${(liveFrnData.summary?.funded_amount || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4">
                    <div className="text-sm text-yellow-600">Pending</div>
                    <div className="text-2xl font-bold text-yellow-700">{liveFrnData.summary?.pending || 0}</div>
                    <div className="text-xs text-yellow-500 mt-1">${(liveFrnData.summary?.pending_amount || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4">
                    <div className="text-sm text-red-600">Denied</div>
                    <div className="text-2xl font-bold text-red-700">{liveFrnData.summary?.denied || 0}</div>
                    <div className="text-xs text-red-500 mt-1">${(liveFrnData.summary?.denied_amount || 0).toLocaleString()}</div>
                  </div>
                </div>

                {/* Per-BEN Breakdown */}
                {liveFrnData.schools && liveFrnData.schools.length > 0 ? (
                  <div className="space-y-4">
                    {liveFrnData.schools.map((school: any, idx: number) => (
                      <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">{school.entity_name || `BEN ${school.ben}`}</div>
                            <div className="text-sm text-slate-500">BEN: {school.ben} • {school.frn_count || 0} FRNs</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-slate-900">${(school.total_amount || 0).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {(school.frns || []).map((frn: any, fIdx: number) => (
                            <div key={fIdx} className="px-4 py-3 flex items-center justify-between">
                              <div>
                                <span className="font-mono text-sm text-slate-700">FRN {frn.frn}</span>
                                <span className="text-sm text-slate-500 ml-2">— {frn.narrative || 'No description'}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  frn.frn_status === 'Funded' ? 'bg-green-100 text-green-700' :
                                  frn.frn_status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                  frn.frn_status === 'Denied' ? 'bg-red-100 text-red-700' :
                                  frn.frn_status === 'Committed' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {frn.frn_status || 'Unknown'}
                                </span>
                                <span className="text-sm font-medium text-slate-700">${(frn.funded_amount || frn.original_amount || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="text-slate-500">No FRN data found for your registered BENs.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="text-4xl mb-3">📈</div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Live FRN Status</h3>
                <p className="text-slate-500 mb-4">Query USAC directly for real-time FRN status across your BENs.</p>
                <button
                  onClick={() => loadLiveFrnStatus(liveFrnYear, liveFrnStatusFilter, liveFrnPendingReason)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                >
                  Load Live Status
                </button>
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
