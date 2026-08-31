"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { EntityPurchaseHistory } from "@/lib/api";

// Per-entity Form 471 "Purchase History" drill-down (B5). Opens a timeline of
// what an entity has bought across funding years (Year | Category | Provider |
// Manufacturer | Product | Qty | $), answering the vendor workflow "we like to
// see what their purchase history is" without the click-heavy USAC lookups.

function fmtCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function catLabel(cat?: string | null): string {
  if (cat === "1") return "Cat 1";
  if (cat === "2") return "Cat 2";
  return "—";
}

export default function PurchaseHistoryModal({
  ben,
  entityName,
  onClose,
}: {
  ben: string | null;
  entityName?: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<EntityPurchaseHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ben) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .getEntityPurchaseHistory(ben)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.success) {
          setData(res.data);
        } else {
          setError(res.data?.error || res.error || "Could not load purchase history.");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not load purchase history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ben]);

  if (!ben) return null;

  const years = data?.years ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Purchase History</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {data?.entity_name || entityName || `BEN ${ben}`} • BEN {ben}
            </p>
            {data && data.overall_total > 0 && (
              <p className="text-sm font-medium text-slate-700 mt-1">
                Total funded across all years: {fmtCurrency(data.overall_total)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <p className="text-sm text-slate-500">Loading Form 471 purchase history…</p>
          )}
          {!loading && error && (
            <p className="text-sm text-amber-700">{error}</p>
          )}
          {!loading && !error && years.length === 0 && (
            <p className="text-sm text-slate-500">
              No Form 471 purchase history found for this entity.
            </p>
          )}

          {!loading && !error && years.length > 0 && (
            <div className="space-y-6">
              {years.map((y) => (
                <div key={y.funding_year}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      FY{y.funding_year}
                    </h3>
                    <span className="text-sm font-medium text-slate-600">
                      {fmtCurrency(y.year_total)}
                    </span>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Category</th>
                          <th className="px-3 py-2 text-left font-medium">Provider</th>
                          <th className="px-3 py-2 text-left font-medium">Manufacturer</th>
                          <th className="px-3 py-2 text-left font-medium">Product</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">$</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {y.line_items.map((li, i) => (
                          <tr key={i} className="text-slate-700">
                            <td className="px-3 py-2 whitespace-nowrap">{catLabel(li.category)}</td>
                            <td className="px-3 py-2">{li.provider || "—"}</td>
                            <td className="px-3 py-2">{li.manufacturer || "—"}</td>
                            <td className="px-3 py-2">
                              {li.product || li.service_type || "—"}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {li.quantity ? Math.round(Number(li.quantity)).toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {fmtCurrency(li.total_cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                Source: USAC Form 471 (avi8-svp9). Manufacturer/model best-effort from
                the 471 line-item dataset where available.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
