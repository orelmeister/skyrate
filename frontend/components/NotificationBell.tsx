'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Trash2, Settings, X } from 'lucide-react';
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
  created_at: string;
}

interface AlertsResponse {
  success: boolean;
  total: number;
  unread_count: number;
  alerts: Alert[];
}

const priorityColors: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  high: 'border-orange-500 bg-orange-50',
  medium: 'border-yellow-500 bg-yellow-50',
  low: 'border-blue-500 bg-blue-50',
};

const priorityDots: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

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

export default function NotificationBell() {
  const { isAuthenticated, token } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<AlertsResponse>('/alerts?limit=10');
      const data = response.data;
      if (response.success && data && data.success) {
        setAlerts(data.alerts);
        setUnreadCount(data.unread_count);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Fetch alerts on mount and periodically
  useEffect(() => {
    if (isAuthenticated) {
      fetchAlerts();
      // Poll every 30 seconds
      const interval = setInterval(fetchAlerts, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchAlerts]);

  // Fetch unread count more frequently
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    
    const fetchUnreadCount = async () => {
      try {
        const response = await api.get<{ unread_count: number }>('/alerts/unread-count');
        const data = response.data;
        if (response.success && data) {
          setUnreadCount(data.unread_count);
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err);
      }
    };

    // Poll every 10 seconds for badge
    const interval = setInterval(fetchUnreadCount, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token]);

  const markAsRead = async (alertId: number) => {
    try {
      await api.post('/alerts/mark-read', { alert_ids: [alertId] });
      setAlerts(prev => 
        prev.map(a => a.id === alertId ? { ...a, is_read: true } : a)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/alerts/mark-all-read');
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const dismissAlert = async (alertId: number) => {
    try {
      await api.post('/alerts/dismiss', { alert_ids: [alertId] });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      const dismissed = alerts.find(a => a.id === alertId);
      if (dismissed && !dismissed.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center h-5 min-w-[20px] px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs hover:underline flex items-center gap-1 opacity-90 hover:opacity-100"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/20 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(70vh-100px)]">
            {loading && alerts.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <p className="text-sm">{error}</p>
                <button
                  onClick={fetchAlerts}
                  className="mt-2 text-blue-600 hover:underline text-sm"
                >
                  Try again
                </button>
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Bell className="h-12 w-12 mb-2 opacity-20" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs opacity-75">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`relative px-4 py-3 hover:bg-gray-50 transition-colors ${
                      !alert.is_read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    {/* Priority indicator */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityDots[alert.priority] || priorityDots.medium}`} />
                    
                    <div className="flex items-start gap-3">
                      {/* Unread dot */}
                      {!alert.is_read && (
                        <div className="mt-2 h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-medium text-gray-900 ${!alert.is_read ? 'font-semibold' : ''}`}>
                            {alert.title}
                          </h4>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {formatTimeAgo(alert.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                          {alert.message}
                        </p>
                        {alert.entity_name && (
                          <p className="mt-1 text-xs text-gray-500">
                            📍 {alert.entity_name}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissAlert(alert.id);
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors"
                          title="Dismiss"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <a
              href="/dashboard/notifications"
              className="text-sm text-blue-600 hover:underline"
            >
              View all notifications
            </a>
            <a
              href="/settings/notifications"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <Settings className="h-4 w-4" />
              Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
