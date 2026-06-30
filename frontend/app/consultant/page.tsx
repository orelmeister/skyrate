"use client";

import { useState, useEffect, useMemo, useRef, Suspense, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore, deriveRequiresPaymentSetup } from "@/lib/auth-store";
import { useVerificationGuard } from "@/lib/use-verification-guard";
import { api, ConsultantSchool, ConsultantProfile, AppealRecord, PIAResponseRecord, PIAFRNRecord, PIAPreview, FRNWatch, FRNReportHistory, Form471ByEntityResponse, Form471LineItem } from "@/lib/api";
import { SearchResultsTable } from "@/components/SearchResultsTable";
import { AppealChat } from "@/components/AppealChat";
import { PIAChat } from "@/components/PIAChat";
import { PIATemplateGallery } from "@/components/PIATemplateGallery";
import { PIATemplatePreview } from "@/components/PIATemplatePreview";
import { TableExportBar } from "@/components/TableExportBar";
import FRNDetailModal from "@/components/FRNDetailModal";
import MissingIdentifierBanner from "@/components/MissingIdentifierBanner";
import { downloadCsv, csvFilename } from "@/lib/csv-export";
import { useTabParam } from "@/hooks/useTabParam";

// ==================== MY TEAM (OWNER SEATS) ====================
// Self-contained panel rendered in the Settings tab. Hidden entirely for team
// SEATS (the /my-team endpoint returns 403 for them) and for non-owners.
function MyTeamPanel() {
  const [team, setTeam] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTeam = async () => {
    const res = await api.getMyTeam();
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
    const res = await api.inviteMyTeam(trimmed);
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
    const res = await api.removeMyTeamSeat(seatId);
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
                  <button
                    onClick={() => handleRemove(seat.id)}
                    disabled={busy}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-white hover:bg-red-500 border border-slate-200 hover:border-red-500 rounded-md transition disabled:opacity-50"
                  >
                    Remove
                  </button>
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

const CONSULTANT_TABS = ["dashboard", "schools", "funding", "frn-status", "appeals", "pia", "service-search", "settings"] as const;
type ConsultantTab = typeof CONSULTANT_TABS[number];

// Extended school type with USAC data
interface EnhancedSchool {
  id: number;
  ben: string;
  name?: string | null;
  school_name?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  status_color?: string;
  latest_year?: string;
  applications_count?: number;
  notes?: string | null;
  // Enriched fields from USAC
  entity_type?: string | null;
  address?: string | null;
  zip_code?: string | null;
  frn_number?: string | null;
  total_funding_committed?: number;
  total_funding_requested?: number;
  funding_years?: number[];
  has_category1?: boolean;
  has_category2?: boolean;
  discount_rate?: number | null;
}

// Validation result type
interface ValidationResult {
  ben: string;
  is_valid: boolean;
  valid?: boolean;
  already_exists: boolean;
  school_name?: string | null;
  state?: string | null;
  error?: string | null;
}

// Application type
interface Application {
  frn: string;
  application_number: string;
  funding_year: string;
  status: string;
  frn_status?: string;
  service_type: string;
  committed_amount: number;
  pre_discount_costs: number;
  discount_rate: number;
  original_request?: number;
  amount?: number;
  is_denied: boolean;
  denial_reason: string | null;
}

// Dashboard stats type
interface DashboardStats {
  year: number;
  total_schools: number;
  total_c2_funding: number;
  total_c2_funding_year: number;
  total_c1_funding: number;
  total_funding: number;
  total_applications: number;
  denied_count: number;
  funded_count: number;
  pending_count: number;
  schools_with_denials: number;
}

interface RecentActivityItem {
  id: number;
  frn: string;
  ben: string | null;
  entity_name: string | null;
  old_status: string | null;
  new_status: string | null;
  old_amount: number | null;
  new_amount: number | null;
  created_at: string | null;
}

export default function ConsultantPortalWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <ConsultantPortalPage />
    </Suspense>
  );
}

function ConsultantPortalPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, _hasHydrated, setUser } = useAuthStore();
  // Team seats inherit the owner's account: they cannot edit account-level
  // settings (profile / CRN). Used to hide the Settings tab and owner-only UI.
  const isSeat = Boolean((user as { is_seat?: boolean } | null)?.is_seat);
  const { verified: emailVerified, checking: checkingVerification } = useVerificationGuard();

  // Refresh the persisted user from /me on mount so server-derived flags
  // (notably is_seat) self-heal for sessions that logged in before the flag
  // existed. Without this, a seat who logged in earlier keeps a stale user
  // object and still sees the "add your CRN" banner / Settings tab.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getProfile();
        if (!cancelled && res.success && res.data?.user) {
          setUser(res.data.user as any);
        }
      } catch {
        /* non-fatal: keep the persisted user */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setUser]);
  
  const [activeTab, setActiveTab] = useTabParam<ConsultantTab>("dashboard", CONSULTANT_TABS);
  const [profile, setProfile] = useState<ConsultantProfile | null>(null);
  const [schools, setSchools] = useState<EnhancedSchool[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [dashboardYear, setDashboardYear] = useState<number>(new Date().getFullYear());
  const [prevYearStats, setPrevYearStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSchoolDetail, setShowSchoolDetail] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<EnhancedSchool | null>(null);
  const [enrichedSchoolData, setEnrichedSchoolData] = useState<EnhancedSchool | null>(null);
  const [loadingEnrichment, setLoadingEnrichment] = useState(false);
  const [schoolApplications, setSchoolApplications] = useState<Application[]>([]);
  const [applicationYears, setApplicationYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [newBen, setNewBen] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRefreshingSchools, setIsRefreshingSchools] = useState(false);
  // Bug C fix 2026-06-08: track add-school state so the modal shows feedback.
  const [isAddingSchool, setIsAddingSchool] = useState(false);
  const [addSchoolError, setAddSchoolError] = useState<string | null>(null);
  
  // Comprehensive school data state (includes C2 budget)
  const [comprehensiveSchoolData, setComprehensiveSchoolData] = useState<{
    c2_budget: Record<string, { c2_budget: number; funded: number; pending: number; available: number }>;
    funding_totals: { category_1: { funded: number; requested: number }; category_2: { funded: number; requested: number }; lifetime_total: number };
    years: Array<any>;
  } | null>(null);
  const [loadingComprehensiveData, setLoadingComprehensiveData] = useState(false);
  
  // CSV Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any>(null);
  
  // Appeal generation state
  const [generatingAppeal, setGeneratingAppeal] = useState<string | null>(null);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [selectedAppeal, setSelectedAppeal] = useState<AppealRecord | null>(null);
  const [showAppealChat, setShowAppealChat] = useState(false);
  const [isLoadingAppeals, setIsLoadingAppeals] = useState(false);
  const [showNewAppealModal, setShowNewAppealModal] = useState(false);
  const [newAppealFrn, setNewAppealFrn] = useState("");
  const [newAppealContext, setNewAppealContext] = useState("");
  const [appealError, setAppealError] = useState<string | null>(null);
  const [selectedDeniedApp, setSelectedDeniedApp] = useState<{
    frn: string;
    school_name: string;
    funding_year: string;
    service_type: string;
    amount_requested: number;
    denial_reason: string | null;
  } | null>(null);
  
  // Denied applications state (for appeals page)
  const [deniedApplications, setDeniedApplications] = useState<Array<{
    frn: string;
    ben: string;
    school_name: string;
    funding_year: string;
    status: string;
    service_type: string;
    amount_requested: number;
    denial_reason: string | null;
    application_number: string;
    has_appeal: boolean;
    fcdl_date?: string;
    appeal_deadline?: string;
    days_remaining?: number;
    urgency?: string;
    urgency_color?: string;
    is_expired?: boolean;
    can_appeal_to_usac?: boolean;
  }>>([]);
  const [isLoadingDenied, setIsLoadingDenied] = useState(false);
  const [deniedStats, setDeniedStats] = useState<{ total: number; amount: number } | null>(null);
  
  // PIA Response Generator state
  const [piaQuestionInput, setPiaQuestionInput] = useState("");
  const [piaBen, setPiaBen] = useState("");
  const [piaFrn, setPiaFrn] = useState("");
  const [piaAdditionalContext, setPiaAdditionalContext] = useState("");
  const [piaResponses, setPiaResponses] = useState<PIAResponseRecord[]>([]);
  const [selectedPia, setSelectedPia] = useState<PIAResponseRecord | null>(null);
  const [showPiaChat, setShowPiaChat] = useState(false);
  const [isPiaGenerating, setIsPiaGenerating] = useState(false);
  const [showPiaTemplates, setShowPiaTemplates] = useState(false);
  const [isLoadingPiaResponses, setIsLoadingPiaResponses] = useState(false);
  const [piaFRNs, setPiaFRNs] = useState<PIAFRNRecord[]>([]);
  const [isLoadingPiaFRNs, setIsLoadingPiaFRNs] = useState(false);
  const [piaError, setPiaError] = useState<string | null>(null);
  const [detectedCategory, setDetectedCategory] = useState<{ category: string; name: string } | null>(null);
  const [templatePreview, setTemplatePreview] = useState<PIAPreview | null>(null);

  // FRN Status Monitoring state
  const [portfolioFrnData, setPortfolioFrnData] = useState<any>(null);
  const [portfolioFrnLoading, setPortfolioFrnLoading] = useState(false);
  const [portfolioFrnError, setPortfolioFrnError] = useState<string | null>(null);
  const [portfolioFrnYear, setPortfolioFrnYear] = useState<number | undefined>(undefined);
  const [portfolioFrnStatusFilter, setPortfolioFrnStatusFilter] = useState<string>("");
  const [portfolioFrnPendingReason, setPortfolioFrnPendingReason] = useState<string>("");
  const [portfolioFrnSearch, setPortfolioFrnSearch] = useState<string>("");
  const [portfolioFrnSpinSearch, setPortfolioFrnSpinSearch] = useState<string>("");
  const [portfolioFrnCrnSearch, setPortfolioFrnCrnSearch] = useState<string>("");
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(new Set());
  const [frnSortBy, setFrnSortBy] = useState<string>("name");
  const [selectedFRN, setSelectedFRN] = useState<any>(null);
  const [showFRNDetailModal, setShowFRNDetailModal] = useState(false);
  const [notFiledExpanded, setNotFiledExpanded] = useState(false);
  const [frnTableSort, setFrnTableSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [visibleFrnCount, setVisibleFrnCount] = useState<number>(25);
  const [schoolsTableSort, setSchoolsTableSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  // In-column filters for the schools table (empty Set = no filter for that column)
  const [schoolColStateFilter, setSchoolColStateFilter] = useState<Set<string>>(new Set());
  const [schoolColStatusFilter, setSchoolColStatusFilter] = useState<Set<string>>(new Set());
  const [openSchoolColMenu, setOpenSchoolColMenu] = useState<'state' | 'status' | null>(null);
  const [serviceSearchSort, setServiceSearchSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const [fundingSchoolSort, setFundingSchoolSort] = useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'school_name', dir: 'asc' });
  const [showBenUpgradeModal, setShowBenUpgradeModal] = useState(false);
  const [upgradeBen, setUpgradeBen] = useState<string>('');

  // FRN Watch/Monitor state
  const [frnWatches, setFrnWatches] = useState<FRNWatch[]>([]);
  const [showCreateWatch, setShowCreateWatch] = useState(false);
  const [reportHistory, setReportHistory] = useState<FRNReportHistory[]>([]);
  const [selectedReport, setSelectedReport] = useState<{html: string; name: string} | null>(null);
  const [showReportArchive, setShowReportArchive] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);

  // Trial banner state
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
  
  // Service Search state
  const [serviceSearchBen, setServiceSearchBen] = useState("");
  const [serviceSearchStatus, setServiceSearchStatus] = useState("");
  const [serviceSearchType, setServiceSearchType] = useState("");
  const [serviceSearchYear, setServiceSearchYear] = useState<number>(new Date().getFullYear());
  const [serviceSearchMinAmount, setServiceSearchMinAmount] = useState("");
  const [serviceSearchMaxAmount, setServiceSearchMaxAmount] = useState("");
  const [serviceSearchResults, setServiceSearchResults] = useState<any[]>([]);
  const [serviceSearchLoading, setServiceSearchLoading] = useState(false);
  const [serviceSearchBensSearched, setServiceSearchBensSearched] = useState(0);
  // Form 470 / 471 Lookup state (mirrors the vendor portal's expandable 471 view)
  const [form471BenInput, setForm471BenInput] = useState("");
  const [form471Year, setForm471Year] = useState<number | undefined>(undefined);
  const [form471Data, setForm471Data] = useState<Form471ByEntityResponse | null>(null);
  const [form471Loading, setForm471Loading] = useState(false);
  const [form471Error, setForm471Error] = useState<string | null>(null);
  const [expanded471Frn, setExpanded471Frn] = useState<string | null>(null);
  const [form471LineItemsCache, setForm471LineItemsCache] = useState<Record<string, Form471LineItem[]>>({});
  const [form471LineItemsLoadingFrn, setForm471LineItemsLoadingFrn] = useState<string | null>(null);
  // Per-column filters for the results table (Excel-style)
  const [serviceColBen, setServiceColBen] = useState("");
  const [serviceColName, setServiceColName] = useState("");
  const [serviceColFrn, setServiceColFrn] = useState("");
  const [serviceColYear, setServiceColYear] = useState("");
  const [serviceColStatus, setServiceColStatus] = useState("");
  const [serviceColService, setServiceColService] = useState("");

  // Row selection for CSV export
  const [selectedSchoolBens, setSelectedSchoolBens] = useState<Set<string>>(new Set());
  const [selectedConsultantFrns, setSelectedConsultantFrns] = useState<Set<string>>(new Set());
  const [selectedServiceSearchRows, setSelectedServiceSearchRows] = useState<Set<string>>(new Set());
  const [selectedDeniedFrns, setSelectedDeniedFrns] = useState<Set<string>>(new Set());
  const [selectedPortfolioFrns, setSelectedPortfolioFrns] = useState<Set<string>>(new Set());

  // Query state
  const [queryInput, setQueryInput] = useState("");
  const [queryResults, setQueryResults] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<Array<{query: string; timestamp: Date; resultCount: number}>>([]);
  const [queryOffset, setQueryOffset] = useState(0);
  const [queryHasMore, setQueryHasMore] = useState(false);
  const [lastQueryInput, setLastQueryInput] = useState("");

  // Funding overview state
  const [fundingSummary, setFundingSummary] = useState<{
    total_schools: number;
    total_frns: number;
    summary: {
      funded: { count: number; amount: number };
      denied: { count: number; amount: number };
      pending: { count: number; amount: number };
    };
    schools?: Array<{
      ben: string;
      school_name?: string;
      name?: string;
      entity_name?: string;
      entity_type?: string;
      state?: string;
      total_frns?: number;
      total_funding_committed?: number;
      total_funding_requested?: number;
      funding_years?: number[];
      funded?: { count: number; amount: number };
      denied?: { count: number; amount: number };
      pending?: { count: number; amount: number };
    }>;
    year_filter?: number | null;
  } | null>(null);
  const [fundingSummaryLoading, setFundingSummaryLoading] = useState(false);
  const [fundingYear, setFundingYear] = useState<number | undefined>(undefined);

  // CRN verification state
  const [crnInput, setCrnInput] = useState("");
  const [isVerifyingCRN, setIsVerifyingCRN] = useState(false);
  const [crnVerificationResult, setCrnVerificationResult] = useState<any>(null);
  const [crnError, setCrnError] = useState<string | null>(null);
  
  // Multi-CRN management state
  const [crnList, setCrnList] = useState<Array<{
    id: number; crn: string; company_name: string | null; phone: string | null;
    is_primary: boolean; is_verified: boolean; is_free: boolean;
    payment_status: string; schools_count: number; created_at: string | null;
  }>>([]);
  const [isFreeUser, setIsFreeUser] = useState(false);
  const [canAddFree, setCanAddFree] = useState(true);
  const [showAddCrnModal, setShowAddCrnModal] = useState(false);
  const [newCrnInput, setNewCrnInput] = useState("");
  const [addingCrn, setAddingCrn] = useState(false);
  const [addCrnError, setAddCrnError] = useState<string | null>(null);
  const [pendingCrn, setPendingCrn] = useState<string | null>(null);  // CRN waiting for payment
  const [showCrnPaywall, setShowCrnPaywall] = useState(false);

  // Replace-CRN modal (test/admin/super only — for swapping demo CRNs in place)
  const [showReplaceCrnModal, setShowReplaceCrnModal] = useState(false);
  const [replaceCrnTarget, setReplaceCrnTarget] = useState<{ id: number; crn: string } | null>(null);
  const [replaceCrnInput, setReplaceCrnInput] = useState("");
  const [replacingCrn, setReplacingCrn] = useState(false);
  const [replaceCrnError, setReplaceCrnError] = useState<string | null>(null);

  // Selective resync modal state
  const [showResyncModal, setShowResyncModal] = useState(false);
  const [resyncCrnTarget, setResyncCrnTarget] = useState<{ id: number; crn: string } | null>(null);
  const [resyncPreviewLoading, setResyncPreviewLoading] = useState(false);
  const [resyncImporting, setResyncImporting] = useState(false);
  const [resyncPreviewData, setResyncPreviewData] = useState<{
    crn: string;
    existing_schools: Array<{ ben: string; organization_name: string; state: string; city: string; entity_type: string }>;
    new_schools: Array<{ ben: string; organization_name: string; state: string; city: string; entity_type: string }>;
    existing_count: number;
    new_count: number;
    total_from_usac: number;
  } | null>(null);
  const [resyncSelectedBens, setResyncSelectedBens] = useState<Set<string>>(new Set());
  const [resyncSearchQuery, setResyncSearchQuery] = useState("");

  // School search and filter state
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Status filter options
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "denied", label: "Has Denials" },
    { value: "funded", label: "Funded" },
    { value: "pending", label: "Pending / Active" },
    { value: "unknown", label: "Unknown / Not Found" },
  ];

  // Smart amount formatter
  const formatAmount = (amount: number) => {
    if (!amount || amount === 0) return '$0';
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${Math.round(amount / 1_000).toLocaleString()}K`;
    return `$${amount.toLocaleString()}`;
  };

  // Sorted portfolio schools
  const sortedPortfolioSchools = useMemo(() => {
    if (!portfolioFrnData?.schools) return [];
    return [...portfolioFrnData.schools].sort((a: any, b: any) => {
      if (frnSortBy === "name") return (a.entity_name || a.ben || '').localeCompare(b.entity_name || b.ben || '');
      if (frnSortBy === "frns") return (b.total_frns || 0) - (a.total_frns || 0);
      if (frnSortBy === "amount") return (b.total_amount || 0) - (a.total_amount || 0);
      return 0;
    });
  }, [portfolioFrnData?.schools, frnSortBy]);

  // Flattened FRNs from all schools for table view
  const flattenedFrns = useMemo(() => {
    if (!portfolioFrnData?.schools) return [];
    const frns: any[] = [];
    for (const school of portfolioFrnData.schools) {
      if (school.frns) {
        for (const frn of school.frns) {
          frns.push({
            frn: frn.funding_request_number || frn.frn,
            application_number: frn.application_number || frn.frn_number || '',
            ben: school.ben,
            entity_name: school.entity_name || school.ben,
            state: frn.state || '',
            funding_year: frn.funding_year || '',
            spin_name: frn.spin_name || frn.spin || frn.service_provider_name || '',
            service_type: frn.service_type || '',
            status: frn.frn_status || frn.status || 'Unknown',
            pending_reason: frn.pending_reason || '',
            commitment_amount: parseFloat(frn.total_authorized_amount || frn.commitment_amount || frn.amount || 0),
            disbursed_amount: parseFloat(frn.total_authorized_disbursement || frn.disbursed_amount || 0),
            discount_rate: parseFloat(frn.discount_rate || frn.discount || 0),
            award_date: frn.award_date || frn.award_date_frn || '',
            fcdl_date: frn.fcdl_date || frn.fcdl_date_frn || '',
            last_invoice_date: frn.last_invoice_date || '',
            service_start: frn.service_start || frn.service_start_date || '',
            service_end: frn.service_end || frn.contract_expiry_date || '',
            invoicing_mode: frn.invoicing_mode || '',
            invoicing_ready: frn.invoicing_ready || '',
            f486_status: frn.f486_status || frn.form_486_status || '',
            wave_number: frn.wave_number || '',
            fcdl_comment: frn.fcdl_comment || frn.fcdl_comment_frn || '',
            contract_number: frn.contract_number || '',
          });
        }
      }
    }
    return frns;
  }, [portfolioFrnData?.schools]);

  // Sorted flattened FRNs for table display
  const sortedFlattenedFrns = useMemo(() => {
    if (!flattenedFrns.length) return [];
    
    // Client-side search by FRN / Entity / BEN only (sub-status has its own input)
    let filtered = flattenedFrns;
    if (portfolioFrnSearch.trim()) {
      const search = portfolioFrnSearch.trim().toLowerCase();
      filtered = filtered.filter(frn =>
        String(frn.frn || '').toLowerCase().includes(search) ||
        String(frn.entity_name || '').toLowerCase().includes(search) ||
        String(frn.ben || '').toLowerCase().includes(search)
      );
    }
    // Client-side filter by sub-status / pending reason (its own dedicated input, real-time)
    if (portfolioFrnPendingReason.trim()) {
      const pr = portfolioFrnPendingReason.trim().toLowerCase();
      filtered = filtered.filter(frn => (frn.pending_reason || '').toLowerCase().includes(pr));
    }
    // Then filter by status if a filter is selected
    if (portfolioFrnStatusFilter) {
      filtered = filtered.filter(frn => {
        const status = (frn.status || '').toLowerCase();
        const filter = portfolioFrnStatusFilter.toLowerCase();
        if (filter === 'funded') return status.includes('funded') || status.includes('committed');
        if (filter === 'denied') return status.includes('denied');
        if (filter === 'pending') return status.includes('pending') || status.includes('review') || status.includes('wave');
        return true;
      });
    }
    
    // Then sort if sorting is active
    if (!frnTableSort) return filtered;
    
    const sorted = [...filtered].sort((a, b) => {
      const aVal = (a[frnTableSort.field] || '').toString().toLowerCase();
      const bVal = (b[frnTableSort.field] || '').toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return frnTableSort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [flattenedFrns, frnTableSort, portfolioFrnStatusFilter, portfolioFrnSearch, portfolioFrnPendingReason]);

  // Reset visible count when the underlying dataset/filters change
  useEffect(() => {
    setVisibleFrnCount(25);
  }, [flattenedFrns, portfolioFrnStatusFilter, portfolioFrnSearch]);

  // Toggle FRN table sort
  const toggleFrnTableSort = (field: string) => {
    setFrnTableSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle schools table sort
  const toggleSchoolsTableSort = (field: string) => {
    setSchoolsTableSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Unique values for in-column State / Status filter dropdowns
  const uniqueSchoolStates = useMemo(() => {
    const vals = new Set<string>();
    schools.forEach(s => {
      const v = (s.state || '').toString().toUpperCase().trim();
      if (v) vals.add(v);
    });
    return Array.from(vals).sort();
  }, [schools]);

  const uniqueSchoolStatuses = useMemo(() => {
    const vals = new Set<string>();
    schools.forEach(s => {
      const v = (s.status || 'Unknown').toString().trim() || 'Unknown';
      vals.add(v);
    });
    return Array.from(vals).sort();
  }, [schools]);

  // Toggle one value in a Set-based filter
  const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  // Toggle funding school table sort
  const toggleFundingSchoolSort = (field: string) => {
    setFundingSchoolSort(prev => {
      if (prev.field !== field) return { field, dir: 'asc' };
      return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  // Sorted funding schools
  const sortedFundingSchools = useMemo(() => {
    if (!fundingSummary?.schools) return [];
    const list = [...fundingSummary.schools];
    return list.sort((a: any, b: any) => {
      const { field, dir } = fundingSchoolSort;
      if (field === 'total_funding_committed' || field === 'total_funding_requested') {
        const diff = (a[field] || 0) - (b[field] || 0);
        return dir === 'asc' ? diff : -diff;
      }
      const aVal = (field === 'school_name' ? (a.school_name || a.name || '') : (a[field] || '')).toString().toLowerCase();
      const bVal = (field === 'school_name' ? (b.school_name || b.name || '') : (b[field] || '')).toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [fundingSummary?.schools, fundingSchoolSort]);

  // Toggle service search sort
  const toggleServiceSearchSort = (field: string) => {
    setServiceSearchSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  };

  // Toggle school expand/collapse
  const toggleSchoolExpand = (ben: string) => {
    setExpandedSchools(prev => {
      const next = new Set(prev);
      if (next.has(ben)) next.delete(ben);
      else next.add(ben);
      return next;
    });
  };

  // Expand/collapse all schools
  const toggleAllSchools = () => {
    if (expandedSchools.size === sortedPortfolioSchools.length) {
      setExpandedSchools(new Set());
    } else {
      setExpandedSchools(new Set(sortedPortfolioSchools.map((s: any) => s.ben)));
    }
  };

  // Filtered schools based on search and status filter
  const filteredSchools = useMemo(() => {
    let result = schools;
    
    // Apply status filter first
    if (statusFilter !== "all") {
      result = result.filter(school => {
        const status = (school.status || '').toLowerCase();
        const statusColor = (school.status_color || '').toLowerCase();
        
        if (statusFilter === "denied") {
          // Catches "Has Denials", "Denied", any denial variant
          return status.includes("deni") || statusColor === "red";
        } else if (statusFilter === "funded") {
          return status === "funded" || status === "committed" || statusColor === "green";
        } else if (statusFilter === "pending") {
          // "Active" = has applications but no definitive funded/denied result
          return status === "pending" || status === "active" || status.includes("review") || statusColor === "yellow";
        } else if (statusFilter === "unknown") {
          return status === "unknown" || status === "not found" || status === "" || !school.status;
        }
        return true;
      });
    }
    
    // Apply text search
    if (schoolSearchQuery.trim()) {
      const query = schoolSearchQuery.toLowerCase().trim();
      result = result.filter(school => {
        const name = (school.school_name || school.name || '').toLowerCase();
        const ben = (school.ben || '').toLowerCase();
        const state = (school.state || '').toLowerCase();
        const city = (school.city || '').toLowerCase();
        return name.includes(query) || ben.includes(query) || state.includes(query) || city.includes(query);
      });
    }
    
    // Apply in-column State filter (empty Set = show all)
    if (schoolColStateFilter.size > 0) {
      result = result.filter(school => {
        const st = (school.state || '').toString().toUpperCase();
        return schoolColStateFilter.has(st);
      });
    }
    
    // Apply in-column Status filter (empty Set = show all)
    if (schoolColStatusFilter.size > 0) {
      result = result.filter(school => {
        const st = (school.status || 'Unknown').toString();
        return schoolColStatusFilter.has(st);
      });
    }
    
    // Apply column sorting (school_name | state | status)
    if (schoolsTableSort) {
      const field = schoolsTableSort.field;
      result = [...result].sort((a, b) => {
        let aVal = '';
        let bVal = '';
        if (field === 'school_name') {
          aVal = (a.school_name || a.name || '').toString().toLowerCase();
          bVal = (b.school_name || b.name || '').toString().toLowerCase();
        } else if (field === 'state') {
          aVal = (a.state || '').toString().toLowerCase();
          bVal = (b.state || '').toString().toLowerCase();
        } else if (field === 'status') {
          aVal = (a.status || '').toString().toLowerCase();
          bVal = (b.status || '').toString().toLowerCase();
        }
        const cmp = aVal.localeCompare(bVal);
        return schoolsTableSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    
    return result;
  }, [schools, schoolSearchQuery, statusFilter, schoolsTableSort, schoolColStateFilter, schoolColStatusFilter]);

  // Filtered + sorted service search results (Excel-style column filters + sort)
  const sortedServiceSearchResults = useMemo(() => {
    let result = serviceSearchResults;
    if (serviceColBen.trim()) {
      const q = serviceColBen.toLowerCase().trim();
      result = result.filter(r => (r.ben || '').toString().toLowerCase().includes(q));
    }
    if (serviceColName.trim()) {
      const q = serviceColName.toLowerCase().trim();
      result = result.filter(r => (r.name || '').toString().toLowerCase().includes(q));
    }
    if (serviceColFrn.trim()) {
      const q = serviceColFrn.toLowerCase().trim();
      result = result.filter(r => (r.frn || '').toString().toLowerCase().includes(q));
    }
    if (serviceColYear) {
      result = result.filter(r => (r.funding_year || '').toString() === serviceColYear);
    }
    if (serviceColStatus) {
      result = result.filter(r => (r.status || '').toString() === serviceColStatus);
    }
    if (serviceColService.trim()) {
      const q = serviceColService.toLowerCase().trim();
      result = result.filter(r => (r.service_type || '').toString().toLowerCase().includes(q));
    }
    if (serviceSearchSort) {
      const { field, dir } = serviceSearchSort;
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (field === 'funding_amount') {
          cmp = (Number(a.funding_amount) || 0) - (Number(b.funding_amount) || 0);
        } else if (field === 'funding_year') {
          cmp = parseInt(a.funding_year || '0') - parseInt(b.funding_year || '0');
        } else {
          const aVal = (a[field] || '').toString().toLowerCase();
          const bVal = (b[field] || '').toString().toLowerCase();
          cmp = aVal.localeCompare(bVal);
        }
        return dir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [serviceSearchResults, serviceSearchSort, serviceColBen, serviceColName, serviceColFrn, serviceColYear, serviceColStatus, serviceColService]);

  // Load query history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('skyrate_query_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setQueryHistory(parsed.map((q: any) => ({ ...q, timestamp: new Date(q.timestamp) })));
      } catch (e) {
        console.error('Failed to load query history');
      }
    }
  }, []);

  // Payment guard - check if user needs to complete payment setup
  const [checkingPayment, setCheckingPayment] = useState(true);
  
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!_hasHydrated || checkingVerification) return;
      if (!isAuthenticated) {
        setCheckingPayment(false);
        router.push("/sign-in");
        return;
      }
      // Verification guard handles redirect to /onboarding
      if (!emailVerified) {
        setCheckingPayment(false);
        return;
      }
      if (user?.role !== "consultant" && user?.role !== "admin" && user?.role !== "super") {
        // Redirect to appropriate dashboard based on role
        const dashboard = user?.role === 'applicant' ? '/applicant' : '/vendor';
        setCheckingPayment(false);
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

      loadData();
      loadDashboardStats();
      loadRecentActivity();
      loadCRNList();
      
      // Check if returning from CRN payment
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('crn_added') === 'true') {
        // Reload CRN list after successful payment redirect
        setTimeout(() => loadCRNList(), 1000);
      }
    };
    
    checkPaymentStatus();
  }, [_hasHydrated, isAuthenticated, user, router, checkingVerification, emailVerified]);

  // Deep link handling: open FRN detail modal from email links
  // URL format: /consultant?tab=frn-status&frn=XXXXX&ben=YYYYY
  const searchParams = useSearchParams();
  const frnParam = searchParams.get('frn');
  const benParam = searchParams.get('ben');
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (frnParam && !isLoading && !checkingPayment && !deepLinkHandled.current) {
      deepLinkHandled.current = true;
      setSelectedFRN({
        frn: frnParam,
        ben: benParam || '',
      });
      setShowFRNDetailModal(true);
      // Pre-fill search and load portfolio data so FRN appears in table when modal closes
      setPortfolioFrnSearch(frnParam);
      if (!portfolioFrnData) {
        loadPortfolioFRNStatus();
      }
    }
  }, [frnParam, benParam, isLoading, checkingPayment]);

  // Reload dashboard stats whenever the user picks a different funding year
  useEffect(() => {
    if (!checkingPayment) {
      loadDashboardStats(dashboardYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardYear]);

  const loadData = async (withUsacData: boolean = false) => {
    setIsLoading(true);
    try {
      const [profileRes, schoolsRes] = await Promise.all([
        api.getConsultantProfile(),
        api.getConsultantSchools(withUsacData),  // Backend auto-syncs schools with Unknown status
      ]);
      
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data.profile);
        // Initialize CRN input with profile value if not already set
        if (profileRes.data.profile?.crn && !crnInput) {
          setCrnInput(profileRes.data.profile.crn);
        }
      }
      if (schoolsRes.success && schoolsRes.data) {
        const loadedSchools = schoolsRes.data.schools || [];
        setSchools(loadedSchools);
        // Backend now auto-syncs schools that have Unknown status or haven't been synced
        // No need for client-side sync check
        if (schoolsRes.data.synced) {
          console.log('Schools auto-synced from USAC');
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDashboardStats = async (year?: number) => {
    const targetYear = year ?? dashboardYear;
    setIsLoadingStats(true);
    try {
      const [response, prevResponse] = await Promise.all([
        api.getDashboardStats(targetYear),
        api.getDashboardStats(targetYear - 1),
      ]);
      if (response.success && response.data) {
        setDashboardStats(response.data);
      }
      if (prevResponse.success && prevResponse.data) {
        setPrevYearStats(prevResponse.data);
      } else {
        setPrevYearStats(null);
      }
    } catch (error) {
      console.error("Failed to load dashboard stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const loadRecentActivity = async () => {
    setIsLoadingActivity(true);
    try {
      const res = await api.getRecentActivity(10);
      if (res.success && res.data) {
        setRecentActivity(res.data.activities || []);
      }
    } catch (error) {
      console.error("Failed to load recent activity:", error);
    } finally {
      setIsLoadingActivity(false);
    }
  };

  const formatActivityTime = (iso: string | null): string => {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  const loadAppeals = async () => {
    setIsLoadingAppeals(true);
    try {
      const response = await api.getAppeals();
      if (response.success && response.data) {
        setAppeals(response.data.appeals || []);
      }
    } catch (error) {
      console.error("Failed to load appeals:", error);
    } finally {
      setIsLoadingAppeals(false);
    }
  };

  const loadDeniedApplications = async () => {
    console.log("loadDeniedApplications called");
    setIsLoadingDenied(true);
    try {
      const response = await api.getDeniedApplications();
      console.log("getDeniedApplications response:", response);
      if (response.success && response.data) {
        console.log("Denied applications data:", response.data);
        setDeniedApplications(response.data.denied_applications || []);
        setDeniedStats({
          total: response.data.total_denied || 0,
          amount: response.data.total_denied_amount || 0,
        });
      }
    } catch (error) {
      console.error("Failed to load denied applications:", error);
    } finally {
      setIsLoadingDenied(false);
    }
  };

  // Load Portfolio FRN Status
  const loadPortfolioFRNStatus = async (year?: number, statusFilter?: string, pendingReason?: string, refresh?: boolean, ben?: string, search?: string, spinFilter?: string, crnFilter?: string) => {
    setPortfolioFrnLoading(true);
    setPortfolioFrnError(null);
    try {
      const response = await api.getConsultantFRNStatus(year, statusFilter || undefined, 500, pendingReason || undefined, refresh, ben, search || undefined, spinFilter || undefined, crnFilter || undefined);
      if (response.success && response.data) {
        const data = response.data as any;
        if (data.access_restricted) {
          // Regular consultant tried to look up a BEN not in their portfolio
          setUpgradeBen(data.ben || ben || '');
          setShowBenUpgradeModal(true);
        } else {
          setPortfolioFrnData(response.data);
        }
      } else {
        setPortfolioFrnError("Failed to load FRN data. Please try again.");
      }
    } catch (error: any) {
      console.error("Failed to load portfolio FRN status:", error);
      const msg = error?.message || "";
      if (msg.includes("timeout") || msg.includes("aborted") || msg.includes("504")) {
        setPortfolioFrnError("Request timed out. USAC data may be loading in the background — please retry in a minute.");
      } else {
        setPortfolioFrnError("Failed to load FRN data. Please try again.");
      }
    } finally {
      setPortfolioFrnLoading(false);
    }
  };

  // Load Funding Summary (lightweight endpoint for funding tab)
  const loadFundingSummary = async (year?: number, refresh?: boolean) => {
    setFundingSummaryLoading(true);
    try {
      const response = await api.getConsultantFRNStatusSummary(year, refresh);
      if (response.success && response.data) {
        setFundingSummary(response.data);
      }
    } catch (error) {
      console.error("Failed to load funding summary:", error);
    } finally {
      setFundingSummaryLoading(false);
    }
  };

  // Load FRN watches for the report monitors section
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

  // Load data when switching tabs
  useEffect(() => {
    if (activeTab === "appeals") {
      loadAppeals();
      loadDeniedApplications();
    }
    if (activeTab === "pia") {
      loadPIAHistory();
    }
    if (activeTab === "frn-status") {
      loadFRNWatches();
      loadReportHistory();
    }
    if (activeTab === "funding") {
      loadFundingSummary(fundingYear);
    }
    // FRN status is NOT auto-loaded — user must click "Search" to prevent
    // slow loading (87+ sequential USAC API calls for large portfolios)
  }, [activeTab]);

  const refreshSchoolsWithUsac = async () => {
    setIsRefreshingSchools(true);
    try {
      const schoolsRes = await api.getConsultantSchools(true);
      if (schoolsRes.success && schoolsRes.data) {
        setSchools(schoolsRes.data.schools || []);
      }
    } catch (error) {
      console.error("Failed to refresh:", error);
    } finally {
      setIsRefreshingSchools(false);
    }
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    // Bug C fix 2026-06-08: show loading + feedback so users know the add succeeded.
    // Previously the modal looked frozen because there was no toast/spinner and
    // no error path - partner thought "nothing happened" when the add actually worked.
    setIsAddingSchool(true);
    setAddSchoolError(null);
    const benToAdd = newBen.trim();
    try {
      const response = await api.addConsultantSchool(benToAdd, newNotes || undefined);
      if (response.success) {
        await loadData();
        setShowAddSchool(false);
        setNewBen("");
        setNewNotes("");
        const addedName = (response.data as any)?.school?.school_name || (response.data as any)?.school_name || `BEN ${benToAdd}`;
        // Visible confirmation - alert() matches the pattern already used by the CRN verify flow.
        alert(`School added: ${addedName}`);
      } else {
        const msg = (response as any).error || "Failed to add school - response not successful.";
        setAddSchoolError(msg);
      }
    } catch (error: any) {
      console.error("Failed to add school:", error);
      const msg = error?.message || error?.error || "Failed to add school. Check the BEN and try again.";
      setAddSchoolError(msg);
    } finally {
      setIsAddingSchool(false);
    }
  };

  // CRN Verification handler
  const handleVerifyCRN = async () => {
    const crn = (crnInput || profile?.crn || "").trim();
    if (!crn) {
      setCrnError("Please enter a CRN");
      return;
    }
    
    setIsVerifyingCRN(true);
    setCrnError(null);
    setCrnVerificationResult(null);
    
    try {
      const response = await api.verifyCRN(crn, true);
      if (response.success && response.data) {
        setCrnVerificationResult(response.data);
        setCrnInput(response.data.crn);  // Update input with verified CRN
        
        // Reload profile and schools with USAC data to show names
        await loadData(true);  // true = fetch USAC data for school names
        
        // Auto-switch to schools tab to show imported schools
        if (response.data.imported_count > 0) {
          setActiveTab("schools");
        }
        
        // Show success message
        alert(`✅ CRN Verified!\n\nCompany: ${response.data.consultant?.company_name || 'N/A'}\nSchools Found: ${response.data.school_count}\nImported: ${response.data.imported_count}\nAlready Added: ${response.data.skipped_count}`);
      } else {
        setCrnError(response.error || "Failed to verify CRN");
      }
    } catch (error: any) {
      console.error("CRN verification error:", error);
      setCrnError(error?.message || "Failed to verify CRN. Please check the number and try again.");
    } finally {
      setIsVerifyingCRN(false);
    }
  };

  // ========== Multi-CRN Management Handlers ==========
  
  const loadCRNList = async () => {
    try {
      const response = await api.listCRNs();
      if (response.success && response.data) {
        setCrnList(response.data.crns || []);
        setIsFreeUser(response.data.is_free_user);
        setCanAddFree(response.data.can_add_free);
      }
    } catch (error) {
      console.error("Failed to load CRN list:", error);
    }
  };

  const handleAddNewCRN = async () => {
    const crn = newCrnInput.trim();
    if (!crn) {
      setAddCrnError("Please enter a CRN number");
      return;
    }
    
    setAddingCrn(true);
    setAddCrnError(null);
    
    try {
      const response = await api.addCRN(crn);
      if (response.success && response.data) {
        if (response.data.requires_payment) {
          // Store the pending CRN and show paywall
          setPendingCrn(crn);
          setShowAddCrnModal(false);
          setShowCrnPaywall(true);
        } else {
          // CRN added successfully (free user or first CRN)
          setShowAddCrnModal(false);
          setNewCrnInput("");
          await loadCRNList();
          await loadData(true);
        }
      } else {
        setAddCrnError(response.error || "Failed to add CRN");
      }
    } catch (error: any) {
      console.error("Failed to add CRN:", error);
      setAddCrnError(error?.message || "Failed to add CRN. Please try again.");
    } finally {
      setAddingCrn(false);
    }
  };

  const handleCRNCheckout = async (plan: 'monthly' | 'yearly') => {
    if (!pendingCrn) return;
    
    // Find the CRN ID from the list (it was added as pending)
    const pendingCrnEntry = crnList.find(c => c.crn === pendingCrn);
    if (!pendingCrnEntry) {
      // The CRN might not be in the list yet if it was just verified
      // Try to add it first, then checkout
      try {
        const addRes = await api.addCRN(pendingCrn, plan);
        if (addRes.success && addRes.data?.crn_id) {
          const checkoutRes = await api.createCRNCheckout(addRes.data.crn_id, plan);
          if (checkoutRes.success && checkoutRes.data?.checkout_url) {
            window.location.href = checkoutRes.data.checkout_url;
            return;
          }
        }
        setAddCrnError("Failed to create checkout session");
      } catch (error: any) {
        setAddCrnError(error?.message || "Failed to create checkout");
      }
      return;
    }
    
    try {
      const response = await api.createCRNCheckout(pendingCrnEntry.id, plan);
      if (response.success && response.data?.checkout_url) {
        window.location.href = response.data.checkout_url;
      } else {
        setAddCrnError("Failed to create checkout session");
      }
    } catch (error: any) {
      console.error("CRN checkout error:", error);
      setAddCrnError(error?.message || "Failed to create checkout session");
    }
  };

  const handleRemoveCRN = async (crnId: number, crnNumber: string, isPrimary: boolean) => {
    const isPrivileged = user?.role === 'admin' || user?.role === 'super';
    if (isPrimary && !isPrivileged && !isFreeUser) {
      alert("Cannot remove your primary CRN. It's linked to your main subscription.");
      return;
    }
    const warning = isPrimary
      ? `Remove PRIMARY CRN ${crnNumber}? This is the primary CRN for its owning consultant profile. All schools imported from this CRN will be deleted and another remaining CRN (if any) will be auto-promoted to primary. Any active subscription will be cancelled.`
      : `Remove CRN ${crnNumber}? This will also remove all schools imported from this CRN. Any active subscription for this CRN will be cancelled.`;
    if (!confirm(warning)) {
      return;
    }
    
    try {
      const response = await api.removeCRN(crnId);
      if (response.success) {
        await loadCRNList();
        await loadData(true);
      } else {
        alert(response.error || "Failed to remove CRN");
      }
    } catch (error: any) {
      console.error("Failed to remove CRN:", error);
      alert(error?.message || "Failed to remove CRN");
    }
  };

  const handleSetPrimaryCRN = async (crnId: number, crnNumber: string) => {
    if (!confirm(`Make CRN ${crnNumber} your primary CRN? This will demote your current primary CRN, which you can then delete if you no longer need it.`)) {
      return;
    }
    try {
      const response = await api.setPrimaryCRN(crnId);
      if (response.success) {
        await loadCRNList();
        await loadData(true);
      } else {
        alert(response.error || "Failed to set primary CRN");
      }
    } catch (error: any) {
      console.error("Failed to set primary CRN:", error);
      alert(error?.message || "Failed to set primary CRN");
    }
  };

  const handleResyncCRNSchools = async (crnId: number, crnNumber: string) => {
    // Open selective resync modal instead of auto-importing everything
    setResyncCrnTarget({ id: crnId, crn: crnNumber });
    setResyncPreviewData(null);
    setResyncSelectedBens(new Set());
    setResyncSearchQuery("");
    setShowResyncModal(true);
    setResyncPreviewLoading(true);
    try {
      const response = await api.resyncCRNPreview(crnId);
      if (response.success && response.data) {
        setResyncPreviewData(response.data);
        // Pre-select all new schools by default
        const allNewBens = new Set(response.data.new_schools.map((s: any) => s.ben));
        setResyncSelectedBens(allNewBens);
      } else {
        alert(response.error || "Failed to preview schools from USAC");
        setShowResyncModal(false);
      }
    } catch (error: any) {
      console.error("Failed to preview CRN schools:", error);
      alert(error?.message || "Failed to preview schools from USAC");
      setShowResyncModal(false);
    } finally {
      setResyncPreviewLoading(false);
    }
  };

  const handleResyncSelectiveImport = async () => {
    if (!resyncCrnTarget || resyncSelectedBens.size === 0) return;
    setResyncImporting(true);
    try {
      const response = await api.resyncCRNSelective(resyncCrnTarget.id, Array.from(resyncSelectedBens));
      if (response.success && response.data) {
        const d = response.data;
        setShowResyncModal(false);
        alert(
          `Import complete for CRN ${d.crn}.\n\n` +
          `Imported: ${d.imported_count}\n` +
          `Already in portfolio: ${d.skipped_count}\n` +
          `Total schools for this CRN: ${d.total_schools_for_crn}` +
          (d.not_found_in_usac.length > 0 ? `\n\n${d.not_found_in_usac.length} BENs not found in USAC data.` : "")
        );
        await loadCRNList();
        await loadData(true);
      } else {
        alert(response.error || "Failed to import selected schools");
      }
    } catch (error: any) {
      console.error("Failed selective resync:", error);
      alert(error?.message || "Failed to import selected schools");
    } finally {
      setResyncImporting(false);
    }
  };

  // Replace-CRN handler (test/demo accounts) — swaps a CRN slot in place so
  // demo operators can retarget the test consultant onto whichever CRN their
  // prospect wants to see without juggling add/promote/delete.
  const handleReplaceCRN = async () => {
    if (!replaceCrnTarget) return;
    const newCrn = replaceCrnInput.trim().toUpperCase();
    if (!newCrn) {
      setReplaceCrnError("Please enter the new CRN");
      return;
    }
    setReplacingCrn(true);
    setReplaceCrnError(null);
    try {
      const response = await api.replaceCRN(replaceCrnTarget.id, newCrn);
      if (response.success && response.data) {
        const d = response.data;
        setShowReplaceCrnModal(false);
        setReplaceCrnTarget(null);
        setReplaceCrnInput("");
        await loadCRNList();
        await loadData(true);
        alert(
          `CRN swapped: ${d.old_crn} -> ${d.new_crn}\n\n` +
          `Company: ${d.consultant?.company_name || 'N/A'}\n` +
          `Schools imported: ${d.imported_count}\n` +
          `Old schools removed: ${d.deleted_old_schools}`
        );
      } else {
        setReplaceCrnError(response.error || "Failed to replace CRN");
      }
    } catch (error: any) {
      console.error("Failed to replace CRN:", error);
      setReplaceCrnError(error?.message || "Failed to replace CRN");
    } finally {
      setReplacingCrn(false);
    }
  };

  // Function to add school from search results
  const handleAddSchoolFromSearch = async (school: { ben: string; school_name: string; state: string }) => {
    try {
      const response = await api.addConsultantSchool(school.ben, `Added from search. ${school.school_name || ''}`);
      if (response.success) {
        await loadData();
      }
    } catch (error) {
      console.error("Failed to add school from search:", error);
      throw error;
    }
  };

  // Memoized set of existing BENs for quick lookup
  const existingBens = useMemo(() => {
    return new Set(schools.map(s => String(s.ben)));
  }, [schools]);

  const handleDownloadTemplate = async () => {
    const blob = await api.downloadCsvTemplate();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skyrate_school_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // CSV export handlers
  const handleExportSchools = () => {
    const source = selectedSchoolBens.size > 0
      ? filteredSchools.filter(s => selectedSchoolBens.has(s.ben))
      : filteredSchools;
    const rows = source.map(s => ({
      ben: s.ben,
      name: s.school_name || s.name || '',
      state: s.state || '',
      city: s.city || '',
      status: s.status || '',
      entity_type: s.entity_type || '',
      discount_rate: s.discount_rate ?? '',
    }));
    downloadCsv(csvFilename('my_schools'), ['ben', 'name', 'state', 'city', 'status', 'entity_type', 'discount_rate'], rows);
  };

  const handleExportDeniedApps = () => {
    const visible = deniedApplications.filter(app => !app.has_appeal);
    const source = selectedDeniedFrns.size > 0
      ? visible.filter(app => selectedDeniedFrns.has(app.frn))
      : visible;
    const rows = source.map(app => ({
      frn: app.frn,
      ben: app.ben,
      school_name: app.school_name,
      funding_year: app.funding_year,
      status: app.status,
      service_type: app.service_type,
      amount: app.amount_requested,
      denial_reason: app.denial_reason || '',
      appeal_deadline: app.appeal_deadline || '',
      days_remaining: app.days_remaining ?? '',
    }));
    downloadCsv(csvFilename('denied_applications'), ['frn', 'ben', 'school_name', 'funding_year', 'status', 'service_type', 'amount', 'denial_reason', 'appeal_deadline', 'days_remaining'], rows);
  };

  const handleExportPortfolioFrns = () => {
    const source = selectedPortfolioFrns.size > 0
      ? sortedFlattenedFrns.filter(f => selectedPortfolioFrns.has(f.frn))
      : sortedFlattenedFrns;
    const rows = source.map(f => ({
      frn: f.frn,
      entity: f.entity_name,
      ben: f.ben,
      state: f.state,
      year: f.funding_year,
      service_type: f.service_type,
      status: f.status,
      commitment_amount: f.commitment_amount,
      disbursed_amount: f.disbursed_amount,
    }));
    downloadCsv(csvFilename('portfolio_frns'), ['frn', 'entity', 'ben', 'state', 'year', 'service_type', 'status', 'commitment_amount', 'disbursed_amount'], rows);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setValidationResults(null);
    setUploadResults(null);
    
    // Parse CSV and validate BENs
    setIsValidating(true);
    try {
      const text = await file.text();
      const lines = text.split('\n');
      const bens: string[] = [];
      
      // Skip header, extract BENs
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const ben = cols[0]?.trim();
        if (ben) bens.push(ben);
      }
      
      if (bens.length > 0) {
        const validationRes = await api.validateBens(bens);
        if (validationRes.success && validationRes.data?.results) {
          // Map the results to our ValidationResult format
          const mapped: ValidationResult[] = validationRes.data.results.map((r: any) => ({
            ben: r.ben,
            is_valid: r.valid ?? r.is_valid ?? false,
            already_exists: r.already_exists ?? false,
            school_name: r.school_name,
            state: r.state,
            error: r.error
          }));
          setValidationResults(mapped);
        }
      }
    } catch (error) {
      console.error("Validation failed:", error);
    } finally {
      setIsValidating(false);
    }
  };

  const handleUploadConfirm = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    try {
      const response = await api.uploadSchoolsCsv(uploadFile, true);
      if (response.success) {
        setUploadResults(response.data);
        await loadData();
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const openSchoolDetail = async (school: EnhancedSchool) => {
    setSelectedSchool(school);
    setEnrichedSchoolData(null);
    setComprehensiveSchoolData(null);
    setShowSchoolDetail(true);
    setSchoolApplications([]);
    setSelectedYear(null);
    setLoadingApplications(true);
    setLoadingEnrichment(true);
    setLoadingComprehensiveData(true);
    
    try {
      // Fetch applications, enrichment data, and comprehensive data in parallel
      const [appsRes, enrichRes, comprehensiveRes] = await Promise.all([
        api.getSchoolApplications(school.ben, { include_denial_reasons: true }),
        api.getSchoolEnrichment(school.ben),
        api.getComprehensiveSchoolData(school.ben),
      ]);
      
      if (appsRes.success && appsRes.data) {
        setSchoolApplications(appsRes.data.applications || []);
        setApplicationYears(appsRes.data.available_years || []);
      }
      
      if (enrichRes.success && enrichRes.data) {
        // Merge enriched data with school data
        const enriched: EnhancedSchool = {
          ...school,
          school_name: enrichRes.data.data.organization_name || school.school_name,
          entity_type: enrichRes.data.data.entity_type,
          address: enrichRes.data.data.address,
          city: enrichRes.data.data.city || school.city,
          state: enrichRes.data.data.state || school.state,
          zip_code: enrichRes.data.data.zip_code,
          frn_number: enrichRes.data.data.frn_number,
          total_funding_committed: enrichRes.data.data.total_funding_committed,
          total_funding_requested: enrichRes.data.data.total_funding_requested,
          funding_years: enrichRes.data.data.funding_years,
          applications_count: enrichRes.data.data.applications_count,
          has_category1: enrichRes.data.data.has_category1,
          has_category2: enrichRes.data.data.has_category2,
          status: enrichRes.data.data.status || school.status,
          latest_year: enrichRes.data.data.latest_year?.toString(),
          discount_rate: enrichRes.data.data.discount_rate,
        };
        setEnrichedSchoolData(enriched);
        setSelectedSchool(enriched);
      }
      
      if (comprehensiveRes.success && comprehensiveRes.data) {
        setComprehensiveSchoolData({
          c2_budget: comprehensiveRes.data.c2_budget,
          funding_totals: comprehensiveRes.data.funding_totals,
          years: comprehensiveRes.data.years,
        });
      }
    } catch (error) {
      console.error("Failed to load school data:", error);
    } finally {
      setLoadingApplications(false);
      setLoadingEnrichment(false);
      setLoadingComprehensiveData(false);
    }
  };

  const filterApplicationsByYear = async (year: number | null) => {
    setSelectedYear(year);
    if (!selectedSchool) return;
    setLoadingApplications(true);
    
    try {
      const res = await api.getSchoolApplications(selectedSchool.ben, {
        year: year || undefined,
        include_denial_reasons: true
      });
      if (res.success && res.data) {
        setSchoolApplications(res.data.applications || []);
      }
    } catch (error) {
      console.error("Failed to filter:", error);
    } finally {
      setLoadingApplications(false);
    }
  };

  const handleGenerateAppeal = async (frn: string, additionalContext?: string) => {
    setGeneratingAppeal(frn);
    setAppealError(null);
    try {
      const res = await api.generateAppeal(frn, additionalContext);
      if (res.success && res.data) {
        // Add to appeals list and open chat
        setAppeals(prev => [res.data!, ...prev]);
        setSelectedAppeal(res.data);
        setShowAppealChat(true);
        setShowNewAppealModal(false);
        setSelectedDeniedApp(null);
        setNewAppealFrn("");
        setNewAppealContext("");
      } else {
        setAppealError(res.error || "Failed to generate appeal");
      }
    } catch (error: any) {
      console.error("Appeal generation failed:", error);
      setAppealError(error.message || "Failed to generate appeal");
    } finally {
      setGeneratingAppeal(null);
    }
  };

  const handleDeleteAppeal = async (appealId: number) => {
    console.log("Delete appeal clicked, appealId:", appealId);
    if (!confirm("Are you sure you want to delete this appeal?")) {
      console.log("User cancelled delete");
      return;
    }
    console.log("User confirmed delete, calling API...");
    try {
      const res = await api.deleteAppeal(appealId);
      console.log("Delete API response:", res);
      if (res.success) {
        console.log("Delete successful, updating state");
        setAppeals(prev => prev.filter(a => a.id !== appealId));
        if (selectedAppeal?.id === appealId) {
          setSelectedAppeal(null);
          setShowAppealChat(false);
        }
      } else {
        console.error("Delete failed:", res.error);
        alert("Failed to delete appeal: " + (res.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to delete appeal:", error);
      alert("Error deleting appeal: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleAppealUpdate = (updatedAppeal: AppealRecord) => {
    setAppeals(prev => prev.map(a => a.id === updatedAppeal.id ? updatedAppeal : a));
    setSelectedAppeal(updatedAppeal);
  };

  // ==================== PIA RESPONSE HANDLERS ====================

  const loadPIAHistory = async (forceRefresh = false) => {
    setIsLoadingPiaResponses(true);
    try {
      const res = await api.getPIAResponses();
      if (res.success && res.data) {
        setPiaResponses(res.data.pia_responses || []);
      }
    } catch (error) {
      console.error("Failed to load PIA responses:", error);
    } finally {
      setIsLoadingPiaResponses(false);
    }
    // Also load FRNs currently under USAC PIA review (no year filter — catches FY2025 and FY2026)
    setIsLoadingPiaFRNs(true);
    try {
      const frnRes = await api.getPIAFRNs(undefined, forceRefresh);
      if (frnRes.success && frnRes.data) {
        setPiaFRNs(frnRes.data.pia_frns || []);
      }
    } catch (error) {
      console.error("Failed to load PIA FRNs:", error);
    } finally {
      setIsLoadingPiaFRNs(false);
    }
  };

  const generatePIAResponse = async () => {
    if (!piaQuestionInput.trim()) return;
    setIsPiaGenerating(true);
    setPiaError(null);
    try {
      const res = await api.generatePIA(
        piaQuestionInput,
        piaBen || undefined,
        piaFrn || undefined,
        undefined,
        piaAdditionalContext || undefined,
        detectedCategory?.category || undefined
      );
      if (res.success && res.data) {
        setPiaResponses(prev => [res.data!, ...prev]);
        setSelectedPia(res.data);
        setShowPiaChat(true);
        setPiaQuestionInput("");
        setPiaBen("");
        setPiaFrn("");
        setPiaAdditionalContext("");
        setDetectedCategory(null);
        setTemplatePreview(null);
        setShowPiaTemplates(false);
      } else {
        setPiaError(res.error || "Failed to generate PIA response");
      }
    } catch (error: unknown) {
      console.error("PIA generation failed:", error);
      setPiaError(error instanceof Error ? error.message : "Failed to generate PIA response");
    } finally {
      setIsPiaGenerating(false);
    }
  };

  const handlePIATemplateSelect = (question: string, category: string) => {
    setPiaQuestionInput(question);
    const categoryNames: Record<string, string> = {
      competitive_bidding: "Competitive Bidding",
      cost_effectiveness: "Cost-Effectiveness",
      entity_eligibility: "Entity Eligibility",
      service_eligibility: "Service Eligibility",
      discount_rate: "Discount Rate",
      student_count: "Student Count & NSLP",
      contracts: "Contracts",
      cipa: "CIPA Compliance",
      ineligible_services: "30% Rule",
      general: "General PIA Question",
    };
    setDetectedCategory({ category, name: categoryNames[category] || category });

    // Fetch preview for the selected category
    api.getPIAPreview(category).then((res) => {
      if (res.success && res.data) {
        setTemplatePreview(res.data);
      }
    }).catch(() => {
      // Silently ignore preview fetch errors
    });
  };

  const handlePIAUpdate = (updatedPia: PIAResponseRecord) => {
    setPiaResponses(prev => prev.map(p => p.id === updatedPia.id ? updatedPia : p));
    setSelectedPia(updatedPia);
  };

  const handleDeletePIA = async (piaId: number) => {
    if (!confirm("Are you sure you want to delete this PIA response?")) return;
    try {
      const res = await api.deletePIA(piaId);
      if (res.success) {
        setPiaResponses(prev => prev.filter(p => p.id !== piaId));
        if (selectedPia?.id === piaId) {
          setSelectedPia(null);
          setShowPiaChat(false);
        }
      } else {
        alert("Failed to delete: " + (res.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Failed to delete PIA response:", error);
    }
  };

  // Debounced PIA question analysis
  const piaAnalysisTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (piaQuestionInput.length > 50) {
      if (piaAnalysisTimeoutRef.current) clearTimeout(piaAnalysisTimeoutRef.current);
      piaAnalysisTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await api.analyzePIAQuestion(piaQuestionInput);
          if (res.success && res.data) {
            setDetectedCategory({ category: res.data.category, name: res.data.category_name });
          }
        } catch {
          // Silent fail on analysis
        }
      }, 800);
    } else {
      setDetectedCategory(null);
    }
    return () => {
      if (piaAnalysisTimeoutRef.current) clearTimeout(piaAnalysisTimeoutRef.current);
    };
  }, [piaQuestionInput]);

  const handleRemoveSchool = async (ben: string) => {
    if (!confirm(`Remove school ${ben} from your portfolio?`)) return;
    try {
      await api.removeConsultantSchool(ben);
      await loadData();
    } catch (error) {
      console.error("Failed to remove:", error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;
    
    setIsQuerying(true);
    setQueryError(null);
    setQueryResults(null);
    setQueryOffset(0);
    setQueryHasMore(false);
    setLastQueryInput(queryInput.trim());
    
    try {
      const response = await api.naturalLanguageQuery(queryInput, undefined, 0, 100);
      if (response.success && response.data) {
        setQueryResults(response.data);
        setQueryOffset(response.data.count || 0);
        setQueryHasMore(response.data.has_more || false);
        // Save to history
        const newHistory = [
          { query: queryInput.trim(), timestamp: new Date(), resultCount: response.data.count || response.data.data?.length || 0 },
          ...queryHistory.filter(h => h.query !== queryInput.trim()).slice(0, 19) // Keep last 20, no duplicates
        ];
        setQueryHistory(newHistory);
        localStorage.setItem('skyrate_query_history', JSON.stringify(newHistory));
      } else {
        setQueryError(response.error || "Query failed");
      }
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Query failed");
    } finally {
      setIsQuerying(false);
    }
  };

  const handleLoadMore = async () => {
    if (!lastQueryInput || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await api.naturalLanguageQuery(lastQueryInput, undefined, queryOffset, 100);
      if (response.success && response.data) {
        setQueryResults((prev: any) => ({
          ...prev,
          data: [...(prev?.data || []), ...(response.data.data || [])],
          count: (prev?.data?.length || 0) + (response.data.data?.length || 0),
        }));
        setQueryOffset(queryOffset + (response.data.count || 0));
        setQueryHasMore(response.data.has_more || false);
      }
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Load more failed");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadQueryFromHistory = (query: string) => {
    setQueryInput(query);
  };

  const clearQueryHistory = () => {
    setQueryHistory([]);
    localStorage.removeItem('skyrate_query_history');
  };

  // Service Search handler
  const handleServiceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setServiceSearchLoading(true);
    setServiceSearchResults([]);
    setServiceSearchBensSearched(0);
    
    try {
      const filters: any = {};
      if (serviceSearchBen) filters.ben = serviceSearchBen;
      if (serviceSearchStatus) filters.status_filter = serviceSearchStatus;
      if (serviceSearchType) filters.service_type = serviceSearchType;
      if (serviceSearchYear) filters.year = serviceSearchYear;
      if (serviceSearchMinAmount) filters.min_amount = parseFloat(serviceSearchMinAmount);
      if (serviceSearchMaxAmount) filters.max_amount = parseFloat(serviceSearchMaxAmount);
      filters.limit = 500;
      
      const response = await api.consultantServiceSearch(filters);
      if (response.success && response.data) {
        setServiceSearchResults(response.data.results || []);
        setServiceSearchBensSearched(response.data.bens_searched || 0);
      }
    } catch (error) {
      console.error("Service search error:", error);
    } finally {
      setServiceSearchLoading(false);
    }
  };

  // Form 471 entity lookup (winning vendors + records) for a single BEN.
  const lookupForm471ByBen = async () => {
    if (!form471BenInput.trim()) {
      setForm471Error("Please enter a BEN (Billed Entity Number)");
      return;
    }
    setForm471Loading(true);
    setForm471Error(null);
    setForm471Data(null);
    setExpanded471Frn(null);
    setForm471LineItemsCache({});
    try {
      const response = await api.consultantGet471ByEntity(form471BenInput.trim(), form471Year);
      if (response.success && response.data) {
        if (response.data.success) {
          setForm471Data(response.data);
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
  const toggleConsultant471LineItems = async (frn: string) => {
    if (!frn) return;
    if (expanded471Frn === frn) {
      setExpanded471Frn(null);
      return;
    }
    setExpanded471Frn(frn);
    if (form471LineItemsCache[frn]) {
      return; // already cached
    }
    setForm471LineItemsLoadingFrn(frn);
    try {
      const response = await api.consultantGet471LineItemsByFrn(frn);
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

  // Show loading state while checking payment status
  if (!_hasHydrated || checkingPayment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Verifying your subscription...</p>
        </div>
      </div>
    );
  }

  // NOTE (2026-05-28): removed the blocking "Loading your dashboard..." full-page
  // overlay that fired whenever `isLoading` was true. It forced every tab switch
  // to look like a hard navigation. The sidebar + shell render immediately now,
  // and each tab handles its own skeleton/"..." placeholders (see isLoadingStats,
  // dashboardStats?, etc. below).

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "schools", label: "My Schools", icon: "🏫" },
    { id: "funding", label: "Funding Data", icon: "💰" },
    { id: "frn-status", label: "FRN Status", icon: "📈" },
    { id: "appeals", label: "Appeals", icon: "📋" },
    { id: "pia", label: "PIA Assistant", icon: "🛡️" },
    { id: "service-search", label: "Service Search", icon: "🔍" },
    // Settings is account-level (profile + CRN) and owner-only. Hide for seats.
    ...(isSeat ? [] : [{ id: "settings", label: "Settings", icon: "⚙️" }]),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="rounded-lg" />
            <div>
              <span className="font-bold text-slate-900">SkyRate AI</span>
              <span className="block text-xs text-slate-500">
                Consultant Portal{(user?.role === 'super' || user?.role === 'admin') ? ` (${user.role})` : ''}
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as ConsultantTab); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeTab === item.id
                  ? "bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 font-medium shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
              {activeTab === item.id && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              )}
            </button>
          ))}

          {/* Compliance tool link */}
          <Link
            href="/compliance"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-slate-600 hover:bg-slate-50"
          >
            <span className="text-xl">🛡️</span>
            <span>Compliance</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">Beta</span>
          </Link>
        </nav>

        {/* Portal Switcher (super/admin only) */}
        {(user?.role === 'super' || user?.role === 'admin') && (
          <div className="px-4 pb-3">
            <div className="border-t border-slate-200 pt-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-4 mb-2">Switch Portal</p>
              <Link
                href="/vendor"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-purple-50 hover:text-purple-700 transition-all text-sm"
              >
                <span className="text-lg">🎯</span>
                <span>Vendor Portal</span>
                <svg className="w-4 h-4 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
              <Link
                href="/super"
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-600 hover:bg-yellow-50 hover:text-yellow-700 transition-all text-sm"
              >
                <span className="text-lg">⭐</span>
                <span>Super Dashboard</span>
                <svg className="w-4 h-4 ml-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          </div>
        )}

        {/* Subscription Card */}
        <div className="absolute bottom-20 left-4 right-4">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">
                {user?.role === 'super' || user?.role === 'admin' ? 'Full Access' : 'Pro Plan'}
              </span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {user?.role === 'super' ? '⭐ Super' : user?.role === 'admin' ? '🔑 Admin' : 'Active'}
              </span>
            </div>
            <div className="text-2xl font-bold">{schools.length} Schools</div>
            <div className="text-sm opacity-75 mt-1">
              {user?.role === 'super' || user?.role === 'admin' ? 'Full platform access' : 'Unlimited access'}
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-purple-700 font-semibold">
              {user?.first_name?.[0] || user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 truncate">{user?.full_name || user?.email}</div>
              <div className="text-xs text-slate-500 truncate">{profile?.company_name}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-slate-900">
              {navItems.find(i => i.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button
              onClick={() => { loadData(); loadDashboardStats(); loadRecentActivity(); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </header>

        {/* Soft-gate: prompt users without a CRN to finish onboarding */}
        <MissingIdentifierBanner />

        {/* Trial Banner */}
        {user?.subscription?.status === 'trialing' && !trialBannerDismissed && (() => {
          const trialEnd = user?.subscription?.trial_end ? new Date(user.subscription.trial_end) : null;
          const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
          return (
            <div className="mx-6 mt-4 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-lg">&#9888;</span>
                <p className="text-sm text-amber-800">
                  <span className="font-semibold">Free trial:</span>{" "}
                  {daysLeft > 0
                    ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining. Add payment details to keep your access.`
                    : "Your trial has ended."}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href="/subscribe"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Upgrade
                </a>
                <button
                  onClick={() => setTrialBannerDismissed(true)}
                  className="text-amber-400 hover:text-amber-600 transition-colors"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Page Content */}
        <div className="p-6">
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Hero Banner */}
              <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <span className="text-3xl">📋</span>
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">{profile?.company_name || 'My Consulting Firm'}</h1>
                      <div className="flex items-center gap-3 mt-1 text-purple-100">
                        {profile?.crn && (
                          <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">CRN: {profile.crn}</span>
                        )}
                        <span className="flex items-center gap-1 text-sm">
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                          E-Rate Consultant
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="dashboard-year" className="text-sm text-purple-100 font-medium">Funding Year:</label>
                    <select
                      id="dashboard-year"
                      value={dashboardYear}
                      onChange={(e) => setDashboardYear(parseInt(e.target.value, 10))}
                      className="bg-white/20 hover:bg-white/30 border border-white/30 rounded-lg px-3 py-1.5 text-sm font-semibold text-white backdrop-blur cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      {(() => {
                        const currentYear = new Date().getFullYear();
                        const years: number[] = [];
                        for (let y = currentYear + 1; y >= currentYear - 6; y--) years.push(y);
                        return years.map((y) => (
                          <option key={y} value={y} className="text-slate-900">FY{y}</option>
                        ));
                      })()}
                    </select>
                    <button
                      onClick={() => setActiveTab("schools")}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                    >
                      View All Schools →
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mt-6 pt-6 border-t border-white/20">
                  <div>
                    <div className="text-3xl font-bold">{schools.length}</div>
                    <div className="text-sm text-purple-200 mt-1">Total Schools</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : (dashboardStats?.total_applications || 0)}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">FY{dashboardYear} Applications</div>
                    {prevYearStats && !isLoadingStats && (
                      <div className="text-xs text-purple-200/80 mt-0.5">
                        {(() => {
                          const delta = (dashboardStats?.total_applications || 0) - (prevYearStats.total_applications || 0);
                          const sign = delta > 0 ? '+' : '';
                          const color = delta > 0 ? 'text-green-300' : delta < 0 ? 'text-red-300' : 'text-purple-200/80';
                          return <span className={color}>{sign}{delta} vs FY{dashboardYear - 1}</span>;
                        })()}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : `${dashboardStats?.funded_count || 0}`}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">Funded Apps</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : dashboardStats ? `$${(dashboardStats.total_c1_funding / 1000000).toFixed(1)}M` : '$0'}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">C1 Funded (FY{dashboardYear})</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {isLoadingStats ? '...' : dashboardStats ? `$${(dashboardStats.total_c2_funding / 1000000).toFixed(1)}M` : '$0'}
                    </div>
                    <div className="text-sm text-purple-200 mt-1">C2 Budget (5-yr)</div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <span className="text-xl">🏫</span>
                    </div>
                    <span className="text-[10px] text-green-600 font-medium px-2 py-0.5 bg-green-50 rounded-full">{schools.length} total</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{schools.length}</div>
                  <div className="text-sm text-slate-500 mt-1">Total Schools</div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <span className="text-xl">📡</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-50 rounded-full">Loading...</span>
                    ) : (
                      <span className="text-[10px] text-blue-600 font-medium px-2 py-0.5 bg-blue-50 rounded-full">C1 · FY{dashboardYear}</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {isLoadingStats ? (
                      <span className="text-slate-400">...</span>
                    ) : dashboardStats ? (
                      `$${(dashboardStats.total_c1_funding / 1000000).toFixed(2)}M`
                    ) : (
                      "$0"
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Category 1 Funded</div>
                  {prevYearStats && !isLoadingStats && (
                    <div className="text-xs text-slate-400 mt-1">
                      {(() => {
                        const delta = (dashboardStats?.total_c1_funding || 0) - (prevYearStats.total_c1_funding || 0);
                        const sign = delta > 0 ? '+' : '';
                        const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-slate-400';
                        return <span className={color}>{sign}${(delta / 1000000).toFixed(2)}M vs FY{dashboardYear - 1}</span>;
                      })()}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <span className="text-xl">💰</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-50 rounded-full">Loading...</span>
                    ) : (
                      <span className="text-[10px] text-green-600 font-medium px-2 py-0.5 bg-green-50 rounded-full">C2 · 5-yr cycle</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {isLoadingStats ? (
                      <span className="text-slate-400">...</span>
                    ) : dashboardStats ? (
                      `$${(dashboardStats.total_c2_funding / 1000000).toFixed(2)}M`
                    ) : (
                      "$0"
                    )}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Category 2 Funded</div>
                  {!isLoadingStats && dashboardStats && dashboardStats.total_c2_funding_year > 0 && (
                    <div className="text-xs text-slate-400 mt-1">
                      ${(dashboardStats.total_c2_funding_year / 1000000).toFixed(2)}M committed in FY{dashboardYear}
                    </div>
                  )}
                </div>
                
                <div 
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-red-300"
                  onClick={() => setActiveTab("appeals")}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <span className="text-xl">⚠️</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-50 rounded-full">Loading...</span>
                    ) : dashboardStats && dashboardStats.schools_with_denials > 0 ? (
                      <span className="text-[10px] text-red-600 font-medium px-2 py-0.5 bg-red-50 rounded-full">Action needed</span>
                    ) : (
                      <span className="text-[10px] text-green-600 font-medium px-2 py-0.5 bg-green-50 rounded-full">All clear</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {isLoadingStats ? "..." : (dashboardStats?.schools_with_denials || 0)}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Schools with Denials</div>
                </div>
                
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <span className="text-xl">📊</span>
                    </div>
                    {isLoadingStats ? (
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-50 rounded-full">Loading...</span>
                    ) : (
                      <span className="text-[10px] text-indigo-600 font-medium px-2 py-0.5 bg-indigo-50 rounded-full">FY{dashboardYear} · {dashboardStats?.funded_count || 0} funded</span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-slate-900">
                    {isLoadingStats ? "..." : (dashboardStats?.total_applications || 0)}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">FY{dashboardYear} Applications</div>
                  {prevYearStats && !isLoadingStats && (
                    <div className="text-xs text-slate-400 mt-1">
                      {(() => {
                        const delta = (dashboardStats?.total_applications || 0) - (prevYearStats.total_applications || 0);
                        const sign = delta > 0 ? '+' : '';
                        const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-slate-400';
                        return <span className={color}>{sign}{delta} vs FY{dashboardYear - 1}</span>;
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
                    <p className="text-sm text-slate-500">Latest FRN status changes across your portfolio</p>
                  </div>
                  <button onClick={() => setActiveTab("frn-status")} className="text-sm text-purple-600 hover:underline font-medium">View FRNs →</button>
                </div>
                {isLoadingActivity ? (
                  <div className="p-6 text-sm text-slate-400">Loading activity…</div>
                ) : recentActivity.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {recentActivity.map((a) => {
                      const newStatus = (a.new_status || '').toLowerCase();
                      const dot = newStatus.includes('denied') ? 'bg-red-500'
                        : (newStatus.includes('funded') || newStatus.includes('committed')) ? 'bg-green-500'
                        : (newStatus.includes('pending') || newStatus.includes('review')) ? 'bg-yellow-500'
                        : 'bg-slate-400';
                      const statusChanged = !!a.old_status && a.old_status !== a.new_status;
                      return (
                        <div key={a.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`}></span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-900 truncate">
                              <span className="font-medium">{a.entity_name || `BEN ${a.ben || '—'}`}</span>
                              <span className="text-slate-300"> • </span>
                              <span className="font-mono text-xs text-slate-500">FRN {a.frn}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {statusChanged ? (
                                <>Status: {a.old_status} → <span className="font-medium text-slate-800">{a.new_status}</span></>
                              ) : (
                                <>Status: <span className="font-medium text-slate-800">{a.new_status || 'Updated'}</span></>
                              )}
                              {typeof a.new_amount === 'number' && a.new_amount > 0 && (
                                <span className="text-slate-500"> · ${a.new_amount.toLocaleString()}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">{formatActivityTime(a.created_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-xl">🔔</div>
                    <p className="text-sm text-slate-500">No recent status changes yet. FRN updates will appear here as USAC processes your applications.</p>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => setShowAddSchool(true)}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">➕</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Add School</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("funding")}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-green-100 group-hover:bg-green-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">🔍</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Query Data</span>
                  </button>
                  <button className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-center group">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">📤</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Export Report</span>
                  </button>
                  <Link
                    href="/settings/notifications"
                    className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition-all text-center group block"
                  >
                    <div className="w-10 h-10 rounded-lg bg-rose-100 group-hover:bg-rose-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                      <span className="text-xl">🔔</span>
                    </div>
                    <span className="text-sm font-medium text-slate-700">Notifications</span>
                  </Link>
                </div>
              </div>

              {/* Top Schools by Funding */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Top Schools by E-Rate Funding</h2>
                    <p className="text-sm text-slate-500">Your highest-value school relationships</p>
                  </div>
                  <button onClick={() => setActiveTab("schools")} className="text-sm text-purple-600 hover:underline font-medium">View All →</button>
                </div>
                {schools.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {schools.slice(0, 5).map((school, idx) => {
                      const statusColors: Record<string, string> = {
                        'Funded': 'bg-green-100 text-green-700',
                        'Has Denials': 'bg-red-100 text-red-700',
                        'Pending': 'bg-yellow-100 text-yellow-700',
                        'Active': 'bg-green-100 text-green-700',
                      };
                      const statusColor = statusColors[school.status || ''] || 'bg-slate-100 text-slate-600';
                      return (
                        <div key={school.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openSchoolDetail(school)}>
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center font-bold text-purple-600">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 truncate">{school.school_name || school.name || `BEN ${school.ben}`}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-500">{school.state || 'Unknown'}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-500">{school.entity_type || 'School'}</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>{school.status || 'Unknown'}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🏫</div>
                    <h3 className="font-medium text-slate-900 mb-1">No schools yet</h3>
                    <p className="text-sm text-slate-500 mb-4">Add your first school to get started</p>
                    <button onClick={() => setShowAddSchool(true)} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Add School</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "schools" && (
            <div className="space-y-6">
              {/* Search and Filter Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={schoolSearchQuery}
                      onChange={(e) => setSchoolSearchQuery(e.target.value)}
                      placeholder="Search by school name, BEN, state, or city..."
                      className="w-full pl-12 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {schoolSearchQuery && (
                      <button
                        onClick={() => setSchoolSearchQuery("")}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Status Filter Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-slate-700 min-w-[180px]"
                  >
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Filter Status Message */}
                {(schoolSearchQuery || statusFilter !== "all") && (
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                      Showing {filteredSchools.length} of {schools.length} schools
                      {statusFilter !== "all" && ` • Filtered by: ${statusOptions.find(o => o.value === statusFilter)?.label}`}
                    </p>
                    {(schoolSearchQuery || statusFilter !== "all") && (
                      <button
                        onClick={() => { setSchoolSearchQuery(""); setStatusFilter("all"); }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Bar */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={refreshSchoolsWithUsac}
                    disabled={isRefreshingSchools}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <svg className={`w-5 h-5 ${isRefreshingSchools ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">
                      {isRefreshingSchools ? 'Syncing...' : 'Sync from USAC'}
                    </span>
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">CSV Template</span>
                  </button>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-sm font-medium text-slate-700">Upload CSV</span>
                  </button>
                  <button onClick={() => setShowAddSchool(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-medium">Add School</span>
                  </button>
                </div>
              </div>

              {/* Schools Table */}
              <TableExportBar
                selectedCount={selectedSchoolBens.size}
                totalCount={filteredSchools.length}
                onExportCsv={handleExportSchools}
                onClearSelection={() => setSelectedSchoolBens(new Set())}
              />
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-2">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-4 w-10">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300"
                          checked={filteredSchools.length > 0 && selectedSchoolBens.size === filteredSchools.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSchoolBens(new Set(filteredSchools.map(s => s.ben)));
                            } else {
                              setSelectedSchoolBens(new Set());
                            }
                          }}
                        />
                      </th>
                      <th 
                        className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => toggleSchoolsTableSort('school_name')}
                      >
                        <span className="flex items-center gap-1">
                          School
                          {schoolsTableSort?.field === 'school_name' && (
                            <span className="text-blue-600">{schoolsTableSort.dir === 'asc' ? '↑' : '↓'}</span>
                          )}
                          {schoolsTableSort?.field !== 'school_name' && (
                            <span className="text-slate-300">↕</span>
                          )}
                        </span>
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-24">BEN</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-28 relative">
                        <button
                          type="button"
                          onClick={() => setOpenSchoolColMenu(openSchoolColMenu === 'state' ? null : 'state')}
                          className="flex items-center gap-1 uppercase text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          State
                          {schoolsTableSort?.field === 'state' && (
                            <span className="text-blue-600">{schoolsTableSort.dir === 'asc' ? '↑' : '↓'}</span>
                          )}
                          {schoolColStateFilter.size > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] leading-none">
                              {schoolColStateFilter.size}
                            </span>
                          )}
                          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSchoolColMenu === 'state' && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenSchoolColMenu(null)} />
                            <div className="absolute left-0 mt-2 z-50 w-56 bg-white border border-slate-200 rounded-lg shadow-xl p-2 normal-case">
                              <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-100 mb-2">
                                <button onClick={() => { toggleSchoolsTableSort('state'); }} className="text-xs font-medium text-slate-700 hover:bg-slate-50 px-2 py-1 rounded flex-1 text-left">
                                  Sort {schoolsTableSort?.field === 'state' && schoolsTableSort.dir === 'asc' ? 'Z → A' : 'A → Z'}
                                </button>
                                <button onClick={() => setSchoolColStateFilter(new Set())} className="text-xs text-indigo-600 hover:underline px-2 py-1" disabled={schoolColStateFilter.size === 0}>
                                  Clear
                                </button>
                              </div>
                              <div className="max-h-56 overflow-y-auto">
                                {uniqueSchoolStates.length === 0 && (
                                  <div className="text-xs text-slate-400 px-2 py-1">No states</div>
                                )}
                                {uniqueSchoolStates.map(st => (
                                  <label key={st} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      className="w-3.5 h-3.5 rounded border-slate-300"
                                      checked={schoolColStateFilter.has(st)}
                                      onChange={() => toggleSetValue(setSchoolColStateFilter, st)}
                                    />
                                    <span>{st}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase w-40 relative">
                        <button
                          type="button"
                          onClick={() => setOpenSchoolColMenu(openSchoolColMenu === 'status' ? null : 'status')}
                          className="flex items-center gap-1 uppercase text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Status
                          {schoolsTableSort?.field === 'status' && (
                            <span className="text-blue-600">{schoolsTableSort.dir === 'asc' ? '↑' : '↓'}</span>
                          )}
                          {schoolColStatusFilter.size > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] leading-none">
                              {schoolColStatusFilter.size}
                            </span>
                          )}
                          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSchoolColMenu === 'status' && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenSchoolColMenu(null)} />
                            <div className="absolute left-0 mt-2 z-50 w-60 bg-white border border-slate-200 rounded-lg shadow-xl p-2 normal-case">
                              <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-100 mb-2">
                                <button onClick={() => { toggleSchoolsTableSort('status'); }} className="text-xs font-medium text-slate-700 hover:bg-slate-50 px-2 py-1 rounded flex-1 text-left">
                                  Sort {schoolsTableSort?.field === 'status' && schoolsTableSort.dir === 'asc' ? 'Z → A' : 'A → Z'}
                                </button>
                                <button onClick={() => setSchoolColStatusFilter(new Set())} className="text-xs text-indigo-600 hover:underline px-2 py-1" disabled={schoolColStatusFilter.size === 0}>
                                  Clear
                                </button>
                              </div>
                              <div className="max-h-56 overflow-y-auto">
                                {uniqueSchoolStatuses.length === 0 && (
                                  <div className="text-xs text-slate-400 px-2 py-1">No statuses</div>
                                )}
                                {uniqueSchoolStatuses.map(st => (
                                  <label key={st} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      className="w-3.5 h-3.5 rounded border-slate-300"
                                      checked={schoolColStatusFilter.has(st)}
                                      onChange={() => toggleSetValue(setSchoolColStatusFilter, st)}
                                    />
                                    <span>{st}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSchools.map((school) => {
                      const statusColors: Record<string, string> = {
                        'Funded': 'bg-green-100 text-green-700',
                        'Has Denials': 'bg-red-100 text-red-700',
                        'Pending': 'bg-yellow-100 text-yellow-700',
                        'green': 'bg-green-100 text-green-700',
                        'red': 'bg-red-100 text-red-700',
                        'yellow': 'bg-yellow-100 text-yellow-700',
                      };
                      const statusColor = statusColors[school.status_color || school.status || ''] || 'bg-slate-100 text-slate-600';
                      
                      return (
                        <tr key={school.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openSchoolDetail(school)}>
                          <td className="px-3 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300"
                              checked={selectedSchoolBens.has(school.ben)}
                              onChange={() => {
                                setSelectedSchoolBens(prev => {
                                  const next = new Set(prev);
                                  if (next.has(school.ben)) next.delete(school.ben);
                                  else next.add(school.ben);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">🏫</div>
                              <div>
                                <div className="font-medium text-slate-900">{school.school_name || school.name || `BEN ${school.ben}`}</div>
                                {school.applications_count !== undefined && (
                                  <div className="text-sm text-slate-500">{school.applications_count} applications</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-sm text-slate-600">{school.ben}</td>
                          <td className="px-6 py-4 text-slate-600">{school.state || '-'}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColor}`}>
                              {school.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); openSchoolDetail(school); }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="View Details"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveSchool(school.ben); }}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                title="Remove School"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {schools.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🏫</div>
                    <h3 className="font-medium text-slate-900 mb-1">No schools yet</h3>
                    <p className="text-sm text-slate-500">Add your first school to get started</p>
                  </div>
                )}
                {schools.length > 0 && filteredSchools.length === 0 && (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">🔍</div>
                    <h3 className="font-medium text-slate-900 mb-1">No matching schools</h3>
                    <p className="text-sm text-slate-500">
                      {statusFilter !== "all" 
                        ? `No schools found with status "${statusOptions.find(o => o.value === statusFilter)?.label}"` 
                        : "Try a different search term or filter"}
                    </p>
                    <button 
                      onClick={() => { setSchoolSearchQuery(''); setStatusFilter('all'); }}
                      className="mt-4 px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "funding" && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 rounded-2xl p-6 text-white shadow-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold">Funding Overview</h1>
                      <p className="text-indigo-100 mt-1">Portfolio funding summary across all your schools</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={fundingYear || ""}
                      onChange={(e) => {
                        const year = e.target.value ? parseInt(e.target.value) : undefined;
                        setFundingYear(year);
                        loadFundingSummary(year);
                      }}
                      className="px-3 py-2 bg-white/20 border border-white/30 rounded-xl text-white text-sm [&>option]:text-slate-900"
                    >
                      <option value="">All Years</option>
                      {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => loadFundingSummary(fundingYear, true)}
                      disabled={fundingSummaryLoading}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {fundingSummaryLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Summary Stats in Header */}
                {fundingSummary && (
                  <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/20">
                    <div>
                      <div className="text-3xl font-bold">{fundingSummary.total_frns}</div>
                      <div className="text-sm text-indigo-200 mt-1">Total FRNs</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{formatAmount(fundingSummary.summary?.funded?.amount || 0)}</div>
                      <div className="text-sm text-indigo-200 mt-1">Funded</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{formatAmount(fundingSummary.summary?.pending?.amount || 0)}</div>
                      <div className="text-sm text-indigo-200 mt-1">Pending</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">{formatAmount(fundingSummary.summary?.denied?.amount || 0)}</div>
                      <div className="text-sm text-indigo-200 mt-1">Denied</div>
                    </div>
                  </div>
                )}
                {fundingSummaryLoading && !fundingSummary && (
                  <div className="mt-6 pt-6 border-t border-white/20 text-center">
                    <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-sm text-indigo-200">Loading funding data from USAC...</p>
                  </div>
                )}
              </div>

              {/* Funding Summary Cards */}
              {fundingSummary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <span className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-50 rounded-full">
                        {fundingSummary.total_schools} schools
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">{fundingSummary.total_frns}</div>
                    <div className="text-sm text-slate-500 mt-1">Total FRNs</div>
                  </div>

                  <div className="bg-white rounded-2xl border border-green-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">
                        {fundingSummary.summary?.funded?.count || 0} FRNs
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-green-700">{formatAmount(fundingSummary.summary?.funded?.amount || 0)}</div>
                    <div className="text-sm text-green-600 mt-1">Funded</div>
                  </div>

                  <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-full">
                        {fundingSummary.summary?.pending?.count || 0} FRNs
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-amber-700">{formatAmount(fundingSummary.summary?.pending?.amount || 0)}</div>
                    <div className="text-sm text-amber-600 mt-1">Pending</div>
                  </div>

                  <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded-full">
                        {fundingSummary.summary?.denied?.count || 0} FRNs
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-red-700">{formatAmount(fundingSummary.summary?.denied?.amount || 0)}</div>
                    <div className="text-sm text-red-600 mt-1">Denied</div>
                  </div>
                </div>
              )}

              {/* Per-School Funding Table */}
              {fundingSummary?.schools && fundingSummary.schools.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900">School Funding Breakdown</h3>
                    <p className="text-sm text-slate-500 mt-1">Funding data per school in your portfolio</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleFundingSchoolSort('school_name')}>
                            School {fundingSchoolSort.field === 'school_name' && (fundingSchoolSort.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleFundingSchoolSort('ben')}>
                            BEN {fundingSchoolSort.field === 'ben' && (fundingSchoolSort.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleFundingSchoolSort('state')}>
                            State {fundingSchoolSort.field === 'state' && (fundingSchoolSort.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleFundingSchoolSort('total_funding_committed')}>
                            Committed {fundingSchoolSort.field === 'total_funding_committed' && (fundingSchoolSort.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleFundingSchoolSort('total_funding_requested')}>
                            Requested {fundingSchoolSort.field === 'total_funding_requested' && (fundingSchoolSort.dir === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Funding Years</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedFundingSchools.map((school: any) => (
                          <tr key={school.ben} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{school.school_name || school.name || 'Unknown'}</div>
                              {school.entity_type && (
                                <span className="text-xs text-slate-400">{school.entity_type}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{school.ben}</td>
                            <td className="px-4 py-3 text-slate-600">{school.state || '-'}</td>
                            <td className="px-4 py-3 text-right font-medium text-green-700">
                              {school.total_funding_committed ? formatAmount(school.total_funding_committed) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {school.total_funding_requested ? formatAmount(school.total_funding_requested) : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {school.funding_years && school.funding_years.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {school.funding_years.slice(0, 3).map((y: number) => (
                                    <span key={y} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">{y}</span>
                                  ))}
                                  {school.funding_years.length > 3 && (
                                    <span className="text-xs text-slate-400">+{school.funding_years.length - 3}</span>
                                  )}
                                </div>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => {
                                  setActiveTab("frn-status");
                                  loadPortfolioFRNStatus(undefined, undefined, undefined, false);
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                View FRNs
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {schools.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      <p>No schools in your portfolio yet.</p>
                      <button onClick={() => setActiveTab("schools")} className="text-indigo-600 hover:underline mt-2 text-sm">
                        Add schools to get started
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Dashboard Quick Stats from dashboardStats */}
              {dashboardStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
                    <div className="text-sm text-blue-600 mb-1">Category 1 Funding</div>
                    <div className="text-2xl font-bold text-blue-900">{formatAmount(dashboardStats.total_c1_funding)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200 p-6">
                    <div className="text-sm text-purple-600 mb-1">Category 2 Funding</div>
                    <div className="text-2xl font-bold text-purple-900">{formatAmount(dashboardStats.total_c2_funding)}</div>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
                    <div className="text-sm text-emerald-600 mb-1">Total Portfolio Funding</div>
                    <div className="text-2xl font-bold text-emerald-900">{formatAmount(dashboardStats.total_funding)}</div>
                  </div>
                </div>
              )}

              {/* AI-Powered Search Section */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900">AI-Powered Funding Search</h3>
                  <p className="text-sm text-slate-500">Query E-Rate funding data using natural language</p>
                </div>
                <form onSubmit={handleQuery} className="mb-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Ask anything about E-Rate funding..." 
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-24" 
                    />
                    <button 
                      type="submit"
                      disabled={isQuerying}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {isQuerying ? "..." : "Search"}
                    </button>
                  </div>
                </form>

                {queryHistory.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-500">Recent Queries</span>
                      <button onClick={clearQueryHistory} className="text-xs text-slate-400 hover:text-red-500">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {queryHistory.slice(0, 6).map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => loadQueryFromHistory(item.query)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-700 rounded-lg text-xs transition-colors truncate max-w-xs"
                          title={item.query}
                        >
                          {item.query}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {queryError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {queryError}
                </div>
              )}
              
              {queryResults && (
                <div>
                  {queryResults.summary && (
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 mb-4">
                      <h3 className="font-semibold text-slate-900 mb-2">Summary</h3>
                      <p className="text-slate-700">{queryResults.summary}</p>
                    </div>
                  )}
                  
                  {queryResults.data && queryResults.data.length > 0 && (
                    <SearchResultsTable
                      data={queryResults.data}
                      onAddSchool={handleAddSchoolFromSearch}
                      existingBens={existingBens}
                      showAddButton={true}
                      totalCount={queryResults.count}
                    />
                  )}
                  
                  {queryResults.count !== undefined && (
                    <div className="mt-4 text-center text-sm text-slate-500">
                      Showing {queryResults.data?.length?.toLocaleString() || 0} records loaded
                    </div>
                  )}

                  {queryHasMore && (
                    <div className="mt-4 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isLoadingMore ? "Loading more..." : "Load Next 100"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Empty state when no schools and no summary */}
              {schools.length === 0 && !fundingSummary && !fundingSummaryLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No Schools in Portfolio</h3>
                  <p className="text-slate-500 mb-4">Add schools to your portfolio to see funding data</p>
                  <button
                    onClick={() => setActiveTab("schools")}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium"
                  >
                    Add Schools
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "appeals" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Appeals Management</h2>
                  <p className="text-slate-500">Generate, refine, and manage E-Rate appeals with AI assistance</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedDeniedApp(null);
                    setNewAppealFrn("");
                    setNewAppealContext("");
                    setShowNewAppealModal(true);
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl shadow-lg shadow-amber-200 hover:shadow-xl transition-all flex items-center gap-2 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Appeal
                </button>
              </div>

              {/* Denied Applications Section */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">Denied Applications</h3>
                        <p className="text-sm text-slate-500">FRNs from your schools that need appeals</p>
                      </div>
                    </div>
                    {deniedStats && (
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">{deniedStats.total} denied</p>
                        <p className="text-sm text-slate-500">${deniedStats.amount.toLocaleString()} at risk</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-6">
                  {isLoadingDenied ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-500">Loading denied applications...</p>
                    </div>
                  ) : deniedApplications.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">No denied applications</h4>
                      <p className="text-sm text-slate-500">All your schools&apos; funding requests are in good standing!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <TableExportBar
                        selectedCount={selectedDeniedFrns.size}
                        totalCount={deniedApplications.filter(app => !app.has_appeal).length}
                        onExportCsv={handleExportDeniedApps}
                        onClearSelection={() => setSelectedDeniedFrns(new Set())}
                      />
                      {deniedApplications.filter(app => !app.has_appeal).map((app) => {
                        // Urgency badge colors
                        const urgencyStyles = {
                          CRITICAL: 'bg-red-100 text-red-700 border-red-200',
                          HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
                          MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                          LOW: 'bg-green-100 text-green-700 border-green-200',
                          EXPIRED: 'bg-gray-100 text-gray-700 border-gray-200'
                        };
                        
                        return (
                        <div 
                          key={app.frn}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-white border border-red-100 rounded-xl hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 flex-shrink-0"
                              checked={selectedDeniedFrns.has(app.frn)}
                              onChange={() => {
                                setSelectedDeniedFrns(prev => {
                                  const next = new Set(prev);
                                  if (next.has(app.frn)) next.delete(app.frn);
                                  else next.add(app.frn);
                                  return next;
                                });
                              }}
                            />
                            <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-mono text-sm font-medium text-slate-700">FRN: {app.frn}</span>
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                Denied
                              </span>
                              <span className="text-xs text-slate-500">{app.funding_year}</span>
                              {app.urgency && (
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium border ${urgencyStyles[app.urgency as keyof typeof urgencyStyles] || urgencyStyles.LOW}`}>
                                  {app.urgency}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-900 font-medium">{app.school_name}</p>
                            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                              <span>{app.service_type}</span>
                              <span>•</span>
                              <span className="text-red-600 font-medium">${app.amount_requested.toLocaleString()}</span>
                            </div>
                            
                            {/* Appeal deadline info */}
                            {app.fcdl_date && (
                              <div className="flex items-center gap-4 mt-2 text-xs">
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-slate-500">FCDL: {new Date(app.fcdl_date).toLocaleDateString()}</span>
                                </div>
                                <span>•</span>
                                <div className="flex items-center gap-1">
                                  <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {app.is_expired ? (
                                    <span className="text-gray-600 font-medium">Expired - FCC Appeal Only</span>
                                  ) : (
                                    <span className={`font-medium ${
                                      (app.days_remaining ?? 0) <= 7 ? 'text-red-600' :
                                      (app.days_remaining ?? 0) <= 14 ? 'text-orange-600' :
                                      (app.days_remaining ?? 0) <= 30 ? 'text-yellow-600' :
                                      'text-green-600'
                                    }`}>
                                      {app.days_remaining} days left to appeal to USAC
                                    </span>
                                  )}
                                </div>
                                {app.appeal_deadline && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-500">Deadline: {new Date(app.appeal_deadline).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            )}
                            
                            {app.denial_reason && (
                              <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">
                                {app.denial_reason.slice(0, 150)}{app.denial_reason.length > 150 ? '...' : ''}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedDeniedApp({
                                frn: app.frn,
                                school_name: app.school_name,
                                funding_year: app.funding_year,
                                service_type: app.service_type,
                                amount_requested: app.amount_requested,
                                denial_reason: app.denial_reason
                              });
                              setNewAppealFrn(app.frn);
                              setNewAppealContext(`School: ${app.school_name}\nAmount: $${app.amount_requested.toLocaleString()}\nService: ${app.service_type}\nDenial Reason: ${app.denial_reason || 'Not specified'}`);
                              setShowNewAppealModal(true);
                            }}
                            disabled={generatingAppeal === app.frn}
                            className="ml-4 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            {generatingAppeal === app.frn ? (
                              <>
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                                Generating...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Generate Appeal
                              </>
                            )}
                          </button>
                          </div>
                        </div>
                      )})}
                      
                      {/* Show count of applications that already have appeals */}
                      {deniedApplications.filter(app => app.has_appeal).length > 0 && (
                        <div className="text-center pt-2 text-sm text-slate-500">
                          {deniedApplications.filter(app => app.has_appeal).length} denied application(s) already have appeals (shown below)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Your Appeals Section */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Your Appeals</h3>
                      <p className="text-sm text-slate-500">Generated appeal letters you can refine and download</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {isLoadingAppeals ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-500">Loading appeals...</p>
                    </div>
                  ) : appeals.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">📄</span>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">No appeals generated yet</h4>
                      <p className="text-sm text-slate-500">Generate an appeal from an application above, or create one manually</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {appeals.map((appeal) => (
                        <div 
                          key={appeal.id} 
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-white border border-amber-100 rounded-xl hover:shadow-md transition-all cursor-pointer"
                          onClick={() => {
                            setSelectedAppeal(appeal);
                            setShowAppealChat(true);
                          }}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="font-mono text-sm font-medium text-slate-700">FRN: {appeal.frn}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                appeal.status === "finalized" 
                                  ? "bg-green-100 text-green-700" 
                                  : appeal.status === "submitted"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {appeal.status}
                              </span>
                            </div>
                            <p className="text-sm text-slate-900">{appeal.organization_name || "Unknown Organization"}</p>
                            {appeal.denial_reason && (
                              <p className="text-xs text-red-600 mt-1">
                                Denial: {appeal.denial_reason.slice(0, 80)}{appeal.denial_reason.length > 80 ? '...' : ''}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span>Updated: {new Date(appeal.updated_at).toLocaleDateString()}</span>
                              {appeal.chat_history && appeal.chat_history.length > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    {appeal.chat_history.length} messages
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAppeal(appeal);
                                setShowAppealChat(true);
                              }}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Open & Chat"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAppeal(appeal.id);
                              }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FRN Status Monitoring Tab */}
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
                      <h1 className="text-2xl font-bold">Portfolio FRN Status</h1>
                      <p className="text-teal-100 mt-1">Track FRN status across all your schools</p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-teal-100">
                    {portfolioFrnLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Syncing...
                      </span>
                    ) : (
                      <span>
                        {portfolioFrnData?.last_refreshed ? (
                          <>Last synced {(() => {
                            const diff = Math.round((Date.now() - new Date(portfolioFrnData.last_refreshed).getTime()) / 60000);
                            if (diff < 1) return "just now";
                            if (diff < 60) return `${diff} min ago`;
                            if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
                            return `${Math.round(diff / 1440)}d ago`;
                          })()}</>
                        ) : "Not yet synced"}
                        {" — "}
                        <button
                          onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason, true)}
                          className="underline hover:text-white transition-colors"
                        >
                          Resync now
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Funding Year</label>
                    <select
                      value={portfolioFrnYear || ""}
                      onChange={(e) => {
                        const year = e.target.value ? parseInt(e.target.value) : undefined;
                        setPortfolioFrnYear(year);
                        loadPortfolioFRNStatus(year, portfolioFrnStatusFilter, portfolioFrnPendingReason);
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
                      value={portfolioFrnStatusFilter}
                      onChange={(e) => {
                        setPortfolioFrnStatusFilter(e.target.value);
                        loadPortfolioFRNStatus(portfolioFrnYear, e.target.value, portfolioFrnPendingReason);
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
                    <label className="text-sm text-slate-600 mb-1 block">Pending Reason</label>
                    <input
                      type="text"
                      value={portfolioFrnPendingReason}
                      onChange={(e) => setPortfolioFrnPendingReason(e.target.value)}
                      placeholder="e.g., PIA Review"
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-48"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Search FRN / Entity / BEN</label>
                    <input
                      type="text"
                      value={portfolioFrnSearch}
                      onChange={(e) => setPortfolioFrnSearch(e.target.value)}
                      placeholder="e.g., 2699061470"
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Search by SPIN</label>
                    <input
                      type="text"
                      value={portfolioFrnSpinSearch}
                      onChange={(e) => setPortfolioFrnSpinSearch(e.target.value)}
                      placeholder="SPIN # or provider name"
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 mb-1 block">Search by CRN</label>
                    <input
                      type="text"
                      value={portfolioFrnCrnSearch}
                      onChange={(e) => setPortfolioFrnCrnSearch(e.target.value)}
                      placeholder="Contract # (partial OK)"
                      className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm w-56"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const searchTerm = portfolioFrnSearch.trim();
                      const spinTerm = portfolioFrnSpinSearch.trim();
                      const crnTerm = portfolioFrnCrnSearch.trim();
                      // Detect a BEN-like search (all digits, 5-10 chars)
                      const looksLikeBen = /^\d{5,10}$/.test(searchTerm);
                      const benAlreadyLoaded = looksLikeBen && portfolioFrnData?.schools?.some((s: any) => String(s.ben) === searchTerm);
                      if (looksLikeBen && !benAlreadyLoaded) {
                        // Pass ben to backend — super/admin will get results, others get upsell
                        loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason, undefined, searchTerm, undefined, spinTerm, crnTerm);
                      } else {
                        // Pass search term to backend for server-side filtering (fixes BEN search)
                        loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason, undefined, undefined, searchTerm, spinTerm, crnTerm);
                      }
                    }}
                    disabled={portfolioFrnLoading}
                    className="mt-5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    {portfolioFrnLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span>🔍</span>
                    )}
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* Needs-refresh banner — backend has no local FRN rows for this
                  portfolio yet. User must click Refresh Data. */}
              {portfolioFrnData?.needs_refresh && (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                  <div className="text-3xl flex-shrink-0">📥</div>
                  <div className="flex-1">
                    <div className="font-semibold text-sky-900">Portfolio FRNs not loaded yet</div>
                    <div className="text-sm text-sky-800 mt-1">
                      {portfolioFrnData.message || "Your portfolio FRN data hasn't been imported yet. Click 'Refresh Data' above to load it."}
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards — Clickable to filter (hidden when portfolio is empty,
                  so zero values aren't misread as real results) */}
              {portfolioFrnData && !portfolioFrnData.needs_refresh && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter(""); loadPortfolioFRNStatus(portfolioFrnYear, "", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "" ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-200"
                    }`}
                  >
                    <div className="text-sm text-slate-600 mb-1">Total FRNs</div>
                    <div className="text-3xl font-bold text-slate-900">{portfolioFrnData.total_frns}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {portfolioFrnData.not_filed_schools?.length > 0 && portfolioFrnData.portfolio_total_schools
                        ? `${portfolioFrnData.schools_filed ?? portfolioFrnData.total_schools} of ${portfolioFrnData.portfolio_total_schools} schools filed in FY${portfolioFrnData.year_filter} \u00b7 ${portfolioFrnData.not_filed_summary?.lapsed || 0} lapsed \u00b7 ${portfolioFrnData.not_filed_summary?.inactive || 0} inactive`
                        : `Across ${portfolioFrnData.total_schools} schools`
                      }
                    </div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Funded"); loadPortfolioFRNStatus(portfolioFrnYear, "Funded", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Funded" ? "border-green-500 ring-2 ring-green-200" : "border-green-200"
                    }`}
                  >
                    <div className="text-sm text-green-600 mb-1">Funded</div>
                    <div className="text-3xl font-bold text-green-700">{portfolioFrnData.summary?.funded?.count || 0}</div>
                    <div className="text-xs text-green-600 mt-1" title={`$${(portfolioFrnData.summary?.funded?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.funded?.amount || 0)}
                    </div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Pending"); loadPortfolioFRNStatus(portfolioFrnYear, "Pending", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Pending" ? "border-amber-500 ring-2 ring-amber-200" : "border-amber-200"
                    }`}
                  >
                    <div className="text-sm text-amber-600 mb-1">Pending</div>
                    <div className="text-3xl font-bold text-amber-700">{portfolioFrnData.summary?.pending?.count || 0}</div>
                    <div className="text-xs text-amber-600 mt-1" title={`$${(portfolioFrnData.summary?.pending?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.pending?.amount || 0)}
                    </div>
                  </button>
                  <button
                    onClick={() => { setPortfolioFrnStatusFilter("Denied"); loadPortfolioFRNStatus(portfolioFrnYear, "Denied", portfolioFrnPendingReason); }}
                    className={`bg-white rounded-2xl border p-6 shadow-sm text-left transition-all hover:shadow-md ${
                      portfolioFrnStatusFilter === "Denied" ? "border-red-500 ring-2 ring-red-200" : "border-red-200"
                    }`}
                  >
                    <div className="text-sm text-red-600 mb-1">Denied</div>
                    <div className="text-3xl font-bold text-red-700">{portfolioFrnData.summary?.denied?.count || 0}</div>
                    <div className="text-xs text-red-600 mt-1" title={`$${(portfolioFrnData.summary?.denied?.amount || 0).toLocaleString()}`}>
                      {formatAmount(portfolioFrnData.summary?.denied?.amount || 0)}
                    </div>
                  </button>
                </div>
              )}

              {/* FRN Table — Same structure as vendor page */}
              {sortedFlattenedFrns.length > 0 && (
                <>
                <TableExportBar
                  selectedCount={selectedPortfolioFrns.size}
                  totalCount={sortedFlattenedFrns.length}
                  onExportCsv={handleExportPortfolioFrns}
                  onClearSelection={() => setSelectedPortfolioFrns(new Set())}
                />
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-2">
                  <div className="p-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900">FRN Details</h3>
                    <p className="text-sm text-slate-600">Detailed status for each funding request across your portfolio</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-3 w-10">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300"
                              checked={sortedFlattenedFrns.length > 0 && selectedPortfolioFrns.size === Math.min(visibleFrnCount, sortedFlattenedFrns.length)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPortfolioFrns(new Set(sortedFlattenedFrns.slice(0, visibleFrnCount).map(f => f.frn)));
                                } else {
                                  setSelectedPortfolioFrns(new Set());
                                }
                              }}
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
                        {sortedFlattenedFrns.slice(0, visibleFrnCount).map((frn, idx) => (
                          <tr 
                            key={`${frn.frn}-${idx}`} 
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => { setSelectedFRN(frn); setShowFRNDetailModal(true); }}
                          >
                            <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300"
                                checked={selectedPortfolioFrns.has(frn.frn)}
                                onChange={() => {
                                  setSelectedPortfolioFrns(prev => {
                                    const next = new Set(prev);
                                    if (next.has(frn.frn)) next.delete(frn.frn);
                                    else next.add(frn.frn);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-mono text-xs text-slate-900">{frn.frn}</div>
                              <div className="text-xs text-slate-500">{frn.application_number}</div>
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
                              {frn.pending_reason && (
                                <div className="text-xs text-slate-500 mt-1">{frn.pending_reason}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              ${frn.commitment_amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                    {sortedFlattenedFrns.length > 0 && (
                      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="text-sm text-slate-600">
                          Showing <span className="font-medium text-slate-900">{Math.min(visibleFrnCount, sortedFlattenedFrns.length)}</span> of <span className="font-medium text-slate-900">{sortedFlattenedFrns.length}</span> FRNs
                          {portfolioFrnStatusFilter && <span className="text-slate-500"> (filtered from {flattenedFrns.length} total)</span>}
                        </div>
                        {visibleFrnCount < sortedFlattenedFrns.length && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-slate-500 mr-1">Load more:</span>
                            <button
                              type="button"
                              onClick={() => setVisibleFrnCount(c => Math.min(c + 25, sortedFlattenedFrns.length))}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              +25
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibleFrnCount(c => Math.min(c + 50, sortedFlattenedFrns.length))}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              +50
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibleFrnCount(c => Math.min(c + 100, sortedFlattenedFrns.length))}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              +100
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibleFrnCount(sortedFlattenedFrns.length)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                            >
                              View all ({sortedFlattenedFrns.length})
                            </button>
                          </div>
                        )}
                        {visibleFrnCount >= sortedFlattenedFrns.length && sortedFlattenedFrns.length > 25 && (
                          <button
                            type="button"
                            onClick={() => setVisibleFrnCount(25)}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors self-start sm:self-auto"
                          >
                            Collapse to 25
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                </>
              )}

              {/* Did Not File section — collapsible */}
              {portfolioFrnData?.not_filed_schools?.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                  <button
                    type="button"
                    onClick={() => setNotFiledExpanded(!notFiledExpanded)}
                    className="w-full flex items-center justify-between p-4 border-b border-slate-200 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Did Not File ({portfolioFrnData.not_filed_schools.length})
                      </h3>
                      <p className="text-sm text-slate-600">
                        {portfolioFrnData.not_filed_summary?.lapsed || 0} lapsed &middot; {portfolioFrnData.not_filed_summary?.inactive || 0} inactive
                      </p>
                    </div>
                    <span className="text-slate-400 text-lg">{notFiledExpanded ? '▾' : '▸'}</span>
                  </button>
                  {notFiledExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">School</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">BEN</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">State</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Last Active FY</th>
                            <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(portfolioFrnData.not_filed_schools as Array<{ben: string; school_name: string; state: string | null; entity_type: string | null; last_active_year: number | null; status: string}>).map((school) => (
                            <tr key={school.ben} className="hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{school.school_name}</div>
                                {school.entity_type && <div className="text-xs text-slate-500">{school.entity_type}</div>}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-700">{school.ben}</td>
                              <td className="px-4 py-3 text-slate-600">{school.state || '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{school.last_active_year ? `FY${school.last_active_year}` : 'Never'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  school.status === 'lapsed' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {school.status === 'lapsed' ? 'Lapsed' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Initial Load State */}
              {!portfolioFrnLoading && !portfolioFrnData && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📈</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Load FRN Status</h3>
                  <p className="text-sm text-slate-600 mt-2 mb-4">
                    Click the button below to load FRN data across your portfolio
                  </p>
                  <button
                    onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason)}
                    disabled={portfolioFrnLoading}
                    className="px-6 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium"
                  >
                    Load Data
                  </button>
                </div>
              )}

              {/* Loading State */}
              {portfolioFrnLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                  <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-slate-500">
                    Loading FRN status across your portfolio...
                  </p>
                </div>
              )}

              {/* Error State */}
              {portfolioFrnError && !portfolioFrnLoading && (
                <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
                  <span className="text-3xl mb-3 block">&#9888;&#65039;</span>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">FRN Data Unavailable</h3>
                  <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto">{portfolioFrnError}</p>
                  <button
                    onClick={() => loadPortfolioFRNStatus(portfolioFrnYear, portfolioFrnStatusFilter, portfolioFrnPendingReason)}
                    className="px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium inline-flex items-center gap-2"
                  >
                    <span>&#x1F504;</span>
                    Retry
                  </button>
                </div>
              )}

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
                          include_funded: formData.get('include_funded') === 'on',
                          include_pending: formData.get('include_pending') === 'on',
                          include_denied: formData.get('include_denied') === 'on',
                          include_changes: formData.get('include_changes') === 'on',
                          delivery_mode: (formData.get('delivery_mode') as any) || 'full_email',
                          notify_sms: formData.get('notify_sms') === 'on',
                          sms_phone: (formData.get('sms_phone') as string) || undefined,
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
                        <input
                          name="name"
                          required
                          placeholder="e.g., Weekly Portfolio Report"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipient Email</label>
                        <input
                          name="recipient_email"
                          type="email"
                          required
                          placeholder="you@example.com"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Watch Type</label>
                        <select
                          name="watch_type"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        >
                          <option value="portfolio">Entire Portfolio</option>
                          <option value="ben">Specific BEN</option>
                          <option value="frn">Specific FRN</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
                        <select
                          name="frequency"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="daily">Daily</option>
                          <option value="biweekly">Bi-Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BEN or FRN (if applicable)</label>
                        <input
                          name="target_id"
                          placeholder="e.g., 123456"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Mode</label>
                        <select
                          name="delivery_mode"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        >
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
                      <input
                        name="sms_phone"
                        type="tel"
                        placeholder="Phone (optional, uses profile)"
                        className="flex-1 max-w-[220px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
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
                      <button
                        type="button"
                        onClick={() => setShowCreateWatch(false)}
                        className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={watchLoading}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {watchLoading ? 'Creating...' : 'Create Monitor'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Watch List */}
                {frnWatches.length > 0 ? (
                  <div className="space-y-3">
                    {frnWatches.map((watch) => (
                      <div
                        key={watch.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          watch.is_active
                            ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{watch.name}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              watch.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {watch.is_active ? 'Active' : 'Paused'}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                              {watch.frequency}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                              {watch.watch_type}
                            </span>
                            {watch.delivery_mode && watch.delivery_mode !== 'full_email' && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                watch.delivery_mode === 'notification_only' 
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {watch.delivery_mode === 'notification_only' ? 'notify only' : 'in-app only'}
                              </span>
                            )}
                            {watch.notify_sms && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                SMS
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>To: {watch.recipient_email}</span>
                            {watch.send_count > 0 && <span>Sent: {watch.send_count}x</span>}
                            {watch.next_send_at && (
                              <span>Next: {new Date(watch.next_send_at).toLocaleDateString()}</span>
                            )}
                            {watch.last_error && <span className="text-red-500">Error: {watch.last_error}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={async () => {
                              try {
                                await api.sendFRNWatchNow(watch.id);
                                loadFRNWatches();
                              } catch (e) { console.error(e); }
                            }}
                            className="p-1.5 text-gray-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 rounded-lg transition-colors"
                            title="Send report now"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/></svg>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await api.toggleFRNWatch(watch.id);
                                loadFRNWatches();
                              } catch (e) { console.error(e); }
                            }}
                            className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
                            title={watch.is_active ? 'Pause' : 'Resume'}
                          >
                            {watch.is_active ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
                            )}
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Delete this monitor?')) {
                                try {
                                  await api.deleteFRNWatch(watch.id);
                                  loadFRNWatches();
                                } catch (e) { console.error(e); }
                              }
                            }}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete"
                          >
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

              {/* Report History */}
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
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">
                                {report.changes_detected} changes
                              </span>
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
                          <button
                            onClick={async () => {
                              try {
                                const res = await api.getFRNReport(report.id);
                                if (res?.data?.html) {
                                  setSelectedReport({ html: res.data.html, name: report.report_name });
                                }
                              } catch (e) { console.error(e); }
                            }}
                            className="ml-3 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded-lg transition-colors"
                          >
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
                        <div
                          key={report.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{report.report_name}</span>
                              {report.changes_detected > 0 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">
                                  {report.changes_detected} changes
                                </span>
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
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.getFRNReport(report.id);
                                  if (res?.data?.html) {
                                    setSelectedReport({ html: res.data.html, name: report.report_name });
                                  }
                                } catch (e) { console.error(e); }
                              }}
                              className="ml-3 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 rounded-lg transition-colors"
                            >
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
                      <button
                        onClick={() => setSelectedReport(null)}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto p-1">
                      <iframe
                        srcDoc={selectedReport.html.replace(/<head>/i, '<head><base target="_blank">')}
                        className="w-full h-full min-h-[600px] border-0 rounded-lg"
                        title="FRN Report"
                        sandbox="allow-same-origin allow-popups"
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {activeTab === "settings" && !isSeat && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile Settings</h2>
                
                {/* Multi-CRN Management Section */}
                <div className="mb-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-indigo-800">CRN Management</h3>
                      <p className="text-xs text-indigo-600 mt-0.5">Manage your USAC Consultant Registration Numbers</p>
                    </div>
                    <button
                      onClick={() => { setShowAddCrnModal(true); setNewCrnInput(""); setAddCrnError(null); }}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium flex items-center gap-1.5 transition"
                    >
                      <span className="text-sm">+</span> Add CRN
                    </button>
                  </div>
                  
                  {/* CRN List */}
                  {crnList.length === 0 ? (
                    <div className="text-center py-6 bg-white/60 rounded-lg border border-indigo-100/50">
                      <p className="text-sm text-slate-500">No CRNs added yet</p>
                      <p className="text-xs text-slate-400 mt-1">Add your USAC CRN to import schools automatically</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {crnList.map((crn) => (
                        <div key={crn.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-200 transition">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-slate-900">{crn.crn}</span>
                                {crn.is_primary && (
                                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded uppercase">Primary</span>
                                )}
                                {crn.is_verified ? (
                                  <span className="text-green-500 text-xs" title="Verified">✓</span>
                                ) : (
                                  <span className="text-amber-500 text-xs" title="Unverified">⏳</span>
                                )}
                                {!crn.is_free && crn.payment_status === 'active' && (
                                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">Paid</span>
                                )}
                                {!crn.is_free && crn.payment_status === 'pending' && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded">Payment Pending</span>
                                )}
                              </div>
                              <span className="text-xs text-slate-500 mt-0.5">
                                {crn.company_name || 'Company N/A'} · {crn.schools_count} school{crn.schools_count !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResyncCRNSchools(crn.id, crn.crn)}
                              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-white hover:bg-slate-700 border border-slate-200 hover:border-slate-700 rounded-md transition"
                              title="Re-pull every school for this CRN from USAC and import anything missing"
                            >
                              Re-sync schools
                            </button>
                            {(isFreeUser || user?.role === 'admin' || user?.role === 'super') && (
                              <button
                                onClick={() => {
                                  setReplaceCrnTarget({ id: crn.id, crn: crn.crn });
                                  setReplaceCrnInput("");
                                  setReplaceCrnError(null);
                                  setShowReplaceCrnModal(true);
                                }}
                                className="px-2 py-1 text-[11px] font-medium text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-200 hover:border-amber-600 rounded-md transition"
                                title="Replace this CRN with a different one (test/demo accounts only) — swaps the slot in place and re-imports the new CRN's schools"
                              >
                                Replace
                              </button>
                            )}
                            {!crn.is_primary && (
                              <button
                                onClick={() => handleSetPrimaryCRN(crn.id, crn.crn)}
                                className="px-2 py-1 text-[11px] font-medium text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-md transition"
                                title="Make this CRN your primary CRN"
                              >
                                Set as Primary
                              </button>
                            )}
                            {(!crn.is_primary || user?.role === 'admin' || user?.role === 'super' || isFreeUser) && (
                              <button
                                onClick={() => handleRemoveCRN(crn.id, crn.crn, crn.is_primary)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                title={crn.is_primary ? "Remove CRN (admin override — will auto-promote a replacement)" : "Remove CRN"}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                            {crn.is_primary && user?.role !== 'admin' && user?.role !== 'super' && !isFreeUser && (
                              <span className="text-[10px] text-slate-400 italic">Primary CRN — promote another to delete</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {isFreeUser && (
                    <p className="mt-2 text-[10px] text-indigo-500 italic">
                      ✨ Unlimited CRNs — Admin/Super account
                    </p>
                  )}
                </div>

                {/* Add CRN Modal */}
                {showAddCrnModal && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddCrnModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Add CRN</h3>
                      <p className="text-sm text-slate-500 mb-4">Enter a USAC Consultant Registration Number to verify and import schools.</p>
                      
                      <input
                        type="text"
                        value={newCrnInput}
                        onChange={(e) => setNewCrnInput(e.target.value.toUpperCase())}
                        placeholder="Enter CRN (e.g., 17026509)"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase mb-3"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNewCRN()}
                      />
                      
                      {addCrnError && (
                        <p className="text-xs text-red-600 mb-3">{addCrnError}</p>
                      )}
                      
                      {!isFreeUser && !canAddFree && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                          <p className="text-xs text-amber-800">
                            💳 Additional CRNs require a subscription: <strong>$499/mo</strong> or <strong>$4,999/yr</strong> per CRN.
                          </p>
                        </div>
                      )}
                      
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowAddCrnModal(false)}
                          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddNewCRN}
                          disabled={addingCrn || !newCrnInput.trim()}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                        >
                          {addingCrn ? (
                            <>
                              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Verifying...
                            </>
                          ) : 'Verify & Add'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Replace CRN Modal (test/demo accounts) */}
                {showReplaceCrnModal && replaceCrnTarget && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !replacingCrn && setShowReplaceCrnModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Replace CRN</h3>
                      <p className="text-sm text-slate-500 mb-3">
                        Swap <span className="font-mono font-semibold text-slate-900">{replaceCrnTarget.crn}</span> for a different CRN.
                        Schools tied to the old CRN are removed and the new CRN's schools are imported automatically.
                      </p>
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                        <p className="text-[11px] text-amber-800">
                          <strong>Demo helper</strong> — visible because this is a test/demo account. Lets you retarget the account onto any consultant on the fly.
                        </p>
                      </div>

                      <input
                        type="text"
                        value={replaceCrnInput}
                        onChange={(e) => setReplaceCrnInput(e.target.value.toUpperCase())}
                        placeholder="Enter new CRN (e.g., 17026509)"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono uppercase mb-3"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && !replacingCrn && handleReplaceCRN()}
                      />

                      {replaceCrnError && (
                        <p className="text-xs text-red-600 mb-3">{replaceCrnError}</p>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setShowReplaceCrnModal(false)}
                          disabled={replacingCrn}
                          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleReplaceCRN}
                          disabled={replacingCrn || !replaceCrnInput.trim()}
                          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                        >
                          {replacingCrn ? (
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

                {/* Selective Resync Modal */}
                {showResyncModal && resyncCrnTarget && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !resyncImporting && !resyncPreviewLoading && setShowResyncModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            Re-sync Schools for CRN <span className="font-mono text-indigo-600">{resyncCrnTarget.crn}</span>
                          </h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Select which schools to import from USAC into your portfolio.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowResyncModal(false)}
                          disabled={resyncImporting || resyncPreviewLoading}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>

                      {resyncPreviewLoading ? (
                        <div className="flex-1 flex items-center justify-center py-12">
                          <div className="text-center">
                            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p className="text-sm text-slate-500">Querying USAC for schools...</p>
                            <p className="text-xs text-slate-400 mt-1">This may take 15-30 seconds</p>
                          </div>
                        </div>
                      ) : resyncPreviewData ? (
                        <>
                          {/* Summary bar */}
                          <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 rounded-lg mb-3 text-xs">
                            <span className="text-slate-600">
                              USAC total: <strong className="text-slate-900">{resyncPreviewData.total_from_usac}</strong>
                            </span>
                            <span className="text-green-600">
                              Already imported: <strong>{resyncPreviewData.existing_count}</strong>
                            </span>
                            <span className="text-indigo-600">
                              New schools: <strong>{resyncPreviewData.new_count}</strong>
                            </span>
                            {resyncPreviewData.new_count > 0 && (
                              <span className="ml-auto text-slate-500">
                                Selected: <strong className="text-indigo-700">{resyncSelectedBens.size}</strong> of {resyncPreviewData.new_count}
                              </span>
                            )}
                          </div>

                          {resyncPreviewData.new_count === 0 ? (
                            <div className="flex-1 flex items-center justify-center py-8">
                              <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <p className="text-sm font-medium text-slate-900">Portfolio is up to date</p>
                                <p className="text-xs text-slate-500 mt-1">All {resyncPreviewData.existing_count} schools from USAC are already in your portfolio.</p>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Search + select controls */}
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="text"
                                  value={resyncSearchQuery}
                                  onChange={(e) => setResyncSearchQuery(e.target.value)}
                                  placeholder="Search by name, BEN, or state..."
                                  className="flex-1 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <button
                                  onClick={() => {
                                    if (resyncPreviewData) {
                                      setResyncSelectedBens(new Set(resyncPreviewData.new_schools.map(s => s.ben)));
                                    }
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition whitespace-nowrap"
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={() => setResyncSelectedBens(new Set())}
                                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition whitespace-nowrap"
                                >
                                  Deselect All
                                </button>
                              </div>

                              {/* School list */}
                              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 min-h-0" style={{ maxHeight: '380px' }}>
                                {resyncPreviewData.new_schools
                                  .filter(s => {
                                    if (!resyncSearchQuery) return true;
                                    const q = resyncSearchQuery.toLowerCase();
                                    return (
                                      s.organization_name.toLowerCase().includes(q) ||
                                      s.ben.toLowerCase().includes(q) ||
                                      s.state.toLowerCase().includes(q) ||
                                      s.city.toLowerCase().includes(q)
                                    );
                                  })
                                  .map(school => (
                                    <label
                                      key={school.ben}
                                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/50 cursor-pointer transition"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={resyncSelectedBens.has(school.ben)}
                                        onChange={(e) => {
                                          const next = new Set(resyncSelectedBens);
                                          if (e.target.checked) {
                                            next.add(school.ben);
                                          } else {
                                            next.delete(school.ben);
                                          }
                                          setResyncSelectedBens(next);
                                        }}
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-slate-900 truncate">{school.organization_name || 'Unknown'}</span>
                                          <span className="text-[10px] font-mono text-slate-400 shrink-0">BEN {school.ben}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {school.state && <span className="text-xs text-slate-500">{school.city ? `${school.city}, ` : ''}{school.state}</span>}
                                          {school.entity_type && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{school.entity_type}</span>}
                                        </div>
                                      </div>
                                    </label>
                                  ))}
                              </div>
                            </>
                          )}

                          {/* Action buttons */}
                          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => setShowResyncModal(false)}
                              disabled={resyncImporting}
                              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            {resyncPreviewData.new_count > 0 && (
                              <button
                                onClick={handleResyncSelectiveImport}
                                disabled={resyncImporting || resyncSelectedBens.size === 0}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition"
                              >
                                {resyncImporting ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Importing...
                                  </>
                                ) : (
                                  `Import ${resyncSelectedBens.size} School${resyncSelectedBens.size !== 1 ? 's' : ''}`
                                )}
                              </button>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* CRN Paywall Modal */}
                {showCrnPaywall && pendingCrn && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCrnPaywall(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
                      <div className="text-center mb-4">
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-xl">🔑</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Add CRN: <span className="font-mono">{pendingCrn}</span></h3>
                        <p className="text-sm text-slate-500 mt-1">Choose a plan to track this additional CRN</p>
                      </div>
                      
                      {addCrnError && (
                        <p className="text-xs text-red-600 text-center mb-3">{addCrnError}</p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {/* Monthly Plan */}
                        <button
                          onClick={() => handleCRNCheckout('monthly')}
                          className="group p-4 border-2 border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition text-left"
                        >
                          <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Monthly</div>
                          <div className="text-2xl font-bold text-slate-900">$499<span className="text-sm font-normal text-slate-500">/mo</span></div>
                          <div className="text-xs text-slate-500 mt-2">Billed monthly. Cancel anytime.</div>
                          <div className="mt-3 w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium text-center group-hover:bg-indigo-700 transition">
                            Choose Monthly
                          </div>
                        </button>
                        
                        {/* Yearly Plan */}
                        <button
                          onClick={() => handleCRNCheckout('yearly')}
                          className="group relative p-4 border-2 border-indigo-300 rounded-xl hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50 transition text-left"
                        >
                          <div className="absolute -top-2 right-3 px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full">SAVE 17%</div>
                          <div className="text-xs text-indigo-600 uppercase font-semibold mb-1">Yearly</div>
                          <div className="text-2xl font-bold text-slate-900">$4,999<span className="text-sm font-normal text-slate-500">/yr</span></div>
                          <div className="text-xs text-slate-500 mt-2">~$417/mo. Best value.</div>
                          <div className="mt-3 w-full py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium text-center group-hover:bg-indigo-700 transition">
                            Choose Yearly
                          </div>
                        </button>
                      </div>
                      
                      <div className="text-center">
                        <button
                          onClick={() => { setShowCrnPaywall(false); setPendingCrn(null); setAddCrnError(null); }}
                          className="text-sm text-slate-500 hover:text-slate-700 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                    <input type="text" defaultValue={profile?.company_name || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Contact Name</label>
                    <input type="text" defaultValue={profile?.contact_name || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Phone</label>
                    <input type="text" defaultValue={profile?.phone || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                    <input type="text" defaultValue={profile?.website || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <button className="mt-6 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl">Save Changes</button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">🔔</span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                    <p className="text-sm text-slate-500">Alerts for FRN status changes, denials, long-pending items, and deadlines</p>
                  </div>
                </div>
                <Link
                  href="/settings/notifications"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 font-medium text-sm transition"
                >
                  🔔 Manage Notification Settings →
                </Link>
              </div>

              <MyTeamPanel />

              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                  {user?.role === 'super' || user?.role === 'admin' ? 'Account Access' : 'Subscription'}
                </h2>
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {user?.role === 'super' ? '⭐ Super Account — Full Access' : user?.role === 'admin' ? '🔑 Admin Account — Full Access' : user?.subscription?.plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan'}
                    </div>
                    <div className="text-sm text-slate-600">
                      Status: <span className="capitalize">
                        {user?.role === 'super' || user?.role === 'admin' ? 'Active — No billing required' : user?.subscription?.status || 'Unknown'}
                      </span>
                    </div>
                  </div>
                  {user?.role !== 'super' && user?.role !== 'admin' && (
                    <button className="px-4 py-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50">Manage Billing</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "pia" && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">PIA Response Generator</h2>
                  <p className="text-slate-500">Generate professional PIA responses in seconds with AI assistance</p>
                </div>
                <button
                  onClick={() => loadPIAHistory(true)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>

              {/* FRNs Currently Under USAC PIA Review */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">FRNs Currently Under USAC PIA Review</h3>
                      <p className="text-sm text-slate-500">These FRNs from your portfolio are in active PIA review</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {isLoadingPiaFRNs ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : piaFRNs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <p className="text-sm">No FRNs currently in PIA review</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 pr-4 text-slate-500 font-medium">Entity Name</th>
                            <th className="text-left py-2 pr-4 text-slate-500 font-medium">FRN</th>
                            <th className="text-left py-2 pr-4 text-slate-500 font-medium">Pending Reason</th>
                            <th className="text-left py-2 pr-4 text-slate-500 font-medium">Amount</th>
                            <th className="text-left py-2 text-slate-500 font-medium">App #</th>
                          </tr>
                        </thead>
                        <tbody>
                          {piaFRNs.map((item, idx) => (
                            <tr
                              key={idx}
                              className={`border-b border-slate-50 hover:bg-amber-50 cursor-pointer transition-colors ${item.frn === piaFrn && item.ben === piaBen ? "bg-amber-100" : ""}`}
                              onClick={() => {
                                setPiaBen(item.ben);
                                setPiaFrn(item.frn);
                                document.getElementById("pia-input-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                            >
                              <td className="py-3 pr-4 font-medium text-slate-900">{item.school_name}</td>
                              <td className="py-3 pr-4 font-mono text-slate-700">{item.frn}</td>
                              <td className="py-3 pr-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  {item.pending_reason || "PIA Review"}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-slate-700">
                                {item.amount_requested > 0
                                  ? `$${item.amount_requested.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                                  : "\u2014"}
                              </td>
                              <td className="py-3 text-slate-500 font-mono text-xs">{item.application_number || "\u2014"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 text-xs text-slate-400">Click a row to pre-fill the PIA Response Generator below</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Input Panel */}
              <div id="pia-input-panel" className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">New PIA Response</h3>
                      <p className="text-sm text-slate-500">Paste the PIA reviewer&apos;s question below</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {piaError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {piaError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      PIA Reviewer&apos;s Question *
                    </label>
                    <textarea
                      value={piaQuestionInput}
                      onChange={(e) => setPiaQuestionInput(e.target.value)}
                      placeholder="Paste the PIA reviewer's question here (e.g., 'Please provide documentation showing that you posted your Form 470 and waited the required 28 days...')"
                      rows={4}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        BEN (optional)
                      </label>
                      <input
                        type="text"
                        value={piaBen}
                        onChange={(e) => setPiaBen(e.target.value)}
                        placeholder="e.g., 123456"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        FRN (optional)
                      </label>
                      <input
                        type="text"
                        value={piaFrn}
                        onChange={(e) => setPiaFrn(e.target.value)}
                        placeholder="e.g., 2391012345"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Additional Context (optional)
                      </label>
                      <input
                        type="text"
                        value={piaAdditionalContext}
                        onChange={(e) => setPiaAdditionalContext(e.target.value)}
                        placeholder="Any extra details..."
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                      />
                    </div>
                  </div>

                  {/* Detected Category Badge */}
                  {detectedCategory && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">Detected category:</span>
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm font-medium rounded-full">
                        {detectedCategory.name}
                      </span>
                    </div>
                  )}

                  {/* PIA Template Preview */}
                  {templatePreview && (
                    <PIATemplatePreview
                      preview={templatePreview}
                      onClose={() => setTemplatePreview(null)}
                    />
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={generatePIAResponse}
                      disabled={!piaQuestionInput.trim() || isPiaGenerating}
                      className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl shadow-lg shadow-teal-200 hover:shadow-xl transition-all flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPiaGenerating ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Generate Response
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowPiaTemplates(!showPiaTemplates)}
                      className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2 font-medium text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      {showPiaTemplates ? "Hide Templates" : "Browse Templates"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Template Gallery */}
              {showPiaTemplates && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Common PIA Question Templates</h3>
                  <PIATemplateGallery onSelectTemplate={handlePIATemplateSelect} />
                </div>
              )}

              {/* PIA History */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Past PIA Responses</h3>
                      <p className="text-sm text-slate-500">Your generated PIA responses</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {isLoadingPiaResponses ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-slate-500">Loading PIA responses...</p>
                    </div>
                  ) : piaResponses.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-1">No PIA responses yet</h4>
                      <p className="text-sm text-slate-500">Paste a PIA question above or browse templates to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {piaResponses.map((pia) => {
                        const categoryNames: Record<string, string> = {
                          competitive_bidding: "Competitive Bidding",
                          cost_effectiveness: "Cost-Effectiveness",
                          entity_eligibility: "Entity Eligibility",
                          service_eligibility: "Service Eligibility",
                          discount_rate: "Discount Rate",
                          contracts: "Contracts",
                          cipa: "CIPA Compliance",
                          thirty_percent_rule: "30% Rule",
                        };
                        const statusColors: Record<string, string> = {
                          draft: "bg-amber-100 text-amber-700",
                          finalized: "bg-green-100 text-green-700",
                          submitted: "bg-blue-100 text-blue-700",
                        };
                        return (
                          <div
                            key={pia.id}
                            className="flex items-center justify-between p-4 bg-gradient-to-r from-teal-50 to-white border border-teal-100 rounded-xl hover:shadow-md transition-all cursor-pointer"
                            onClick={() => {
                              setSelectedPia(pia);
                              setShowPiaChat(true);
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="text-sm font-medium text-slate-900">
                                  {categoryNames[pia.pia_category] || pia.pia_category}
                                </span>
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${statusColors[pia.status] || ""}`}>
                                  {pia.status.toUpperCase()}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {new Date(pia.generated_at).toLocaleDateString()}
                                </span>
                              </div>
                              {pia.organization_name && (
                                <p className="text-sm text-slate-700 font-medium">
                                  {pia.organization_name}
                                  {pia.ben ? ` (BEN: ${pia.ben})` : ""}
                                </p>
                              )}
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                &ldquo;{pia.original_question.slice(0, 120)}{pia.original_question.length > 120 ? "..." : ""}&rdquo;
                              </p>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPia(pia);
                                  setShowPiaChat(true);
                                }}
                                className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                title="Open & Chat"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePIA(pia.id);
                                }}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "service-search" && (
            <div className="space-y-6">
              {/* Form 470 / 471 Lookup */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Form 470 / 471 Lookup</h2>
                <p className="text-sm text-slate-500 mb-4">Enter any school&apos;s BEN to see its Form 471 award history — winning vendors and committed amounts. Click any FRN to expand its itemized line items (function, product, manufacturer, model, quantity, unit cost and extended cost).</p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Billed Entity Number (BEN)</label>
                    <input
                      type="text"
                      value={form471BenInput}
                      onChange={(e) => setForm471BenInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupForm471ByBen(); }}
                      placeholder="e.g. 125678"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Funding Year</label>
                    <select
                      value={form471Year ?? ""}
                      onChange={(e) => setForm471Year(e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    >
                      <option value="">All Years</option>
                      {(() => {
                        const cy = new Date().getFullYear();
                        const years: number[] = [];
                        for (let y = cy + 1; y >= cy - 6; y--) years.push(y);
                        return years.map(y => <option key={y} value={y}>{y}</option>);
                      })()}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={lookupForm471ByBen}
                    disabled={form471Loading}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50 font-medium whitespace-nowrap"
                  >
                    {form471Loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Looking up...
                      </span>
                    ) : "Look Up 471"}
                  </button>
                </div>

                {form471Error && (
                  <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    {form471Error}
                  </div>
                )}

                {form471Data && (
                  <div className="mt-6">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{form471Data.entity_name || "Entity"} <span className="font-mono text-xs text-slate-500">({form471Data.ben})</span></div>
                        <div className="text-xs text-slate-500">{form471Data.entity_state} · {form471Data.total_records} record(s) · {form471Data.total_committed != null ? `$${form471Data.total_committed.toLocaleString(undefined, { maximumFractionDigits: 0 })} committed` : ""}</div>
                      </div>
                    </div>

                    {(!form471Data.records || form471Data.records.length === 0) ? (
                      <div className="px-4 py-6 text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-center">No Form 471 records found for this BEN{form471Year ? ` in ${form471Year}` : ""}.</div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
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
                            {form471Data.records.slice(0, 50).map((record, idx) => {
                              const isExpanded = expanded471Frn === record.frn;
                              const lineItems = form471LineItemsCache[record.frn];
                              const isLoadingItems = form471LineItemsLoadingFrn === record.frn;
                              return (
                              <Fragment key={idx}>
                              <tr
                                className={`hover:bg-slate-50 cursor-pointer ${isExpanded ? 'bg-slate-50' : ''}`}
                                onClick={() => toggleConsultant471LineItems(record.frn)}
                              >
                                <td className="px-4 py-3 text-slate-900">{record.funding_year}</td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                  <span className="inline-flex items-center gap-1">
                                    <svg className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                    {record.frn}
                                  </span>
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
                                  <td colSpan={7} className="px-4 py-3">
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
                        {form471Data.records.length > 50 && (
                          <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-200">
                            Showing first 50 of {form471Data.records.length} records
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Service Search Filters */}
              <form onSubmit={handleServiceSearch} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Service Search Filters</h2>
                <p className="text-sm text-slate-500 mb-4">Search E-Rate funded services across your managed schools.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">School (BEN)</label>
                    <select
                      value={serviceSearchBen}
                      onChange={(e) => setServiceSearchBen(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    >
                      <option value="">All My Schools</option>
                      {schools.map(school => (
                        <option key={school.ben} value={school.ben}>
                          {school.school_name || school.name || school.ben} ({school.ben})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
                    <select
                      value={serviceSearchStatus}
                      onChange={(e) => setServiceSearchStatus(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
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
                      value={serviceSearchType}
                      onChange={(e) => setServiceSearchType(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    >
                      <option value="">All Types</option>
                      <option value="Internal Connections">Internal Connections</option>
                      <option value="Basic Maintenance">Basic Maintenance</option>
                      <option value="Internet Access">Internet Access</option>
                      <option value="Data Transmission">Data Transmission</option>
                      <option value="Voice">Voice</option>
                      <option value="Managed Internal Broadband Services">Managed Internal Broadband Services</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Funding Year</label>
                    <select
                      value={serviceSearchYear}
                      onChange={(e) => setServiceSearchYear(parseInt(e.target.value))}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                    >
                      {(() => {
                        const cy = new Date().getFullYear();
                        const years: number[] = [];
                        for (let y = cy + 1; y >= cy - 6; y--) years.push(y);
                        return years.map(y => <option key={y} value={y}>{y}</option>);
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Min Amount ($)</label>
                    <input
                      type="number"
                      value={serviceSearchMinAmount}
                      onChange={(e) => setServiceSearchMinAmount(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Max Amount ($)</label>
                    <input
                      type="number"
                      value={serviceSearchMaxAmount}
                      onChange={(e) => setServiceSearchMaxAmount(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      placeholder="No limit"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={serviceSearchLoading}
                  className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50 font-medium"
                >
                  {serviceSearchLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Searching...
                    </span>
                  ) : "Search Services"}
                </button>
              </form>

              {/* Service Search Results */}
              {serviceSearchResults.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Results <span className="text-slate-500 font-normal">({sortedServiceSearchResults.length}{sortedServiceSearchResults.length !== serviceSearchResults.length ? ` of ${serviceSearchResults.length}` : ''}{serviceSearchResults.length >= 500 ? ' — capped at 500' : ''})</span>
                    </h2>
                    <div className="flex items-center gap-3">
                      {(serviceColBen || serviceColName || serviceColFrn || serviceColYear || serviceColStatus || serviceColService) && (
                        <button
                          onClick={() => { setServiceColBen(""); setServiceColName(""); setServiceColFrn(""); setServiceColYear(""); setServiceColStatus(""); setServiceColService(""); }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Clear column filters
                        </button>
                      )}
                      <span className="text-sm text-slate-500">
                        {serviceSearchBensSearched > 0 && `Searched across ${serviceSearchBensSearched} school(s)`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          {[
                            { field: 'ben', label: 'BEN' },
                            { field: 'name', label: 'School Name' },
                            { field: 'frn', label: 'FRN' },
                            { field: 'funding_year', label: 'Year' },
                            { field: 'status', label: 'Status' },
                            { field: 'funding_amount', label: 'Funding' },
                            { field: 'service_type', label: 'Service' },
                          ].map(col => (
                            <th
                              key={col.field}
                              className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
                              onClick={() => toggleServiceSearchSort(col.field)}
                            >
                              <span className="flex items-center gap-1">
                                {col.label}
                                {serviceSearchSort?.field === col.field ? (
                                  <span className="text-indigo-600">{serviceSearchSort.dir === 'asc' ? '↑' : '↓'}</span>
                                ) : (
                                  <span className="text-slate-300">↕</span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                        {/* Per-column filter row */}
                        <tr className="bg-white border-t border-slate-200">
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              value={serviceColBen}
                              onChange={(e) => setServiceColBen(e.target.value)}
                              placeholder="Filter BEN..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              value={serviceColName}
                              onChange={(e) => setServiceColName(e.target.value)}
                              placeholder="Filter name..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              value={serviceColFrn}
                              onChange={(e) => setServiceColFrn(e.target.value)}
                              placeholder="Filter FRN..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case"
                            />
                          </th>
                          <th className="px-3 py-2">
                            <select
                              value={serviceColYear}
                              onChange={(e) => setServiceColYear(e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case bg-white"
                            >
                              <option value="">All</option>
                              {Array.from(new Set(serviceSearchResults.map(r => (r.funding_year || '').toString()).filter(Boolean))).sort().reverse().map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </th>
                          <th className="px-3 py-2">
                            <select
                              value={serviceColStatus}
                              onChange={(e) => setServiceColStatus(e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case bg-white"
                            >
                              <option value="">All</option>
                              {Array.from(new Set(serviceSearchResults.map(r => (r.status || '').toString()).filter(Boolean))).sort().map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </th>
                          <th className="px-3 py-2 text-xs text-slate-400 italic font-normal normal-case">sort only</th>
                          <th className="px-3 py-2">
                            <input
                              type="text"
                              value={serviceColService}
                              onChange={(e) => setServiceColService(e.target.value)}
                              placeholder="Filter service..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none font-normal normal-case"
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedServiceSearchResults.map((result, idx) => (
                          <tr key={`${result.ben}-${result.frn}-${idx}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-indigo-600">{result.ben}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{result.name || '-'}</td>
                            <td className="px-4 py-3 font-mono text-sm">{result.frn || '-'}</td>
                            <td className="px-4 py-3 text-sm">{result.funding_year || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                result.status === 'Funded' ? 'bg-green-100 text-green-700' :
                                result.status === 'Denied' ? 'bg-red-100 text-red-700' :
                                result.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {result.status || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">{result.funding_amount ? `$${result.funding_amount.toLocaleString()}` : '-'}</td>
                            <td className="px-4 py-3 text-sm">{result.service_type || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {serviceSearchResults.length === 0 && !serviceSearchLoading && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">🔍</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">No Results Yet</h2>
                  <p className="text-slate-500 mt-2 max-w-md mx-auto">
                    {schools.length === 0 
                      ? "Add schools to your portfolio first, then search for their E-Rate services."
                      : "Use the filters above to search for E-Rate funded services across your managed schools."
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Add School Modal */}
      {showAddSchool && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Add New School</h2>
              <p className="text-sm text-slate-500 mt-1">Enter the BEN to add a school</p>
            </div>
            <form onSubmit={handleAddSchool} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">BEN (Billed Entity Number)</label>
                <input type="text" value={newBen} onChange={(e) => setNewBen(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter BEN..." required disabled={isAddingSchool} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes (Optional)</label>
                <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={3} placeholder="Add any notes..." disabled={isAddingSchool} />
              </div>
              {addSchoolError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{addSchoolError}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddSchool(false); setAddSchoolError(null); }} disabled={isAddingSchool} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isAddingSchool} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {isAddingSchool ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                      Adding...
                    </>
                  ) : "Add School"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Upload Schools CSV</h2>
                <p className="text-sm text-slate-500 mt-1">Import multiple schools at once</p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setValidationResults(null); setUploadResults(null); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Download Template */}
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">📄</div>
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-900">Need a template?</h3>
                    <p className="text-sm text-slate-600 mt-1">Download our CSV template with the correct format and example data.</p>
                    <button onClick={handleDownloadTemplate} className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
                      Download Template
                    </button>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select CSV File</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors">
                  <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" id="csvUpload" />
                  <label htmlFor="csvUpload" className="cursor-pointer">
                    <svg className="w-12 h-12 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-slate-600">Click to upload or drag and drop</p>
                    <p className="text-sm text-slate-400 mt-1">CSV file only</p>
                  </label>
                </div>
              </div>

              {/* Validation Results */}
              {validationResults && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-900">Validation Results</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-green-600">{validationResults.filter(r => r.is_valid && !r.already_exists).length}</div>
                      <div className="text-sm text-green-700">Valid</div>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-yellow-600">{validationResults.filter(r => r.already_exists).length}</div>
                      <div className="text-sm text-yellow-700">Already Added</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-xl text-center">
                      <div className="text-2xl font-bold text-red-600">{validationResults.filter(r => !r.is_valid).length}</div>
                      <div className="text-sm text-red-700">Invalid</div>
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">BEN</th>
                          <th className="px-4 py-2 text-left">School Name</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validationResults.map((result, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 font-mono">{result.ben}</td>
                            <td className="px-4 py-2">{result.school_name || '-'}</td>
                            <td className="px-4 py-2">
                              {result.already_exists ? (
                                <span className="text-yellow-600">Already exists</span>
                              ) : result.is_valid ? (
                                <span className="text-green-600">✓ Valid</span>
                              ) : (
                                <span className="text-red-600">{result.error || 'Not found'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload Results */}
              {uploadResults && (
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <div className="flex items-center gap-2 text-green-700">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Upload Complete!</span>
                  </div>
                  <p className="text-sm text-green-600 mt-1">
                    Successfully added {uploadResults.successful?.length || 0} schools. {uploadResults.failed?.length || 0} failed.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => { setShowUploadModal(false); setValidationResults(null); setUploadResults(null); }} className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              {validationResults && !uploadResults && (
                <button onClick={handleUploadConfirm} className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl">
                  Import {validationResults.filter(r => r.is_valid && !r.already_exists).length} Schools
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* School Detail Modal */}
      {showSchoolDetail && selectedSchool && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-900">
                    {loadingEnrichment ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                        Loading...
                      </span>
                    ) : (
                      selectedSchool.school_name || selectedSchool.name || `BEN ${selectedSchool.ben}`
                    )}
                  </h2>
                  {selectedSchool.status && (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      selectedSchool.status === 'Funded' ? 'bg-green-100 text-green-700' :
                      selectedSchool.status === 'Has Denials' ? 'bg-red-100 text-red-700' :
                      selectedSchool.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedSchool.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  BEN: {selectedSchool.ben}
                  {selectedSchool.entity_type && ` • ${selectedSchool.entity_type}`}
                  {selectedSchool.state && ` • ${selectedSchool.city || ''} ${selectedSchool.state}`}
                </p>
              </div>
              <button onClick={() => { setShowSchoolDetail(false); setSelectedSchool(null); setEnrichedSchoolData(null); setComprehensiveSchoolData(null); setSchoolApplications([]); }} className="p-2 hover:bg-slate-100 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* School Overview Card - Enriched Data */}
              {enrichedSchoolData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Funding Summary */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">💰</span>
                      <span className="text-sm font-medium text-green-700">Total Funding</span>
                    </div>
                    <div className="text-2xl font-bold text-green-800">
                      ${(enrichedSchoolData.total_funding_committed || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      {enrichedSchoolData.funding_years?.length || 0} years active
                    </div>
                  </div>
                  
                  {/* Applications Count */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📋</span>
                      <span className="text-sm font-medium text-indigo-700">Applications</span>
                    </div>
                    <div className="text-2xl font-bold text-indigo-800">
                      {enrichedSchoolData.applications_count || 0}
                    </div>
                    <div className="text-xs text-indigo-600 mt-1">
                      {enrichedSchoolData.has_category1 && 'Cat 1'} 
                      {enrichedSchoolData.has_category1 && enrichedSchoolData.has_category2 && ' & '}
                      {enrichedSchoolData.has_category2 && 'Cat 2'}
                    </div>
                  </div>
                  
                  {/* Discount Rate */}
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📊</span>
                      <span className="text-sm font-medium text-amber-700">Discount Rate</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-800">
                      {enrichedSchoolData.discount_rate ? `${enrichedSchoolData.discount_rate}%` : 'N/A'}
                    </div>
                    <div className="text-xs text-amber-600 mt-1">
                      E-Rate discount
                    </div>
                  </div>
                </div>
              )}
              
              {/* School Details Row */}
              {enrichedSchoolData && enrichedSchoolData.address && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Address:</span>
                      <div className="font-medium text-slate-900">{enrichedSchoolData.address}</div>
                    </div>
                    {enrichedSchoolData.frn_number && (
                      <div>
                        <span className="text-slate-500">Latest FRN:</span>
                        <div className="font-medium text-slate-900 font-mono">{enrichedSchoolData.frn_number}</div>
                      </div>
                    )}
                    {enrichedSchoolData.latest_year && (
                      <div>
                        <span className="text-slate-500">Latest Year:</span>
                        <div className="font-medium text-slate-900">{enrichedSchoolData.latest_year}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comprehensive Budget & Funding Section */}
              {loadingComprehensiveData ? (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                    <span>Loading budget data...</span>
                  </div>
                </div>
              ) : comprehensiveSchoolData && (
                <div className="space-y-4">
                  {/* Category 2 Budget Section */}
                  <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-100">
                    <h3 className="text-lg font-semibold text-purple-900 mb-4 flex items-center gap-2">
                      <span>📚</span> Category 2 Budget (Internal Connections)
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Current Cycle */}
                      {comprehensiveSchoolData.c2_budget['FY2026-2030'] && (
                        <div className="bg-white/70 rounded-lg p-4">
                          <div className="text-sm font-medium text-purple-700 mb-2">FY2026-2030 (Current Cycle)</div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Total Budget:</span>
                              <span className="font-semibold text-purple-900">${comprehensiveSchoolData.c2_budget['FY2026-2030'].c2_budget.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Funded:</span>
                              <span className="font-medium text-green-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].funded.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Pending:</span>
                              <span className="font-medium text-yellow-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].pending.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                              <span className="text-slate-600 font-medium">Available:</span>
                              <span className="font-bold text-indigo-700">${comprehensiveSchoolData.c2_budget['FY2026-2030'].available.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Previous Cycle */}
                      {comprehensiveSchoolData.c2_budget['FY2021-2025'] && (
                        <div className="bg-white/70 rounded-lg p-4">
                          <div className="text-sm font-medium text-purple-700 mb-2">FY2021-2025 (Previous Cycle)</div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-slate-600">Total Budget:</span>
                              <span className="font-semibold text-purple-900">${comprehensiveSchoolData.c2_budget['FY2021-2025'].c2_budget.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Funded:</span>
                              <span className="font-medium text-green-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].funded.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600">Pending:</span>
                              <span className="font-medium text-yellow-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].pending.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                              <span className="text-slate-600 font-medium">Available:</span>
                              <span className="font-bold text-indigo-700">${comprehensiveSchoolData.c2_budget['FY2021-2025'].available.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Lifetime Funding Totals */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-100">
                    <h3 className="text-lg font-semibold text-emerald-900 mb-4 flex items-center gap-2">
                      <span>💰</span> Lifetime Funding Summary
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Category 1 */}
                      <div className="bg-white/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Category 1</div>
                        <div className="text-xs text-slate-500 mb-2">(Voice, Internet, Data)</div>
                        <div className="text-2xl font-bold text-emerald-800">
                          ${comprehensiveSchoolData.funding_totals.category_1.funded.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Requested: ${comprehensiveSchoolData.funding_totals.category_1.requested.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Category 2 */}
                      <div className="bg-white/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Category 2</div>
                        <div className="text-xs text-slate-500 mb-2">(Internal Connections)</div>
                        <div className="text-2xl font-bold text-emerald-800">
                          ${comprehensiveSchoolData.funding_totals.category_2.funded.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Requested: ${comprehensiveSchoolData.funding_totals.category_2.requested.toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Total */}
                      <div className="bg-emerald-100/70 rounded-lg p-4 text-center">
                        <div className="text-sm font-medium text-emerald-700 mb-1">Lifetime Total</div>
                        <div className="text-xs text-slate-500 mb-2">(All Categories)</div>
                        <div className="text-2xl font-bold text-emerald-900">
                          ${comprehensiveSchoolData.funding_totals.lifetime_total.toLocaleString()}
                        </div>
                        <div className="text-xs text-emerald-600 mt-1">
                          Total funded E-Rate
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Funding by Year (last 5 years) */}
                  {comprehensiveSchoolData.years.length > 0 && (
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100">
                      <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                        <span>📅</span> Funding by Year
                      </h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-blue-700 border-b border-blue-200">
                              <th className="pb-2 font-medium">Year</th>
                              <th className="pb-2 font-medium text-right">C1 Funded</th>
                              <th className="pb-2 font-medium text-right">C2 Funded</th>
                              <th className="pb-2 font-medium text-right">Total</th>
                              <th className="pb-2 font-medium text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comprehensiveSchoolData.years.slice(0, 5).map((year) => (
                              <tr key={year.year} className="border-b border-blue-100">
                                <td className="py-2 font-medium text-blue-900">{year.year}</td>
                                <td className="py-2 text-right text-slate-700">${year.c1_funded.toLocaleString()}</td>
                                <td className="py-2 text-right text-slate-700">${year.c2_funded.toLocaleString()}</td>
                                <td className="py-2 text-right font-medium text-blue-800">${(year.c1_funded + year.c2_funded).toLocaleString()}</td>
                                <td className="py-2 text-center">
                                  {Object.entries(year.status_summary).map(([status, count]) => (
                                    <span 
                                      key={status} 
                                      className={`inline-block px-2 py-0.5 rounded text-xs mr-1 ${
                                        status.includes('funded') || status.includes('committed') ? 'bg-green-100 text-green-700' :
                                        status.includes('denied') ? 'bg-red-100 text-red-700' :
                                        status.includes('pending') ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {count as number}x {status}
                                    </span>
                                  ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Year Filter */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-700">Filter by Year:</span>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => filterApplicationsByYear(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedYear === null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    All Years
                  </button>
                  {applicationYears.map(year => (
                    <button
                      key={year}
                      onClick={() => filterApplicationsByYear(year)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selectedYear === year ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Applications Table */}
              {loadingApplications ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4 text-slate-500">Loading applications...</p>
                </div>
              ) : schoolApplications.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>No applications found for this school.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Year</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">FRN</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Category</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {schoolApplications.map((app, idx) => {
                        const isDenied = app.frn_status?.toLowerCase().includes('denied') || app.status?.toLowerCase().includes('denied');
                        const statusColors: Record<string, string> = {
                          'funded': 'bg-green-100 text-green-700',
                          'denied': 'bg-red-100 text-red-700',
                          'pending': 'bg-yellow-100 text-yellow-700',
                          'committed': 'bg-blue-100 text-blue-700',
                        };
                        const statusKey = isDenied ? 'denied' : (app.frn_status?.toLowerCase().includes('funded') || app.frn_status?.toLowerCase().includes('committed') ? 'funded' : 'pending');
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{app.funding_year}</td>
                            <td className="px-4 py-3 font-mono text-sm text-slate-600">{app.frn}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[statusKey] || 'bg-slate-100 text-slate-600'}`}>
                                {app.frn_status || app.status || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              ${(app.original_request || app.amount || 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600">{app.service_type || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {isDenied && (
                                <button
                                  onClick={() => handleGenerateAppeal(app.frn)}
                                  disabled={generatingAppeal === app.frn}
                                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                                >
                                  {generatingAppeal === app.frn ? 'Generating...' : 'Generate Appeal'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Denial Reasons */}
              {schoolApplications.some(app => app.denial_reason) && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-900">Denial Reasons</h3>
                  {schoolApplications.filter(app => app.denial_reason).map((app, idx) => (
                    <div key={idx} className="p-4 bg-red-50 rounded-xl border border-red-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-red-800">FRN {app.frn} ({app.funding_year})</span>
                      </div>
                      <p className="text-sm text-red-700">{app.denial_reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Appeal Modal */}
      {showNewAppealModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            {selectedDeniedApp ? (
              /* Confirmation view when generating from denied application */
              <>
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900">Confirm Appeal Generation</h2>
                  <p className="text-sm text-slate-500 mt-1">Review the details and confirm to generate the appeal</p>
                </div>
                
                <div className="p-6 space-y-4">
                  {appealError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {appealError}
                    </div>
                  )}
                  
                  {/* Application Details */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">School Name</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.school_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">FRN</span>
                      <span className="text-sm font-mono font-semibold text-indigo-600">{selectedDeniedApp.frn}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Funding Year</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.funding_year}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Service Type</span>
                      <span className="text-sm font-medium text-slate-900">{selectedDeniedApp.service_type}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">Amount Requested</span>
                      <span className="text-sm font-medium text-slate-900">${selectedDeniedApp.amount_requested?.toLocaleString() || 'N/A'}</span>
                    </div>
                    {selectedDeniedApp.denial_reason && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-sm text-slate-500 block mb-1">Denial Reason</span>
                        <span className="text-sm text-red-600">{selectedDeniedApp.denial_reason}</span>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={newAppealContext}
                      onChange={(e) => setNewAppealContext(e.target.value)}
                      placeholder="Describe the adverse action (e.g., commitment adjustment to $0, rescission reason, denial details)..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                      setShowNewAppealModal(false);
                      setSelectedDeniedApp(null);
                      setNewAppealFrn("");
                      setNewAppealContext("");
                      setAppealError(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleGenerateAppeal(selectedDeniedApp.frn, newAppealContext)}
                    disabled={generatingAppeal !== null}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generatingAppeal ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      'Generate Appeal'
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Manual entry view for new appeals */
              <>
                <div className="p-6 border-b border-slate-200">
                  <h2 className="text-xl font-semibold text-slate-900">Generate New Appeal</h2>
                  <p className="text-sm text-slate-500 mt-1">Enter an FRN to generate an appeal letter (denials, commitment adjustments, rescissions)</p>
                </div>
                
                <div className="p-6 space-y-4">
                  {appealError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                      {appealError}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      FRN (Funding Request Number) *
                    </label>
                    <input
                      type="text"
                      value={newAppealFrn}
                      onChange={(e) => setNewAppealFrn(e.target.value)}
                      placeholder="e.g., 2391012345"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={newAppealContext}
                      onChange={(e) => setNewAppealContext(e.target.value)}
                      placeholder="Describe the adverse action (e.g., commitment adjustment to $0, rescission reason, denial details)..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>

                <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                      setShowNewAppealModal(false);
                      setNewAppealFrn("");
                      setNewAppealContext("");
                      setAppealError(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleGenerateAppeal(newAppealFrn, newAppealContext)}
                    disabled={!newAppealFrn.trim() || generatingAppeal !== null}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generatingAppeal ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      'Generate Appeal'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* BEN Upgrade Modal — shown when regular consultant searches a non-portfolio BEN */}
      {showBenUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔒</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">School Not in Your Portfolio</h2>
              <p className="text-slate-600 mb-2">
                BEN <span className="font-mono font-bold text-slate-900">{upgradeBen}</span> is not associated with your account.
              </p>
              <p className="text-slate-600 mb-6">
                Upgrade to <strong>Unlimited Plan</strong> to look up any school by BEN number and access E-Rate data for any entity nationwide.
              </p>
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm font-semibold text-teal-800 mb-2">Unlimited Plan includes:</p>
                <ul className="text-sm text-teal-700 space-y-1">
                  <li>✓ Look up any school by BEN number</li>
                  <li>✓ Unlimited portfolio size</li>
                  <li>✓ Full FRN status history</li>
                  <li>✓ Priority support</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBenUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowBenUpgradeModal(false); setActiveTab('settings'); }}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 text-sm font-medium transition-colors"
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FRN Detail Modal */}
      <FRNDetailModal
        isOpen={showFRNDetailModal && !!selectedFRN}
        onClose={() => { setShowFRNDetailModal(false); setSelectedFRN(null); }}
        frn={selectedFRN?.frn ?? ''}
        ben={selectedFRN?.ben}
        onViewInTab={(frnNum, benNum) => {
          setShowFRNDetailModal(false);
          setSelectedFRN(null);
          setPortfolioFrnSearch(frnNum);
          if (!portfolioFrnData) {
            loadPortfolioFRNStatus();
          }
        }}
        initialData={selectedFRN ? {
          frn: selectedFRN.frn,
          organization_name: selectedFRN.entity_name,
          status: selectedFRN.status,
          commitment_amount: selectedFRN.commitment_amount,
          disbursed_amount: selectedFRN.disbursed_amount,
          service_type: selectedFRN.service_type,
          spin_name: selectedFRN.spin_name,
          discount_rate: selectedFRN.discount_rate,
          fcdl_date: selectedFRN.fcdl_date,
          fcdl_comment: selectedFRN.fcdl_comment,
          pending_reason: selectedFRN.pending_reason,
          funding_year: selectedFRN.funding_year,
          application_number: selectedFRN.application_number,
        } : undefined}
      />

      {/* Appeal Chat Modal */}
      {showAppealChat && selectedAppeal && (
        <AppealChat
          appeal={selectedAppeal}
          onAppealUpdate={handleAppealUpdate}
          onClose={() => {
            setShowAppealChat(false);
            setSelectedAppeal(null);
          }}
        />
      )}

      {/* PIA Chat Modal */}
      {showPiaChat && selectedPia && (
        <PIAChat
          piaResponse={selectedPia}
          onUpdate={handlePIAUpdate}
          onClose={() => {
            setShowPiaChat(false);
            setSelectedPia(null);
          }}
        />
      )}
    </div>
  );
}
