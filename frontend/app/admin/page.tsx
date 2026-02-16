"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

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
    recent_denials_7d: number;
  };
  recent_alerts: any[];
  generated_at: string;
}

// ==================== MAIN COMPONENT ====================

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"overview" | "users" | "tickets" | "frn" | "communications">("overview");
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

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/sign-in");
    } else if (user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [isAuthenticated, user, router]);

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
      const res = await api.getAdminFRNMonitor({ limit: 100 });
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
            { key: "communications", label: "Communications", icon: "📧" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
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
              <FRNMonitorTab frns={frns} summary={frnSummary} />
            )}
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
          </>
        )}
      </main>
    </div>
  );
}

// ==================== OVERVIEW TAB ====================

function OverviewTab({ dashboard, setActiveTab }: { dashboard: DashboardData; setActiveTab: (t: any) => void }) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={dashboard.users.total} sub={`+${dashboard.users.new_7d} this week`} color="purple" />
        <StatCard label="Active Subscriptions" value={dashboard.subscriptions.active} color="green" />
        <StatCard label="Open Tickets" value={dashboard.tickets.open} sub={`${dashboard.tickets.total} total`} color="amber" onClick={() => setActiveTab("tickets")} />
        <StatCard label="FRN Denials (7d)" value={dashboard.frn_monitoring.recent_denials_7d} sub={`${dashboard.frn_monitoring.denied} total denied`} color="red" onClick={() => setActiveTab("frn")} />
      </div>

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
              <span className="text-sm text-slate-600">Denied</span>
              <span className="font-semibold text-red-600">{dashboard.frn_monitoring.denied}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-600">Recent Denials (7 days)</span>
              <span className="font-semibold text-red-600">{dashboard.frn_monitoring.recent_denials_7d}</span>
            </div>
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

function FRNMonitorTab({ frns, summary }: { frns: any[]; summary: any }) {
  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Tracked" value={summary.total_tracked} color="purple" />
          <StatCard label="Funded" value={summary.funded} color="green" />
          <StatCard label="Pending" value={summary.pending} color="amber" />
          <StatCard label="Denied" value={summary.denied} color="red" />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">FRN</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Organization</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Year</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {frns.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No FRNs being tracked</td></tr>
            ) : frns.map((f, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-900">{f.frn}</td>
                <td className="px-4 py-3">{f.organization_name || f.ben || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    f.status?.toLowerCase().includes("denied") ? "bg-red-100 text-red-700" :
                    f.status?.toLowerCase().includes("funded") || f.status?.toLowerCase().includes("committed") ? "bg-green-100 text-green-700" :
                    f.status?.toLowerCase().includes("pending") ? "bg-yellow-100 text-yellow-700" :
                    "bg-slate-100 text-slate-700"
                  }`}>{f.status || "Unknown"}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{f.funding_year || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{f.amount_requested ? `$${Number(f.amount_requested).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{f.user_email || "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{f.last_checked ? new Date(f.last_checked).toLocaleDateString() : "Never"}</td>
              </tr>
            ))}
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

  useEffect(() => {
    if (users.length === 0) loadUsers();
  }, []);

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
