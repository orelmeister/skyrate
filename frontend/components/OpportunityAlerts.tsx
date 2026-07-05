"use client";

import { useEffect, useState } from "react";
import { api, VendorAlertSubscription } from "@/lib/api";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

// Friendly labels for the normalized applicant-type keys the matcher uses.
const APPLICANT_TYPE_LABELS: Record<string, string> = {
  k12_public: "Schools",
  library: "Libraries",
  consortium: "Consortia",
};

function applicantTypeLabel(key: string): string {
  return APPLICANT_TYPE_LABELS[key] || key;
}

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
  // Applicant types the USAC Form 470 feed actually supports. Category 1/2
  // is NOT filterable here: USAC's 470 dataset has no Category 2 field and
  // does not tag 470s by funding category, so a category filter always
  // returned 0. Applicant type (School / Library / Consortium) is populated
  // on every posting and is matched end-to-end by the alert matcher.
  const [wantSchools, setWantSchools] = useState(true);
  const [wantLibraries, setWantLibraries] = useState(true);
  const [wantConsortia, setWantConsortia] = useState(true);
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
    const applicantTypes: string[] = [];
    if (wantSchools) applicantTypes.push("k12_public");
    if (wantLibraries) applicantTypes.push("library");
    if (wantConsortia) applicantTypes.push("consortium");
    setSaving(true);
    setError(null);
    try {
      const res = await api.createVendorAlert({
        name: name.trim() || "Opportunity alert",
        states: selectedStates,
        // Only send applicant_types when the vendor has narrowed it; leaving
        // all three checked means "any applicant" (send nothing = wildcard).
        applicant_types:
          applicantTypes.length > 0 && applicantTypes.length < 3 ? applicantTypes : undefined,
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
            Get a weekly email digest of new Form 470 postings in the states you sell to — sent
            Monday afternoons, right after USAC&apos;s weekly data refresh.
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

          <div>
            <label className="text-xs font-semibold text-slate-600">Applicant type</label>
            <div className="mt-1 flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={wantSchools} onChange={(e) => setWantSchools(e.target.checked)} /> Schools
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={wantLibraries} onChange={(e) => setWantLibraries(e.target.checked)} /> Libraries
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={wantConsortia} onChange={(e) => setWantConsortia(e.target.checked)} /> Consortia
              </label>
            </div>
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
                  {(s.applicant_types || []).length > 0 &&
                    ` · ${(s.applicant_types || []).map(applicantTypeLabel).join(", ")}`}
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
