"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineInterval = "one_time" | "month" | "year";
type GrantsRole = "consultant" | "vendor" | "applicant";
type GrantsPlan = "monthly" | "yearly" | "none";

type LineForm = {
  description: string;
  unit_amount: string; // dollars, as typed
  quantity: string;
  interval: LineInterval;
};

type InvoiceListItem = {
  id: number;
  invoice_number: string;
  customer_email: string;
  customer_name: string;
  company_name: string | null;
  grants_role: string;
  grants_plan: string;
  status: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  pay_token: string;
  user_id: number | null;
  created_at: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCents(dollars: string): number {
  const n = parseFloat((dollars || "").toString().replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n) || isNaN(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function fmtMoney(cents: number): string {
  const sign = (cents || 0) < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function intervalLabel(i: LineInterval): string {
  return i === "month" ? "Per month" : i === "year" ? "Per year" : "One-time";
}

function statusBadge(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "draft":
      return "bg-slate-100 text-slate-600";
    case "void":
      return "bg-red-100 text-red-700";
    case "expired":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function emptyLine(): LineForm {
  return { description: "", unit_amount: "", quantity: "1", interval: "year" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminInvoicesPage() {
  const router = useRouter();
  const { user, isAuthenticated, _hasHydrated } = useAuthStore();

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string>("");

  // Builder form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [grantsRole, setGrantsRole] = useState<GrantsRole>("consultant");
  const [grantsPlan, setGrantsPlan] = useState<GrantsPlan>("yearly");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [primaryInterval, setPrimaryInterval] = useState<"" | "month" | "year">("");

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      router.push("/sign-in?next=/admin/invoices");
      return;
    }
    if (user?.role !== "admin" && user?.role !== "super") {
      router.push("/");
    }
  }, [_hasHydrated, isAuthenticated, user, router]);

  const canView = _hasHydrated && isAuthenticated && (user?.role === "admin" || user?.role === "super");

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await api.listInvoices({ status: statusFilter || undefined, per_page: 100 });
    if (res.success && res.data) {
      setInvoices(res.data.invoices || []);
    } else {
      setError(res.error || "Failed to load invoices");
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (!canView) return;
    loadInvoices();
  }, [canView, loadInvoices]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const resetBuilder = () => {
    setEditingId(null);
    setCustomerName("");
    setCustomerEmail("");
    setCompanyName("");
    setGrantsRole("consultant");
    setGrantsPlan("yearly");
    setLines([emptyLine()]);
    setDiscount("0");
    setNotes("");
    setExpiresAt("");
    setPrimaryInterval("");
  };

  const openNew = () => {
    resetBuilder();
    setShowBuilder(true);
  };

  const openEdit = async (id: number) => {
    setBusy(true);
    const res = await api.getInvoice(id);
    setBusy(false);
    if (!res.success || !res.data?.invoice) {
      showToast(res.error || "Could not open invoice");
      return;
    }
    const inv = res.data.invoice;
    setEditingId(inv.id);
    setCustomerName(inv.customer_name || "");
    setCustomerEmail(inv.customer_email || "");
    setCompanyName(inv.company_name || "");
    setGrantsRole((inv.grants_role || "consultant") as GrantsRole);
    setGrantsPlan((inv.grants_plan || "none") as GrantsPlan);
    setLines(
      (inv.lines || []).map((l: any) => ({
        description: l.description || "",
        unit_amount: (l.unit_amount_cents / 100).toString(),
        quantity: String(l.quantity || 1),
        interval: (l.interval || "one_time") as LineInterval,
      })) || [emptyLine()],
    );
    setDiscount((inv.discount_cents / 100).toString());
    setNotes(inv.notes || "");
    setExpiresAt(inv.expires_at ? inv.expires_at.slice(0, 10) : "");
    setPrimaryInterval((inv.primary_interval as "month" | "year") || "");
    setShowBuilder(true);
  };

  // Live computed totals (display only — server recomputes authoritatively)
  const subtotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + toCents(l.unit_amount) * (parseInt(l.quantity) || 1), 0),
    [lines],
  );
  const discountCents = useMemo(() => Math.min(toCents(discount), subtotalCents), [discount, subtotalCents]);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  const buildPayload = () => ({
    customer_email: customerEmail.trim().toLowerCase(),
    customer_name: customerName.trim(),
    company_name: companyName.trim() || null,
    grants_role: grantsRole,
    grants_plan: grantsPlan,
    lines: lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        unit_amount_cents: toCents(l.unit_amount),
        quantity: parseInt(l.quantity) || 1,
        interval: l.interval,
      })),
    discount_cents: toCents(discount),
    notes: notes.trim() || null,
    expires_at: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
    primary_interval: primaryInterval || null,
  });

  const validateForm = (): string | null => {
    if (!customerName.trim()) return "Customer name is required";
    if (!customerEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim()))
      return "A valid customer email is required";
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) return "Add at least one line item with a description";
    for (const l of validLines) {
      if (toCents(l.unit_amount) < 0) return "Line amounts must be zero or positive";
    }
    return null;
  };

  const saveDraft = async (): Promise<number | null> => {
    const problem = validateForm();
    if (problem) {
      showToast(problem);
      return null;
    }
    setBusy(true);
    const payload = buildPayload();
    const res = editingId ? await api.updateInvoice(editingId, payload) : await api.createInvoice(payload);
    setBusy(false);
    if (!res.success || !res.data?.invoice) {
      showToast(res.error || "Save failed");
      return null;
    }
    const savedId = res.data.invoice.id as number;
    setEditingId(savedId);
    showToast(`Saved draft ${res.data.invoice.invoice_number}`);
    await loadInvoices();
    return savedId;
  };

  const saveAndSend = async () => {
    const id = await saveDraft();
    if (!id) return;
    setBusy(true);
    const res = await api.sendInvoice(id);
    setBusy(false);
    if (!res.success) {
      showToast(res.error || "Send failed");
      return;
    }
    showToast("Invoice sent — PDF + pay link emailed to the customer");
    setShowBuilder(false);
    resetBuilder();
    await loadInvoices();
  };

  const doVoid = async (id: number) => {
    if (!confirm("Void this invoice? The pay link will stop working.")) return;
    setBusy(true);
    const res = await api.voidInvoice(id);
    setBusy(false);
    if (!res.success) {
      showToast(res.error || "Void failed");
      return;
    }
    showToast("Invoice voided");
    await loadInvoices();
  };

  const copyPayLink = async (inv: InvoiceListItem) => {
    const url = `${window.location.origin}/pay/${inv.pay_token}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Pay link copied to clipboard");
    } catch {
      showToast(url);
    }
  };

  const downloadPdf = async (id: number) => {
    setBusy(true);
    const url = await api.getInvoicePdfUrl(id);
    setBusy(false);
    if (!url) {
      showToast("PDF download failed");
      return;
    }
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const updateLine = (idx: number, patch: Partial<LineForm>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  if (!canView) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Verifying access…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
            <h1 className="font-bold text-xl">
              SkyRate<span className="text-purple-400">.AI</span>
              <span className="ml-2 text-xs bg-emerald-600 px-2 py-0.5 rounded-full font-semibold align-middle">
                INVOICES
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <a href="/admin" className="text-sm text-slate-400 hover:text-white transition-colors">
              ← Back to Admin
            </a>
            <span className="text-sm text-slate-400">{user?.email}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Custom Invoices &amp; Quotes</h2>
            <p className="text-sm text-slate-500">
              Hand-build a priced quote, email it as a PDF + pay link. Card or ACH; provisions on payment.
            </p>
          </div>
          <button
            onClick={openNew}
            data-testid="new-invoice-btn"
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm transition-colors"
          >
            + New Invoice
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4">
          {["", "draft", "sent", "paid", "void", "expired"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading invoices…</div>
          ) : error ? (
            <div className="p-10 text-center text-red-500">{error}</div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center text-slate-400">No invoices yet. Click “New Invoice” to build one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Invoice</th>
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Grants</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50" data-testid={`invoice-row-${inv.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{inv.invoice_number}</div>
                      <div className="text-xs text-slate-400">
                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                        {inv.user_id ? " · existing acct" : " · prospect"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{inv.customer_name}</div>
                      <div className="text-xs text-slate-400">{inv.company_name || inv.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {inv.grants_role}
                      <span className="text-slate-400"> / {inv.grants_plan}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtMoney(inv.total_cents)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusBadge(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {inv.status === "draft" && (
                          <button
                            onClick={() => openEdit(inv.id)}
                            className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => copyPayLink(inv)}
                          className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                        >
                          Copy Pay Link
                        </button>
                        <button
                          onClick={() => downloadPdf(inv.id)}
                          className="px-2 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                        >
                          PDF
                        </button>
                        {inv.status !== "paid" && inv.status !== "void" && (
                          <button
                            onClick={() => doVoid(inv.id)}
                            className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Builder slide-over */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBuilder(false)} />
          <div className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit Invoice" : "New Invoice"}
              </h3>
              <button onClick={() => setShowBuilder(false)} className="text-slate-400 hover:text-slate-600 text-xl">
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Recipient */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Customer Name *</label>
                  <input
                    data-testid="inv-customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Customer Email *</label>
                  <input
                    data-testid="inv-customer-email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Company (optional)</label>
                  <input
                    data-testid="inv-company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Acme School District"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Expires (optional)</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              {/* Grants */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Grants Role</label>
                  <select
                    data-testid="inv-grants-role"
                    value={grantsRole}
                    onChange={(e) => setGrantsRole(e.target.value as GrantsRole)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="consultant">Consultant</option>
                    <option value="vendor">Vendor</option>
                    <option value="applicant">Applicant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Grants Plan</label>
                  <select
                    data-testid="inv-grants-plan"
                    value={grantsPlan}
                    onChange={(e) => setGrantsPlan(e.target.value as GrantsPlan)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="yearly">Yearly</option>
                    <option value="monthly">Monthly</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Primary Interval</label>
                  <select
                    value={primaryInterval}
                    onChange={(e) => setPrimaryInterval(e.target.value as "" | "month" | "year")}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">Auto (highest recurring)</option>
                    <option value="year">Per year</option>
                    <option value="month">Per month</option>
                  </select>
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-slate-500">Line Items</label>
                  <button onClick={addLine} data-testid="inv-add-line" className="text-xs text-emerald-600 font-medium hover:underline">
                    + Add line
                  </button>
                </div>
                <div className="space-y-2">
                  {lines.map((l, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center" data-testid={`inv-line-${idx}`}>
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        placeholder="Description"
                        data-testid={`inv-line-desc-${idx}`}
                        className="col-span-5 px-2 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <input
                        value={l.unit_amount}
                        onChange={(e) => updateLine(idx, { unit_amount: e.target.value })}
                        placeholder="Amount"
                        inputMode="decimal"
                        data-testid={`inv-line-amount-${idx}`}
                        className="col-span-2 px-2 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <input
                        value={l.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        placeholder="Qty"
                        inputMode="numeric"
                        className="col-span-1 px-2 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <select
                        value={l.interval}
                        onChange={(e) => updateLine(idx, { interval: e.target.value as LineInterval })}
                        data-testid={`inv-line-interval-${idx}`}
                        className="col-span-3 px-2 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                      >
                        <option value="one_time">One-time</option>
                        <option value="month">Per month</option>
                        <option value="year">Per year</option>
                      </select>
                      <button
                        onClick={() => removeLine(idx)}
                        className="col-span-1 text-slate-400 hover:text-red-500 text-lg"
                        title="Remove line"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount + notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Discount ($, one-time)</label>
                  <input
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    inputMode="decimal"
                    data-testid="inv-discount"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  placeholder="Shown on the invoice PDF"
                />
              </div>

              {/* Totals */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span data-testid="inv-subtotal">{fmtMoney(subtotalCents)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>{fmtMoney(-discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-800 pt-1.5 border-t border-slate-200">
                  <span>Total Due</span>
                  <span data-testid="inv-total">{fmtMoney(totalCents)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center gap-2">
              <button
                onClick={saveDraft}
                disabled={busy}
                data-testid="inv-save-draft"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-sm disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                onClick={saveAndSend}
                disabled={busy}
                data-testid="inv-save-send"
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
              >
                Save &amp; Send
              </button>
              {editingId && (
                <button
                  onClick={() => downloadPdf(editingId)}
                  disabled={busy}
                  className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium text-sm disabled:opacity-50"
                >
                  Download PDF
                </button>
              )}
              <div className="ml-auto text-xs text-slate-400">Card &amp; ACH accepted at checkout</div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm shadow-lg z-[60]">
          {toast}
        </div>
      )}
    </div>
  );
}
