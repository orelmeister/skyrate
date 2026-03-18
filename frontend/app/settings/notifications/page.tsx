'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Bell, Mail, AlertTriangle, Clock, DollarSign, Building, 
  Users, Calendar, Save, CheckCircle, XCircle, ArrowLeft,
  Loader2, Smartphone, Eye, Trash2, ChevronDown, ChevronUp,
  History, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

interface AlertConfig {
  id: number;
  alert_on_denial: boolean;
  alert_on_status_change: boolean;
  alert_on_deadline: boolean;
  alert_on_disbursement: boolean;
  alert_on_funding_approved: boolean;
  alert_on_form_470: boolean;
  alert_on_competitor: boolean;
  deadline_warning_days: number;
  min_alert_amount: number;
  email_notifications: boolean;
  in_app_notifications: boolean;
  daily_digest: boolean;
  sms_notifications: boolean;
  notification_email: string | null;
  notification_phone: string | null;
}

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

const priorityColors: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  high: 'border-orange-500 bg-orange-50',
  medium: 'border-yellow-500 bg-yellow-50',
  low: 'border-blue-500 bg-blue-50',
};

const alertTypeIcons: Record<string, string> = {
  'new_denial': '🚨',
  'frn_status_change': '🔄',
  'deadline_approaching': '📅',
  'disbursement_received': '💰',
  'funding_approved': '✅',
  'form_470_match': '📋',
  'appeal_deadline': '⏰',
  'pending_too_long': '⚠️',
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

export default function NotificationSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    }>
      <NotificationSettingsContent />
    </Suspense>
  );
}

function NotificationSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, token, _hasHydrated } = useAuthStore();
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Alert History State
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [showAlerts, setShowAlerts] = useState(searchParams.get('view') === 'alerts');
  const [alertsPage, setAlertsPage] = useState(0);
  const [hasMoreAlerts, setHasMoreAlerts] = useState(true);
  const ALERTS_PER_PAGE = 20;

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/sign-in');
      return;
    }
    fetchConfig();
    // If view=alerts, fetch alerts immediately
    if (searchParams.get('view') === 'alerts') {
      setShowAlerts(true);
      fetchAlerts(true);
    }
  }, [_hasHydrated, isAuthenticated, router, searchParams]);

  const fetchAlerts = async (reset = false) => {
    try {
      setAlertsLoading(true);
      const offset = reset ? 0 : alertsPage * ALERTS_PER_PAGE;
      const response = await api.get<{ success: boolean; alerts: Alert[]; total: number }>(
        `/alerts?limit=${ALERTS_PER_PAGE}&offset=${offset}&include_dismissed=false`
      );
      const data = response.data;
      if (response.success && data && data.success) {
        if (reset) {
          setAlerts(data.alerts);
          setAlertsPage(1);
        } else {
          setAlerts(prev => [...prev, ...data.alerts]);
          setAlertsPage(prev => prev + 1);
        }
        setHasMoreAlerts(data.alerts.length === ALERTS_PER_PAGE);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ success: boolean; config: AlertConfig }>('/alerts/config');
      const data = response.data;
      if (response.success && data && data.success) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
      setError('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const response = await api.put<{ success: boolean }>('/alerts/config', config);
      const data = response.data;
      if (response.success && data && data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
      setError('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: keyof AlertConfig, value: boolean | number | string) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const sendTestAlert = async () => {
    try {
      await api.post('/alerts/test');
      alert('Test alert sent! Check your notifications.');
    } catch (err) {
      console.error('Failed to send test alert:', err);
      alert('Failed to send test alert');
    }
  };

  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load settings</p>
          <button onClick={fetchConfig} className="mt-4 text-blue-600 hover:underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
              <p className="text-gray-600">Configure how and when you receive alerts</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-green-800">Settings saved successfully!</span>
          </div>
        )}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Alert History Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div 
            className="px-6 py-4 border-b border-gray-200 cursor-pointer flex items-center justify-between"
            onClick={() => {
              setShowAlerts(!showAlerts);
              if (!showAlerts && alerts.length === 0) {
                fetchAlerts(true);
              }
            }}
          >
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Alert History
              {alerts.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                  {alerts.length}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {showAlerts && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchAlerts(true);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Refresh alerts"
                >
                  <RefreshCw className={`h-4 w-4 text-gray-500 ${alertsLoading ? 'animate-spin' : ''}`} />
                </button>
              )}
              {showAlerts ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>
          
          {showAlerts && (
            <div className="p-6">
              {alertsLoading && alerts.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No alerts yet</p>
                  <p className="text-sm">Alerts about your FRNs and BENs will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div 
                      key={alert.id}
                      className={`border-l-4 p-4 rounded-lg ${priorityColors[alert.priority] || 'border-gray-300 bg-gray-50'} ${!alert.is_read ? 'ring-1 ring-blue-200' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className="text-xl">{alertTypeIcons[alert.alert_type] || '📢'}</span>
                          <div>
                            <h4 className="font-medium text-gray-900">{alert.title}</h4>
                            {alert.entity_name && (
                              <p className="text-sm text-gray-600 mt-0.5">{alert.entity_name}</p>
                            )}
                            <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                            {alert.entity_id && (
                              <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                                {alert.entity_type?.toUpperCase()}: {alert.entity_id}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
                          {formatTimeAgo(alert.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                  
                  {hasMoreAlerts && (
                    <button
                      onClick={() => fetchAlerts(false)}
                      disabled={alertsLoading}
                      className="w-full py-3 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {alertsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Load More Alerts'
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delivery Methods Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Delivery Methods
            </h2>
          </div>
          <div className="p-6 space-y-6">
            {/* In-App Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Bell className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">In-App Notifications</h3>
                  <p className="text-sm text-gray-500">Show notifications in the app</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.in_app_notifications}
                  onChange={(e) => updateConfig('in_app_notifications', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Mail className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Email Notifications</h3>
                  <p className="text-sm text-gray-500">Send alerts to your email immediately</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.email_notifications}
                  onChange={(e) => updateConfig('email_notifications', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Daily Digest */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Daily Digest</h3>
                  <p className="text-sm text-gray-500">Receive a daily summary email at 8 AM</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.daily_digest}
                  onChange={(e) => updateConfig('daily_digest', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* SMS Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Smartphone className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">SMS Notifications</h3>
                  <p className="text-sm text-gray-500">Receive text alerts for critical updates</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.sms_notifications}
                  onChange={(e) => updateConfig('sms_notifications', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>

            {config.sms_notifications && (
              <div className="ml-14 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMS Phone Number
                </label>
                <input
                  type="tel"
                  value={config.notification_phone || ''}
                  onChange={(e) => updateConfig('notification_phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Standard message rates apply. By enabling, you agree to receive SMS alerts from SkyRate.
                  <a href="/sms-terms" className="text-blue-600 hover:underline ml-1">SMS Terms</a>
                </p>
              </div>
            )}

            {/* Custom Email */}
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Email (optional)
              </label>
              <input
                type="email"
                value={config.notification_email || ''}
                onChange={(e) => updateConfig('notification_email', e.target.value)}
                placeholder={user?.email || 'your@email.com'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to use your account email
              </p>
            </div>
          </div>
        </div>

        {/* Alert Types Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Alert Types
            </h2>
          </div>
          <div className="p-6 space-y-4">
            {/* Denials */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-gray-900">🚨 New Denial Detected</h3>
                <p className="text-sm text-gray-500">Alert when a FRN is denied</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alert_on_denial}
                  onChange={(e) => updateConfig('alert_on_denial', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Status Changes */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-gray-900">🔄 Status Changes</h3>
                <p className="text-sm text-gray-500">Alert when FRN status changes</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alert_on_status_change}
                  onChange={(e) => updateConfig('alert_on_status_change', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Deadlines */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-gray-900">📅 Approaching Deadlines</h3>
                <p className="text-sm text-gray-500">Alert X days before deadlines</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alert_on_deadline}
                  onChange={(e) => updateConfig('alert_on_deadline', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Disbursements */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-gray-900">💰 Disbursement Received</h3>
                <p className="text-sm text-gray-500">Alert when payments are received</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alert_on_disbursement}
                  onChange={(e) => updateConfig('alert_on_disbursement', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Funding Approved */}
            <div className="flex items-center justify-between py-2">
              <div>
                <h3 className="font-medium text-gray-900">✅ Funding Approved</h3>
                <p className="text-sm text-gray-500">Alert when FRNs are committed/funded</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.alert_on_funding_approved}
                  onChange={(e) => updateConfig('alert_on_funding_approved', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Form 470 (Vendors + Super/Admin) */}
            {(user?.role === 'vendor' || user?.role === 'super' || user?.role === 'admin') && (
              <div className="flex items-center justify-between py-2 pt-4 border-t border-gray-200">
                <div>
                  <h3 className="font-medium text-gray-900">📋 New Form 470 Matches</h3>
                  <p className="text-sm text-gray-500">Alert when Form 470s match your criteria</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_form_470}
                    onChange={(e) => updateConfig('alert_on_form_470', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            )}

            {/* Competitor Activity (Vendors + Super/Admin) */}
            {(user?.role === 'vendor' || user?.role === 'super' || user?.role === 'admin') && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <h3 className="font-medium text-gray-900">👀 Competitor Activity</h3>
                  <p className="text-sm text-gray-500">Alert when competitors are active in your areas</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.alert_on_competitor}
                    onChange={(e) => updateConfig('alert_on_competitor', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Thresholds Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              Thresholds & Preferences
            </h2>
          </div>
          <div className="p-6 space-y-6">
            {/* Deadline Warning Days */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deadline Warning (days before)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={config.deadline_warning_days}
                  onChange={(e) => updateConfig('deadline_warning_days', parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-lg font-semibold text-blue-600 min-w-[60px] text-right">
                  {config.deadline_warning_days} days
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Get alerts this many days before deadlines
              </p>
            </div>

            {/* Minimum Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Alert Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={config.min_alert_amount}
                  onChange={(e) => updateConfig('min_alert_amount', parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Only alert for amounts above this threshold (0 = all amounts)
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={sendTestAlert}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Send Test Alert
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
