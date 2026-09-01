"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck, Upload, FileText, Search, Loader2, AlertTriangle,
  CheckCircle2, XCircle, AlertCircle, Sparkles, Download, Send, History,
  ExternalLink, ShieldCheck, RefreshCw,
} from "lucide-react";
import {
  api, BidAnalysis, Bid470Context, BidAnalysisListItem,
  BidCopilotFinding, BidCopilotSubscore, AppealPrecedentDetail,
} from "@/lib/api";

const LEVEL_META: Record<string, { color: string; bg: string; Icon: typeof CheckCircle2; label: string }> = {
  pass: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", Icon: CheckCircle2, label: "Pass" },
  warn: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200", Icon: AlertCircle, label: "Warning" },
  fail: { color: "text-red-600", bg: "bg-red-50 border-red-200", Icon: XCircle, label: "Fail" },
};

function scoreColor(v: number): string {
  if (v >= 80) return "#22c55e";
  if (v >= 60) return "#f59e0b";
  return "#ef4444";
}

function ScoreRing({ score }: { score: number }) {
  const v = Math.max(0, Math.min(100, Math.round(score || 0)));
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (v / 100) * circ;
  const color = scoreColor(v);
  return (
    <svg width={132} height={132} viewBox="0 0 132 132" className="shrink-0">
      <circle cx={66} cy={66} r={r} fill="none" stroke="#e2e8f0" strokeWidth={12} />
      <circle
        cx={66} cy={66} r={r} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 66 66)"
      />
      <text x={66} y={62} textAnchor="middle" fontSize={30} fontWeight={800} fill={color}>{v}</text>
      <text x={66} y={84} textAnchor="middle" fontSize={12} fill="#94a3b8">/ 100</text>
    </svg>
  );
}

export default function BidCopilotTab({ dark = false }: { dark?: boolean }) {
  const [form470, setForm470] = useState("");
  const [context, setContext] = useState<Bid470Context | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [bidFile, setBidFile] = useState<File | null>(null);
  const [rfpFile, setRfpFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BidAnalysis | null>(null);
  const [history, setHistory] = useState<BidAnalysisListItem[]>([]);
  const [refineMsg, setRefineMsg] = useState("");
  const [refining, setRefining] = useState(false);
  const [precedent, setPrecedent] = useState<AppealPrecedentDetail | null>(null);

  const cardCls = dark ? "bg-[#12132a] border-slate-800" : "bg-white border-slate-200";
  const ink = dark ? "text-slate-100" : "text-slate-900";
  const faint = dark ? "text-slate-400" : "text-slate-500";
  const inputCls = dark
    ? "bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400";

  const loadHistory = useCallback(async () => {
    const res = await api.listBidAnalyses();
    if (res.success && res.data?.success) setHistory(res.data.analyses || []);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const loadContext = async () => {
    const f = form470.trim();
    if (!f) { setError("Enter the Form 470 number you're bidding on."); return; }
    setCtxLoading(true);
    setError(null);
    try {
      const res = await api.getBid470Context(f);
      if (res.success && res.data?.success) {
        setContext(res.data.context);
        if (!res.data.context.found) {
          setError(res.data.context.error || "That Form 470 could not be found on USAC.");
        }
      } else {
        setError(res.error || "Could not load the Form 470.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the Form 470.");
    } finally {
      setCtxLoading(false);
    }
  };

  const runAnalyze = async () => {
    const f = form470.trim();
    if (!f) { setError("Enter the Form 470 number."); return; }
    if (!bidFile) { setError("Upload your bid/proposal file (PDF, DOCX, DOC, or TXT)."); return; }
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await api.analyzeBid(bidFile, f, rfpFile);
      if (res.success && res.data?.success) {
        setAnalysis(res.data.analysis);
        loadHistory();
      } else {
        setError(res.error || "Analysis failed. Please try again.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const openAnalysis = async (id: number) => {
    setError(null);
    const res = await api.getBidAnalysis(id);
    if (res.success && res.data?.success) {
      setAnalysis(res.data.analysis);
      setContext((res.data.analysis.context as Bid470Context) || null);
      setForm470(res.data.analysis.form_470_number || "");
    }
  };

  const sendRefine = async () => {
    if (!analysis || !refineMsg.trim()) return;
    setRefining(true);
    try {
      const res = await api.refineBidAnalysis(analysis.id, refineMsg.trim());
      if (res.success && res.data) {
        setAnalysis({
          ...analysis,
          refined_bid_text: res.data.refined_bid_text,
          chat_history: res.data.chat_history,
        });
        setRefineMsg("");
      } else {
        setError(res.error || "Refine failed.");
      }
    } finally {
      setRefining(false);
    }
  };

  const doExport = async (fmt: "md" | "txt") => {
    if (!analysis) return;
    const blob = await api.downloadBidExport(analysis.id, fmt);
    if (!blob) { setError("Export failed."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bid-compliance-${analysis.id}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const viewPrecedent = async (id?: number | null) => {
    if (!id) return;
    const res = await api.getBidPrecedent(id);
    if (res.success && res.data?.success) setPrecedent(res.data.precedent);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Bid Compliance Copilot</h1>
            <p className="text-violet-100 mt-1">
              Score your bid against the Form 470 and the FCC rules <b>before</b> you submit — grounded in
              47 CFR Part 54 and real appeal precedents, with cited fixes.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: upload + target + history */}
        <div className="lg:col-span-1 space-y-6">
          <div className={`rounded-2xl border p-5 shadow-sm ${cardCls}`}>
            <h2 className={`text-lg font-semibold mb-3 ${ink}`}>1 · Target Form 470</h2>
            <label className={`block text-sm font-medium mb-1.5 ${faint}`}>Form 470 number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form470}
                onChange={(e) => setForm470(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadContext(); }}
                placeholder="e.g. 230001234567"
                className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-500 ${inputCls}`}
              />
              <button
                onClick={loadContext}
                disabled={ctxLoading}
                className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 flex items-center gap-1"
              >
                {ctxLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Load
              </button>
            </div>

            {context?.found && (
              <div className={`mt-4 rounded-xl border p-3 text-sm ${dark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
                <div className={`font-semibold ${ink}`}>{context.applicant_name || "Applicant"}</div>
                <div className={faint}>
                  BEN {context.ben || "—"} · {context.city}{context.state ? `, ${context.state}` : ""} · FY{context.funding_year}
                </div>
                {(context.categories?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {context.categories!.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-md text-xs bg-violet-100 text-violet-700">{c}</span>
                    ))}
                  </div>
                )}
                <div className={`mt-2 ${faint}`}>{context.total_services || 0} requested service line(s)</div>
                {(context.service_types?.length ?? 0) > 0 && (
                  <div className={`mt-1 text-xs ${faint}`}>{context.service_types!.slice(0, 8).join(" · ")}</div>
                )}
                {(context.rfp_links?.length ?? 0) > 0 && (
                  <div className="mt-2 space-y-1">
                    {context.rfp_links!.slice(0, 4).map((u, i) => (
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> RFP document {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`rounded-2xl border p-5 shadow-sm ${cardCls}`}>
            <h2 className={`text-lg font-semibold mb-3 ${ink}`}>2 · Upload your bid</h2>
            <FilePicker label="Bid / proposal" file={bidFile} onPick={setBidFile} dark={dark} faint={faint} />
            <div className="mt-3">
              <FilePicker label="RFP (optional)" file={rfpFile} onPick={setRfpFile} dark={dark} faint={faint} />
            </div>
            <button
              onClick={runAnalyze}
              disabled={analyzing || !bidFile || !form470.trim()}
              className="mt-4 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Sparkles className="w-4 h-4" /> Analyze bid</>}
            </button>
            <p className={`mt-2 text-xs ${faint}`}>Accepted: PDF, DOCX, DOC, TXT (max 10 MB).</p>
          </div>

          <div className={`rounded-2xl border p-5 shadow-sm ${cardCls}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-lg font-semibold flex items-center gap-2 ${ink}`}><History className="w-4 h-4" /> Past analyses</h2>
              <button onClick={loadHistory} className={`text-xs ${faint} hover:underline flex items-center gap-1`}><RefreshCw className="w-3 h-3" /> Refresh</button>
            </div>
            {history.length === 0 ? (
              <p className={`text-sm ${faint}`}>No analyses yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => openAnalysis(h.id)}
                    className={`w-full text-left rounded-lg border p-2.5 text-sm hover:border-violet-400 transition ${dark ? "border-slate-700" : "border-slate-200"} ${analysis?.id === h.id ? "ring-2 ring-violet-500" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium truncate ${ink}`}>470 {h.form_470_number || "—"}</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: scoreColor(h.overall_score || 0) }}>{Math.round(h.overall_score || 0)}</span>
                    </div>
                    <div className={`text-xs truncate ${faint}`}>{h.applicant_name || h.bid_filename || ""}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: results */}
        <div className="lg:col-span-2 space-y-6">
          {!analysis ? (
            <div className={`rounded-2xl border p-10 shadow-sm text-center ${cardCls}`}>
              <ShieldCheck className={`w-12 h-12 mx-auto mb-3 ${faint}`} />
              <h3 className={`text-lg font-semibold ${ink}`}>Score a bid to see results</h3>
              <p className={`mt-1 text-sm ${faint} max-w-md mx-auto`}>
                Enter the Form 470 you're responding to, upload your bid, and the Copilot will score it on
                7 compliance dimensions with cited findings and concrete fixes.
              </p>
            </div>
          ) : (
            <>
              {/* Score + summary */}
              <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ScoreRing score={analysis.overall_score || 0} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className={`text-xl font-bold ${ink}`}>Compliance score</h2>
                      {analysis.llm_used === false && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">rule-based only</span>
                      )}
                    </div>
                    <p className={`mt-1 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{analysis.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => doExport("md")} className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 text-sm hover:bg-violet-50 flex items-center gap-1"><Download className="w-4 h-4" /> Report (.md)</button>
                      <button onClick={() => doExport("txt")} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 flex items-center gap-1"><Download className="w-4 h-4" /> .txt</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-scores */}
              <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                <h3 className={`text-lg font-semibold mb-4 ${ink}`}>Dimension sub-scores</h3>
                <div className="space-y-3">
                  {(analysis.subscores || []).map((s) => <SubscoreBar key={s.key} s={s} faint={faint} ink={ink} />)}
                </div>
              </div>

              {/* Findings */}
              <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                <h3 className={`text-lg font-semibold mb-4 ${ink}`}>Findings &amp; fixes</h3>
                <div className="space-y-3">
                  {(analysis.findings || []).length === 0 && <p className={`text-sm ${faint}`}>No findings.</p>}
                  {(analysis.findings || []).map((f, i) => (
                    <FindingCard key={i} f={f} onPrecedent={viewPrecedent} />
                  ))}
                </div>
              </div>

              {/* Refined bid */}
              {analysis.refined_bid_text && (
                <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                  <h3 className={`text-lg font-semibold mb-3 ${ink}`}>Refined bid draft</h3>
                  <pre className={`whitespace-pre-wrap text-sm rounded-xl p-4 max-h-96 overflow-y-auto ${dark ? "bg-slate-900 text-slate-200" : "bg-slate-50 text-slate-700"}`}>{analysis.refined_bid_text}</pre>
                </div>
              )}

              {/* Refine chat */}
              <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${ink}`}><Sparkles className="w-4 h-4" /> Refine with the Copilot</h3>
                {(analysis.chat_history?.length ?? 0) > 0 && (
                  <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                    {analysis.chat_history!.map((t, i) => (
                      <div key={i} className={`text-sm rounded-lg px-3 py-2 ${t.role === "user" ? (dark ? "bg-violet-900/40 text-violet-100" : "bg-violet-50 text-violet-900") : (dark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700")}`}>
                        <span className="font-semibold capitalize">{t.role}: </span>{t.content}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refineMsg}
                    onChange={(e) => setRefineMsg(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !refining) sendRefine(); }}
                    placeholder='e.g. "Add cost allocation for the ineligible items" or "Itemize section 3"'
                    className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-500 ${inputCls}`}
                  />
                  <button onClick={sendRefine} disabled={refining || !refineMsg.trim()} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 flex items-center gap-1">
                    {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
                  </button>
                </div>
              </div>

              {/* Sources */}
              {(analysis.sources?.length ?? 0) > 0 && (
                <div className={`rounded-2xl border p-6 shadow-sm ${cardCls}`}>
                  <h3 className={`text-sm font-semibold mb-3 ${faint}`}>Grounded in</h3>
                  <div className="space-y-1.5">
                    {analysis.sources!.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" /> <span className="font-medium">{s.citation}</span> — {s.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {analysis.disclaimer && (
                <p className={`text-xs ${faint} px-1`}>{analysis.disclaimer}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Precedent modal */}
      {precedent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPrecedent(null)}>
          <div className={`max-w-lg w-full rounded-2xl border p-6 shadow-2xl ${dark ? "bg-[#12132a] border-slate-700" : "bg-white border-slate-200"}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className={`text-lg font-bold ${ink}`}>{precedent.title}</h3>
              <button onClick={() => setPrecedent(null)} className={faint}><XCircle className="w-5 h-5" /></button>
            </div>
            <div className={`mt-1 text-xs ${faint}`}>{precedent.docket} · {precedent.release_id} · outcome: <b>{precedent.outcome}</b></div>
            {(precedent.issue_tags?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {precedent.issue_tags!.map((t) => <span key={t} className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{t}</span>)}
              </div>
            )}
            <p className={`mt-3 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{precedent.summary}</p>
            {precedent.url && (
              <a href={precedent.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-violet-600 hover:underline"><ExternalLink className="w-4 h-4" /> Open source</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilePicker({ label, file, onPick, dark, faint }: {
  label: string; file: File | null; onPick: (f: File | null) => void; dark: boolean; faint: string;
}) {
  return (
    <div>
      <div className={`text-sm font-medium mb-1.5 ${faint}`}>{label}</div>
      <label className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 cursor-pointer transition ${dark ? "border-slate-700 hover:border-violet-500" : "border-slate-300 hover:border-violet-400"}`}>
        <input
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] || null)}
        />
        {file ? <FileText className="w-5 h-5 text-violet-600 shrink-0" /> : <Upload className={`w-5 h-5 ${faint} shrink-0`} />}
        <span className={`text-sm truncate ${file ? (dark ? "text-slate-200" : "text-slate-700") : faint}`}>
          {file ? file.name : "Click to choose a file"}
        </span>
      </label>
    </div>
  );
}

function SubscoreBar({ s, faint, ink }: { s: BidCopilotSubscore; faint: string; ink: string }) {
  const v = Math.max(0, Math.min(100, Math.round(s.score || 0)));
  const color = scoreColor(v);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className={`font-medium ${ink}`}>{s.label} <span className={`text-xs ${faint}`}>· {s.weight}%</span></span>
        <span className="font-bold" style={{ color }}>{v}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
      </div>
      {s.rationale && <p className={`mt-1 text-xs ${faint}`}>{s.rationale}</p>}
    </div>
  );
}

function FindingCard({ f, onPrecedent }: { f: BidCopilotFinding; onPrecedent: (id?: number | null) => void }) {
  const meta = LEVEL_META[f.level] || LEVEL_META.warn;
  const Icon = meta.Icon;
  return (
    <div className={`rounded-xl border p-3.5 ${meta.bg}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase ${meta.color}`}>{meta.label}</span>
            <span className="text-xs font-medium text-slate-500 capitalize">{f.dimension.replace(/_/g, " ")}</span>
            {f.rule_cite && (
              f.precedent_url
                ? <a href={f.precedent_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline">{f.rule_cite}</a>
                : <span className="text-xs text-violet-600">{f.rule_cite}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-700">{f.message}</p>
          {f.fix && <p className="mt-1 text-sm text-slate-600"><b>Fix:</b> {f.fix}</p>}
          {f.precedent_id ? (
            <button onClick={() => onPrecedent(f.precedent_id)} className="mt-1.5 text-xs text-violet-600 hover:underline flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> View precedent
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
