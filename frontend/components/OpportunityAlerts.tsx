"use client";

import { useEffect, useState } from "react";
import { api, VendorAlertSubscription } from "@/lib/api";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

interface OpportunityAlertsProps {
  defaultEmail?: string | null;
}

export default function OpportunityAlerts({ defaultEmail }: OpportunityAlertsProps) {
  const [subs, setSubs] = useState<VendorAlertSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("New opportunity alert");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [cat1, setCat1] = useState(true);
  const [cat2, setCat2] = useState(true);
  const [email, setEmail] = useState(defaultEmail || "");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listVendorAlerts();
      if (res.success && res.data) setSubs(res.data.subscriptions || []);
      else setError(res.error || "Failed to load alerts");
    } catch {
      setError("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleState = (s: string) => {
    setSelectedStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const handleSave = async () => {
    if (selectedStates.length === 0) {
      setError("Select at least one state to get alerts for.");
      return;
    }
    const cats: string[] = [];
    if (cat1) cats.push("Category 1");
    if (cat2) cats.push("Category 2");
    setSaving(true);
    setError(null);
    try {
      const res = await api.createVendorAlert({
        name: name.trim() || "Opportunity alert",
        states: selectedStates,
        service_categories: cats.length ? cats : undefined,
        channels: { email: true },
        email: email.trim() || undefined,
      });
      if (res.success) {
        setShowForm(false);
        setSelectedStates([]);
        setName("New opportunity alert");
        await load();
      } else {
        setError(res.error || "Failed to save alert");
      }
    } catch {
      setError("Failed to save alert");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteVendorAlert(id);
      setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch {
      /* keep row on failure */
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>🔔</span> Opportunity Alerts
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Get an email the moment a new Form 470 is posted in the states you sell to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          {showForm ? "Cancel" : "+ New alert"}
        </button>
      </div>

      {showForm && (
        <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-slate-50 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Alert name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              placeholder="e.g., Texas & Oklahoma Wi-Fi opportunities"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              States ({selectedStates.length} selected)
            </label>
            <div className="mt-1 grid grid-cols-8 sm:grid-cols-12 gap-1 max-h-40 overflow-y-auto p-2 bg-white border border-slate-200 rounded-lg">
              {US_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleState(s)}
                  className={`text-xs font-medium rounded px-1.5 py-1 transition-colors ${
                    selectedStates.includes(s)
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={cat1} onChange={(e) => setCat1(e.target.checked)} /> Category 1
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <input type="checkbox" checked={cat2} onChange={(e) => setCat2(e.target.checked)} /> Category 2
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Send alerts to</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              placeholder="you@company.com"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save alert"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}

      {loading ? (
        <div className="text-xs text-slate-500">Loading alerts…</div>
      ) : subs.length === 0 ? (
        <div className="text-xs text-slate-500">
          No alerts yet. Create one to be notified about new opportunities.
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {(s.states || []).length > 0 ? (s.states || []).join(", ") : "All states"}
                  {(s.service_categories || []).length > 0 && ` · ${(s.service_categories || []).join(", ")}`}
                  {s.email && ` · ${s.email}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
