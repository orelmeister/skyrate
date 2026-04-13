"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

// ==================== TYPES ====================

interface SubjectInfo {
  name: string;
  type: string;
  identifier: string;
  email: string | null;
  state: string | null;
}

interface FRNRecord {
  frn: string;
  ben: string;
  entity_name: string;
  spin_name: string;
  consultant: string;
  consultant_crn: string | null;
  funding_year: string;
  service_type: string;
  current_status: string;
  pending_reason: string;
  committed_amount: number;
  disbursed_amount: number;
  discount_rate: number;
  fcdl_date: string;
  revised_fcdl_date: string | null;
  wave_number: string;
  last_date_to_invoice: string;
  invoicing_mode: string;
  f486_status: string;
  fcdl_comment: string;
  updated_at: string;
  denial_category: string | null;
  status_timeline: { date: string; event: string; type: string }[];
}

interface PortfolioSummary {
  total_bens: number;
  total_frns: number;
  total_committed: number;
  total_disbursed: number;
  total_denied_amount: number;
  funded_count: number;
  pending_count: number;
  denied_count: number;
  other_count: number;
  success_rate: number;
  disbursement_rate: number;
  money_left_on_table: number;
  active_funding_years: string[];
}

interface DenialAnalysis {
  total_denials: number;
  total_denied_amount: number;
  by_category: Record<string, { count: number; amount: number }>;
  by_year: Record<string, { count: number; amount: number }>;
  by_service_type: Record<string, { count: number; amount: number }>;
  details: {
    frn: string;
    ben: string;
    entity_name: string;
    year: string;
    amount: number;
    category: string;
    fcdl_comment: string;
  }[];
}

interface Insights {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  recommendations: string[];
}

interface PortfolioReport {
  lookup_type: string;
  lookup_value: string;
  generated_at: string;
  subject_info: SubjectInfo;
  portfolio_summary: PortfolioSummary;
  frn_status_summary: Record<string, { count: number; amount: number }>;
  frns: FRNRecord[];
  denial_analysis: DenialAnalysis;
  insights: Insights;
}

// ==================== HELPERS ====================

function fmtCurrency(val: number): string {
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(val: number): string {
  return (val * 100).toFixed(1) + "%";
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("funded")) return "bg-emerald-100 text-emerald-800";
  if (s.includes("pending")) return "bg-amber-100 text-amber-800";
  if (s.includes("denied")) return "bg-red-100 text-red-800";
  if (s.includes("cancel")) return "bg-gray-100 text-gray-600";
  return "bg-slate-100 text-slate-700";
}

function timelineColor(type: string): string {
  if (type === "funded") return "text-emerald-600";
  if (type === "denied") return "text-red-600";
  if (type === "pending") return "text-amber-600";
  if (type === "disbursed") return "text-blue-600";
  return "text-slate-600";
}

// ==================== TABS ====================

const TABS = ["overview", "frns", "denials", "entities", "insights"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  frns: "FRN Status Details",
  denials: "Denial Analysis",
  entities: "Entities",
  insights: "Insights",
};

// ==================== MAIN COMPONENT ====================

export default function PortfolioAnalyzerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      }
    >
      <PortfolioAnalyzer />
    </Suspense>
  );
}

function PortfolioAnalyzer() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  // Form state
  const [lookupType, setLookupType] = useState<"crn" | "ben" | "spin">("crn");
  const [lookupValue, setLookupValue] = useState("");
  const [selectedYears, setSelectedYears] = useState<number[]>([2024, 2025, 2026]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Result state
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // FRN table filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [frnSearch, setFrnSearch] = useState("");
  const [expandedFrn, setExpandedFrn] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in");
    } else if (user?.role !== "admin" && user?.role !== "super") {
      router.push("/dashboard");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  // ==================== FILTERED FRNs ====================

  const filteredFrns = useMemo(() => {
    if (!report) return [];
    let frns = report.frns;
    if (statusFilter !== "all") {
      frns = frns.filter((f) =>
        f.current_status.toLowerCase().includes(statusFilter.toLowerCase())
      );
    }
    if (frnSearch.trim()) {
      const q = frnSearch.toLowerCase();
      frns = frns.filter(
        (f) =>
          f.frn.toLowerCase().includes(q) ||
          f.entity_name.toLowerCase().includes(q) ||
          f.ben.toLowerCase().includes(q)
      );
    }
    return frns;
  }, [report, statusFilter, frnSearch]);

  // Entity aggregation for Entities tab
  const entityData = useMemo(() => {
    if (!report) return [];
    const map: Record<
      string,
      {
        ben: string;
        name: string;
        state: string;
        type: string;
        frn_count: number;
        funded: number;
        denied: number;
        total: number;
      }
    > = {};
    for (const f of report.frns) {
      if (!f.ben) continue;
      if (!map[f.ben]) {
        map[f.ben] = {
          ben: f.ben,
          name: f.entity_name,
          state: "",
          type: f.service_type,
          frn_count: 0,
          funded: 0,
          denied: 0,
          total: 0,
        };
      }
      map[f.ben].frn_count++;
      const s = f.current_status.toLowerCase();
      if (s.includes("funded")) map[f.ben].funded += f.committed_amount;
      if (s.includes("denied")) map[f.ben].denied += f.committed_amount;
      map[f.ben].total += f.committed_amount;
    }
    return Object.values(map).sort((a, b) => b.denied - a.denied);
  }, [report]);

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // ==================== API CALL ====================

  async function handleAnalyze() {
    if (!lookupValue.trim()) {
      setError("Please enter a value to search.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);

    try {
      const res = await api.post<PortfolioReport>("/admin/portfolio-report", {
        lookup_type: lookupType,
        lookup_value: lookupValue.trim(),
        funding_years: selectedYears.length > 0 ? selectedYears : null,
      });
      if (res.data) {
        setReport(res.data as unknown as PortfolioReport);
        setActiveTab("overview");
      } else {
        setError(res.error || "Failed to generate report");
      }
    } catch (e: any) {
      setError(e.message || "Failed to generate report");
    }
    setLoading(false);
  }

  function toggleYear(year: number) {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  }

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              E-Rate Portfolio Analyzer
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Universal CRN / BEN / SPIN lookup and analysis
            </p>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-purple-600 hover:text-purple-800 font-medium"
          >
            Back to Admin
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ==================== SEARCH FORM ==================== */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            {/* Lookup Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Lookup Type
              </label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {(["crn", "ben", "spin"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLookupType(t)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      lookupType === t
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Value Input */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {lookupType === "crn"
                  ? "Consultant Registration Number"
                  : lookupType === "ben"
                  ? "Billed Entity Number"
                  : "Service Provider Identification Number"}
              </label>
              <input
                type="text"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder={
                  lookupType === "crn"
                    ? "e.g. 16060670"
                    : lookupType === "ben"
                    ? "e.g. 16056315"
                    : "e.g. 143000331"
                }
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            {/* Funding Years */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Funding Years
              </label>
              <div className="flex gap-2">
                {[2023, 2024, 2025, 2026].map((y) => (
                  <label
                    key={y}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      selectedYears.includes(y)
                        ? "bg-purple-50 border-purple-300 text-purple-700"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(y)}
                      onChange={() => toggleYear(y)}
                      className="sr-only"
                    />
                    {y}
                  </label>
                ))}
              </div>
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* ==================== LOADING SKELETON ==================== */}
        {loading && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
              <div className="h-6 bg-slate-200 rounded w-1/3 mb-4" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== RESULTS ==================== */}
        {report && !loading && (
          <>
            {/* Subject Banner */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900">
                      {report.subject_info.name}
                    </h2>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium uppercase">
                      {report.subject_info.type.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {report.lookup_type.toUpperCase()}: {report.lookup_value}
                    {report.subject_info.email && (
                      <span className="ml-3">{report.subject_info.email}</span>
                    )}
                    {report.subject_info.state && (
                      <span className="ml-3">State: {report.subject_info.state}</span>
                    )}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  Generated {new Date(report.generated_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <SummaryCard label="Total BENs" value={report.portfolio_summary.total_bens.toString()} />
              <SummaryCard label="Total FRNs" value={report.portfolio_summary.total_frns.toString()} />
              <SummaryCard
                label="Success Rate"
                value={fmtPct(report.portfolio_summary.success_rate)}
                color={report.portfolio_summary.success_rate >= 0.8 ? "text-emerald-600" : "text-amber-600"}
              />
              <SummaryCard
                label="Committed"
                value={fmtCurrency(report.portfolio_summary.total_committed)}
              />
              <SummaryCard
                label="Disbursed"
                value={fmtCurrency(report.portfolio_summary.total_disbursed)}
              />
              <SummaryCard
                label="Denied"
                value={fmtCurrency(report.portfolio_summary.total_denied_amount)}
                color="text-red-600"
              />
              <SummaryCard
                label="Left on Table"
                value={fmtCurrency(report.portfolio_summary.money_left_on_table)}
                color="text-amber-600"
              />
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="border-b border-slate-200 px-4">
                <nav className="flex gap-1 -mb-px overflow-x-auto">
                  {TABS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activeTab === t
                          ? "border-purple-600 text-purple-600"
                          : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {TAB_LABELS[t]}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-6">
                {/* ========== OVERVIEW TAB ========== */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Status distribution */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">
                        Status Distribution
                      </h3>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(report.frn_status_summary).map(
                          ([status, info]) => (
                            <div
                              key={status}
                              className={`px-4 py-3 rounded-lg ${statusColor(status)}`}
                            >
                              <div className="text-lg font-bold">{info.count}</div>
                              <div className="text-xs">{status}</div>
                              <div className="text-xs opacity-75">
                                {fmtCurrency(info.amount)}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Funding by Year */}
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700 mb-3">
                        Funding by Year
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-2 px-3 font-medium text-slate-600">Year</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">FRNs</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Funded</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Pending</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Denied</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Total Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.portfolio_summary.active_funding_years.map((yr) => {
                              const yFrns = report.frns.filter((f) => f.funding_year === yr);
                              const funded = yFrns.filter((f) => f.current_status.toLowerCase().includes("funded")).length;
                              const pending = yFrns.filter((f) => f.current_status.toLowerCase().includes("pending")).length;
                              const denied = yFrns.filter((f) => f.current_status.toLowerCase().includes("denied")).length;
                              const total = yFrns.reduce((s, f) => s + f.committed_amount, 0);
                              return (
                                <tr key={yr} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-2 px-3 font-medium">FY{yr}</td>
                                  <td className="py-2 px-3 text-right">{yFrns.length}</td>
                                  <td className="py-2 px-3 text-right text-emerald-600">{funded}</td>
                                  <td className="py-2 px-3 text-right text-amber-600">{pending}</td>
                                  <td className="py-2 px-3 text-right text-red-600">{denied}</td>
                                  <td className="py-2 px-3 text-right font-medium">{fmtCurrency(total)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========== FRN STATUS DETAILS TAB ========== */}
                {activeTab === "frns" && (
                  <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                        {["all", "funded", "pending", "denied"].map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                              statusFilter === s
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={frnSearch}
                        onChange={(e) => setFrnSearch(e.target.value)}
                        placeholder="Search FRN, Entity, or BEN..."
                        className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-xs text-slate-400 self-center">
                        {filteredFrns.length} of {report.frns.length} FRNs
                      </span>
                    </div>

                    {/* FRN Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="text-left py-2 px-3 font-medium text-slate-600">FRN</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Entity</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Vendor</th>
                            <th className="text-center py-2 px-3 font-medium text-slate-600">Year</th>
                            <th className="text-center py-2 px-3 font-medium text-slate-600">Status</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Sub-Status</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-600">Amount</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-600">Disbursed</th>
                            <th className="text-center py-2 px-3 font-medium text-slate-600">Wave</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFrns.map((frn) => (
                            <React.Fragment key={frn.frn}>
                              <tr
                                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                onClick={() =>
                                  setExpandedFrn(expandedFrn === frn.frn ? null : frn.frn)
                                }
                              >
                                <td className="py-2 px-3 font-mono text-xs">{frn.frn}</td>
                                <td className="py-2 px-3 max-w-[180px] truncate" title={frn.entity_name}>
                                  {frn.entity_name}
                                </td>
                                <td className="py-2 px-3 max-w-[140px] truncate" title={frn.spin_name}>
                                  {frn.spin_name}
                                </td>
                                <td className="py-2 px-3 text-center">{frn.funding_year}</td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(
                                      frn.current_status
                                    )}`}
                                  >
                                    {frn.current_status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-xs text-slate-500">
                                  {frn.pending_reason}
                                </td>
                                <td className="py-2 px-3 text-right font-medium">
                                  {fmtCurrency(frn.committed_amount)}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {fmtCurrency(frn.disbursed_amount)}
                                </td>
                                <td className="py-2 px-3 text-center text-xs">{frn.wave_number}</td>
                                <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">
                                  {frn.updated_at ? frn.updated_at.slice(0, 10) : ""}
                                </td>
                              </tr>

                              {/* Expanded Row */}
                              {expandedFrn === frn.frn && (
                                <tr>
                                  <td colSpan={10} className="bg-slate-50 px-6 py-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      {/* Timeline */}
                                      <div>
                                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
                                          Status Timeline
                                        </h4>
                                        <div className="space-y-1">
                                          {frn.status_timeline.map((evt, i) => (
                                            <div
                                              key={i}
                                              className={`text-xs ${timelineColor(evt.type)}`}
                                            >
                                              {evt.date && (
                                                <span className="text-slate-400 mr-2">
                                                  {evt.date}
                                                </span>
                                              )}
                                              {evt.event}
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Details */}
                                      <div>
                                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
                                          Details
                                        </h4>
                                        <div className="space-y-1 text-xs text-slate-600">
                                          <div>BEN: {frn.ben}</div>
                                          <div>Service: {frn.service_type}</div>
                                          <div>Discount: {fmtPct(frn.discount_rate)}</div>
                                          <div>Mode: {frn.invoicing_mode || "N/A"}</div>
                                          <div>Form 486: {frn.f486_status || "N/A"}</div>
                                          <div>Invoice Deadline: {frn.last_date_to_invoice || "N/A"}</div>
                                          {frn.denial_category && (
                                            <div className="text-red-600">
                                              Denial: {frn.denial_category}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* FCDL Comment */}
                                      <div>
                                        <h4 className="text-xs font-semibold text-slate-600 mb-2">
                                          FCDL Comment
                                        </h4>
                                        <p className="text-xs text-slate-600 whitespace-pre-wrap">
                                          {frn.fcdl_comment || "No comment available"}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                      {filteredFrns.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          No FRNs match current filters
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ========== DENIAL ANALYSIS TAB ========== */}
                {activeTab === "denials" && (
                  <div className="space-y-6">
                    {report.denial_analysis.total_denials === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        No denied FRNs in this portfolio
                      </div>
                    ) : (
                      <>
                        {/* Denial by Category */}
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-3">
                            Denials by Category ({report.denial_analysis.total_denials} total
                            &mdash; {fmtCurrency(report.denial_analysis.total_denied_amount)})
                          </h3>
                          <div className="space-y-2">
                            {Object.entries(report.denial_analysis.by_category).map(
                              ([cat, info]) => {
                                const pct =
                                  report.denial_analysis.total_denials > 0
                                    ? (info.count / report.denial_analysis.total_denials) * 100
                                    : 0;
                                return (
                                  <div key={cat} className="flex items-center gap-3">
                                    <div className="w-48 text-sm text-slate-700 truncate">{cat}</div>
                                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                                      <div
                                        className="bg-red-400 h-full rounded-full"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <div className="w-16 text-right text-sm font-medium">
                                      {info.count}
                                    </div>
                                    <div className="w-28 text-right text-sm text-slate-500">
                                      {fmtCurrency(info.amount)}
                                    </div>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>

                        {/* Denied FRNs detail list */}
                        <div>
                          <h3 className="text-sm font-semibold text-slate-700 mb-3">
                            Denied FRN Details
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                  <th className="text-left py-2 px-3 font-medium text-slate-600">FRN</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-600">Entity</th>
                                  <th className="text-center py-2 px-3 font-medium text-slate-600">Year</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-600">Category</th>
                                  <th className="text-right py-2 px-3 font-medium text-slate-600">Amount</th>
                                  <th className="text-left py-2 px-3 font-medium text-slate-600">FCDL Comment</th>
                                </tr>
                              </thead>
                              <tbody>
                                {report.denial_analysis.details.map((d, i) => (
                                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-2 px-3 font-mono text-xs">{d.frn}</td>
                                    <td className="py-2 px-3 max-w-[180px] truncate">{d.entity_name}</td>
                                    <td className="py-2 px-3 text-center">{d.year}</td>
                                    <td className="py-2 px-3">
                                      <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs">
                                        {d.category}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-right font-medium">{fmtCurrency(d.amount)}</td>
                                    <td className="py-2 px-3 text-xs text-slate-500 max-w-[300px] truncate" title={d.fcdl_comment}>
                                      {d.fcdl_comment || "N/A"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ========== ENTITIES TAB ========== */}
                {activeTab === "entities" && (
                  <div>
                    {entityData.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        No entity data available
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="text-left py-2 px-3 font-medium text-slate-600">BEN</th>
                              <th className="text-left py-2 px-3 font-medium text-slate-600">Entity Name</th>
                              <th className="text-center py-2 px-3 font-medium text-slate-600">FRN Count</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Funded $</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Denied $</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Total $</th>
                              <th className="text-center py-2 px-3 font-medium text-slate-600">Success Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entityData.map((e) => {
                              const sr = e.total > 0 ? e.funded / e.total : 0;
                              return (
                                <tr key={e.ben} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-2 px-3 font-mono text-xs">{e.ben}</td>
                                  <td className="py-2 px-3 max-w-[220px] truncate">{e.name}</td>
                                  <td className="py-2 px-3 text-center">{e.frn_count}</td>
                                  <td className="py-2 px-3 text-right text-emerald-600">{fmtCurrency(e.funded)}</td>
                                  <td className="py-2 px-3 text-right text-red-600">{fmtCurrency(e.denied)}</td>
                                  <td className="py-2 px-3 text-right font-medium">{fmtCurrency(e.total)}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span
                                      className={`text-xs font-medium ${
                                        sr >= 0.8 ? "text-emerald-600" : sr >= 0.5 ? "text-amber-600" : "text-red-600"
                                      }`}
                                    >
                                      {fmtPct(sr)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ========== INSIGHTS TAB ========== */}
                {activeTab === "insights" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InsightCard
                      title="Strengths"
                      items={report.insights.strengths}
                      color="emerald"
                    />
                    <InsightCard
                      title="Weaknesses"
                      items={report.insights.weaknesses}
                      color="red"
                    />
                    <InsightCard
                      title="Opportunities"
                      items={report.insights.opportunities}
                      color="blue"
                    />
                    <InsightCard
                      title="Recommendations"
                      items={report.insights.recommendations}
                      color="purple"
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color || "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function InsightCard({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
    purple: "border-purple-200 bg-purple-50",
  };
  const titleColorMap: Record<string, string> = {
    emerald: "text-emerald-800",
    red: "text-red-800",
    blue: "text-blue-800",
    purple: "text-purple-800",
  };
  const dotColorMap: Record<string, string> = {
    emerald: "bg-emerald-400",
    red: "bg-red-400",
    blue: "bg-blue-400",
    purple: "bg-purple-400",
  };

  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] || "border-slate-200 bg-white"}`}>
      <h3 className={`text-sm font-semibold mb-3 ${titleColorMap[color] || "text-slate-800"}`}>
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span
              className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dotColorMap[color] || "bg-slate-400"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
