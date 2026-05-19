"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { Shield, Upload, AlertTriangle, CheckCircle, XCircle, FileText, ArrowLeft } from "lucide-react";

// ==================== TYPES ====================

interface ComplianceFinding {
  severity: "low" | "medium" | "high";
  area: string;
  description: string;
  suggestion: string;
  rule_reference: string | null;
}

interface ComplianceResult {
  overall_risk: "Low" | "Medium" | "High";
  summary: string | null;
  findings: ComplianceFinding[];
}

// ==================== COMPONENT ====================

export default function CompliancePage() {
  const router = useRouter();
  const { user, isAuthenticated, token, _hasHydrated } = useAuthStore();

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const accessToken = token || localStorage.getItem("access_token");
      const response = await fetch("/api/v1/compliance/form470/analyze", {
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
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
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
              <h1 className="text-xl font-bold text-slate-900">
                Compliance — Form 470 Pre-Review
              </h1>
              <p className="text-sm text-slate-500">Beta</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Disclaimer */}
        <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <p className="text-sm text-indigo-800">
            <strong>Advisory tool only.</strong> This AI-powered pre-review identifies potential
            USAC issue risks in your Form 470 before submission. It does not guarantee approval
            or predict USAC decisions. Always consult official USAC guidelines.
          </p>
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
                  Drop your Form 470 PDF here, or click to browse
                </p>
                <p className="text-sm text-slate-500">PDF only, max 10 MB</p>
              </div>
            )}
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

            {/* Findings */}
            {result.findings.length > 0 ? (
              <div className="space-y-4">
                <h3 className="text-md font-semibold text-slate-800">
                  Findings ({result.findings.length})
                </h3>
                {result.findings.map((finding, idx) => (
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
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-emerald-800 font-medium">
                  No significant compliance issues detected.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
