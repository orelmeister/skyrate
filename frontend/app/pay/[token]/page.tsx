"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types (public safe subset only)
// ---------------------------------------------------------------------------

type PublicLine = {
  description: string;
  unit_amount_cents: number;
  quantity: number;
  interval: "one_time" | "month" | "year";
  amount_cents: number;
};

type DeferredLine = {
  description: string;
  unit_amount_cents: number;
  quantity: number;
  amount_cents: number;
  interval: "month" | "year";
};

type PublicInvoice = {
  invoice_number: string;
  customer_name: string;
  company_name: string | null;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  due_today_cents: number;
  primary_interval: "month" | "year" | null;
  deferred: DeferredLine[];
  notes: string | null;
  expires_at: string | null;
  is_expired: boolean;
  lines: PublicLine[];
};

function fmtMoney(cents: number): string {
  const sign = (cents || 0) < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function intervalLabel(i: string): string {
  return i === "month" ? "per month" : i === "year" ? "per year" : "one-time";
}

// Human phrase for the recurring-after-today lines, e.g. "$650.00/month" or
// "$650.00/month + $1,200.00/year". Groups deferred lines by billing interval.
function recurringPhrase(deferred: DeferredLine[]): string {
  if (!deferred || deferred.length === 0) return "";
  const byInterval: Record<string, number> = {};
  deferred.forEach((d) => {
    byInterval[d.interval] = (byInterval[d.interval] || 0) + d.amount_cents;
  });
  return Object.entries(byInterval)
    .map(([intv, cents]) => `${fmtMoney(cents)}/${intv === "year" ? "year" : "month"}`)
    .join(" + ");
}

function PayInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = (Array.isArray(params?.token) ? params.token[0] : (params?.token as string)) || "";
  const paid = searchParams.get("paid") === "1";

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await api.getPublicInvoice(token);
    if (res.success && res.data?.invoice) {
      setInvoice(res.data.invoice);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const startCheckout = async () => {
    setPayBusy(true);
    setError("");
    const res = await api.createInvoiceCheckout(token);
    if (res.success && res.data?.checkout_url) {
      window.location.href = res.data.checkout_url;
      return;
    }
    setError(res.error || "Could not start checkout. Please try again.");
    setPayBusy(false);
  };

  const downloadPdf = async () => {
    const url = await api.getPublicInvoicePdfUrl(token);
    if (!url) {
      setError("PDF download failed");
      return;
    }
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // ---- Shell -------------------------------------------------------------
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex flex-col">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2">
          <img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
          <span className="font-bold text-xl text-slate-900">
            SkyRate<span className="text-purple-600">.AI</span>
          </span>
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
      <footer className="text-center text-xs text-slate-400 py-6">
        SkyRate LLC · 30 N Gould St Ste N, Sheridan, WY 82801 · (855) 765-7291
      </footer>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
          Loading invoice…
        </div>
      </Shell>
    );
  }

  if (notFound || !invoice) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-xl font-bold text-slate-800 mb-1">Invoice not found</h1>
          <p className="text-slate-500 text-sm">
            This payment link is invalid. Please check the link or contact{" "}
            <a href="mailto:billing@skyrate.ai" className="text-purple-600">
              billing@skyrate.ai
            </a>
            .
          </p>
        </div>
      </Shell>
    );
  }

  const isPayable = invoice.status === "sent" || invoice.status === "draft";
  const dueToday = invoice.due_today_cents ?? invoice.total_cents;
  const recurring = recurringPhrase(invoice.deferred || []);

  // Success state after returning from Stripe
  if (paid || invoice.status === "paid") {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center" data-testid="pay-success">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Payment received</h1>
          <p className="text-slate-500 mb-1">
            Thank you! Invoice <strong>{invoice.invoice_number}</strong> is paid.
          </p>
          <p className="text-slate-500 text-sm">
            Check your email to finish setting up your account. If you already have a SkyRate account,
            your subscription is now active.
          </p>
          <button
            onClick={downloadPdf}
            className="mt-6 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            Download Receipt PDF
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm" data-testid="pay-invoice">
        {/* Header band */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-purple-100">Invoice</div>
              <div className="text-2xl font-bold">{invoice.invoice_number}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-100">Due today</div>
              <div className="text-2xl font-bold" data-testid="pay-due-today">
                {fmtMoney(dueToday)}
              </div>
              {recurring && (
                <div className="text-xs text-purple-100 mt-0.5" data-testid="pay-recurring">
                  then {recurring}, starting today
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          {/* Status banners */}
          {invoice.status === "void" && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              This invoice has been voided and can no longer be paid.
            </div>
          )}
          {(invoice.status === "expired" || invoice.is_expired) && invoice.status !== "void" && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              This invoice has expired. Please contact us for an updated quote.
            </div>
          )}

          {/* Bill to */}
          <div className="mb-6">
            <div className="text-xs uppercase text-slate-400 font-medium mb-1">Bill To</div>
            <div className="text-slate-800 font-medium">{invoice.customer_name}</div>
            {invoice.company_name && <div className="text-slate-500 text-sm">{invoice.company_name}</div>}
          </div>

          {/* Line items */}
          <div className="border border-slate-100 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium">Billing</th>
                  <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{l.description}</div>
                      <div className="text-xs text-slate-400">
                        {l.quantity} × {fmtMoney(l.unit_amount_cents)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 capitalize">{intervalLabel(l.interval)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtMoney(l.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1.5 text-sm mb-6">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{fmtMoney(invoice.subtotal_cents)}</span>
            </div>
            {invoice.discount_cents > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>{fmtMoney(-invoice.discount_cents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-800 text-base pt-2 border-t border-slate-200">
              <span>Due today</span>
              <span data-testid="pay-due-today-row">{fmtMoney(dueToday)}</span>
            </div>
            {recurring && (
              <div className="flex justify-between text-slate-500">
                <span>Then (recurring)</span>
                <span>{recurring}, starting today</span>
              </div>
            )}
            {(recurring || invoice.total_cents !== dueToday) && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>First-period value</span>
                <span>{fmtMoney(invoice.total_cents)}</span>
              </div>
            )}
          </div>

          {invoice.notes && (
            <div className="mb-6 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">{invoice.notes}</div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Actions */}
          {isPayable && !invoice.is_expired ? (
            <button
              onClick={startCheckout}
              disabled={payBusy}
              data-testid="pay-now-btn"
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-base disabled:opacity-60 transition-all"
            >
              {payBusy ? "Redirecting to secure checkout…" : `Pay ${fmtMoney(dueToday)} by Card or Bank Transfer (ACH)`}
            </button>
          ) : null}

          <button
            onClick={downloadPdf}
            className="w-full mt-3 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50"
          >
            Download PDF
          </button>

          <p className="text-center text-xs text-slate-400 mt-4">
            Secure payment powered by Stripe. We accept Credit Card and ACH bank transfer.
          </p>
        </div>
      </div>
    </Shell>
  );
}

export default function PublicInvoicePayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 flex items-center justify-center text-slate-400">
          Loading invoice…
        </div>
      }
    >
      <PayInner />
    </Suspense>
  );
}
