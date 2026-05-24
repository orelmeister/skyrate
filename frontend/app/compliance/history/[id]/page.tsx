"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import {
  Shield, ArrowLeft, FileText, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, ExternalLink, Brain, ShieldCheck
} from "lucide-react";

interface ComplianceFinding {
  severity: string;
  area: string;
  description: string;
  suggestion: string;
  rule_reference?: string | null;
  source?: string;
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
  evidence_snippet?: string | null;
}

interface ComparisonResult {
  resolved_issues: ComplianceFinding[];
  remaining_issues: ComplianceFinding[];
  new_issues: ComplianceFinding[];
  ready_to_submit: boolean;
  verdict: string;
}

interface AnalysisDetail {
  id: number;
  form_type: string;
  form_number: string | null;
  overall_risk: string;
  summary: string | null;
  primary_filename: string;
  supporting_filenames: string[] | null;
  result_json: {
    findings?: ComplianceFinding[];
    rule_findings?: RuleFinding[];
    llm_findings?: ComplianceFinding[];
    comparison?: ComparisonResult;
    engine_version?: string;
  } | null;
  engine_version: string | null;
  notes: string | null;
  prior_analysis_id: number | null;
  created_at: string;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  "470": "Form 470 - Competitive Bidding",
  "471": "Form 471 - Funding Request",
  "472": "Form 472 - BEAR",
  "474": "Form 474 - SPI",
  "486": "Form 486 - Receipt of Service",
  "500": "Form 500 - Commitment Adjustment",
  "498": "Form 498 - Service Provider Info",
  "other": "Other USAC Document",
};

export default function ComplianceHistoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, token, _hasHydrated } = useAuthStore();
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const analysisId = params.id as string;

  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !token || !analysisId) return;
    fetchDetail();
  }, [_hasHydrated, isAuthenticated, token, analysisId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const accessToken = token || localStorage.getItem("access_token");
      const res = await fetch(`/api/v1/compliance/history/${analysisId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error("Analysis not found");
      }
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  if (_hasHydrated && !isAuthenticated) {
    router.push("/sign-in");
    return null;
  }

  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Not found"}</p>
          <Link href="/compliance/history" className="text-indigo-600 underline">
            Back to history
          </Link>
        </div>
      </div>
    );
  }

  const riskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "High": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-amber-100 text-amber-800 border-amber-200";
    }
  };

  const severityBorder = (s: string) => {
    switch (s?.toLowerCase()) {
      case "high": return "border-l-red-400";
      case "medium": return "border-l-amber-400";
      default: return "border-l-emerald-400";
    }
  };

  const findings = detail.result_json?.findings || [];
  const ruleFindingsRaw = detail.result_json?.rule_findings || [];
  const llmFindings = detail.result_json?.llm_findings || [];
  const comparison = detail.result_json?.comparison;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/compliance/history"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Analysis #{detail.id}</h1>
              <p className="text-sm text-slate-500">
                {FORM_TYPE_LABELS[detail.form_type] || detail.form_type}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Meta info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className={`px-3 py-1 rounded-full text-sm font-bold border ${riskColor(detail.overall_risk)}`}>
                {detail.overall_risk} Risk
              </span>
            </div>
            <Link
              href={`/compliance?reanalyze=${detail.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Upload Corrected Version
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">File</p>
              <p className="font-medium text-slate-800 truncate">{detail.primary_filename}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Form Number</p>
              <p className="font-medium text-slate-800">{detail.form_number || "N/A"}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Date</p>
              <p className="font-medium text-slate-800">
                {new Date(detail.created_at).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Engine</p>
              <p className="font-medium text-slate-800">v{detail.engine_version || "N/A"}</p>
            </div>
          </div>

          {detail.supporting_filenames && detail.supporting_filenames.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Supporting Documents:</p>
              <div className="flex flex-wrap gap-2">
                {detail.supporting_filenames.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600">
                    <FileText className="w-3 h-3" /> {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {detail.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Notes:</p>
              <p className="text-sm text-slate-700">{detail.notes}</p>
            </div>
          )}

          {detail.summary && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-700">{detail.summary}</p>
            </div>
          )}

          {detail.prior_analysis_id && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Re-analysis of{" "}
                <Link href={`/compliance/history/${detail.prior_analysis_id}`} className="text-indigo-600 underline">
                  Analysis #{detail.prior_analysis_id}
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Comparison */}
        {comparison && (
          <div className="bg-white rounded-2xl border border-blue-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900">Comparison vs Prior</h2>
            </div>
            <div className={`p-4 rounded-xl mb-4 ${
              comparison.ready_to_submit ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
            }`}>
              <p className={`text-sm font-medium ${comparison.ready_to_submit ? "text-emerald-800" : "text-amber-800"}`}>
                {comparison.verdict}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700 mb-2">Resolved ({comparison.resolved_issues.length})</p>
                {comparison.resolved_issues.map((f, i) => (
                  <p key={i} className="text-xs text-emerald-600 mb-1">{f.description}</p>
                ))}
                {comparison.resolved_issues.length === 0 && <p className="text-xs text-slate-400 italic">None</p>}
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 mb-2">Remaining ({comparison.remaining_issues.length})</p>
                {comparison.remaining_issues.map((f, i) => (
                  <p key={i} className="text-xs text-amber-600 mb-1">{f.description}</p>
                ))}
                {comparison.remaining_issues.length === 0 && <p className="text-xs text-slate-400 italic">None</p>}
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs font-semibold text-red-700 mb-2">New Issues ({comparison.new_issues.length})</p>
                {comparison.new_issues.map((f, i) => (
                  <p key={i} className="text-xs text-red-600 mb-1">{f.description}</p>
                ))}
                {comparison.new_issues.length === 0 && <p className="text-xs text-slate-400 italic">None</p>}
              </div>
            </div>
          </div>
        )}

        {/* Rule Findings */}
        {ruleFindingsRaw.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-slate-800">Rule Findings ({ruleFindingsRaw.length})</h3>
            </div>
            {ruleFindingsRaw.map((rf, idx) => (
              <div key={idx} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(rf.severity)} p-4 shadow-sm`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{rf.rule_id}</span>
                  <span className="text-xs font-bold uppercase text-slate-500">{rf.area}</span>
                </div>
                <p className="text-sm text-slate-900 font-medium">{rf.description}</p>
                <p className="text-sm text-slate-600 mt-1"><strong>Fix:</strong> {rf.suggestion}</p>
                {rf.rule_reference && (
                  <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> {rf.rule_reference}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* LLM Findings */}
        {llmFindings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-slate-800">AI Findings ({llmFindings.length})</h3>
            </div>
            {llmFindings.map((f, idx) => (
              <div key={idx} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${severityBorder(f.severity)} p-4 shadow-sm`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase text-slate-500">{f.area}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    f.severity === "high" ? "bg-red-100 text-red-700"
                    : f.severity === "medium" ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                  }`}>{f.severity}</span>
                </div>
                <p className="text-sm text-slate-900 font-medium">{f.description}</p>
                <p className="text-sm text-slate-600 mt-1"><strong>Fix:</strong> {f.suggestion}</p>
              </div>
            ))}
          </div>
        )}

        {/* No findings */}
        {ruleFindingsRaw.length === 0 && llmFindings.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-emerald-800 font-medium">No compliance issues found.</p>
          </div>
        )}

        {/* Disclaimer */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-xs text-slate-500 text-center">
            Advisory only. Not legal or USAC official guidance.
          </p>
        </div>
      </div>
    </div>
  );
}
