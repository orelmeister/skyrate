"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type EquipmentItem, type EquipmentDocument } from "@/lib/api";

/**
 * Equipment & Wishlist area for a single school (Ari feedback #11 + #13).
 *
 *  #11 — Current Inventory vs Wishlist, grouped by E-Rate Category 1 / Category 2,
 *        with Category 2 maintenance term dates (Break/Fix vs MIBS) and a
 *        "Happy with current" quick button.
 *  #13 — Two clearly-labeled, separate upload zones: vendor Bid documents vs
 *        Form 470 posting documents.
 */

type Kind = "inventory" | "wishlist";
type Category = "C1" | "C2";
type MaintType = "break_fix" | "mibs" | "";

const MAINT_LABEL: Record<string, string> = {
  break_fix: "Break/Fix (Basic Maintenance)",
  mibs: "MIBS (Managed Internal Broadband Services)",
};

const emptyForm = {
  kind: "inventory" as Kind,
  category: "C2" as Category,
  name: "",
  description: "",
  quantity: 1,
  maintenance_type: "" as MaintType,
  term_start: "",
  term_end: "",
};

export default function EquipmentArea({
  ben,
  initialHappy,
  onHappyChange,
}: {
  ben: string;
  initialHappy?: boolean;
  onHappyChange?: (value: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [documents, setDocuments] = useState<EquipmentDocument[]>([]);
  const [happy, setHappy] = useState<boolean>(!!initialHappy);
  const [savingHappy, setSavingHappy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.getSchoolEquipment(ben);
      if (resp.success && resp.data) {
        setItems(resp.data.items || []);
        setDocuments(resp.data.documents || []);
        setHappy(!!resp.data.happy_with_current);
      } else {
        setError(resp.error || "Failed to load equipment");
      }
    } catch {
      setError("Failed to load equipment");
    } finally {
      setLoading(false);
    }
  }, [ben]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleHappy = async () => {
    const next = !happy;
    setSavingHappy(true);
    setHappy(next);
    try {
      const resp = await api.updateConsultantSchool(ben, { happy_with_current: next });
      if (!resp.success) throw new Error();
      onHappyChange?.(next);
    } catch {
      setHappy(!next);
    } finally {
      setSavingHappy(false);
    }
  };

  const submitAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        kind: form.kind,
        category: form.category,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        quantity: Number(form.quantity) || 1,
        maintenance_type: form.category === "C2" && form.maintenance_type ? form.maintenance_type : null,
        term_start: form.category === "C2" && form.term_start ? form.term_start : null,
        term_end: form.category === "C2" && form.term_end ? form.term_end : null,
      };
      const resp = await api.addSchoolEquipment(ben, payload);
      if (resp.success && resp.data) {
        setItems((prev) => [...prev, resp.data!.item]);
        setForm({ ...emptyForm });
        setShowAdd(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.deleteSchoolEquipment(id);
    } catch {
      load();
    }
  };

  const inventory = items.filter((i) => i.kind === "inventory");
  const wishlist = items.filter((i) => i.kind === "wishlist");

  const renderGroup = (list: EquipmentItem[], emptyText: string) => {
    const c1 = list.filter((i) => i.category === "C1");
    const c2 = list.filter((i) => i.category === "C2");
    if (list.length === 0) {
      return <p className="text-sm text-slate-400 italic px-1 py-2">{emptyText}</p>;
    }
    return (
      <div className="space-y-4">
        {[
          { label: "Category 1 — Broadband / Transport", rows: c1 },
          { label: "Category 2 — Internal Connections", rows: c2 },
        ].map(
          (grp) =>
            grp.rows.length > 0 && (
              <div key={grp.label}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {grp.label}
                </div>
                <div className="space-y-2">
                  {grp.rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900">
                          {item.name}
                          {item.quantity > 1 && (
                            <span className="ml-2 text-xs font-normal text-slate-500">×{item.quantity}</span>
                          )}
                        </div>
                        {item.description && (
                          <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
                        )}
                        {item.category === "C2" && item.maintenance_type && (
                          <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700">
                              {MAINT_LABEL[item.maintenance_type] || item.maintenance_type}
                            </span>
                            {(item.term_start || item.term_end) && (
                              <span className="text-slate-500">
                                {item.term_start ? String(item.term_start).slice(0, 10) : "—"}
                                {" → "}
                                {item.term_end ? String(item.term_end).slice(0, 10) : "—"}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove item"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <span>🧰</span> Equipment &amp; Wishlist
          </h3>
          <p className="text-xs text-slate-500">
            Track current inventory vs. what this school wants next cycle.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleHappy}
          disabled={savingHappy}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            happy
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "border border-dashed border-slate-300 bg-white text-slate-500 hover:bg-slate-100"
          }`}
          title="Mark that this school is happy with current equipment (no refresh requested)"
        >
          {happy ? "✓ Happy with current" : "Happy with current?"}
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="py-4 text-sm text-slate-500">Loading equipment…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">📦 Current Inventory</div>
              {renderGroup(inventory, "No equipment recorded yet.")}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">⭐ Wishlist</div>
              {renderGroup(wishlist, "No wishlist items yet.")}
            </div>
          </div>

          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              + Add equipment / wishlist item
            </button>
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  List
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  >
                    <option value="inventory">Current Inventory</option>
                    <option value="wishlist">Wishlist</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Category
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  >
                    <option value="C1">Category 1 — Broadband / Transport</option>
                    <option value="C2">Category 2 — Internal Connections</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                  Item name
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Access points, core switch, firewall…"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  Notes (optional)
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  />
                </label>

                {form.category === "C2" && (
                  <>
                    <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                      Category 2 maintenance type
                      <select
                        value={form.maintenance_type}
                        onChange={(e) => setForm({ ...form, maintenance_type: e.target.value as MaintType })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                      >
                        <option value="">None / not a maintenance line</option>
                        <option value="break_fix">Break/Fix (Basic Maintenance)</option>
                        <option value="mibs">MIBS (Managed Internal Broadband Services)</option>
                      </select>
                    </label>
                    {form.maintenance_type && (
                      <>
                        <label className="text-xs font-medium text-slate-600">
                          Term start
                          <input
                            type="date"
                            value={form.term_start}
                            onChange={(e) => setForm({ ...form, term_start: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Term end
                          <input
                            type="date"
                            value={form.term_end}
                            onChange={(e) => setForm({ ...form, term_end: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitAdd}
                  disabled={saving || !form.name.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add item"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setForm({ ...emptyForm });
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <DocumentZones ben={ben} documents={documents} setDocuments={setDocuments} />
        </div>
      )}
    </div>
  );
}

/** Two clearly-labeled, separate document zones (Ari #13). */
function DocumentZones({
  ben,
  documents,
  setDocuments,
}: {
  ben: string;
  documents: EquipmentDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<EquipmentDocument[]>>;
}) {
  const zones: Array<{ type: "bid" | "form470"; label: string; hint: string; icon: string }> = [
    { type: "bid", label: "Vendor Bid Documents", hint: "Bid responses received from vendors", icon: "📨" },
    { type: "form470", label: "Form 470 Documents", hint: "Form 470 posting & RFP documents", icon: "📄" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {zones.map((zone) => (
        <DocumentZone
          key={zone.type}
          ben={ben}
          zone={zone}
          documents={documents.filter((d) => d.doc_type === zone.type)}
          setDocuments={setDocuments}
        />
      ))}
    </div>
  );
}

function DocumentZone({
  ben,
  zone,
  documents,
  setDocuments,
}: {
  ben: string;
  zone: { type: "bid" | "form470"; label: string; hint: string; icon: string };
  documents: EquipmentDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<EquipmentDocument[]>>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const resp = await api.addSchoolDocument(ben, { doc_type: zone.type, name: trimmed });
      if (resp.success && resp.data) {
        setDocuments((prev) => [resp.data!.document, ...prev]);
        setName("");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      await api.deleteSchoolDocument(id);
    } catch {
      /* best-effort */
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span>{zone.icon}</span> {zone.label}
      </div>
      <p className="mb-3 text-xs text-slate-500">{zone.hint}</p>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Document name / reference…"
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {documents.length === 0 ? (
        <p className="text-xs italic text-slate-400">No documents recorded.</p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700"
            >
              <span className="min-w-0 truncate">{doc.name}</span>
              <button
                type="button"
                onClick={() => remove(doc.id)}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Remove document"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
