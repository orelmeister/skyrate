'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import {
  X, AlertTriangle, Clock, Calendar, DollarSign,
  Building2, FileText, ChevronRight, Loader2, ExternalLink,
  Shield, TrendingUp, Download, ChevronDown, Filter, Info
} from 'lucide-react';
import { api } from '@/lib/api';

interface FRNDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  frn: string;
  ben?: string;
  onViewInTab?: (frn: string, ben: string) => void;
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

interface DisbursementRecord {
  invoice_id: string;
  invoice_type: string;
  form_nickname: string;
  customer_billed_dt: string;
  inv_line_completion_date: string;
  requested_inv_line_amt: number;
  approved_inv_line_amt: number;
  inv_line_item_status: string;
}

type DisbursementFilter = 'all' | 'spi' | 'bear';

function DisbursementPanel({ frn, isOpen, onClose }: { frn: string; isOpen: boolean; onClose: () => void }) {
  const [records, setRecords] = useState<DisbursementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DisbursementFilter>('all');

  useEffect(() => {
    if (isOpen && frn) {
      setLoading(true);
      setError(null);
      api.get<{ success: boolean; disbursements: DisbursementRecord[] }>(`/usac/frn/${frn}/disbursements`)
        .then(resp => {
          if (resp.success && resp.data?.disbursements) {
            setRecords(resp.data.disbursements);
          } else {
            setError(resp.error || 'Failed to load disbursements');
          }
        })
        .catch(() => setError('Network error'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, frn]);

  const filtered = records.filter(r => {
    if (filter === 'all') return true;
    const type = (r.invoice_type || r.form_nickname || '').toLowerCase();
    if (filter === 'spi') return type.includes('spi') || type.includes('474');
    if (filter === 'bear') return type.includes('bear') || type.includes('472');
    return true;
  });

  const handleCsvDownload = () => {
    const headers = ['Invoice ID', 'Type', 'Form', 'Billed Date', 'Completion Date', 'Requested Amount', 'Approved Amount', 'Status'];
    const rows = filtered.map(r => [
      r.invoice_id,
      r.invoice_type,
      r.form_nickname,
      r.customer_billed_dt?.slice(0, 10) || '',
      r.inv_line_completion_date?.slice(0, 10) || '',
      r.requested_inv_line_amt.toFixed(2),
      r.approved_inv_line_amt.toFixed(2),
      r.inv_line_item_status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FRN_${frn}_Disbursements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePdfDownload = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const url = `${baseUrl}/api/v1/usac/frn/${frn}/disbursements/pdf`;
    const a = document.createElement('a');
    a.href = token ? `${url}?token=${encodeURIComponent(token)}` : url;
    a.target = '_blank';
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="mt-1 animate-in slide-in-from-top-2 duration-300">
      <div className="bg-white rounded-xl border border-teal-200 shadow-lg overflow-hidden">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-teal-100">
          <h4 className="text-sm font-semibold text-teal-800 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" /> Disbursement Schedule
          </h4>
          <button onClick={onClose} className="p-1 rounded hover:bg-teal-100 text-teal-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {(['all', 'spi', 'bear'] as DisbursementFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : f === 'spi' ? 'SPI (Form 474)' : 'BEAR (Form 472)'}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleCsvDownload}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded transition-colors disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={handlePdfDownload}
            disabled={records.length === 0}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded transition-colors disabled:opacity-50"
          >
            <FileText className="h-3 w-3" /> PDF
          </button>
        </div>

        {/* Content */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading disbursements...
            </div>
          ) : error ? (
            <div className="px-4 py-4 text-sm text-amber-700 bg-amber-50">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 text-center">
              {records.length === 0 ? 'No disbursement records found for this FRN.' : 'No records match the selected filter.'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left font-medium">Invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Requested</th>
                  <th className="px-3 py-2 text-right font-medium">Approved</th>
                  <th className="px-3 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-slate-800">{r.invoice_id || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        (r.invoice_type || '').toLowerCase().includes('spi')
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {r.invoice_type || r.form_nickname || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.inv_line_completion_date?.slice(0, 10) || r.customer_billed_dt?.slice(0, 10) || '-'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatCurrency(r.requested_inv_line_amt)}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">{formatCurrency(r.approved_inv_line_amt)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        (r.inv_line_item_status || '').toLowerCase().includes('approv')
                          ? 'bg-emerald-100 text-emerald-700'
                          : (r.inv_line_item_status || '').toLowerCase().includes('denied')
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {r.inv_line_item_status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer summary */}
        {filtered.length > 0 && !loading && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            <span className="font-medium text-emerald-700">
              Total Approved: {formatCurrency(filtered.reduce((sum, r) => sum + r.approved_inv_line_amt, 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ShimmerLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded h-4 ${className}`} />;
}

export default function FRNDetailModal({ isOpen, onClose, frn, ben, onViewInTab, initialData }: FRNDetailModalProps) {
  const [data, setData] = useState<FRNData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disbursementOpen, setDisbursementOpen] = useState(false);

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
      setDisbursementOpen(false);
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
                <div
                  onClick={() => setDisbursementOpen(!disbursementOpen)}
                  className="cursor-pointer group"
                >
                  <p className="text-slate-500 text-xs flex items-center gap-1">
                    Disbursed
                    <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${disbursementOpen ? 'rotate-180' : ''}`} />
                  </p>
                  <p className="font-semibold text-slate-900 group-hover:text-teal-700 group-hover:underline decoration-dotted underline-offset-2 transition-colors">
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

            {/* Disbursement Schedule Panel */}
            <DisbursementPanel
              frn={display.frn as string || frn}
              isOpen={disbursementOpen}
              onClose={() => setDisbursementOpen(false)}
            />

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
            {onViewInTab ? (
              <button
                onClick={() => {
                  onViewInTab(display.frn as string || frn, display.ben as string || ben || '');
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View in FRN Status Tab
              </button>
            ) : (
              <a
                href={`/consultant?tab=frn-status&frn=${encodeURIComponent(display.frn as string || frn)}&ben=${encodeURIComponent(display.ben as string || ben || '')}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View in FRN Status Tab
              </a>
            )}
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
