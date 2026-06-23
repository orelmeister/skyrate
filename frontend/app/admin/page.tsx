"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { requestNotificationPermission, subscribeToPush, isPushSupported, getNotificationPermission } from "@/lib/notifications";
import { useTabParam } from "@/hooks/useTabParam";
import { downloadCsv, csvFilename } from "@/lib/csv-export";
import { TableExportBar } from "@/components/TableExportBar";

const ADMIN_TABS = ["overview", "users", "chat", "tickets", "frn", "promo", "communications", "blog"] as const;
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

// Derive a 1-2 char avatar label from a user's name, falling back to email.
function userInitials(u: any): string {
  const name = (u?.full_name || u?.first_name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const email = (u?.email || "").trim();
  return email ? email.slice(0, 2).toUpperCase() : "?";
}

// Friendly display name for a user, falling back to email.
function userDisplayName(u: any): string {
  return ((u?.full_name || u?.first_name || u?.email || "User").trim()) || "User";
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
  // Funnel-drilldown filters (admin can isolate stranded signups for outreach).
  const [userMissingIdent, setUserMissingIdent] = useState(false);
  const [userNeverLogged, setUserNeverLogged] = useState(false);
  const [userEmailUnverified, setUserEmailUnverified] = useState(false);
  const [userOnbIncomplete, setUserOnbIncomplete] = useState(false);
  // Headline funnel-leak cohort counts powering the Users KPI stat cards.
  const [funnelCounts, setFunnelCounts] = useState<{
    missing_identifier: number;
    email_unverified: number;
    onboarding_incomplete: number;
    never_logged_in: number;
  } | null>(null);

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

  // Manual Billing & Overrides Modal states
  const [planModalUser, setPlanModalUser] = useState<any | null>(null);
  const [modalPlan, setModalPlan] = useState<"monthly" | "yearly">("yearly");
  const [modalDuration, setModalDuration] = useState<number>(365);
  const [modalRef, setModalRef] = useState<string>("");
  const [modalActionType, setModalActionType] = useState<"stripe" | "manual">("stripe");
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  // Team Seats (Phase 7) drawer state
  const [seatData, setSeatData] = useState<any>(null);
  const [seatLimitInput, setSeatLimitInput] = useState<number>(0);
  const [seatEmail, setSeatEmail] = useState("");
  const [seatBusy, setSeatBusy] = useState(false);

  // Retain the last opened user during the drawer's slide-out animation so the
  // panel keeps rendering its contents while it transitions off-screen.
  const lastDrawerUserRef = React.useRef<any>(null);
  if (planModalUser) lastDrawerUserRef.current = planModalUser;
  const drawerUser = planModalUser ?? lastDrawerUserRef.current;

  const loadSeats = async (userId: number) => {
    try {
      const res = await api.getUserSeats(userId);
      if (res.data?.success) {
        setSeatData(res.data);
        setSeatLimitInput(res.data.seat_limit ?? 0);
      }
    } catch (e) { /* non-fatal */ }
  };

  // Load team-seat data whenever the billing/seats drawer opens for a user.
  useEffect(() => {
    if (planModalUser) { loadSeats(planModalUser.id); }
    else { setSeatData(null); setSeatEmail(""); }
  }, [planModalUser]);

  // Auth guard — wait for Zustand hydration before redirecting
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in");
    } else if (user?.role !== "admin" && user?.role !== "super") {
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
    if (user?.role === "admin" || user?.role === "super") {
      loadDashboard();
    }
  }, [user]);

  // Load tab-specific data
  useEffect(() => {
    if (user?.role === "admin" || user?.role === "super") {
      if (activeTab === "users") loadUsers();
      if (activeTab === "tickets") loadTickets();
      if (activeTab === "frn") loadFRNs();
    }
  }, [
    activeTab, userSearch, userRoleFilter, ticketStatusFilter,
    userMissingIdent, userNeverLogged, userEmailUnverified, userOnbIncomplete,
  ]);

  // Headline funnel-leak counts are global (not filter-dependent), so load them
  // once when the Users tab opens rather than on every filter change.
  useEffect(() => {
    if ((user?.role === "admin" || user?.role === "super") && activeTab === "users") {
      loadFunnelCounts();
    }
  }, [user, activeTab]);

  async function loadFunnelCounts() {
    try {
      const res = await api.getAdminUsersFunnelCounts();
      if (res.data?.counts) setFunnelCounts(res.data.counts);
    } catch (e) {
      console.error("Failed to load funnel counts", e);
    }
  }

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
        missing_identifier: userMissingIdent || undefined,
        never_logged_in: userNeverLogged || undefined,
        email_unverified: userEmailUnverified || undefined,
        onboarding_incomplete: userOnbIncomplete || undefined,
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

  if (!user || (user.role !== "admin" && user.role !== "super")) return null;

  // ==================== RENDER ====================

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-950 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <h1 className="font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span> <span className="ml-2 text-xs bg-red-600 px-2 py-0.5 rounded-full font-semibold align-middle">ADMIN</span></h1>
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
        <div className="max-w-7xl mx-auto px-4 flex gap-1 flex-wrap">
          {[
            { key: "overview", label: "Overview", icon: "📊" },
            { key: "users", label: "Users", icon: "👥" },
            { key: "chat", label: "Chat", icon: "💬" },
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
          {/* Super-only quick links to /superadmin/* tools (separate routes) */}
          {user?.role === "super" && (
            <>
              <a
                href="/superadmin/leads"
                className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-700 hover:border-amber-300 transition-colors"
                data-testid="admin-nav-leads"
              >
                📥 Leads
              </a>
              <a
                href="/superadmin/mail-campaigns"
                className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-700 hover:border-amber-300 transition-colors"
              >
                ✉️ Mail Campaigns
              </a>
            </>
          )}
          {/* Denial Hunter — visible to admin and super (require_role("admin","super")) */}
          {(user?.role === "admin" || user?.role === "super") && (
            <a
              href="/admin/denial-hunter"
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-rose-600 hover:text-rose-700 hover:border-rose-300 transition-colors"
              data-testid="admin-nav-denial-hunter"
            >
              🎯 Denial Hunter
            </a>
          )}
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
            {activeTab === "chat" && <ChatTab />}
            {activeTab === "users" && (
              <UsersTab
                users={users}
                total={usersTotal}
                search={userSearch}
                setSearch={setUserSearch}
                roleFilter={userRoleFilter}
                setRoleFilter={setUserRoleFilter}
                missingIdentifier={userMissingIdent}
                setMissingIdentifier={setUserMissingIdent}
                neverLoggedIn={userNeverLogged}
                setNeverLoggedIn={setUserNeverLogged}
                emailUnverified={userEmailUnverified}
                setEmailUnverified={setUserEmailUnverified}
                onboardingIncomplete={userOnbIncomplete}
                setOnboardingIncomplete={setUserOnbIncomplete}
                funnelCounts={funnelCounts}
                onEmailUser={(id) => { setEmailUserId(id); setActiveTab("communications"); }}
                onDeleteUser={async (u) => {
                  if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
                  try {
                    await api.deleteAdminUser(u.id);
                    await loadUsers();
                  } catch (e: any) {
                    alert(`Failed to delete user: ${e?.message || e}`);
                  }
                }}
                onManagePlan={(u) => {
                  setPlanModalUser(u);
                  setModalPlan("yearly");
                  setModalDuration(365);
                  setModalRef("");
                  setModalActionType("stripe");
                  setInvoiceUrl(null);
                }}
                onCreated={async () => {
                  await loadUsers();
                  await loadFunnelCounts();
                }}
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

      {/* Per-user detail slide-over drawer (Billing & future sections) */}
      <SlideOverDrawer
        open={!!planModalUser}
        onClose={() => setPlanModalUser(null)}
        title={drawerUser ? userDisplayName(drawerUser) : ""}
        subtitle={drawerUser?.email}
        avatarLabel={drawerUser ? userInitials(drawerUser) : undefined}
      >
        {drawerUser && (
          <div className="p-6 space-y-8">
            {/* ===================== Billing & Subscription ===================== */}
            <section>
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Billing &amp; Subscription</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Issue a Stripe ACH subscription invoice or apply a manual check/wire plan override.
                </p>
              </div>

              <div className="space-y-4">
                {/* Method Switcher tabs */}
                <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => { setModalActionType("stripe"); setInvoiceUrl(null); }}
                  className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all ${
                    modalActionType === "stripe"
                      ? "bg-white text-purple-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  💳 Stripe ACH Invoice
                </button>
                <button
                  type="button"
                  onClick={() => { setModalActionType("manual"); setInvoiceUrl(null); }}
                  className={`flex-1 text-center py-2 text-xs font-semibold rounded-md transition-all ${
                    modalActionType === "manual"
                      ? "bg-white text-amber-600 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  💰 Direct Check / Wire
                </button>
              </div>

              {/* Shared Plan Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Select Subscription Plan
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "monthly", label: "Monthly Plan" },
                    { key: "yearly", label: "Yearly Plan" },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setModalPlan(p.key as any)}
                      className={`p-3 rounded-lg border text-center text-sm font-semibold transition-all ${
                        modalPlan === p.key
                          ? modalActionType === "stripe"
                            ? "bg-purple-50 border-purple-500 text-purple-700 font-bold"
                            : "bg-amber-50 border-amber-500 text-amber-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Action Fields */}
              {modalActionType === "stripe" ? (
                <div className="space-y-3 bg-purple-50/50 p-4 rounded-lg border border-purple-100">
                  <p className="text-xs text-purple-800 leading-relaxed">
                    This issues an official Stripe Subscription Invoice sent directly to the client's email.
                    The payment is due <strong>immediately on receipt</strong> and accepts secure ACH bank transfer/wire.
                    Once paid, our systems automatically upgrade the user account.
                  </p>
                  {invoiceUrl && (
                    <div className="pt-2 border-t border-purple-200">
                      <span className="block text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">
                        Dispatched Hosted Invoice URL
                      </span>
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline break-all block font-semibold"
                      >
                        {invoiceUrl}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 bg-amber-50/50 p-4 rounded-lg border border-amber-100">
                  <p className="text-xs text-amber-800 leading-relaxed mb-3">
                    Manually activate the user's SaaS plan without using Stripe (e.g. for offline bank wires, cash, or physical paper checks received). Promotes account instantly.
                  </p>
                  
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Payment Reference (Required for audit log)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Check #4023 or Wire Ref #9923"
                      value={modalRef}
                      onChange={(e) => setModalRef(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Duration (days):</label>
                    <select
                      value={modalDuration}
                      onChange={(e) => setModalDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value={30}>30 Days (Monthly Duration)</option>
                      <option value={365}>365 Days (1-Year Duration)</option>
                      <option value={1095}>1095 Days (3-Year Enterprise)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-4 border-t flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPlanModalUser(null)}
                  className="px-4 py-2 border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={modalSubmitting}
                  onClick={async () => {
                    setModalSubmitting(true);
                    try {
                      if (modalActionType === "stripe") {
                        const res = await api.createAdminStripeAchInvoice(drawerUser.id, modalPlan);
                        if (res.data?.success) {
                          setInvoiceUrl(res.data.hosted_invoice_url || null);
                          alert(res.data.message || "Stripe invoice created!");
                          loadUsers();
                        } else {
                          alert(res.data?.error || "Failed to create invoice");
                        }
                      } else {
                        if (!modalRef.trim()) {
                          alert("Please enter a check # or Wire ID");
                          setModalSubmitting(false);
                          return;
                        }
                        const res = await api.assignAdminManualPlan(drawerUser.id, {
                          plan: modalPlan,
                          duration_days: modalDuration,
                          payment_reference: modalRef,
                        });
                        if (res.data?.success) {
                          alert(res.data.message || "Manual plan assigned!");
                          setPlanModalUser(null);
                          setModalRef("");
                          loadUsers();
                        } else {
                          alert(res.data?.error || "Failed to assign manual plan");
                        }
                      }
                    } catch (e: any) {
                      alert(`Error processing plan request: ${e?.message || e}`);
                    }
                    setModalSubmitting(false);
                  }}
                  className={`px-4 py-2 text-white font-bold rounded-lg text-sm shadow-md transition-all ${
                    modalActionType === "stripe"
                      ? "bg-purple-600 hover:bg-purple-700 shadow-purple-600/10"
                      : "bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/10"
                  }`}
                >
                  {modalSubmitting ? "Processing..." : modalActionType === "stripe" ? "📧 Dispatch Invoice" : "🚀 Activate Instantly"}
                </button>
              </div>
              </div>
            </section>
            {/* Future per-user sections (e.g. Team Seats) can be appended below. */}
            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Team Seats</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add team members who share this account&apos;s access but cannot manage billing.
                </p>
              </div>

              {seatData && !seatData.is_consultant ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Seats are only available for consultant accounts.
                </div>
              ) : seatData && !seatData.has_subscription ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Assign a subscription plan above before configuring seats.
                </div>
              ) : seatData ? (
                <div className="space-y-5">
                  {/* Seat limit row */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Seat Limit</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={seatLimitInput}
                        onChange={(e) => setSeatLimitInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={seatBusy}
                        onClick={async () => {
                          setSeatBusy(true);
                          try {
                            const res = await api.setUserSeatLimit(drawerUser.id, seatLimitInput);
                            if (res.data?.success) {
                              alert("Seat limit updated.");
                              await loadSeats(drawerUser.id);
                            } else {
                              alert(res.data?.detail || res.data?.error || "Request failed");
                            }
                          } catch (e: any) {
                            alert(e?.message || "Request failed");
                          }
                          setSeatBusy(false);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                      >
                        Update Limit
                      </button>
                      <span className="text-xs text-slate-500">
                        Used {seatData.used} / {seatData.seat_limit}
                      </span>
                    </div>
                  </div>

                  {/* Seat list */}
                  {seatData.seats && seatData.seats.length > 0 && (
                    <div className="space-y-2">
                      {seatData.seats.map((seat: any) => (
                        <div
                          key={seat.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-slate-800 truncate">{seat.invited_email}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                seat.status === "invited"
                                  ? "bg-amber-100 text-amber-700"
                                  : seat.status === "active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {seat.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {seat.status === "invited" && (
                              <button
                                type="button"
                                disabled={seatBusy}
                                onClick={async () => {
                                  setSeatBusy(true);
                                  try {
                                    const res = await api.resendSeatInvite(seat.id);
                                    if (res.data?.success) {
                                      await loadSeats(drawerUser.id);
                                    } else {
                                      alert(res.data?.detail || res.data?.error || "Request failed");
                                    }
                                  } catch (e: any) {
                                    alert(e?.message || "Request failed");
                                  }
                                  setSeatBusy(false);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                              >
                                Resend
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={seatBusy}
                              onClick={async () => {
                                if (!confirm(`Revoke seat for ${seat.invited_email}?`)) return;
                                setSeatBusy(true);
                                try {
                                  const res = await api.revokeSeat(seat.id);
                                  if (res.data?.success) {
                                    await loadSeats(drawerUser.id);
                                  } else {
                                    alert(res.data?.detail || res.data?.error || "Request failed");
                                  }
                                } catch (e: any) {
                                  alert(e?.message || "Request failed");
                                }
                                setSeatBusy(false);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Invite row */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Invite Team Member</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={seatEmail}
                        onChange={(e) => setSeatEmail(e.target.value)}
                        placeholder="teammate@example.com"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={seatBusy || seatData.used >= seatData.seat_limit}
                        onClick={async () => {
                          setSeatBusy(true);
                          try {
                            const res = await api.inviteUserSeat(drawerUser.id, seatEmail);
                            if (res.data?.success) {
                              setSeatEmail("");
                              await loadSeats(drawerUser.id);
                              alert("Seat invite created.");
                            } else {
                              alert(res.data?.detail || res.data?.error || "Request failed");
                            }
                          } catch (e: any) {
                            alert(e?.message || "Request failed");
                          }
                          setSeatBusy(false);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                      >
                        Invite Seat
                      </button>
                    </div>
                    {seatData.used >= seatData.seat_limit && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Increase the seat limit to invite more team members.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">Loading seats…</div>
              )}
            </section>
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}

// ==================== SLIDE-OVER DRAWER ====================

// Reusable right-anchored slide-over panel used as the per-user detail surface.
// Self-manages mount/visibility so it can animate in AND out via Tailwind
// transitions. Closes on Escape and backdrop click; focuses the close button
// when opened.
function SlideOverDrawer({
  open,
  onClose,
  title,
  subtitle,
  avatarLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  avatarLabel?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Mount, then flip to visible on the next frame so the slide-in transition
  // runs from off-screen. On close, hide first, then unmount after the
  // transition completes.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(t);
  }, [open]);

  // Focus the close button once the panel is fully open.
  useEffect(() => {
    if (visible) closeBtnRef.current?.focus();
  }, [visible]);

  // Escape-to-close while mounted.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title || "Details"}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      />
      {/* Panel */}
      <div
        className={`absolute top-0 right-0 h-full w-full max-w-[520px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {avatarLabel && (
              <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
                {avatarLabel}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-lg truncate">{title}</h2>
              {subtitle && <p className="text-xs text-slate-300 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close panel"
            className="text-slate-400 hover:text-white transition-colors text-2xl font-bold leading-none shrink-0"
          >
            &times;
          </button>
        </div>
        {/* Scrollable body — additional sections can be appended by callers. */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
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
  users, total, search, setSearch, roleFilter, setRoleFilter,
  missingIdentifier, setMissingIdentifier,
  neverLoggedIn, setNeverLoggedIn,
  emailUnverified, setEmailUnverified,
  onboardingIncomplete, setOnboardingIncomplete,
  funnelCounts,
  onEmailUser,
  onDeleteUser,
  onManagePlan,
  onCreated,
}: {
  users: any[]; total: number; search: string; setSearch: (s: string) => void;
  roleFilter: string; setRoleFilter: (r: string) => void;
  missingIdentifier: boolean; setMissingIdentifier: (v: boolean) => void;
  neverLoggedIn: boolean; setNeverLoggedIn: (v: boolean) => void;
  emailUnverified: boolean; setEmailUnverified: (v: boolean) => void;
  onboardingIncomplete: boolean; setOnboardingIncomplete: (v: boolean) => void;
  funnelCounts: {
    missing_identifier: number;
    email_unverified: number;
    onboarding_incomplete: number;
    never_logged_in: number;
  } | null;
  onEmailUser: (id: number) => void;
  onDeleteUser: (user: any) => void;
  onManagePlan: (user: any) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());

  // "Add New User" modal — local state, mirrors the createAdminUser payload.
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    email: string; role: string; full_name: string;
    company_name: string; phone: string; password: string;
  }>({ email: "", role: "applicant", full_name: "", company_name: "", phone: "", password: "" });

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.email.trim()) {
      alert("Email is required.");
      return;
    }
    setCreating(true);
    try {
      const res = await api.createAdminUser({
        email: createForm.email.trim(),
        role: createForm.role,
        full_name: createForm.full_name.trim() || undefined,
        company_name: createForm.company_name.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        password: createForm.password.trim() || undefined,
      });
      if (res.error || res.success === false) {
        alert(`Failed to create user: ${res.error || "Unknown error"}`);
      } else {
        alert(`User ${createForm.email.trim()} created.`);
        setShowCreate(false);
        setCreateForm({ email: "", role: "applicant", full_name: "", company_name: "", phone: "", password: "" });
        await onCreated();
      }
    } catch (err: any) {
      alert(`Failed to create user: ${err?.message || err}`);
    } finally {
      setCreating(false);
    }
  }

  // Client-side sorting. sortKey points to a field on the user object;
  // for nested/computed fields we map it in the comparator below.
  type SortKey =
    | "email" | "name" | "role" | "identifier"
    | "email_verified" | "onboarding_completed"
    | "last_login" | "days_since_signup" | "is_active"
    | "company_name" | "phone";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedUsers = useMemo(() => {
    if (!sortKey) return users;
    const getVal = (u: any): any => {
      switch (sortKey) {
        case "email": return (u.email || "").toLowerCase();
        case "name": return (u.full_name || u.first_name || "").toLowerCase();
        case "role": return u.role || "";
        case "identifier": {
          const v = u.role === "consultant" ? u.portfolio?.crn
            : u.role === "vendor" ? u.portfolio?.spin
            : u.role === "applicant" ? u.portfolio?.ben : null;
          return v ? String(v) : "";
        }
        case "email_verified": return u.email_verified ? 1 : 0;
        case "onboarding_completed": return u.onboarding_completed ? 1 : 0;
        case "last_login": return u.last_login ? new Date(u.last_login).getTime() : 0;
        case "days_since_signup": return u.days_since_signup ?? -1;
        case "is_active": return u.is_active ? 1 : 0;
        case "company_name": return (u.company_name || "").toLowerCase();
        case "phone": return u.phone || "";
      }
    };
    const copy = [...users];
    copy.sort((a, b) => {
      const av = getVal(a); const bv = getVal(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [users, sortKey, sortDir]);

  // Sortable header cell that shows an arrow when active.
  function SortTh({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <th className={`text-left px-3 py-3 font-medium text-slate-600 ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 hover:text-slate-900"
        >
          {children}
          <span className={`text-[10px] ${active ? "text-purple-600" : "text-slate-300"}`}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  function handleExportUsers() {
    const cols = [
      "Email", "Name", "Role", "Company", "Identifier", "Email Verified",
      "Onboarding", "Status", "Last Login", "Joined", "Days Since Signup",
    ];
    const source = selectedUsers.size > 0 ? users.filter(u => selectedUsers.has(u.id)) : users;
    const rows = source.map(u => ({
      Email: u.email || "",
      Name: u.full_name || u.first_name || "",
      Role: u.role || "",
      Company: u.company_name || "",
      Identifier: u.has_identifier ? "Yes" : "No",
      "Email Verified": u.email_verified ? "Yes" : "No",
      Onboarding: u.onboarding_completed ? "Complete" : "Incomplete",
      Status: u.is_active ? "Active" : "Inactive",
      "Last Login": u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never",
      Joined: u.created_at ? new Date(u.created_at).toLocaleDateString() : "",
      "Days Since Signup": u.days_since_signup ?? "",
    }));
    downloadCsv(csvFilename("admin-users"), cols, rows);
  }

  const activeFilterCount =
    (missingIdentifier ? 1 : 0) +
    (neverLoggedIn ? 1 : 0) +
    (emailUnverified ? 1 : 0) +
    (onboardingIncomplete ? 1 : 0);

  // Derive a 1-2 char avatar label from the user's name, falling back to email.
  function initialsFor(u: any): string {
    const name = (u.full_name || u.first_name || "").trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    const email = (u.email || "").trim();
    return email ? email.slice(0, 2).toUpperCase() : "?";
  }

  return (
    <div className="space-y-4">
      {/* Funnel-leak KPI stat cards — headline drill-down layer. Each card is a
          big clickable toggle that mirrors a funnel filter and shows real counts
          from GET /admin/users/funnel-counts. The compact chips below still work. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Funnel Leak A",
            sub: "Missing CRN/SPIN/BEN",
            count: funnelCounts?.missing_identifier,
            active: missingIdentifier,
            toggle: () => setMissingIdentifier(!missingIdentifier),
            icon: "\u{1F3DB}\uFE0F", // classical building
            iconClass: "bg-red-50 text-red-500",
          },
          {
            label: "Funnel Leak B",
            sub: "Email unverified",
            count: funnelCounts?.email_unverified,
            active: emailUnverified,
            toggle: () => setEmailUnverified(!emailUnverified),
            icon: "\u{1F4E7}", // envelope
            iconClass: "bg-orange-50 text-orange-500",
          },
          {
            label: "Funnel Leak C",
            sub: "Onboarding incomplete",
            count: funnelCounts?.onboarding_incomplete,
            active: onboardingIncomplete,
            toggle: () => setOnboardingIncomplete(!onboardingIncomplete),
            icon: "\u{1F3C1}", // chequered flag
            iconClass: "bg-amber-50 text-amber-500",
          },
          {
            label: "Funnel Leak D",
            sub: "Never logged in",
            count: funnelCounts?.never_logged_in,
            active: neverLoggedIn,
            toggle: () => setNeverLoggedIn(!neverLoggedIn),
            icon: "\u{1F510}", // closed lock with key
            iconClass: "bg-blue-50 text-blue-500",
          },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.toggle}
            aria-pressed={card.active}
            className={`text-left bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-purple-500 ${
              card.active
                ? "border-purple-400 ring-2 ring-purple-200"
                : "border-slate-200 hover:border-purple-300"
            }`}
          >
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</span>
              <h4 className={`text-lg font-black transition-colors ${card.active ? "text-purple-600" : "text-slate-800 group-hover:text-purple-600"}`}>
                {card.count == null ? "—" : `${card.count} Users`}
              </h4>
              <p className="text-xs text-slate-500">{card.sub}</p>
            </div>
            <span className={`text-xl p-2 rounded-lg ${card.iconClass}`}>{card.icon}</span>
          </button>
        ))}
      </div>

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
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          + Add New User
        </button>
      </div>

      {/* Funnel-drilldown filter chips. Each is a toggle that maps 1:1 to a
          backend query param and is mutually composable with the others. */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-500">Funnel filters:</span>
        {[
          { key: "missing_identifier", label: "Missing CRN/SPIN/BEN", active: missingIdentifier, set: setMissingIdentifier },
          { key: "never_logged_in", label: "Never logged in", active: neverLoggedIn, set: setNeverLoggedIn },
          { key: "email_unverified", label: "Email unverified", active: emailUnverified, set: setEmailUnverified },
          { key: "onboarding_incomplete", label: "Onboarding incomplete", active: onboardingIncomplete, set: setOnboardingIncomplete },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => chip.set(!chip.active)}
            className={`px-2.5 py-1 rounded-full border transition-colors ${
              chip.active
                ? "bg-purple-100 border-purple-300 text-purple-800 font-medium"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {chip.label}
          </button>
        ))}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setMissingIdentifier(false);
              setNeverLoggedIn(false);
              setEmailUnverified(false);
              setOnboardingIncomplete(false);
            }}
            className="ml-1 text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <TableExportBar
        selectedCount={selectedUsers.size}
        totalCount={users.length}
        onExportCsv={handleExportUsers}
        onClearSelection={() => setSelectedUsers(new Set())}
      />

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto relative">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="w-10 px-3 py-3 sticky left-0 bg-slate-50 z-10">
                <input
                  type="checkbox"
                  checked={users.length > 0 && selectedUsers.size === users.length}
                  onChange={(e) => { if (e.target.checked) setSelectedUsers(new Set(users.map(u => u.id))); else setSelectedUsers(new Set()); }}
                  className="rounded border-slate-300"
                />
              </th>
              <SortTh k="name">User Identity</SortTh>
              <SortTh k="company_name">Company</SortTh>
              <SortTh k="phone">Phone</SortTh>
              <SortTh k="role">Role</SortTh>
              <SortTh k="identifier">Identifier</SortTh>
              <SortTh k="email_verified" className="whitespace-nowrap">Verified</SortTh>
              <SortTh k="onboarding_completed">Onboarding</SortTh>
              <SortTh k="last_login" className="whitespace-nowrap">Last Login</SortTh>
              <SortTh k="days_since_signup" className="whitespace-nowrap">Days</SortTh>
              <SortTh k="is_active">Status</SortTh>
              <th
                className="text-right px-3 py-3 font-medium text-slate-600 whitespace-nowrap sticky right-0 bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50 group">
                <td className="px-3 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => { const s = new Set(selectedUsers); if (s.has(u.id)) s.delete(u.id); else s.add(u.id); setSelectedUsers(s); }}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-purple-50 text-purple-600 font-bold flex items-center justify-center text-xs">
                      {initialsFor(u)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 flex items-center gap-1 max-w-[200px] truncate" title={u.full_name || u.first_name || u.email || ""}>
                        <span className="truncate">{u.full_name || u.first_name || "—"}</span>
                        {u.email_verified && (
                          <span className="text-green-500 text-[11px] shrink-0" title="Email verified">{"\u2714"}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 max-w-[200px] truncate" title={u.email || ""}>{u.email || "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 max-w-[150px] truncate text-slate-600 text-xs" title={u.company_name || ""}>{u.company_name || "—"}</td>
                <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap" title={u.phone || ""}>{u.phone || "—"}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.role === "admin" ? "bg-red-100 text-red-700" :
                    u.role === "consultant" ? "bg-purple-100 text-purple-700" :
                    u.role === "vendor" ? "bg-blue-100 text-blue-700" :
                    "bg-green-100 text-green-700"
                  }`}>{u.role}</span>
                </td>
                <td className="px-3 py-3 text-xs">
                  {(() => {
                    // Identifier presence: backend pre-computes has_identifier
                    // and exposes the raw value via portfolio.crn/spin/ben.
                    const identValue =
                      u.role === "consultant" ? u.portfolio?.crn :
                      u.role === "vendor" ? u.portfolio?.spin :
                      u.role === "applicant" ? u.portfolio?.ben : null;
                    if (u.has_identifier && identValue) {
                      return <span className="font-mono text-slate-700">{identValue}</span>;
                    }
                    return (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        Missing
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-3 text-xs">
                  {u.email_verified ? (
                    <span className="text-green-600">Yes</span>
                  ) : (
                    <span className="text-red-500">No</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  {u.onboarding_completed ? (
                    <span className="text-green-600">Complete</span>
                  ) : (
                    <span className="text-amber-600">Incomplete</span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : (
                    <span className="text-red-500">Never</span>
                  )}
                </td>
                <td className="px-3 py-3 text-slate-500 text-xs text-right tabular-nums">{u.days_since_signup ?? "—"}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs ${u.is_active ? "text-green-600" : "text-red-500"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td
                  className="px-3 py-3 whitespace-nowrap text-right sticky right-0 bg-white group-hover:bg-slate-50 z-10 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-center justify-end gap-3">
                    {/* Environment-gated plan override modal trigger */}
                    {(process.env.NEXT_PUBLIC_ENABLE_ENTERPRISE_BILLING !== "false") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent row actions collisions
                          onManagePlan(u);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-800 hover:underline font-medium"
                        title="Manage Billing Invoices & Subscription overrides"
                      >
                        Plan
                      </button>
                    )}
                    <button
                      onClick={() => onEmailUser(u.id)}
                      className="text-xs text-purple-600 hover:underline"
                    >
                      Email
                    </button>
                    <button
                      onClick={() => onDeleteUser(u)}
                      className="text-xs text-red-600 hover:underline"
                      title="Delete this user permanently"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add New User modal — admin can create applicant/consultant/vendor
          accounts directly. Server blocks admin/super self-escalation. */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!creating) setShowCreate(false); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold text-slate-900">Add New User</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Create a SkyRate account directly. Admin and super roles cannot be assigned here.
              </p>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="applicant">Applicant</option>
                  <option value="consultant">Consultant</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
                <input
                  type="text"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
                <input
                  type="text"
                  value={createForm.company_name}
                  onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Leave blank to auto-generate"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">Leave blank to auto-generate a strong temporary password.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const EMAIL_TEMPLATES = [
  {
    label: "Milan Eaton Onboarding Fix",
    text: `<p>Hi Milan,</p>\n\n<p>First and foremost, I want to sincerely apologize for the delay and frustration you experienced after signing up for your trial today.</p>\n\n<p><strong>What happened:</strong><br>\nImmediately after you verified your registration, our system kicked off an automated process to sync your organization's entire historical portfolio directly from the USAC database. Because your company (Erate Pro, LLC) has an extensive list of associated institutions and funding request details, the initial import took about six minutes to download and index in the background.</p>\n\n<p>While that synchronization was running, our website's redirect guard temporarily kept showing the onboarding page to protect you from accessing an empty dashboard. Once the data import finished, your account became 100% active.</p>\n\n<p><strong>Your account is now fully ready:</strong><br>\nYou can log in right now at <a href="https://skyrate.ai/sign-in" target="_blank" style="color: #7c3aed; font-weight: 600;">skyrate.ai/sign-in</a>. All of your school records, funding records, and real-time status alerts have been fully populated and are waiting for you.</p>\n\n<p>Since your trial is underway, I would love to hop on a quick 10-to-15 minute screen-share to walk you through the platform, show you how to maximize your alerts, and answer any questions you have.</p>\n\n<p>Please let me know if there is a day or time that works best for you this week, or simply reply to schedule a quick slot.</p>\n\n<p>Thank you so much for your patience, and welcome to erateapp!</p>\n\n<p>Best regards,<br>\n<strong>Ari Bernstein</strong><br>\nE-Rate Specialist & Partner<br>\n<a href="https://erateapp.com" style="color: #7c3aed;">erateapp.com</a></p>`
  },
  {
    label: "General Onboarding Sync Delay",
    text: `<p>Hi {{user_name}},</p>\n\n<p>I wanted to follow up on your signup and apologize if you noticed any temporary delay or onboarding redirect loops during your initial registration.</p>\n\n<p>Our system synchronizes your organization's entire historical portfolio directly from the USAC database upon first registration. If your profile manages many school districts, this initial sync can take a few minutes to fully index. To protect you from accessing an empty dashboard during this process, our system holds the onboarding state until completed.</p>\n\n<p><strong>Your account is now fully ready and populated!</strong><br>\nYou can sign in right now and see all your school records, funding requests, and real-time alerts. Let me know if you would like to schedule a 10-minute walkthrough so I can show you how to get the most out of our alerts!</p>\n\n<p>Best regards,<br>\nAri Bernstein<br>\nE-Rate Specialist & Partner</p>`
  },
  {
    label: "Demo / Walkthrough Offer",
    text: `<p>Hi {{user_name}},</p>\n\n<p>Thanks for registering for erateapp! I see your organization's portfolio is fully set up and ready to monitor.</p>\n\n<p>I would love to invite you to a short, 10-to-15 minute screen-share walkthrough where we can cover:<br>\n1. Setting up custom real-time alerts for your FRNs.<br>\n2. Tracking USAC funding commitments and appeal windows.<br>\n3. Customizing reports for your school districts.</p>\n\n<p>Please let me know if there's a day or time that works best for you this week to connect.</p>\n\n<p>Best regards,<br>\nAri Bernstein</p>`
  }
];

function TicketAttachment({ ticketId, m }: { ticketId: number; m: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    api.getTicketAttachmentUrl(ticketId, m.id).then((u) => {
      if (u && !revoked) setUrl(u);
    });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, m.id]);

  const isAudio = m.mime_type?.startsWith("audio/");
  if (isAudio) {
    return url ? (
      <audio controls src={url} className="mt-2 w-full h-9" />
    ) : (
      <p className="text-xs text-slate-400 mt-1 italic">Loading voice note…</p>
    );
  }
  return (
    <a
      href={url || "#"}
      download={m.file_name}
      className="mt-2 inline-flex items-center gap-1 text-sm text-purple-600 hover:underline"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
      {m.file_name || "attachment"}
    </a>
  );
}

// ==================== CHAT TAB (admin live conversations) ====================
// Two-pane conversation view (sidebar list + live thread) built on top of the
// existing support-ticket system. Admins can also start a new conversation with
// any user. Lightweight polling keeps the open thread and list fresh.

function ChatTab() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [thread, setThread] = useState<any | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  // New-chat modal
  const [showNewChat, setShowNewChat] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [pickedUser, setPickedUser] = useState<any | null>(null);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  async function loadList(silent = false) {
    if (!silent) setLoadingList(true);
    try {
      const res = await api.getAdminTickets({ limit: 100 });
      const list = (res as any)?.data?.tickets || [];
      list.sort((a: any, b: any) =>
        new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      );
      setConversations(list);
    } catch {
      /* keep stale list on transient errors */
    } finally {
      if (!silent) setLoadingList(false);
    }
  }

  async function loadThread(id: number, silent = false) {
    if (!silent) setLoadingThread(true);
    try {
      const res = await api.getAdminTicket(id);
      const t = (res as any)?.data?.ticket || null;
      setThread(t);
      api.markTicketRead(id).catch(() => {});
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }

  function openConversation(id: number) {
    setSelectedId(id);
    setReplyText("");
    loadThread(id);
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lightweight polling: refresh list + open thread every 12s.
  useEffect(() => {
    const iv = setInterval(() => {
      loadList(true);
      if (selectedId) loadThread(selectedId, true);
    }, 12000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-scroll thread to bottom when it changes.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  async function handleSendText() {
    const text = replyText.trim();
    if (!text || !selectedId) return;
    setSending(true);
    try {
      await api.replyToTicket(selectedId, text);
      setReplyText("");
      await loadThread(selectedId, true);
      await loadList(true);
    } catch (e: any) {
      alert(`Failed to send: ${e?.message || e}`);
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (!selectedId || blob.size === 0) return;
        setUploading(true);
        try {
          const ext = (mr.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm";
          await api.addTicketAttachment(selectedId, blob, "", `voice-note.${ext}`);
          await loadThread(selectedId, true);
          await loadList(true);
        } catch (e: any) {
          alert(`Failed to send voice note: ${e?.message || e}`);
        } finally {
          setUploading(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      await api.addTicketAttachment(selectedId, file, "", file.name);
      await loadThread(selectedId, true);
      await loadList(true);
    } catch (err: any) {
      alert(`Failed to upload: ${err?.message || err}`);
    } finally {
      setUploading(false);
    }
  }

  async function searchUsers(q: string) {
    setUserQuery(q);
    if (q.trim().length < 2) { setUserResults([]); return; }
    setSearchingUsers(true);
    try {
      const res = await api.getAdminUsers({ search: q.trim(), limit: 10 });
      setUserResults((res as any)?.data?.users || []);
    } catch {
      setUserResults([]);
    } finally {
      setSearchingUsers(false);
    }
  }

  async function handleCreateChat() {
    if (!pickedUser || !newChatMessage.trim()) return;
    setCreating(true);
    try {
      const res = await api.startAdminChat({ user_id: pickedUser.id, message: newChatMessage.trim() });
      const newTicket = (res as any)?.data?.ticket;
      setShowNewChat(false);
      setPickedUser(null);
      setUserQuery("");
      setUserResults([]);
      setNewChatMessage("");
      await loadList(true);
      if (newTicket?.id) openConversation(newTicket.id);
    } catch (e: any) {
      alert(`Failed to start chat: ${e?.message || e}`);
    } finally {
      setCreating(false);
    }
  }

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.user_name || "").toLowerCase().includes(q) ||
      (c.user_email || "").toLowerCase().includes(q) ||
      (c.subject || "").toLowerCase().includes(q)
    );
  });

  function relativeTime(iso?: string) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="flex h-[calc(100vh-220px)] min-h-[480px]">
        {/* Sidebar: conversation list */}
        <div className="w-full sm:w-80 border-r flex flex-col bg-slate-50">
          <div className="p-3 border-b bg-white flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={() => setShowNewChat(true)}
              title="New chat"
              className="shrink-0 w-9 h-9 flex items-center justify-center bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="p-6 text-center text-slate-400 text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No conversations</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-3 border-b hover:bg-white transition-colors ${
                    selectedId === c.id ? "bg-white border-l-4 border-l-purple-600" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-slate-800 truncate">{c.user_name || c.user_email || "Unknown"}</span>
                    <span className="text-[11px] text-slate-400 shrink-0">{relativeTime(c.updated_at || c.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.subject}</p>
                  <div className="mt-1"><StatusBadge status={c.status} /></div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main: message thread */}
        <div className="hidden sm:flex flex-1 flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Select a conversation or start a new chat
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{thread?.user_name || thread?.user_email || "Conversation"}</p>
                  <p className="text-xs text-slate-500">{thread?.subject}</p>
                </div>
                {thread && <StatusBadge status={thread.status} />}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {loadingThread && !thread ? (
                  <div className="text-center text-slate-400 text-sm py-8">Loading…</div>
                ) : (
                  (thread?.messages || []).map((m: any) => {
                    const isAdmin = m.sender_type === "admin";
                    const isHtml = typeof m.message === "string" && /<[a-z][\s\S]*>/i.test(m.message);
                    return (
                      <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isAdmin ? "bg-purple-600 text-white" : "bg-white border text-slate-800"}`}>
                          <p className={`text-[11px] mb-0.5 ${isAdmin ? "text-purple-200" : "text-slate-400"}`}>
                            {m.sender_name || (isAdmin ? "Admin" : "User")} · {relativeTime(m.created_at)}
                          </p>
                          {m.message && (
                            isHtml ? (
                              <div className="text-sm prose-sm" dangerouslySetInnerHTML={{ __html: m.message }} />
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                            )
                          )}
                          {m.has_attachment && <TicketAttachment ticketId={selectedId} m={m} />}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="p-3 border-t bg-white flex items-end gap-2">
                <label className="shrink-0 w-9 h-9 flex items-center justify-center text-slate-500 hover:text-purple-600 cursor-pointer" title="Attach file">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  <input type="file" className="hidden" onChange={handleFilePick} disabled={uploading} />
                </label>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={uploading}
                  title={isRecording ? "Stop recording" : "Record voice note"}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg ${isRecording ? "bg-red-600 text-white animate-pulse" : "text-slate-500 hover:text-purple-600"}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" /></svg>
                </button>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                  placeholder={uploading ? "Uploading…" : "Type a message…"}
                  rows={1}
                  className="flex-1 px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32"
                />
                <button
                  onClick={handleSendText}
                  disabled={sending || !replyText.trim()}
                  className="shrink-0 px-4 h-9 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New chat modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewChat(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-slate-800">New conversation</h3>
              <button onClick={() => setShowNewChat(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {!pickedUser ? (
              <>
                <input
                  value={userQuery}
                  onChange={(e) => searchUsers(e.target.value)}
                  placeholder="Search user by name or email…"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="mt-2 max-h-60 overflow-y-auto divide-y border rounded-lg">
                  {searchingUsers ? (
                    <div className="p-4 text-center text-slate-400 text-sm">Searching…</div>
                  ) : userResults.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-sm">{userQuery.trim().length < 2 ? "Type at least 2 characters" : "No users found"}</div>
                  ) : (
                    userResults.map((u) => (
                      <button key={u.id} onClick={() => setPickedUser(u)} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-800">{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email}</p>
                        <p className="text-xs text-slate-500">{u.email} · {u.role}</p>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mb-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{`${pickedUser.first_name || ""} ${pickedUser.last_name || ""}`.trim() || pickedUser.email}</p>
                    <p className="text-xs text-slate-500">{pickedUser.email}</p>
                  </div>
                  <button onClick={() => setPickedUser(null)} className="text-xs text-purple-600 hover:underline">Change</button>
                </div>
                <textarea
                  value={newChatMessage}
                  onChange={(e) => setNewChatMessage(e.target.value)}
                  placeholder="Type your message…"
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleCreateChat}
                  disabled={creating || !newChatMessage.trim()}
                  className="mt-3 w-full px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {creating ? "Sending…" : "Send message"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
                {/<[a-z][\s\S]*>/i.test(m.message) ? (
                  <div className="text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: m.message }} />
                ) : m.message ? (
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{m.message}</p>
                ) : null}
                {m.has_attachment && <TicketAttachment ticketId={selectedTicket.id} m={m} />}
              </div>
            ))}
          </div>

          {/* Quick Templates select */}
          <div className="mt-4 flex items-center gap-2 border-t pt-4">
            <span className="text-xs font-semibold text-slate-500">Quick Templates:</span>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const name = selectedTicket?.user_name || "there";
                setReplyText(val.replace(/\{\{user_name\}\}/g, name));
              }}
              className="text-xs border rounded-lg px-2 py-1.5 focus:ring-purple-500 focus:outline-none"
              defaultValue=""
            >
              <option value="">-- Choose a Template --</option>
              {EMAIL_TEMPLATES.map((t, idx) => (
                <option key={idx} value={t.text}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Reply */}
          <div className="mt-2 flex gap-2">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply (HTML or plain text)..."
              className="flex-1 px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={4}
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
  const [selectedFrns, setSelectedFrns] = useState<Set<number>>(new Set());

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
      <TableExportBar
        selectedCount={selectedFrns.size}
        totalCount={filteredFRNs.length}
        onExportCsv={() => {
          const cols = ["Organization", "BEN", "FRN", "Status", "Funding Year", "Amount", "User Email", "Source"];
          const source = selectedFrns.size > 0 ? filteredFRNs.filter(f => selectedFrns.has(f.id ?? f.frn)) : filteredFRNs;
          const rows = source.map((f: any) => ({
            Organization: f.organization_name || "",
            BEN: f.ben || "",
            FRN: f.frn || "",
            Status: f.status || "",
            "Funding Year": f.funding_year || "",
            Amount: f.amount_requested || "",
            "User Email": f.user_email || "",
            Source: f.source || "",
          }));
          downloadCsv(csvFilename("admin-frn-monitor"), cols, rows);
        }}
        onClearSelection={() => setSelectedFrns(new Set())}
      />

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
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={filteredFRNs.length > 0 && selectedFrns.size === filteredFRNs.length}
                  onChange={(e) => { if (e.target.checked) setSelectedFrns(new Set(filteredFRNs.map((f: any) => f.id ?? f.frn))); else setSelectedFrns(new Set()); }}
                  className="rounded border-slate-300"
                />
              </th>
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
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
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
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={org.frns.every((f: any) => selectedFrns.has(f.id ?? f.frn))}
                        onChange={(e) => {
                          const s = new Set(selectedFrns);
                          org.frns.forEach((f: any) => { const k = f.id ?? f.frn; if (e.target.checked) s.add(k); else s.delete(k); });
                          setSelectedFrns(s);
                        }}
                        className="rounded border-slate-300"
                      />
                    </td>
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
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedFrns.has(f.id ?? f.frn)}
                            onChange={() => { const s = new Set(selectedFrns); const k = f.id ?? f.frn; if (s.has(k)) s.delete(k); else s.add(k); setSelectedFrns(s); }}
                            className="rounded border-slate-300"
                          />
                        </td>
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

  function handleEnablePush() {
    setPushSubscribing(true);
    requestNotificationPermission((permission) => {
      if (permission === 'granted') {
        const token = useAuthStore.getState().token;
        if (token) {
          subscribeToPush(token)
            .then((success) => setPushStatus(success ? 'enabled' : 'error'))
            .catch(() => setPushStatus('error'))
            .finally(() => setPushSubscribing(false));
        } else {
          setPushStatus('error');
          setPushSubscribing(false);
        }
      } else if (permission === 'denied') {
        setPushStatus('blocked');
        alert('Notifications are blocked. Please enable them in your browser settings.');
        setPushSubscribing(false);
      } else {
        setPushStatus('dismissed');
        setPushSubscribing(false);
      }
    });
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
  const [selectedPosts, setSelectedPosts] = useState<Set<number>>(new Set());

  // Generator state
  const [showGenerator, setShowGenerator] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genKeyword, setGenKeyword] = useState("");
  const [genInstructions, setGenInstructions] = useState("");
  const [genModel, setGenModel] = useState("gemini");
  const [genAutoPublish, setGenAutoPublish] = useState(true);
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
        auto_publish: genAutoPublish,
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
            <div className="flex items-center gap-2 self-end pb-1">
              <input
                type="checkbox"
                id="autoPublish"
                checked={genAutoPublish}
                onChange={(e) => setGenAutoPublish(e.target.checked)}
                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="autoPublish" className="text-xs font-medium text-purple-800 cursor-pointer">
                Auto-publish
              </label>
            </div>
            <div className="flex-1" />
            <button onClick={() => setShowGenerator(false)} className="text-sm text-purple-600 hover:underline">
              Cancel
            </button>
            <button onClick={handleGenerate} disabled={generating || !genTopic.trim() || !genKeyword.trim()} className="bg-purple-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50">
              {generating ? "Generating..." : genAutoPublish ? "Generate & Publish" : "Generate Draft"}
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
        <div className="space-y-2">
        <TableExportBar
          selectedCount={selectedPosts.size}
          totalCount={posts.length}
          onExportCsv={() => {
            const cols = ["Title", "Slug", "Category", "Status", "Created"];
            const source = selectedPosts.size > 0 ? posts.filter(p => selectedPosts.has(p.id)) : posts;
            const rows = source.map(p => ({
              Title: p.title || "",
              Slug: p.slug || "",
              Category: p.category || "",
              Status: p.status || "",
              Created: p.created_at ? new Date(p.created_at).toLocaleDateString() : "",
            }));
            downloadCsv(csvFilename("admin-blog-posts"), cols, rows);
          }}
          onClearSelection={() => setSelectedPosts(new Set())}
        />
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={posts.length > 0 && selectedPosts.size === posts.length}
                    onChange={(e) => { if (e.target.checked) setSelectedPosts(new Set(posts.map(p => p.id))); else setSelectedPosts(new Set()); }}
                    className="rounded border-slate-300"
                  />
                </th>
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
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPosts.has(post.id)}
                      onChange={() => { const s = new Set(selectedPosts); if (s.has(post.id)) s.delete(post.id); else s.add(post.id); setSelectedPosts(s); }}
                      className="rounded border-slate-300"
                    />
                  </td>
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
  const [selectedInvites, setSelectedInvites] = useState<Set<number>>(new Set());

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
      <TableExportBar
        selectedCount={selectedInvites.size}
        totalCount={invites.length}
        onExportCsv={() => {
          const cols = ["Email", "Role", "Trial Days", "Status", "Created"];
          const source = selectedInvites.size > 0 ? invites.filter(inv => selectedInvites.has(inv.id)) : invites;
          const rows = source.map((inv: any) => ({
            Email: inv.email || "",
            Role: inv.role || "",
            "Trial Days": inv.trial_days || "",
            Status: inv.status || "",
            Created: inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "",
          }));
          downloadCsv(csvFilename("admin-promo-invites"), cols, rows);
        }}
        onClearSelection={() => setSelectedInvites(new Set())}
      />
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
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={invites.length > 0 && selectedInvites.size === invites.length}
                      onChange={(e) => { if (e.target.checked) setSelectedInvites(new Set(invites.map((inv: any) => inv.id))); else setSelectedInvites(new Set()); }}
                      className="rounded border-slate-300"
                    />
                  </th>
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
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedInvites.has(inv.id)}
                        onChange={() => { const s = new Set(selectedInvites); if (s.has(inv.id)) s.delete(inv.id); else s.add(inv.id); setSelectedInvites(s); }}
                        className="rounded border-slate-300"
                      />
                    </td>
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
