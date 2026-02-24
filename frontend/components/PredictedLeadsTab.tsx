"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

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

export default function PredictedLeadsTab() {
  const [leads, setLeads] = useState<PredictedLead[]>([]);
  const [stats, setStats] = useState<PredictionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedLead, setSelectedLead] = useState<PredictedLead | null>(null);
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
  const [sortBy, setSortBy] = useState<string>("confidence_score");
  const [sortOrder, setSortOrder] = useState<string>("desc");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const fetchLeads = useCallback(async (newOffset = 0) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append("prediction_type", filterType);
      if (filterState) params.append("state", filterState);
      if (filterManufacturer) params.append("manufacturer", filterManufacturer);
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
  }, [filterType, filterState, filterManufacturer, sortBy, sortOrder]);

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

  // Reset save/enrich state when selecting a new lead
  const handleSelectLead = (lead: PredictedLead) => {
    setSelectedLead(lead);
    setSavedLeadId(null);
    setSaveError(null);
    setEnrichedData(null);
    setEnrichError(null);
  };

  const handleSaveAsLead = async () => {
    if (!selectedLead) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await api.savePredictedLead(selectedLead.id);
      const data = response.data as any;
      if (data?.success) {
        setSavedLeadId(data.lead?.id || -1);
        // Mark as converted locally
        setLeads((prev) =>
          prev.map((l) => (l.id === selectedLead.id ? { ...l, status: "converted" } : l))
        );
        setSelectedLead({ ...selectedLead, status: "converted" });
      } else {
        setSaveError(data.error || "Failed to save lead");
        // If already saved, still show success state
        if (data.error?.includes("already been saved") && data.lead?.id) {
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
        setEnrichError(data.error || "No enrichment data available");
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
            🔮 Predictive Lead Intelligence
          </h2>
          <p className="text-slate-500 mt-1">
            AI-powered predictions of schools that will need your products/services before they even post a Form 470
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

          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">All Types</option>
            <option value="contract_expiry">⏰ Contract Expiring</option>
            <option value="equipment_refresh">🔄 Equipment Refresh</option>
            <option value="c2_budget_reset">💰 C2 Budget</option>
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
            <option value="predicted_action_date:asc">Action Date (Soonest)</option>
            <option value="created_at:desc">Newest First</option>
          </select>

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
            <div className="text-center py-16">
              <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-500">Analyzing USAC data...</p>
            </div>
          ) : leads.length === 0 ? (
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
          ) : (
            <>
              {leads.map((lead) => {
                const typeConfig = PREDICTION_TYPE_CONFIG[lead.prediction_type] || {
                  label: lead.prediction_type,
                  icon: "📋",
                  color: "text-slate-700",
                  bgColor: "bg-slate-50 border-slate-200",
                };
                const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                const isSelected = selectedLead?.id === lead.id;

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
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${typeConfig.bgColor} ${typeConfig.color}`}
                        >
                          {typeConfig.icon} {typeConfig.label}
                        </span>
                        <ConfidenceBadge score={lead.confidence_score} />
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                      </div>
                      {lead.estimated_deal_value && (
                        <span className="text-sm font-semibold text-green-600">
                          {formatCurrency(lead.estimated_deal_value)}
                        </span>
                      )}
                    </div>

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

                    <p className="text-sm text-slate-600 line-clamp-2">
                      {lead.prediction_reason}
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
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sticky top-20">
              {/* Type Badge */}
              {(() => {
                const tc = PREDICTION_TYPE_CONFIG[selectedLead.prediction_type] || {
                  label: selectedLead.prediction_type,
                  icon: "📋",
                  color: "text-slate-700",
                  bgColor: "bg-slate-50",
                };
                return (
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${tc.bgColor} ${tc.color} mb-4`}>
                    {tc.icon} {tc.label}
                  </span>
                );
              })()}

              <h3 className="text-xl font-bold text-slate-900 mb-1">
                {selectedLead.organization_name}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                BEN: {selectedLead.ben} • {selectedLead.state}
                {selectedLead.city ? `, ${selectedLead.city}` : ""}
              </p>

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
                <p className="text-sm text-purple-900">{selectedLead.prediction_reason}</p>
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
                {selectedLead.contract_expiration_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Contract Expires</span>
                    <span className="font-medium text-red-600">
                      {formatDate(selectedLead.contract_expiration_date)}
                    </span>
                  </div>
                )}
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
                  </>
                )}
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
