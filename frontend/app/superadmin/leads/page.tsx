"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { Loader2, RefreshCw, Search, Mail, Phone, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

interface Lead {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  role: string | null;
  ben: string | null;
  student_count: number | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  notes: string | null;
  status: string;
  ip_address: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const STATUS_OPTIONS = ["new", "contacted", "qualified", "closed", "spam"] as const;
const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  contacted: "bg-amber-100 text-amber-700 border-amber-200",
  qualified: "bg-green-100 text-green-700 border-green-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  spam: "bg-red-100 text-red-700 border-red-200",
};

export default function SuperAdminLeadsPage() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;

  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Auth gate
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in?next=/superadmin/leads");
      return;
    }
    if (user && !["admin", "super"].includes(user.role)) {
      router.push("/");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const token = localStorage.getItem("access_token") || "";
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (roleFilter) params.set("role", roleFilter);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`${apiUrl}/api/v1/admin/leads?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail || "Failed to load leads");
        return;
      }
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setByStatus(data.by_status || {});
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, roleFilter, search, page]);

  useEffect(() => {
    if (_hasHydrated && isAuthenticated && user && ["admin", "super"].includes(user.role)) {
      fetchLeads();
    }
  }, [_hasHydrated, isAuthenticated, user, fetchLeads]);

  const updateStatus = async (leadId: number, newStatus: string) => {
    setUpdatingId(leadId);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const token = localStorage.getItem("access_token") || "";
      const res = await fetch(`${apiUrl}/api/v1/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.detail || "Failed to update status");
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      // refresh by_status counts
      fetchLeads();
    } catch (err: any) {
      alert(err?.message || "Update failed");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!_hasHydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lead Inbox</h1>
            <p className="text-sm text-slate-500 mt-1">
              Inbound leads from erateapp.com and verification forms.
            </p>
          </div>
          <button
            onClick={fetchLeads}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Status counters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(statusFilter === s ? "" : s);
                setPage(0);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                statusFilter === s
                  ? "border-purple-500 bg-purple-50 shadow"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="text-xs uppercase tracking-wide text-slate-500">{s}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{byStatus[s] || 0}</div>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Email, name, organization, source..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="consultant">Consultant</option>
              <option value="vendor">Vendor</option>
              <option value="applicant">Applicant</option>
              <option value="unsure">Unsure</option>
            </select>
          </div>
          {(statusFilter || roleFilter || search) && (
            <button
              onClick={() => {
                setStatusFilter("");
                setRoleFilter("");
                setSearch("");
                setPage(0);
              }}
              className="text-sm text-slate-500 hover:text-slate-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Contact</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Role</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Org / BEN</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Source</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Created</th>
                  <th className="text-left font-medium text-slate-600 px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Loader2 className="w-6 h-6 text-purple-600 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No leads found.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{lead.name || "—"}</div>
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <Mail className="w-3 h-3" />
                          <a href={`mailto:${lead.email}`} className="hover:underline">
                            {lead.email}
                          </a>
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                            <Phone className="w-3 h-3" /> {lead.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-700">{lead.role || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{lead.organization || "—"}</div>
                        {lead.ben && <div className="text-xs text-slate-500">BEN {lead.ben}</div>}
                        {lead.student_count != null && (
                          <div className="text-xs text-slate-500">{lead.student_count} students</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{lead.source || "—"}</div>
                        {(lead.utm_source || lead.utm_campaign) && (
                          <div className="text-xs text-slate-500">
                            {lead.utm_source}
                            {lead.utm_campaign ? ` / ${lead.utm_campaign}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.created_at
                          ? new Date(lead.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          disabled={updatingId === lead.id}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                          className={`px-2 py-1 text-xs font-medium rounded-full border ${
                            STATUS_COLORS[lead.status] || STATUS_COLORS.new
                          } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <div className="text-xs text-slate-500">
              Showing {leads.length === 0 ? 0 : page * limit + 1}–
              {page * limit + leads.length} of {total}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-md border border-slate-200 hover:bg-white disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-xs text-slate-500">
                Page {page + 1} of {totalPages}
              </div>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total}
                className="p-1.5 rounded-md border border-slate-200 hover:bg-white disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Public capture endpoint: <code className="font-mono">POST /api/v1/leads/capture</code>
        </p>
      </div>
    </div>
  );
}
