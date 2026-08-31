"use client";

import { useState, useEffect, Suspense, useMemo, useRef, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore, deriveRequiresPaymentSetup } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";
import { PERF_V2_ENABLED } from "@/lib/featureFlags";
import { api, VendorProfile, SpinValidationResult, ServicedEntity, EntityDetailResponse, EntityYearData, Form471ByEntityResponse, Form471Record, Form471Vendor, CompetitorAnalysisResponse, FRNStatusResponse, FRNStatusSummaryResponse, FRNStatusRecord, Form470Lead, Form470LeadsResponse, Form470DetailResponse, SavedLead, EnrichedContactData, FRNWatch, CreateWatchRequest, FRNReportHistory, VendorDisbursementResponse } from "@/lib/api";
import { Form471LineItem, FrnTracking } from "@/lib/api";
import { useTabParam } from "@/hooks/useTabParam";
import PredictedLeadsTab from "@/components/PredictedLeadsTab";
import OpportunityMap from "@/components/OpportunityMap";
import OpportunityAlerts from "@/components/OpportunityAlerts";
import { TableExportBar } from "@/components/TableExportBar";
import MissingIdentifierBanner from "@/components/MissingIdentifierBanner";
import { SkeletonRows, SkeletonTable, SkeletonStatCards } from "@/components/Skeleton";
import { DisbursementPanel } from "@/components/FRNDetailModal";
import { downloadCsv, csvFilename, downloadExcel, excelFilename } from "@/lib/csv-export";
import { ChevronRight, ChevronDown, Target, Clock, Building2, Bell, ArrowUpRight, Zap, BarChart3, Search, TrendingUp, Home, Activity, Shield, Map as MapIcon, Sparkles, FileSearch, Bookmark, Settings as SettingsIcon, HelpCircle, PanelLeft, Sun, Moon, LogOut, Receipt, StickyNote } from "lucide-react";
import PilotFrns from "./PilotFrns";
import { FrnSubStatusInfo, FRN_PENDING_REASON_OPTIONS } from "@/components/FrnSubStatusInfo";
import PurchaseHistoryModal from "@/components/PurchaseHistoryModal";
const VENDOR_TABS = ["dashboard", "my-entities", "frn-status", "cyber-pilot", "470-leads", "map", "predicted-leads", "competitive", "invoicing", "search", "leads", "settings"] as const;
type VendorTab = typeof VENDOR_TABS[number];

// Saved-leads CRM pipeline stages (B7). Order defines the pipeline flow.
const PIPELINE_STAGES: { key: string; label: string; chip: string; dot: string }[] = [
  { key: "new", label: "New", chip: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { key: "contacted", label: "Contacted", chip: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  { key: "qualified", label: "Qualified", chip: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { key: "won", label: "Won", chip: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { key: "lost", label: "Lost", chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
];

interface SearchResult {
  ben: string;
  name: string;
  state: string;
  city: string;
  status: string;
  funding_amount: number;
  service_type: string;
  funding_year?: number;
  application_number?: string;
  frn?: string;
  _raw?: any; // Raw USAC data for detail view
}

// Force-download a remote file via fetch + Blob.
// For USAC (publicdata.usac.org) RFP documents we route through the backend
// proxy `/api/v1/vendor/rfp-download` so we get clean Content-Type +
// Content-Disposition headers and avoid the corrupt-file / Word-error issue
// caused by browser CORS fallbacks landing on HTML wrappers.
async function forceDownloadFile(url: string, suggestedFilename?: string): Promise<void> {
  try {
    let fetchUrl = url;
    try {
      const u = new URL(url);
      if (u.hostname === "publicdata.usac.org") {
        // Always route USAC PDFs through the backend proxy — same-origin request
        // avoids CORS issues and gives the browser proper Content-Disposition.
        fetchUrl = `/api/v1/vendor/rfp-download?url=${encodeURIComponent(url)}`;
      }
    } catch {
      // not a parseable URL — fall through to direct fetch
    }

    const response = await fetch(fetchUrl, { method: "GET", credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    let filename = suggestedFilename || url.split("/").pop() || "document.pdf";
    try { filename = decodeURIComponent(filename); } catch { /* leave as-is */ }
    // strip USAC's leading numeric id prefix (e.g. "20766431-Real Name.pdf")
    filename = filename.replace(/^\d+-/, "").replace(/\s+/g, " ").trim() || "document";

    const a = document.createElement("a");
    a.style.display = "none";
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(blobUrl);
    document.body.removeChild(a);
  } catch (err) {
    console.error("forceDownloadFile failed, falling back to new-tab open:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Upcoming E-Rate funding year using the USAC July-1 cutover: from July onward
// the active filing cycle is next calendar year's FY (e.g. Aug 2026 -> FY2027).
function getUpcomingFundingYear(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

// Detect whether a Form 470's service lines request installation / professional
// services (installation/initial configuration, BMIC, MIBS). Mirrors the backend
// professional_services_flag; used for the 470 detail-modal badge (the leads list
// uses the backend-computed lead.professional_services flag directly).
const PRO_SERVICE_KEYWORDS = ["basic maintenance", "managed internal broadband", "mibs", "bmic", "installation", "maintenance", "managed", "professional"];
function has470ProServices(services?: { service_type?: string; function?: string; installation_required?: string }[] | null): boolean {
  for (const s of services || []) {
    const inst = String(s?.installation_required || "").trim().toLowerCase();
    if (["yes", "y", "true", "1"].includes(inst)) return true;
    const st = String(s?.service_type || "").toLowerCase();
    const fn = String(s?.function || "").toLowerCase();
    if (PRO_SERVICE_KEYWORDS.some((k) => st.includes(k) || fn.includes(k))) return true;
  }
  return false;
}

// Persist a vendor's last-used filter selections across sessions so Tim's
// preferred filters (e.g. Great Lakes states + Category 2) stick between visits.
function loadSavedFilters<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}
function saveFilters(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage unavailable (private mode / quota) — non-fatal */
  }
}

// ---------------------------------------------------------------------------
// VendorCommandCenter
// Dark, bento-style "command center" home for the vendor portal. Mirrors the
// SkyRate dashboard-revamp design concept: greeting header, opportunity KPI,
// a real 28-day bid-window ring for the next closing Form 470, a portfolio
// summary, a "needs your attention" queue of soonest-closing RFPs, a live
// opportunities feed, top customers, and quick actions. All wired to real data.
// ---------------------------------------------------------------------------
function VendorCommandCenter({
  profile, stats, entities, leads, leadsLoading, leadsLoaded, leadsTotal,
  savedCount, savedLoading, user, onTab, onOpenLead, dark,
}: {
  profile: VendorProfile | null;
  stats: { total_entities: number; total_authorized: number; funding_years: string[]; by_year?: { year: string; total: number; frn_count: number }[]; service_provider_name: string | null } | null;
  entities: ServicedEntity[];
  leads: Form470Lead[];
  leadsLoading: boolean;
  leadsLoaded: boolean;
  leadsTotal: number;
  savedCount: number;
  savedLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  onTab: (t: VendorTab) => void;
  onOpenLead: (app: string) => void;
  dark: boolean;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const company = stats?.service_provider_name || profile?.company_name || "there";
  const authM = stats ? stats.total_authorized / 1e6 : null;
  const yearsActive = stats?.funding_years?.length ?? 0;
  const planLabel = user?.role === 'super' ? 'Super' : user?.role === 'admin' ? 'Admin' : user?.subscription?.status === 'trialing' ? 'Trial' : 'Pro';

  const withDeadline = leads.map((l) => {
    const d = l.allowable_contract_date ? new Date(l.allowable_contract_date) : null;
    const days = d && !isNaN(d.getTime()) ? Math.ceil((d.getTime() - Date.now()) / 86400000) : null;
    return { l, days };
  });
  const closing = withDeadline.filter((x) => x.days != null && x.days >= 0).sort((a, b) => (a.days as number) - (b.days as number));
  const nextDeadline = closing[0] || null;
  const attention = closing.slice(0, 3);

  const RING = 28; // Form 470 minimum bidding window (days)
  const dLeft = nextDeadline?.days ?? null;
  const ringPct = dLeft != null ? Math.max(0, Math.min(1, dLeft / RING)) : 0;
  const R = 34;
  const CIRC = 2 * Math.PI * R;
  const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n}`;

  // Theme-aware class fragments
  const container = dark ? "bg-[#0a0a16] border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-900";
  const card = dark ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const faint = dark ? "text-slate-500" : "text-slate-400";
  const chip = dark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-600 border-slate-200";
  const link = dark ? "text-purple-300 hover:text-purple-200" : "text-purple-600 hover:text-purple-700";
  const rowHover = dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50";
  const softRow = dark ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-50 border-slate-200";
  const reachBtn = dark ? "bg-slate-700 hover:bg-slate-600 text-slate-100" : "bg-slate-200 hover:bg-slate-300 text-slate-800";
  const subInk = dark ? "text-slate-200" : "text-slate-800";
  const ringTrack = dark ? "#1e293b" : "#e2e8f0";
  const qaIcon = dark ? "bg-slate-800 text-purple-300" : "bg-slate-100 text-purple-600";
  const qaBtn = dark ? "bg-slate-900/60 border-slate-800 hover:border-purple-500/40 hover:bg-slate-800/60 text-slate-300 hover:text-white" : "bg-white border-slate-200 hover:border-purple-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm";

  return (
    <div className={`rounded-3xl border p-6 md:p-8 shadow-2xl ${container}`}>
      {/* Greeting header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {greeting}, <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{company}</span>
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            {stats ? (
              <>You service <span className={`font-medium ${subInk}`}>{stats.total_entities.toLocaleString()}</span> entities — {leadsLoaded ? (<><span className={`font-medium ${subInk}`}>{leadsTotal.toLocaleString()}</span> open opportunities today.</>) : "loading opportunities…"}</>
            ) : "Here's your E-Rate opportunity command center."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${chip}`}>{planLabel} plan</span>
          <button onClick={() => onTab("470-leads")} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all flex items-center gap-1.5">
            <Target className="w-4 h-4" /> Browse leads
          </button>
        </div>
      </div>

      {/* No-SPIN prompt */}
      {!profile?.spin && (
        <button onClick={() => onTab("settings")} className="w-full text-left mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 hover:bg-amber-500/15 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500"><Zap className="w-5 h-5" /></div>
          <div className="flex-1">
            <div className={`font-semibold ${dark ? "text-amber-200" : "text-amber-700"}`}>Connect your SPIN to unlock your portfolio</div>
            <div className={`text-sm ${dark ? "text-amber-200/70" : "text-amber-600"}`}>See the entities you service and your E-Rate history.</div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-500" />
        </button>
      )}

      {/* Top bento row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <button onClick={() => onTab("470-leads")} className={`text-left rounded-2xl p-5 border transition-all group ${dark ? "bg-gradient-to-br from-purple-600/20 to-pink-600/10 border-purple-500/20 hover:border-purple-400/40" : "bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100 hover:border-purple-300"}`}>
          <div className="flex items-center justify-between">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${dark ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-600"}`}><Target className="w-5 h-5" /></div>
            <ArrowUpRight className={`w-5 h-5 ${faint} group-hover:text-purple-400 transition-colors`} />
          </div>
          <div className="text-4xl font-bold mt-4">{leadsLoaded ? leadsTotal.toLocaleString() : "—"}</div>
          <div className={`text-sm mt-1 ${muted}`}>Open Form 470 opportunities</div>
        </button>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className={`flex items-center gap-2 text-sm mb-3 ${muted}`}><Clock className="w-4 h-4" /> Next bid deadline</div>
          {nextDeadline ? (
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r={R} fill="none" stroke={ringTrack} strokeWidth="8" />
                  <circle cx="48" cy="48" r={R} fill="none" stroke="url(#vccRing)" strokeWidth="8" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - ringPct)} transform="rotate(-90 48 48)" />
                  <defs><linearGradient id="vccRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#ec4899" /></linearGradient></defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold">{dLeft}</span>
                  <span className={`text-[10px] -mt-0.5 ${muted}`}>days</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{nextDeadline.l.entity_name}</div>
                <div className={`text-xs mt-0.5 ${muted}`}>{[nextDeadline.l.city, nextDeadline.l.state].filter(Boolean).join(", ")}</div>
                <button onClick={() => onOpenLead(nextDeadline.l.application_number)} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500 transition-all">Reach out →</button>
              </div>
            </div>
          ) : (
            <div className={`text-sm py-6 text-center ${faint}`}>No open bid deadlines right now.</div>
          )}
        </div>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className={`flex items-center gap-2 text-sm mb-3 ${muted}`}><Building2 className="w-4 h-4" /> Your portfolio</div>
          <div className="text-3xl font-bold">{authM != null ? `$${authM.toFixed(2)}M` : "—"}</div>
          <div className={`text-xs ${muted}`}>E-Rate authorized across your customers</div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className={muted}>Entities serviced</span><span className="font-semibold">{stats?.total_entities?.toLocaleString() ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className={muted}>Years active</span><span className="font-semibold">{yearsActive || "—"}</span></div>
            <div className="flex items-center justify-between"><span className={muted}>Saved leads</span><span className="font-semibold">{savedLoading && savedCount === 0 ? "—" : savedCount}</span></div>
          </div>
          {stats?.by_year && stats.by_year.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200/60">
              <div className={`text-xs mb-2 ${muted}`}>Authorized by funding year</div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {stats.by_year.map((y) => (
                  <div key={y.year} className="flex items-center justify-between text-sm">
                    <span className={muted}>FY{y.year} <span className="text-xs opacity-70">({y.frn_count.toLocaleString()} FRNs)</span></span>
                    <span className="font-semibold">${(y.total / 1_000_000).toFixed(2)}M</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between mb-3">
            <div><div className="font-semibold">Needs your attention</div><div className={`text-xs ${muted}`}>Opportunities closing soonest</div></div>
            <Bell className={`w-4 h-4 ${faint}`} />
          </div>
          {attention.length > 0 ? (
            <div className="space-y-2">
              {attention.map(({ l, days }) => (
                <div key={l.application_number} className={`flex items-center gap-3 rounded-xl border p-3 ${softRow}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${(days as number) <= 7 ? "bg-red-500/20 text-red-500" : "bg-amber-500/20 text-amber-600"}`}>{days}d</div>
                  <div className="flex-1 min-w-0"><div className="font-medium truncate text-sm">{l.entity_name}</div><div className={`text-xs truncate ${muted}`}>{[l.city, l.state].filter(Boolean).join(", ")}</div></div>
                  <button onClick={() => onOpenLead(l.application_number)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0 ${reachBtn}`}>Reach out</button>
                </div>
              ))}
            </div>
          ) : (
            <div className={`text-sm py-8 text-center ${faint}`}>{leadsLoading && !leadsLoaded ? "Loading…" : "You're all caught up."}</div>
          )}
        </div>

        <div className={`rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center justify-between mb-3">
            <div><div className="font-semibold">Latest opportunities</div><div className={`text-xs ${muted}`}>Newest RFPs posted to USAC</div></div>
            <button onClick={() => onTab("470-leads")} className={`text-xs font-medium ${link}`}>Browse all →</button>
          </div>
          {leadsLoading && leads.length === 0 ? (
            <div className={`text-sm py-8 text-center ${faint}`}>Loading opportunities…</div>
          ) : leads.length === 0 ? (
            <div className={`text-sm py-8 text-center ${faint}`}>No open Form 470s to show.</div>
          ) : (
            <div className="space-y-1.5">
              {leads.slice(0, 5).map((l) => {
                const cat = (l.categories || [])[0] || (l.service_types || [])[0];
                return (
                  <button key={l.application_number} onClick={() => onOpenLead(l.application_number)} className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${rowHover}`}>
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 shrink-0" />
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{l.entity_name}</div><div className={`text-xs truncate ${muted}`}>{[l.city, l.state].filter(Boolean).join(", ")}{cat ? ` · ${cat}` : ""}</div></div>
                    <ChevronRight className={`w-4 h-4 shrink-0 ${faint}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top customers */}
      {entities.length > 0 && (
        <div className={`rounded-2xl border p-5 mt-5 ${card}`}>
          <div className="flex items-center justify-between mb-3">
            <div><div className="font-semibold">Top customers by E-Rate funding</div><div className={`text-xs ${muted}`}>Your highest-value relationships</div></div>
            <button onClick={() => onTab("my-entities")} className={`text-xs font-medium ${link}`}>View all →</button>
          </div>
          <div className="space-y-1.5">
            {entities.slice(0, 5).map((e, i) => (
              <div key={e.ben} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${rowHover}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${dark ? "bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-purple-200" : "bg-gradient-to-br from-purple-100 to-pink-100 text-purple-600"}`}>{i + 1}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{e.organization_name}</div><div className={`text-xs ${muted}`}>{e.state} · {e.frn_count} FRNs · {e.funding_years?.length || 0} yrs</div></div>
                <div className={`text-sm font-semibold ${dark ? "text-emerald-400" : "text-emerald-600"}`}>{money(e.total_amount || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {([
          { label: "Browse 470 leads", icon: <Target className="w-5 h-5" />, tab: "470-leads" as VendorTab },
          { label: "FRN status", icon: <BarChart3 className="w-5 h-5" />, tab: "frn-status" as VendorTab },
          { label: "Search schools", icon: <Search className="w-5 h-5" />, tab: "search" as VendorTab },
          { label: "Competitive intel", icon: <TrendingUp className="w-5 h-5" />, tab: "competitive" as VendorTab },
        ]).map((a) => (
          <button key={a.label} onClick={() => onTab(a.tab)} className={`rounded-2xl border p-4 flex flex-col items-center gap-2 transition-all ${qaBtn}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${qaIcon}`}>{a.icon}</div>
            <span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function VendorPortalWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <VendorPortalPage />
    </Suspense>
  );
}

function VendorTeamPanel() {
  const [team, setTeam] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // B9: which pending seat's invite link was just copied (transient "Copied" hint).
  const [copiedSeatId, setCopiedSeatId] = useState<number | null>(null);

  // Build the shareable invite link for a pending seat. Lets the owner onboard a
  // teammate manually when the invite email is delayed or never arrives.
  const copyInviteLink = async (seat: any) => {
    if (!seat?.invite_token) return;
    const link = `${window.location.origin}/accept-seat?token=${seat.invite_token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
    setCopiedSeatId(seat.id);
    setTimeout(() => setCopiedSeatId((cur) => (cur === seat.id ? null : cur)), 2000);
  };

  const loadTeam = async () => {
    const res = await api.getVendorTeam();
    if (res.data?.success) {
      setTeam(res.data);
      setVisible(true);
    } else {
      // 403 (seat / non-owner) or any failure -> hide the panel entirely.
      setVisible(false);
    }
    setLoaded(true);
  };

  useEffect(() => {
    loadTeam();
  }, []);

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setBusy(true);
    const res = await api.inviteVendorTeam(trimmed);
    setBusy(false);
    if (res.data?.success) {
      setEmail("");
      await loadTeam();
      alert("Invite sent.");
    } else {
      alert(res.data?.detail || res.data?.error || res.error || "Request failed");
    }
  };

  const handleRemove = async (seatId: number) => {
    if (!confirm("Remove this team member? They will lose access to your account.")) return;
    setBusy(true);
    const res = await api.removeVendorTeamSeat(seatId);
    setBusy(false);
    if (res.data?.success) {
      await loadTeam();
    } else {
      alert(res.data?.detail || res.data?.error || res.error || "Request failed");
    }
  };

  if (!loaded || !visible || !team) return null;

  const seatLimit: number = team.seat_limit || 0;
  const used: number = team.used || 0;
  const seats: any[] = team.seats || [];
  const atLimit = used >= seatLimit;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900">My Team</h2>
        <span className="text-sm font-medium text-slate-500">
          Used {used} / {seatLimit}
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Invite teammates to share your account. They sign in with their own
        credentials and can do everything except manage billing.
      </p>

      {seatLimit === 0 ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
          Your plan doesn&apos;t include team seats yet. Contact your administrator
          to add seats.
        </div>
      ) : (
        <>
          {seats.length > 0 && (
            <div className="space-y-2 mb-4">
              {seats.map((seat) => (
                <div
                  key={seat.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-slate-800 truncate">{seat.invited_email}</span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                        seat.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {seat.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {seat.status === "invited" && seat.invite_token && (
                      <button
                        onClick={() => copyInviteLink(seat)}
                        disabled={busy}
                        className="px-2.5 py-1 text-[11px] font-medium text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-md transition disabled:opacity-50"
                      >
                        {copiedSeatId === seat.id ? "Copied!" : "Copy invite link"}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(seat.id)}
                      disabled={busy}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-white hover:bg-red-500 border border-slate-200 hover:border-red-500 rounded-md transition disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              disabled={busy || atLimit}
              onKeyDown={(e) => e.key === "Enter" && !busy && !atLimit && handleInvite()}
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            />
            <button
              onClick={handleInvite}
              disabled={busy || atLimit}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
            >
              Invite
            </button>
          </div>
          {atLimit && (
            <p className="mt-2 text-xs text-slate-400">
              Seat limit reached. Contact your administrator to add more seats.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function VendorPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, _hasHydrated } = useAuthStore();
  const { verified: emailVerified, checking: checkingVerification } = useVerificationGuard();
  
  const [activeTab, setActiveTab] = useTabParam<VendorTab>("dashboard", VENDOR_TABS);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Dark / light theme for the whole vendor portal shell. On first load we honor
  // the visitor's OS preference (prefers-color-scheme); once they toggle, that
  // explicit choice is remembered per-browser and wins over the OS setting.
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // First-visit hint: gently point out the theme toggle until the user has
  // either toggled it or dismissed the tip once.
  const [themeHint, setThemeHint] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("vendor_theme");
    if (saved === "light" || saved === "dark") { setTheme(saved); return; }
    // No saved choice yet -> follow the operating system / browser preference.
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) setTheme("light");
    if (!localStorage.getItem("vendor_theme_hint_seen")) setThemeHint(true);
  }, []);
  const dismissThemeHint = () => {
    setThemeHint(false);
    try { localStorage.setItem("vendor_theme_hint_seen", "1"); } catch { /* ignore */ }
  };
  const toggleTheme = () => {
    dismissThemeHint();
    setTheme((p) => {
      const next = p === "dark" ? "light" : "dark";
      try { localStorage.setItem("vendor_theme", next); } catch { /* ignore */ }
      return next;
    });
  };
  const dark = theme === "dark";
  
  // Search filters
  const [searchState, setSearchState] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [searchServiceType, setSearchServiceType] = useState("");
  const [searchYear, setSearchYear] = useState(2026);
  const [searchMinAmount, setSearchMinAmount] = useState("");
  const [searchMaxAmount, setSearchMaxAmount] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searchPageSize, setSearchPageSize] = useState(25);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  
  // SPIN state
  const [spinInput, setSpinInput] = useState("");
  const [spinValidating, setSpinValidating] = useState(false);
  const [spinValidation, setSpinValidation] = useState<SpinValidationResult | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [servicedEntities, setServicedEntities] = useState<ServicedEntity[]>([]);
  const [servicedEntitiesLoading, setServicedEntitiesLoading] = useState(false);
  const [servicedEntitiesStats, setServicedEntitiesStats] = useState<{
    total_entities: number;
    total_authorized: number;
    funding_years: string[];
    by_year?: { year: string; total: number; frn_count: number }[];
    service_provider_name: string | null;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Replace SPIN modal state (demo/test accounts)
  const [showReplaceSpinModal, setShowReplaceSpinModal] = useState(false);
  const [replaceSpinInput, setReplaceSpinInput] = useState("");
  const [replacingSpinLoading, setReplacingSpinLoading] = useState(false);
  const [replaceSpinError, setReplaceSpinError] = useState<string | null>(null);
  
  // Entity detail modal state
  const [selectedEntity, setSelectedEntity] = useState<ServicedEntity | null>(null);
  const [entityDetailLoading, setEntityDetailLoading] = useState(false);
  const [entityDetail, setEntityDetail] = useState<EntityDetailResponse | null>(null);
  const [showEntityModal, setShowEntityModal] = useState(false);
  
  // Search result detail modal state
  const [selectedSearchResult, setSelectedSearchResult] = useState<SearchResult | null>(null);
  const [searchResultDetailLoading, setSearchResultDetailLoading] = useState(false);
  const [showSearchResultModal, setShowSearchResultModal] = useState(false);
  
  // Form 471 Competitive Analysis state
  const [form471BenInput, setForm471BenInput] = useState("");
  const [form471Year, setForm471Year] = useState<number | undefined>(undefined);
  const [form471Loading, setForm471Loading] = useState(false);
  const [form471Data, setForm471Data] = useState<Form471ByEntityResponse | null>(null);
  const [form471Error, setForm471Error] = useState<string | null>(null);
  // Entity's Form 470 filings for the 471 Lookup entity, so the vendor can
  // download the certified Form 470 PDF (parity with consultant/applicant).
  const [entity470Filings, setEntity470Filings] = useState<Form470Lead[]>([]);
  // Per-entity Form 471 purchase-history drill-down (B5) — opened from the 471 Lookup view.
  const [purchaseHistoryBen, setPurchaseHistoryBen] = useState<string | null>(null);
  const [competitorData, setCompetitorData] = useState<CompetitorAnalysisResponse | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  // Category scope for the competitor analysis: '' = All, '1' = Cat 1, '2' = Cat 2.
  // A Category-2 equipment reseller can exclude Cat1 internet volume that skews
  // the report (Tim Clark / Laketec).
  const [competitorCategory, setCompetitorCategory] = useState<'' | '1' | '2'>("");
  
  // FRN Status Monitoring state (Sprint 2)
  const [frnStatusData, setFrnStatusData] = useState<FRNStatusResponse | null>(null);
  const [frnStatusLoading, setFrnStatusLoading] = useState(false);
  const [frnStatusGlobalView, setFrnStatusGlobalView] = useState<boolean>(false);
  const [frnStatusYear, setFrnStatusYear] = useState<number | undefined>(undefined);
  const [frnStatusFilter, setFrnStatusFilter] = useState<string>("");
  const [frnPendingReason, setFrnPendingReason] = useState<string>("");
  const [frnSearch, setFrnSearch] = useState<string>("");
  // 2026-06-09: add SPIN / CRN search inputs (mirror consultant FRN tracker).
  const [frnSpinSearch, setFrnSpinSearch] = useState<string>("");
  const [frnCrnSearch, setFrnCrnSearch] = useState<string>("");
  const [selectedFRN, setSelectedFRN] = useState<FRNStatusRecord | null>(null);
  const [showFRNDetailModal, setShowFRNDetailModal] = useState(false);
  const [disbursementOpen, setDisbursementOpen] = useState(false);
  // B8: per-FRN free-form manual notes (vendor-scoped). Loaded lazily on open.
  const [frnNotes, setFrnNotes] = useState<Record<string, string>>({});
  const [frnNoteOpen, setFrnNoteOpen] = useState<string | null>(null);
  const [frnNoteDraft, setFrnNoteDraft] = useState<string>("");
  const [frnNoteSaving, setFrnNoteSaving] = useState<boolean>(false);
  const [frnTableSort, setFrnTableSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  // Incremental "load more" count so users can page past the first 100 FRNs
  // (mirrors the consultant portfolio FRN table). Reset whenever the underlying
  // data or filters change so we never leave a stale large window mounted.
  const [visibleFrnCount, setVisibleFrnCount] = useState<number>(100);

  // Per-FRN vendor working annotations (A6 install, A7 co-pay, notes) — mirrors
  // the consultant FRN tracker. Funding status + PIA come from USAC and are
  // shown in the table, so the modal tracks only what USAC does not provide.
  const [frnTrackingMap, setFrnTrackingMap] = useState<Record<string, FrnTracking>>({});
  const [trackingModalFrn, setTrackingModalFrn] = useState<string | null>(null);
  const [trackingForm, setTrackingForm] = useState<FrnTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [vendorFrnTrackingFilter, setVendorFrnTrackingFilter] = useState<string>("");

  // Load all of the account's FRN tracking rows once (drives at-a-glance badges).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.vendorGetFrnTracking();
        if (!cancelled && resp.success && resp.data?.success && resp.data.tracking && typeof resp.data.tracking === 'object') {
          setFrnTrackingMap(resp.data.tracking as Record<string, FrnTracking>);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const openTrackingModal = async (frn: string, ben?: string) => {
    if (!frn) return;
    setTrackingModalFrn(frn);
    setTrackingLoading(true);
    setTrackingForm({ frn, ben: ben || null });
    try {
      const resp = await api.vendorGetFrnTracking(frn);
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
      const resp = await api.vendorUpsertFrnTracking({
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

  // Sorted and filtered FRN data for table display
  const sortedFrnData = useMemo(() => {
    if (!frnStatusData?.frns?.length) return [];
    
    let filtered = frnStatusData.frns;

    // Client-side search by FRN / Entity / BEN only (sub-status has its own input)
    if (frnSearch.trim()) {
      const search = frnSearch.trim().toLowerCase();
      filtered = filtered.filter(frn =>
        (frn.frn || '').toLowerCase().includes(search) ||
        (frn.entity_name || '').toLowerCase().includes(search) ||
        (frn.ben || '').toLowerCase().includes(search)
      );
    }

    // Client-side filter by sub-status / pending reason (its own dedicated input)
    if (frnPendingReason.trim()) {
      const pr = frnPendingReason.trim().toLowerCase();
      filtered = filtered.filter(frn => (frn.pending_reason || '').toLowerCase().includes(pr));
    }

    // Filter by status if a filter is selected
    if (frnStatusFilter) {
      filtered = filtered.filter(frn => {
        const status = (frn.status || '').toLowerCase();
        const filter = frnStatusFilter.toLowerCase();
        if (filter === 'funded') return status.includes('funded') || status.includes('committed');
        if (filter === 'denied') return status.includes('denied');
        if (filter === 'pending') return status.includes('pending') || status.includes('review') || status.includes('wave');
        return true;
      });
    }

    // Client-side filter by the vendor's own per-FRN tracking (install / co-pay).
    if (vendorFrnTrackingFilter) {
      filtered = filtered.filter(frn => {
        const t = frnTrackingMap[frn.frn];
        const f = vendorFrnTrackingFilter;
        if (f === 'tracked') return !!t;
        if (f === 'installed') return !!t?.installed;
        if (f === 'not_installed') return !t?.installed;
        if (f === 'copay_paid') return !!t?.copay_paid;
        if (f === 'copay_unpaid') return !t?.copay_paid;
        return true;
      });
    }

    // Then sort if sorting is active
    if (!frnTableSort) return filtered;
    
    const sorted = [...filtered].sort((a, b) => {
      const aVal = ((a as any)[frnTableSort.field] || '').toString().toLowerCase();
      const bVal = ((b as any)[frnTableSort.field] || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return frnTableSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [frnStatusData?.frns, frnTableSort, frnStatusFilter, frnSearch, frnPendingReason, vendorFrnTrackingFilter, frnTrackingMap]);

  // Pending Reason dropdown options: the full canonical USAC sub-status list
  // (so the vendor is never "missing" any relative to the consultant), plus any
  // extra distinct reasons actually present in the loaded FRNs.
  const frnPendingReasonOptions = useMemo(() => {
    const set = new Set<string>(FRN_PENDING_REASON_OPTIONS);
    (frnStatusData?.frns || []).forEach((f: FRNStatusRecord) => {
      const r = (f.pending_reason || '').trim();
      if (r) set.add(r);
    });
    return Array.from(set);
  }, [frnStatusData?.frns]);

  // Reset the visible window whenever the data set or filters change so a fresh
  // load always starts at the first 100 rows.
  useEffect(() => {
    setVisibleFrnCount(100);
  }, [frnStatusData?.frns, frnStatusFilter, frnSearch, frnPendingReason, vendorFrnTrackingFilter]);

  // Toggle FRN table sort
  const toggleFrnTableSort = (field: string) => {
    setFrnTableSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle Form 470 leads sort
  const toggleForm470Sort = (field: string) => {
    setForm470Sort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle school search sort
  const toggleSchoolSearchSort = (field: string) => {
    setSchoolSearchSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle serviced entities sort
  const toggleServicedEntitiesSort = (field: string) => {
    setServicedEntitiesSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  const [frnWatches, setFrnWatches] = useState<FRNWatch[]>([]);
  const [showCreateWatch, setShowCreateWatch] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [reportHistory, setReportHistory] = useState<FRNReportHistory[]>([]);
  const [selectedReport, setSelectedReport] = useState<{html: string; name: string} | null>(null);
  const [showReportArchive, setShowReportArchive] = useState(false);
  
  // Table sort states for entity columns
  const [form470Sort, setForm470Sort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [form470ApplicantType, setForm470ApplicantType] = useState<string>("");
  const [schoolSearchSort, setSchoolSearchSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [servicedEntitiesSort, setServicedEntitiesSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);

  // Form 470 Lead Generation state (Sprint 3)
  const [form470Leads, setForm470Leads] = useState<Form470Lead[]>([]);
  const [form470Loading, setForm470Loading] = useState(false);
  const [form470Error, setForm470Error] = useState<string | null>(null);
  const [form470Filters, setForm470Filters] = useState<{
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    equipment_type?: string;
    service_function?: string;
    min_speed?: string;
    max_speed?: string;
    sort_by?: string;
    min_deal_value?: number;
    max_deal_value?: number;
    name?: string;
  }>({ year: getUpcomingFundingYear() });
  // Rehydrate the vendor's last-used Form 470 filters once on mount; keep the
  // upcoming-funding-year default only when nothing was saved (Tim's Great Lakes
  // + Cat 2 selection sticks between visits). Persist on every subsequent change.
  const form470FiltersSkipPersist = useRef(true);
  useEffect(() => {
    const saved = loadSavedFilters<typeof form470Filters>("vendor_470_filters");
    if (saved) setForm470Filters(saved);
  }, []);
  useEffect(() => {
    if (form470FiltersSkipPersist.current) {
      form470FiltersSkipPersist.current = false;
      return;
    }
    saveFilters("vendor_470_filters", form470Filters);
  }, [form470Filters]);
  const [form470TotalLeads, setForm470TotalLeads] = useState(0);
  const [form470Detail, setForm470Detail] = useState<Form470DetailResponse | null>(null);
  const [form470DetailLoading, setForm470DetailLoading] = useState(false);
  const [showForm470Modal, setShowForm470Modal] = useState(false);
  // Application number currently resolving a real certified Form 470/471 PDF (per-row spinner).
  const [pdfBusyApp, setPdfBusyApp] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Resolve + download the ACTUAL certified Form 470/471 PDF from USAC Open Data.
  const downloadFormPdf = async (form: '470' | '471', applicationNumber?: string | null) => {
    const app = String(applicationNumber || '').trim();
    if (!app) return;
    setPdfBusyApp(app);
    setPdfError(null);
    try {
      const resp = await api.vendorFormPdfUrl(form, app);
      const url = resp.success && resp.data ? resp.data.pdf_url : null;
      if (url) {
        await forceDownloadFile(url, `FCC_Form_${form}_${app}_CERTIFIED.pdf`);
      } else {
        setPdfError(`No certified Form ${form} PDF is published by USAC for application ${app}${form === '471' ? ' (only original certified versions are available)' : ''}.`);
      }
    } catch {
      setPdfError(`Could not fetch the Form ${form} PDF. Please try again.`);
    } finally {
      setPdfBusyApp(null);
    }
  };

  // Dashboard "Latest Opportunities" — a lightweight, newest-first slice of Form 470
  // leads shown on the landing dashboard. Kept separate from the full 470-leads tab
  // state so the two never interfere.
  const [dashLeads, setDashLeads] = useState<Form470Lead[]>([]);
  const [dashLeadsLoading, setDashLeadsLoading] = useState(false);
  const [dashLeadsTotal, setDashLeadsTotal] = useState(0);
  const [dashLeadsLoaded, setDashLeadsLoaded] = useState(false);

  // BEN lookup box (Form 470 Leads tab): jump straight to an entity's 470.
  const [benLookup, setBenLookup] = useState("");
  const [benLookupLoading, setBenLookupLoading] = useState(false);
  const [benLookupMsg, setBenLookupMsg] = useState<string | null>(null);
  const [benLookupResults, setBenLookupResults] = useState<Form470Lead[]>([]);

  // Invoicing tab: vendor's own SPIN-scoped disbursement schedule.
  const [invoiceData, setInvoiceData] = useState<VendorDisbursementResponse | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceLoaded, setInvoiceLoaded] = useState(false);
  const [invoiceYear, setInvoiceYear] = useState<number | undefined>(undefined);
  const [invoiceExpanded, setInvoiceExpanded] = useState<Set<string>>(new Set());
  
  // Saved Leads state
  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [savedLeadsLoading, setSavedLeadsLoading] = useState(false);
  const [savedLeadsTotalCount, setSavedLeadsTotalCount] = useState(0);
  const [savedLeadsFilter, setSavedLeadsFilter] = useState<string>('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  // B7: per-stage totals for the CRM pipeline bar (always across all leads, not the filtered view)
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});
  
  // Lead saving/enrichment state for the modal
  const [isLeadSaved, setIsLeadSaved] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [enrichingLead, setEnrichingLead] = useState(false);
  const [currentSavedLead, setCurrentSavedLead] = useState<SavedLead | null>(null);
  const [enrichmentData, setEnrichmentData] = useState<EnrichedContactData | null>(null);

  // Saved Lead Detail Modal state (for predicted/non-470 leads)
  const [showSavedLeadDetailModal, setShowSavedLeadDetailModal] = useState(false);
  const [selectedSavedLeadDetail, setSelectedSavedLeadDetail] = useState<SavedLead | null>(null);
  
  // Form 470 Leads selection for export
  const [selectedForm470Leads, setSelectedForm470Leads] = useState<Set<string>>(new Set());
  
  // FRN Status selection for export
  const [selectedFrns, setSelectedFrns] = useState<Set<string>>(new Set());
  
  // Serviced Entities selection for export
  const [selectedServicedEntities, setSelectedServicedEntities] = useState<Set<string>>(new Set());
  
  // Form 471 Records selection for export
  const [selectedForm471Records, setSelectedForm471Records] = useState<Set<string>>(new Set());
  
  // Form 471 FRN line-item expansion (cached per FRN so re-clicking doesn't refetch)
  const [expanded471Frn, setExpanded471Frn] = useState<string | null>(null);
  const [form471LineItemsCache, setForm471LineItemsCache] = useState<Record<string, Form471LineItem[]>>({});
  const [form471LineItemsLoadingFrn, setForm471LineItemsLoadingFrn] = useState<string | null>(null);

  // When the user opens the 471 for a SPECIFIC predicted-lead FRN, we focus the
  // table on just that FRN (and auto-expand it) instead of dumping every FRN for
  // the entity. null = show all FRNs (normal manual lookup).
  const [focus471Frn, setFocus471Frn] = useState<string | null>(null);

  // A4: the USAC 471 dataset returns one row per line item, so an FRN with N
  // line items appears N times. Collapse to one row per FRN (summing the
  // line-item committed amounts); the per-FRN line items are revealed by
  // expanding the row.
  const grouped471Records = useMemo(() => {
    const byFrn = new Map<string, Form471Record>();
    (form471Data?.records || []).forEach((r, i) => {
      const key = r.frn || `__nofrn_${i}`;
      const existing = byFrn.get(key);
      if (existing) {
        existing.committed_amount = (existing.committed_amount || 0) + (r.committed_amount || 0);
        existing.pre_discount_amount = (existing.pre_discount_amount || 0) + (r.pre_discount_amount || 0);
      } else {
        byFrn.set(key, { ...r });
      }
    });
    return Array.from(byFrn.values());
  }, [form471Data]);

  // Records actually shown in the FRN table. When focused on a single FRN (opened
  // from a predicted lead) show only that FRN so the vendor sees exactly the
  // relevant contract; otherwise show them all.
  const displayed471Records = useMemo(() => {
    if (focus471Frn && grouped471Records.some(r => r.frn === focus471Frn)) {
      return grouped471Records.filter(r => r.frn === focus471Frn);
    }
    return grouped471Records;
  }, [grouped471Records, focus471Frn]);
  
  // Payment guard - check if user needs to complete payment setup
  const [checkingPayment, setCheckingPayment] = useState(true);

  // Sorted Form 470 leads for table display
  const sortedForm470Leads = useMemo(() => {
    let list = form470Leads;
    // Client-side filter by applicant/school type (Ari #9 - vendor requested).
    // USAC has no "Charter School" applicant_type, so "__charter__" matches by name
    // (charter schools carry "charter" in their entity name) — same approach as
    // predictive leads.
    if (form470ApplicantType === '__charter__') {
      list = list.filter((l) => /charter/i.test(l.entity_name || ''));
    } else if (form470ApplicantType) {
      list = list.filter((l) => (l.applicant_type || '') === form470ApplicantType);
    }
    if (!list.length || !form470Sort) return list;
    return [...list].sort((a, b) => {
      const aVal = (a.entity_name || '').toString().toLowerCase();
      const bVal = (b.entity_name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return form470Sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [form470Leads, form470Sort, form470ApplicantType]);

  // Distinct applicant/school types present in the loaded 470 leads (for the filter dropdown)
  const form470ApplicantTypes = useMemo(() => {
    const s = new Set<string>();
    form470Leads.forEach((l) => { if (l.applicant_type) s.add(l.applicant_type); });
    return Array.from(s).sort();
  }, [form470Leads]);

  // Sorted search results for table display
  const sortedSearchResults = useMemo(() => {
    if (!searchResults.length || !schoolSearchSort) return searchResults;
    return [...searchResults].sort((a, b) => {
      const aVal = (a.name || '').toString().toLowerCase();
      const bVal = (b.name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return schoolSearchSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [searchResults, schoolSearchSort]);

  // Sorted serviced entities for table display
  const sortedServicedEntities = useMemo(() => {
    if (!servicedEntities.length || !servicedEntitiesSort) return servicedEntities;
    return [...servicedEntities].sort((a, b) => {
      const aVal = (a.organization_name || '').toString().toLowerCase();
      const bVal = (b.organization_name || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return servicedEntitiesSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [servicedEntities, servicedEntitiesSort]);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!_hasHydrated || checkingVerification) return;
      if (!isAuthenticated) {
        router.push("/sign-in");
        return;
      }
      // Verification guard handles redirect to /onboarding
      if (!emailVerified) return;
      if (user?.role !== "vendor" && user?.role !== "admin" && user?.role !== "super") {
        // Redirect to appropriate dashboard based on role
        const dashboard = user?.role === 'applicant' ? '/applicant' : '/consultant';
        router.push(dashboard);
        return;
      }
      
      // Check if payment setup is required.
      //
      // Fast path: derive from `user.subscription` already persisted by Zustand.
      // This eliminates a network round-trip on every dashboard mount /
      // tab navigation. Only fall back to /payment-status when the persisted
      // subscription record is missing (first load after fresh signup,
      // test-account auto-grant, promo-invite expiry recompute, etc.).
      let redirected = false;
      try {
        const derived = deriveRequiresPaymentSetup(user);
        if (derived === true) {
          redirected = true;
          router.push("/subscribe");
          return;
        }
        if (derived === null) {
          const paymentStatus = await api.getPaymentStatus();
          if (paymentStatus.success && paymentStatus.data?.requires_payment_setup) {
            redirected = true;
            router.push("/subscribe");
            return;
          }
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
        // If we can't check payment status, continue to dashboard
        // The backend will enforce payment requirements on API calls
      } finally {
        if (!redirected) {
          setCheckingPayment(false);
        }
      }

      loadProfile();
    };
    
    checkPaymentStatus();
  }, [_hasHydrated, isAuthenticated, user, router, checkingVerification, emailVerified]);

  // Deep link handling: open FRN detail modal from email links
  // URL format: /vendor?tab=frn-status&frn=XXXXX
  const searchParams = useSearchParams();
  const frnParam = searchParams.get('frn');
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (frnParam && !isLoading && !deepLinkHandled.current) {
      deepLinkHandled.current = true;
      setFrnSearch(frnParam);
      setActiveTab("frn-status");
      // Auto-load FRN data if the table hasn't been populated yet so the
      // target row exists. Without this, the email-link click lands on an
      // empty tab and the scroll target is never found.
      if (!frnStatusData && !frnStatusLoading) {
        loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, frnStatusGlobalView);
      }
      // Scroll to the matching row after a brief delay for render.
      // Two attempts so it survives the async data load.
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

  // Load saved leads when the "leads" tab is activated
  useEffect(() => {
    if (activeTab === "leads" && savedLeads.length === 0 && !savedLeadsLoading) {
      loadSavedLeads();
    }
    if (activeTab === 'frn-status') {
      loadFRNWatches();
      loadReportHistory();
    }
    // Auto-enable Global View on FRN tab if vendor has no SPIN configured (Demo Mode)
    if (activeTab === "frn-status" && !profile?.spin && !isLoading) {
      setFrnStatusGlobalView(true);
    }
    // Perf (A4): fetch serviced entities (USAC roundtrip) lazily — only when
    // the dashboard or "my-entities" tab is open. The dashboard needs the
    // stats payload to render its purple success banner; without it, the
    // banner would fall back to the "Complete Your Profile" warning even
    // when a SPIN is already saved. The length/loading guard prevents a
    // double-fire when switching between dashboard and my-entities.
    if ((activeTab === 'dashboard' || activeTab === 'my-entities') && profile?.spin && servicedEntities.length === 0 && !servicedEntitiesLoading) {
      loadServicedEntities();
    }
    // Dashboard command-center data: newest Form 470 opportunities + the vendor's
    // saved-lead pipeline count. Both load once, lazily, when the dashboard opens.
    if (activeTab === 'dashboard' && !dashLeadsLoaded && !dashLeadsLoading) {
      loadDashboardOpportunities();
    }
    if (activeTab === 'dashboard' && savedLeads.length === 0 && !savedLeadsLoading) {
      loadSavedLeads();
    }
    // Invoicing tab: load the vendor's disbursement schedule once on open.
    if (activeTab === 'invoicing' && !invoiceLoaded && !invoiceLoading) {
      loadInvoices(invoiceYear);
    }
  }, [activeTab, profile?.spin]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await api.getVendorProfile();
      if (response.success && response.data) {
        setProfile(response.data.profile);
        // Initialize SPIN input with profile SPIN if exists.
        // Perf (A4): we used to also fire `loadServicedEntities()` here, which
        // triggers a USAC roundtrip and was the biggest single contributor to
        // slow dashboard loads. It is now lazy-loaded only when the
        // "my-entities" tab is selected (see useEffect below).
        if (response.data.profile.spin) {
          setSpinInput(response.data.profile.spin);
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateSpin = async () => {
    if (!spinInput.trim()) {
      setSpinError("Please enter a SPIN");
      return;
    }
    
    setSpinValidating(true);
    setSpinError(null);
    setSpinValidation(null);
    
    try {
      const response = await api.validateSpin(spinInput.trim());
      if (response.success && response.data?.valid) {
        setSpinValidation(response.data.provider!);
        setSpinError(null);
      } else {
        setSpinError(response.data?.error || response.error || "Invalid SPIN");
        setSpinValidation(null);
      }
    } catch (error) {
      console.error("SPIN validation failed:", error);
      setSpinError("Failed to validate SPIN. Please try again.");
    } finally {
      setSpinValidating(false);
    }
  };

  const saveSpin = async () => {
    if (!spinValidation) {
      setSpinError("Please validate your SPIN first");
      return;
    }
    
    setSavingProfile(true);
    try {
      const response = await api.updateVendorProfile({
        spin: spinInput.trim(),
        company_name: spinValidation.service_provider_name || profile?.company_name,
      });
      
      if (response.success && response.data) {
        setProfile(response.data.profile);
        // Fetch serviced entities after saving SPIN
        loadServicedEntities();
      }
    } catch (error) {
      console.error("Failed to save SPIN:", error);
      setSpinError("Failed to save SPIN. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Replace SPIN handler (demo/test accounts)
  const isDemoAccount = user?.email?.includes('test_') || user?.email?.includes('demo') || user?.role === 'admin' || user?.role === 'super';

  const handleReplaceSpin = async () => {
    const newSpin = replaceSpinInput.trim();
    if (!newSpin) {
      setReplaceSpinError("Please enter the new SPIN");
      return;
    }
    setReplacingSpinLoading(true);
    setReplaceSpinError(null);
    try {
      const response = await api.replaceVendorSpin(newSpin);
      if (response.success && response.data) {
        const d = response.data;
        setShowReplaceSpinModal(false);
        setReplaceSpinInput("");
        // Refresh profile
        const profileRes = await api.getVendorProfile();
        if (profileRes.success && profileRes.data) {
          setProfile(profileRes.data.profile);
          setSpinInput(profileRes.data.profile.spin || "");
        }
        alert(
          `[OK] Swapped to ${d.name || d.new_id}. Building snapshot in background...\n\n` +
          `Old SPIN: ${d.old_id}\nNew SPIN: ${d.new_id}`
        );
      } else {
        setReplaceSpinError(response.error || "Failed to replace SPIN");
      }
    } catch (error: any) {
      console.error("Failed to replace SPIN:", error);
      setReplaceSpinError(error?.message || "Failed to replace SPIN");
    } finally {
      setReplacingSpinLoading(false);
    }
  };

  const loadServicedEntities = async () => {
    setServicedEntitiesLoading(true);
    try {
      const response = await api.getServicedEntities();
      if (response.success && response.data) {
        setServicedEntities(response.data.entities || []);
        setServicedEntitiesStats({
          total_entities: response.data.total_entities,
          total_authorized: response.data.total_authorized,
          funding_years: response.data.funding_years,
          by_year: response.data.by_year,
          service_provider_name: response.data.service_provider_name,
        });
      }
    } catch (error) {
      console.error("Failed to load serviced entities:", error);
    } finally {
      setServicedEntitiesLoading(false);
    }
  };

  const loadEntityDetail = async (entity: ServicedEntity) => {
    setSelectedEntity(entity);
    setShowEntityModal(true);
    setEntityDetailLoading(true);
    setEntityDetail(null);
    
    try {
      const response = await api.getEntityDetail(entity.ben);
      if (response.success && response.data) {
        setEntityDetail(response.data);
      }
    } catch (error) {
      console.error("Failed to load entity detail:", error);
    } finally {
      setEntityDetailLoading(false);
    }
  };

  const closeEntityModal = () => {
    setShowEntityModal(false);
    setSelectedEntity(null);
    setEntityDetail(null);
  };

  // Form 471 Competitive Analysis functions.
  // Optional args let callers (e.g. "View 471" from a predicted lead) run a
  // lookup immediately without waiting for the BEN/year input state to flush.
  // When benArg is provided the args are authoritative (an undefined yearArg
  // therefore means "all years", not "fall back to the stale year input").
  const search471ByBen = async (benArg?: string, yearArg?: number) => {
    const usingArgs = benArg !== undefined;
    const ben = (usingArgs ? benArg : form471BenInput).trim();
    if (!ben) {
      setForm471Error("Please enter a BEN (Billed Entity Number)");
      return;
    }
    const year = usingArgs ? yearArg : form471Year;
    
    setForm471Loading(true);
    setForm471Error(null);
    setForm471Data(null);
    setEntity470Filings([]);
    
    try {
      const response = await api.get471ByEntity(ben, year);
      if (response.success && response.data) {
        if (response.data.success) {
          setForm471Data(response.data);
          // Best-effort: also pull the entity's Form 470 filing(s) so the vendor
          // can download the certified Form 470 PDF. Non-blocking; empty when the
          // entity has no 470 in the local (current/next-year) snapshot.
          try {
            const f470 = await api.get470ByBen(ben);
            setEntity470Filings(f470.success && f470.data?.leads ? f470.data.leads : []);
          } catch {
            setEntity470Filings([]);
          }
        } else {
          setForm471Error(response.data.error || "Failed to fetch 471 data");
        }
      } else {
        setForm471Error(response.error || "Failed to fetch 471 data");
      }
    } catch (error) {
      console.error("471 lookup failed:", error);
      setForm471Error("Failed to look up Form 471 data. Please try again.");
    } finally {
      setForm471Loading(false);
    }
  };

  // Toggle an FRN row's line-item sub-table. Caches results per FRN so
  // re-clicking the same row never refetches.
  const load471LineItems = async (frn: string) => {
    if (!frn || form471LineItemsCache[frn]) return; // already cached / nothing to do
    setForm471LineItemsLoadingFrn(frn);
    try {
      const response = await api.get471LineItemsByFrn(frn);
      if (response.success && response.data && response.data.success) {
        setForm471LineItemsCache(prev => ({ ...prev, [frn]: response.data!.line_items || [] }));
      } else {
        setForm471LineItemsCache(prev => ({ ...prev, [frn]: [] }));
      }
    } catch (error) {
      console.error("471 line-item lookup failed:", error);
      setForm471LineItemsCache(prev => ({ ...prev, [frn]: [] }));
    } finally {
      setForm471LineItemsLoadingFrn(null);
    }
  };

  const toggle471LineItems = async (frn: string) => {
    if (!frn) return;
    if (expanded471Frn === frn) {
      setExpanded471Frn(null);
      return;
    }
    setExpanded471Frn(frn);
    await load471LineItems(frn);
  };

  // After a focused lookup loads, auto-expand the target FRN so the contract's
  // line items are visible immediately (no extra click).
  useEffect(() => {
    if (!focus471Frn || !form471Data) return;
    const rec = (form471Data.records || []).find(r => r.frn === focus471Frn);
    if (rec) {
      setExpanded471Frn(focus471Frn);
      load471LineItems(focus471Frn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form471Data, focus471Frn]);

  const loadCompetitorAnalysis = async (cat?: '' | '1' | '2') => {
    if (!profile?.spin) {
      return;
    }
    // Use the explicit category when provided (toggle click), else current state.
    const useCat = cat !== undefined ? cat : competitorCategory;
    setCompetitorLoading(true);
    try {
      const response = await api.get471Competitors(undefined, useCat || undefined);
      if (response.success && response.data) {
        setCompetitorData(response.data);
      }
    } catch (error) {
      console.error("Failed to load competitor analysis:", error);
    } finally {
      setCompetitorLoading(false);
    }
  };

  // B8: open the inline note editor for an FRN, lazily loading the saved note.
  const openFrnNote = async (frn: string) => {
    setFrnNoteOpen(frn);
    setFrnNoteDraft(frnNotes[frn] ?? "");
    if (!(frn in frnNotes)) {
      try {
        const res = await api.getFrnNote(frn);
        if (res.success && res.data) {
          const note = res.data.note || "";
          setFrnNotes((prev) => ({ ...prev, [frn]: note }));
          setFrnNoteDraft(note);
        }
      } catch { /* non-blocking: start with an empty draft */ }
    }
  };

  const saveFrnNote = async (frn: string) => {
    setFrnNoteSaving(true);
    try {
      const res = await api.updateFrnNote(frn, frnNoteDraft);
      if (res.success) {
        setFrnNotes((prev) => ({ ...prev, [frn]: frnNoteDraft }));
        setFrnNoteOpen(null);
      }
    } catch { /* leave editor open on failure */ } finally {
      setFrnNoteSaving(false);
    }
  };

  // FRN Status Monitoring functions (Sprint 2)
  const loadFRNStatus = async (year?: number, status?: string, pendingReason?: string, ben?: string, spinSearch?: string, crn?: string, globalView?: boolean) => {
    // Allow loading even without SPIN when a BEN / SPIN search / CRN or globalView is provided
    if (!profile?.spin && !ben && !spinSearch && !crn && !globalView) {
      return;
    }    
    setFrnStatusLoading(true);
    try {
      // Large national vendors (e.g. CDW Government LLC) can have several
      // thousand FRNs in a single recent funding year. Request up to 5000 so the
      // table reflects the true portfolio size instead of an arbitrary 500 cap;
      // the table itself paginates client-side (load more) to stay responsive.
      const response = await api.getFRNStatus(year, status || undefined, pendingReason || undefined, 5000, ben, spinSearch, crn, globalView);
      if (response.success && response.data) {
        setFrnStatusData(response.data);
        // When a BEN / SPIN / CRN scoped lookup was performed, clear the
        // client-side text-search field so the table renders all returned rows.
        if (ben || spinSearch || crn) {
          setFrnSearch("");
        }
      }
    } catch (error) {
      console.error("Failed to load FRN status:", error);
    } finally {
      setFrnStatusLoading(false);
    }
  };

  const loadFRNWatches = async () => {
    try {
      const response = await api.getFRNWatches();
      if (response?.data?.watches) {
        setFrnWatches(response.data.watches);
      }
    } catch (error) {
      console.error('Failed to load FRN watches:', error);
    }
  };

  const loadReportHistory = async () => {
    try {
      const response = await api.getFRNReportHistory(10);
      if (response?.data?.reports) {
        setReportHistory(response.data.reports);
      }
    } catch (error) {
      console.error('Failed to load report history:', error);
    }
  };

  // Form 470 Lead Generation functions (Sprint 3)
  const load470Leads = async (filters?: {
    year?: number;
    state?: string;
    category?: string;
    service_type?: string;
    manufacturer?: string;
    equipment_type?: string;
    service_function?: string;
    min_speed?: string;
    max_speed?: string;
    sort_by?: string;
    min_deal_value?: number;
    max_deal_value?: number;
    name?: string;
  }) => {
    setForm470Loading(true);
    setForm470Error(null);
    
    try {
      const searchFilters = filters || form470Filters;
      const response = await api.get470Leads({
        ...searchFilters,
        limit: 2000
      });
      
      if (response.success && response.data) {
        setForm470Leads(response.data.leads || []);
        setForm470TotalLeads(response.data.total_leads || 0);
        // Clean null values from filters_applied to avoid null contamination in state
        const cleanFilters = Object.fromEntries(
          Object.entries(response.data.filters_applied || {}).filter(([_, v]) => v != null)
        );
        setForm470Filters(cleanFilters);
      } else {
        setForm470Error(response.error || "Failed to fetch 470 leads");
        setForm470Leads([]);
        setForm470TotalLeads(0);
      }
    } catch (error) {
      console.error("Failed to load 470 leads:", error);
      setForm470Error("Failed to fetch Form 470 leads");
    } finally {
      setForm470Loading(false);
    }
  };

  const load470Detail = async (applicationNumber: string, version?: string) => {
    setForm470DetailLoading(true);
    setShowForm470Modal(true);
    setForm470Detail(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    setEnrichmentData(null);
    
    try {
      const response = await api.get470Detail(applicationNumber, version);
      if (response.success && response.data) {
        setForm470Detail(response.data);
        
        // Check if lead is already saved
        const savedCheck = await api.checkLeadSaved('470', applicationNumber);
        if (savedCheck.success && savedCheck.data?.is_saved) {
          setIsLeadSaved(true);
          setCurrentSavedLead(savedCheck.data.lead);
          if (savedCheck.data.lead?.enriched_data) {
            setEnrichmentData(savedCheck.data.lead.enriched_data);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load 470 detail:", error);
    } finally {
      setForm470DetailLoading(false);
    }
  };

  const closeForm470Modal = () => {
    setShowForm470Modal(false);
    setForm470Detail(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    setEnrichmentData(null);
  };

  // Lightweight loader for the dashboard "Latest Opportunities" feed — newest
  // Form 470 postings, capped small so the landing page stays fast.
  const loadDashboardOpportunities = async () => {
    setDashLeadsLoading(true);
    try {
      const response = await api.get470Leads({ limit: 6 });
      if (response.success && response.data) {
        setDashLeads(response.data.leads || []);
        setDashLeadsTotal(response.data.total_leads || 0);
      }
    } catch (error) {
      console.error("Failed to load dashboard opportunities:", error);
    } finally {
      setDashLeadsLoading(false);
      setDashLeadsLoaded(true);
    }
  };

  // BEN lookup: fetch the 470(s) for a specific entity. If exactly one, open the
  // detail modal directly (same screen as clicking a lead). If several, list
  // them. If none, tell the user the entity hasn't posted a 470 this cycle.
  const handleBenLookup = async () => {
    const ben = benLookup.trim();
    if (!ben) return;
    setBenLookupLoading(true);
    setBenLookupMsg(null);
    setBenLookupResults([]);
    try {
      const res = await api.get470ByBen(ben);
      const leads = res.data?.leads || [];
      if (leads.length === 0) {
        setBenLookupMsg(`No open Form 470 found for BEN ${ben} this funding cycle. They may not have posted one yet.`);
      } else if (leads.length === 1) {
        load470Detail(leads[0].application_number);
        setBenLookupMsg(null);
      } else {
        setBenLookupResults(leads);
        setBenLookupMsg(`${leads.length} Form 470 postings found for BEN ${ben} — pick one:`);
      }
    } catch (error) {
      console.error("BEN lookup failed:", error);
      setBenLookupMsg("Lookup failed. Please check the BEN and try again.");
    } finally {
      setBenLookupLoading(false);
    }
  };

  // Invoicing: pull the vendor's own disbursement schedule (scoped to their SPIN).
  const loadInvoices = async (year?: number) => {
    if (!profile?.spin) { setInvoiceLoaded(true); return; }
    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const res = await api.getVendorDisbursements({ spin: profile.spin, year });
      if (res.success && res.data) {
        setInvoiceData(res.data);
      } else {
        setInvoiceError(res.error || "Failed to load invoicing data.");
      }
    } catch (error) {
      console.error("Failed to load invoices:", error);
      setInvoiceError("Failed to load invoicing data.");
    } finally {
      setInvoiceLoading(false);
      setInvoiceLoaded(true);
    }
  };

  // Saved Leads functions
  const loadSavedLeads = async (status?: string) => {
    setSavedLeadsLoading(true);
    try {
      const response = await api.getSavedLeads({
        lead_status: status || undefined,
        limit: 100,
      });
      if (response.success && response.data) {
        setSavedLeads(response.data.leads || []);
        setSavedLeadsTotalCount(response.data.total || 0);
      }
    } catch (error) {
      console.error("Failed to load saved leads:", error);
    } finally {
      setSavedLeadsLoading(false);
    }
    loadPipelineCounts();
  };

  // B7: tally saved leads by stage across the whole account for the pipeline bar.
  const loadPipelineCounts = async () => {
    try {
      const response = await api.getSavedLeads({ limit: 500 });
      if (response.success && response.data) {
        const counts: Record<string, number> = {};
        for (const l of response.data.leads || []) {
          const s = l.lead_status || "new";
          counts[s] = (counts[s] || 0) + 1;
        }
        setPipelineCounts(counts);
      }
    } catch (error) {
      console.error("Failed to load pipeline counts:", error);
    }
  };

  const saveCurrentLead = async () => {
    if (!form470Detail) return;
    
    setSavingLead(true);
    try {
      const response = await api.saveLead({
        form_type: '470',
        application_number: form470Detail.application_number,
        ben: form470Detail.entity?.ben || '',
        entity_name: form470Detail.entity?.name,
        entity_type: form470Detail.entity?.type,
        entity_state: form470Detail.entity?.state,
        entity_city: form470Detail.entity?.city,
        contact_name: form470Detail.contact?.name,
        contact_email: form470Detail.contact?.email,
        contact_phone: form470Detail.contact?.phone,
        funding_year: parseInt(form470Detail.funding_year) || undefined,
        categories: form470Detail.categories,
        services: form470Detail.service_types,
        manufacturers: form470Detail.manufacturers,
      });
      
      if (response.success && response.data?.lead) {
        setIsLeadSaved(true);
        setCurrentSavedLead(response.data.lead);
      } else {
        // May already be saved
        if (response.data?.error === 'Lead already saved') {
          setIsLeadSaved(true);
          setCurrentSavedLead(response.data.lead || null);
        }
      }
    } catch (error) {
      console.error("Failed to save lead:", error);
    } finally {
      setSavingLead(false);
    }
  };

  const unsaveLead = async () => {
    if (!currentSavedLead) return;
    
    try {
      await api.deleteSavedLead(currentSavedLead.id);
      setIsLeadSaved(false);
      setCurrentSavedLead(null);
      setEnrichmentData(null);
    } catch (error) {
      console.error("Failed to unsave lead:", error);
    }
  };

  const enrichCurrentLead = async () => {
    if (!currentSavedLead) {
      console.log("enrichCurrentLead: No currentSavedLead");
      return;
    }
    
    console.log("Starting enrichment for lead:", currentSavedLead.id);
    console.log("Contact info:", {
      email: form470Detail?.contact?.email,
      name: form470Detail?.contact?.name,
    });
    
    setEnrichingLead(true);
    try {
      const response = await api.enrichSavedLead(currentSavedLead.id, {
        contact_email: form470Detail?.contact?.email,
        contact_name: form470Detail?.contact?.name,
      });
      
      console.log("Enrichment response:", response);
      
      if (response.success && response.data?.enrichment) {
        setEnrichmentData(response.data.enrichment);
        console.log("Enrichment data set:", response.data.enrichment);
        if (response.data.lead) {
          setCurrentSavedLead(response.data.lead);
        }
      } else if (response.data?.error) {
        console.error("Enrichment error:", response.data.error);
        alert(`Enrichment error: ${response.data.error}`);
      }
    } catch (error) {
      console.error("Failed to enrich lead:", error);
      alert(`Failed to enrich lead: ${error}`);
    } finally {
      setEnrichingLead(false);
    }
  };

  const updateLeadStatus = async (leadId: number, status: string) => {
    // Optimistic: reflect the new stage immediately, revert on failure.
    const previous = savedLeads;
    const nextStatus = status as SavedLead["lead_status"];
    setSavedLeads(cur => cur.map(l => (l.id === leadId ? { ...l, lead_status: nextStatus } : l)));
    try {
      await api.updateSavedLead(leadId, { lead_status: status });
      // If a stage filter is active the lead may no longer belong to the view.
      if (savedLeadsFilter && savedLeadsFilter !== status) {
        loadSavedLeads(savedLeadsFilter);
      } else {
        loadPipelineCounts();
      }
    } catch (error) {
      console.error("Failed to update lead status:", error);
      setSavedLeads(previous);
    }
  };

  const deleteSavedLead = async (leadId: number) => {
    if (!confirm("Are you sure you want to remove this lead?")) return;
    
    try {
      await api.deleteSavedLead(leadId);
      setSavedLeads(prev => prev.filter(l => l.id !== leadId));
      setSavedLeadsTotalCount(prev => prev - 1);
      loadPipelineCounts();
    } catch (error) {
      console.error("Failed to delete lead:", error);
    }
  };

  const toggleForm470LeadSelection = (applicationNumber: string) => {
    setSelectedForm470Leads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(applicationNumber)) {
        newSet.delete(applicationNumber);
      } else {
        newSet.add(applicationNumber);
      }
      return newSet;
    });
  };

  const selectAllForm470Leads = () => {
    setSelectedForm470Leads(new Set(form470Leads.map(l => l.application_number)));
  };

  const clearForm470Selection = () => {
    setSelectedForm470Leads(new Set());
  };

  const exportSelectedForm470Leads = () => {
    const leadsToExport = selectedForm470Leads.size > 0
      ? form470Leads.filter(l => selectedForm470Leads.has(l.application_number))
      : form470Leads;
    
    const columns = ['application_number', 'funding_year', 'ben', 'entity_name', 'state', 'city', 'applicant_type', 'status', 'contact_name', 'contact_email', 'contact_phone', 'posting_date', 'allowable_contract_date', 'categories', 'service_types', 'manufacturers'];
    const rows = leadsToExport.map(l => ({
      application_number: l.application_number,
      funding_year: l.funding_year,
      ben: l.ben,
      entity_name: l.entity_name || '',
      state: l.state,
      city: l.city,
      applicant_type: l.applicant_type,
      status: l.status,
      contact_name: l.contact_name || '',
      contact_email: l.contact_email || '',
      contact_phone: l.contact_phone || '',
      posting_date: l.posting_date || '',
      allowable_contract_date: l.allowable_contract_date || '',
      categories: l.categories?.join('; ') || '',
      service_types: l.service_types?.join('; ') || '',
      manufacturers: l.manufacturers?.join('; ') || '',
    }));
    return { columns, rows };
  };

  const exportForm470LeadsCsv = () => {
    const { columns, rows } = exportSelectedForm470Leads();
    downloadCsv(csvFilename('form470_leads'), columns, rows);
  };

  const exportForm470LeadsExcel = () => {
    const { columns, rows } = exportSelectedForm470Leads();
    downloadExcel(excelFilename('form470_leads'), columns, rows);
  };

  // Invoicing / Disbursements export — one row per invoice line (falls back to a
  // FRN-summary row when a FRN has no individual lines). Exports whatever is
  // currently loaded for the vendor's SPIN + selected funding year.
  const buildInvoiceExportData = () => {
    const columns = ['frn', 'funding_year', 'ben', 'billed_entity_name', 'service_provider_name', 'spin', 'service_type', 'category', 'invoice_id', 'invoice_type', 'invoice_status', 'invoice_date', 'completion_date', 'requested_amount', 'disbursed_amount'];
    const rows: Record<string, unknown>[] = [];
    for (const g of invoiceData?.frns || []) {
      if (g.lines && g.lines.length > 0) {
        for (const ln of g.lines) {
          rows.push({
            frn: g.frn,
            funding_year: g.funding_year || '',
            ben: g.billed_entity_number || '',
            billed_entity_name: g.billed_entity_name || '',
            service_provider_name: g.service_provider_name || '',
            spin: g.spin || '',
            service_type: ln.service_type || g.service_type || '',
            category: ln.category || g.category || '',
            invoice_id: ln.invoice_id || '',
            invoice_type: ln.invoice_type || '',
            invoice_status: ln.status || '',
            invoice_date: ln.invoice_date || '',
            completion_date: ln.completion_date || '',
            requested_amount: ln.requested_amount ?? 0,
            disbursed_amount: ln.disbursed_amount ?? 0,
          });
        }
      } else {
        rows.push({
          frn: g.frn,
          funding_year: g.funding_year || '',
          ben: g.billed_entity_number || '',
          billed_entity_name: g.billed_entity_name || '',
          service_provider_name: g.service_provider_name || '',
          spin: g.spin || '',
          service_type: g.service_type || '',
          category: g.category || '',
          invoice_id: '',
          invoice_type: '',
          invoice_status: '',
          invoice_date: '',
          completion_date: '',
          requested_amount: g.total_requested ?? 0,
          disbursed_amount: g.total_disbursed ?? 0,
        });
      }
    }
    return { columns, rows };
  };

  const exportInvoicesCsv = () => {
    const { columns, rows } = buildInvoiceExportData();
    downloadCsv(csvFilename('invoicing_disbursements'), columns, rows);
  };

  const exportInvoicesExcel = () => {
    const { columns, rows } = buildInvoiceExportData();
    downloadExcel(excelFilename('invoicing_disbursements'), columns, rows);
  };

  const exportSavedLeads = async () => {
    const leadIdsToExport = selectedLeadIds.size > 0 ? Array.from(selectedLeadIds) : undefined;
    
    try {
      const response = await api.exportSavedLeads({
        lead_ids: leadIdsToExport,
        lead_status: !leadIdsToExport ? (savedLeadsFilter || undefined) : undefined,
      });
      
      if (response.success && response.data?.data) {
        const data = response.data.data;
        const columns = response.data.columns;
        
        const csv = [
          columns.join(","),
          ...data.map(row => 
            columns.map(col => `"${String(row[col] || '').replace(/"/g, '""')}"`).join(",")
          )
        ].join("\n");
        
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `saved_leads_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export saved leads:", error);
    }
  };

  const generateLinkedInSearchUrl = (name?: string, company?: string, location?: string) => {
    // Ari loom-1 #9: raw keyword searches like "Battalion" returned unrelated
    // companies. Quote the org name so LinkedIn phrase-matches it, and append
    // city/state to scope results to the actual entity. `name` (a person) stays
    // unquoted; `company` is the org to pin the search to.
    const parts: string[] = [];
    if (name && name.trim()) parts.push(name.trim());
    if (company && company.trim()) parts.push(`"${company.trim()}"`);
    if (location && location.trim()) parts.push(location.trim());
    const keywords = parts.join(' ').trim();
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
  };

  // Build a reliable "Contact Entity" mailto (Ari loom-1 #8) with a useful
  // prefilled subject + short professional body. Returns null when there is no
  // recipient email so callers can disable the button instead of producing a
  // broken mailto: link.
  const buildEntityMailto = (opts: { email?: string | null; entityName?: string | null; appNumber?: string | null; contactName?: string | null; service?: string | null }): string | null => {
    const email = (opts.email || '').trim();
    if (!email) return null;
    const app = (opts.appNumber || '').trim();
    const subject = app ? `Regarding Form 470 #${app}` : 'Regarding your E-Rate services';
    const firstName = (opts.contactName || '').trim().split(/\s+/)[0] || '';
    const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
    const entity = (opts.entityName || 'your organization').trim();
    const svc = (opts.service || '').trim();
    const svcPhrase = svc ? ` for your ${svc} needs` : '';
    const projectRef = app ? `Form 470 (#${app})` : 'E-Rate procurement';
    const body = [
      greeting,
      '',
      `I'm reaching out regarding ${entity}'s ${projectRef}${svcPhrase}. We'd welcome the opportunity to submit a competitive bid and support your E-Rate project.`,
      '',
      'Would you have time for a brief call to discuss your requirements and timeline?',
      '',
      'Thank you,',
    ].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSearch = async (e: React.FormEvent | null, opts?: { page?: number }) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    setIsLoading(true);
    const targetPage = opts?.page ?? 1;
    
    try {
      const response = await api.searchSchools({
        state: searchState || undefined,
        status: searchStatus || undefined,
        service_type: searchServiceType || undefined,
        year: searchYear,
        min_amount: searchMinAmount ? parseInt(searchMinAmount) : undefined,
        max_amount: searchMaxAmount ? parseInt(searchMaxAmount) : undefined,
        limit: 2000,
        page: targetPage,
        page_size: searchPageSize,
      });
      
      if (response.success && response.data) {
        setSearchResults(response.data.results || []);
        setSearchPage(response.data.page || targetPage);
        setSearchTotalCount(response.data.total_count ?? (response.data.results?.length || 0));
        setSearchTotalPages(response.data.total_pages || 1);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSchoolSelection = (ben: string) => {
    const newSelection = new Set(selectedSchools);
    if (newSelection.has(ben)) {
      newSelection.delete(ben);
    } else {
      newSelection.add(ben);
    }
    setSelectedSchools(newSelection);
  };

  // Handle clicking on BEN to view school details
  // Entity enrichment state for the search result modal
  const [entityEnrichment, setEntityEnrichment] = useState<any>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  const handleViewSchoolDetail = async (school: SearchResult) => {
    setSelectedSearchResult(school);
    setShowSearchResultModal(true);
    setEnrichmentLoading(true);
    setEntityEnrichment(null);
    setIsLeadSaved(false);
    setCurrentSavedLead(null);
    
    try {
      // Fetch enriched entity data from multiple USAC sources
      const response = await api.enrichEntity(school.ben, {
        year: school.funding_year,
        application_number: school.application_number,
        frn: school.frn
      });
      
      if (response.success && response.data) {
        setEntityEnrichment(response.data);
        
        // Check if this lead is already saved
        try {
          const leadsResponse = await api.getSavedLeads({ state: school.state });
          if (leadsResponse.success && leadsResponse.data?.leads) {
            const existingLead = leadsResponse.data.leads.find(
              l => l.ben === school.ben && l.application_number === school.application_number
            );
            if (existingLead) {
              setIsLeadSaved(true);
              setCurrentSavedLead(existingLead);
            }
          }
        } catch (e) {
          // Ignore errors checking for existing lead
        }
      }
    } catch (error) {
      console.error("Failed to fetch enriched school detail:", error);
    } finally {
      setEnrichmentLoading(false);
    }
  };
  
  const handleSaveAsLead = async () => {
    if (!selectedSearchResult) return;
    
    setSavingLead(true);
    try {
      const enriched = entityEnrichment;
      const primaryContact = enriched?.contacts?.[0] || {};
      
      const leadData = {
        ben: selectedSearchResult.ben,
        entity_name: enriched?.entity?.name || selectedSearchResult.name,
        entity_state: enriched?.entity?.state || selectedSearchResult.state,
        entity_city: enriched?.entity?.city || selectedSearchResult.city,
        entity_address: enriched?.entity?.address,
        entity_zip: enriched?.entity?.zip,
        entity_phone: enriched?.entity?.phone,
        entity_website: enriched?.entity?.website,
        entity_type: enriched?.entity?.entity_type,
        form_type: '471' as const,
        application_number: selectedSearchResult.application_number || '',
        frn: selectedSearchResult.frn,
        funding_year: selectedSearchResult.funding_year,
        application_status: enriched?.applications?.[0]?.application_status,
        frn_status: enriched?.frns?.find((f: any) => f.frn === selectedSearchResult.frn)?.frn_status || selectedSearchResult.status,
        funding_amount: selectedSearchResult.funding_amount,
        committed_amount: enriched?.frn_status?.summary?.total_committed,
        funded_amount: enriched?.frn_status?.summary?.total_funded,
        service_type: selectedSearchResult.service_type,
        services: enriched?.applications?.map((a: any) => a.category) || [],
        categories: [],
        contact_name: primaryContact.name || null,
        contact_email: primaryContact.email || null,
        contact_phone: primaryContact.phone || null,
        contact_title: primaryContact.title || null,
        all_contacts: enriched?.contacts || [],
        lead_status: 'new' as const,
        source_data: enriched || {}
      };
      
      const response = await api.saveLead(leadData);
      if (response.success && response.data?.lead) {
        setIsLeadSaved(true);
        setCurrentSavedLead(response.data.lead);
        // Refresh saved leads if on that tab
        if (activeTab === 'leads') {
          loadSavedLeads();
        }
      }
    } catch (error) {
      console.error("Failed to save lead:", error);
      alert("Failed to save lead. Please try again.");
    } finally {
      setSavingLead(false);
    }
  };

  const handleExport = async () => {
    const selected = selectedSchools.size > 0
      ? searchResults.filter(s => selectedSchools.has(s.ben))
      : searchResults;
    
    if (selected.length === 0) return;
    
    const columns = ['ben', 'name', 'state', 'city', 'status', 'funding_amount', 'service_type'];
    const rows = selected.map(s => ({
      ben: s.ben,
      name: s.name,
      state: s.state,
      city: s.city || '',
      status: s.status,
      funding_amount: s.funding_amount,
      service_type: s.service_type,
    }));
    
    downloadCsv(csvFilename('leads_export'), columns, rows);
  };

  // FRN Status export
  const exportFrnData = () => {
    const data = selectedFrns.size > 0
      ? sortedFrnData.filter(f => selectedFrns.has(f.frn))
      : sortedFrnData;
    
    const columns = ['frn', 'entity_name', 'ben', 'state', 'funding_year', 'service_type', 'status', 'commitment_amount', 'disbursed_amount', 'invoicing_mode'];
    const rows = data.map(f => ({
      frn: f.frn,
      entity_name: f.entity_name,
      ben: f.ben,
      state: f.state,
      funding_year: f.funding_year,
      service_type: f.service_type,
      status: f.status || '',
      commitment_amount: f.commitment_amount,
      disbursed_amount: f.disbursed_amount,
      invoicing_mode: f.invoicing_mode || '',
    }));
    
    downloadCsv(csvFilename('frn_status'), columns, rows);
  };

  // Serviced Entities export
  const exportServicedEntities = () => {
    const data = selectedServicedEntities.size > 0
      ? sortedServicedEntities.filter(e => selectedServicedEntities.has(e.ben))
      : sortedServicedEntities;
    
    const columns = ['ben', 'organization_name', 'state', 'current_cat1', 'current_cat2', 'total_amount', 'frn_count'];
    const rows = data.map(e => ({
      ben: e.ben,
      organization_name: e.organization_name,
      state: e.state,
      current_cat1: e.current_cat1 || 0,
      current_cat2: e.current_cat2 || 0,
      total_amount: e.total_amount || 0,
      frn_count: e.frn_count,
    }));
    
    downloadCsv(csvFilename('serviced_entities'), columns, rows);
  };

  // Form 471 Records export
  const exportForm471Records = () => {
    if (!form471Data?.records) return;
    const data = selectedForm471Records.size > 0
      ? form471Data.records.filter(r => selectedForm471Records.has(r.frn))
      : form471Data.records;
    
    const columns = ['funding_year', 'frn', 'service_provider_name', 'service_provider_spin', 'service_type', 'category', 'committed_amount', 'frn_status'];
    const rows = data.map(r => ({
      funding_year: r.funding_year,
      frn: r.frn,
      service_provider_name: r.service_provider_name,
      service_provider_spin: r.service_provider_spin,
      service_type: r.service_type,
      category: r.category,
      committed_amount: r.committed_amount,
      frn_status: r.frn_status || '',
    }));
    
    downloadCsv(csvFilename('form471_records'), columns, rows);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Show loading state while checking payment status
  // perf_v2: gated — see consultant/page.tsx for rationale.
  if (!PERF_V2_ENABLED && (!_hasHydrated || checkingPayment)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  if (!PERF_V2_ENABLED && isLoading && !profile) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Dashboard skeleton — Phase A4 loading UX */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <SkeletonRows rows={1} height="h-7" gap="" />
            <SkeletonRows rows={1} height="h-4" gap="" />
          </div>
          <SkeletonStatCards count={4} />
          <SkeletonTable rows={6} columns={5} />
          <div className="text-center text-slate-400 text-sm">Loading your dashboard…</div>
        </div>
      </div>
    );
  }

  // US States for dropdown
  const US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  const SERVICE_TYPES = [
    "Internal Connections",
    "Basic Maintenance",
    "Internet Access",
    "Data Transmission",
    "Voice",
    "Managed Internal Broadband Services"
  ];

  // Sidebar organized into intent-based zones (concept: 4 grouped zones with
  // single-weight SVG icons) instead of one flat list of 11 emoji items.
  const navGroups: { label: string; items: { id: VendorTab; label: string; Icon: typeof Home }[] }[] = [
    { label: "Overview", items: [
      { id: "dashboard", label: "Dashboard", Icon: Home },
    ]},
    { label: "Opportunities", items: [
      { id: "predicted-leads", label: "Predicted Leads", Icon: Sparkles },
      { id: "470-leads", label: "Form 470 Leads", Icon: Target },
      { id: "map", label: "Opportunity Map", Icon: MapIcon },
      { id: "leads", label: "Saved Leads", Icon: Bookmark },
    ]},
    { label: "Your Customers", items: [
      { id: "my-entities", label: "My Entities", Icon: Building2 },
      { id: "frn-status", label: "FRN Status", Icon: Activity },
    ]},
    { label: "Billing", items: [
      { id: "invoicing", label: "Invoicing", Icon: Receipt },
    ]},
    { label: "Intelligence", items: [
      { id: "competitive", label: "470/471 Lookup", Icon: FileSearch },
      { id: "search", label: "School Search", Icon: Search },
      { id: "cyber-pilot", label: "Cybersecurity Pilot", Icon: Shield },
    ]},
    { label: "Account", items: [
      { id: "settings", label: "Settings", Icon: SettingsIcon },
    ]},
  ];
  const allNav = navGroups.flatMap((g) => g.items);
  const activeLabel = allNav.find((i) => i.id === activeTab)?.label || "Dashboard";

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
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="w-9 h-9 rounded-xl" />
            <div>
              <span className={`font-bold ${crumbInk}`}>SkyRate AI</span>
              <span className={`block text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
                Vendor Portal{(user?.role === 'super' || user?.role === 'admin') ? ` (${user.role})` : ''}
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
                const active = activeTab === item.id;
                const Ico = item.Icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${active ? `${railActive} font-medium` : `${railText} ${railHover}`}`}
                  >
                    <Ico className="w-[18px] h-[18px]" />
                    <span className="text-sm">{item.label}</span>
                    {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500" />}
                  </button>
                );
              })}
              {group.label === 'Intelligence' && (
                <Link href="/industry-pulse" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${railText} ${railHover}`}>
                  <BarChart3 className="w-[18px] h-[18px]" />
                  <span className="text-sm">Industry Pulse</span>
                </Link>
              )}
            </div>
          ))}

          {/* Portal Switcher (super/admin only) */}
          {(user?.role === 'super' || user?.role === 'admin') && (
            <div className="mb-2">
              <div className={`px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider ${groupLabelCls}`}>Switch Portal</div>
              <Link href="/consultant" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${railText} ${railHover}`}>
                <Building2 className="w-[18px] h-[18px]" /><span className="text-sm">Consultant Portal</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/super" className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${railText} ${railHover}`}>
                <Sparkles className="w-[18px] h-[18px]" /><span className="text-sm">Super Dashboard</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          )}
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
            <div className="text-lg font-bold mt-0.5">{profile?.search_count || 0} Searches</div>
          </div>
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-semibold shrink-0">
              {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium truncate ${crumbInk}`}>{user?.full_name || user?.email}</div>
              <div className={`text-xs truncate ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{profile?.company_name}</div>
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
            {/* Search (visual) */}
            <div className={`hidden md:flex items-center gap-2 rounded-lg border px-3 py-2 text-sm w-56 ${searchCls}`}>
              <Search className="w-4 h-4" />
              <span className="flex-1 truncate">Search or jump to…</span>
            </div>
            {(user?.role === 'super' || user?.role === 'admin') && (
              <Link
                href="/consultant"
                title="Switch to the Consulting portal"
                className={`hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${dark ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
              >
                <Building2 className="w-4 h-4" />
                <span className="hidden xl:inline">Consulting</span>
              </Link>
            )}
            {/* Theme toggle */}
            <div className="relative">
              <button
                onClick={toggleTheme}
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                className={`w-9 h-9 rounded-lg border flex items-center justify-center ${iconBtnCls} ${themeHint ? 'ring-2 ring-purple-400 ring-offset-2 ' + (dark ? 'ring-offset-[#0c0d1a]' : 'ring-offset-white') + ' animate-pulse' : ''}`}
              >
                {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              {themeHint && (
                <div className="absolute right-0 top-11 z-50 w-52 rounded-xl bg-slate-900 text-white text-xs p-3 shadow-xl border border-slate-700">
                  <div className="font-semibold mb-0.5">Prefer {dark ? 'light' : 'dark'} mode?</div>
                  <div className="text-slate-300">Tap here anytime to switch — we&apos;ll remember your choice.</div>
                  <button onClick={dismissThemeHint} className="mt-2 text-purple-300 hover:text-purple-200 font-medium">Got it</button>
                  <div className="absolute -top-1.5 right-3 w-3 h-3 bg-slate-900 border-l border-t border-slate-700 rotate-45"></div>
                </div>
              )}
            </div>
            {/* Notifications */}
            <button className={`w-9 h-9 rounded-lg border flex items-center justify-center relative ${iconBtnCls}`} title="Notifications">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            {/* Help */}
            <button className={`hidden sm:flex w-9 h-9 rounded-lg border items-center justify-center ${iconBtnCls}`} title="Help">
              <HelpCircle className="w-5 h-5" />
            </button>
            {/* Refresh */}
            <button
              onClick={loadProfile}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </header>

        {/* Soft-gate: prompt vendors without a SPIN to finish onboarding */}
        <MissingIdentifierBanner />

        {/* Page Content */}
        <div className="p-6">
          {activeTab === "dashboard" && (
            <VendorCommandCenter
              profile={profile}
              stats={servicedEntitiesStats}
              entities={servicedEntities}
              leads={dashLeads}
              leadsLoading={dashLeadsLoading}
              leadsLoaded={dashLeadsLoaded}
              leadsTotal={dashLeadsTotal}
              savedCount={savedLeadsTotalCount}
              savedLoading={savedLeadsLoading}
              user={user}
              onTab={setActiveTab}
              onOpenLead={load470Detail}
              dark={dark}
            />
          )}

        {/* Cybersecurity Pilot Program Tab */}
        {activeTab === "cyber-pilot" && <PilotFrns />}

        {/* Invoicing / Disbursement Schedule Tab */}
        {activeTab === "invoicing" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"><Receipt className="w-7 h-7" /></div>
                  <div>
                    <h1 className="text-2xl font-bold">Invoicing &amp; Disbursements</h1>
                    <p className="text-teal-100 mt-1">Track your invoices — filed, paid, and outstanding{profile?.spin ? ` · SPIN ${profile.spin}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={invoiceYear ?? ''} onChange={(e) => { const y = e.target.value ? parseInt(e.target.value, 10) : undefined; setInvoiceYear(y); setInvoiceLoaded(false); loadInvoices(y); }} className="bg-white/20 border border-white/30 rounded-lg px-3 py-1.5 text-sm font-semibold text-white backdrop-blur cursor-pointer focus:outline-none">
                    <option value="" className="text-slate-900">All years</option>
                    {(() => { const cy = new Date().getFullYear(); const ys: number[] = []; for (let y = cy + 1; y >= cy - 6; y--) ys.push(y); return ys.map(y => (<option key={y} value={y} className="text-slate-900">FY{y}</option>)); })()}
                  </select>
                  <button onClick={() => { setInvoiceLoaded(false); loadInvoices(invoiceYear); }} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors">Refresh</button>
                </div>
              </div>
            </div>

            {!profile?.spin ? (
              <div className="bg-white rounded-2xl border border-amber-200 p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600"><Zap className="w-6 h-6" /></div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900">Add your SPIN to see invoicing</h2>
                  <p className="text-sm text-slate-600 mt-1">Your invoice and disbursement schedule is matched to your SPIN.</p>
                </div>
                <button onClick={() => setActiveTab('settings')} className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 text-sm font-medium">Setup SPIN →</button>
              </div>
            ) : invoiceLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Loading your invoice schedule…
              </div>
            ) : invoiceError ? (
              <div className="bg-white rounded-2xl border border-red-200 p-6 text-red-600">{invoiceError}</div>
            ) : invoiceData && invoiceData.frns.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const req = invoiceData.total_requested || 0;
                    const paid = invoiceData.total_disbursed || 0;
                    const out = Math.max(0, req - paid);
                    const M = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
                    const cards = [
                      { label: 'Total invoiced', val: M(req), sub: `${invoiceData.line_count} invoice lines`, color: 'text-slate-900' },
                      { label: 'Paid / disbursed', val: M(paid), sub: `${req > 0 ? Math.round(paid / req * 100) : 0}% of invoiced`, color: 'text-emerald-600' },
                      { label: 'Outstanding', val: M(out), sub: `across ${invoiceData.frn_count} FRNs`, color: 'text-amber-600' },
                    ];
                    return cards.map(c => (
                      <div key={c.label} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                        <div className="text-sm text-slate-500">{c.label}</div>
                        <div className={`text-3xl font-bold mt-1 ${c.color}`}>{c.val}</div>
                        <div className="text-xs text-slate-400 mt-1">{c.sub}</div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Invoices by FRN</h2>
                      <p className="text-sm text-slate-500">Click a row to see individual invoice lines</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportInvoicesCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export CSV
                      </button>
                      <button
                        onClick={exportInvoicesExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export Excel
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[...invoiceData.frns].sort((a, b) => (a.billed_entity_name || '').localeCompare(b.billed_entity_name || '')).map((g) => {
                      const out = Math.max(0, (g.total_requested || 0) - (g.total_disbursed || 0));
                      const M = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
                      const open = invoiceExpanded.has(g.frn);
                      return (
                        <div key={g.frn}>
                          <button onClick={() => setInvoiceExpanded(prev => { const n = new Set(prev); if (n.has(g.frn)) n.delete(g.frn); else n.add(g.frn); return n; })} className="w-full text-left p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                            {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900 truncate">{g.billed_entity_name}</div>
                              <div className="text-xs text-slate-500">FRN {g.frn} · FY{g.funding_year || '—'} · {g.line_count} lines</div>
                            </div>
                            <div className="text-right shrink-0 w-24"><div className="text-sm font-semibold text-slate-900">{M(g.total_requested || 0)}</div><div className="text-xs text-slate-500">invoiced</div></div>
                            <div className="text-right shrink-0 w-24 hidden sm:block"><div className="text-sm font-semibold text-emerald-600">{M(g.total_disbursed || 0)}</div><div className="text-xs text-slate-500">paid</div></div>
                            <div className="text-right shrink-0 w-24"><div className={`text-sm font-semibold ${out > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{M(out)}</div><div className="text-xs text-slate-500">outstanding</div></div>
                          </button>
                          {open && (
                            <div className="bg-slate-50 px-4 pb-3 overflow-x-auto">
                              <table className="w-full text-sm min-w-[520px]">
                                <thead><tr className="text-xs text-slate-500 text-left"><th className="py-2 font-medium">Invoice</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Invoice date</th><th className="py-2 font-medium">Completed</th><th className="py-2 font-medium text-right">Requested</th><th className="py-2 font-medium text-right">Disbursed</th></tr></thead>
                                <tbody>
                                  {g.lines.map((ln, i) => (
                                    <tr key={`${ln.invoice_id}-${ln.inv_line_num}-${i}`} className="border-t border-slate-200">
                                      <td className="py-2 text-slate-700">{ln.invoice_id || '—'}{ln.invoice_type ? ` · ${ln.invoice_type}` : ''}</td>
                                      <td className="py-2 text-slate-600">{ln.status || '—'}</td>
                                      <td className="py-2 text-slate-600">{ln.invoice_date || '—'}</td>
                                      <td className="py-2 text-slate-600">{ln.completion_date || '—'}</td>
                                      <td className="py-2 text-right text-slate-700">{M(ln.requested_amount || 0)}</td>
                                      <td className="py-2 text-right text-emerald-600">{M(ln.disbursed_amount || 0)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"><Receipt className="w-7 h-7 text-slate-400" /></div>
                <h3 className="font-medium text-slate-900 mb-1">No invoices found</h3>
                <p className="text-sm text-slate-500">USAC has no invoice/disbursement records for your SPIN{invoiceYear ? ` in FY${invoiceYear}` : ''} yet.</p>
              </div>
            )}
          </div>
        )}

        {/* FRN Status Monitoring Tab (Sprint 2) */}
        {activeTab === "frn-status" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">📈</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">FRN Status Monitoring</h1>
                    <p className="text-teal-100 mt-1">Track the status of your E-Rate contracts</p>
                  </div>
                </div>
                <div className="text-right text-sm text-teal-100">
                  {frnStatusLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Syncing...
                    </span>
                  ) : (
                    <span>
                      {(frnStatusData as unknown as Record<string, unknown>)?.last_refreshed ? (
                        <>Last synced {(() => {
                          const diff = Math.round((Date.now() - new Date((frnStatusData as unknown as Record<string, unknown>).last_refreshed as string).getTime()) / 60000);
                          if (diff < 1) return "just now";
                          if (diff < 60) return `${diff} min ago`;
                          if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
                          return `${Math.round(diff / 1440)}d ago`;
                        })()}</>
                      ) : "Not yet synced"}
                      {" — "}
                      <button
                        onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, frnStatusGlobalView)}
                        disabled={!frnStatusGlobalView && !profile?.spin}
                        className="underline hover:text-white transition-colors disabled:opacity-50 disabled:no-underline"
                      >
                        Resync now
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* View Mode Toggle Switchers (Phase 1 Global/Demo view) */}
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200 shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setFrnStatusGlobalView(false);
                  setFrnStatusData(null);
                  loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, false);
                }}
                disabled={!profile?.spin}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                  !frnStatusGlobalView
                    ? "bg-white text-emerald-700 shadow-sm border border-slate-200/50"
                    : "text-slate-600 hover:text-slate-900"
                } ${!profile?.spin ? "opacity-50 cursor-not-allowed" : ""}`}
                title={!profile?.spin ? "Configure your SPIN in Settings to view your own contracts" : "View your contracts"}
              >
                💼 My Contracts (SPIN Scoped)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFrnStatusGlobalView(true);
                  setFrnStatusData(null);
                  loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, true);
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                  frnStatusGlobalView
                    ? "bg-white text-indigo-700 shadow-sm border border-slate-200/50"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🌐 Global USAC Market (All FRNs)
              </button>
            </div>

            {frnStatusGlobalView && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <span className="text-2xl">🌐</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Global USAC Market View</h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Showing all public E-Rate contracts globally. Search by BEN, SPIN, or Contract Number (CRN) across any entity or competitor!
                      {!profile?.spin && (
                        <span className="font-semibold text-slate-800 ml-1">
                          (Configure your SPIN in Settings to unlock your own contract portfolio).
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!frnStatusGlobalView && !profile?.spin && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">SPIN Not Configured</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Configure your SPIN in settings to load your own FRNs automatically, or search any BEN below.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("settings")}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors text-sm font-medium"
                  >
                    Setup SPIN →
                  </button>
                </div>
              </div>
            )}
              <>
                {/* Filters */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Funding Year</label>
                      <select
                        value={frnStatusYear || ""}
                        onChange={(e) => {
                          const year = e.target.value ? parseInt(e.target.value) : undefined;
                          setFrnStatusYear(year);
                          loadFRNStatus(year, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, frnStatusGlobalView);
                        }}
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                      >
                        <option value="">All Years</option>
                        {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Status</label>
                      <select
                        value={frnStatusFilter}
                        onChange={(e) => {
                          setFrnStatusFilter(e.target.value);
                          loadFRNStatus(frnStatusYear, e.target.value, frnPendingReason, undefined, undefined, undefined, frnStatusGlobalView);
                        }}
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                      >
                        <option value="">All Statuses</option>
                        <option value="Funded">Funded</option>
                        <option value="Denied">Denied</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 flex items-center gap-1">Pending Reason <FrnSubStatusInfo /></label>
                      <select
                        value={frnPendingReason}
                        onChange={(e) => setFrnPendingReason(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                      >
                        <option value="">All Pending Reasons</option>
                        {frnPendingReasonOptions.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Search FRN / Entity / BEN</label>
                      <input
                        type="text"
                        value={frnSearch}
                        onChange={(e) => setFrnSearch(e.target.value)}
                        placeholder="e.g., 2699061470"
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                      />
                    </div>
                    {/* 2026-06-09: SPIN / CRN search (mirror of consultant FRN tracker). */}
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Search by SPIN</label>
                      <input
                        type="text"
                        value={frnSpinSearch}
                        onChange={(e) => setFrnSpinSearch(e.target.value)}
                        placeholder="SPIN # or provider name"
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">Search by CRN</label>
                      <input
                        type="text"
                        value={frnCrnSearch}
                        onChange={(e) => setFrnCrnSearch(e.target.value)}
                        placeholder="Contract # (partial OK)"
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-slate-600 mb-1 block">My Tracking</label>
                      <select
                        value={vendorFrnTrackingFilter}
                        onChange={(e) => setVendorFrnTrackingFilter(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm"
                        title="Filter by your own per-FRN tracking (installation, applicant co-pay)"
                      >
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
                    <button
                      onClick={() => {
                        const searchTerm = frnSearch.trim();
                        const spinTerm = frnSpinSearch.trim();
                        const crnTerm = frnCrnSearch.trim();
                        // BENs are <=9 digits; FRNs are exactly 10 digits. Only treat
                        // a 5-9 digit numeric value as a BEN so 10-digit FRN searches
                        // are NOT misrouted to the BEN lookup (which returns nothing
                        // for an FRN). 10-digit FRNs fall through to the client-side
                        // `frnSearch` filter over the loaded portfolio.
                        const looksLikeBen = /^\d{5,9}$/.test(searchTerm);
                        // Skip the server round-trip if that BEN is already loaded.
                        const benAlreadyLoaded = looksLikeBen && (frnStatusData?.frns || []).some((f: any) => String(f.ben) === searchTerm);
                        if (looksLikeBen && !benAlreadyLoaded) {
                          // Pass ben to backend for server-side lookup
                          loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, searchTerm, spinTerm || undefined, crnTerm || undefined, frnStatusGlobalView);
                        } else {
                          loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, spinTerm || undefined, crnTerm || undefined, frnStatusGlobalView);
                        }
                      }}
                      disabled={frnStatusLoading}
                      className="mt-5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      {frnStatusLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span>🔍</span>
                      )}
                      Apply Filters
                    </button>
                  </div>
                </div>

                {/* Status Summary Cards */}
                {frnStatusData && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-600">Total FRNs</span>
                        <span className="text-2xl">📋</span>
                      </div>
                      <div className="text-3xl font-bold text-slate-900">{frnStatusData.total_frns}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-green-200 p-6 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-green-700">Funded</span>
                        <span className="text-2xl">✅</span>
                      </div>
                      <div className="text-3xl font-bold text-green-700">{frnStatusData.summary?.funded?.count || 0}</div>
                      <div className="text-sm text-green-600 mt-1">
                        ${(frnStatusData.summary?.funded?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm bg-gradient-to-br from-red-50 to-rose-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-red-700">Denied</span>
                        <span className="text-2xl">❌</span>
                      </div>
                      <div className="text-3xl font-bold text-red-700">{frnStatusData.summary?.denied?.count || 0}</div>
                      <div className="text-sm text-red-600 mt-1">
                        ${(frnStatusData.summary?.denied?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm bg-gradient-to-br from-amber-50 to-yellow-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-amber-700">Pending</span>
                        <span className="text-2xl">⏳</span>
                      </div>
                      <div className="text-3xl font-bold text-amber-700">{frnStatusData.summary?.pending?.count || 0}</div>
                      <div className="text-sm text-amber-600 mt-1">
                        ${(frnStatusData.summary?.pending?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                )}

                {/* FRN Table */}
                {frnStatusData && sortedFrnData.length > 0 && (
                  <div className="space-y-2">
                    <TableExportBar
                      selectedCount={selectedFrns.size}
                      totalCount={sortedFrnData.length}
                      onExportCsv={exportFrnData}
                      onClearSelection={() => setSelectedFrns(new Set())}
                    />
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900">FRN Details</h3>
                      <p className="text-sm text-slate-600">Detailed status for each funding request</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={selectedFrns.size === sortedFrnData.length && sortedFrnData.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedFrns(new Set(sortedFrnData.map(f => f.frn)));
                                  } else {
                                    setSelectedFrns(new Set());
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
                            <th 
                              className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer hover:bg-slate-100 select-none"
                              onClick={() => toggleFrnTableSort('entity_name')}
                            >
                              <span className="inline-flex items-center gap-1">
                                Entity
                                {frnTableSort?.field === 'entity_name' && (
                                  <span className="text-blue-600">{frnTableSort.dir === 'asc' ? '↑' : '↓'}</span>
                                )}
                                {frnTableSort?.field !== 'entity_name' && (
                                  <span className="text-slate-300">↕</span>
                                )}
                              </span>
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Service Type</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Commitment</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Disbursed</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Invoicing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedFrnData.slice(0, visibleFrnCount).map((frn, idx) => (
                            <tr 
                              key={`${frn.frn}-${idx}`} 
                              className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedFrns.has(frn.frn) ? 'bg-teal-50' : ''}`}
                              onClick={() => { setSelectedFRN(frn); setShowFRNDetailModal(true); }}
                            >
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedFrns.has(frn.frn)}
                                  onChange={() => {
                                    setSelectedFrns(prev => {
                                      const next = new Set(prev);
                                      if (next.has(frn.frn)) next.delete(frn.frn);
                                      else next.add(frn.frn);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-mono text-xs text-slate-900">{frn.frn}</div>
                                <div className="text-xs text-slate-500">{frn.application_number}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openTrackingModal(frn.frn, frn.ben); }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 bg-slate-100 hover:bg-teal-100 hover:text-teal-700 border border-slate-200 transition-colors"
                                    title="Track installation, applicant co-pay, and notes for this FRN"
                                  >
                                    <SettingsIcon className="w-3 h-3" /> Track
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openFrnNote(frn.frn); }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 border border-slate-200 transition-colors"
                                    title="Add a private note for this FRN"
                                  >
                                    <StickyNote className="w-3 h-3" /> {frnNotes[frn.frn] ? "Note" : "Add note"}
                                  </button>
                                  {frnNotes[frn.frn] && (
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" title="Has a note" />
                                  )}
                                  {frnTrackingMap[frn.frn]?.installed && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200" title="Equipment installed">Installed</span>
                                  )}
                                  {frnTrackingMap[frn.frn]?.copay_paid && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 border border-teal-200" title="Applicant co-pay paid">Co-pay paid</span>
                                  )}
                                </div>
                                {frnNoteOpen === frn.frn && (
                                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    <textarea
                                      value={frnNoteDraft}
                                      onChange={(e) => setFrnNoteDraft(e.target.value)}
                                      onBlur={() => saveFrnNote(frn.frn)}
                                      rows={2}
                                      placeholder="Private note for this FRN..."
                                      autoFocus
                                      className="w-full text-xs border border-slate-300 rounded p-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    />
                                    <div className="flex items-center gap-2 mt-1">
                                      <button
                                        onClick={() => saveFrnNote(frn.frn)}
                                        disabled={frnNoteSaving}
                                        className="px-2 py-0.5 text-[10px] rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                      >
                                        {frnNoteSaving ? "Saving..." : "Save"}
                                      </button>
                                      <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => setFrnNoteOpen(null)}
                                        className="px-2 py-0.5 text-[10px] rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900 truncate max-w-[200px]">{frn.entity_name}</div>
                                <div className="text-xs text-slate-500">{frn.state} • BEN: {frn.ben}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{frn.funding_year}</td>
                              <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">{frn.service_type}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  frn.status?.toLowerCase().includes('funded') || frn.status?.toLowerCase().includes('committed')
                                    ? 'bg-green-100 text-green-700'
                                    : frn.status?.toLowerCase().includes('denied')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {frn.status || 'Unknown'}
                                </span>
                                {frn.pending_reason && !(frn.status?.toLowerCase().includes('funded') || frn.status?.toLowerCase().includes('committed') || frn.status?.toLowerCase().includes('denied')) && (
                                  <div className="text-xs text-slate-500 mt-1">{frn.pending_reason}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">
                                {(() => {
                                  const s = frn.status?.toLowerCase() || '';
                                  const isDeniedish = s.includes('denied') || s.includes('cancel');
                                  const committed = frn.commitment_amount || 0;
                                  const requested = frn.requested_amount || 0;
                                  const showRequested = isDeniedish || (committed === 0 && requested > 0);
                                  const value = showRequested ? requested : committed;
                                  return (
                                    <>
                                      <div>${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                      {showRequested && requested > 0 && (
                                        <div className="text-[10px] text-slate-400 font-normal">requested</div>
                                      )}
                                    </>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={frn.disbursed_amount > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>
                                  ${frn.disbursed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${
                                    frn.invoicing_ready === 'Yes' ? 'bg-green-500' : 'bg-slate-300'
                                  }`}></span>
                                  <span className="text-xs text-slate-600">{frn.invoicing_mode || 'N/A'}</span>
                                </div>
                                {frn.f486_status && (
                                  <div className="text-xs text-slate-500">486: {frn.f486_status}</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sortedFrnData.length > 0 && (
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="text-sm text-slate-600">
                            Showing <span className="font-medium text-slate-900">{Math.min(visibleFrnCount, sortedFrnData.length)}</span> of <span className="font-medium text-slate-900">{sortedFrnData.length}</span> FRNs
                            {frnStatusFilter && <span className="text-slate-500"> (filtered from {frnStatusData?.frns?.length || 0} total)</span>}
                          </div>
                          {visibleFrnCount < sortedFrnData.length && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500 mr-1">Load more:</span>
                              <button
                                type="button"
                                onClick={() => setVisibleFrnCount(c => Math.min(c + 100, sortedFrnData.length))}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                +100
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibleFrnCount(c => Math.min(c + 250, sortedFrnData.length))}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                +250
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibleFrnCount(sortedFrnData.length)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                              >
                                View all ({sortedFrnData.length})
                              </button>
                            </div>
                          )}
                          {visibleFrnCount >= sortedFrnData.length && sortedFrnData.length > 100 && (
                            <button
                              type="button"
                              onClick={() => setVisibleFrnCount(100)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors self-start sm:self-auto"
                            >
                              Collapse to 100
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                )}

                {/* Empty State */}
                {frnStatusData && sortedFrnData.length === 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📭</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">No FRNs Found</h3>
                    <p className="text-sm text-slate-600 mt-2">
                      No funding requests match your current filters. Try adjusting the year or status filter.
                    </p>
                  </div>
                )}

                {/* Initial Load State */}
                {!frnStatusData && !frnStatusLoading && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📈</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{frnStatusGlobalView ? 'Load Global Market Data' : profile?.spin ? 'Load FRN Status' : 'Search Any BEN'}</h3>
                    <p className="text-sm text-slate-600 mt-2 mb-4">
                      {frnStatusGlobalView
                        ? 'Click the button below to load public USAC FRN status data globally'
                        : profile?.spin
                        ? 'Click the button below to load your FRN status data'
                        : 'Enter a BEN in the search box above and click Apply Filters to look up any entity\'s FRN status'}
                    </p>
                    {(profile?.spin || frnStatusGlobalView) && (
                      <button
                        onClick={() => loadFRNStatus(frnStatusYear, frnStatusFilter, frnPendingReason, undefined, undefined, undefined, frnStatusGlobalView)}
                        className="px-6 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium"
                      >
                        {frnStatusGlobalView ? 'Load Global Market Data' : 'Load FRN Status'}
                      </button>
                    )}
                  </div>
                )}
              </>

              {/* FRN Report Monitors Section */}
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Monitors</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Set up automated email reports for your FRN portfolio</p>
                  </div>
                  <button
                    onClick={() => setShowCreateWatch(!showCreateWatch)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {showCreateWatch ? 'Cancel' : '+ Create Monitor'}
                  </button>
                </div>

                {/* Create Watch Form */}
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
                          delivery_mode: (formData.get('delivery_mode') as any) || 'full_email',
                          notify_sms: formData.get('notify_sms') === 'on',
                          sms_phone: (formData.get('sms_phone') as string) || undefined,
                          include_funded: formData.get('include_funded') === 'on',
                          include_pending: formData.get('include_pending') === 'on',
                          include_denied: formData.get('include_denied') === 'on',
                          include_changes: formData.get('include_changes') === 'on',
                        });
                        if (response?.data?.success) {
                          setShowCreateWatch(false);
                          loadFRNWatches();
                        }
                      } catch (error) {
                        console.error('Failed to create watch:', error);
                      } finally {
                        setWatchLoading(false);
                      }
                    }}
                    className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monitor Name</label>
                        <input name="name" required placeholder="e.g., Weekly SPIN Report" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipient Email</label>
                        <input name="recipient_email" type="email" required placeholder="you@example.com" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Watch Type</label>
                        <select name="watch_type" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="portfolio">Entire Portfolio</option>
                          <option value="ben">Specific BEN</option>
                          <option value="frn">Specific FRN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
                        <select name="frequency" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="weekly">Weekly</option>
                          <option value="daily">Daily</option>
                          <option value="biweekly">Bi-Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BEN or FRN (if applicable)</label>
                        <input name="target_id" placeholder="e.g., 123456" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Mode</label>
                        <select name="delivery_mode" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent">
                          <option value="full_email">Full Email Report</option>
                          <option value="notification_only">Notification Only (link to dashboard)</option>
                          <option value="in_app_only">In-App Only (no email)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="notify_sms" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="font-medium">SMS Notification</span>
                        <span className="text-xs text-gray-500">(get a text when report is ready)</span>
                      </label>
                      <input name="sms_phone" type="tel" placeholder="Phone (optional, uses profile)" className="flex-1 max-w-[220px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_funded" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Funded
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_pending" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Pending
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_denied" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Include Denied
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" name="include_changes" defaultChecked className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" /> Highlight Changes
                      </label>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setShowCreateWatch(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                      <button type="submit" disabled={watchLoading} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                        {watchLoading ? 'Creating...' : 'Create Monitor'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Watch List */}
                {frnWatches.length > 0 ? (
                  <div className="space-y-3">
                    {frnWatches.map((watch) => (
                      <div key={watch.id} className={`flex items-center justify-between p-4 rounded-lg border ${watch.is_active ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{watch.name}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${watch.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                              {watch.is_active ? 'Active' : 'Paused'}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">{watch.frequency}</span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">{watch.watch_type}</span>
                            {watch.delivery_mode && watch.delivery_mode !== 'full_email' && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${watch.delivery_mode === 'notification_only' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                {watch.delivery_mode === 'notification_only' ? 'notify only' : 'in-app only'}
                              </span>
                            )}
                            {watch.notify_sms && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">SMS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>To: {watch.recipient_email}</span>
                            {watch.send_count > 0 && <span>Sent: {watch.send_count}x</span>}
                            {watch.next_send_at && <span>Next: {new Date(watch.next_send_at).toLocaleDateString()}</span>}
                            {watch.last_error && <span className="text-red-500">Error: {watch.last_error}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button onClick={async () => { try { await api.sendFRNWatchNow(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } }} className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors" title="Send report now">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
                          </button>
                          <button onClick={async () => { try { await api.toggleFRNWatch(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } }} className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title={watch.is_active ? 'Pause' : 'Resume'}>
                            {watch.is_active ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
                            )}
                          </button>
                          <button onClick={async () => { if (confirm('Delete this monitor?')) { try { await api.deleteFRNWatch(watch.id); loadFRNWatches(); } catch (e) { console.error(e); } } }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !showCreateWatch ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <p className="text-sm font-medium">No report monitors yet</p>
                    <p className="text-xs mt-1">Create a monitor to receive periodic FRN status reports via email</p>
                  </div>
                ) : null}
              </div>

              {/* Report History — latest report + archive toggle */}
              {reportHistory.length > 0 && (
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Latest Report</h3>
                    {reportHistory.length > 1 && (
                      <button
                        onClick={() => setShowReportArchive(!showReportArchive)}
                        className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1"
                      >
                        {showReportArchive ? 'Hide Archive' : `View Archive (${reportHistory.length - 1})`}
                      </button>
                    )}
                  </div>
                  {/* Most recent report */}
                  {(() => {
                    const report = reportHistory[0];
                    return (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.report_name}</span>
                            {report.changes_detected > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">{report.changes_detected} changes</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>{report.total_frns} FRNs</span>
                            <span className="text-green-600">{report.funded_count} funded</span>
                            <span className="text-amber-600">{report.pending_count} pending</span>
                            <span className="text-red-600">{report.denied_count} denied</span>
                            {report.email_sent && <span className="text-blue-500">emailed</span>}
                            {report.sms_sent && <span className="text-blue-500">SMS sent</span>}
                            <span>{new Date(report.generated_at).toLocaleString()}</span>
                          </div>
                        </div>
                        {report.has_html && (
                          <button onClick={async () => { try { const res = await api.getFRNReport(report.id); if (res?.data?.html) { setSelectedReport({ html: res.data.html, name: report.report_name }); } } catch (e) { console.error(e); } }} className="ml-3 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded-lg transition-colors">
                            View Report
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {/* Archive */}
                  {showReportArchive && reportHistory.length > 1 && (
                    <div className="mt-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Older reports</p>
                      {reportHistory.slice(1).map((report) => (
                        <div key={report.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.report_name}</span>
                              {report.changes_detected > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">{report.changes_detected} changes</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <span>{report.total_frns} FRNs</span>
                              <span className="text-green-600">{report.funded_count} funded</span>
                              <span className="text-amber-600">{report.pending_count} pending</span>
                              <span className="text-red-600">{report.denied_count} denied</span>
                              {report.email_sent && <span className="text-blue-500">emailed</span>}
                              {report.sms_sent && <span className="text-blue-500">SMS sent</span>}
                              <span>{new Date(report.generated_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {report.has_html && (
                            <button onClick={async () => { try { const res = await api.getFRNReport(report.id); if (res?.data?.html) { setSelectedReport({ html: res.data.html, name: report.report_name }); } } catch (e) { console.error(e); } }} className="ml-3 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded-lg transition-colors">
                              View Report
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Report Viewer Modal */}
              {selectedReport && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setSelectedReport(null)}>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedReport.name}</h3>
                      <button onClick={() => setSelectedReport(null)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-1">
                      <iframe srcDoc={selectedReport.html} className="w-full h-full min-h-[600px] border-0 rounded-lg" title="FRN Report" sandbox="allow-same-origin" />
                    </div>
                  </div>
                </div>
              )}

          </div>
        )}

        {/* Form 470 Lead Generation Tab (Sprint 3) */}
        {activeTab === "470-leads" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">🎯</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Form 470 Lead Generation</h1>
                    <p className="text-orange-100 mt-1">Find schools seeking vendors for E-Rate services</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-orange-100">Key Differentiator</div>
                  <div className="text-xl font-bold">Manufacturer Filtering</div>
                  <div className="text-sm text-orange-100">Exclusive to SkyRate!</div>
                </div>
              </div>
            </div>

            {/* Compliance guardrails explainer — E-Rate pre-bid rules. Native
                <details> disclosure so no extra React state is needed. */}
            <details className="bg-blue-50 border border-blue-200 rounded-2xl p-5 group">
              <summary className="flex items-center gap-2 cursor-pointer list-none font-semibold text-slate-900">
                <span className="text-lg">🛡️</span>
                E-Rate competitive-bidding rules — read before you reach out
                <span className="ml-auto text-blue-600 text-sm group-open:hidden">Show</span>
                <span className="ml-auto text-blue-600 text-sm hidden group-open:inline">Hide</span>
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc pl-5">
                <li><span className="font-medium">Competitive bidding is mandatory.</span> Every E-Rate purchase of eligible services or equipment must be competitively bid through a Form 470.</li>
                <li><span className="font-medium">Before the bidding window:</span> you may introduce your company and help a district understand its network needs, but you cannot solicit or accept a specific proposal until their Form 470 is posted.</li>
                <li><span className="font-medium">Parity rule:</span> any information or clarification you give one bidder must be made available to all bidders.</li>
                <li><span className="font-medium">Bid to the filing:</span> your response must match the exact services, quantities, and SKUs described in the applicant&apos;s Form 470 / RFP.</li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">General guidance, not legal advice. Always confirm current FCC/USAC rules for each procurement.</p>
            </details>

            {/* Search Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Search Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Year Filter - defaults to the upcoming funding year (Ari loom-1 #4/#7) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Funding Year</label>
                  <select
                    value={form470Filters.year ?? ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, year: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Years</option>
                    {(() => { const uy = getUpcomingFundingYear(); return [uy, uy - 1, uy - 2, uy - 3, uy - 4, uy - 5]; })().map((year) => (
                      <option key={year} value={year}>FY{year}{year === getUpcomingFundingYear() ? " (upcoming)" : ""}</option>
                    ))}
                  </select>
                </div>

                {/* Applicant Name search - search by name, not just BEN (Ari loom-1 #6) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Applicant Name</label>
                  <input
                    type="text"
                    value={form470Filters.name || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, name: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., Lincoln, Battalion"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* State Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">State</label>
                  <select
                    value={form470Filters.state || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, state: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All States</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <select
                    value={form470Filters.category || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, category: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Categories</option>
                    <option value="1">Category 1 (Internet/WAN)</option>
                    <option value="2">Category 2 (Equipment)</option>
                  </select>
                </div>

                {/* School / Applicant Type Filter (Ari #9 - vendor requested) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">School / Applicant Type</label>
                  <select
                    value={form470ApplicantType}
                    onChange={(e) => setForm470ApplicantType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Types</option>
                    <option value="__charter__">Charter School (by name)</option>
                    {form470ApplicantTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Manufacturer Filter - KEY DIFFERENTIATOR */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Manufacturer <span className="text-orange-500 text-xs">(Exclusive!)</span>
                  </label>
                  <input
                    type="text"
                    value={form470Filters.manufacturer || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, manufacturer: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., Cisco, Meraki, Aruba"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Equipment Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Equipment Type</label>
                  <input
                    type="text"
                    value={form470Filters.equipment_type || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, equipment_type: e.target.value || undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., Switches, Routers, Cabling"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Service Function Filter (MIBS/BMIC) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Service Function</label>
                  <select
                    value={form470Filters.service_function || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, service_function: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">All Functions</option>
                    <option value="Managed Internal Broadband Services">MIBS (Managed Internal Broadband)</option>
                    <option value="Basic Maintenance of Internal Connections">BMIC (Basic Maintenance)</option>
                    <option value="Internal Connections">Internal Connections</option>
                    <option value="Internet Access">Internet Access</option>
                    <option value="Data Transmission and/or Internet Access">Data Transmission / Internet</option>
                    <option value="Voice">Voice Services</option>
                  </select>
                </div>

                {/* Speed Range Filters */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Min Speed (Mbps)</label>
                  <input
                    type="number"
                    value={form470Filters.min_speed || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, min_speed: e.target.value || undefined })}
                    placeholder="e.g., 100"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Max Speed (Mbps)</label>
                  <input
                    type="number"
                    value={form470Filters.max_speed || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, max_speed: e.target.value || undefined })}
                    placeholder="e.g., 10000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Deal-size ($) filters — uses USAC C2 Budget Tool data (6brt-5pbv).
                  Requires a State filter (we only enrich state-scoped queries). */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Min $ (C2 Budget Available)
                  </label>
                  <input
                    type="number"
                    value={form470Filters.min_deal_value ?? ""}
                    onChange={(e) => setForm470Filters({
                      ...form470Filters,
                      min_deal_value: e.target.value ? parseFloat(e.target.value) : undefined,
                    })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., 50000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Max $ (C2 Budget Available)
                  </label>
                  <input
                    type="number"
                    value={form470Filters.max_deal_value ?? ""}
                    onChange={(e) => setForm470Filters({
                      ...form470Filters,
                      max_deal_value: e.target.value ? parseFloat(e.target.value) : undefined,
                    })}
                    onKeyDown={(e) => { if (e.key === 'Enter') load470Leads(form470Filters); }}
                    placeholder="e.g., 500000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-slate-500">
                    $ filters use the BEN&apos;s available C2 budget from USAC. Pair with a State filter.
                  </p>
                </div>
              </div>

              {/* Sort + Search Row */}
              <div className="flex flex-wrap items-end gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Sort By</label>
                  <select
                    value={form470Filters.sort_by || ""}
                    onChange={(e) => setForm470Filters({ ...form470Filters, sort_by: e.target.value || undefined })}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Newest First</option>
                    <option value="entity_name">Applicant Name (A→Z)</option>
                    <option value="c2_budget_available">Highest C2 Budget Available</option>
                  </select>
                </div>
                <button
                  onClick={() => load470Leads(form470Filters)}
                  disabled={form470Loading}
                  className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium hover:from-orange-600 hover:to-amber-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {form470Loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      Search 470s
                    </>
                  )}
                </button>
                <button
                  onClick={() => { const f = { year: getUpcomingFundingYear() }; setForm470Filters(f); load470Leads(f); }}
                  className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                >
                  Clear Filters
                </button>
              </div>

              {/* Look up a specific BEN — jump straight to that entity's 470 */}
              <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Know the entity? Look up their Form 470 by BEN</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={benLookup}
                    onChange={(e) => setBenLookup(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBenLookup(); }}
                    inputMode="numeric"
                    placeholder="Enter a BEN (e.g. 16056315)"
                    className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <button
                    onClick={handleBenLookup}
                    disabled={benLookupLoading || !benLookup.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {benLookupLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Search className="w-4 h-4" />}
                    Look up 470
                  </button>
                </div>
                {benLookupMsg && <p className="text-sm text-slate-600 mt-2">{benLookupMsg}</p>}
                {benLookupResults.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {benLookupResults.map((l) => (
                      <button key={l.application_number} onClick={() => load470Detail(l.application_number)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2">
                        <span className="font-medium text-slate-900">{l.entity_name}</span>
                        <span className="text-xs text-slate-500">FY{l.funding_year} · #{l.application_number}</span>
                        <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Manufacturer Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-slate-500">Quick search:</span>
                {['Cisco', 'Meraki', 'Aruba', 'Fortinet', 'SonicWall', 'HP', 'Ubiquiti', 'Ruckus'].map((mfr) => (
                  <button
                    key={mfr}
                    onClick={() => {
                      setForm470Filters({ ...form470Filters, manufacturer: mfr });
                      load470Leads({ ...form470Filters, manufacturer: mfr });
                    }}
                    className="px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm hover:bg-orange-100 transition-colors"
                  >
                    {mfr}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Display */}
            {form470Error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                {form470Error}
              </div>
            )}

            {/* Loading skeleton (Phase A4) */}
            {form470Loading && form470Leads.length === 0 && (
              <SkeletonTable rows={8} columns={6} />
            )}

            {/* Results Summary */}
            {form470TotalLeads > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <div>
                  <div className="font-medium text-green-800">Found {form470TotalLeads} Form 470 Leads</div>
                  <div className="text-sm text-green-600">
                    {form470Filters.manufacturer && `Manufacturer: ${form470Filters.manufacturer} • `}
                    {form470Filters.state && `State: ${form470Filters.state} • `}
                    {form470Filters.category && `Category ${form470Filters.category}`}
                  </div>
                </div>
              </div>
            )}

            {/* Results Table */}
            {form470Leads.length > 0 && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedForm470Leads.size}
                totalCount={form470Leads.length}
                onExportCsv={exportForm470LeadsCsv}
                onExportExcel={exportForm470LeadsExcel}
                onClearSelection={clearForm470Selection}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedForm470Leads.size === form470Leads.length && form470Leads.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                selectAllForm470Leads();
                              } else {
                                clearForm470Selection();
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => toggleForm470Sort('entity_name')}
                        >
                          <span className="flex items-center gap-1">
                            Entity
                            {form470Sort?.field === 'entity_name' && (
                              <span className="text-blue-600">{form470Sort.dir === 'asc' ? '↑' : '↓'}</span>
                            )}
                            {form470Sort?.field !== 'entity_name' && (
                              <span className="text-slate-300">↕</span>
                            )}
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Location</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Year</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Manufacturers</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Services</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">C2 Budget Available</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Contact</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedForm470Leads.map((lead) => (
                        <tr key={lead.application_number} className={`hover:bg-slate-50 transition-colors ${selectedForm470Leads.has(lead.application_number) ? 'bg-orange-50' : ''}`}>
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedForm470Leads.has(lead.application_number)}
                              onChange={() => toggleForm470LeadSelection(lead.application_number)}
                              className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{lead.entity_name || 'Unknown'}</div>
                            <div className="text-sm text-slate-500">
                              470 #{lead.application_number} • {lead.applicant_type}
                            </div>
                            {lead.professional_services && (
                              <span
                                title={`Requested: ${(lead.service_types || []).join(', ') || 'installation / professional services'}`}
                                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-teal-100 text-teal-800 rounded text-xs font-medium"
                              >
                                Pro services / install requested
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700">{lead.city}, {lead.state}</div>
                            <div className="text-xs text-slate-500">BEN: {lead.ben}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                              {lead.funding_year}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {lead.manufacturers?.slice(0, 3).map((mfr, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                  {mfr}
                                </span>
                              ))}
                              {(lead.manufacturers?.length || 0) > 3 && (
                                <span className="text-xs text-slate-500">+{lead.manufacturers!.length - 3} more</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {lead.categories?.map((cat, idx) => (
                                <span key={idx} className={`px-2 py-0.5 rounded text-xs ${
                                  cat.includes('1') ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {lead.service_types?.slice(0, 2).join(', ')}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {lead.c2_budget_available != null ? (
                              <>
                                <div className="font-medium text-emerald-700">
                                  ${Math.round(lead.c2_budget_available).toLocaleString()}
                                </div>
                                {lead.c2_budget_cycle && (
                                  <div className="text-xs text-slate-500">{lead.c2_budget_cycle}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-slate-700">{lead.contact_name || '-'}</div>
                            {lead.contact_email && (
                              <a href={`mailto:${lead.contact_email}`} className="text-xs text-blue-600 hover:underline">
                                {lead.contact_email}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => load470Detail(lead.application_number)}
                              className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm hover:bg-orange-200 transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            )}

            {/* Empty State */}
            {!form470Loading && form470Leads.length === 0 && !form470Error && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎯</span>
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Search for Form 470 Leads</h3>
                <p className="text-slate-600 mb-4">
                  Use the filters above to find schools seeking vendors.<br/>
                  Try searching by <strong>manufacturer</strong> to find leads for specific product lines!
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => load470Leads({})}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Show All Recent 470s
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Opportunity Map Tab (Phase D — geospatial) */}
        {activeTab === "map" && (
          <div className="space-y-6">
            <OpportunityMap />
            <OpportunityAlerts />
          </div>
        )}

        {/* Predicted Leads Tab */}
        {activeTab === "predicted-leads" && (
          <PredictedLeadsTab
            onView471={(ben, year, frn) => {
              // Jump to the 471 Lookup tab focused on the SPECIFIC contract FRN
              // behind this prediction so the vendor sees exactly that 471 (with
              // line items), not every FRN for the entity. When an FRN is given we
              // load ALL years (then filter to that FRN) so it is guaranteed to be
              // present even if the prediction's funding year is off.
              const lookupYear = frn ? undefined : year;
              setForm471BenInput(ben);
              setForm471Year(lookupYear);
              setFocus471Frn(frn ?? null);
              setExpanded471Frn(frn ?? null);
              setActiveTab("competitive");
              search471ByBen(ben, lookupYear);
            }}
            onView470={(applicationNumber) => load470Detail(applicationNumber)}
          />
        )}

        {/* Form 471 Competitive Analysis Tab */}
        {activeTab === "competitive" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">🎯</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">470/471 Lookup</h1>
                    <p className="text-blue-100 mt-1">See who has won contracts at any school and download its certified Form 470 &amp; 471 documents</p>
                  </div>
                </div>
              </div>
            </div>

            {/* BEN Lookup */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Look Up Entity by BEN</h2>
              <p className="text-sm text-slate-600 mb-4">
                Enter a Billed Entity Number (BEN) to see all Form 471 applications and which vendors won contracts.
              </p>
              
              <div className="flex flex-wrap gap-3 mb-4">
                <input
                  type="text"
                  value={form471BenInput}
                  onChange={(e) => { setForm471BenInput(e.target.value); setFocus471Frn(null); }}
                  placeholder="Enter BEN (e.g., 232950)"
                  className="flex-1 min-w-[200px] px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  onKeyDown={(e) => e.key === 'Enter' && (setFocus471Frn(null), search471ByBen())}
                />
                <select
                  value={form471Year || ""}
                  onChange={(e) => setForm471Year(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Years</option>
                  {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setFocus471Frn(null); search471ByBen(); }}
                  disabled={form471Loading}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                >
                  {form471Loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      Search
                    </>
                  )}
                </button>
              </div>
              
              {form471Error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {form471Error}
                </div>
              )}
            </div>

            {/* 471 Results */}
            {form471Data && (
              <div className="space-y-6">
                {/* Entity Summary */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{form471Data.entity_name}</h2>
                      <div className="flex items-center gap-3 mt-1 text-slate-600">
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-sm">BEN: {form471Data.ben}</span>
                        <span className="text-sm">{form471Data.entity_state}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        ${form471Data.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-sm text-slate-500">Total Committed</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.total_records}</div>
                      <div className="text-sm text-slate-500">Total FRNs</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.vendors?.length || 0}</div>
                      <div className="text-sm text-slate-500">Unique Vendors</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="text-2xl font-bold text-slate-900">{form471Data.funding_years?.length || 0}</div>
                      <div className="text-sm text-slate-500">Funding Years</div>
                    </div>
                  </div>

                  {/* Per-entity purchase-history drill-down (B5) */}
                  {form471Data.ben && (
                    <div className="mt-5">
                      <button
                        onClick={() => setPurchaseHistoryBen(String(form471Data.ben))}
                        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        📜 View purchase history
                      </button>
                    </div>
                  )}

                  {/* Certified Form PDFs — download the actual USAC Form 470 & 471
                      documents for this entity (parity with consultant/applicant). */}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <h3 className="text-sm font-semibold text-slate-900 mb-1">Certified Form PDFs</h3>
                    <p className="text-xs text-slate-500 mb-3">Download the actual USAC-certified Form 470 and Form 471 documents for this entity.</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        // Distinct Form 470 filings for this entity, newest first.
                        const seen470 = new Set<string>();
                        const f470 = entity470Filings.filter((l) => {
                          const app = String(l.application_number || '');
                          if (!app || seen470.has(app)) return false;
                          seen470.add(app);
                          return true;
                        });
                        // Distinct Form 471 applications from the records above.
                        const seen471 = new Set<string>();
                        const f471 = (form471Data.records || []).filter((r) => {
                          const app = String(r.application_number || '');
                          if (!app || seen471.has(app)) return false;
                          seen471.add(app);
                          return true;
                        });
                        return (
                          <>
                            {f470.map((l) => (
                              <button
                                key={`f470-${l.application_number}`}
                                type="button"
                                onClick={() => downloadFormPdf('470', l.application_number)}
                                disabled={pdfBusyApp === String(l.application_number)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                                {pdfBusyApp === String(l.application_number) ? 'Fetching…' : `Form 470 PDF · FY${l.funding_year}`}
                              </button>
                            ))}
                            {f471.map((r) => (
                              <button
                                key={`f471-${r.application_number}`}
                                type="button"
                                onClick={() => downloadFormPdf('471', r.application_number)}
                                disabled={pdfBusyApp === String(r.application_number)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                                {pdfBusyApp === String(r.application_number) ? 'Fetching…' : `Form 471 PDF · FY${r.funding_year}`}
                              </button>
                            ))}
                            {f470.length === 0 && (
                              <span className="text-xs text-slate-400 self-center">No Form 470 filings found for this entity.</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    {pdfError && (
                      <div className="mt-2 text-xs text-red-600">{pdfError}</div>
                    )}
                  </div>
                </div>

                {/* Vendors at this Entity */}
                {form471Data.vendors && form471Data.vendors.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-purple-50">
                      <h3 className="font-semibold text-slate-900">Vendors at this Entity</h3>
                      <p className="text-sm text-slate-600">Service providers who have won contracts here</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {form471Data.vendors.map((vendor, idx) => (
                        <div key={vendor.spin} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white ${
                            idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-300'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900">{vendor.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">SPIN: {vendor.spin}</span>
                              <span className="text-xs text-slate-500">{vendor.frn_count} FRNs</span>
                              {vendor.spin === profile?.spin && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Your Company</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-green-600">
                              ${vendor.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-slate-500">committed</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FRN Details */}
                {form471Data.records && form471Data.records.length > 0 && (
                  <div className="space-y-2">
                  <TableExportBar
                    selectedCount={selectedForm471Records.size}
                    totalCount={displayed471Records.length}
                    onExportCsv={exportForm471Records}
                    onClearSelection={() => setSelectedForm471Records(new Set())}
                  />
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">FRN Details</h3>
                        <p className="text-sm text-slate-600">
                          {focus471Frn && displayed471Records.length < grouped471Records.length
                            ? `Showing the contract for FRN ${focus471Frn}`
                            : "All Form 471 funding requests for this entity"}
                        </p>
                      </div>
                      {focus471Frn && displayed471Records.length < grouped471Records.length && (
                        <button
                          onClick={() => setFocus471Frn(null)}
                          className="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
                        >
                          Show all {grouped471Records.length} FRNs
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={selectedForm471Records.size === displayed471Records.length && displayed471Records.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedForm471Records(new Set(displayed471Records.map(r => r.frn)));
                                  } else {
                                    setSelectedForm471Records(new Set());
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                            </th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Vendor</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Service Type</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                            <th className="text-right px-4 py-3 font-medium text-slate-600">Committed</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayed471Records.slice(0, 50).map((record, idx) => {
                            const isExpanded = expanded471Frn === record.frn;
                            const lineItems = form471LineItemsCache[record.frn];
                            const isLoadingItems = form471LineItemsLoadingFrn === record.frn;
                            return (
                            <Fragment key={idx}>
                            <tr
                              className={`hover:bg-slate-50 cursor-pointer ${selectedForm471Records.has(record.frn) ? 'bg-purple-50' : ''} ${isExpanded ? 'bg-slate-50' : ''}`}
                              onClick={() => toggle471LineItems(record.frn)}
                            >
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedForm471Records.has(record.frn)}
                                  onChange={() => {
                                    setSelectedForm471Records(prev => {
                                      const next = new Set(prev);
                                      if (next.has(record.frn)) next.delete(record.frn);
                                      else next.add(record.frn);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-slate-900">{record.funding_year}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <svg className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                  {record.frn}
                                </span>
                                {record.application_number && (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); downloadFormPdf('471', record.application_number); }}
                                      disabled={pdfBusyApp === String(record.application_number)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                                      {pdfBusyApp === String(record.application_number) ? 'Fetching…' : 'Form 471 PDF'}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{record.service_provider_name}</div>
                                <div className="text-xs text-slate-500">{record.service_provider_spin}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{record.service_type}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  record.category?.includes('1') ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {record.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-green-600">
                                ${record.committed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  record.frn_status?.toLowerCase().includes('funded') || record.frn_status?.toLowerCase().includes('committed') 
                                    ? 'bg-green-100 text-green-700' 
                                    : record.frn_status?.toLowerCase().includes('denied')
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {record.frn_status || 'Unknown'}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50">
                                <td colSpan={8} className="px-4 py-3">
                                  {isLoadingItems ? (
                                    <div className="py-3 text-sm text-slate-500">Loading line items…</div>
                                  ) : !lineItems || lineItems.length === 0 ? (
                                    <div className="py-3 text-sm text-slate-500">No line items found for this FRN.</div>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                      <table className="w-full text-xs">
                                        <thead className="bg-slate-100">
                                          <tr>
                                            <th className="text-left px-3 py-2 font-medium text-slate-600">Line #</th>
                                            <th className="text-left px-3 py-2 font-medium text-slate-600">Function</th>
                                            <th className="text-left px-3 py-2 font-medium text-slate-600">Product</th>
                                            <th className="text-left px-3 py-2 font-medium text-slate-600">Manufacturer</th>
                                            <th className="text-left px-3 py-2 font-medium text-slate-600">Model</th>
                                            <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
                                            <th className="text-right px-3 py-2 font-medium text-slate-600">Unit Cost</th>
                                            <th className="text-right px-3 py-2 font-medium text-slate-600">Extended Cost</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {lineItems.map((li, liIdx) => (
                                            <tr key={liIdx} className="hover:bg-slate-50">
                                              <td className="px-3 py-2 font-mono text-slate-600">{li.line_item_number || '—'}</td>
                                              <td className="px-3 py-2 text-slate-700">{li.function || '—'}</td>
                                              <td className="px-3 py-2 text-slate-700">{li.product || '—'}</td>
                                              <td className="px-3 py-2 text-slate-700">{li.manufacturer || '—'}</td>
                                              <td className="px-3 py-2 text-slate-700">{li.model || '—'}</td>
                                              <td className="px-3 py-2 text-right text-slate-700">{li.quantity != null ? li.quantity.toLocaleString() : '—'}</td>
                                              <td className="px-3 py-2 text-right text-slate-700">{li.unit_cost != null ? `$${li.unit_cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</td>
                                              <td className="px-3 py-2 text-right font-medium text-green-600">{li.extended_cost != null ? `$${li.extended_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                            </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                      {displayed471Records.length > 50 && (
                        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
                          Showing first 50 of {displayed471Records.length} FRNs
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            )}

            {/* Competitor Analysis Card - only show if SPIN configured */}
            {profile?.spin && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Your Competitor Analysis</h3>
                    <p className="text-sm text-slate-600">See which vendors compete at your serviced entities</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Category scope toggle — Cat2 equipment resellers can drop
                        Cat1 internet volume that skews the report (Tim Clark). */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
                      {([['', 'All'], ['1', 'Cat 1'], ['2', 'Cat 2']] as const).map(([val, label]) => (
                        <button
                          key={val || 'all'}
                          onClick={() => { setCompetitorCategory(val); loadCompetitorAnalysis(val); }}
                          disabled={competitorLoading}
                          className={`px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 ${
                            competitorCategory === val
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => loadCompetitorAnalysis()}
                      disabled={competitorLoading}
                      className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      {competitorLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Analyzing...
                        </>
                      ) : (
                        <>Analyze Competitors</>
                      )}
                    </button>
                  </div>
                </div>
                
                {competitorData && competitorData.success && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-slate-900">{competitorData.entities_analyzed}</div>
                        <div className="text-sm text-slate-500">Entities Analyzed</div>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-green-600">{competitorData.my_frn_count}</div>
                        <div className="text-sm text-slate-500">Your FRNs</div>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-4">
                        <div className="text-2xl font-bold text-amber-600">{competitorData.competitor_frn_count}</div>
                        <div className="text-sm text-slate-500">Competitor FRNs</div>
                      </div>
                    </div>
                    
                    {competitorData.competitors && competitorData.competitors.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 bg-slate-50 border-b border-slate-200">
                          <span className="font-medium text-slate-700">Top Competitors at Your Entities</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {competitorData.competitors.slice(0, 10).map((comp, idx) => (
                            <div key={comp.spin} className="p-3 flex items-center gap-3 hover:bg-slate-50">
                              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-slate-900 truncate">{comp.name}</div>
                                <div className="text-xs text-slate-500">
                                  {comp.frn_count} FRNs • {comp.entity_count || 0} entities
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium text-amber-600">
                                  ${comp.total_committed?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div className="space-y-6">
            {/* Search Filters */}
            <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Search Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">State</label>
                  <select
                    value={searchState}
                    onChange={(e) => setSearchState(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All States</option>
                    {US_STATES.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                  <select
                    value={searchStatus}
                    onChange={(e) => setSearchStatus(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All Statuses</option>
                    <option value="Funded">Funded</option>
                    <option value="Pending">Pending</option>
                    <option value="Denied">Denied</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Service Type</label>
                  <select
                    value={searchServiceType}
                    onChange={(e) => setSearchServiceType(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value="">All Types</option>
                    {SERVICE_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
                  <select
                    value={searchYear}
                    onChange={(e) => setSearchYear(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                    <option value={2023}>2023</option>
                    <option value={2022}>2022</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Min Amount ($)</label>
                  <input
                    type="number"
                    value={searchMinAmount}
                    onChange={(e) => setSearchMinAmount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Max Amount ($)</label>
                  <input
                    type="number"
                    value={searchMaxAmount}
                    onChange={(e) => setSearchMaxAmount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                    placeholder="No limit"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all disabled:opacity-50 font-medium"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </span>
                ) : "Search Schools"}
              </button>
            </form>

            {/* Loading skeleton for first-page search (Phase A4) */}
            {isLoading && searchResults.length === 0 && (
              <SkeletonTable rows={8} columns={6} />
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedSchools.size}
                totalCount={searchResults.length}
                onExportCsv={handleExport}
                onClearSelection={() => setSelectedSchools(new Set())}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Results ({searchResults.length})
                  </h2>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSchools(new Set(searchResults.map(s => s.ben)));
                              } else {
                                setSelectedSchools(new Set());
                              }
                            }}
                            checked={selectedSchools.size === searchResults.length}
                            className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">BEN</th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                          onClick={() => toggleSchoolSearchSort('name')}
                        >
                          <span className="flex items-center gap-1">
                            School Name
                            {schoolSearchSort?.field === 'name' && (
                              <span className="text-blue-600">{schoolSearchSort.dir === 'asc' ? '↑' : '↓'}</span>
                            )}
                            {schoolSearchSort?.field !== 'name' && (
                              <span className="text-slate-300">↕</span>
                            )}
                          </span>
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Funding</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedSearchResults.map((school) => (
                        <tr key={school.ben} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedSchools.has(school.ben)}
                              onChange={() => toggleSchoolSelection(school.ben)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleViewSchoolDetail(school)}
                              className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
                              title="Click to view school details"
                            >
                              {school.ben}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">{school.name || '-'}</td>
                          <td className="px-4 py-3">{school.state}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              school.status === 'Funded' || school.status === 'FUNDED'
                                ? 'bg-green-100 text-green-700'
                                : school.status === 'Denied' || school.status === 'DENIED'
                                ? 'bg-red-100 text-red-700'
                                : school.status === 'Pending' || school.status === 'PENDING'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {school.status || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium">{school.funding_amount ? `$${school.funding_amount.toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-sm">{school.service_type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* Pagination controls */}
              {searchTotalCount > 0 && (
                <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 mt-3">
                  <span className="text-sm text-slate-500">
                    Page {searchPage} of {searchTotalPages} · {searchTotalCount.toLocaleString()} total results
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSearch(null, { page: Math.max(1, searchPage - 1) })}
                      disabled={isLoading || searchPage <= 1}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Previous
                    </button>
                    {Array.from({ length: Math.min(5, searchTotalPages) }, (_, i) => {
                      // window of 5 pages around current
                      const start = Math.max(1, Math.min(searchPage - 2, searchTotalPages - 4));
                      const p = start + i;
                      if (p > searchTotalPages) return null;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleSearch(null, { page: p })}
                          disabled={isLoading}
                          className={`min-w-[34px] px-2 py-1.5 text-sm rounded-lg border ${
                            p === searchPage
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleSearch(null, { page: Math.min(searchTotalPages, searchPage + 1) })}
                      disabled={isLoading || searchPage >= searchTotalPages}
                      className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
              </div>
            )}

            {searchResults.length === 0 && !isLoading && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔍</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">No Results Yet</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  {searchYear === 2026
                    ? "No results for FY 2026 yet. USAC FY 2026 data is partially populated — try FY 2025 if you don't see results."
                    : "Use the filters above to search for schools with E-Rate funding and find your next customers."}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "leads" && (
          <div className="space-y-6">
            {/* Header with filters and export */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Saved Leads</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {savedLeadsTotalCount} leads saved • Manage and enrich your leads
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Status Filter */}
                  <select
                    value={savedLeadsFilter}
                    onChange={(e) => {
                      setSavedLeadsFilter(e.target.value);
                      loadSavedLeads(e.target.value || undefined);
                    }}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">All Status</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                  
                  {/* Export Button */}
                  <button
                    onClick={exportSavedLeads}
                    disabled={savedLeads.length === 0}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <span>📥</span>
                    Export {selectedLeadIds.size > 0 ? `(${selectedLeadIds.size})` : 'All'}
                  </button>
                  
                  {/* Refresh */}
                  <button
                    onClick={() => loadSavedLeads(savedLeadsFilter || undefined)}
                    disabled={savedLeadsLoading}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    {savedLeadsLoading ? (
                      <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Pipeline stage summary (B7): per-stage counts double as quick filters */}
              <div className="flex items-stretch gap-2 mb-4 overflow-x-auto pb-1">
                {(() => {
                  const totalAll = PIPELINE_STAGES.reduce((n, s) => n + (pipelineCounts[s.key] || 0), 0);
                  return (
                    <button
                      onClick={() => { setSavedLeadsFilter(''); loadSavedLeads(); }}
                      className={`flex-shrink-0 min-w-[92px] rounded-xl border px-3 py-2 text-left transition-colors ${savedLeadsFilter === '' ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className="text-lg font-bold text-slate-900">{totalAll}</div>
                      <div className="text-xs text-slate-500">All</div>
                    </button>
                  );
                })()}
                {PIPELINE_STAGES.map((stage) => (
                  <button
                    key={stage.key}
                    onClick={() => { setSavedLeadsFilter(stage.key); loadSavedLeads(stage.key); }}
                    className={`flex-shrink-0 min-w-[92px] rounded-xl border px-3 py-2 text-left transition-colors ${savedLeadsFilter === stage.key ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${stage.dot}`}></span>
                      <span className="text-lg font-bold text-slate-900">{pipelineCounts[stage.key] || 0}</span>
                    </div>
                    <div className="text-xs text-slate-500">{stage.label}</div>
                  </button>
                ))}
              </div>

              {/* Selection controls */}
              {savedLeads.length > 0 && (
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.size === savedLeads.length && savedLeads.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLeadIds(new Set(savedLeads.map(l => l.id)));
                        } else {
                          setSelectedLeadIds(new Set());
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    Select All
                  </label>
                  {selectedLeadIds.size > 0 && (
                    <span className="text-sm text-slate-500">
                      {selectedLeadIds.size} selected
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {/* Saved Leads List */}
            {savedLeadsLoading ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-500">Loading saved leads...</p>
              </div>
            ) : savedLeads.length > 0 ? (
              <div className="space-y-3">
                {savedLeads.map((lead) => (
                  <div key={lead.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedLeadIds);
                            if (e.target.checked) {
                              newSet.add(lead.id);
                            } else {
                              newSet.delete(lead.id);
                            }
                            setSelectedLeadIds(newSet);
                          }}
                          className="w-4 h-4 mt-1 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                        />
                        
                        {/* Lead Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-semibold text-slate-900 truncate">
                                {lead.entity_name || `BEN: ${lead.ben}`}
                              </h3>
                              <p className="text-sm text-slate-500 mt-0.5">
                                Form {lead.form_type} #{lead.application_number} • {lead.entity_city}, {lead.entity_state}
                              </p>
                            </div>
                            
                            {/* Status Badge */}
                            <select
                              value={lead.lead_status}
                              onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-purple-500 ${
                                lead.lead_status === 'new' ? 'bg-blue-100 text-blue-700' :
                                lead.lead_status === 'contacted' ? 'bg-yellow-100 text-yellow-700' :
                                lead.lead_status === 'qualified' ? 'bg-purple-100 text-purple-700' :
                                lead.lead_status === 'won' ? 'bg-green-100 text-green-700' :
                                lead.lead_status === 'lost' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              <option value="new">New</option>
                              <option value="contacted">Contacted</option>
                              <option value="qualified">Qualified</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                            </select>
                          </div>
                          
                          {/* Contact Info */}
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            {lead.contact_name && (
                              <span className="text-slate-600">
                                <span className="text-slate-400">Contact:</span> {lead.contact_name}
                              </span>
                            )}
                            {lead.contact_email && (
                              <a href={`mailto:${lead.contact_email}`} className="text-blue-600 hover:underline">
                                {lead.contact_email}
                              </a>
                            )}
                            {lead.contact_phone && (
                              <a href={`tel:${lead.contact_phone}`} className="text-blue-600 hover:underline">
                                {lead.contact_phone}
                              </a>
                            )}
                            {lead.enriched_data?.linkedin_url && (
                              <a 
                                href={lead.enriched_data.linkedin_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                </svg>
                                LinkedIn
                              </a>
                            )}
                          </div>
                          
                          {/* Tags */}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {lead.categories?.map((cat, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                {cat}
                              </span>
                            ))}
                            {lead.manufacturers?.slice(0, 3).map((mfr, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                {mfr}
                              </span>
                            ))}
                            {lead.enrichment_date && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                                ✨ Enriched
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (lead.form_type === '470') {
                                // Real Form 470 lead — fetch full USAC detail
                                load470Detail(lead.application_number);
                              } else {
                                // Predicted or 471 lead — show saved lead's own data in detail modal
                                setSelectedSavedLeadDetail(lead);
                                setShowSavedLeadDetailModal(true);
                              }
                            }}
                            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteSavedLead(lead.id)}
                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove Lead"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Additional Contacts Preview */}
                      {lead.enriched_data?.additional_contacts && lead.enriched_data.additional_contacts.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-2">
                            Additional Contacts ({lead.enriched_data.additional_contacts.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {lead.enriched_data.additional_contacts.slice(0, 3).map((contact, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded text-xs">
                                <span className="font-medium">{contact.name}</span>
                                {contact.email && (
                                  <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                                    {contact.email}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📋</span>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">No Saved Leads</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Browse Form 470 leads and save them to build your lead list for targeted outreach.
                </p>
                <button
                  onClick={() => setActiveTab("470-leads")}
                  className="mt-6 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all font-medium"
                >
                  Browse Form 470 Leads
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "my-entities" && (
          <div className="space-y-6">
            {/* SPIN Status Card */}
            {profile?.spin ? (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">✅</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">SPIN Verified</h2>
                      <p className="text-sm text-slate-600">
                        {servicedEntitiesStats?.service_provider_name || profile.company_name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-green-700">{profile.spin}</div>
                    <button
                      onClick={loadServicedEntities}
                      disabled={servicedEntitiesLoading}
                      className="text-sm text-green-600 hover:underline mt-1"
                    >
                      {servicedEntitiesLoading ? "Refreshing..." : "Refresh Data"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">SPIN Not Configured</h2>
                    <p className="text-sm text-slate-600">
                      Add your SPIN in Settings to see your serviced entities
                    </p>
                    <button
                      onClick={() => setActiveTab("settings")}
                      className="mt-2 text-sm text-amber-700 hover:underline font-medium"
                    >
                      Go to Settings →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            {profile?.spin && servicedEntitiesStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                      <span className="text-2xl">🏫</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{servicedEntitiesStats.total_entities}</div>
                  <div className="text-sm text-slate-500 mt-1">Entities Serviced</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <span className="text-2xl">💰</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    ${(servicedEntitiesStats.total_authorized / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Total Authorized</div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                      <span className="text-2xl">📅</span>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{servicedEntitiesStats.funding_years.length}</div>
                  <div className="text-sm text-slate-500 mt-1">Funding Years</div>
                </div>
              </div>
            )}

            {/* Serviced Entities Table */}
            {profile?.spin && (
              <div className="space-y-2">
              <TableExportBar
                selectedCount={selectedServicedEntities.size}
                totalCount={servicedEntities.length}
                onExportCsv={exportServicedEntities}
                onClearSelection={() => setSelectedServicedEntities(new Set())}
              />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">
                    Schools & Libraries You Service
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Based on invoice disbursement data from USAC
                  </p>
                </div>
                
                {servicedEntitiesLoading ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600">Loading your serviced entities...</p>
                  </div>
                ) : servicedEntities.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={selectedServicedEntities.size === sortedServicedEntities.length && sortedServicedEntities.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedServicedEntities(new Set(sortedServicedEntities.map(e => e.ben)));
                                } else {
                                  setSelectedServicedEntities(new Set());
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                          </th>
                          <th 
                            className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleServicedEntitiesSort('organization_name')}
                          >
                            <span className="flex items-center gap-1">
                              Entity Name
                              {servicedEntitiesSort?.field === 'organization_name' && (
                                <span className="text-blue-600">{servicedEntitiesSort.dir === 'asc' ? '↑' : '↓'}</span>
                              )}
                              {servicedEntitiesSort?.field !== 'organization_name' && (
                                <span className="text-slate-300">↕</span>
                              )}
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            <div className="flex flex-col">
                              <span>Current Year</span>
                              <span className="text-[10px] font-normal normal-case text-slate-400">Cat 1 Budget</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            <div className="flex flex-col">
                              <span>Current Year</span>
                              <span className="text-[10px] font-normal normal-case text-slate-400">Cat 2 Budget</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Lifetime</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">FRNs</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Years Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedServicedEntities.slice(0, 50).map((entity) => (
                          <tr 
                            key={entity.ben} 
                            className={`hover:bg-purple-50 transition-colors cursor-pointer group ${selectedServicedEntities.has(entity.ben) ? 'bg-teal-50' : ''}`}
                            onClick={() => loadEntityDetail(entity)}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedServicedEntities.has(entity.ben)}
                                onChange={() => {
                                  setSelectedServicedEntities(prev => {
                                    const next = new Set(prev);
                                    if (next.has(entity.ben)) next.delete(entity.ben);
                                    else next.add(entity.ben);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-medium text-slate-900 group-hover:text-purple-700 transition-colors">
                                    {entity.organization_name}
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono">BEN: {entity.ben}</div>
                                </div>
                                <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-600 ml-auto opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                                {entity.state}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {entity.current_cat1 && entity.current_cat1 > 0 ? (
                                <div className="text-right">
                                  <div className="font-semibold text-blue-600">
                                    ${entity.current_cat1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                  <div className="text-xs text-slate-400">{entity.current_year}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {entity.current_cat2 && entity.current_cat2 > 0 ? (
                                <div className="text-right">
                                  <div className="font-semibold text-emerald-600">
                                    ${entity.current_cat2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                  </div>
                                  <div className="text-xs text-slate-400">{entity.current_year}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-semibold text-green-600 text-right">
                              ${entity.total_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-600">{entity.frn_count}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {entity.funding_years?.slice(0, 3).map(year => (
                                  <span key={year} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    {year}
                                  </span>
                                ))}
                                {entity.funding_years?.length > 3 && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                    +{entity.funding_years.length - 3}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {servicedEntities.length > 50 && (
                      <div className="p-4 text-center border-t border-slate-200">
                        <p className="text-sm text-slate-500">
                          Showing 50 of {servicedEntities.length} entities. Click an entity to see full details.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">🏫</span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">No Invoice Data Found</h2>
                    <p className="text-slate-500 mt-2 max-w-md mx-auto">
                      We couldn&apos;t find any invoice disbursement records for your SPIN. This may be because you&apos;re new to E-Rate or invoices haven&apos;t been processed yet.
                    </p>
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* SPIN Configuration - NEW */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <span className="text-xl">🔑</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">SPIN Configuration</h2>
                  <p className="text-sm text-slate-500">Your Service Provider Identification Number from USAC</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    SPIN (Service Provider Identification Number)
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={spinInput}
                      onChange={(e) => {
                        setSpinInput(e.target.value);
                        setSpinValidation(null);
                        setSpinError(null);
                      }}
                      placeholder="e.g., 143032945"
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition font-mono"
                    />
                    <button
                      onClick={validateSpin}
                      disabled={spinValidating || !spinInput.trim()}
                      className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {spinValidating ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Validating...
                        </>
                      ) : "Validate"}
                    </button>
                  </div>
                  
                  {spinError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{spinError}</p>
                    </div>
                  )}
                  
                  {spinValidation && (
                    <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-600">✓</span>
                        <span className="font-semibold text-green-700">Valid SPIN Found</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-slate-500">Provider Name:</span>
                          <span className="ml-2 font-medium">{spinValidation.service_provider_name}</span>
                        </div>
                        {spinValidation.doing_business_as && (
                          <div>
                            <span className="text-slate-500">DBA:</span>
                            <span className="ml-2 font-medium">{spinValidation.doing_business_as}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500">Status:</span>
                          <span className={`ml-2 font-medium ${spinValidation.status === 'Active' ? 'text-green-600' : 'text-amber-600'}`}>
                            {spinValidation.status}
                          </span>
                        </div>
                        {spinValidation.general_contact_name && (
                          <div>
                            <span className="text-slate-500">Contact:</span>
                            <span className="ml-2 font-medium">{spinValidation.general_contact_name}</span>
                          </div>
                        )}
                      </div>
                      
                      {profile?.spin !== spinInput && (
                        <button
                          onClick={saveSpin}
                          disabled={savingProfile}
                          className="mt-4 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-200 transition-all font-medium disabled:opacity-50"
                        >
                          {savingProfile ? "Saving..." : "Save This SPIN to Profile"}
                        </button>
                      )}
                      
                      {profile?.spin === spinInput && (
                        <div className="mt-3 text-sm text-green-600">
                          ✓ This SPIN is saved to your profile
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {profile?.spin && !spinValidation && (
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">Current SPIN:</span>
                        <span className="ml-2 font-mono font-semibold">{profile.spin}</span>
                        {isDemoAccount && (
                          <button
                            onClick={() => {
                              setReplaceSpinInput("");
                              setReplaceSpinError(null);
                              setShowReplaceSpinModal(true);
                            }}
                            className="ml-2 px-2 py-1 text-[11px] font-medium text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-200 hover:border-amber-600 rounded-md transition"
                            title="Replace this SPIN with a different one (test/demo accounts only)"
                          >
                            Replace
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveTab("my-entities")}
                        className="text-sm text-purple-600 hover:underline"
                      >
                        View Serviced Entities →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Company Profile */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <span className="text-xl">🏢</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Company Profile</h2>
                  <p className="text-sm text-slate-500">Your business information</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                  <input
                    type="text"
                    defaultValue={profile?.company_name || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Contact Name</label>
                  <input
                    type="text"
                    defaultValue={profile?.contact_name || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                  <input
                    type="text"
                    defaultValue={profile?.phone || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                  <input
                    type="text"
                    defaultValue={profile?.website || ""}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
                  />
                </div>
              </div>
            </div>

            {/* Service Configuration */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <span className="text-xl">🛠️</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Services Offered</h2>
                  <p className="text-sm text-slate-500">Select the E-Rate service categories you provide</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {SERVICE_TYPES.map(service => (
                  <label key={service} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition">
                    <input
                      type="checkbox"
                      defaultChecked={profile?.services_offered?.includes(service)}
                      className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-slate-700">{service}</span>
                  </label>
                ))}
              </div>
              <button className="mt-6 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-200 transition-all font-medium">
                Save Changes
              </button>
            </div>

            {/* Team Seats (vendor owner) */}
            <VendorTeamPanel />

            {/* Notification Preferences */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <span className="text-xl">🔔</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                  <p className="text-sm text-slate-500">Configure alerts for status changes, Form 470 matches, and more</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Get alerted when FRNs are pending more than 15 days, when new Form 470s match your services, and more.
              </p>
              <a
                href="/settings/notifications"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-medium text-sm transition"
              >
                🔔 Manage Notification Settings →
              </a>
            </div>

            {/* Subscription */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <span className="text-xl">{user?.role === 'super' || user?.role === 'admin' ? '⭐' : '💳'}</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {user?.role === 'super' || user?.role === 'admin' ? 'Account Access' : 'Subscription'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {user?.role === 'super' || user?.role === 'admin' ? 'You have full platform access' : 'Manage your billing and plan'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                <div>
                  <div className="font-semibold text-slate-900">
                    {user?.role === 'super' ? '⭐ Super Account — Full Access' : user?.role === 'admin' ? '🔑 Admin Account — Full Access' : user?.subscription?.plan === 'yearly' ? 'Yearly Plan' : 'Monthly Plan'}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    Status: <span className="text-green-600 font-medium">
                      {user?.role === 'super' || user?.role === 'admin' ? 'Active — No billing required' : user?.subscription?.status || 'Unknown'}
                    </span>
                  </div>
                </div>
                {user?.role !== 'super' && user?.role !== 'admin' && (
                  <button className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 font-medium transition">
                    Manage Subscription
                  </button>
                )}
              </div>
            </div>

            {/* Replace SPIN Modal (demo/test accounts) */}
            {showReplaceSpinModal && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !replacingSpinLoading && setShowReplaceSpinModal(false)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">Replace SPIN</h3>
                  <p className="text-sm text-slate-500 mb-3">
                    Swap <span className="font-mono font-semibold text-slate-900">{profile?.spin || "current SPIN"}</span> for a different Service Provider.
                    Profile is updated and data is rebuilt in the background.
                  </p>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                    <p className="text-[11px] text-amber-800">
                      <strong>Demo helper</strong> — visible because this is a test/demo account. Lets you retarget onto any vendor SPIN on the fly.
                    </p>
                  </div>

                  <input
                    type="text"
                    value={replaceSpinInput}
                    onChange={(e) => setReplaceSpinInput(e.target.value)}
                    placeholder="Enter new SPIN (e.g., 143032945)"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono mb-3"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && !replacingSpinLoading && handleReplaceSpin()}
                  />

                  {replaceSpinError && (
                    <p className="text-xs text-red-600 mb-3">{replaceSpinError}</p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowReplaceSpinModal(false)}
                      disabled={replacingSpinLoading}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReplaceSpin}
                      disabled={replacingSpinLoading || !replaceSpinInput.trim()}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                    >
                      {replacingSpinLoading ? (
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
          </div>
        )}
        </div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Entity Detail Modal */}
      {showEntityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeEntityModal}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedEntity?.organization_name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-purple-100">
                    <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">
                      BEN: {selectedEntity?.ben}
                    </span>
                    <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                      {selectedEntity?.state}
                    </span>
                  </div>
                </div>
                <button
                  onClick={closeEntityModal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {entityDetailLoading ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading entity details...</p>
                </div>
              ) : entityDetail ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="text-sm text-blue-600 font-medium">Total Cat 1</div>
                      <div className="text-2xl font-bold text-blue-700">
                        ${(entityDetail.total_cat1 / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <div className="text-sm text-emerald-600 font-medium">Total Cat 2</div>
                      <div className="text-2xl font-bold text-emerald-700">
                        ${(entityDetail.total_cat2 / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4">
                      <div className="text-sm text-purple-600 font-medium">Lifetime Total</div>
                      <div className="text-2xl font-bold text-purple-700">
                        ${(entityDetail.total_all / 1000).toFixed(1)}K
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4">
                      <div className="text-sm text-amber-600 font-medium">Total FRNs</div>
                      <div className="text-2xl font-bold text-amber-700">
                        {entityDetail.total_frns}
                      </div>
                    </div>
                  </div>

                  {/* Current Year Budget Highlight */}
                  {entityDetail.current_year_budget && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-green-800">
                            {entityDetail.current_year_budget.year} Current Year Budget
                          </h3>
                          <p className="text-sm text-green-600 mt-1">Most recent authorized funding</p>
                        </div>
                        <div className="text-right">
                          <div className="flex gap-4">
                            <div>
                              <div className="text-xs text-slate-500">Cat 1</div>
                              <div className="font-bold text-blue-600">
                                ${entityDetail.current_year_budget.cat1.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500">Cat 2</div>
                              <div className="font-bold text-emerald-600">
                                ${entityDetail.current_year_budget.cat2.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-slate-500">Total</div>
                              <div className="font-bold text-purple-600">
                                ${entityDetail.current_year_budget.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Service Types */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">Services Provided</h3>
                    <div className="flex flex-wrap gap-2">
                      {entityDetail.all_service_types.map((svc, idx) => (
                        <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-lg">
                          {svc}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Year-by-Year Breakdown */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Funding History by Year</h3>
                    <div className="space-y-3">
                      {entityDetail.years.map((yearData) => (
                        <div key={yearData.year} className="border border-slate-200 rounded-xl overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={(e) => {
                              const content = e.currentTarget.nextElementSibling;
                              if (content) {
                                content.classList.toggle('hidden');
                              }
                            }}
                          >
                            <div className="flex items-center gap-4">
                              <span className="text-lg font-bold text-slate-900">{yearData.year}</span>
                              <span className="text-sm text-slate-500">{yearData.frn_count} FRNs</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Cat 1</span>
                                <span className="font-semibold text-blue-600">
                                  ${yearData.cat1_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Cat 2</span>
                                <span className="font-semibold text-emerald-600">
                                  ${yearData.cat2_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-slate-400 block">Total</span>
                                <span className="font-bold text-purple-600">
                                  ${yearData.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </div>
                              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* Line Items (collapsed by default) */}
                          <div className="hidden border-t border-slate-200">
                            <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                              {yearData.line_items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-slate-100 text-sm">
                                  <div>
                                    <div className="font-mono text-slate-600">{item.frn}</div>
                                    <div className="text-xs text-slate-500">{item.service_type}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold">
                                      ${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className={`text-xs px-2 py-0.5 rounded inline-block ${
                                      item.status?.toLowerCase().includes('paid') || item.status?.toLowerCase().includes('disbursed')
                                        ? 'bg-green-100 text-green-700'
                                        : item.status?.toLowerCase().includes('denied')
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {item.category} • {item.status}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-slate-500">Failed to load entity details</p>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={closeEntityModal}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Close
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
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" checked={!!trackingForm.installed} onChange={(e) => setTrackingForm(f => f ? { ...f, installed: e.target.checked } : f)} />
                    Equipment installed
                  </label>
                  {trackingForm.installed && (
                    <div className="mt-2">
                      <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Install date</label>
                      <input type="date" value={(trackingForm.install_date ?? '').slice(0, 10)} onChange={(e) => setTrackingForm(f => f ? { ...f, install_date: e.target.value || null } : f)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} />
                    </div>
                  )}
                </div>

                <div className={`rounded-lg border p-3 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <label className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" checked={!!trackingForm.copay_paid} onChange={(e) => setTrackingForm(f => f ? { ...f, copay_paid: e.target.checked } : f)} />
                    Applicant co-pay paid
                  </label>
                  <div className="mt-2">
                    <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Co-pay amount (non-discounted share)</label>
                    <input type="number" step="0.01" min="0" value={trackingForm.copay_amount ?? ''} onChange={(e) => setTrackingForm(f => f ? { ...f, copay_amount: e.target.value === '' ? null : parseFloat(e.target.value) } : f)} placeholder="0.00" className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Notes</label>
                  <textarea rows={3} value={trackingForm.notes ?? ''} onChange={(e) => setTrackingForm(f => f ? { ...f, notes: e.target.value } : f)} className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-300'}`} placeholder="Working notes for this FRN…" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => { setTrackingModalFrn(null); setTrackingForm(null); }} className={`px-4 py-2 rounded-lg text-sm font-medium ${dark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Cancel</button>
                  <button onClick={saveTrackingModal} disabled={trackingSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50">
                    {trackingSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-entity purchase-history drill-down modal (B5) */}
      <PurchaseHistoryModal
        ben={purchaseHistoryBen}
        entityName={form471Data?.entity_name}
        onClose={() => setPurchaseHistoryBen(null)}
      />

      {/* FRN Detail Modal */}
      {showFRNDetailModal && selectedFRN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowFRNDetailModal(false); setDisbursementOpen(false); }}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className={`p-6 border-b border-slate-200 text-white ${
              selectedFRN.status?.toLowerCase().includes('funded') || selectedFRN.status?.toLowerCase().includes('committed')
                ? 'bg-gradient-to-r from-green-600 to-emerald-600'
                : selectedFRN.status?.toLowerCase().includes('denied')
                ? 'bg-gradient-to-r from-red-600 to-rose-600'
                : 'bg-gradient-to-r from-amber-500 to-orange-500'
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">
                      {selectedFRN.status?.toLowerCase().includes('funded') || selectedFRN.status?.toLowerCase().includes('committed')
                        ? '✅'
                        : selectedFRN.status?.toLowerCase().includes('denied')
                        ? '❌'
                        : '⏳'}
                    </span>
                    <div>
                      <h2 className="text-xl font-bold">FRN: {selectedFRN.frn}</h2>
                      <div className="text-white/80 text-sm mt-0.5">Application #{selectedFRN.application_number}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                      {selectedFRN.status || 'Unknown Status'}
                    </span>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                      FY {selectedFRN.funding_year}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => { setShowFRNDetailModal(false); setDisbursementOpen(false); }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Entity Information */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏫</span> Entity Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Entity Name</div>
                      <div className="font-medium text-slate-900">{selectedFRN.entity_name || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">BEN</div>
                      <div className="font-mono text-slate-900">{selectedFRN.ben || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">State</div>
                      <div className="text-slate-900">{selectedFRN.state || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service Type</div>
                      <div className="text-slate-900">{selectedFRN.service_type || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Funding Information */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                  <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">💰</span> Funding Information
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      {(() => {
                        const s = selectedFRN.status?.toLowerCase() || '';
                        const isDeniedish = s.includes('denied') || s.includes('cancel');
                        const committed = selectedFRN.commitment_amount || 0;
                        const requested = selectedFRN.requested_amount || 0;
                        const showRequested = isDeniedish || (committed === 0 && requested > 0);
                        const value = showRequested ? requested : committed;
                        return (
                          <>
                            <div className="text-xs text-green-600">{showRequested ? 'Requested Amount' : 'Commitment Amount'}</div>
                            <div className="text-2xl font-bold text-green-700">
                              ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                    <div 
                      className="cursor-pointer hover:bg-green-100/70 p-1.5 rounded-lg transition-all select-none border border-transparent hover:border-green-200 relative group"
                      onClick={() => setDisbursementOpen(!disbursementOpen)}
                    >
                      <div className="text-xs text-green-600 flex items-center gap-1 font-medium">
                        Disbursed Amount
                        {disbursementOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </div>
                      <div className="text-2xl font-bold text-green-700 underline decoration-dashed decoration-green-400 group-hover:text-green-800">
                        ${selectedFRN.disbursed_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                      </div>
                      <span className="text-[10px] text-green-600 block mt-0.5 font-medium group-hover:underline">
                        {disbursementOpen ? 'Click to collapse' : 'Click to view schedule →'}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-green-600">Discount Rate</div>
                      <div className="text-2xl font-bold text-green-700">
                        {selectedFRN.discount_rate ? `${selectedFRN.discount_rate}%` : 'N/A'}
                      </div>
                    </div>
                  </div>
                  {selectedFRN.commitment_amount && selectedFRN.disbursed_amount !== undefined && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-green-600 mb-1">
                        <span>Disbursement Progress</span>
                        <span>{((selectedFRN.disbursed_amount / selectedFRN.commitment_amount) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-green-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((selectedFRN.disbursed_amount / selectedFRN.commitment_amount) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Interactive Disbursement Panel */}
                <DisbursementPanel 
                  frn={selectedFRN.frn} 
                  entityName={selectedFRN.entity_name || ''}
                  ben={selectedFRN.ben || ''}
                  isOpen={disbursementOpen} 
                  onClose={() => setDisbursementOpen(false)} 
                />

                {/* Status & Pending Reason */}
                {selectedFRN.pending_reason && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                      <span className="text-lg">⚠️</span> Pending Reason
                    </h3>
                    <p className="text-amber-800">{selectedFRN.pending_reason}</p>
                  </div>
                )}

                {/* FCDL Comment */}
                {selectedFRN.fcdl_comment && (
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                      <span className="text-lg">📝</span> FCDL Comment
                    </h3>
                    <p className="text-blue-800">{selectedFRN.fcdl_comment}</p>
                  </div>
                )}

                {/* Key Dates */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">📅</span> Key Dates
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Award Date</div>
                      <div className="text-slate-900">{selectedFRN.award_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">FCDL Date</div>
                      <div className="text-slate-900">{selectedFRN.fcdl_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Last Invoice Date</div>
                      <div className="text-slate-900">{selectedFRN.last_invoice_date || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service Start</div>
                      <div className="text-slate-900">{selectedFRN.service_start || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Service End</div>
                      <div className="text-slate-900">{selectedFRN.service_end || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Funding Year</div>
                      <div className="text-slate-900">{selectedFRN.funding_year || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Invoicing Information */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <span className="text-lg">📋</span> Invoicing Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Invoicing Mode</div>
                      <div className="text-slate-900">{selectedFRN.invoicing_mode || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Invoicing Ready</div>
                      <div className={`font-medium ${selectedFRN.invoicing_ready === 'Yes' ? 'text-green-600' : 'text-slate-600'}`}>
                        {selectedFRN.invoicing_ready || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">F486 Status</div>
                      <div className="text-slate-900">{selectedFRN.f486_status || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Wave Number</div>
                      <div className="text-slate-900">{selectedFRN.wave_number || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Vendor Information */}
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <h3 className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏢</span> Vendor Information
                  </h3>
                  <div>
                    <div className="text-xs text-purple-600">Service Provider</div>
                    <div className="font-medium text-purple-900">{selectedFRN.spin_name || 'N/A'}</div>
                    {selectedFRN.spin && (
                      <div className="text-xs text-purple-700 mt-0.5">SPIN: {selectedFRN.spin}</div>
                    )}
                    {selectedFRN.contract_number && (
                      <div className="text-xs text-purple-700 mt-0.5">CRN: {selectedFRN.contract_number}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="text-sm text-slate-500">
                FRN: {selectedFRN.frn} • Application: {selectedFRN.application_number}
              </div>
              <button
                onClick={() => { setShowFRNDetailModal(false); setDisbursementOpen(false); }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certified-PDF resolve error toast */}
      {pdfError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-md px-4 py-3 rounded-xl bg-red-600 text-white text-sm shadow-lg flex items-start gap-3">
          <span className="flex-1">{pdfError}</span>
          <button type="button" onClick={() => setPdfError(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Form 470 Detail Modal (Sprint 3) */}
      {showForm470Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeForm470Modal}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{form470Detail?.entity?.name || 'Loading...'}</h2>
                  <p className="text-orange-100 mt-1">
                    Form 470 #{form470Detail?.application_number} • {form470Detail?.funding_year}
                  </p>
                  {has470ProServices(form470Detail?.services) && (
                    <span
                      title={`Requested: ${(form470Detail?.service_types || []).join(', ') || 'installation / professional services'}`}
                      className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 bg-white/20 text-white rounded-full text-xs font-semibold"
                    >
                      Pro services / install requested
                    </span>
                  )}
                  {form470Detail?.application_number && (
                    <button
                      type="button"
                      onClick={() => downloadFormPdf('470', form470Detail.application_number)}
                      disabled={pdfBusyApp === String(form470Detail.application_number)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                      {pdfBusyApp === String(form470Detail.application_number) ? 'Fetching…' : 'Download Form 470 PDF'}
                    </button>
                  )}
                </div>
                <button
                  onClick={closeForm470Modal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {form470DetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : form470Detail ? (
                <div className="space-y-6">
                  {/* Version toggle — a revised 470 keeps both Original & Current on file */}
                  {form470Detail.available_versions && form470Detail.available_versions.length > 1 && (
                    <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <span className="text-sm text-amber-800 font-medium">
                        📝 This Form 470 was revised. Viewing:
                      </span>
                      <div className="inline-flex rounded-lg border border-amber-300 overflow-hidden">
                        {['Current', 'Original'].filter(v => form470Detail.available_versions?.includes(v)).map((v) => {
                          const active = (form470Detail.form_version || '').toLowerCase() === v.toLowerCase();
                          return (
                            <button
                              key={v}
                              onClick={() => { if (!active) load470Detail(form470Detail.application_number, v); }}
                              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                                active ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              {v}
                            </button>
                          );
                        })}
                      </div>
                      {form470Detail.last_modified_datetime && (
                        <span className="text-xs text-amber-600">
                          Last modified {new Date(form470Detail.last_modified_datetime).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Entity Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <span>🏫</span> Entity Information
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-500">BEN:</span>
                          <span className="font-medium">{form470Detail.entity?.ben}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Type:</span>
                          <span className="font-medium">{form470Detail.entity?.type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Location:</span>
                          <span className="font-medium">{form470Detail.entity?.city}, {form470Detail.entity?.state}</span>
                        </div>
                        {form470Detail.entity?.website && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Website:</span>
                            <a 
                              href={form470Detail.entity.website.startsWith('http') ? form470Detail.entity.website : `https://${form470Detail.entity.website}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline"
                            >
                              Visit →
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <span>👤</span> Contact Information
                        {/* LinkedIn Search Button */}
                        {form470Detail.contact?.name && (
                          <a
                            href={generateLinkedInSearchUrl(form470Detail.contact.name, form470Detail.entity?.name, [form470Detail.entity?.city, form470Detail.entity?.state].filter(Boolean).join(', '))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
                            title="Search LinkedIn for this contact"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                            </svg>
                            LinkedIn
                          </a>
                        )}
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Contact:</span>
                          <span className="font-medium">{form470Detail.contact?.name}</span>
                        </div>
                        {form470Detail.contact?.email && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Email:</span>
                            <a href={`mailto:${form470Detail.contact.email}`} className="text-blue-600 hover:underline">
                              {form470Detail.contact.email}
                            </a>
                          </div>
                        )}
                        {form470Detail.contact?.phone && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Phone:</span>
                            <a href={`tel:${form470Detail.contact.phone}`} className="text-blue-600 hover:underline">
                              {form470Detail.contact.phone}
                            </a>
                          </div>
                        )}
                        
                        {/* Enriched LinkedIn if available */}
                        {enrichmentData?.linkedin_url && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">LinkedIn:</span>
                            <a 
                              href={enrichmentData.linkedin_url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                              </svg>
                              View Profile
                            </a>
                          </div>
                        )}
                        
                        {/* Enriched Position if available */}
                        {enrichmentData?.person?.position && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Position:</span>
                            <span className="font-medium">{enrichmentData.person.position}</span>
                          </div>
                        )}
                        
                        {form470Detail.technical_contact?.name && (
                          <>
                            <div className="border-t border-slate-200 my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Tech Contact:</span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{form470Detail.technical_contact.name}</span>
                                <a
                                  href={generateLinkedInSearchUrl(form470Detail.technical_contact.name, form470Detail.entity?.name, [form470Detail.entity?.city, form470Detail.entity?.state].filter(Boolean).join(', '))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 hover:text-blue-700"
                                  title="Search LinkedIn"
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                </a>
                              </div>
                            </div>
                            {form470Detail.technical_contact?.email && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Tech Email:</span>
                                <a href={`mailto:${form470Detail.technical_contact.email}`} className="text-blue-600 hover:underline">
                                  {form470Detail.technical_contact.email}
                                </a>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Additional Contacts from Enrichment */}
                  {enrichmentData?.additional_contacts && enrichmentData.additional_contacts.length > 0 && (
                    <div className="bg-indigo-50 rounded-xl p-4">
                      <h3 className="font-semibold text-indigo-800 mb-3 flex items-center gap-2">
                        <span>👥</span> Additional Contacts at Organization
                      </h3>
                      <div className="space-y-3">
                        {enrichmentData.additional_contacts.slice(0, 5).map((contact, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white rounded-lg p-3 border border-indigo-100">
                            <div>
                              <div className="font-medium text-slate-900">{contact.name}</div>
                              {contact.position && (
                                <div className="text-xs text-slate-500">{contact.position}</div>
                              )}
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="text-xs text-blue-600 hover:underline">
                                  {contact.email}
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.linkedin && (
                                <a
                                  href={contact.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-blue-600 hover:text-blue-800"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                </a>
                              )}
                              {contact.confidence && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  contact.confidence > 80 ? 'bg-green-100 text-green-700' :
                                  contact.confidence > 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {contact.confidence}% confident
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manufacturers & Service Types */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-orange-50 rounded-xl p-4">
                      <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                        <span>🏭</span> Manufacturers Requested
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {form470Detail.manufacturers?.length > 0 ? (
                          form470Detail.manufacturers.map((mfr, idx) => (
                            <span key={idx} className="px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-sm">
                              {mfr}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">No specific manufacturers requested</span>
                        )}
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                        <span>📋</span> Categories & Services
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {form470Detail.categories?.map((cat, idx) => (
                          <span key={idx} className={`px-3 py-1 rounded-full text-sm ${
                            cat.includes('1') ? 'bg-blue-200 text-blue-800' : 'bg-purple-200 text-purple-800'
                          }`}>
                            {cat}
                          </span>
                        ))}
                      </div>
                      <div className="text-sm text-slate-600">
                        {form470Detail.service_types?.join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* Services Details */}
                  {form470Detail.services && form470Detail.services.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-slate-50">
                        <h3 className="font-semibold text-slate-900">Services Requested ({form470Detail.total_services})</h3>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                        {form470Detail.services.map((service, idx) => (
                          <div key={idx} className="p-4 flex items-start justify-between">
                            <div>
                              <div className="font-medium text-slate-900">{service.service_type}</div>
                              <div className="text-sm text-slate-500">{service.function}</div>
                              {service.manufacturer && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                  {service.manufacturer}
                                </span>
                              )}
                            </div>
                            <div className="text-right text-sm">
                              <div className="text-slate-700">{service.quantity} {service.unit}</div>
                              {service.min_capacity && (
                                <div className="text-slate-500">{service.min_capacity} - {service.max_capacity}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Descriptions */}
                  {/* RFP Documents */}
                  {form470Detail.services?.some(s => s.rfp_documents || s.rfp_identifier) && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-slate-200 bg-amber-50">
                        <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          RFP Documents
                        </h3>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {form470Detail.services
                          .filter(s => s.rfp_documents || s.rfp_identifier)
                          .map((service, idx) => {
                          const extractFilename = (url: string): string => {
                            try {
                              const parts = url.split('/');
                              const encoded = parts[parts.length - 1];
                              const decoded = decodeURIComponent(encoded);
                              return decoded.replace(/^\d+-/, '');
                            } catch {
                              return url;
                            }
                          };
                          const docUrl = service.rfp_documents && typeof service.rfp_documents === 'string' ? service.rfp_documents : null;
                          const isHttpLink = docUrl?.startsWith('http') ?? false;
                          const filename = isHttpLink && docUrl ? extractFilename(docUrl) : null;

                          return (
                          <div key={idx} className="p-4">
                            {service.rfp_identifier && (
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-slate-500">RFP ID:</span>
                                <span className="text-sm font-mono text-slate-900">{service.rfp_identifier}</span>
                              </div>
                            )}
                            {docUrl && (
                              <div className="mt-2">
                                {isHttpLink && filename ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                      <span className="text-sm font-medium text-slate-900 break-all">{filename}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <a
                                        href="https://opendata.usac.org/stories/s/ejcg-sjaz"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        View on USAC
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => forceDownloadFile(docUrl, filename)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                                        Download
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-700 break-all">{docUrl}</span>
                                )}
                              </div>
                            )}
                            <div className="text-xs text-slate-400 mt-1">{service.service_type} - {service.function}</div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(form470Detail.category_one_description || form470Detail.category_two_description) && (
                    <div className="space-y-4">
                      {form470Detail.category_one_description && (
                        <div className="bg-blue-50 rounded-xl p-4">
                          <h3 className="font-semibold text-blue-800 mb-2">Category 1 Description</h3>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{form470Detail.category_one_description}</p>
                        </div>
                      )}
                      {form470Detail.category_two_description && (
                        <div className="bg-purple-50 rounded-xl p-4">
                          <h3 className="font-semibold text-purple-800 mb-2">Category 2 Description</h3>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{form470Detail.category_two_description}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Important Dates</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-slate-500">Posted</div>
                        <div className="font-medium">{form470Detail.posting_date ? new Date(form470Detail.posting_date).toLocaleDateString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Allowable Contract Date</div>
                        <div className="font-medium">{form470Detail.allowable_contract_date ? new Date(form470Detail.allowable_contract_date).toLocaleDateString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">Status</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          form470Detail.status === 'Certified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {form470Detail.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500 py-12">
                  Failed to load details
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {/* Save/Unsave Lead Button */}
              {!isLeadSaved ? (
                <button
                  onClick={saveCurrentLead}
                  disabled={savingLead || !form470Detail}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      Save Lead
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm flex items-center gap-2">
                    <span>✓</span>
                    Saved
                  </span>
                  <button
                    onClick={unsaveLead}
                    className="px-3 py-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
              
              {/* Enrich Button - only shown when lead is saved */}
              {isLeadSaved && currentSavedLead && (
                <button
                  onClick={enrichCurrentLead}
                  disabled={enrichingLead}
                  className="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Find additional contacts and LinkedIn profiles"
                >
                  {enrichingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enriching...
                    </>
                  ) : enrichmentData ? (
                    <>
                      <span>🔄</span>
                      Re-enrich
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      Find More Contacts
                    </>
                  )}
                </button>
              )}
              
              {/* Contact Entity (Ari loom-1 #8): prefilled subject + body; when
                  there's no contact email, disable with an explanatory tooltip
                  instead of producing a broken mailto: link. */}
              {(() => {
                const svc = form470Detail?.category_two_description || form470Detail?.category_one_description
                  || (form470Detail?.service_types && form470Detail.service_types.length ? form470Detail.service_types.join(', ') : '');
                const href = buildEntityMailto({
                  email: form470Detail?.contact?.email,
                  entityName: form470Detail?.entity?.name,
                  appNumber: form470Detail?.application_number,
                  contactName: form470Detail?.contact?.name,
                  service: svc,
                });
                return href ? (
                  <a
                    href={href}
                    className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2"
                  >
                    <span>📧</span>
                    Contact Entity
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="No contact email on file for this Form 470 — try Find Staff to locate a contact."
                    className="px-4 py-2 bg-slate-200 text-slate-400 rounded-xl flex items-center gap-2 cursor-not-allowed"
                  >
                    <span>📧</span>
                    Contact Entity
                  </button>
                );
              })()}
              
              {/* Find Staff (Ari loom-1 #9): scope the LinkedIn people search to
                  the quoted org name + city/state so it stops returning unrelated
                  companies. */}
              {form470Detail?.entity?.name && (
                <a
                  href={generateLinkedInSearchUrl(undefined, form470Detail.entity.name, [form470Detail.entity.city, form470Detail.entity.state].filter(Boolean).join(', '))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
                  title="Find staff at this organization on LinkedIn, scoped to its city/state (FREE - no API credits)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  Find Staff
                </a>
              )}
              
              <button
                onClick={closeForm470Modal}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Result Detail Modal */}
      {showSearchResultModal && selectedSearchResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowSearchResultModal(false);
              setSelectedSearchResult(null);
              setEntityEnrichment(null);
            }}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    {entityEnrichment?.entity?.name || selectedSearchResult.name || 'School Details'}
                  </h2>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">
                      BEN: {selectedSearchResult.ben}
                    </span>
                    <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                      {entityEnrichment?.entity?.city || selectedSearchResult.city}{entityEnrichment?.entity?.city || selectedSearchResult.city ? ', ' : ''}{entityEnrichment?.entity?.state || selectedSearchResult.state}
                    </span>
                    {selectedSearchResult.funding_year && (
                      <span className="px-2 py-0.5 bg-white/20 rounded text-sm">
                        FY {selectedSearchResult.funding_year}
                      </span>
                    )}
                    {isLeadSaved && (
                      <span className="px-2 py-0.5 bg-green-400/30 rounded text-sm flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Saved as Lead
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowSearchResultModal(false);
                    setSelectedSearchResult(null);
                    setEntityEnrichment(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {enrichmentLoading ? (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading enriched school data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Current Application Info with Actual Status */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Application Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <div>
                        <span className="text-sm text-slate-500">FRN Status</span>
                        <div className={`mt-1 inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          selectedSearchResult.status === 'Funded'
                            ? 'bg-green-100 text-green-700'
                            : selectedSearchResult.status === 'Denied'
                            ? 'bg-red-100 text-red-700'
                            : selectedSearchResult.status === 'Pending' || selectedSearchResult.status === 'In Review'
                            ? 'bg-yellow-100 text-yellow-700'
                            : selectedSearchResult.status === 'Cancelled'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {selectedSearchResult.status || 'Processing'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-slate-500">Commitment Amount</span>
                        <div className="mt-1 text-lg font-bold text-slate-900">
                          {selectedSearchResult.funding_amount 
                            ? `$${selectedSearchResult.funding_amount.toLocaleString()}`
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-slate-500">Service Type</span>
                        <div className="mt-1 font-medium text-slate-900 text-sm">
                          {selectedSearchResult.service_type || '-'}
                        </div>
                      </div>
                      {selectedSearchResult.application_number && (
                        <div>
                          <span className="text-sm text-slate-500">Application #</span>
                          <div className="mt-1 font-mono text-slate-900">
                            {selectedSearchResult.application_number}
                          </div>
                        </div>
                      )}
                      {selectedSearchResult.frn && (
                        <div>
                          <span className="text-sm text-slate-500">FRN</span>
                          <div className="mt-1 font-mono text-slate-900">
                            {selectedSearchResult.frn}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Entity Information */}
                  {entityEnrichment?.entity && (
                    <div className="bg-blue-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3">Entity Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {entityEnrichment.entity.address && (
                          <div>
                            <span className="text-sm text-slate-500">Address</span>
                            <div className="mt-1 text-slate-900">
                              {entityEnrichment.entity.address}<br />
                              {entityEnrichment.entity.city}, {entityEnrichment.entity.state} {entityEnrichment.entity.zip}
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.phone && (
                          <div>
                            <span className="text-sm text-slate-500">Phone</span>
                            <div className="mt-1 text-slate-900">
                              <a href={`tel:${entityEnrichment.entity.phone}`} className="text-blue-600 hover:underline">
                                {entityEnrichment.entity.phone}
                              </a>
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.website && (
                          <div>
                            <span className="text-sm text-slate-500">Website</span>
                            <div className="mt-1">
                              <a 
                                href={entityEnrichment.entity.website.startsWith('http') ? entityEnrichment.entity.website : `https://${entityEnrichment.entity.website}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {entityEnrichment.entity.website}
                              </a>
                            </div>
                          </div>
                        )}
                        {entityEnrichment.entity.entity_type && (
                          <div>
                            <span className="text-sm text-slate-500">Entity Type</span>
                            <div className="mt-1 text-slate-900">{entityEnrichment.entity.entity_type}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contacts from USAC */}
                  {entityEnrichment?.contacts && entityEnrichment.contacts.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Contacts ({entityEnrichment.contacts.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {entityEnrichment.contacts.map((contact: any, idx: number) => (
                          <div key={idx} className="bg-white rounded-lg p-3 border border-emerald-200">
                            <div className="font-medium text-slate-900">{contact.name}</div>
                            {contact.title && (
                              <div className="text-sm text-slate-600">{contact.title}</div>
                            )}
                            <div className="text-xs text-emerald-600 mb-2">{contact.role}</div>
                            <div className="flex flex-wrap gap-2">
                              {contact.email && (
                                <a 
                                  href={`mailto:${contact.email}`}
                                  className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && (
                                <a 
                                  href={`tel:${contact.phone}`}
                                  className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  {contact.phone}
                                </a>
                              )}
                            </div>
                            {contact.year && (
                              <div className="text-xs text-slate-400 mt-1">From FY {contact.year}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Funding Summary */}
                  {entityEnrichment?.funding_summary && (
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Funding Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-purple-50 rounded-xl p-4">
                          <div className="text-sm text-purple-600 font-medium">Total Committed</div>
                          <div className="text-2xl font-bold text-purple-700">
                            ${((entityEnrichment.funding_summary.total_committed || 0) / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4">
                          <div className="text-sm text-green-600 font-medium">Total Funded</div>
                          <div className="text-2xl font-bold text-green-700">
                            ${((entityEnrichment.funding_summary.total_funded || 0) / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <div className="bg-amber-50 rounded-xl p-4">
                          <div className="text-sm text-amber-600 font-medium">Total FRNs</div>
                          <div className="text-2xl font-bold text-amber-700">
                            {entityEnrichment.funding_summary.total_frns || 0}
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="text-sm text-blue-600 font-medium">Years with Funding</div>
                          <div className="text-2xl font-bold text-blue-700">
                            {entityEnrichment.funding_summary.years_with_funding || 0}
                          </div>
                        </div>
                      </div>
                      
                      {entityEnrichment.funding_summary.status_breakdown && (
                        <div className="mt-3 flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Funded: {entityEnrichment.funding_summary.status_breakdown.funded}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Denied: {entityEnrichment.funding_summary.status_breakdown.denied}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                            Pending: {entityEnrichment.funding_summary.status_breakdown.pending}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent FRNs */}
                  {entityEnrichment?.frns && entityEnrichment.frns.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3">Recent FRNs ({entityEnrichment.frns.length})</h3>
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">FRN</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Year</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Service</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Committed</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Funded</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {entityEnrichment.frns.slice(0, 10).map((frn: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-xs">{frn.frn}</td>
                                <td className="px-3 py-2">{frn.funding_year}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    frn.frn_status === 'Funded' ? 'bg-green-100 text-green-700'
                                    : frn.frn_status === 'Denied' ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {frn.frn_status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs truncate max-w-[150px]">{frn.service_type || '-'}</td>
                                <td className="px-3 py-2 text-right">${(frn.commitment_amount / 1000).toFixed(1)}K</td>
                                <td className="px-3 py-2 text-right">${(frn.funded_amount / 1000).toFixed(1)}K</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {entityEnrichment.frns.length > 10 && (
                          <div className="px-3 py-2 bg-slate-50 text-center text-sm text-slate-500">
                            Showing 10 of {entityEnrichment.frns.length} FRNs
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No enrichment data available */}
                  {!entityEnrichment && !enrichmentLoading && (
                    <div className="bg-slate-50 rounded-xl p-6 text-center">
                      <p className="text-slate-600">
                        Unable to load enriched data. The basic application information is shown above.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {!isLeadSaved ? (
                <button
                  onClick={handleSaveAsLead}
                  disabled={savingLead}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {savingLead ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      Save as Lead
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setActiveTab('leads');
                    setShowSearchResultModal(false);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  View in Leads
                </button>
              )}
              <button
                onClick={() => {
                  // Add to selection if not already selected
                  if (!selectedSchools.has(selectedSearchResult.ben)) {
                    const newSelection = new Set(selectedSchools);
                    newSelection.add(selectedSearchResult.ben);
                    setSelectedSchools(newSelection);
                  }
                  setShowSearchResultModal(false);
                }}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add to Export
              </button>
              <button
                onClick={() => {
                  setShowSearchResultModal(false);
                  setSelectedSearchResult(null);
                  setEntityEnrichment(null);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Lead Detail Modal (for predicted/non-470 leads) */}
      {showSavedLeadDetailModal && selectedSavedLeadDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedSavedLeadDetail.entity_name || `BEN: ${selectedSavedLeadDetail.ben}`}</h2>
                  <p className="text-purple-100 mt-1">
                    {selectedSavedLeadDetail.form_type === 'predicted' ? '🔮 Predicted Lead' : `Form ${selectedSavedLeadDetail.form_type}`} #{selectedSavedLeadDetail.application_number}
                    {selectedSavedLeadDetail.funding_year && ` • FY ${selectedSavedLeadDetail.funding_year}`}
                  </p>
                  {selectedSavedLeadDetail.application_number && (selectedSavedLeadDetail.form_type === '470' || selectedSavedLeadDetail.form_type === '471') && (
                    <button
                      type="button"
                      onClick={() => downloadFormPdf(selectedSavedLeadDetail.form_type as '470' | '471', selectedSavedLeadDetail.application_number)}
                      disabled={pdfBusyApp === String(selectedSavedLeadDetail.application_number)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                      {pdfBusyApp === String(selectedSavedLeadDetail.application_number) ? 'Fetching…' : `Download Form ${selectedSavedLeadDetail.form_type} PDF`}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Entity & Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>🏫</span> Entity Information
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">BEN:</span>
                        <span className="font-medium">{selectedSavedLeadDetail.ben}</span>
                      </div>
                      {selectedSavedLeadDetail.entity_type && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Type:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.entity_type}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Location:</span>
                        <span className="font-medium">
                          {[selectedSavedLeadDetail.entity_city, selectedSavedLeadDetail.entity_state].filter(Boolean).join(', ') || 'N/A'}
                        </span>
                      </div>
                      {selectedSavedLeadDetail.entity_address && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Address:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.entity_address}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.entity_phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <a href={`tel:${selectedSavedLeadDetail.entity_phone}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.entity_phone}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.entity_website && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Website:</span>
                          <a href={selectedSavedLeadDetail.entity_website.startsWith('http') ? selectedSavedLeadDetail.entity_website : `https://${selectedSavedLeadDetail.entity_website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Visit →</a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>👤</span> Contact Information
                      {selectedSavedLeadDetail.contact_name && selectedSavedLeadDetail.entity_name && (
                        <a
                          href={generateLinkedInSearchUrl(selectedSavedLeadDetail.contact_name, selectedSavedLeadDetail.entity_name, [selectedSavedLeadDetail.entity_city, selectedSavedLeadDetail.entity_state].filter(Boolean).join(', '))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs hover:bg-blue-200 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                          </svg>
                          LinkedIn
                        </a>
                      )}
                    </h3>
                    <div className="space-y-2 text-sm">
                      {selectedSavedLeadDetail.contact_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contact:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.contact_name}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_title && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Title:</span>
                          <span className="font-medium">{selectedSavedLeadDetail.contact_title}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_email && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Email:</span>
                          <a href={`mailto:${selectedSavedLeadDetail.contact_email}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.contact_email}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.contact_phone && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Phone:</span>
                          <a href={`tel:${selectedSavedLeadDetail.contact_phone}`} className="text-blue-600 hover:underline">{selectedSavedLeadDetail.contact_phone}</a>
                        </div>
                      )}
                      {selectedSavedLeadDetail.enriched_data?.linkedin_url && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">LinkedIn:</span>
                          <a href={selectedSavedLeadDetail.enriched_data.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Profile →</a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Services & Categories */}
                {(selectedSavedLeadDetail.categories?.length > 0 || selectedSavedLeadDetail.services?.length > 0 || selectedSavedLeadDetail.manufacturers?.length > 0) && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>📦</span> Services & Categories
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedSavedLeadDetail.categories?.map((cat: string, idx: number) => (
                        <span key={`cat-${idx}`} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{cat}</span>
                      ))}
                      {selectedSavedLeadDetail.services?.map((svc: string, idx: number) => (
                        <span key={`svc-${idx}`} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">{svc}</span>
                      ))}
                      {selectedSavedLeadDetail.manufacturers?.map((mfr: string, idx: number) => (
                        <span key={`mfr-${idx}`} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">{mfr}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Funding Info */}
                {(selectedSavedLeadDetail.funding_amount || selectedSavedLeadDetail.committed_amount || selectedSavedLeadDetail.funded_amount) && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>💰</span> Funding Information
                    </h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {selectedSavedLeadDetail.funding_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Requested</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.funding_amount.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.committed_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Committed</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.committed_amount.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedSavedLeadDetail.funded_amount != null && (
                        <div>
                          <span className="text-slate-500 block">Funded</span>
                          <span className="font-semibold text-lg">${selectedSavedLeadDetail.funded_amount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Additional Contacts (from enrichment) */}
                {selectedSavedLeadDetail.enriched_data?.additional_contacts && selectedSavedLeadDetail.enriched_data.additional_contacts.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>👥</span> Additional Contacts ({selectedSavedLeadDetail.enriched_data.additional_contacts.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedSavedLeadDetail.enriched_data.additional_contacts.map((contact: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{contact.name}</span>
                            {contact.position && <span className="text-slate-400">({contact.position})</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>}
                            {contact.phone && <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All USAC Contacts */}
                {selectedSavedLeadDetail.all_contacts && selectedSavedLeadDetail.all_contacts.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span>📋</span> USAC Contacts ({selectedSavedLeadDetail.all_contacts.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedSavedLeadDetail.all_contacts.map((contact, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                          <span className="font-medium">{contact.name}</span>
                          <div className="flex items-center gap-3">
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>}
                            {contact.phone && <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {selectedSavedLeadDetail.notes && (
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <h3 className="font-semibold text-slate-900 mb-2">📝 Notes</h3>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedSavedLeadDetail.notes}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-3">
              {(() => {
                const href = buildEntityMailto({
                  email: selectedSavedLeadDetail.contact_email,
                  entityName: selectedSavedLeadDetail.entity_name,
                  contactName: selectedSavedLeadDetail.contact_name,
                });
                return href ? (
                  <a
                    href={href}
                    className="px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors flex items-center gap-2"
                  >
                    📧 Contact Entity
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="No contact email on file for this lead."
                    className="px-4 py-2 bg-slate-200 text-slate-400 rounded-xl flex items-center gap-2 cursor-not-allowed"
                  >
                    📧 Contact Entity
                  </button>
                );
              })()}
              {selectedSavedLeadDetail.entity_name && (
                <a
                  href={generateLinkedInSearchUrl(undefined, selectedSavedLeadDetail.entity_name, [selectedSavedLeadDetail.entity_city, selectedSavedLeadDetail.entity_state].filter(Boolean).join(', '))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-700 text-white rounded-xl hover:bg-blue-800 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  Find Staff
                </a>
              )}
              <button
                onClick={() => { setShowSavedLeadDetailModal(false); setSelectedSavedLeadDetail(null); }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-xl transition-colors ml-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
