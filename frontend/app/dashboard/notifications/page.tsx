'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, Check, CheckCheck, Trash2, ArrowLeft, ChevronLeft,
  ChevronRight, Filter, Loader2
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

interface Alert {
  id: number;
  alert_type: string;
  priority: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

interface AlertsResponse {
  success: boolean;
  total: number;
  unread_count: number;
  alerts: Alert[];
}

const priorityColors: Record<string, string> = {
  critical: 'border-red-500',
  high: 'border-orange-500',
  medium: 'border-yellow-500',
  low: 'border-blue-500',
};

const priorityBg: Record<string, string> = {
  critical: 'bg-red-50',
  high: 'bg-orange-50',
  medium: 'bg-yellow-50',
  low: 'bg-blue-50',
};

const priorityDots: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

type FilterTab = 'all' | 'unread' | 'critical_high' | 'status_changes' | 'denials' | 'deadlines';

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'critical_high', label: 'Critical/High' },
  { key: 'status_changes', label: 'Status Changes' },
  { key: 'denials', label: 'Denials' },
  { key: 'deadlines', label: 'Deadlines' },
];

const PAGE_SIZE = 20;

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getAlertUrl(alert: Alert): string {
  switch (alert.alert_type) {
    case 'frn_status_change':
      return alert.entity_id ? `/applicant?frn=${alert.entity_id}` : '/consultant';
    case 'new_denial':
      return alert.entity_id ? `/applicant?frn=${alert.entity_id}` : '/dashboard/notifications';
    case 'deadline_approaching':
    case 'appeal_deadline':
      return '/applicant?tab=appeals';
    case 'form_470_match':
      return alert.entity_id ? `/vendor?form470=${alert.entity_id}` : '/vendor';
    case 'disbursement_received':
    case 'funding_approved':
      return alert.entity_id ? `/applicant?frn=${alert.entity_id}` : '/dashboard/notifications';
    case 'competitor_activity':
      return '/vendor';
    case 'pending_too_long':
      return alert.entity_id ? `/applicant?frn=${alert.entity_id}` : '/dashboard/notifications';
    default:
      return '/dashboard/notifications';
  }
}

function matchesFilter(alert: Alert, filter: FilterTab): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return !alert.is_read;
    case 'critical_high':
      return alert.priority === 'critical' || alert.priority === 'high';
    case 'status_changes':
      return alert.alert_type === 'frn_status_change';
    case 'denials':
      return alert.alert_type === 'new_denial';
    case 'deadlines':
      return alert.alert_type === 'deadline_approaching' || alert.alert_type === 'appeal_deadline';
    default:
      return true;
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, token, _hasHydrated } = useAuthStore();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const fetchAlerts = useCallback(async (offset: number) => {
    if (!isAuthenticated || !token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get<AlertsResponse>(
        `/alerts?limit=${PAGE_SIZE}&offset=${offset}`
      );
      const data = response.data;
      if (response.success && data && data.success) {
        setAlerts(data.alerts);
        setTotal(data.total);
        setUnreadCount(data.unread_count);
      }
    } catch {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      fetchAlerts(page * PAGE_SIZE);
    }
  }, [isAuthenticated, _hasHydrated, page, fetchAlerts, router]);

  const markAsRead = async (alertId: number) => {
    try {
      await api.post('/alerts/mark-read', { alert_ids: [alertId] });
      setAlerts(prev =>
        prev.map(a => (a.id === alertId ? { ...a, is_read: true } : a))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/alerts/mark-all-read');
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const dismissAlert = async (alertId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post('/alerts/dismiss', { alert_ids: [alertId] });
      const dismissed = alerts.find(a => a.id === alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      if (dismissed && !dismissed.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      // silent
    }
  };

  const handleAlertClick = async (alert: Alert) => {
    if (!alert.is_read) {
      await markAsRead(alert.id);
    }
    const url = getAlertUrl(alert);
    if (url !== '/dashboard/notifications') {
      router.push(url);
    }
  };

  const filteredAlerts = alerts.filter(a => matchesFilter(a, activeFilter));
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Bell className="h-6 w-6 text-blue-600" />
                Notifications
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                  : 'All caught up'}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeFilter === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alert List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => fetchAlerts(page * PAGE_SIZE)}
                className="mt-2 text-blue-600 hover:underline text-sm"
              >
                Try again
              </button>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Bell className="h-16 w-16 mb-3 opacity-20" />
              <p className="text-lg font-medium text-gray-500">No notifications</p>
              <p className="text-sm mt-1">
                {activeFilter !== 'all'
                  ? 'No notifications match this filter.'
                  : "You're all caught up!"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredAlerts.map(alert => (
                <div
                  key={alert.id}
                  onClick={() => handleAlertClick(alert)}
                  className={`relative flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${
                    priorityColors[alert.priority] || priorityColors.medium
                  } ${!alert.is_read ? priorityBg[alert.priority] || 'bg-blue-50/30' : ''}`}
                >
                  {/* Unread indicator */}
                  <div className="flex-shrink-0 mt-1.5">
                    {!alert.is_read ? (
                      <div className={`h-2.5 w-2.5 rounded-full ${priorityDots[alert.priority] || priorityDots.medium}`} />
                    ) : (
                      <div className="h-2.5 w-2.5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <h3
                        className={`text-sm text-gray-900 ${
                          !alert.is_read ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        {alert.title}
                      </h3>
                      <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                        {formatTimeAgo(alert.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                      {alert.message}
                    </p>
                    {alert.entity_name && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {alert.entity_name}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!alert.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(alert.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => dismissAlert(alert.id, e)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                      title="Dismiss"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-gray-500">
              Page {page + 1} of {totalPages} ({total} total)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
