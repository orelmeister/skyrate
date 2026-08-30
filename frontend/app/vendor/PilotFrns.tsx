"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type PilotFrnRecord, type PilotFrnResponse, type PilotProgramTotalsResponse } from "@/lib/api";
import { downloadCsv, csvFilename } from "@/lib/csv-export";

/**
 * Cybersecurity Pilot Program FRN tracking for vendors (feature #cyber-pilot).
 * Lists the vendor's Pilot FCC Form 471 FRNs (dataset qr48-4kx4) with status,
 * deadlines and amounts. Status changes are tracked server-side and surface
 * through the same alert/digest system as E-Rate FRNs.
 */

function money(n: number | undefined): string {
  const v = Number(n || 0);
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function statusColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("fund") || s.includes("commit")) return "bg-green-100 text-green-700";
  if (s.includes("deni") || s.includes("cancel")) return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

export default function PilotFrns() {
  const [data, setData] = useState<PilotFrnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [programTotals, setProgramTotals] = useState<PilotProgramTotalsResponse["program"] | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const resp = await api.getPilotFrns(undefined, refresh, 2000);
      if (resp.success && resp.data) {
        setData(resp.data);
      } else {
        setError(resp.error || "Failed to load Cybersecurity Pilot FRNs");
      }
    } catch {
      setError("Failed to load Cybersecurity Pilot FRNs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Program-level totals (national committed pool) load once on mount.
  useEffect(() => {
    let cancelled = false;
    api.getPilotProgramTotals()
      .then((resp) => {
        if (!cancelled && resp.success && resp.data?.program) setProgramTotals(resp.data.program);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const frns = useMemo(() => {
    const list = data?.frns || [];
    if (!statusFilter) return list;
    return list.filter((f) => (f.status || "").toLowerCase().includes(statusFilter.toLowerCase()));
  }, [data, statusFilter]);

  // Vendor's own committed share across all their pilot FRNs.
  const myCommitted = useMemo(
    () => (data?.frns || []).reduce((s, f) => s + Number(f.committed_amount || 0), 0),
    [data],
  );

  // Per-entity payouts: group the vendor's pilot FRNs by participant (BEN),
  // summing committed + requested. Committed = USAC Form 471 commitment (there
  // is no published pilot disbursement figure).
  const perEntity = useMemo(() => {
    const map = new Map<string, { ben: string; name: string; state: string; committed: number; requested: number; frn_count: number }>();
    for (const f of data?.frns || []) {
      const key = f.ben || f.entity_name || f.frn;
      const cur = map.get(key) || { ben: f.ben || "", name: f.entity_name || "", state: f.state || "", committed: 0, requested: 0, frn_count: 0 };
      cur.committed += Number(f.committed_amount || 0);
      cur.requested += Number(f.requested_amount || 0);
      cur.frn_count += 1;
      if (!cur.name && f.entity_name) cur.name = f.entity_name;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.committed - a.committed);
  }, [data]);

  const exportCsv = () => {
    const columns = [
      "FRN", "Pilot 471", "Nickname", "Applicant", "BEN", "State", "Status",
      "Application Status", "Requested", "Committed", "Discount %",
      "Service Delivery Deadline", "Invoice Deadline", "Contract Expiration", "FCDL Date",
    ];
    const rows = frns.map((f) => ({
      FRN: f.frn,
      "Pilot 471": f.pilot_471_number || "",
      Nickname: f.pilot_471_nickname || "",
      Applicant: f.entity_name || "",
      BEN: f.ben || "",
      State: f.state || "",
      Status: f.status || "",
      "Application Status": f.application_status || "",
      "Requested": f.requested_amount || 0,
      "Committed": f.committed_amount || 0,
      "Discount %": f.discount_rate || 0,
      "Service Delivery Deadline": f.service_delivery_deadline || "",
      "Invoice Deadline": f.invoice_deadline || "",
      "Contract Expiration": f.contract_expiration_date || "",
      "FCDL Date": f.fcdl_date || "",
    }));
    downloadCsv(csvFilename("cybersecurity-pilot-frns"), columns, rows);
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">🛡️ Cybersecurity Pilot Program</h2>
          <p className="text-sm text-slate-500">
            Your Pilot FCC Form 471 FRNs and their live status. Status changes are included in your
            FRN alerts &amp; digest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh from USAC"}
          </button>
          {frns.length > 0 && (
            <button
              onClick={exportCsv}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <div className="text-sm font-medium text-green-700">Funded</div>
            <div className="text-2xl font-bold text-green-800">{summary.funded.count}</div>
            <div className="text-xs text-green-600">{money(summary.funded.amount)}</div>
          </div>
          <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
            <div className="text-sm font-medium text-yellow-700">Pending</div>
            <div className="text-2xl font-bold text-yellow-800">{summary.pending.count}</div>
            <div className="text-xs text-yellow-600">{money(summary.pending.amount)}</div>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-sm font-medium text-red-700">Denied / Cancelled</div>
            <div className="text-2xl font-bold text-red-800">{summary.denied.count}</div>
            <div className="text-xs text-red-600">{money(summary.denied.amount)}</div>
          </div>
        </div>
      )}

      {/* Payouts & Disbursements — program-level pool + this vendor's per-entity
          commitments. Source: USAC Open Data qr48-4kx4 (Cybersecurity Pilot FCC
          Form 471). Amounts are Form 471 COMMITMENTS; USAC has not published a
          pilot disbursement dataset, so paid/disbursed figures are unavailable. */}
      {(programTotals || (data && data.frns.length > 0)) && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Payouts &amp; Disbursements</h3>
            <span className="text-xs text-slate-400">
              Source: USAC Open Data (qr48-4kx4) · commitments, not disbursements
            </span>
          </div>

          {programTotals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                <div className="text-xs font-medium text-indigo-700">National pool committed</div>
                <div className="text-xl font-bold text-indigo-900">{money(programTotals.committed)}</div>
                <div className="text-[11px] text-indigo-500">{programTotals.frn_count.toLocaleString()} FRNs</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-medium text-slate-600">National requested</div>
                <div className="text-xl font-bold text-slate-900">{money(programTotals.requested)}</div>
                <div className="text-[11px] text-slate-400">{programTotals.participants.toLocaleString()} participants</div>
              </div>
              <div className="rounded-xl border border-green-100 bg-green-50 p-3">
                <div className="text-xs font-medium text-green-700">Your customers&apos; committed</div>
                <div className="text-xl font-bold text-green-900">{money(myCommitted)}</div>
                <div className="text-[11px] text-green-500">
                  {programTotals.committed > 0 ? `${((myCommitted / programTotals.committed) * 100).toFixed(2)}% of pool` : "share of pool"}
                </div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <div className="text-xs font-medium text-amber-700">Disbursed / paid</div>
                <div className="text-lg font-bold text-amber-900">Not yet published</div>
                <div className="text-[11px] text-amber-500">USAC has no pilot payout dataset</div>
              </div>
            </div>
          )}

          {programTotals && (
            <p className="text-xs text-slate-400">
              FCC Cybersecurity Pilot appropriation: {money(programTotals.appropriation_usd)} over 3 years. {programTotals.note}
            </p>
          )}

          {perEntity.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Participant</th>
                    <th className="px-4 py-2.5">State</th>
                    <th className="px-4 py-2.5 text-right">FRNs</th>
                    <th className="px-4 py-2.5 text-right">Requested</th>
                    <th className="px-4 py-2.5 text-right">Committed</th>
                    <th className="px-4 py-2.5 text-right">Disbursed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perEntity.map((e) => (
                    <tr key={e.ben || e.name} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="text-slate-900">{e.name || "—"}</div>
                        {e.ben && <div className="text-xs text-slate-400">BEN {e.ben}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{e.state || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{e.frn_count}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{money(e.requested)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900">{money(e.committed)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400">n/a</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600">Filter status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        >
          <option value="">All</option>
          <option value="funded">Funded</option>
          <option value="pending">Pending</option>
          <option value="denied">Denied</option>
          <option value="committed">Committed</option>
        </select>
        {data?.last_refreshed && (
          <span className="ml-auto text-xs text-slate-400">
            Cached {String(data.last_refreshed).slice(0, 10)}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading Cybersecurity Pilot FRNs…</p>
      ) : frns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">No Cybersecurity Pilot FRNs found for your SPIN.</p>
          <p className="mt-1 text-sm text-slate-400">
            If you participate in the pilot, click &quot;Refresh from USAC&quot; to pull the latest data.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">FRN</th>
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Committed</th>
                <th className="px-4 py-3">Service Deadline</th>
                <th className="px-4 py-3">Invoice Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {frns.map((f) => (
                <tr key={f.frn} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-900">{f.frn}</div>
                    {f.pilot_471_nickname && (
                      <div className="text-xs text-slate-400">{f.pilot_471_nickname}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{f.entity_name || "—"}</div>
                    <div className="text-xs text-slate-400">
                      {f.ben ? `BEN ${f.ben}` : ""} {f.state ? `• ${f.state}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor(f.status)}`}>
                      {f.status || "Unknown"}
                    </span>
                    {f.application_status && (
                      <div className="mt-1 text-xs text-slate-400">{f.application_status}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{money(f.committed_amount)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {f.service_delivery_deadline ? String(f.service_delivery_deadline).slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {f.invoice_deadline ? String(f.invoice_deadline).slice(0, 10) : "—"}
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
