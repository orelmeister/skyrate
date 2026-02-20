"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { requestNotificationPermission, subscribeToPush, isPushSupported, getNotificationPermission } from "@/lib/notifications";
import { useTabParam } from "@/hooks/useTabParam";

const ADMIN_TABS = ["overview", "users", "tickets", "frn", "promo", "communications", "blog"] as const;
type AdminTab = typeof ADMIN_TABS[number];

// ==================== TYPES ====================

interface DashboardData {
  users: {
    total: number;
    active: number;
    new_7d: number;
    new_30d: number;
    by_role: Record<string, number>;
  };
  subscriptions: { active: number };
  tickets: {
    open: number;
    total: number;
    recent: any[];
  };
  frn_monitoring: {
    total_tracked: number;
    denied: number;
    denied_current_prev_fy: number;
  };
  portfolio: {
    consultant_schools: number;
    applicant_bens: number;
    vendor_spins: number;
    live: {
      total_bens_tracked: number;
      funded_amount: number;
      pending_amount: number;
      denied_count: number;
      denied_current_prev_fy: number;
      total_frns: number;
      funded_count: number;
      pending_count: number;
    };
  };
  recent_alerts: any[];
  generated_at: string;
}

// ==================== MAIN COMPONENT ====================

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  const [activeTab, setActiveTab] = useTabParam<AdminTab>("overview", ADMIN_TABS);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [frns, setFrns] = useState<any[]>([]);
  const [frnSummary, setFrnSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // User management state
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [usersTotal, setUsersTotal] = useState(0);

  // Ticket state
  const [ticketStatusFilter, setTicketStatusFilter] = useState("");
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState("");

  // Communication state
  const [emailUserId, setEmailUserId] = useState<number | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  // Auth guard — wait for Zustand hydration before redirecting
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in");
    } else if (user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  // Show loading spinner while store hydrates from localStorage
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Load dashboard
  useEffect(() => {
    if (user?.role === "admin") {
      loadDashboard();
    }
  }, [user]);

  // Load tab-specific data
  useEffect(() => {
    if (user?.role === "admin") {
      if (activeTab === "users") loadUsers();
      if (activeTab === "tickets") loadTickets();
      if (activeTab === "frn") loadFRNs();
    }
  }, [activeTab, userSearch, userRoleFilter, ticketStatusFilter]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const res = await api.getAdminDashboard();
      if (res.data?.dashboard) setDashboard(res.data.dashboard);
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard");
    }
    setLoading(false);
  }

  async function loadUsers() {
    try {
      const res = await api.getAdminUsers({
        search: userSearch || undefined,
        role: userRoleFilter || undefined,
        limit: 50,
      });
      const data = res.data?.users || [];
      setUsers(data);
      setUsersTotal(res.data?.total || data.length);
    } catch (e) {
      console.error("Failed to load users", e);
    }
  }

  async function loadTickets() {
    try {
      const res = await api.getAdminTickets({
        status: ticketStatusFilter || undefined,
        limit: 50,
      });
      const data = res.data?.tickets || [];
      setTickets(data);
      setTicketsTotal(res.data?.total || data.length);
    } catch (e) {
      console.error("Failed to load tickets", e);
    }
  }

  async function loadFRNs() {
    try {
      const res = await api.getAdminFRNMonitor({});
      const data = res.data?.frns || [];
      setFrns(data);
      setFrnSummary(res.data?.summary || null);
    } catch (e) {
      console.error("Failed to load FRNs", e);
    }
  }

  async function handleReplyTicket() {
    if (!selectedTicket || !replyText.trim()) return;
    try {
      await api.replyToTicket(selectedTicket.id, replyText);
      setReplyText("");
      // Refresh ticket detail
      const res = await api.getAdminTicket(selectedTicket.id);
      setSelectedTicket(res.data?.ticket);
      loadTickets();
    } catch (e) {
      alert("Failed to send reply");
    }
  }

  async function handleUpdateTicketStatus(ticketId: number, status: string) {
    try {
      await api.updateAdminTicket(ticketId, { status });
      loadTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status });
      }
    } catch (e) {
      alert("Failed to update ticket status");
    }
  }

  async function handleSendEmail() {
    if (!emailUserId || !emailSubject.trim() || !emailMessage.trim()) return;
    setEmailSending(true);
    try {
      await api.emailUser(emailUserId, emailSubject, emailMessage);
      alert("Email sent successfully!");
      setEmailSubject("");
      setEmailMessage("");
      setEmailUserId(null);
    } catch (e) {
      alert("Failed to send email");
    }
    setEmailSending(false);
  }

  async function openTicketDetail(ticket: any) {
    try {
      const res = await api.getAdminTicket(ticket.id);
      setSelectedTicket(res.data?.ticket);
    } catch {
      setSelectedTicket(ticket);
    }
  }

  if (!user || user.role !== "admin") return null;

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-950 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>
            <span className="ml-2 text-xs bg-red-600 px-2 py-0.5 rounded-full font-semibold">ADMIN</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{user.email}</span>
            <button
              onClick={() => { useAuthStore.getState().logout(); router.push("/"); }}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {[
            { key: "overview", label: "Overview", icon: "📊" },
            { key: "users", label: "Users", icon: "👥" },
            { key: "tickets", label: "Support Tickets", icon: "🎫" },
            { key: "frn", label: "FRN Monitor", icon: "📡" },
            { key: "promo", label: "Promo Invites", icon: "🎟️" },
            { key: "communications", label: "Communications", icon: "📧" },
            { key: "blog", label: "Blog Manager", icon: "📝" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as AdminTab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading && activeTab === "overview" ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : (
          <>
            {activeTab === "overview" && dashboard && <OverviewTab dashboard={dashboard} setActiveTab={setActiveTab} />}
            {activeTab === "users" && (
              <UsersTab
                users={users}
                total={usersTotal}
                search={userSearch}
                setSearch={setUserSearch}
                roleFilter={userRoleFilter}
                setRoleFilter={setUserRoleFilter}
                onEmailUser={(id) => { setEmailUserId(id); setActiveTab("communications"); }}
              />
            )}
            {activeTab === "tickets" && (
              <TicketsTab
                tickets={tickets}
                total={ticketsTotal}
                statusFilter={ticketStatusFilter}
                setStatusFilter={setTicketStatusFilter}
                selectedTicket={selectedTicket}
                onSelectTicket={openTicketDetail}
                onCloseTicket={() => setSelectedTicket(null)}
                replyText={replyText}
                setReplyText={setReplyText}
                onReply={handleReplyTicket}
                onUpdateStatus={handleUpdateTicketStatus}
              />
            )}
            {activeTab === "frn" && (
              <FRNMonitorTab frns={frns} summary={frnSummary} onRefresh={async () => {
                try {
                  await api.refreshAdminFRNSnapshot();
                  alert("FRN refresh started in background. Reload in 2-3 minutes.");
                } catch (e) {
                  alert("Failed to trigger refresh");
                }
              }} />
            )}
            {activeTab === "promo" && <PromoInvitesTab />}
            {activeTab === "communications" && (
              <CommunicationsTab
                users={users}
                emailUserId={emailUserId}
                setEmailUserId={setEmailUserId}
                emailSubject={emailSubject}
                setEmailSubject={setEmailSubject}
                emailMessage={emailMessage}
                setEmailMessage={setEmailMessage}
                sending={emailSending}
                onSend={handleSendEmail}
                loadUsers={loadUsers}
              />
            )}
            {activeTab === "blog" && <BlogManagerTab />}
          </>
        )}
      </main>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================

function OverviewTab({ dashboard, setActiveTab }: { dashboard: DashboardData; setActiveTab: (t: any) => void }) {
  const portfolio = dashboard.portfolio;
  const live = portfolio?.live;
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={dashboard.users.total} sub={`+${dashboard.users.new_7d} this week`} color="purple" />
        <StatCard label="Active Subscriptions" value={dashboard.subscriptions.active} color="green" />
        <StatCard label="Open Tickets" value={dashboard.tickets.open} sub={`${dashboard.tickets.total} total`} color="amber" onClick={() => setActiveTab("tickets")} />
        <StatCard label="FRN Denials" value={dashboard.frn_monitoring.denied_current_prev_fy} sub={`${dashboard.frn_monitoring.denied} total denied (all years)`} color="red" onClick={() => setActiveTab("frn")} />
      </div>

      {/* Portfolio Overview */}
      {portfolio && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Platform Portfolio</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-700">{portfolio.consultant_schools}</div>
              <div className="text-sm text-purple-600">Consultant Schools</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-700">{portfolio.applicant_bens}</div>
              <div className="text-sm text-green-600">Applicant BENs</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-700">{portfolio.vendor_spins}</div>
              <div className="text-sm text-blue-600">Vendor SPINs</div>
            </div>
          </div>
          {live && live.total_bens_tracked > 0 && (
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Live USAC FRN Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-slate-900">{live.total_bens_tracked}</div>
                  <div className="text-xs text-slate-500">BENs Tracked</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{live.funded_count}</div>
                  <div className="text-xs text-slate-500">Funded ({live.funded_amount > 0 ? `$${(live.funded_amount / 1000000).toFixed(1)}M` : "$0"})</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600">{live.pending_count}</div>
                  <div className="text-xs text-slate-500">Pending ({live.pending_amount > 0 ? `$${(live.pending_amount / 1000000).toFixed(1)}M` : "$0"})</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{live.denied_count}</div>
                  <div className="text-xs text-slate-500">Denied</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* User Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Users by Role</h3>
          <div className="space-y-3">
            {Object.entries(dashboard.users.by_role).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    role === "consultant" ? "bg-purple-500" :
                    role === "vendor" ? "bg-blue-500" :
                    role === "applicant" ? "bg-green-500" :
                    "bg-red-500"
                  }`} />
                  <span className="text-sm capitalize text-slate-700">{role}</span>
                </div>
                <span className="font-semibold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-slate-900 mb-4">FRN Monitoring</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Total Tracked</span>
              <span className="font-semibold">{dashboard.frn_monitoring.total_tracked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Denied (Current + Prev FY)</span>
              <span className="font-semibold text-red-600">{dashboard.frn_monitoring.denied_current_prev_fy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Denied (All Years)</span>
              <span className="font-semibold text-red-600">{dashboard.frn_monitoring.denied}</span>
            </div>
            <button onClick={() => setActiveTab("frn")} className="w-full mt-2 text-sm text-purple-600 hover:text-purple-800 hover:underline text-center py-2 rounded-lg bg-purple-50">
              View Full FRN Monitor →
            </button>
          </div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Recent Support Tickets</h3>
          <button onClick={() => setActiveTab("tickets")} className="text-sm text-purple-600 hover:underline">View all</button>
        </div>
        {dashboard.tickets.recent.length === 0 ? (
          <p className="text-slate-500 text-sm">No tickets yet</p>
        ) : (
          <div className="space-y-2">
            {dashboard.tickets.recent.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <span className="text-sm font-medium text-slate-900">#{t.id} {t.subject}</span>
                  <p className="text-xs text-slate-500">{t.user_email || t.guest_email} — {t.category}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Alerts */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Recent System Alerts</h3>
        {dashboard.recent_alerts.length === 0 ? (
          <p className="text-slate-500 text-sm">No recent alerts</p>
        ) : (
          <div className="space-y-2">
            {dashboard.recent_alerts.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <span className={`w-2 h-2 rounded-full ${
                  a.priority === "critical" ? "bg-red-500" :
                  a.priority === "high" ? "bg-orange-500" :
                  a.priority === "medium" ? "bg-yellow-500" : "bg-blue-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-800 truncate block">{a.title}</span>
                  <span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== USERS TAB ====================

function UsersTab({
  users, total, search, setSearch, roleFilter, setRoleFilter, onEmailUser,
}: {
  users: any[]; total: number; search: string; setSearch: (s: string) => void;
  roleFilter: string; setRoleFilter: (r: string) => void; onEmailUser: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Roles</option>
          <option value="consultant">Consultant</option>
          <option value="vendor">Vendor</option>
          <option value="applicant">Applicant</option>
          <option value="admin">Admin</option>
        </select>
        <span className="text-sm text-slate-500">{total} users</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Company</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Portfolio</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Joined</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900">{u.email}</td>
                <td className="px-4 py-3">{u.full_name || u.first_name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.role === "admin" ? "bg-red-100 text-red-700" :
                    u.role === "consultant" ? "bg-purple-100 text-purple-700" :
                    u.role === "vendor" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}>{u.role}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{u.company_name || "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {u.portfolio ? (
                    u.role === "consultant" ? (
                      <span title={u.portfolio.crn ? `CRN: ${u.portfolio.crn}` : ""}>
                        {u.portfolio.schools_count} school{u.portfolio.schools_count !== 1 ? "s" : ""}
                        {u.portfolio.crn && <span className="ml-1 text-slate-400">({u.portfolio.crn})</span>}
                      </span>
                    ) : u.role === "vendor" ? (
                      <span>SPIN: {u.portfolio.spin || "—"}</span>
                    ) : u.role === "applicant" ? (
                      <span>
                        {u.portfolio.ben_count} BEN{u.portfolio.ben_count !== 1 ? "s" : ""}
                        {u.portfolio.organization && <span className="ml-1 text-slate-400">({u.portfolio.organization})</span>}
                      </span>
                    ) : "—"
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${u.is_active ? "text-green-600" : "text-red-500"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onEmailUser(u.id)}
                    className="text-xs text-purple-600 hover:underline"
                  >
                    Email
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== TICKETS TAB ====================

function TicketsTab({
  tickets, total, statusFilter, setStatusFilter,
  selectedTicket, onSelectTicket, onCloseTicket,
  replyText, setReplyText, onReply, onUpdateStatus,
}: {
  tickets: any[]; total: number; statusFilter: string; setStatusFilter: (s: string) => void;
  selectedTicket: any; onSelectTicket: (t: any) => void; onCloseTicket: () => void;
  replyText: string; setReplyText: (s: string) => void; onReply: () => void;
  onUpdateStatus: (id: number, status: string) => void;
}) {
  if (selectedTicket) {
    return (
      <div className="space-y-4">
        <button onClick={onCloseTicket} className="text-sm text-purple-600 hover:underline">&larr; Back to tickets</button>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">#{selectedTicket.id} {selectedTicket.subject}</h2>
              <p className="text-sm text-slate-500">
                {selectedTicket.user_email || selectedTicket.guest_email} — {selectedTicket.category} — {new Date(selectedTicket.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedTicket.status} />
              <select
                value={selectedTicket.status}
                onChange={(e) => onUpdateStatus(selectedTicket.id, e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_user">Waiting User</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3 mt-6 max-h-96 overflow-y-auto">
            {(selectedTicket.messages || []).map((m: any) => (
              <div key={m.id} className={`p-3 rounded-lg ${
                m.sender_type === "admin" ? "bg-purple-50 ml-8" : "bg-slate-50 mr-8"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700">{m.sender_name}{m.sender_type === "admin" ? " (Admin)" : ""}</span>
                  <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.message}</p>
              </div>
            ))}
          </div>

          {/* Reply */}
          <div className="mt-4 flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
            />
            <button
              onClick={onReply}
              disabled={!replyText.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 self-end"
            >
              Reply
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting_user">Waiting User</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <span className="text-sm text-slate-500">{total} tickets</span>
      </div>

      <div className="space-y-2">
        {tickets.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No tickets found</p>
        ) : tickets.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectTicket(t)}
            className="bg-white rounded-xl shadow-sm border p-4 cursor-pointer hover:border-purple-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-slate-900 truncate">#{t.id} {t.subject}</h3>
                <p className="text-sm text-slate-500 mt-1 truncate">{t.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-500">{t.user_email || t.guest_email}</span>
                  <span className="text-xs text-slate-400">{t.category}</span>
                  <span className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== FRN MONITOR TAB ====================

function FRNMonitorTab({ frns, summary, onRefresh }: { frns: any[]; summary: any; onRefresh?: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("org");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());

  // USAC open data link for an FRN
  const getUSACLink = (frn: string) =>
    `https://opendata.usac.org/E-Rate/FCC-Form-471-FRN-Status/qdmp-ygft/explore?q=${encodeURIComponent(frn)}`;

  // Filter FRNs by search query and status
  const filteredFRNs = useMemo(() => {
    return frns.filter((f) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        f.organization_name?.toLowerCase().includes(q) ||
        f.frn?.toString().includes(q) ||
        f.ben?.toString().includes(q) ||
        f.user_email?.toLowerCase().includes(q);

      const s = f.status?.toLowerCase() || "";
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "denied" && s.includes("denied")) ||
        (statusFilter === "funded" && (s.includes("funded") || s.includes("committed"))) ||
        (statusFilter === "pending" && s.includes("pending"));

      return matchesSearch && matchesStatus;
    });
  }, [frns, searchQuery, statusFilter]);

  // Group filtered FRNs by organization
  const orgGroups = useMemo(() => {
    const groups: Record<
      string,
      {
        name: string;
        ben: string;
        frns: any[];
        totalFRNs: number;
        denied: number;
        funded: number;
        pending: number;
        totalAmount: number;
        sources: Set<string>;
        years: Set<string>;
      }
    > = {};

    filteredFRNs.forEach((f) => {
      const key = f.organization_name || f.ben || "Unknown";
      if (!groups[key]) {
        groups[key] = {
          name: key,
          ben: f.ben || "",
          frns: [],
          totalFRNs: 0,
          denied: 0,
          funded: 0,
          pending: 0,
          totalAmount: 0,
          sources: new Set(),
          years: new Set(),
        };
      }
      const g = groups[key];
      g.frns.push(f);
      g.totalFRNs++;
      const st = f.status?.toLowerCase() || "";
      if (st.includes("denied")) g.denied++;
      if (st.includes("funded") || st.includes("committed")) g.funded++;
      if (st.includes("pending")) g.pending++;
      if (f.amount_requested) g.totalAmount += Number(f.amount_requested);
      if (f.source) g.sources.add(f.source);
      if (f.funding_year) g.years.add(String(f.funding_year));
    });

    return Object.values(groups);
  }, [filteredFRNs]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    return [...orgGroups].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "org":
          cmp = a.name.localeCompare(b.name);
          break;
        case "frns":
          cmp = a.totalFRNs - b.totalFRNs;
          break;
        case "denied":
          cmp = a.denied - b.denied;
          break;
        case "amount":
          cmp = a.totalAmount - b.totalAmount;
          break;
        case "year":
          cmp = [...a.years].sort().join(",").localeCompare([...b.years].sort().join(","));
          break;
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [orgGroups, sortField, sortDir]);

  const toggleOrg = (name: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <span className="ml-1 text-xs opacity-60">
      {sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const expandAll = () => setExpandedOrgs(new Set(sortedGroups.map((g) => g.name)));
  const collapseAll = () => setExpandedOrgs(new Set());

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Tracked" value={summary.total_tracked} color="purple" />
            <StatCard label="Funded" value={summary.funded} color="green" />
            <StatCard label="Pending" value={summary.pending} color="amber" />
            <StatCard label="Denied" value={summary.denied} color="red" />
          </div>
          {summary.last_refreshed && (
            <div className="flex items-center justify-end gap-3">
              <p className="text-xs text-slate-400">
                Last refreshed: {new Date(summary.last_refreshed).toLocaleString()}
              </p>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
                >
                  ↻ Refresh Now
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search bar + status filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by organization, FRN, BEN, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
          />
          <svg
            className="absolute left-3 top-3 w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "funded", "pending", "denied"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                statusFilter === s
                  ? s === "funded"
                    ? "bg-green-600 text-white"
                    : s === "pending"
                    ? "bg-amber-500 text-white"
                    : s === "denied"
                    ? "bg-red-600 text-white"
                    : "bg-purple-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Results count + expand/collapse */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {sortedGroups.length} organization{sortedGroups.length !== 1 ? "s" : ""} ·{" "}
          {filteredFRNs.length} FRN{filteredFRNs.length !== 1 ? "s" : ""}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
          >
            Expand All
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-purple-600 hover:text-purple-800 hover:underline"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Organization-grouped table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="w-8 px-3 py-3"></th>
              <th
                className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-purple-700"
                onClick={() => handleSort("org")}
              >
                Organization
                <SortIcon field="org" />
              </th>
              <th
                className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-purple-700"
                onClick={() => handleSort("frns")}
              >
                FRNs
                <SortIcon field="frns" />
              </th>
              <th
                className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-purple-700"
                onClick={() => handleSort("denied")}
              >
                Denied
                <SortIcon field="denied" />
              </th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Source</th>
              <th
                className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-purple-700"
                onClick={() => handleSort("year")}
              >
                Year
                <SortIcon field="year" />
              </th>
              <th
                className="text-left px-4 py-3 font-medium text-slate-600 cursor-pointer select-none hover:text-purple-700"
                onClick={() => handleSort("amount")}
              >
                Total Amount
                <SortIcon field="amount" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedGroups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {searchQuery
                    ? "No organizations match your search."
                    : "No FRNs being tracked."}
                </td>
              </tr>
            ) : (
              sortedGroups.map((org) => (
                <React.Fragment key={org.name}>
                  {/* Organization summary row */}
                  <tr
                    className="border-b hover:bg-purple-50/50 cursor-pointer transition-colors"
                    onClick={() => toggleOrg(org.name)}
                  >
                    <td className="px-3 py-3 text-slate-400">
                      <span
                        className="text-xs transition-transform duration-200 inline-block"
                        style={{
                          transform: expandedOrgs.has(org.name)
                            ? "rotate(90deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        ▶
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{org.name}</div>
                      {org.ben && (
                        <div className="text-xs text-slate-400">BEN: {org.ben}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{org.totalFRNs}</span>
                      <div className="text-xs text-slate-400">
                        {org.funded > 0 && (
                          <span className="text-green-600">{org.funded} funded</span>
                        )}
                        {org.funded > 0 && org.pending > 0 && " · "}
                        {org.pending > 0 && (
                          <span className="text-amber-600">{org.pending} pending</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {org.denied > 0 ? (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          {org.denied}
                        </span>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {[...org.sources].map((s) => (
                        <span
                          key={s}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium mr-1 ${
                            s === "consultant"
                              ? "bg-purple-100 text-purple-700"
                              : s === "vendor"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {[...org.years].sort().join(", ")}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      ${org.totalAmount.toLocaleString()}
                    </td>
                  </tr>

                  {/* Expanded individual FRN rows */}
                  {expandedOrgs.has(org.name) &&
                    org.frns.map((f: any, idx: number) => (
                      <tr
                        key={`${org.name}-${idx}`}
                        className="bg-slate-50/70 border-b last:border-b-0"
                      >
                        <td className="px-3 py-2"></td>
                        <td className="px-4 py-2 pl-8">
                          <a
                            href={getUSACLink(f.frn)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-purple-600 hover:text-purple-800 hover:underline"
                          >
                            {f.frn} ↗
                          </a>
                          {f.service_type && (
                            <span className="ml-2 text-xs text-slate-400">
                              {f.service_type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              f.status?.toLowerCase().includes("denied")
                                ? "bg-red-100 text-red-700"
                                : f.status?.toLowerCase().includes("funded") ||
                                  f.status?.toLowerCase().includes("committed")
                                ? "bg-green-100 text-green-700"
                                : f.status?.toLowerCase().includes("pending")
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {f.status || "Unknown"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {f.fcdl_date || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {f.user_email || "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {f.funding_year || "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-700">
                          {f.amount_requested
                            ? `$${Number(f.amount_requested).toLocaleString()}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== COMMUNICATIONS TAB ====================

function CommunicationsTab({
  users, emailUserId, setEmailUserId, emailSubject, setEmailSubject,
  emailMessage, setEmailMessage, sending, onSend, loadUsers,
}: {
  users: any[]; emailUserId: number | null; setEmailUserId: (id: number | null) => void;
  emailSubject: string; setEmailSubject: (s: string) => void;
  emailMessage: string; setEmailMessage: (s: string) => void;
  sending: boolean; onSend: () => void; loadUsers: () => void;
}) {
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastChannels, setBroadcastChannels] = useState<string[]>(["email"]);
  const [broadcastRole, setBroadcastRole] = useState<string>("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string>("");
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string>("");
  const [pushStatus, setPushStatus] = useState<string>("checking...");
  const [pushSubscribing, setPushSubscribing] = useState(false);

  useEffect(() => {
    if (users.length === 0) loadUsers();
    // Check push notification status
    if (isPushSupported()) {
      const perm = getNotificationPermission();
      setPushStatus(perm === 'granted' ? 'enabled' : perm === 'denied' ? 'blocked' : 'not-enabled');
    } else {
      setPushStatus('not-supported');
    }
  }, []);

  async function handleEnablePush() {
    setPushSubscribing(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission === 'granted') {
        const token = useAuthStore.getState().token;
        if (token) {
          const success = await subscribeToPush(token);
          setPushStatus(success ? 'enabled' : 'error');
        } else {
          setPushStatus('error');
        }
      } else if (permission === 'denied') {
        setPushStatus('blocked');
        alert('Notifications are blocked. Please enable them in your browser settings.');
      } else {
        setPushStatus('dismissed');
      }
    } catch (e) {
      console.error('Push subscribe error:', e);
      setPushStatus('error');
    }
    setPushSubscribing(false);
  }

  const toggleChannel = (ch: string) => {
    setBroadcastChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleBroadcast = async () => {
    if (!broadcastSubject.trim() || !broadcastMessage.trim() || broadcastChannels.length === 0) return;
    setBroadcastSending(true);
    setBroadcastResult("");
    try {
      const res = await api.adminBroadcast({
        channels: broadcastChannels,
        subject: broadcastSubject,
        message: broadcastMessage,
        role_filter: broadcastRole || undefined,
      });
      if (res.success) {
        const r = res.data?.results;
        setBroadcastResult(
          `Sent to ${r?.total_users || 0} users (Email: ${r?.email || 0}, Push: ${r?.push || 0}, SMS: ${r?.sms || 0}, In-app: ${r?.in_app || 0})`
        );
        setBroadcastSubject("");
        setBroadcastMessage("");
      } else {
        setBroadcastResult(`Error: ${res.error}`);
      }
    } catch (err: any) {
      setBroadcastResult(`Error: ${err.message}`);
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!emailUserId || !smsMessage.trim()) return;
    setSmsSending(true);
    setSmsResult("");
    try {
      const res = await api.sendSMSToUser(emailUserId, smsMessage);
      setSmsResult(res.success ? "SMS sent successfully" : `Error: ${res.error}`);
      if (res.success) setSmsMessage("");
    } catch (err: any) {
      setSmsResult(`Error: ${err.message}`);
    } finally {
      setSmsSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Push Notifications Status */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Push Notifications</h2>
        <p className="text-sm text-slate-500 mb-4">Enable desktop push notifications on this device to receive admin alerts</p>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
            pushStatus === 'enabled' ? 'bg-green-100 text-green-700' :
            pushStatus === 'blocked' ? 'bg-red-100 text-red-700' :
            pushStatus === 'not-supported' ? 'bg-slate-100 text-slate-500' :
            'bg-yellow-100 text-yellow-700'
          }`}>
            {pushStatus === 'enabled' ? '🔔 Enabled' :
             pushStatus === 'blocked' ? '🚫 Blocked in browser' :
             pushStatus === 'not-supported' ? '❌ Not supported' :
             pushStatus === 'error' ? '⚠️ Error' :
             '🔕 Not enabled'}
          </span>
          {pushStatus !== 'enabled' && pushStatus !== 'blocked' && pushStatus !== 'not-supported' && (
            <button
              onClick={handleEnablePush}
              disabled={pushSubscribing}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {pushSubscribing ? 'Enabling...' : 'Enable Push Notifications'}
            </button>
          )}
          {pushStatus === 'blocked' && (
            <span className="text-xs text-slate-500">Go to browser settings → Site permissions → Notifications → Allow for this site</span>
          )}
        </div>
      </div>

      {/* Broadcast Section */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Broadcast Notification</h2>
        <p className="text-sm text-slate-500 mb-4">Send a message to all users or filter by role</p>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Role</label>
              <select
                value={broadcastRole}
                onChange={(e) => setBroadcastRole(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All users</option>
                <option value="consultant">Consultants</option>
                <option value="vendor">Vendors</option>
                <option value="applicant">Applicants</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Channels</label>
              <div className="flex gap-1.5">
                {[
                  { key: "email", label: "Email", emoji: "📧" },
                  { key: "push", label: "Push", emoji: "🔔" },
                  { key: "sms", label: "SMS", emoji: "📱" },
                  { key: "in_app", label: "App", emoji: "📌" },
                ].map((ch) => (
                  <button
                    key={ch.key}
                    onClick={() => toggleChannel(ch.key)}
                    title={ch.label}
                    className={`px-2.5 py-1.5 rounded-lg text-sm border transition-colors ${
                      broadcastChannels.includes(ch.key)
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-slate-200 text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {ch.emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              value={broadcastSubject}
              onChange={(e) => setBroadcastSubject(e.target.value)}
              placeholder="Notification subject..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Write your broadcast message..."
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={5}
            />
          </div>

          {broadcastResult && (
            <p className={`text-sm ${broadcastResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {broadcastResult}
            </p>
          )}

          <button
            onClick={handleBroadcast}
            disabled={broadcastSending || !broadcastSubject.trim() || !broadcastMessage.trim() || broadcastChannels.length === 0}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
          >
            {broadcastSending ? "Sending Broadcast..." : "Send Broadcast"}
          </button>
        </div>
      </div>

      {/* Direct Email */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Send Email to User</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recipient</label>
            <select
              value={emailUserId || ""}
              onChange={(e) => setEmailUserId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a user...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Email subject..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Write your message (HTML supported)..."
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={6}
            />
          </div>

          <button
            onClick={onSend}
            disabled={sending || !emailUserId || !emailSubject.trim() || !emailMessage.trim()}
            className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </div>

      {/* Direct SMS */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Send SMS to User</h2>
        <p className="text-sm text-slate-500 mb-4">Send an SMS to a user with a verified phone number</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Recipient</label>
            <select
              value={emailUserId || ""}
              onChange={(e) => setEmailUserId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a user...</option>
              {users.filter((u) => u.phone).map((u) => (
                <option key={u.id} value={u.id}>{u.email} — {u.phone} ({u.role})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder="Write your SMS message..."
              className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
              maxLength={160}
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{smsMessage.length}/160 characters</p>
          </div>

          {smsResult && (
            <p className={`text-sm ${smsResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {smsResult}
            </p>
          )}

          <button
            onClick={handleSendSMS}
            disabled={smsSending || !emailUserId || !smsMessage.trim()}
            className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {smsSending ? "Sending..." : "Send SMS"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== SHARED COMPONENTS ====================

function StatCard({ label, value, sub, color, onClick }: {
  label: string; value: number; sub?: string; color: string; onClick?: () => void;
}) {
  const colors: Record<string, string> = {
    purple: "border-purple-200 bg-purple-50",
    green: "border-green-200 bg-green-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
  };
  const textColors: Record<string, string> = {
    purple: "text-purple-700",
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    blue: "text-blue-700",
  };
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border ${colors[color] || colors.purple} ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
    >
      <p className="text-sm text-slate-600">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color] || textColors.purple}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    waiting_user: "bg-orange-100 text-orange-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.open}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-blue-100 text-blue-700",
    high: "bg-orange-100 text-orange-700",
    urgent: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[priority] || styles.medium}`}>
      {priority}
    </span>
  );
}


// ==================== BLOG MANAGER TAB ====================

function BlogManagerTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  // Generator state
  const [showGenerator, setShowGenerator] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genKeyword, setGenKeyword] = useState("");
  const [genInstructions, setGenInstructions] = useState("");
  const [genModel, setGenModel] = useState("gemini");
  const [generating, setGenerating] = useState(false);

  // Editor state
  const [editingPost, setEditingPost] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editMeta, setEditMeta] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Image generation state
  const [generatingHero, setGeneratingHero] = useState(false);
  const [generatingMid, setGeneratingMid] = useState(false);
  const [heroImageKey, setHeroImageKey] = useState(0);
  const [midImageKey, setMidImageKey] = useState(0);

  // Blob URLs for authenticated image loading
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [midImageUrl, setMidImageUrl] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
  }, [statusFilter]);

  // Fetch blog images as blob URLs (img tags can't send auth headers)
  useEffect(() => {
    if (!editingPost) {
      // Revoke old blob URLs when leaving editor
      if (heroImageUrl) URL.revokeObjectURL(heroImageUrl);
      if (midImageUrl) URL.revokeObjectURL(midImageUrl);
      setHeroImageUrl(null);
      setMidImageUrl(null);
      return;
    }
    if (editingPost.has_hero_image) {
      api.fetchBlogImageUrl(editingPost.id, 'hero').then(url => setHeroImageUrl(url));
    } else {
      if (heroImageUrl) URL.revokeObjectURL(heroImageUrl);
      setHeroImageUrl(null);
    }
    if (editingPost.has_mid_image) {
      api.fetchBlogImageUrl(editingPost.id, 'mid').then(url => setMidImageUrl(url));
    } else {
      if (midImageUrl) URL.revokeObjectURL(midImageUrl);
      setMidImageUrl(null);
    }
  }, [editingPost?.id, editingPost?.has_hero_image, editingPost?.has_mid_image, heroImageKey, midImageKey]);

  async function loadPosts() {
    setLoading(true);
    try {
      const res = await api.getAdminBlogPosts({
        limit: 100,
        status_filter: statusFilter || undefined,
      });
      setPosts(res.data?.posts || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      console.error("Failed to load blog posts", e);
    }
    setLoading(false);
  }

  async function handleGenerate() {
    if (!genTopic.trim() || !genKeyword.trim()) return;
    setGenerating(true);
    try {
      const res = await api.generateBlogPost({
        topic: genTopic,
        target_keyword: genKeyword,
        additional_instructions: genInstructions,
        preferred_model: genModel,
      });
      if (res.data?.post) {
        // Open the generated post in editor
        openEditor(res.data.post);
        setShowGenerator(false);
        setGenTopic("");
        setGenKeyword("");
        setGenInstructions("");
        loadPosts();
      } else {
        alert("Generation failed: " + (res.data?.error || res.error || "No post returned. Check backend logs."));
      }
    } catch (e: any) {
      alert("Generation failed: " + (e.response?.data?.detail || e.message || "Unknown error"));
    }
    setGenerating(false);
  }

  function openEditor(post: any) {
    setEditingPost(post);
    setEditTitle(post.title || "");
    setEditSlug(post.slug || "");
    setEditMeta(post.meta_description || "");
    setEditCategory(post.category || "Guide");
    setEditContent(post.content_html || "");
  }

  async function loadPostForEdit(postId: number) {
    try {
      const res = await api.getAdminBlogPost(postId);
      if (res.data?.post) openEditor(res.data.post);
    } catch (e) {
      console.error("Failed to load post", e);
    }
  }

  async function handleSave() {
    if (!editingPost) return;
    setSaving(true);
    try {
      await api.updateBlogPost(editingPost.id, {
        title: editTitle,
        slug: editSlug,
        meta_description: editMeta,
        category: editCategory,
        content_html: editContent,
      });
      setEditingPost(null);
      loadPosts();
    } catch (e: any) {
      alert("Save failed: " + (e.message || "Unknown error"));
    }
    setSaving(false);
  }

  async function handlePublish(postId: number) {
    try {
      await api.publishBlogPost(postId);
      loadPosts();
      if (editingPost?.id === postId) setEditingPost(null);
    } catch (e) {
      console.error("Publish failed", e);
    }
  }

  async function handleUnpublish(postId: number) {
    try {
      await api.unpublishBlogPost(postId);
      loadPosts();
    } catch (e) {
      console.error("Unpublish failed", e);
    }
  }

  async function handleDelete(postId: number) {
    if (!confirm("Delete this blog post permanently?")) return;
    try {
      await api.deleteBlogPost(postId);
      loadPosts();
      if (editingPost?.id === postId) setEditingPost(null);
    } catch (e) {
      console.error("Delete failed", e);
    }
  }

  async function handleGenerateImage(imageType: "hero" | "mid") {
    if (!editingPost) return;
    if (imageType === "hero") setGeneratingHero(true);
    else setGeneratingMid(true);
    try {
      const res = await api.generateBlogImage(editingPost.id, imageType);
      if (res.data?.success) {
        // Force image reload by changing key
        if (imageType === "hero") {
          setHeroImageKey((k) => k + 1);
          setEditingPost({ ...editingPost, has_hero_image: true, hero_image_prompt: res.data.prompt_used });
        } else {
          setMidImageKey((k) => k + 1);
          setEditingPost({ ...editingPost, has_mid_image: true, mid_image_prompt: res.data.prompt_used });
        }
      }
    } catch (e: any) {
      alert(`Image generation failed: ${e.message || "Unknown error"}`);
    }
    if (imageType === "hero") setGeneratingHero(false);
    else setGeneratingMid(false);
  }

  async function handleDeleteImage(imageType: "hero" | "mid") {
    if (!editingPost) return;
    if (!confirm(`Remove the ${imageType} image?`)) return;
    try {
      if (imageType === "hero") {
        await api.deleteBlogHeroImage(editingPost.id);
        setEditingPost({ ...editingPost, has_hero_image: false, hero_image_prompt: null });
      } else {
        await api.deleteBlogMidImage(editingPost.id);
        setEditingPost({ ...editingPost, has_mid_image: false, mid_image_prompt: null });
      }
    } catch (e) {
      console.error("Delete image failed", e);
    }
  }

  // ---- Editor View ----
  if (editingPost) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setEditingPost(null)} className="text-sm text-purple-600 hover:underline">
            ← Back to Posts
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              editingPost.status === "published" ? "bg-green-100 text-green-700" :
              editingPost.status === "archived" ? "bg-slate-100 text-slate-600" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              {editingPost.status}
            </span>
            {editingPost.status !== "published" && (
              <button onClick={() => handlePublish(editingPost.id)} className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                Publish
              </button>
            )}
            {editingPost.status === "published" && (
              <button onClick={() => handleUnpublish(editingPost.id)} className="text-xs bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700">
                Unpublish
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Title</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Slug</label>
              <input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Meta Description</label>
              <input value={editMeta} onChange={(e) => setEditMeta(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" maxLength={500} />
              <span className="text-xs text-slate-400">{editMeta.length}/160 chars</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
                <option value="Guide">Guide</option>
                <option value="Analysis">Analysis</option>
                <option value="Strategy">Strategy</option>
                <option value="Industry">Industry</option>
                <option value="News">News</option>
              </select>
            </div>
          </div>

          {/* Image Generation Section */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">🖼️ Blog Images</h4>
            
            {/* Hero Image */}
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">Hero Image (Featured)</label>
                <div className="flex items-center gap-2">
                  {editingPost.has_hero_image && (
                    <button onClick={() => handleDeleteImage("hero")} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateImage("hero")}
                    disabled={generatingHero}
                    className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generatingHero ? (
                      <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Generating...</>
                    ) : editingPost.has_hero_image ? (
                      "🔄 Regenerate"
                    ) : (
                      "✨ Generate"
                    )}
                  </button>
                </div>
              </div>
              {editingPost.has_hero_image ? (
                <div className="rounded-lg overflow-hidden border">
                  {heroImageUrl ? (
                    <img
                      key={heroImageKey}
                      src={heroImageUrl}
                      alt="Hero"
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center bg-slate-100 text-slate-400 text-sm">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full mr-2" /> Loading image...
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-lg h-32 flex items-center justify-center text-slate-400 text-sm">
                  No hero image — click Generate to create one
                </div>
              )}
              {generatingHero && (
                <p className="text-xs text-purple-600 mt-2 flex items-center gap-1">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full" />
                  AI is generating your hero image... this may take 15-30 seconds.
                </p>
              )}
            </div>

            {/* Mid-Article Image */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">Mid-Article Image</label>
                <div className="flex items-center gap-2">
                  {editingPost.has_mid_image && (
                    <button onClick={() => handleDeleteImage("mid")} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateImage("mid")}
                    disabled={generatingMid}
                    className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {generatingMid ? (
                      <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Generating...</>
                    ) : editingPost.has_mid_image ? (
                      "🔄 Regenerate"
                    ) : (
                      "✨ Generate"
                    )}
                  </button>
                </div>
              </div>
              {editingPost.has_mid_image ? (
                <div className="rounded-lg overflow-hidden border max-w-md">
                  {midImageUrl ? (
                    <img
                      key={midImageKey}
                      src={midImageUrl}
                      alt="Mid-article"
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="w-full h-36 flex items-center justify-center bg-slate-100 text-slate-400 text-sm">
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full mr-2" /> Loading image...
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 rounded-lg h-24 flex items-center justify-center text-slate-400 text-sm max-w-md">
                  No mid-article image — click Generate to create one
                </div>
              )}
              {generatingMid && (
                <p className="text-xs text-indigo-600 mt-2 flex items-center gap-1">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full" />
                  AI is generating your mid-article image... this may take 15-30 seconds.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Content (HTML)</label>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full border rounded px-3 py-2 text-sm font-mono" rows={20} />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Preview</label>
            <div className="border rounded-lg p-6 bg-slate-50 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: editContent }} />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditingPost(null)} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="text-sm bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Main List View ----
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Blog Manager</h2>
          <p className="text-sm text-slate-500">{total} total posts</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <button onClick={() => setShowGenerator(!showGenerator)} className="bg-purple-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-purple-700">
            ✨ AI Generate
          </button>
        </div>
      </div>

      {/* AI Generator Panel */}
      {showGenerator && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-purple-900">AI Blog Generator</h3>
          <p className="text-sm text-purple-700">
            Enter a topic and target keyword. The AI will generate a draft blog post following SkyRate&apos;s content rules
            (informational tone, no DIY advice, drives signups, includes disclaimers).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">Topic *</label>
              <input value={genTopic} onChange={(e) => setGenTopic(e.target.value)} placeholder="e.g., How to Track E-Rate FRN Status Changes" className="w-full border border-purple-300 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">Target SEO Keyword *</label>
              <input value={genKeyword} onChange={(e) => setGenKeyword(e.target.value)} placeholder="e.g., E-Rate FRN status tracking" className="w-full border border-purple-300 rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-purple-800 mb-1">Additional Instructions (optional)</label>
            <textarea value={genInstructions} onChange={(e) => setGenInstructions(e.target.value)} placeholder="Any specific angles, links, or points to cover..." className="w-full border border-purple-300 rounded px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">AI Model</label>
              <select value={genModel} onChange={(e) => setGenModel(e.target.value)} className="border border-purple-300 rounded px-3 py-2 text-sm">
                <option value="gemini">Gemini (Fast)</option>
                <option value="deepseek">DeepSeek (Deep)</option>
              </select>
            </div>
            <div className="flex-1" />
            <button onClick={() => setShowGenerator(false)} className="text-sm text-purple-600 hover:underline">
              Cancel
            </button>
            <button onClick={handleGenerate} disabled={generating || !genTopic.trim() || !genKeyword.trim()} className="bg-purple-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {generating ? "Generating..." : "Generate Draft"}
            </button>
          </div>
          {generating && (
            <div className="flex items-center gap-2 text-sm text-purple-600">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600" />
              AI is writing your blog post... this may take 15-30 seconds.
            </div>
          )}
        </div>
      )}

      {/* Posts Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg mb-2">No blog posts yet</p>
          <p className="text-sm">Use the AI Generator to create your first post.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Created</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => loadPostForEdit(post.id)} className="text-purple-600 hover:underline font-medium text-left">
                      {post.title}
                    </button>
                    <div className="text-xs text-slate-400 mt-0.5">
                      /blog/{post.slug}
                      {(post.has_hero_image || post.has_mid_image) && (
                        <span className="ml-2 text-purple-400" title={`${post.has_hero_image ? "Hero" : ""}${post.has_hero_image && post.has_mid_image ? " + " : ""}${post.has_mid_image ? "Mid" : ""} image`}>
                          🖼️ {post.has_hero_image && post.has_mid_image ? "2" : "1"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{post.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      post.status === "published" ? "bg-green-100 text-green-700" :
                      post.status === "archived" ? "bg-slate-100 text-slate-600" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {post.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {post.created_at ? new Date(post.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => loadPostForEdit(post.id)} className="text-xs text-slate-500 hover:text-purple-600">
                        Edit
                      </button>
                      {post.status === "draft" && (
                        <button onClick={() => handlePublish(post.id)} className="text-xs text-green-600 hover:underline">
                          Publish
                        </button>
                      )}
                      {post.status === "published" && (
                        <button onClick={() => handleUnpublish(post.id)} className="text-xs text-yellow-600 hover:underline">
                          Unpublish
                        </button>
                      )}
                      <button onClick={() => handleDelete(post.id)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ==================== PROMO INVITES TAB ====================

function PromoInvitesTab() {
  const [invites, setInvites] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("vendor");
  const [trialDays, setTrialDays] = useState(30);

  const trialOptions = [
    { value: 21, label: "21 days" },
    { value: 30, label: "1 month" },
    { value: 60, label: "2 months" },
    { value: 90, label: "3 months" },
    { value: 180, label: "6 months" },
  ];

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    try {
      const res = await api.listPromoInvites();
      setInvites(res.data?.invites || []);
      setSummary({
        total: res.data?.total || 0,
        pending: res.data?.pending || 0,
        accepted: res.data?.accepted || 0,
        expired: res.data?.expired || 0,
      });
    } catch (e) {
      setError("Failed to load invites");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.createPromoInvite({ email, role, trial_days: trialDays });
      if (res.data?.id) {
        setSuccess(`Invite sent to ${email}! URL: ${res.data.invite_url}`);
        setEmail("");
        loadInvites();
      } else {
        setError(res.error || "Failed to create invite");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to create invite");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    try {
      await api.revokePromoInvite(id);
      loadInvites();
    } catch (e) {
      alert("Failed to revoke invite");
    }
  }

  async function handleResend(id: number) {
    try {
      await api.resendPromoInvite(id);
      alert("Invite email resent!");
      loadInvites();
    } catch (e) {
      alert("Failed to resend");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setSuccess("URL copied to clipboard!");
    setTimeout(() => setSuccess(""), 3000);
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    accepted: "bg-green-100 text-green-800",
    expired: "bg-slate-100 text-slate-600",
    revoked: "bg-red-100 text-red-800",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-slate-800">{summary.total}</div>
            <div className="text-sm text-slate-500">Total Invites</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.pending}</div>
            <div className="text-sm text-slate-500">Pending</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.accepted}</div>
            <div className="text-sm text-slate-500">Accepted</div>
          </div>
          <div className="bg-white rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{summary.expired}</div>
            <div className="text-sm text-slate-500">Expired</div>
          </div>
        </div>
      )}

      {/* Create Invite Form */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">🎟️ Send Promo Invite</h3>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.com"
                required
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="vendor">Vendor</option>
                <option value="consultant">Consultant</option>
                <option value="applicant">Applicant</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trial Duration</label>
              <select
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {trialOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating || !email}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Sending..." : "Send Invite"}
            </button>
            <span className="text-sm text-slate-400">Invite link expires in 7 days</span>
          </div>
        </form>

        {error && (
          <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
        {success && (
          <div className="mt-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>
        )}
      </div>

      {/* Invites Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-slate-800">All Promo Invites</h3>
        </div>
        {invites.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No promo invites yet. Send your first invite above!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trial</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invites.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">{inv.email}</div>
                      {inv.used_by_name && (
                        <div className="text-xs text-slate-400">→ {inv.used_by_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm capitalize text-slate-600">{inv.role}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {inv.trial_days >= 30 ? `${Math.floor(inv.trial_days / 30)} mo` : `${inv.trial_days}d`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {inv.status === "pending" && (
                          <>
                            <button
                              onClick={() => copyUrl(inv.invite_url)}
                              className="text-xs text-purple-600 hover:underline"
                              title="Copy invite URL"
                            >
                              📋 Copy
                            </button>
                            <button
                              onClick={() => handleResend(inv.id)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              📧 Resend
                            </button>
                            <button
                              onClick={() => handleRevoke(inv.id)}
                              className="text-xs text-red-500 hover:underline"
                            >
                              ✕ Revoke
                            </button>
                          </>
                        )}
                        {inv.status === "accepted" && (
                          <span className="text-xs text-green-600">
                            ✓ Used {inv.used_at ? new Date(inv.used_at).toLocaleDateString() : ""}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
