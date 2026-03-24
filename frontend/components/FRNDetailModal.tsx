'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  X, AlertTriangle, Clock, Calendar, DollarSign,
  Building2, FileText, ChevronRight, Loader2, ExternalLink,
  Shield, TrendingUp
} from 'lucide-react';
import { api } from '@/lib/api';

interface FRNDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  frn: string;
  ben?: string;
  initialData?: {
    frn: string;
    ben?: string;
    organization_name?: string;
    old_status?: string;
    new_status?: string;
    status?: string;
    amount?: number;
    commitment_amount?: number;
    funding_year?: string;
    fcdl_comment?: string;
    fcdl_date?: string;
    pending_reason?: string;
    service_type?: string;
    spin_name?: string;
    last_date_to_invoice?: string;
    service_delivery_deadline?: string;
    appeal_deadline?: string;
    appeal_days_remaining?: number;
    discount_rate?: number | string;
    disbursed_amount?: number;
    [key: string]: unknown;
  };
}

interface FRNData {
  frn: string;
  ben: string;
  organization_name: string;
  status: string;
  pending_reason: string;
  commitment_amount: number;
  disbursed_amount: number;
  discount_rate: number;
  fcdl_date: string;
  fcdl_comment: string;
  last_date_to_invoice: string;
  service_delivery_deadline: string;
  contract_expiration_date: string;
  service_type: string;
  spin_name: string;
  application_number: string;
  funding_year: string;
  service_start_date: string;
  award_date: string;
  state: string;
  appeal_deadline?: string;
  appeal_days_remaining?: number;
  appeal_urgency?: string;
  invoicing_days_remaining?: number;
  invoicing_urgency?: string;
  service_delivery_days_remaining?: number;
  service_delivery_urgency?: string;
}

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('denied'))
    return 'bg-red-100 text-red-800 border-red-200';
  if (s.includes('funded') || s.includes('committed'))
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s.includes('pending'))
    return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function urgencyBadge(urgency: string | undefined) {
  switch (urgency) {
    case 'critical': return 'bg-red-100 text-red-800';
    case 'high': return 'bg-orange-100 text-orange-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800';
    case 'low': return 'bg-blue-100 text-blue-800';
    case 'expired': return 'bg-gray-100 text-gray-500';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function formatDate(d: string | undefined): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

function formatCurrency(amount: number | undefined): string {
  if (amount == null || isNaN(amount)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function ShimmerLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded h-4 ${className}`} />;
}

export default function FRNDetailModal({ isOpen, onClose, frn, ben, initialData }: FRNDetailModalProps) {
  const [data, setData] = useState<FRNData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFreshData = useCallback(async () => {
    if (!frn) return;
    setLoading(true);
    setError(null);
    try {
      const params = ben ? `?ben=${ben}` : '';
      const resp = await api.get<{ success: boolean; frn: FRNData }>(`/usac/frn/${frn}${params}`);
      if (resp.success && resp.data?.success && resp.data.frn) {
        setData(resp.data.frn);
      } else {
        setError(resp.error || 'Failed to load FRN data');
      }
    } catch {
      setError('Network error loading FRN data');
    } finally {
      setLoading(false);
    }
  }, [frn, ben]);

  useEffect(() => {
    if (isOpen && frn) {
      fetchFreshData();
    }
    if (!isOpen) {
      setData(null);
      setError(null);
    }
  }, [isOpen, frn, fetchFreshData]);

  // Handle ESC key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use fresh data if available, fall back to initialData
  const display = (data || (initialData ? {
    frn: initialData.frn || frn,
    ben: initialData.ben || ben || '',
    organization_name: initialData.organization_name || '',
    status: initialData.new_status || initialData.status || '',
    commitment_amount: initialData.amount || initialData.commitment_amount || 0,
    disbursed_amount: initialData.disbursed_amount || 0,
    discount_rate: Number(initialData.discount_rate) || 0,
    fcdl_date: initialData.fcdl_date || '',
    fcdl_comment: initialData.fcdl_comment || '',
    pending_reason: initialData.pending_reason || '',
    service_type: initialData.service_type || '',
    spin_name: initialData.spin_name || '',
    funding_year: initialData.funding_year || '',
    last_date_to_invoice: initialData.last_date_to_invoice || '',
    service_delivery_deadline: initialData.service_delivery_deadline || '',
    appeal_deadline: initialData.appeal_deadline || '',
    appeal_days_remaining: initialData.appeal_days_remaining,
    application_number: '',
    contract_expiration_date: '',
    service_start_date: '',
    award_date: '',
    state: '',
  } : {})) as Partial<FRNData> & Record<string, unknown>;

  const statusStr = String(display.status || '');
  const isDenied = statusStr.toLowerCase().includes('denied');
  const oldStatus = initialData?.old_status;
  const newStatus = initialData?.new_status || statusStr;

  // Collect deadline rows
  const deadlines: Array<{ type: string; date: string; daysRemaining?: number; urgency?: string }> = [];
  if (display.last_date_to_invoice) {
    deadlines.push({
      type: 'Invoicing',
      date: String(display.last_date_to_invoice),
      daysRemaining: data?.invoicing_days_remaining,
      urgency: data?.invoicing_urgency,
    });
  }
  if (isDenied && (display.appeal_deadline || display.fcdl_date)) {
    deadlines.push({
      type: 'Appeal',
      date: String(display.appeal_deadline || ''),
      daysRemaining: data?.appeal_days_remaining ?? display.appeal_days_remaining as number | undefined,
      urgency: data?.appeal_urgency,
    });
  }
  if (display.service_delivery_deadline) {
    deadlines.push({
      type: 'Service Delivery',
      date: String(display.service_delivery_deadline),
      daysRemaining: data?.service_delivery_days_remaining,
      urgency: data?.service_delivery_urgency,
    });
  }

  return (
    <Fragment>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg transform transition-transform duration-300 ease-out">
        <div className="h-full flex flex-col bg-white shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-teal-700 to-teal-600 px-6 py-5 flex items-start justify-between">
            <div>
              <p className="text-teal-200 text-xs font-medium tracking-wide uppercase">FRN Detail</p>
              <h2 className="text-white text-xl font-bold font-mono mt-1">{display.frn || frn}</h2>
              {display.organization_name && (
                <p className="text-teal-100 text-sm mt-1 truncate max-w-[280px]">
                  {String(display.organization_name)}
                </p>
              )}
              {display.ben && (
                <p className="text-teal-200 text-xs mt-0.5">BEN {String(display.ben)}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-teal-200 hover:text-white hover:bg-teal-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 px-6 py-5 space-y-6">
            {/* Status Card */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${statusBadge(statusStr)}`}>
                  {statusStr || (loading ? '...' : 'Unknown')}
                </span>
                {display.funding_year && (
                  <span className="text-xs text-slate-500 font-medium">FY {String(display.funding_year)}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Commitment</p>
                  <p className="font-semibold text-slate-900">
                    {loading && !display.commitment_amount ? <ShimmerLine className="w-20 mt-1" /> : formatCurrency(Number(display.commitment_amount))}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Disbursed</p>
                  <p className="font-semibold text-slate-900">
                    {loading && !display.disbursed_amount ? <ShimmerLine className="w-20 mt-1" /> : formatCurrency(Number(display.disbursed_amount))}
                  </p>
                </div>
                {display.service_type && (
                  <div>
                    <p className="text-slate-500 text-xs">Service Type</p>
                    <p className="font-medium text-slate-800">{String(display.service_type)}</p>
                  </div>
                )}
                {display.spin_name && (
                  <div>
                    <p className="text-slate-500 text-xs">Provider</p>
                    <p className="font-medium text-slate-800 truncate">{String(display.spin_name)}</p>
                  </div>
                )}
                {Number(display.discount_rate) > 0 && (
                  <div>
                    <p className="text-slate-500 text-xs">Discount Rate</p>
                    <p className="font-medium text-slate-800">{Number(display.discount_rate)}%</p>
                  </div>
                )}
              </div>
            </div>

            {/* Status Change (if from alert) */}
            {oldStatus && newStatus && oldStatus !== newStatus && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Status Change
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(oldStatus)}`}>
                    {oldStatus}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(newStatus)}`}>
                    {newStatus}
                  </span>
                </div>
              </div>
            )}

            {/* Denial Details */}
            {isDenied && (display.fcdl_comment || display.fcdl_date) && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Denial Details
                </h3>
                {display.fcdl_comment && (
                  <p className="text-sm text-red-900 mb-2">{String(display.fcdl_comment)}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-red-700">
                  {display.fcdl_date && (
                    <span>FCDL Date: <strong>{formatDate(String(display.fcdl_date))}</strong></span>
                  )}
                  {(display.appeal_deadline || data?.appeal_deadline) && (
                    <span>
                      Appeal Deadline: <strong>{formatDate(String(display.appeal_deadline || data?.appeal_deadline))}</strong>
                      {(data?.appeal_days_remaining != null) && (
                        <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${urgencyBadge(data.appeal_urgency)}`}>
                          {data.appeal_days_remaining}d left
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Key Deadlines */}
            {deadlines.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Key Deadlines
                </h3>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs">
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Days Left</th>
                        <th className="px-3 py-2 text-right font-medium">Urgency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deadlines.map((dl, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-slate-800">{dl.type}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(dl.date)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {dl.daysRemaining != null ? `${dl.daysRemaining}d` : (loading ? '...' : '-')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {dl.urgency ? (
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium capitalize ${urgencyBadge(dl.urgency)}`}>
                                {dl.urgency}
                              </span>
                            ) : loading ? '...' : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Loading / Error states */}
            {loading && !data && (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading fresh USAC data...
              </div>
            )}
            {error && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                {error}
                <button onClick={fetchFreshData} className="ml-2 text-amber-600 hover:text-amber-800 underline">
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
            <a
              href="/consultant?tab=frn-status"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View in FRN Status Tab
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
