"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import {
  Shield, Upload, AlertTriangle, CheckCircle, XCircle, FileText,
  ArrowLeft, ShieldCheck, Brain, ExternalLink, ChevronDown, ChevronRight,
  Activity, Paperclip, X, Plus, History, RefreshCw, Check, Gavel
} from "lucide-react";
import BidAnalysis from "./bid-analysis";

// ==================== TYPES ====================

interface AgentTraceStage {
  stage: string;
  model: string;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  disagreement_flag?: boolean;
}

interface ComplianceFinding {
  severity: "low" | "medium" | "high";
  area: string;
  description: string;
  suggestion: string;
  rule_reference: string | null;
  source?: "rule_engine" | "llm";
  rule_id?: string;
}

interface RuleFinding {
  rule_id: string;
  rule_version: string;
  severity: string;
  area: string;
  description: string;
  suggestion: string;
  rule_reference: string;
  confidence: number;
  evidence_snippet: string | null;
}

interface ComparisonResult {
  resolved_issues: ComplianceFinding[];
  remaining_issues: ComplianceFinding[];
  new_issues: ComplianceFinding[];
  ready_to_submit: boolean;
  verdict: string;
}

interface ComplianceResult {
  analysis_id: number;
  form_type: string;
  form_number: string | null;
  overall_risk: "Low" | "Medium" | "High";
  summary: string | null;
  findings: ComplianceFinding[];
  rule_findings: RuleFinding[];
  llm_findings: ComplianceFinding[];
  comparison: ComparisonResult | null;
  created_at: string;
  engine_version: string | null;
  disclaimer: string;
  agent_trace?: AgentTraceStage[];
}

// ==================== FORM TYPE CONFIG ====================

const FORM_TYPES = [
  { value: "470", label: "Form 470 \u2014 Competitive Bidding Notice" },
  { value: "471", label: "Form 471 \u2014 Funding Request" },
  { value: "472", label: "Form 472 \u2014 BEAR (Invoice Reimbursement)" },
  { value: "474", label: "Form 474 \u2014 SPI (Service Provider Invoice)" },
  { value: "486", label: "Form 486 \u2014 Receipt of Service Confirmation" },
  { value: "500", label: "Form 500 \u2014 Funding Commitment Adjustment" },
  { value: "498", label: "Form 498 \u2014 Service Provider Info" },
  { value: "other", label: "Other USAC document" },
];

const SUPPORTING_DOCS_HELP: Record<string, string> = {
  "470": "Attach RFPs, bid responses, evaluation matrix",
  "471": "Attach matching Form 470, RFP, service category documentation",
  "472": "Attach ALL invoices being claimed for reimbursement",
  "474": "Attach all invoices for services billed",
  "486": "Attach service start documentation, CIPA attestation",
  "500": "Attach scope-change documentation, amended contracts",
  "498": "Attach any supporting registration documents",
  "other": "Attach any relevant supporting documents",
};

// ==================== COMPONENT ====================

export default function CompliancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, token, _hasHydrated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"review" | "bids">("review");
  const [formType, setFormType] = useState("470");
  const [formNumber, setFormNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [supportDragActive, setSupportDragActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const supportingInputRef = useRef<HTMLInputElement>(null);
  const reanalyzeId = searchParams.get("reanalyze");

  // Pre-fill from reanalyze query param
  useEffect(() => {
    if (reanalyzeId && token) {
      const accessToken = token || localStorage.getItem("access_token");
      fetch(`/api/v1/compliance/history/${reanalyzeId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.form_type) setFormType(data.form_type);
          if (data.form_number) setFormNumber(data.form_number);
        })
        .catch(() => {});
    }
  }, [reanalyzeId, token]);

  const MAX_SUPPORTING_FILES = 5;
  const MAX_FILE_SIZE_MB = 10;
  const SUPPORTED_TYPES = [".pdf", ".docx", ".doc", ".txt"];
  const SUPPORTED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const dropped = e.dataTransfer.files?.[0];
    if (dropped && dropped.type === "application/pdf") {
      setFile(dropped);
      setError(null);
      setResult(null);
    } else {
      setError("Please upload a PDF file.");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === "application/pdf") {
      setFile(selected);
      setError(null);
      setResult(null);
    } else if (selected) {
      setError("Please upload a PDF file.");
    }
  }, []);

  const isValidSupportingFile = useCallback((f: File): boolean => {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    return SUPPORTED_TYPES.includes(ext) || SUPPORTED_MIME_TYPES.includes(f.type);
  }, []);

  const addSupportingFiles = useCallback((files: FileList | File[]) => {
    const newFiles: File[] = [];
    const fileArray = Array.from(files);

    for (const f of fileArray) {
      if (!isValidSupportingFile(f)) {
        setError(`"${f.name}" is not supported. Accepted: PDF, DOCX, DOC, TXT.`);
        return;
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`"${f.name}" exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
        return;
      }
      newFiles.push(f);
    }

    setSupportingFiles((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_SUPPORTING_FILES) {
        setError(`Maximum ${MAX_SUPPORTING_FILES} supporting documents allowed.`);
        return prev;
      }
      setError(null);
      return combined;
    });
  }, [isValidSupportingFile]);

  const removeSupportingFile = useCallback((index: number) => {
    setSupportingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSupportDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setSupportDragActive(true);
    } else if (e.type === "dragleave") {
      setSupportDragActive(false);
    }
  }, []);

  const handleSupportDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSupportDragActive(false);

    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 0) {
      addSupportingFiles(dropped);
    }
  }, [addSupportingFiles]);

  const handleSupportingFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      addSupportingFiles(selected);
    }
    // Reset input so same file can be re-selected
    if (e.target) e.target.value = "";
  }, [addSupportingFiles]);

  // Auth guard
  if (_hasHydrated && !isAuthenticated) {
    router.push("/sign-in");
    return null;
  }

  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("form_type", formType);
      if (formNumber.trim()) formData.append("form_number", formNumber.trim());
      if (notes.trim()) formData.append("notes", notes.trim());
      if (reanalyzeId) formData.append("prior_analysis_id", reanalyzeId);

      for (const sf of supportingFiles) {
        formData.append("supporting_files", sf);
      }

      const accessToken = token || localStorage.getItem("access_token");
      const response = await fetch("/api/v1/compliance/analyze", {
        method: "POST",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error (HTTP ${response.status})`);
      }

      const data: ComplianceResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const riskColor = (risk: string) => {
    switch (risk) {
      case "Low":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Medium":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "High":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
      case "medium":
        return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />;
      default:
        return <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
    }
  };

  const severityBorder = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-l-red-400";
      case "medium":
        return "border-l-amber-400";
      default:
        return "border-l-emerald-400";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/consultant"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Compliance</h1>
                <p className="text-sm text-slate-500">USAC document review</p>
              </div>
            </div>
          </div>
          <Link
            href="/compliance/history"
            className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <History className="w-4 h-4" />
            Audit History
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Tab Switcher */}
        <div className="mb-6 flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("review")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "review"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Shield className="w-4 h-4" />
            Document Review
          </button>
          <button
            onClick={() => setActiveTab("bids")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "bids"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Gavel className="w-4 h-4" />
            Bid Analysis
          </button>
        </div>

        {activeTab === "bids" && <BidAnalysis />}

        {activeTab === "review" && (
        <>
        {/* Reanalyze Banner */}
        {reanalyzeId && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                Re-analysis mode — Upload a corrected version of analysis #{reanalyzeId}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Results will show a comparison of resolved, remaining, and new issues.
              </p>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <p className="text-sm text-indigo-800">
            <strong>Advisory tool only.</strong> This AI-powered pre-review identifies potential
            USAC issue risks in your documents before submission. It does not guarantee approval
            or predict USAC decisions. Always consult official USAC guidelines.
          </p>
        </div>

        {/* Form Type Selector */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Form Type
          </label>
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {FORM_TYPES.map((ft) => (
              <option key={ft.value} value={ft.value}>
                {ft.label}
              </option>
            ))}
          </select>
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Form/Application Number <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={formNumber}
              onChange={(e) => setFormNumber(e.target.value)}
              placeholder="e.g., 240012345"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Notes <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context for this review"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Upload Zone */}
        <div className="mb-8">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
              dragActive
                ? "border-indigo-400 bg-indigo-50"
                : file
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50"
            }`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-12 h-12 text-emerald-500" />
                <p className="font-medium text-slate-900">{file.name}</p>
                <p className="text-sm text-slate-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                    setResult(null);
                  }}
                  className="text-sm text-red-500 hover:text-red-700 underline mt-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-12 h-12 text-slate-400" />
                <p className="font-medium text-slate-700">
                  Drop your document PDF here, or click to browse
                </p>
                <p className="text-sm text-slate-500">PDF only, max 10 MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Supporting Documents */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">
              Supporting Documents
            </h3>
            <span className="text-xs text-slate-400">(optional)</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            {SUPPORTING_DOCS_HELP[formType] || SUPPORTING_DOCS_HELP["other"]}.
            Up to {MAX_SUPPORTING_FILES} files, {MAX_FILE_SIZE_MB} MB each. Accepted: PDF, DOCX, DOC, TXT.
          </p>

          <div
            onDragEnter={handleSupportDrag}
            onDragLeave={handleSupportDrag}
            onDragOver={handleSupportDrag}
            onDrop={handleSupportDrop}
            className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
              supportDragActive
                ? "border-indigo-400 bg-indigo-50"
                : supportingFiles.length > 0
                ? "border-slate-200 bg-slate-50"
                : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
            }`}
          >
            {supportingFiles.length > 0 ? (
              <div className="space-y-2">
                {supportingFiles.map((sf, idx) => (
                  <div
                    key={`${sf.name}-${idx}`}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{sf.name}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {(sf.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    <button
                      onClick={() => removeSupportingFile(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      aria-label={`Remove ${sf.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {supportingFiles.length < MAX_SUPPORTING_FILES && (
                  <button
                    onClick={() => supportingInputRef.current?.click()}
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mx-auto mt-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add more
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => supportingInputRef.current?.click()}
                className="flex flex-col items-center gap-1 w-full"
              >
                <Paperclip className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Drop supporting docs here, or click to browse
                </p>
              </button>
            )}
            <input
              ref={supportingInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
              onChange={handleSupportingFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="mb-8 flex justify-center">
          <button
            onClick={handleAnalyze}
            disabled={!file || isAnalyzing}
            className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Analyze Compliance
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
        {result && (
          <div className="space-y-6">
            {/* Saved Banner */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-800">
                  Saved to your audit history
                </p>
                <div className="flex gap-3 mt-1">
                  <Link
                    href="/compliance/history"
                    className="text-xs text-emerald-700 underline hover:text-emerald-900"
                  >
                    View all history
                  </Link>
                  <Link
                    href={`/compliance/history/${result.analysis_id}`}
                    className="text-xs text-emerald-700 underline hover:text-emerald-900"
                  >
                    View this analysis
                  </Link>
                </div>
              </div>
            </div>

            {/* Comparison Block (for re-analysis) */}
            {result.comparison && (
              <div className="bg-white rounded-2xl border border-blue-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-slate-900">
                    Re-Analysis Comparison
                  </h2>
                </div>
                <div className={`p-4 rounded-xl mb-4 ${
                  result.comparison.ready_to_submit
                    ? "bg-emerald-50 border border-emerald-200"
                    : "bg-amber-50 border border-amber-200"
                }`}>
                  <p className={`text-sm font-medium ${
                    result.comparison.ready_to_submit ? "text-emerald-800" : "text-amber-800"
                  }`}>
                    {result.comparison.verdict}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <p className="text-xs font-semibold text-emerald-700 mb-1">
                      Resolved ({result.comparison.resolved_issues.length})
                    </p>
                    {result.comparison.resolved_issues.map((f, i) => (
                      <p key={i} className="text-xs text-emerald-600 truncate">
                        {f.description}
                      </p>
                    ))}
                    {result.comparison.resolved_issues.length === 0 && (
                      <p className="text-xs text-slate-400 italic">None</p>
                    )}
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg">
                    <p className="text-xs font-semibold text-amber-700 mb-1">
                      Remaining ({result.comparison.remaining_issues.length})
                    </p>
                    {result.comparison.remaining_issues.map((f, i) => (
                      <p key={i} className="text-xs text-amber-600 truncate">
                        {f.description}
                      </p>
                    ))}
                    {result.comparison.remaining_issues.length === 0 && (
                      <p className="text-xs text-slate-400 italic">None</p>
                    )}
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-xs font-semibold text-red-700 mb-1">
                      New Issues ({result.comparison.new_issues.length})
                    </p>
                    {result.comparison.new_issues.map((f, i) => (
                      <p key={i} className="text-xs text-red-600 truncate">
                        {f.description}
                      </p>
                    ))}
                    {result.comparison.new_issues.length === 0 && (
                      <p className="text-xs text-slate-400 italic">None</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Overall Risk Badge */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    USAC Issue Risk Assessment
                  </h2>
                  {result.summary && (
                    <p className="text-sm text-slate-600 mt-1">{result.summary}</p>
                  )}
                  {result.engine_version && (
                    <p className="text-xs text-slate-400 mt-1">
                      Rule Engine v{result.engine_version}
                    </p>
                  )}
                </div>
                <span
                  className={`px-4 py-2 rounded-full text-sm font-bold border ${riskColor(
                    result.overall_risk
                  )}`}
                >
                  {result.overall_risk} Risk
                </span>
              </div>
            </div>

            {/* Verified Rule Checks */}
            {result.rule_findings && result.rule_findings.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-md font-semibold text-slate-800">
                    Verified Rule Checks ({result.rule_findings.length})
                  </h3>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                    Deterministic
                  </span>
                </div>
                {result.rule_findings.map((rf, idx) => (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(
                      rf.severity.toLowerCase()
                    )} p-5 shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {rf.rule_id}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            {rf.area}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              rf.severity.toLowerCase() === "high"
                                ? "bg-red-100 text-red-700"
                                : rf.severity.toLowerCase() === "medium"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {rf.severity}
                          </span>
                          <span className="text-xs text-slate-400">
                            {Math.round(rf.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 font-medium mb-2">
                          {rf.description}
                        </p>
                        <p className="text-sm text-slate-600">
                          <strong>Suggestion:</strong> {rf.suggestion}
                        </p>
                        {rf.evidence_snippet && (
                          <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 px-2 py-1 rounded">
                            Evidence: &ldquo;{rf.evidence_snippet}&rdquo;
                          </p>
                        )}
                        {rf.rule_reference && (
                          <p className="text-xs text-indigo-600 mt-2 font-medium flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {rf.rule_reference}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI Analysis */}
            {result.llm_findings && result.llm_findings.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-600" />
                  <h3 className="text-md font-semibold text-slate-800">
                    AI Analysis ({result.llm_findings.length})
                  </h3>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    LLM-derived
                  </span>
                </div>
                {result.llm_findings.map((finding, idx) => (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(
                      finding.severity
                    )} p-5 shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      {severityIcon(finding.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            {finding.area}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              finding.severity === "high"
                                ? "bg-red-100 text-red-700"
                                : finding.severity === "medium"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {finding.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-900 font-medium mb-2">
                          {finding.description}
                        </p>
                        <p className="text-sm text-slate-600">
                          <strong>Suggestion:</strong> {finding.suggestion}
                        </p>
                        {finding.rule_reference && (
                          <p className="text-xs text-indigo-600 mt-2 font-medium">
                            Rule: {finding.rule_reference}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No findings */}
            {(!result.rule_findings || result.rule_findings.length === 0) &&
             (!result.llm_findings || result.llm_findings.length === 0) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-emerald-800 font-medium">
                  No significant compliance issues detected.
                </p>
              </div>
            )}

            {/* Agent Pipeline Trace */}
            {result.agent_trace && result.agent_trace.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setTraceOpen(!traceOpen)}
                  className="w-full px-5 py-4 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
                >
                  {traceOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                  <Activity className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">
                    Agent Pipeline Trace ({result.agent_trace.length} stages)
                  </span>
                </button>
                {traceOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    {result.agent_trace.map((stage, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-800">
                            {stage.stage}
                          </span>
                          <span className="text-xs text-slate-500 font-mono">
                            {stage.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span>{(stage.latency_ms / 1000).toFixed(1)}s</span>
                          <span>{stage.input_tokens + stage.output_tokens} tok</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500 text-center">
                {result.disclaimer || "Advisory only. Not legal or USAC official guidance."}
              </p>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
