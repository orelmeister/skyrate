"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useTabParam } from "@/hooks/useTabParam";

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
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useTabParam<ApplicantTab>("overview", APPLICANT_TABS);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  useEffect(() => {
    // Wait for Zustand hydration before checking auth
    if (!_hasHydrated) return;
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
  }, [_hasHydrated, isAuthenticated, token, user, router]);

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
  const loadDisbursements = async (year?: number) => {
    setDisbursementLoading(true);
    try {
      const response = await api.getApplicantDisbursements(year);
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

  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: '📊' },
    { id: 'frns', label: 'All FRNs', icon: '📋', count: frns.length },
    { id: 'frn-status', label: 'Live Status', icon: '📈' },
    { id: 'disbursements', label: 'Disbursements', icon: '💰' },
    { id: 'appeals', label: 'Appeals', icon: '⚖️', count: appeals.length },
    { id: 'changes', label: 'Updates', icon: '🔔', count: summary.unread_changes },
  ];

  const activeTabLabel = navItems.find(item => item.id === selectedTab)?.label || 'Dashboard';

  const handleLogout = () => {
    logout();
    router.push('/sign-in');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="SkyRate AI" width={36} height={36} className="rounded-lg" />
            <div>
              <span className="font-bold text-slate-900">SkyRate AI</span>
              <span className="block text-xs text-slate-500">Applicant Portal</span>
            </div>
          </Link>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelectedTab(item.id as ApplicantTab); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                selectedTab === item.id
                  ? "bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 font-medium shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedTab === item.id ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.count}
                </span>
              )}
              {selectedTab === item.id && !item.count && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-600"></span>
              )}
            </button>
          ))}
        </nav>

        {/* Subscription Card */}
        <div className="absolute bottom-20 left-4 right-4">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">Pro Plan</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">Active</span>
            </div>
            <div className="text-2xl font-bold">{frns.length} FRNs</div>
            <div className="text-sm opacity-75 mt-1">Tracked applications</div>
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
              <div className="text-xs text-slate-500 truncate">{profile.organization_name}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
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
            <h1 className="text-xl font-semibold text-slate-900">{activeTabLabel}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/notifications"
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg relative"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {summary.unread_changes > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </Link>
            {summary.sync_status === 'syncing' ? (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                Syncing...
              </div>
            ) : (
              <button
                onClick={triggerSync}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
        {/* Overview / Dashboard */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                    <span className="text-3xl">🏫</span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">{profile.organization_name}</h1>
                    <div className="flex items-center gap-3 mt-1 text-purple-100">
                      <span className="font-mono bg-white/20 px-2 py-0.5 rounded text-sm">BEN: {profile.ben}</span>
                      <span className="flex items-center gap-1 text-sm">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        {profile.state} • E-Rate Applicant
                      </span>
                    </div>
                  </div>
                </div>
                <Link
                  href="/settings/bens"
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-medium transition-colors"
                >
                  Manage BENs →
                </Link>
              </div>
              <div className="grid grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/20">
                <div>
                  <div className="text-3xl font-bold">{formatCurrency(summary.total_funded_amount)}</div>
                  <div className="text-sm text-purple-200 mt-1">Total Funded</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{summary.total_frns}</div>
                  <div className="text-sm text-purple-200 mt-1">Total FRNs</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{summary.funded_count}</div>
                  <div className="text-sm text-purple-200 mt-1">Funded</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{summary.pending_count}</div>
                  <div className="text-sm text-purple-200 mt-1">Pending</div>
                </div>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                    <span className="text-2xl">💰</span>
                  </div>
                  <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">{summary.funded_count} FRNs</span>
                </div>
                <div className="text-3xl font-bold text-slate-900">{formatCurrency(summary.total_funded_amount)}</div>
                <div className="text-sm text-slate-500 mt-1">Total Funded</div>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">⏳</span>
                  </div>
                  <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-full">{summary.pending_count} FRNs</span>
                </div>
                <div className="text-3xl font-bold text-slate-900">{formatCurrency(summary.total_pending_amount)}</div>
                <div className="text-sm text-slate-500 mt-1">Pending Review</div>
              </div>
              <div 
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-red-300"
                onClick={() => setSelectedTab('appeals')}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  {summary.denied_count > 0 ? (
                    <span className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded-full">Action needed</span>
                  ) : (
                    <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-full">All clear</span>
                  )}
                </div>
                <div className="text-3xl font-bold text-slate-900">{formatCurrency(summary.total_denied_amount)}</div>
                <div className="text-sm text-slate-500 mt-1">Denied ({summary.denied_count} FRNs)</div>
              </div>
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <span className="text-2xl">⚖️</span>
                  </div>
                  {summary.urgent_deadlines > 0 ? (
                    <span className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded-full">{summary.urgent_deadlines} urgent</span>
                  ) : (
                    <span className="text-xs text-purple-600 font-medium px-2 py-1 bg-purple-50 rounded-full">Ready</span>
                  )}
                </div>
                <div className="text-3xl font-bold text-slate-900">{summary.appeals_ready}</div>
                <div className="text-sm text-slate-500 mt-1">Appeals Ready</div>
              </div>
            </div>

            {/* Alerts */}
            {summary.urgent_deadlines > 0 && (
              <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border border-red-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                    <span className="text-2xl">⏰</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {summary.urgent_deadlines} appeal deadline{summary.urgent_deadlines > 1 ? 's' : ''} approaching!
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">Review and submit your appeals before the deadline passes.</p>
                  </div>
                  <button
                    onClick={() => setSelectedTab('appeals')}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    View Appeals →
                  </button>
                </div>
              </div>
            )}
            {summary.unread_changes > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <span className="text-2xl">🔔</span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {summary.unread_changes} new update{summary.unread_changes > 1 ? 's' : ''} since your last visit
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">Check what changed with your applications.</p>
                  </div>
                  <button
                    onClick={() => setSelectedTab('changes')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    View Updates →
                  </button>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  onClick={() => setSelectedTab('frns')}
                  className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                    <span className="text-xl">📋</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">View All FRNs</span>
                </button>
                <button
                  onClick={() => setSelectedTab('frn-status')}
                  className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-green-300 hover:bg-green-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-lg bg-green-100 group-hover:bg-green-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                    <span className="text-xl">📈</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Live Status</span>
                </button>
                <button
                  onClick={() => setSelectedTab('disbursements')}
                  className="p-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center mx-auto mb-2 transition-colors">
                    <span className="text-xl">💰</span>
                  </div>
                  <span className="text-sm font-medium text-slate-700">Disbursements</span>
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

            {/* Two-column: Appeals + Updates */}
            <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Denials with Appeals */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  ⚖️ Auto-Generated Appeals
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
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
                        change.change_type === 'appeal_generated' ? 'bg-purple-100' :
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
                    <div className="text-2xl font-bold text-slate-900">${(disbursementData.grand_total?.total_authorized || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-green-200 shadow-sm p-6">
                    <div className="text-sm text-green-600">Total Disbursed</div>
                    <div className="text-2xl font-bold text-green-700">${(disbursementData.grand_total?.total_disbursed || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-6">
                    <div className="text-sm text-blue-600">Disbursement Rate</div>
                    <div className="text-2xl font-bold text-blue-700">{(disbursementData.grand_total?.disbursement_rate || 0).toFixed(1)}%</div>
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(disbursementData.grand_total?.disbursement_rate || 0, 100)}%` }}
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
                                ${(ben.summary?.total_disbursed || 0).toLocaleString()} disbursed
                              </div>
                              <div className="text-xs text-slate-400">
                                of ${(ben.summary?.total_authorized || 0).toLocaleString()} authorized
                                ({(ben.summary?.disbursement_rate || 0).toFixed(1)}%)
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-green-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(ben.summary?.disbursement_rate || 0, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {(ben.records || []).slice(0, 10).map((rec: any, rIdx: number) => (
                            <div key={rIdx} className="px-4 py-3 flex items-center justify-between text-sm">
                              <div>
                                <span className="font-mono text-slate-700">FRN {rec.frn}</span>
                                <span className="text-slate-400 ml-2">• {rec.service_type || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-4 text-right">
                                <div>
                                  <div className="text-slate-500">Authorized</div>
                                  <div className="font-medium">${(rec.total_authorized_disbursement || 0).toLocaleString()}</div>
                                </div>
                                <div>
                                  <div className="text-green-500">Disbursed</div>
                                  <div className="font-medium text-green-700">${(rec.total_disbursed || 0).toLocaleString()}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(ben.records || []).length > 10 && (
                            <div className="px-4 py-2 text-center text-xs text-slate-400">
                              + {(ben.records || []).length - 10} more records
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
