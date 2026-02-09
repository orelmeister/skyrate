"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

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

export default function ApplicantDashboard() {
  const router = useRouter();
  const { user, token, isAuthenticated, logout } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'frns' | 'appeals' | 'changes'>('overview');
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [selectedFrnId, setSelectedFrnId] = useState<number | null>(null);
  const [frnDetail, setFrnDetail] = useState<any | null>(null);
  const [loadingFrnDetail, setLoadingFrnDetail] = useState(false);

  useEffect(() => {
    // Check authentication and role
    if (!isAuthenticated || !token) {
      router.push('/sign-in');
      return;
    }
    if (user?.role !== 'applicant' && user?.role !== 'admin') {
      // Redirect to appropriate dashboard
      const dashboard = user?.role === 'vendor' ? '/vendor' : '/consultant';
      router.push(dashboard);
      return;
    }
    fetchDashboard();
  }, [isAuthenticated, token, user, router]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, frns, appeals, recent_changes, summary } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={40} height={40} className="rounded-lg" />
                <span className="text-xl font-bold text-slate-900 hidden sm:block">SkyRate AI</span>
              </Link>
              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
              <div className="hidden sm:block">
                <div className="text-sm font-medium text-slate-900">{profile.organization_name}</div>
                <div className="text-xs text-slate-500">BEN: {profile.ben}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Settings link */}
              <Link
                href="/settings/bens"
                className="text-sm text-slate-600 hover:text-emerald-600 flex items-center gap-1"
                title="Manage BEN Numbers"
              >
                ⚙️ Settings
              </Link>
              {summary.sync_status === 'syncing' ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  Syncing...
                </div>
              ) : (
                <button
                  onClick={triggerSync}
                  className="text-sm text-slate-600 hover:text-emerald-600 flex items-center gap-1"
                >
                  🔄 Refresh Data
                </button>
              )}
              <button
                onClick={() => {
                  logout();
                  router.push('/sign-in');
                }}
                className="text-sm text-slate-600 hover:text-red-600"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="text-sm text-slate-500 mb-1">Total Funded</div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.total_funded_amount)}</div>
            <div className="text-xs text-slate-400">{summary.funded_count} FRNs</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="text-sm text-slate-500 mb-1">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(summary.total_pending_amount)}</div>
            <div className="text-xs text-slate-400">{summary.pending_count} FRNs</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="text-sm text-slate-500 mb-1">Denied</div>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.total_denied_amount)}</div>
            <div className="text-xs text-slate-400">{summary.denied_count} FRNs</div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="text-sm text-slate-500 mb-1">Appeals Ready</div>
            <div className="text-2xl font-bold text-emerald-600">{summary.appeals_ready}</div>
            <div className="text-xs text-slate-400">{summary.urgent_deadlines} urgent</div>
          </div>
        </div>

        {/* Alerts */}
        {(summary.urgent_deadlines > 0 || summary.unread_changes > 0) && (
          <div className="mb-8">
            {summary.urgent_deadlines > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3 flex items-center gap-3">
                <span className="text-2xl">⏰</span>
                <div>
                  <div className="font-semibold text-red-800">
                    {summary.urgent_deadlines} appeal deadline{summary.urgent_deadlines > 1 ? 's' : ''} approaching!
                  </div>
                  <div className="text-sm text-red-600">
                    Review and submit your appeals before the deadline passes.
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTab('appeals')}
                  className="ml-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  View Appeals
                </button>
              </div>
            )}
            {summary.unread_changes > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">🔔</span>
                <div>
                  <div className="font-semibold text-blue-800">
                    {summary.unread_changes} new update{summary.unread_changes > 1 ? 's' : ''} since your last visit
                  </div>
                  <div className="text-sm text-blue-600">
                    Check what changed with your applications.
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTab('changes')}
                  className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  View Updates
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-200 rounded-lg p-1 mb-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'frns', label: 'All FRNs', icon: '📋', count: frns.length },
            { id: 'appeals', label: 'Appeals', icon: '⚖️', count: appeals.length },
            { id: 'changes', label: 'Updates', icon: '🔔', count: summary.unread_changes },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`flex-1 min-w-fit px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                selectedTab === tab.id
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  selectedTab === tab.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-300 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {selectedTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Denials with Appeals */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  ⚖️ Auto-Generated Appeals
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    AI Ready
                  </span>
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {appeals.slice(0, 5).map((appeal) => (
                  <div
                    key={appeal.id}
                    className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedAppeal(appeal)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-slate-900">FRN {appeal.frn}</div>
                        <div className="text-sm text-slate-500 line-clamp-1">
                          {appeal.denial_category}: {appeal.denial_reason}
                        </div>
                      </div>
                      <div className="text-right">
                        {appeal.success_probability && (
                          <div className={`text-sm font-medium ${
                            appeal.success_probability >= 70 ? 'text-green-600' :
                            appeal.success_probability >= 40 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {appeal.success_probability}% success
                          </div>
                        )}
                        {appeal.days_until_deadline !== null && appeal.days_until_deadline <= 14 && (
                          <div className="text-xs text-red-600">
                            {appeal.days_until_deadline} days left
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {appeals.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    🎉 No denials - great work!
                  </div>
                )}
              </div>
            </div>

            {/* Recent Changes */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">🔔 Recent Updates</h3>
              </div>
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {recent_changes.slice(0, 10).map((change) => (
                  <div
                    key={change.id}
                    className={`p-4 ${!change.is_read ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        change.change_type === 'status_change' ? 'bg-yellow-100' :
                        change.change_type === 'new_denial' ? 'bg-red-100' :
                        change.change_type === 'appeal_generated' ? 'bg-emerald-100' :
                        'bg-slate-100'
                      }`}>
                        {change.change_type === 'status_change' ? '🔄' :
                         change.change_type === 'new_denial' ? '❌' :
                         change.change_type === 'appeal_generated' ? '⚖️' :
                         '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-900">{change.description}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {formatDate(change.changed_at)}
                        </div>
                      </div>
                      {change.is_important && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          Important
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {recent_changes.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No recent updates
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'frns' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
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
                            className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium hover:bg-emerald-200 transition-colors"
                          >
                            View Appeal
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* FRN Detail Panel */}
                    {selectedFrnId === frn.id && (
                      <tr key={`detail-${frn.id}`}>
                        <td colSpan={6} className="px-0 py-0">
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
                                {(frnDetail.raw_data?.product_type || frnDetail.raw_data?.fiber_type || frnDetail.raw_data?.purpose || frnDetail.raw_data?.function_text) && (
                                  <div className="bg-white rounded-lg p-4 border border-slate-200">
                                    <h4 className="font-medium text-slate-900 mb-3 text-sm flex items-center gap-2">📋 Additional Details</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      {frnDetail.raw_data?.product_type && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Product Type</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.product_type}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.fiber_type && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Fiber Type</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.fiber_type}</span>
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
                                      {frnDetail.raw_data?.total_monthly_cost && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Monthly Cost</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_monthly_cost))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.total_eligible_monthly_recurring_charges && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Eligible Monthly</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_monthly_recurring_charges))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.total_eligible_one_time_charges && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">One-time Charges</span>
                                          <span className="text-slate-900">{formatCurrency(parseFloat(frnDetail.raw_data.total_eligible_one_time_charges))}</span>
                                        </div>
                                      )}
                                      {frnDetail.raw_data?.num_lines && (
                                        <div>
                                          <span className="text-slate-500 block text-xs">Lines/Units</span>
                                          <span className="text-slate-900">{frnDetail.raw_data.num_lines}</span>
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
                                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                                    <h4 className="font-medium text-emerald-800 mb-2 text-sm flex items-center gap-2">📄 Auto-Generated Appeal Ready</h4>
                                    <div className="flex items-center gap-3 text-sm mb-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        frnDetail.appeal.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                                        frnDetail.appeal.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>{frnDetail.appeal.status?.toUpperCase()}</span>
                                      {frnDetail.appeal.success_probability != null && (
                                        <span className="text-emerald-700 font-medium">✓ {frnDetail.appeal.success_probability}% Success Rate</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-emerald-600 line-clamp-2">{frnDetail.appeal.appeal_letter?.substring(0, 200)}...</p>
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
                        appeal.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
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
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
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
                      change.change_type === 'appeal_generated' ? 'bg-emerald-100' :
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
      </main>

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
                  className="w-full h-96 p-4 border border-slate-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  defaultValue={selectedAppeal.appeal_letter}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
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
