"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { SwitchingSignalsResponse, OpportunitySignals, SwitchLikelihood } from "@/lib/api";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { downloadCsv, csvFilename } from "@/lib/csv-export";

// Resolve + download a file (used for the certified Form 471 PDF from USAC).
// USAC certified PDFs live on publicdata.usac.org and block cross-origin fetch,
// so route those through the backend proxy; fall back to opening in a new tab.
async function forceDownloadFile(url: string, suggestedFilename?: string): Promise<void> {
  try {
    let fetchUrl = url;
    try {
      const u = new URL(url);
      if (u.hostname === "publicdata.usac.org") {
        fetchUrl = `/api/v1/vendor/rfp-download?url=${encodeURIComponent(url)}`;
      }
    } catch { /* not a parseable URL - direct fetch */ }
    const response = await fetch(fetchUrl, { method: "GET", credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    let filename = suggestedFilename || url.split("/").pop() || "document.pdf";
    try { filename = decodeURIComponent(filename); } catch { /* leave as-is */ }
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

// Types
interface PredictedLead {
  id: number;
  prediction_type: string;
  confidence_score: number;
  prediction_reason: string;
  predicted_action_date: string | null;
  ben: string;
  organization_name: string;
  state: string;
  city: string | null;
  entity_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  funding_year: number | null;
  discount_rate: number | null;
  estimated_deal_value: number | null;
  service_type: string | null;
  manufacturer: string | null;
  equipment_model: string | null;
  product_type: string | null;
  contract_expiration_date: string | null;
  contract_number: string | null;
  current_provider_name: string | null;
  c2_budget_total: number | null;
  c2_budget_remaining: number | null;
  c2_budget_cycle: string | null;
  application_number: string | null;
  frn: string | null;
  status: string;
  created_at: string;
  // Unified "Opportunities" fields (present when fetched with unified=true).
  signals?: OpportunitySignals;
  signal_types?: string[];
  switch_likelihood?: SwitchLikelihood;
  estimated_deal_value_basis?: string;
  equipment_original_cost?: number | null;
  equipment_funding_year?: number | null;
}

interface PredictionStats {
  total_predictions: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  average_confidence: number;
  total_estimated_value: number;
  top_states: { state: string; count: number }[];
  top_manufacturers: { manufacturer: string; count: number }[];
  last_refresh: {
    batch_id: string;
    started_at: string | null;
    completed_at: string | null;
    status: string;
    total_predictions: number;
    duration_seconds: number | null;
  } | null;
}

const PREDICTION_TYPE_CONFIG: Record<string, { label: string; icon: string; color: string; bgColor: string }> = {
  contract_expiry: {
    label: "Contract Expiring",
    icon: "⏰",
    color: "text-red-700",
    bgColor: "bg-red-50 border-red-200",
  },
  equipment_refresh: {
    label: "Equipment Refresh",
    icon: "🔄",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
  },
  c2_budget_reset: {
    label: "C2 Budget Opportunity",
    icon: "💰",
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
  },
  historical_pattern: {
    label: "Historical Pattern",
    icon: "📊",
    color: "text-purple-700",
    bgColor: "bg-purple-50 border-purple-200",
  },
};

// Small badge config for the unified-opportunity signals (Ari #1). Each entity
// shows one badge per applicable signal instead of a single prediction type.
const SIGNAL_BADGE_CONFIG: Record<string, { label: string; icon: string; className: string }> = {
  contract_expiry: { label: "Contract expiring", icon: "⏰", className: "bg-red-50 border-red-200 text-red-700" },
  equipment_refresh: { label: "Equipment refresh", icon: "🔄", className: "bg-blue-50 border-blue-200 text-blue-700" },
  c2_budget: { label: "C2 budget", icon: "💰", className: "bg-green-50 border-green-200 text-green-700" },
};

// Which signals apply to a lead. Prefers the unified signal_types list; falls
// back to the legacy single prediction_type so non-unified data still renders.
type SignalKey = "contract_expiry" | "equipment_refresh" | "c2_budget";
function hasSignal(lead: PredictedLead, key: SignalKey): boolean {
  if (lead.signal_types && lead.signal_types.length > 0) return lead.signal_types.includes(key);
  if (key === "equipment_refresh") return lead.prediction_type === "equipment_refresh";
  if (key === "contract_expiry") return lead.prediction_type === "contract_expiry";
  if (key === "c2_budget") return lead.prediction_type === "c2_budget_reset";
  return false;
}

// Ordered list of signal keys present on a lead (for badge rendering).
function leadSignals(lead: PredictedLead): SignalKey[] {
  const order: SignalKey[] = ["contract_expiry", "equipment_refresh", "c2_budget"];
  return order.filter((k) => hasSignal(lead, k));
}

// Switch-likelihood badge styling by level.
const SWITCH_LEVEL_CLASS: Record<string, string> = {
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700" },
  viewed: { label: "Viewed", color: "bg-slate-100 text-slate-700" },
  contacted: { label: "Contacted", color: "bg-yellow-100 text-yellow-700" },
  converted: { label: "Converted", color: "bg-green-100 text-green-700" },
  dismissed: { label: "Dismissed", color: "bg-red-100 text-red-700" },
};

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" }, { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "VI", name: "Virgin Islands" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Estimated inflation-adjusted replacement cost for aging equipment (Ari loom-1
// #3). The lead only carries the ORIGINAL one-time cost from the funding year it
// was purchased; vendors want a defensible "what would it cost to replace today"
// figure. Simple rule: compound the original cost ~3%/yr over the years since
// purchase. This is a rough ESTIMATE for selling context, not an authoritative
// quote. Returns null when we can't compute it (missing original cost).
const EQUIPMENT_INFLATION_RATE = 0.03;
function estReplacementCost(lead: PredictedLead): number | null {
  if (!hasSignal(lead, "equipment_refresh")) return null;
  // Unified opportunities carry the equipment line's own original cost/year
  // separately from the aggregate headline value; fall back to lead-level for
  // legacy (non-unified) equipment_refresh leads.
  const original = lead.equipment_original_cost ?? lead.estimated_deal_value;
  if (original === null || original === undefined || original <= 0) return null;
  const fy = lead.equipment_funding_year ?? lead.funding_year;
  if (!fy) return null;
  const years = new Date().getFullYear() - Number(fy);
  if (!isFinite(years) || years <= 0) return original; // already current-year
  return original * Math.pow(1 + EQUIPMENT_INFLATION_RATE, years);
}

// E-Rate Category 2 per-student budget multiplier for the current 5-yr cycle
// (~$167/student). Used for a "budget-based sizing" estimate: N students x $167
// (Ari loom Q1b). A rough allowance-based figure, clearly labeled an estimate.
const C2_PER_STUDENT = 167;

// Compute an ALWAYS-CURRENT expiry status from the contract date. The backend
// bakes "expiring in N months" into prediction_reason at generation time and
// never refreshes it, so a lead created in April still reads "in 3 months" in
// July even though the contract already expired. Computing live here keeps the
// label accurate for every lead, old or new.
function expiryStatus(dateStr: string | null): { label: string; expired: boolean } | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp.getTime())) return null;
  const days = Math.round((exp.getTime() - Date.now()) / 86400000);
  const monthYear = exp.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  if (days < -31) {
    const months = Math.max(1, Math.round(-days / 30));
    return { label: `Expired ${months} month${months === 1 ? "" : "s"} ago (${monthYear})`, expired: true };
  }
  if (days < 0) {
    const d = -days;
    return { label: `Expired ${d} day${d === 1 ? "" : "s"} ago (${monthYear})`, expired: true };
  }
  if (days === 0) return { label: `Expires today (${monthYear})`, expired: false };
  if (days < 31) return { label: `Expires in ${days} day${days === 1 ? "" : "s"} (${monthYear})`, expired: false };
  const months = Math.round(days / 30);
  return { label: `Expires in ${months} month${months === 1 ? "" : "s"} (${monthYear})`, expired: false };
}

// Return the prediction reason with the stale leading "Contract expiring in ..."
// sentence replaced by the live-computed status (contract-expiry leads only).
function displayReason(lead: PredictedLead): string {
  if (lead.prediction_type === "contract_expiry" && lead.contract_expiration_date) {
    const st = expiryStatus(lead.contract_expiration_date);
    if (st) {
      const rest = (lead.prediction_reason || "").replace(/^\s*Contract expiring in[^.]*\.\s*/i, "");
      const opener = st.expired
        ? `Contract ${st.label.toLowerCase()} \u2014 rebid opportunity now.`
        : `Contract ${st.label.toLowerCase()}.`;
      return `${opener} ${rest}`.trim();
    }
  }
  return lead.prediction_reason;
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let color = "bg-slate-100 text-slate-600";
  if (pct >= 80) color = "bg-green-100 text-green-700";
  else if (pct >= 60) color = "bg-yellow-100 text-yellow-700";
  else if (pct >= 40) color = "bg-orange-100 text-orange-700";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {pct}% confidence
    </span>
  );
}

export default function PredictedLeadsTab({ onView471, onView470 }: { onView471?: (ben: string, year?: number, frn?: string) => void; onView470?: (applicationNumber: string) => void }) {
  const [leads, setLeads] = useState<PredictedLead[]>([]);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedLead, setSelectedLead] = useState<PredictedLead | null>(null);
  // Form 470 filing check for the selected entity (Ari request): did they post a 470?
  const [f470Loading, setF470Loading] = useState(false);
  const [f470Result, setF470Result] = useState<{ filed: boolean; leads: { application_number: string; funding_year: string; entity_name: string }[] } | null>(null);
  // Entity's current C2 budget, fetched on-demand when a lead is opened (Ari
  // loom-1 #2/#3): estimated need vs available Category 2 budget shown inline.
  const [c2Budget, setC2Budget] = useState<{ remaining: number | null; total: number | null; cycle: string | null; students: number | null; found: boolean } | null>(null);
  const [c2BudgetLoading, setC2BudgetLoading] = useState(false);
  // AI "today's equivalent equipment cost" estimate (Ari loom Q1c), fetched
  // on-demand for equipment_refresh leads. Cached server-side; hidden on failure.
  const [equipEstimate, setEquipEstimate] = useState<{ estimate: number; rationale: string; qty: number | null; deploymentTotal: number | null } | null>(null);
  const [equipEstimateLoading, setEquipEstimateLoading] = useState(false);
  // Switching signals inferred from USAC filing history (Ari loom Q2).
  const [switchSignals, setSwitchSignals] = useState<SwitchingSignalsResponse["signals"] | null>(null);
  const [switchSignalsLoading, setSwitchSignalsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Save & Enrich state
  const [isSaving, setIsSaving] = useState(false);
  const [savedLeadId, setSavedLeadId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState<Record<string, any> | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterState, setFilterState] = useState<string>("");
  const [filterManufacturer, setFilterManufacturer] = useState<string>("");
  const [filterEntityType, setFilterEntityType] = useState<string>("");
  const [filterServiceType, setFilterServiceType] = useState<string>("");
  const [filterName, setFilterName] = useState<string>("");
  const [filterMinAmount, setFilterMinAmount] = useState<string>("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("confidence_score");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const fetchLeads = useCallback(async (newOffset = 0) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      // Unified "Opportunities": one row per entity merging all signal types.
      params.append("unified", "true");
      // The former prediction-type dropdown is now an OPTIONAL signal scope.
      if (filterType) params.append("signal", filterType);
      if (filterState) params.append("state", filterState);
      if (filterManufacturer) params.append("manufacturer", filterManufacturer);
      if (filterEntityType) params.append("entity_type", filterEntityType);
      if (filterServiceType) params.append("service_type", filterServiceType);
      if (filterName.trim()) params.append("name", filterName.trim());
      if (filterMinAmount && !isNaN(Number(filterMinAmount))) {
        params.append("min_deal_value", filterMinAmount);
      }
      if (filterMaxAmount && !isNaN(Number(filterMaxAmount))) {
        params.append("max_deal_value", filterMaxAmount);
      }
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);
      params.append("limit", String(limit));
      params.append("offset", String(newOffset));

      const response = await api.get(`/vendor/predicted-leads?${params.toString()}`);
      const data = response.data;

      if (data.success) {
        setLeads(data.data || []);
        setTotal(data.total || 0);
        setHasMore(data.has_more || false);
        setOffset(newOffset);
      }
    } catch (error) {
      console.error("Failed to fetch predicted leads:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterState, filterManufacturer, filterEntityType, filterServiceType, filterName, filterMinAmount, filterMaxAmount, sortBy, sortOrder]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get("/vendor/predicted-leads/stats");
      const data = response.data;
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch prediction stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchLeads(0);
    fetchStats();
  }, [fetchLeads, fetchStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await api.post("/vendor/predicted-leads/refresh");
      // Re-fetch after refresh
      await Promise.all([fetchLeads(0), fetchStats()]);
    } catch (error) {
      console.error("Failed to refresh predictions:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStatusUpdate = async (leadId: number, newStatus: string) => {
    try {
      await api.patch(`/vendor/predicted-leads/${leadId}/status`, {
        status: newStatus,
      });
      // Update locally
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  // Fetch the entity's current Category 2 budget on-demand (Ari loom-1 #2/#3)
  // so the lead detail can show estimated need vs available C2 budget inline.
  const fetchEntityC2Budget = async (ben: string) => {
    setC2Budget(null);
    setC2BudgetLoading(true);
    try {
      const res = await api.getEntityC2Budget(ben);
      const d = res.data;
      if (d && d.success && d.found) {
        setC2Budget({ remaining: d.c2_budget_remaining ?? null, total: d.c2_budget_total ?? null, cycle: d.c2_budget_cycle ?? null, students: d.full_time_students ?? null, found: true });
      } else {
        setC2Budget({ remaining: null, total: null, cycle: null, students: null, found: false });
      }
    } catch {
      setC2Budget({ remaining: null, total: null, cycle: null, students: null, found: false });
    } finally {
      setC2BudgetLoading(false);
    }
  };

  // Fetch the AI "today's equivalent equipment cost" estimate on-demand for an
  // equipment_refresh lead (Ari loom Q1c). Non-blocking: rendered separately and
  // hidden entirely on failure so a junk/missing estimate never breaks the view.
  const fetchEquipmentEstimate = async (lead: PredictedLead) => {
    setEquipEstimate(null);
    const mfr = lead.manufacturer || "";
    const mdl = lead.equipment_model || "";
    if (!hasSignal(lead, "equipment_refresh") || (!mfr && !mdl)) return;
    setEquipEstimateLoading(true);
    try {
      const fy = lead.equipment_funding_year ?? lead.funding_year;
      const orig = lead.equipment_original_cost ?? lead.estimated_deal_value;
      const res = await api.getEquipmentEstimate(mfr, mdl, undefined, fy ?? undefined, orig ?? undefined, lead.frn ?? undefined);
      const d = res.data;
      if (d && d.success && d.found && typeof d.estimate_usd === "number" && d.estimate_usd > 0) {
        setEquipEstimate({
          estimate: d.estimate_usd,
          rationale: d.rationale || "",
          qty: typeof d.qty === "number" && d.qty > 0 ? d.qty : null,
          deploymentTotal: typeof d.deployment_total === "number" && d.deployment_total > 0 ? d.deployment_total : null,
        });
      } else {
        setEquipEstimate(null);
      }
    } catch {
      setEquipEstimate(null);
    } finally {
      setEquipEstimateLoading(false);
    }
  };

  // Fetch inferred "switching signals" from USAC filing history (Ari loom Q2).
  const fetchSwitchingSignals = async (ben: string) => {
    setSwitchSignals(null);
    setSwitchSignalsLoading(true);
    try {
      const res = await api.getSwitchingSignals(ben);
      const d = res.data;
      if (d && d.success && d.signals) {
        setSwitchSignals(d.signals);
      } else {
        setSwitchSignals(null);
      }
    } catch {
      setSwitchSignals(null);
    } finally {
      setSwitchSignalsLoading(false);
    }
  };

  // Reset save/enrich state when selecting a new lead
  const handleSelectLead = (lead: PredictedLead) => {
    setSelectedLead(lead);
    setSavedLeadId(null);
    setSaveError(null);
    setEnrichedData(null);
    setEnrichError(null);
    setF470Result(null);
    setF470Loading(false);
    // Look up the entity's current C2 budget for the estimated-need context.
    if (lead.ben) fetchEntityC2Budget(lead.ben);
    else setC2Budget(null);
    // AI current-equivalent equipment estimate (equipment_refresh only) + the
    // entity's inferred switching signals (Ari loom Q1c / Q2).
    fetchEquipmentEstimate(lead);
    if (lead.ben) fetchSwitchingSignals(lead.ben);
    else setSwitchSignals(null);
  };

  // Check whether the selected entity has posted a Form 470 this cycle.
  const checkForm470 = async () => {
    if (!selectedLead?.ben) return;
    setF470Loading(true);
    try {
      const res = await api.get470ByBen(selectedLead.ben);
      const leads = (res.data?.leads || []).map((l) => ({
        application_number: l.application_number,
        funding_year: l.funding_year,
        entity_name: l.entity_name,
      }));
      setF470Result({ filed: leads.length > 0, leads });
    } catch {
      setF470Result({ filed: false, leads: [] });
    } finally {
      setF470Loading(false);
    }
  };

  // Download the underlying Form 471 (contract/line-item data) for this prediction (Ari #1)
  const [download471Loading, setDownload471Loading] = useState(false);
  const downloadForm471 = async () => {
    if (!selectedLead) return;
    setDownload471Loading(true);
    try {
      // Prefer FRN-level line items (full contract detail); fall back to entity 471 records.
      if (selectedLead.frn) {
        const res = await api.get471LineItemsByFrn(selectedLead.frn);
        if (res.success && res.data && res.data.line_items.length > 0) {
          const columns = ['funding_year', 'funding_request_number', 'line_item_number', 'ben', 'organization_name', 'state', 'function', 'product', 'manufacturer', 'model', 'unit', 'quantity', 'unit_cost', 'extended_cost', 'months_of_service'];
          downloadCsv(csvFilename(`form471_${selectedLead.frn}`), columns, res.data.line_items.map((li) => ({ ...li })));
          return;
        }
      }
      if (selectedLead.ben) {
        const yr = selectedLead.funding_year ? Number(selectedLead.funding_year) : undefined;
        const res = await api.get471ByEntity(selectedLead.ben, yr);
        if (res.success && res.data && res.data.records.length > 0) {
          const columns = ['funding_year', 'frn', 'application_number', 'service_provider_name', 'service_provider_spin', 'service_type', 'category', 'committed_amount', 'pre_discount_amount', 'discount_rate', 'frn_status', 'product_description'];
          downloadCsv(csvFilename(`form471_ben_${selectedLead.ben}`), columns, res.data.records.map((r) => ({ ...r })));
        }
      }
    } catch {
      // swallow; button re-enables in finally
    } finally {
      setDownload471Loading(false);
    }
  };

  // Download the REAL certified Form 471 PDF from USAC (Ari loom-1 #4 - the CSV
  // "isn't real"). Resolve the 471 application number, then the certified file.
  const [pdf471Loading, setPdf471Loading] = useState(false);
  const [pdf471Error, setPdf471Error] = useState<string | null>(null);
  const downloadForm471PDF = async () => {
    if (!selectedLead) return;
    setPdf471Loading(true);
    setPdf471Error(null);
    try {
      const yr = selectedLead.funding_year ? Number(selectedLead.funding_year) : undefined;
      // The certified PDF is keyed by the 471 application number. Prefer the one
      // on the prediction; otherwise resolve it from the entity's 471 records.
      let appNum = (selectedLead.application_number || "").trim();
      if (!appNum && selectedLead.ben) {
        const rec = await api.get471ByEntity(selectedLead.ben, yr);
        if (rec.success && rec.data && rec.data.records.length > 0) {
          const records = rec.data.records;
          const match = selectedLead.frn ? records.find((r) => r.frn === selectedLead.frn) : undefined;
          appNum = (match?.application_number || records[0].application_number || "").trim();
        }
      }
      if (!appNum) {
        setPdf471Error("No certified Form 471 application found for this entity yet.");
        return;
      }
      const resp = await api.vendorFormPdfUrl('471', appNum);
      const url = resp.success && resp.data ? resp.data.pdf_url : null;
      if (url) {
        await forceDownloadFile(url, `FCC_Form_471_${appNum}_CERTIFIED.pdf`);
      } else {
        setPdf471Error("USAC has not published a certified Form 471 PDF for this application yet.");
      }
    } catch {
      setPdf471Error("Could not fetch the Form 471 PDF. Please try again.");
    } finally {
      setPdf471Loading(false);
    }
  };

  const handleSaveAsLead = async () => {
    if (!selectedLead) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await api.savePredictedLead(selectedLead.id);
      if (!response.success) {
        const errMsg = response.error || "Failed to save lead";
        setSaveError(errMsg);
        // If already saved, still show success state
        if (errMsg.includes("already been saved")) {
          setSavedLeadId(-1);
        }
        return;
      }
      const data = response.data as any;
      if (data?.success) {
        setSavedLeadId(data.lead?.id || -1);
        // Mark as converted locally
        setLeads((prev) =>
          prev.map((l) => (l.id === selectedLead.id ? { ...l, status: "converted" } : l))
        );
        setSelectedLead({ ...selectedLead, status: "converted" });
      } else {
        setSaveError(data?.error || "Failed to save lead");
        if (data?.error?.includes("already been saved") && data?.lead?.id) {
          setSavedLeadId(data.lead.id);
        }
      }
    } catch (error: any) {
      setSaveError(error?.message || "Failed to save lead");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnrich = async () => {
    if (!selectedLead) return;
    setIsEnriching(true);
    setEnrichError(null);
    try {
      const response = await api.enrichPredictedLead(selectedLead.id);
      if (!response.success) {
        setEnrichError(response.error || "Failed to enrich contact");
        return;
      }
      const data = response.data as any;
      if (data?.success && data?.enrichment) {
        setEnrichedData(data.enrichment);
        // Update the selected lead with new contact info if available
        if (data.prediction) {
          const updated = {
            ...selectedLead,
            contact_name: data.prediction.contact_name || selectedLead.contact_name,
            contact_email: data.prediction.contact_email || selectedLead.contact_email,
            contact_phone: data.prediction.contact_phone || selectedLead.contact_phone,
          };
          setSelectedLead(updated);
          setLeads((prev) =>
            prev.map((l) => (l.id === selectedLead.id ? updated : l))
          );
        }
      } else {
        setEnrichError(data?.error || "No enrichment data available");
      }
    } catch (error: any) {
      setEnrichError(error?.message || "Failed to enrich contact");
    } finally {
      setIsEnriching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            🔮 Opportunities
          </h2>
          <p className="text-slate-500 mt-1">
            One unified list of schools likely to buy — each entity shows every signal that applies (contract expiring, equipment refresh, C2 budget) plus a switch-likelihood score
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
        >
          {isRefreshing ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Analyzing...
            </>
          ) : (
            <>🔄 Refresh Predictions</>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total Predictions</span>
              <span className="text-2xl">🎯</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mt-2">
              {stats.total_predictions.toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Avg confidence: {Math.round(stats.average_confidence * 100)}%
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Estimated Value</span>
              <span className="text-2xl">💰</span>
            </div>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatCurrency(stats.total_estimated_value)}
            </p>
            <p className="text-xs text-slate-400 mt-1">Total opportunity pipeline</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Expiring Contracts</span>
              <span className="text-2xl">⏰</span>
            </div>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {(stats.by_type?.contract_expiry || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">Within next 12 months</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Equipment Refresh</span>
              <span className="text-2xl">🔄</span>
            </div>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {(stats.by_type?.equipment_refresh || 0).toLocaleString()}
            </p>
            <p className="text-xs text-slate-400 mt-1">Aging equipment leads</p>
          </div>
        </div>
      )}

      {/* Last Refresh Info */}
      {stats?.last_refresh && (
        <div className="flex items-center gap-3 text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
          <span>Last refresh:</span>
          <span className="font-medium text-slate-700">
            {formatDate(stats.last_refresh.completed_at || stats.last_refresh.started_at)}
          </span>
          <span>•</span>
          <span>{stats.last_refresh.total_predictions} predictions generated</span>
          {stats.last_refresh.duration_seconds && (
            <>
              <span>•</span>
              <span>{stats.last_refresh.duration_seconds.toFixed(1)}s</span>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Filters:</span>

          <input
            type="text"
            placeholder="Applicant name…"
            value={filterName}
            onChange={(e) => { setFilterName(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          <select
            value={filterServiceType}
            onChange={(e) => { setFilterServiceType(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">All Service Types (Cat 1 & 2)</option>
            <option value="internet">Internet</option>
            <option value="data-transmission">Data Transmission</option>
            <option value="equipment">Equipment (Internal Connections)</option>
            <option value="voice">Voice</option>
            <option value="mibs">MIBS</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            title="Optional: scope the list to entities with a specific signal"
          >
            <option value="">All Signals</option>
            <option value="contract_expiry">⏰ Has contract expiring</option>
            <option value="equipment_refresh">🔄 Has equipment refresh</option>
            <option value="c2_budget">💰 Has C2 budget</option>
          </select>

          <select
            value={filterEntityType}
            onChange={(e) => { setFilterEntityType(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">All School Types</option>
            <option value="School District">School District</option>
            <option value="Library">Library</option>
            <option value="Library System">Library System</option>
            <option value="Consortium">Consortium</option>
            <option value="School">School</option>
            <option value="Charter School">Charter School</option>
            <option value="Private School">Private School</option>
            <option value="State Agency">State Agency</option>
          </select>


          <select
            value={filterState}
            onChange={(e) => { setFilterState(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">All States</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Manufacturer"
            value={filterManufacturer}
            onChange={(e) => { setFilterManufacturer(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-40 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          <select
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split(":");
              setSortBy(field);
              setSortOrder(order);
              setOffset(0);
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="confidence_score:desc">Confidence (High → Low)</option>
            <option value="confidence_score:asc">Confidence (Low → High)</option>
            <option value="estimated_deal_value:desc">Value (High → Low)</option>
            <option value="estimated_deal_value:asc">Value (Low → High)</option>
            <option value="c2_budget_total:desc">C2 Budget (High → Low)</option>
            <option value="c2_budget_total:asc">C2 Budget (Low → High)</option>
            <option value="organization_name:asc">Entity Name (A → Z)</option>
            <option value="organization_name:desc">Entity Name (Z → A)</option>
            <option value="predicted_action_date:asc">Action Date (Soonest)</option>
            <option value="created_at:desc">Newest First</option>
          </select>

          <input
            type="number"
            placeholder="Min funding $"
            value={filterMinAmount}
            onChange={(e) => { setFilterMinAmount(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <input
            type="number"
            placeholder="Max funding $"
            value={filterMaxAmount}
            onChange={(e) => { setFilterMaxAmount(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

          <span className="ml-auto text-sm text-slate-500">
            {total.toLocaleString()} results
          </span>
        </div>
      </div>

      {/* Content: Split view (list + detail) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Lead List */}
        <div className="lg:col-span-3 space-y-3">
          {isLoading ? (
            <SkeletonRows rows={6} height="h-28" />
          ) : leads.length === 0 ? (
            (filterType || filterState || filterManufacturer || filterEntityType || filterServiceType || filterName || filterMinAmount || filterMaxAmount) ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <span className="text-5xl mb-4 block">🔍</span>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No leads match these filters</h3>
                <p className="text-slate-500 mb-4">
                  No predicted leads match your current filters
                  {filterType ? ` for “${PREDICTION_TYPE_CONFIG[filterType]?.label || filterType}”` : ""}.
                  Try clearing or widening the filters.
                </p>
                <button
                  onClick={() => {
                    setFilterType(""); setFilterState(""); setFilterManufacturer("");
                    setFilterEntityType(""); setFilterServiceType(""); setFilterName("");
                    setFilterMinAmount(""); setFilterMaxAmount(""); setOffset(0);
                  }}
                  className="px-6 py-2 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <span className="text-5xl mb-4 block">🔮</span>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">No Predictions Yet</h3>
                <p className="text-slate-500 mb-4">
                  Click &quot;Refresh Predictions&quot; to analyze USAC data and generate predictive leads.
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {isRefreshing ? "Analyzing..." : "Generate Predictions"}
                </button>
              </div>
            )
          ) : (
            <>
              {leads.map((lead) => {
                const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                const isSelected = selectedLead?.id === lead.id;
                const signals = leadSignals(lead);
                const sw = lead.switch_likelihood;

                return (
                  <div
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? "border-purple-400 ring-2 ring-purple-100 shadow-md"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex items-center flex-wrap gap-1.5">
                        {signals.length > 0 ? (
                          signals.map((k) => {
                            const b = SIGNAL_BADGE_CONFIG[k];
                            return (
                              <span
                                key={k}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${b.className}`}
                              >
                                {b.icon} {b.label}
                              </span>
                            );
                          })
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-slate-50 border-slate-200 text-slate-700">
                            📋 {lead.prediction_type}
                          </span>
                        )}
                        <ConfidenceBadge score={lead.confidence_score} />
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                      {lead.estimated_deal_value && (
                        <span className="text-sm font-semibold text-green-600 whitespace-nowrap">
                          {formatCurrency(lead.estimated_deal_value)}
                        </span>
                      )}
                    </div>

                    {sw && (
                      <div className="flex items-center flex-wrap gap-1.5 mb-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${SWITCH_LEVEL_CLASS[sw.level] || SWITCH_LEVEL_CLASS.low}`}
                          title={sw.reason}
                        >
                          🎯 Switch-likelihood: {sw.level.charAt(0).toUpperCase() + sw.level.slice(1)}
                        </span>
                        {sw.at_risk === true && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-rose-100 text-rose-700 border-rose-200">
                            ⚠ Your customer at risk
                          </span>
                        )}
                      </div>
                    )}

                    <h3 className="font-semibold text-slate-900 mb-1">
                      {lead.organization_name}
                    </h3>

                    <div className="flex items-center gap-3 text-sm text-slate-500 mb-2">
                      <span>📍 {lead.state}{lead.city ? `, ${lead.city}` : ""}</span>
                      {lead.manufacturer && <span>🏭 {lead.manufacturer}</span>}
                      {lead.predicted_action_date && (
                        <span>📅 Action by {formatDate(lead.predicted_action_date)}</span>
                      )}
                    </div>

                    {(() => {
                      const st = hasSignal(lead, "contract_expiry")
                        ? expiryStatus(lead.contract_expiration_date)
                        : null;
                      return st ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 mb-2 rounded-full text-xs font-medium ${
                            st.expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          ⏰ {st.label}
                        </span>
                      ) : null;
                    })()}

                    <p className="text-sm text-slate-600 line-clamp-2">
                      {displayReason(lead)}
                    </p>
                  </div>
                );
              })}

              {/* Pagination */}
              <div className="flex items-center justify-between pt-2">
                <button
                  disabled={offset === 0}
                  onClick={() => fetchLeads(Math.max(0, offset - limit))}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <span className="text-sm text-slate-500">
                  Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                </span>
                <button
                  disabled={!hasMore}
                  onClick={() => fetchLeads(offset + limit)}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2">
          {selectedLead ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              {/* Signal Badges — every signal that applies to this entity */}
              <div className="flex items-center flex-wrap gap-1.5 mb-4">
                {leadSignals(selectedLead).length > 0 ? (
                  leadSignals(selectedLead).map((k) => {
                    const b = SIGNAL_BADGE_CONFIG[k];
                    return (
                      <span key={k} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${b.className}`}>
                        {b.icon} {b.label}
                      </span>
                    );
                  })
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border bg-slate-50 border-slate-200 text-slate-700">
                    📋 {selectedLead.prediction_type}
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-1">
                {selectedLead.organization_name}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                BEN: {selectedLead.ben} • {selectedLead.state}
                {selectedLead.city ? `, ${selectedLead.city}` : ""}
              </p>

              {/* Switch-likelihood + at-risk callout (Ari #1): are they likely to
                  switch, is there an opening to win, or is this MY customer at risk? */}
              {selectedLead.switch_likelihood && (
                <div className={`rounded-xl p-3 mb-4 border ${
                  selectedLead.switch_likelihood.at_risk === true
                    ? "bg-rose-50 border-rose-200"
                    : selectedLead.switch_likelihood.level === "high"
                    ? "bg-orange-50 border-orange-200"
                    : selectedLead.switch_likelihood.level === "medium"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-slate-50 border-slate-200"
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      🎯 Switch-likelihood: <span className="capitalize">{selectedLead.switch_likelihood.level}</span>
                      <span className="text-slate-400 font-normal">({selectedLead.switch_likelihood.score}/100)</span>
                    </span>
                    {selectedLead.switch_likelihood.at_risk === true ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                        ⚠ Your customer at risk
                      </span>
                    ) : selectedLead.switch_likelihood.at_risk === false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        Opportunity to win
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-600">{selectedLead.switch_likelihood.reason}</p>
                </div>
              )}

              {/* Confidence & Value */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-xs text-slate-500 block">Confidence</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                        style={{ width: `${selectedLead.confidence_score * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                      {Math.round(selectedLead.confidence_score * 100)}%
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <span className="text-xs text-slate-500 block">Est. Deal Value</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatCurrency(selectedLead.estimated_deal_value)}
                  </span>
                </div>
              </div>

              {/* Prediction Reason */}
              <div className="bg-purple-50 rounded-xl p-4 mb-4">
                <span className="text-xs font-medium text-purple-600 block mb-1">
                  🔮 AI Prediction
                </span>
                <p className="text-sm text-purple-900">{displayReason(selectedLead)}</p>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-4">
                {selectedLead.predicted_action_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Action Date</span>
                    <span className="font-medium text-slate-700">
                      {formatDate(selectedLead.predicted_action_date)}
                    </span>
                  </div>
                )}
                {selectedLead.contract_expiration_date && (() => {
                  const st = expiryStatus(selectedLead.contract_expiration_date);
                  return (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Contract Expires</span>
                      <span className="font-medium text-red-600 text-right">
                        {formatDate(selectedLead.contract_expiration_date)}
                        {st && (
                          <span className={`block text-xs font-normal ${st.expired ? "text-red-500" : "text-amber-600"}`}>
                            {st.label}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })()}
                {selectedLead.current_provider_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Current Provider</span>
                    <span className="font-medium text-slate-700">
                      {selectedLead.current_provider_name}
                    </span>
                  </div>
                )}
                {selectedLead.manufacturer && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Manufacturer</span>
                    <span className="font-medium text-slate-700">{selectedLead.manufacturer}</span>
                  </div>
                )}
                {selectedLead.equipment_model && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Model</span>
                    <span className="font-medium text-slate-700 text-right max-w-[60%] truncate" title={selectedLead.equipment_model}>
                      {selectedLead.equipment_model}
                    </span>
                  </div>
                )}
                {selectedLead.service_type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Service Type</span>
                    <span className="font-medium text-slate-700">{selectedLead.service_type}</span>
                  </div>
                )}
                {selectedLead.discount_rate !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Discount Rate</span>
                    <span className="font-medium text-slate-700">
                      {Math.round((selectedLead.discount_rate || 0) * 100)}%
                    </span>
                  </div>
                )}
                {selectedLead.c2_budget_cycle && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Budget Cycle</span>
                      <span className="font-medium text-slate-700">{selectedLead.c2_budget_cycle}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Budget Remaining</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(selectedLead.c2_budget_remaining)} / {formatCurrency(selectedLead.c2_budget_total)}
                      </span>
                    </div>
                    {typeof selectedLead.c2_budget_remaining === "number" && selectedLead.c2_budget_remaining > 0 ? (
                      <p className="text-[11px] text-green-600 -mt-1">
                        ≈ up to {formatCurrency(selectedLead.c2_budget_remaining)} available to spend this cycle
                      </p>
                    ) : typeof selectedLead.c2_budget_remaining === "number" && selectedLead.c2_budget_remaining <= 0 ? (
                      <p className="text-[11px] text-amber-600 -mt-1">
                        C2 budget fully committed this cycle
                      </p>
                    ) : null}
                  </>
                )}

                {/* Equipment refresh: estimated inflation-adjusted replacement
                    cost (Ari loom-1 #3 - the lead only shows the ORIGINAL cost).
                    Three estimates shown together (Ari loom Q1): (a) inflation-
                    adjusted original, (b) student-based sizing, (c) AI current-
                    equivalent equipment cost. All clearly labeled as estimates. */}
                {hasSignal(selectedLead, "equipment_refresh") && (() => {
                  const repl = estReplacementCost(selectedLead);
                  const original = selectedLead.equipment_original_cost ?? selectedLead.estimated_deal_value;
                  const equipYear = selectedLead.equipment_funding_year ?? selectedLead.funding_year;
                  const years = equipYear ? new Date().getFullYear() - Number(equipYear) : null;
                  const students = c2Budget?.students && c2Budget.students > 0 ? c2Budget.students : null;
                  const studentEst = students ? students * C2_PER_STUDENT : null;
                  const hasAnything = original || repl !== null || studentEst !== null || equipEstimate || equipEstimateLoading;
                  if (!hasAnything) return null;
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-700">Replacement estimate</span>
                        <span className="text-[10px] uppercase tracking-wide text-blue-400 font-semibold">Estimate</span>
                      </div>
                      {original ? (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Original cost{equipYear ? ` (FY${equipYear})` : ""}</span>
                          <span className="font-medium text-slate-700">{formatCurrency(original)}</span>
                        </div>
                      ) : null}
                      {repl !== null ? (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Est. replacement (inflation-adjusted)</span>
                          <span className="font-bold text-blue-700">{formatCurrency(repl)}</span>
                        </div>
                      ) : null}
                      {repl !== null && years && years > 0 ? (
                        <p className="text-[11px] text-slate-400">~3%/yr over {years} yr{years === 1 ? "" : "s"} since purchase. Rough estimate, not a quote.</p>
                      ) : null}

                      {/* (b) Student-based sizing: N students x ~$167 C2 allowance. */}
                      {studentEst !== null ? (
                        <div className="pt-1.5 border-t border-blue-200/60">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Budget-based sizing</span>
                            <span className="font-medium text-indigo-700">{formatCurrency(studentEst)}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{students!.toLocaleString()} students &times; ${C2_PER_STUDENT}/student (C2 5-yr allowance). Rough estimate.</p>
                        </div>
                      ) : null}

                      {/* (c) AI "today's equivalent equipment cost" (Ari loom Q1c). */}
                      {equipEstimateLoading ? (
                        <div className="pt-1.5 border-t border-blue-200/60">
                          <p className="text-[11px] text-slate-400">Estimating current-equivalent equipment cost&hellip;</p>
                        </div>
                      ) : equipEstimate ? (
                        <div className="pt-1.5 border-t border-blue-200/60">
                          {equipEstimate.deploymentTotal && equipEstimate.qty ? (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">AI deployment estimate (equivalent gear)</span>
                                <span className="font-bold text-purple-700">{formatCurrency(equipEstimate.deploymentTotal)}</span>
                              </div>
                              {equipEstimate.rationale ? (
                                <p className="text-[11px] text-slate-500 mt-0.5">{equipEstimate.rationale}</p>
                              ) : null}
                              <p className="text-[11px] text-slate-400">&asymp; {equipEstimate.qty.toLocaleString()} unit{equipEstimate.qty === 1 ? "" : "s"} &times; {formatCurrency(equipEstimate.estimate)} each &mdash; rough AI estimate, not a quote.</p>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-500">AI: current unit price (equivalent gear)</span>
                                <span className="font-bold text-purple-700">{formatCurrency(equipEstimate.estimate)}</span>
                              </div>
                              {equipEstimate.rationale ? (
                                <p className="text-[11px] text-slate-500 mt-0.5">{equipEstimate.rationale}</p>
                              ) : null}
                              <p className="text-[11px] text-slate-400">Per-unit street price. Rough AI estimate, not a quote.</p>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Inline Category 2 budget fetched on-demand for leads that
                    don't already carry it (equipment refresh / contract expiry).
                    Ari loom-1 #2/#3: estimated need vs available C2 budget. */}
                {!selectedLead.c2_budget_cycle && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-green-700">💰 Category 2 Budget (this entity)</span>
                      {c2Budget?.cycle ? <span className="text-[10px] text-green-500 font-semibold">{c2Budget.cycle}</span> : null}
                    </div>
                    {c2BudgetLoading ? (
                      <p className="text-xs text-slate-400">Looking up C2 budget…</p>
                    ) : c2Budget?.found ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Remaining / Total</span>
                          <span className="font-medium text-green-700">
                            {formatCurrency(c2Budget.remaining)} / {formatCurrency(c2Budget.total)}
                          </span>
                        </div>
                        {typeof c2Budget.remaining === "number" && c2Budget.remaining > 0 ? (
                          <p className="text-[11px] text-green-600 mt-1">
                            ≈ up to {formatCurrency(c2Budget.remaining)} available to spend this cycle
                          </p>
                        ) : typeof c2Budget.remaining === "number" && c2Budget.remaining <= 0 ? (
                          <p className="text-[11px] text-amber-600 mt-1">
                            C2 budget fully committed this cycle
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">No current C2 budget on file for this entity.</p>
                    )}
                  </div>
                )}

                {/* Switching signals (Ari loom Q2): inferred hints from filing
                    history + the lead's own contract-expiry. Explicitly labeled
                    as signals inferred from filing history, NOT a satisfaction
                    score. Each signal is omitted when the data doesn't support it. */}
                {(() => {
                  const exp = selectedLead.contract_expiration_date ? expiryStatus(selectedLead.contract_expiration_date) : null;
                  // Only surface contract-expiry as a "switching signal" when it's
                  // expired or within ~12 months (a real rebid window).
                  const expDays = selectedLead.contract_expiration_date
                    ? Math.round((new Date(selectedLead.contract_expiration_date).getTime() - Date.now()) / 86400000)
                    : null;
                  const showExpiry = !!(exp && expDays !== null && expDays <= 366);
                  const tenure = switchSignals?.provider_tenure;
                  const switched = switchSignals?.recently_switched;
                  const hasSignal = showExpiry || !!tenure || !!switched;
                  if (!hasSignal && !switchSignalsLoading) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-amber-700">📡 Switching signals</span>
                        <span className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">Inferred</span>
                      </div>
                      <div className="space-y-1.5">
                        {showExpiry && exp ? (
                          <div className="flex items-start gap-1.5 text-sm">
                            <span className="text-amber-500">•</span>
                            <span className="text-slate-700">
                              {exp.label}
                              {selectedLead.current_provider_name ? <span className="text-slate-500"> — current provider {selectedLead.current_provider_name}</span> : null}
                            </span>
                          </div>
                        ) : null}
                        {tenure ? (
                          <div className="flex items-start gap-1.5 text-sm">
                            <span className="text-amber-500">•</span>
                            <span className="text-slate-700">{tenure.years} years with {tenure.provider}</span>
                          </div>
                        ) : null}
                        {switched ? (
                          <div className="flex items-start gap-1.5 text-sm">
                            <span className="text-amber-500">•</span>
                            <span className="text-slate-700">Switched providers recently ({switched.old} &rarr; {switched.new})</span>
                          </div>
                        ) : null}
                        {switchSignalsLoading && !hasSignal ? (
                          <p className="text-[11px] text-slate-400">Checking filing history&hellip;</p>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">Signals inferred from USAC filing history — not a satisfaction score.</p>
                    </div>
                  );
                })()}

                {selectedLead.contact_email && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Contact</span>
                    <a
                      href={`mailto:${selectedLead.contact_email}`}
                      className="font-medium text-purple-600 hover:underline truncate max-w-[60%]"
                    >
                      {selectedLead.contact_email}
                    </a>
                  </div>
                )}
                {selectedLead.frn && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">FRN</span>
                    <span className="font-mono text-slate-700">{selectedLead.frn}</span>
                  </div>
                )}
              </div>

              {/* Save & Enrich Actions */}
              <div className="flex gap-2 border-t border-slate-200 pt-4 mb-3">
                {savedLeadId ? (
                  <div className="flex-1 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium text-center">
                    ✅ Saved to Leads
                  </div>
                ) : (
                  <button
                    onClick={handleSaveAsLead}
                    disabled={isSaving}
                    className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isSaving ? (
                      <span className="flex items-center justify-center gap-1">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving...
                      </span>
                    ) : "💾 Save as Lead"}
                  </button>
                )}
                <button
                  onClick={handleEnrich}
                  disabled={isEnriching}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isEnriching ? (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enriching...
                    </span>
                  ) : "🔍 Enrich Contact"}
                </button>
              </div>

              {/* View the actual Form 471 / contract behind this prediction */}
              {onView471 && selectedLead.ben && (
                <button
                  onClick={() => onView471(selectedLead.ben, selectedLead.funding_year ?? undefined, selectedLead.frn ?? undefined)}
                  className="w-full px-3 py-2 mb-3 bg-white border border-purple-300 text-purple-700 rounded-xl text-sm font-medium hover:bg-purple-50 transition-all"
                >
                  🔎 View Form 471{selectedLead.funding_year ? ` (FY${selectedLead.funding_year})` : ""}
                </button>
              )}

              {/* Download the REAL certified Form 471 PDF (Ari loom-1 #4) + line-item CSV */}
              {selectedLead.ben && (
                <div className="mb-3 space-y-2">
                  <button
                    onClick={downloadForm471PDF}
                    disabled={pdf471Loading}
                    className="w-full px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {pdf471Loading ? "Preparing…" : `⬇️ Download Form 471 PDF${selectedLead.funding_year ? ` (FY${selectedLead.funding_year})` : ""}`}
                  </button>
                  <button
                    onClick={downloadForm471}
                    disabled={download471Loading}
                    className="w-full px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-xl text-xs font-medium hover:bg-emerald-50 transition-all disabled:opacity-50"
                  >
                    {download471Loading ? "Preparing…" : "Line items (CSV)"}
                  </button>
                  {pdf471Error && <p className="text-xs text-amber-700">{pdf471Error}</p>}
                </div>
              )}

              {/* Form 470 filing status — has this entity posted a 470 this cycle? */}
              {selectedLead.ben && (
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {f470Result === null ? (
                    <button
                      onClick={checkForm470}
                      disabled={f470Loading}
                      className="w-full px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {f470Loading ? (
                        <><span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></span> Checking…</>
                      ) : "📄 Check Form 470 filing"}
                    </button>
                  ) : f470Result.filed ? (
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Form 470 filed this cycle
                      </div>
                      <div className="space-y-1">
                        {f470Result.leads.slice(0, 4).map((l) => (
                          <button
                            key={l.application_number}
                            onClick={() => onView470 && onView470(l.application_number)}
                            disabled={!onView470}
                            className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-purple-50 hover:border-purple-200 transition-all flex items-center gap-2 disabled:cursor-default"
                          >
                            <span className="text-slate-700">FY{l.funding_year} · #{l.application_number}</span>
                            {onView470 && <span className="ml-auto text-purple-600 font-medium">View →</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                      No Form 470 posted this cycle yet.
                    </div>
                  )}
                </div>
              )}

              {/* Save Error */}
              {saveError && !savedLeadId && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  {saveError}
                </div>
              )}

              {/* Enriched Contacts Section */}
              {enrichedData && (
                <div className="mb-3 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                  <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-1">
                    📇 Enriched Contact Info
                    {enrichedData.from_cache && (
                      <span className="text-xs font-normal text-amber-500 ml-1">(cached)</span>
                    )}
                  </h4>

                  {/* Primary Contact */}
                  {enrichedData.person && Object.keys(enrichedData.person).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {enrichedData.person.full_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Name</span>
                          <span className="font-medium text-slate-800">{enrichedData.person.full_name}</span>
                        </div>
                      )}
                      {enrichedData.person.position && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Title</span>
                          <span className="font-medium text-slate-800">{enrichedData.person.position}</span>
                        </div>
                      )}
                      {enrichedData.person.email && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Email</span>
                          <a href={`mailto:${enrichedData.person.email}`} className="font-medium text-purple-600 hover:underline">
                            {enrichedData.person.email}
                          </a>
                        </div>
                      )}
                      {enrichedData.person.phone_number && (
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-600">Phone</span>
                          <a href={`tel:${enrichedData.person.phone_number}`} className="font-medium text-purple-600 hover:underline">
                            {enrichedData.person.phone_number}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* LinkedIn Links */}
                  <div className="flex flex-col gap-1.5 mb-3">
                    {enrichedData.person?.linkedin_url && (
                      <a
                        href={enrichedData.person.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors w-fit"
                      >
                        🔗 LinkedIn Profile
                      </a>
                    )}
                    {enrichedData.linkedin_search_url && (
                      <a
                        href={enrichedData.linkedin_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors w-fit"
                      >
                        🔍 Search LinkedIn
                      </a>
                    )}
                    {enrichedData.org_linkedin_search_url && (
                      <a
                        href={enrichedData.org_linkedin_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors w-fit"
                      >
                        🏢 Find IT Director on LinkedIn
                      </a>
                    )}
                  </div>

                  {/* Additional Contacts */}
                  {enrichedData.additional_contacts && enrichedData.additional_contacts.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-amber-700 block mb-1.5">
                        Additional Contacts ({enrichedData.additional_contacts.length})
                      </span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {enrichedData.additional_contacts.slice(0, 5).map((contact: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-white/70 rounded-lg px-2 py-1.5 text-xs">
                            <div>
                              <span className="font-medium text-slate-800">
                                {contact.first_name} {contact.last_name}
                              </span>
                              {contact.position && (
                                <span className="text-slate-500 ml-1">• {contact.position}</span>
                              )}
                            </div>
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="text-purple-600 hover:underline ml-2 shrink-0">
                                {contact.email}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Company Info */}
                  {enrichedData.company && Object.keys(enrichedData.company).length > 0 && (
                    <div className="mt-3 pt-2 border-t border-amber-200">
                      <span className="text-xs font-medium text-amber-700 block mb-1">Company Info</span>
                      <div className="space-y-1">
                        {enrichedData.company.name && (
                          <div className="text-xs text-slate-600">{enrichedData.company.name}</div>
                        )}
                        {enrichedData.company.domain && (
                          <a href={`https://${enrichedData.company.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-600 hover:underline">
                            {enrichedData.company.domain}
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Note / Error from enrichment */}
                  {enrichedData.note && (
                    <p className="text-xs text-amber-600 mt-2 italic">{enrichedData.note}</p>
                  )}
                  {enrichedData.credits_used > 0 && (
                    <p className="text-xs text-amber-500 mt-1">API credits used: {enrichedData.credits_used}</p>
                  )}
                </div>
              )}

              {/* Enrich Error */}
              {enrichError && !enrichedData && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  {enrichError}
                </div>
              )}

              {/* Status Buttons */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                {selectedLead.status !== "contacted" && (
                  <button
                    onClick={() => handleStatusUpdate(selectedLead.id, "contacted")}
                    className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all"
                  >
                    ✉️ Mark Contacted
                  </button>
                )}
                {selectedLead.status !== "converted" && !savedLeadId && (
                  <button
                    onClick={() => handleStatusUpdate(selectedLead.id, "converted")}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    ✅ Mark Converted
                  </button>
                )}
                {selectedLead.status !== "dismissed" && (
                  <button
                    onClick={() => handleStatusUpdate(selectedLead.id, "dismissed")}
                    className="px-3 py-2 border border-slate-200 text-slate-500 rounded-xl text-sm hover:bg-slate-50 transition-colors"
                  >
                    ✕ Dismiss
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center sticky top-20">
              <span className="text-4xl mb-3 block">👈</span>
              <h3 className="font-semibold text-slate-700 mb-1">Select a Lead</h3>
              <p className="text-sm text-slate-500">
                Click on a predicted lead to see full details, contact info, and take action.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Top States & Manufacturers */}
      {stats && (stats.top_states.length > 0 || stats.top_manufacturers.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.top_states.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">📍 Top States</h3>
              <div className="space-y-2">
                {stats.top_states.slice(0, 5).map((s) => (
                  <div key={s.state} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{s.state}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{
                            width: `${(s.count / stats.top_states[0].count) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 w-8 text-right">
                        {s.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.top_manufacturers.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">🏭 Top Manufacturers</h3>
              <div className="space-y-2">
                {stats.top_manufacturers.slice(0, 5).map((m) => (
                  <div key={m.manufacturer} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 truncate max-w-[60%]">
                      {m.manufacturer}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${(m.count / stats.top_manufacturers[0].count) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 w-8 text-right">
                        {m.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
