'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Building2, Plus, Trash2, RefreshCw, ArrowLeft, Loader2, 
  CheckCircle, XCircle, Clock, CreditCard, AlertCircle, MapPin,
  DollarSign, FileText, Settings
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api';

interface BENData {
  id: number;
  ben: string;
  is_primary: boolean;
  display_name: string | null;
  organization_name: string | null;
  state: string | null;
  city: string | null;
  entity_type: string | null;
  discount_rate: number | null;
  subscription_status: string;
  is_paid: boolean;
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
}

interface BENsResponse {
  bens: BENData[];
  total_count: number;
  active_count: number;
  primary_ben: string;
}

export default function BENSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user, token } = useAuthStore();
  const [bens, setBens] = useState<BENData[]>([]);
  const [primaryBen, setPrimaryBen] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Add BEN modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBen, setNewBen] = useState('');
  const [newBenDisplayName, setNewBenDisplayName] = useState('');
  const [addingBen, setAddingBen] = useState(false);
  
  // Syncing state
  const [syncingBenId, setSyncingBenId] = useState<number | null>(null);
  
  // Delete confirmation
  const [deletingBenId, setDeletingBenId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/sign-in');
      return;
    }
    if (user?.role !== 'applicant') {
      router.push('/dashboard');
      return;
    }
    fetchBens();
  }, [isAuthenticated, user, router]);

  const fetchBens = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<BENsResponse>('/applicant/bens');
      if (response.success && response.data) {
        setBens(response.data.bens);
        setPrimaryBen(response.data.primary_ben);
      } else {
        throw new Error(response.error || 'Failed to fetch BENs');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch BENs');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBen = async () => {
    if (!newBen.trim()) return;
    
    try {
      setAddingBen(true);
      setError(null);
      
      const response = await api.post<{ ben: BENData; needs_payment: boolean; message: string }>('/applicant/bens', {
        ben: newBen.trim(),
        display_name: newBenDisplayName.trim() || null
      });
      
      // Add to list
      if (response.data?.ben) {
        setBens(prev => [...prev, response.data!.ben]);
      }
      
      // Reset form
      setNewBen('');
      setNewBenDisplayName('');
      setShowAddModal(false);
      
      // If payment is needed, show alert or redirect
      if (response.data?.needs_payment) {
        alert(`BEN added! Payment of $49/month is required to activate monitoring for ${newBen}.`);
        // In production, redirect to Stripe checkout
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add BEN');
    } finally {
      setAddingBen(false);
    }
  };

  const handleSyncBen = async (benId: number) => {
    try {
      setSyncingBenId(benId);
      await api.post(`/applicant/bens/${benId}/sync`, {});
      // Refresh the list
      await fetchBens();
    } catch (err: any) {
      if (err.message?.includes('Payment required')) {
        alert('Payment required to sync this BEN');
      } else {
        setError(err.message || 'Failed to sync BEN');
      }
    } finally {
      setSyncingBenId(null);
    }
  };

  const handleDeleteBen = async (benId: number) => {
    try {
      await api.delete(`/applicant/bens/${benId}`);
      setBens(prev => prev.filter(b => b.id !== benId));
      setDeletingBenId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete BEN');
    }
  };

  const handleActivateBen = async (benId: number) => {
    try {
      await api.post(`/applicant/bens/${benId}/activate`, {});
      await fetchBens();
    } catch (err: any) {
      setError(err.message || 'Failed to activate BEN');
    }
  };

  const getStatusBadge = (ben: BENData) => {
    if (ben.is_paid && ben.subscription_status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/30">
          <CheckCircle size={12} />
          Active
        </span>
      );
    } else if (ben.subscription_status === 'pending_payment') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
          <CreditCard size={12} />
          Payment Required
        </span>
      );
    } else if (ben.subscription_status === 'trial') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30">
          <Clock size={12} />
          Trial
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-500/10 text-gray-400 border border-gray-500/30">
          <XCircle size={12} />
          Inactive
        </span>
      );
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="text-xs text-green-400">Synced</span>;
      case 'syncing':
        return <span className="text-xs text-blue-400">Syncing...</span>;
      case 'failed':
        return <span className="text-xs text-red-400">Sync failed</span>;
      case 'pending':
        return <span className="text-xs text-gray-400">Pending</span>;
      default:
        return <span className="text-xs text-gray-400">{status}</span>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-blue)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      {/* Header */}
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/applicant"
              className="p-2 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)]"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Manage BEN Numbers</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Monitor multiple locations with separate BEN subscriptions
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)] text-white font-medium hover:opacity-90 transition"
          >
            <Plus size={18} />
            Add BEN
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <XCircle size={18} />
            </button>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Building2 className="text-blue-400" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{bens?.length || 0}</p>
                <p className="text-sm text-[var(--text-muted)]">Total BENs</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle className="text-green-400" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{bens?.filter(b => b.is_paid).length || 0}</p>
                <p className="text-sm text-[var(--text-muted)]">Active Subscriptions</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <DollarSign className="text-purple-400" size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  ${(bens?.reduce((sum, b) => sum + (b.stats?.total_funded || 0), 0) || 0).toLocaleString()}
                </p>
                <p className="text-sm text-[var(--text-muted)]">Total E-Rate Funding</p>
              </div>
            </div>
          </div>
        </div>

        {/* BEN List */}
        <div className="space-y-4">
          {(!bens || bens.length === 0) ? (
            <div className="text-center py-12 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]">
              <Building2 className="mx-auto mb-4 text-[var(--text-muted)]" size={48} />
              <h3 className="text-lg font-medium mb-2">No BENs Found</h3>
              <p className="text-[var(--text-muted)] mb-4">
                Add your first BEN number to start monitoring E-Rate applications
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-blue)] text-white"
              >
                <Plus size={18} />
                Add Your First BEN
              </button>
            </div>
          ) : (
            bens.map((ben) => (
              <div 
                key={ben.id}
                className={`p-6 rounded-xl bg-[var(--bg-secondary)] border ${
                  ben.is_primary 
                    ? 'border-[var(--brand-blue)]/50 ring-1 ring-[var(--brand-blue)]/20' 
                    : 'border-[var(--border-color)]'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${
                      ben.is_paid 
                        ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20' 
                        : 'bg-gray-500/10'
                    }`}>
                      <Building2 className={ben.is_paid ? 'text-blue-400' : 'text-gray-400'} size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">
                          {ben.display_name || ben.organization_name || `BEN ${ben.ben}`}
                        </h3>
                        {ben.is_primary && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] border border-[var(--brand-blue)]/30">
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-[var(--text-muted)] text-sm font-mono">BEN: {ben.ben}</p>
                      {ben.city && ben.state && (
                        <p className="text-[var(--text-muted)] text-sm flex items-center gap-1 mt-1">
                          <MapPin size={12} />
                          {ben.city}, {ben.state}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(ben)}
                    {getSyncStatusBadge(ben.sync_status)}
                  </div>
                </div>

                {/* Stats */}
                {ben.is_paid && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 p-4 rounded-lg bg-[var(--bg-main)]">
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Applications</p>
                      <p className="font-semibold">{ben.stats.total_applications}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Funded</p>
                      <p className="font-semibold text-green-400">{formatCurrency(ben.stats.total_funded)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Pending</p>
                      <p className="font-semibold text-yellow-400">{formatCurrency(ben.stats.total_pending)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Denied</p>
                      <p className="font-semibold text-red-400">{formatCurrency(ben.stats.total_denied)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Active Appeals</p>
                      <p className="font-semibold">{ben.stats.active_appeals_count}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
                  <div className="text-sm text-[var(--text-muted)]">
                    {ben.last_sync_at ? (
                      `Last synced: ${new Date(ben.last_sync_at).toLocaleString()}`
                    ) : (
                      'Never synced'
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!ben.is_paid && (
                      <button
                        onClick={() => handleActivateBen(ben.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-sm"
                      >
                        <CreditCard size={14} />
                        Activate ($49/mo)
                      </button>
                    )}
                    {ben.is_paid && (
                      <button
                        onClick={() => handleSyncBen(ben.id)}
                        disabled={syncingBenId === ben.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm disabled:opacity-50"
                      >
                        <RefreshCw size={14} className={syncingBenId === ben.id ? 'animate-spin' : ''} />
                        {syncingBenId === ben.id ? 'Syncing...' : 'Sync Now'}
                      </button>
                    )}
                    {!ben.is_primary && (
                      <button
                        onClick={() => setDeletingBenId(ben.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Delete Confirmation */}
                {deletingBenId === ben.id && (
                  <div className="mt-4 p-4 rounded-lg bg-red-500/5 border border-red-500/30">
                    <p className="text-sm text-red-400 mb-3">
                      Are you sure you want to remove this BEN? This will cancel any active subscription.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteBen(ben.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm"
                      >
                        Yes, Remove
                      </button>
                      <button
                        onClick={() => setDeletingBenId(null)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-main)] text-[var(--text-muted)] text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pricing Info */}
        <div className="mt-8 p-6 rounded-xl bg-gradient-to-br from-[var(--brand-blue)]/5 to-[var(--brand-purple)]/5 border border-[var(--brand-blue)]/20">
          <h3 className="font-semibold mb-2">Multi-Location Pricing</h3>
          <p className="text-[var(--text-muted)] text-sm mb-4">
            Each BEN number is a separate subscription at <strong className="text-white">$49/month</strong>. 
            Perfect for school districts with multiple locations:
          </p>
          <ul className="text-sm text-[var(--text-muted)] space-y-1">
            <li className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Monitor E-Rate applications for each location
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Automatic denial detection and appeal generation
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Real-time status change alerts
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Deadline tracking and reminders
            </li>
          </ul>
        </div>
      </main>

      {/* Add BEN Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <h2 className="text-xl font-semibold mb-4">Add New BEN</h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Enter the Billed Entity Number (BEN) for your school or location.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">BEN Number *</label>
                <input
                  type="text"
                  value={newBen}
                  onChange={(e) => setNewBen(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g., 16056315"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Display Name (optional)</label>
                <input
                  type="text"
                  value={newBenDisplayName}
                  onChange={(e) => setNewBenDisplayName(e.target.value)}
                  placeholder="e.g., High School, Library"
                  className="w-full px-4 py-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] focus:border-[var(--brand-blue)] focus:ring-1 focus:ring-[var(--brand-blue)] outline-none"
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  A friendly name to identify this location
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/30">
              <p className="text-sm text-yellow-400">
                <strong>Payment Required:</strong> Adding a new BEN requires a subscription of $49/month.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewBen('');
                  setNewBenDisplayName('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-main)] text-[var(--text-muted)] hover:bg-[var(--border-color)]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBen}
                disabled={!newBen.trim() || addingBen}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-purple)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {addingBen ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Add BEN
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
