"use client";

import { useState, useCallback, useRef } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  Upload, FileText, X, Plus, Scale, Trophy, AlertTriangle,
  XCircle, RotateCcw, Gavel,
} from "lucide-react";

// ==================== TYPES ====================

interface BidScoreBreakdown {
  price: number;
  tco: number;
  technical: number;
  support: number;
  experience: number;
}

interface BidEvaluation {
  source_index: number;
  rank: number;
  filename: string;
  vendor_name: string;
  total_price: number | null;
  monthly_cost: number | null;
  one_time_cost: number | null;
  contract_term: string | null;
  products_services: string[];
  key_specs: string[];
  notable_terms: string[];
  scores: BidScoreBreakdown;
  weighted_total: number;
  rationale: string;
}

interface BidAnalysisResult {
  bids: BidEvaluation[];
  ranking: { rank: number; vendor_name: string; weighted_total: number; source_index: number }[];
  winner: BidEvaluation | null;
  weights: Record<string, number>;
  metric_labels: Record<string, string>;
  price_is_primary: boolean;
  rationale: string;
  compliance_note: string;
  engine_version: string | null;
  disclaimer: string;
}

type MetricKey = "price" | "tco" | "technical" | "support" | "experience";

const METRIC_ORDER: MetricKey[] = ["price", "tco", "technical", "support", "experience"];

const METRIC_SHORT: Record<MetricKey, string> = {
  price: "Price",
  tco: "TCO",
  technical: "Technical",
  support: "Support",
  experience: "Experience",
};

const DEFAULT_WEIGHTS: Record<MetricKey, number> = {
  price: 50,
  tco: 20,
  technical: 15,
  support: 10,
  experience: 5,
};

const MAX_BID_FILES = 8;
const MAX_FILE_SIZE_MB = 10;
const SUPPORTED_TYPES = [".pdf", ".docx", ".doc", ".txt"];

// ==================== COMPONENT ====================

export default function BidAnalysis() {
  const { token } = useAuthStore();

  const [bidFiles, setBidFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [weights, setWeights] = useState<Record<MetricKey, number>>({ ...DEFAULT_WEIGHTS });
  const [form470Ref, setForm470Ref] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<BidAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bidInputRef = useRef<HTMLInputElement>(null);

  const weightTotal = METRIC_ORDER.reduce((sum, k) => sum + weights[k], 0);
  const priceIsPrimary = METRIC_ORDER.every(
    (k) => k === "price" || weights.price > weights[k]
  );

  const isValidFile = useCallback((f: File): boolean => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    return SUPPORTED_TYPES.includes(ext);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const accepted: File[] = [];
    for (const f of incoming) {
      if (!isValidFile(f)) {
        setError(`"${f.name}" is not supported. Accepted: PDF, DOCX, DOC, TXT.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`"${f.name}" exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
        return;
      }
      accepted.push(f);
    }
    setBidFiles((prev) => {
      const combined = [...prev, ...accepted];
      if (combined.length > MAX_BID_FILES) {
        setError(`Maximum ${MAX_BID_FILES} bids allowed.`);
        return prev;
      }
      setError(null);
      return combined;
    });
  }, [isValidFile]);

  const removeFile = useCallback((idx: number) => {
    setBidFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (e.target) e.target.value = "";
  }, [addFiles]);

  const setWeight = (key: MetricKey, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  };

  const resetWeights = () => setWeights({ ...DEFAULT_WEIGHTS });

  const handleAnalyze = async () => {
    if (bidFiles.length < 2) {
      setError("Upload at least 2 bids to compare.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      for (const f of bidFiles) formData.append("bids", f);
      // Normalize weights to sum to 100 before sending.
      const total = weightTotal || 1;
      const normalized: Record<string, number> = {};
      for (const k of METRIC_ORDER) normalized[k] = Math.round((weights[k] * 100) / total);
      formData.append("weights", JSON.stringify(normalized));
      if (form470Ref.trim()) formData.append("form470_reference", form470Ref.trim());

      const accessToken = token || localStorage.getItem("access_token");
      // Guard against a hung request (AI can be slow); abort after 120s so the
      // button doesn't spin forever with no feedback.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      let response: Response;
      try {
        response = await fetch("/api/v1/compliance/bid-analysis", {
          method: "POST",
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: formData,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error (HTTP ${response.status})`);
      }

      const data: BidAnalysisResult = await response.json();
      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("The analysis timed out after 2 minutes. Try fewer or smaller files.");
      } else {
        setError(err instanceof Error ? err.message : "Bid analysis failed. Please try again.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fmtMoney = (v: number | null | undefined): string => {
    if (v === null || v === undefined) return "\u2014";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(v);
  };

  const scoreColor = (score: number): string => {
    if (score >= 80) return "text-emerald-700 bg-emerald-50";
    if (score >= 60) return "text-amber-700 bg-amber-50";
    return "text-red-700 bg-red-50";
  };

  return (
    <div>
      {/* Intro */}
      <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
        <p className="text-sm text-indigo-800">
          <strong>Bid Analysis.</strong> Upload the competing vendor bids you received in
          response to your Form 470. SkyRate AI extracts each vendor&apos;s pricing and
          specifications, scores every bid against standard E-Rate evaluation metrics, and
          recommends the most advantageous bid. Per{" "}
          <span className="font-semibold">FCC Order 19-117</span>, price is enforced as the
          primary evaluation factor.
        </p>
      </div>

      {/* Upload Zone */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Vendor Bids <span className="text-slate-400 font-normal">(2 to {MAX_BID_FILES} files)</span>
        </label>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
            dragActive
              ? "border-indigo-400 bg-indigo-50"
              : bidFiles.length > 0
              ? "border-emerald-300 bg-emerald-50/50"
              : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50"
          }`}
        >
          {bidFiles.length > 0 ? (
            <div className="space-y-2">
              {bidFiles.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{f.name}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {bidFiles.length < MAX_BID_FILES && (
                <button
                  onClick={() => bidInputRef.current?.click()}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mx-auto mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Add more bids
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => bidInputRef.current?.click()}
              className="flex flex-col items-center gap-2 w-full"
            >
              <Upload className="w-10 h-10 text-slate-400" />
              <p className="font-medium text-slate-700">
                Drop your vendor bids here, or click to browse
              </p>
              <p className="text-sm text-slate-500">PDF, DOCX, DOC, TXT &middot; max 10 MB each</p>
            </button>
          )}
          <input
            ref={bidInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Weight Sliders */}
      <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-700">Evaluation Weights</h3>
          </div>
          <button
            onClick={resetWeights}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to E-Rate defaults
          </button>
        </div>

        <div className="space-y-4">
          {METRIC_ORDER.map((key) => {
            const pct = weightTotal > 0 ? Math.round((weights[key] * 100) / weightTotal) : 0;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-slate-600 flex items-center gap-2">
                    {METRIC_SHORT[key]}
                    {key === "price" && (
                      <span className="text-[10px] uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
                        Primary
                      </span>
                    )}
                  </label>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    {pct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[key]}
                  onChange={(e) => setWeight(key, Number(e.target.value))}
                  className={`w-full accent-indigo-600 ${
                    key === "price" ? "" : ""
                  }`}
                />
              </div>
            );
          })}
        </div>

        {!priceIsPrimary && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Price is not currently the most heavily weighted factor. E-Rate rules
              (FCC Order 19-117) require price to be the primary factor. Raise the Price
              weight above every other factor before relying on this ranking for an award.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Weights are normalized to 100% automatically. Sliders are relative.
        </p>
      </div>

      {/* Optional Form 470 reference */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-600 mb-1">
          Form 470 scope / requirements <span className="text-slate-400">(optional)</span>
        </label>
        <textarea
          value={form470Ref}
          onChange={(e) => setForm470Ref(e.target.value)}
          rows={3}
          placeholder="Paste the services/products and requirements from your Form 470 so the AI can judge technical fit against your actual needs."
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Submit */}
      <div className="mb-8 flex justify-center">
        <button
          onClick={handleAnalyze}
          disabled={bidFiles.length < 2 || isAnalyzing}
          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing bids...
            </>
          ) : (
            <>
              <Gavel className="w-5 h-5" />
              Analyze Bids
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && result.bids.length > 0 && (
        <div className="space-y-6">
          {/* Winner banner */}
          {result.winner && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">
                    Recommended Bid
                  </p>
                  <h3 className="text-xl font-bold text-slate-900">
                    {result.winner.vendor_name}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">{result.rationale}</p>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-3 text-sm text-slate-700">
                    <span>
                      <span className="text-slate-400">Weighted score:</span>{" "}
                      <span className="font-bold text-emerald-700">
                        {result.winner.weighted_total}/100
                      </span>
                    </span>
                    <span>
                      <span className="text-slate-400">Total price:</span>{" "}
                      <span className="font-semibold">{fmtMoney(result.winner.total_price)}</span>
                    </span>
                    {result.winner.contract_term && (
                      <span>
                        <span className="text-slate-400">Term:</span>{" "}
                        <span className="font-semibold">{result.winner.contract_term}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparison table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Ranked Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    <th className="text-left font-semibold px-4 py-3">#</th>
                    <th className="text-left font-semibold px-4 py-3">Vendor</th>
                    <th className="text-right font-semibold px-4 py-3">Total Price</th>
                    {METRIC_ORDER.map((k) => (
                      <th key={k} className="text-center font-semibold px-3 py-3">
                        {METRIC_SHORT[k]}
                        <span className="block text-[10px] text-slate-400 font-normal normal-case">
                          {result.weights[k]}%
                        </span>
                      </th>
                    ))}
                    <th className="text-center font-semibold px-4 py-3">Weighted</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bids.map((bid) => (
                    <tr
                      key={bid.source_index}
                      className={`border-t border-slate-100 ${
                        bid.rank === 1 ? "bg-emerald-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-500 font-medium">{bid.rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{bid.vendor_name}</span>
                          {bid.rank === 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                              <Trophy className="w-3 h-3" />
                              Winner
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-400 truncate max-w-[180px]">
                          {bid.filename}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                        {fmtMoney(bid.total_price)}
                      </td>
                      {METRIC_ORDER.map((k) => (
                        <td key={k} className="px-3 py-3 text-center">
                          <span
                            className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-md text-xs font-semibold tabular-nums ${scoreColor(
                              bid.scores[k]
                            )}`}
                          >
                            {Math.round(bid.scores[k])}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-indigo-700 tabular-nums">
                          {bid.weighted_total}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-bid detail cards */}
          <div className="space-y-4">
            {result.bids.map((bid) => (
              <div
                key={bid.source_index}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 p-5 shadow-sm ${
                  bid.rank === 1 ? "border-l-emerald-400" : "border-l-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      #{bid.rank} &middot; {bid.vendor_name}
                    </span>
                    {bid.rank === 1 && (
                      <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">
                        Recommended
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">
                    Weighted <span className="font-bold text-indigo-700">{bid.weighted_total}</span>/100
                  </span>
                </div>
                {bid.rationale && (
                  <p className="text-sm text-slate-600 mb-3">{bid.rationale}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                  <div>
                    <p className="text-xs text-slate-400">Total Price</p>
                    <p className="font-semibold text-slate-800">{fmtMoney(bid.total_price)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Monthly</p>
                    <p className="font-semibold text-slate-800">{fmtMoney(bid.monthly_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">One-time</p>
                    <p className="font-semibold text-slate-800">{fmtMoney(bid.one_time_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Term</p>
                    <p className="font-semibold text-slate-800">{bid.contract_term || "\u2014"}</p>
                  </div>
                </div>
                {bid.products_services.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-slate-400 mb-1">Products / Services</p>
                    <div className="flex flex-wrap gap-1">
                      {bid.products_services.map((p, i) => (
                        <span
                          key={i}
                          className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {bid.key_specs.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-slate-400 mb-1">Key Specs</p>
                    <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                      {bid.key_specs.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {bid.notable_terms.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Notable Terms</p>
                    <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                      {bid.notable_terms.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Compliance note */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              result.price_is_primary
                ? "bg-indigo-50 border-indigo-100"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            {result.price_is_primary ? (
              <Scale className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <p
              className={`text-sm ${
                result.price_is_primary ? "text-indigo-800" : "text-amber-800"
              }`}
            >
              <strong>Compliance note:</strong> {result.compliance_note}
            </p>
          </div>

          {/* Disclaimer */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500 text-center">
              {result.disclaimer || "Advisory only. Not legal or USAC official guidance."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
