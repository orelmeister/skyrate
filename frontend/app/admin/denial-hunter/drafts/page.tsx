"use client";

/**
 * Drafts Approval Queue
 * ---------------------
 * Lists Gemini-drafted replies awaiting human approval. Admins can:
 *   - Read the original inbound reply + lead context
 *   - Edit the draft body
 *   - Approve & send (worker drains and SMTPs on next poll, ~2 min)
 *   - Reject (never sends)
 *
 * Mandatory rule: NO autonomous sends to prospects. Every outbound reply to
 * a human must be approved here first.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type Draft = {
  id: number;
  outreach_id: number | null;
  institution_ben: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  received_at: string | null;
  classification: string | null;
  sentiment: string | null;
  intent_confidence: number | null;
  recommended_action: string | null;
  reasoning: string | null;
  forward_to_email: string | null;
  forward_to_name: string | null;
  draft_status: string | null;
  status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  send_error: string | null;
  classified_at: string | null;
  organization_name?: string | null;
  state?: string | null;
  appealability?: string | null;
  appeal_deadline?: string | null;
};

type DraftDetail = Draft & {
  body_text: string | null;
  draft_reply: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  lead?: {
    organization_name: string | null;
    state: string | null;
    appealability: string | null;
    appeal_deadline: string | null;
    primary_argument: string | null;
    denial_category_human: string | null;
  };
  outreach?: {
    id: number;
    touch_number: number;
    subject: string | null;
    sent_at: string | null;
    recipient_email: string | null;
  };
};

type ListResp = { total: number; limit: number; offset: number; rows: Draft[] };

async function dhFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api/v1/admin/denial-hunter${path}`;
  const res = await authFetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/sign-in?next=/admin/denial-hunter/drafts";
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

function fmtDT(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "send_failed", label: "Failed" },
  { key: "rejected", label: "Rejected" },
];

export default function DraftsPage() {
  const [activeStatus, setActiveStatus] = useState<string>("pending");
  const [list, setList] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DraftDetail | null>(null);
  const [editing, setEditing] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function loadList(status: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await dhFetch<ListResp>(`/drafts?draft_status=${status}&limit=100`);
      setList(r.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }

  async function loadCounts() {
    // Fetch each tab's count via HEAD-ish lightweight call: just use stats
    try {
      const s = await dhFetch<{ drafts_pending?: number; drafts_approved?: number; drafts_sent?: number }>("/stats");
      setCounts({
        pending: s.drafts_pending ?? 0,
        approved: s.drafts_approved ?? 0,
        sent: s.drafts_sent ?? 0,
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadList(activeStatus);
  }, [activeStatus]);

  useEffect(() => {
    loadCounts();
  }, []);

  async function openDraft(id: number) {
    setBusy(true);
    setError(null);
    try {
      const d = await dhFetch<DraftDetail>(`/drafts/${id}`);
      setSelected(d);
      setEditing(d.draft_reply || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load draft");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!selected) return;
    setBusy(true);
    try {
      await dhFetch(`/drafts/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_reply: editing }),
      });
      setSelected({ ...selected, draft_reply: editing });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveAndSend() {
    if (!selected) return;
    if (!confirm(`Send this reply to ${selected.from_email}?\n\nThis will be delivered on the next worker poll (within ~2 min).`)) {
      return;
    }
    setBusy(true);
    try {
      // Save first if user edited
      if (editing !== (selected.draft_reply || "")) {
        await dhFetch(`/drafts/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_reply: editing }),
        });
      }
      await dhFetch(`/drafts/${selected.id}/approve`, { method: "POST" });
      setSelected(null);
      await loadList(activeStatus);
      await loadCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!selected) return;
    if (!confirm("Reject this draft? It will not be sent.")) return;
    setBusy(true);
    try {
      await dhFetch(`/drafts/${selected.id}/reject`, { method: "POST" });
      setSelected(null);
      await loadList(activeStatus);
      await loadCounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reply Drafts</h1>
            <p className="text-sm text-slate-500">
              Human-in-the-loop approval for AI-drafted replies. Nothing sends without your click.
            </p>
          </div>
          <Link
            href="/admin/denial-hunter"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Back to dashboard
          </Link>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-slate-100">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveStatus(t.key);
                setSelected(null);
              }}
              className={`px-4 py-2 text-sm border-b-2 ${
                activeStatus === t.key
                  ? "border-rose-600 text-rose-700 font-semibold"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
              {counts[t.key] != null && t.key in counts ? (
                <span className="ml-2 inline-block bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">
                  {counts[t.key]}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT: list */}
          <section className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-slate-500">Loading…</div>
            ) : list.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No drafts in <strong>{activeStatus}</strong>.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
                {list.map((d) => (
                  <li
                    key={d.id}
                    onClick={() => openDraft(d.id)}
                    className={`p-3 cursor-pointer hover:bg-slate-50 ${
                      selected?.id === d.id ? "bg-rose-50 border-l-4 border-rose-500" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-mono">{d.classification || "—"}</span>
                      <span>{fmtDT(d.classified_at || d.received_at)}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {d.organization_name || d.from_name || d.from_email}
                    </div>
                    <div className="text-xs text-slate-600 truncate">{d.from_email}</div>
                    <div className="text-xs text-slate-500 truncate mt-1">
                      {d.subject || "(no subject)"}
                    </div>
                    {d.send_error ? (
                      <div className="text-xs text-red-600 mt-1 truncate">⚠ {d.send_error}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* RIGHT: detail */}
          <section className="lg:col-span-3">
            {!selected ? (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
                Select a draft from the list to review.
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wide">
                        {selected.classification}
                        {selected.sentiment ? ` · ${selected.sentiment}` : ""}
                        {selected.intent_confidence != null
                          ? ` · ${Math.round(selected.intent_confidence * 100)}% conf`
                          : ""}
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                        {selected.lead?.organization_name || selected.from_name || selected.from_email}
                      </h2>
                      <div className="text-sm text-slate-600">{selected.from_email}</div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      {selected.lead?.state ? <div>State: {selected.lead.state}</div> : null}
                      {selected.lead?.appealability ? (
                        <div>Appealability: {selected.lead.appealability}</div>
                      ) : null}
                      {selected.lead?.appeal_deadline ? (
                        <div>Deadline: {selected.lead.appeal_deadline}</div>
                      ) : null}
                    </div>
                  </div>
                  {selected.reasoning ? (
                    <p className="mt-2 text-xs text-slate-600 italic">
                      Gemini: {selected.reasoning}
                    </p>
                  ) : null}
                </div>

                <div className="p-4 border-b border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Their reply ({fmtDT(selected.received_at)})
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 rounded p-3 max-h-48 overflow-y-auto">
                    {selected.body_text || "(no body)"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Subject: {selected.subject || "(none)"}
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase">
                      Draft reply
                    </div>
                    <div className="text-xs text-slate-400">
                      To: {selected.from_email}
                    </div>
                  </div>
                  <textarea
                    value={editing}
                    onChange={(e) => setEditing(e.target.value)}
                    rows={12}
                    disabled={selected.draft_status !== "pending"}
                    className="w-full border border-slate-300 rounded p-3 text-sm font-mono resize-y focus:ring-2 focus:ring-rose-500 focus:border-rose-500 disabled:bg-slate-100 disabled:text-slate-600"
                  />
                  {selected.draft_status === "pending" ? (
                    <div className="flex items-center justify-between gap-2 mt-3">
                      <button
                        onClick={reject}
                        disabled={busy}
                        className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={busy || editing === (selected.draft_reply || "")}
                          className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Save edits
                        </button>
                        <button
                          onClick={approveAndSend}
                          disabled={busy || !editing.trim()}
                          className="px-4 py-2 text-sm rounded bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50"
                        >
                          Approve & Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-slate-500">
                      {selected.draft_status === "approved" && (
                        <>Queued for send · approved by {selected.approved_by} at{" "}
                          {fmtDT(selected.approved_at)}</>
                      )}
                      {selected.draft_status === "sent" && (
                        <>✓ Sent {fmtDT(selected.sent_at)} (approved by {selected.approved_by})</>
                      )}
                      {selected.draft_status === "send_failed" && (
                        <span className="text-red-600">
                          ⚠ Send failed: {selected.send_error}
                        </span>
                      )}
                      {selected.draft_status === "rejected" && (
                        <>Rejected by {selected.approved_by} at {fmtDT(selected.approved_at)}</>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
