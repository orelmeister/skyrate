"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import {
  Shield, ArrowLeft, Search, FileText, RefreshCw, Eye, Trash2,
  AlertTriangle, CheckCircle, XCircle
} from "lucide-react";

interface HistoryItem {
  id: number;
  form_type: string;
  form_number: string | null;
  overall_risk: string;
  summary: string | null;
  primary_filename: string;
  created_at: string;
  has_reanalysis: boolean;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  "470": "Form 470",
  "471": "Form 471",
  "472": "Form 472 (BEAR)",
  "474": "Form 474 (SPI)",
  "486": "Form 486",
  "500": "Form 500",
  "498": "Form 498",
  "other": "Other",
};

export default function ComplianceHistoryPage() {
  const router = useRouter();
  const { isAuthenticated, token, _hasHydrated } = useAuthStore();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFormType, setFilterFormType] = useState("");
  const [searchNumber, setSearchNumber] = useState("");

  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !token) return;
    fetchHistory();
  }, [_hasHydrated, isAuthenticated, token, filterFormType]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const accessToken = token || localStorage.getItem("access_token");
      const params = new URLSearchParams();
      if (filterFormType) params.set("form_type", filterFormType);
      params.set("limit", "50");

      const res = await fetch(`/api/v1/compliance/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      // Silent fail
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this analysis from your history?")) return;
    const accessToken = token || localStorage.getItem("access_token");
    await fetch(`/api/v1/compliance/history/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Auth guard
  if (_hasHydrated && !isAuthenticated) {
    router.push("/sign-in");
    return null;
  }

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const riskBadge = (risk: string) => {
    switch (risk) {
      case "Low":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
            <CheckCircle className="w-3 h-3" /> Low
          </span>
        );
      case "High":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" /> High
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            <AlertTriangle className="w-3 h-3" /> Medium
          </span>
        );
    }
  };

  const filteredItems = searchNumber
    ? items.filter((i) => i.form_number?.includes(searchNumber))
    : items;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/compliance"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Compliance Audit History</h1>
              <p className="text-sm text-slate-500">Past analyses and re-reviews</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={filterFormType}
            onChange={(e) => setFilterFormType(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All form types</option>
            {Object.entries(FORM_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchNumber}
              onChange={(e) => setSearchNumber(e.target.value)}
              placeholder="Search by form number..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No compliance analyses yet.</p>
            <Link href="/compliance" className="text-sm text-indigo-600 underline mt-2 inline-block">
              Run your first analysis
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        {FORM_TYPE_LABELS[item.form_type] || item.form_type}
                      </span>
                      {riskBadge(item.overall_risk)}
                      {item.form_number && (
                        <span className="text-xs text-slate-500 font-mono">
                          #{item.form_number}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {item.primary_filename}
                    </p>
                    {item.summary && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Link
                      href={`/compliance/history/${item.id}`}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/compliance?reanalyze=${item.id}`}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Upload Corrected Version"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
