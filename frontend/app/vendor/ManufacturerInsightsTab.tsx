"use client";

import { useState } from "react";
import { BarChart3, Search, Building2, MapPin, Info } from "lucide-react";
import { api, ManufacturerInsights } from "@/lib/api";

const QUICK_PICKS = ["Aruba", "Cisco", "HP", "Hewlett Packard", "Extreme Networks", "Ubiquiti", "Meraki"];

function fmtMoney(n?: number | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtFull(n?: number | null): string {
  return `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ManufacturerInsightsTab({ dark = false }: { dark?: boolean }) {
  const [manufacturer, setManufacturer] = useState("");
  const [year, setYear] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ManufacturerInsights | null>(null);

  const cardCls = dark ? "bg-[#12132a] border-slate-800" : "bg-white border-slate-200";
  const ink = dark ? "text-slate-100" : "text-slate-900";
  const faint = dark ? "text-slate-400" : "text-slate-500";
  const inputCls = dark
    ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400";

  const run = async (mfr?: string) => {
    const q = (mfr ?? manufacturer).trim();
    if (!q) {
      setError("Enter a manufacturer name to run insights.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.getManufacturerInsights(
        q,
        year ? parseInt(year, 10) : undefined,
        state.trim() ? state.trim().toUpperCase() : undefined,
      );
      if (res.success && res.data && res.data.success) {
        setData(res.data);
        if ((res.data.totals?.line_item_count || 0) === 0) {
          setError(`No Form 471 line items found for "${q}"${state ? ` in ${state.toUpperCase()}` : ""}${year ? ` (FY${year})` : ""}.`);
        }
      } else {
        setData(res.data || null);
        setError(res.data?.error || res.error || "Failed to load manufacturer insights.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load manufacturer insights.");
    } finally {
      setLoading(false);
    }
  };

  const maxYearSpend = Math.max(1, ...(data?.spend_by_year || []).map((y) => y.total_spend));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
            <BarChart3 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Manufacturer Insights</h1>
            <p className="text-purple-100 mt-1">
              Nationwide E-Rate funded equipment demand by manufacturer, from certified Form 471 line items.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className={`block text-sm font-medium mb-2 ${faint}`}>Manufacturer</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="e.g. Aruba, Cisco, HP"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${inputCls}`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${faint}`}>Funding Year (optional)</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${inputCls}`}
            >
              <option value="">All years</option>
              {(() => { const cy = new Date().getFullYear() + 1; const ys: number[] = []; for (let y = cy; y >= cy - 6; y--) ys.push(y); return ys; })().map((y) => (
                <option key={y} value={y}>FY{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${faint}`}>State (optional)</label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              onKeyDown={(e) => { if (e.key === "Enter") run(); }}
              placeholder="e.g. TX"
              maxLength={2}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${inputCls}`}
            />
          </div>
        </div>

        {/* Quick picks + Run */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {QUICK_PICKS.map((qp) => (
            <button
              key={qp}
              onClick={() => { setManufacturer(qp); run(qp); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${dark ? "border-slate-700 text-slate-300 hover:border-purple-500 hover:text-white" : "border-slate-200 text-slate-600 hover:bg-purple-50 hover:text-purple-700"}`}
            >
              {qp}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => run()}
            disabled={loading}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</>
            ) : (
              <><Search className="w-4 h-4" /> Run</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {data && (data.totals?.line_item_count || 0) > 0 && (
        <>
          {/* Headline totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Funded Spend", value: fmtFull(data.totals.total_spend), sub: `${fmtMoney(data.totals.one_time_spend)} one-time` },
              { label: "Line Items", value: (data.totals.line_item_count || 0).toLocaleString() },
              { label: "FRNs", value: (data.totals.frn_count || 0).toLocaleString() },
              { label: "Buying Entities", value: (data.totals.entity_count || 0).toLocaleString() },
            ].map((s) => (
              <div key={s.label} className={`rounded-2xl border p-5 shadow-sm ${cardCls}`}>
                <div className={`text-xs font-medium uppercase tracking-wide ${faint}`}>{s.label}</div>
                <div className={`text-2xl font-bold mt-1 ${ink}`}>{s.value}</div>
                {s.sub && <div className={`text-xs mt-1 ${faint}`}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spend by year */}
            <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
              <h2 className={`text-lg font-semibold mb-4 ${ink}`}>Funded Spend by Year</h2>
              <div className="space-y-3">
                {data.spend_by_year.map((y) => (
                  <div key={y.year}>
                    <div className={`flex items-center justify-between text-sm mb-1 ${ink}`}>
                      <span className="font-medium">FY{y.year}</span>
                      <span>{fmtFull(y.total_spend)}<span className={`ml-2 ${faint}`}>· {y.frn_count} FRNs</span></span>
                    </div>
                    <div className={`h-2.5 rounded-full ${dark ? "bg-slate-800" : "bg-slate-100"}`}>
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500"
                        style={{ width: `${Math.max(2, (y.total_spend / maxYearSpend) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Spend by state */}
            <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
              <h2 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${ink}`}>
                <MapPin className="w-5 h-5 text-purple-500" /> Top States
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-left ${faint}`}>
                      <th className="py-2 font-medium">State</th>
                      <th className="py-2 font-medium text-right">Funded Spend</th>
                      <th className="py-2 font-medium text-right">FRNs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.spend_by_state.map((s) => (
                      <tr key={s.state} className={`border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
                        <td className={`py-2 font-medium ${ink}`}>{s.state}</td>
                        <td className={`py-2 text-right ${ink}`}>{fmtFull(s.total_spend)}</td>
                        <td className={`py-2 text-right ${faint}`}>{s.frn_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top entities */}
          <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
            <h2 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${ink}`}>
              <Building2 className="w-5 h-5 text-purple-500" /> Top Buying Entities
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left ${faint}`}>
                    <th className="py-2 font-medium">Entity</th>
                    <th className="py-2 font-medium">State</th>
                    <th className="py-2 font-medium">BEN</th>
                    <th className="py-2 font-medium text-right">Funded Spend</th>
                    <th className="py-2 font-medium text-right">FRNs</th>
                    <th className="py-2 font-medium text-right">Latest FY</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_entities.map((e) => (
                    <tr key={`${e.ben}-${e.organization_name}`} className={`border-t ${dark ? "border-slate-800" : "border-slate-100"}`}>
                      <td className={`py-2 font-medium ${ink}`}>{e.organization_name || "—"}</td>
                      <td className={`py-2 ${faint}`}>{e.state || "—"}</td>
                      <td className={`py-2 ${faint}`}>{e.ben}</td>
                      <td className={`py-2 text-right ${ink}`}>{fmtFull(e.total_spend)}</td>
                      <td className={`py-2 text-right ${faint}`}>{e.frn_count}</td>
                      <td className={`py-2 text-right ${faint}`}>{e.most_recent_year ? `FY${e.most_recent_year}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data-source note */}
          <div className={`rounded-xl border px-4 py-3 text-xs flex items-start gap-2 ${dark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"}`}>
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Source: USAC Form 471 line items (hbj5-2bpj), matched on <code>form_471_manufacturer_name</code>.
              Reseller (SPIN) breakdown is not available on this dataset, so top resellers are not shown.
            </span>
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div className={`rounded-2xl border p-12 text-center ${cardCls} ${faint}`}>
          Pick a manufacturer above to see nationwide E-Rate funded demand, buying trends, top states, and top districts.
        </div>
      )}
    </div>
  );
}
