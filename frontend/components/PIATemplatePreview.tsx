"use client";

import { useState } from "react";
import { PIAPreview } from "@/lib/api";
import { ChevronDown, ChevronUp, X, FileText, AlertCircle, BookOpen } from "lucide-react";

interface PIATemplatePreviewProps {
  preview: PIAPreview;
  onClose: () => void;
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "text-red-700 bg-red-50 border-red-200";
    case "high":
      return "text-amber-700 bg-amber-50 border-amber-200";
    default:
      return "text-slate-700 bg-slate-50 border-slate-200";
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function PIATemplatePreview({ preview, onClose }: PIATemplatePreviewProps) {
  const [showMistakes, setShowMistakes] = useState(false);
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="animate-in fade-in duration-300 bg-white rounded-2xl border border-teal-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4 border-b border-teal-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Category Preview</h3>
            <p className="text-xs text-teal-700 font-medium">{preview.category_name}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-teal-100 text-slate-500 hover:text-slate-700 transition-colors"
          aria-label="Close preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* What PIA is looking for */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">What PIA is looking for</h4>
          <p className="text-sm text-slate-600 leading-relaxed">{preview.what_pia_is_looking_for}</p>
        </div>

        {/* Key points */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Key points to address</h4>
          <ul className="space-y-1.5">
            {preview.key_points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Document checklist */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            Required documents
          </h4>
          <div className="space-y-2">
            {preview.document_checklist.map((doc, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg border ${priorityColor(doc.priority)}`}
              >
                <div className="shrink-0 mt-0.5">
                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase rounded ${priorityBadge(doc.priority)}`}>
                    {doc.priority}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{doc.name}</p>
                  <p className="text-xs opacity-80">{doc.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Common mistakes (collapsed) */}
        {preview.common_mistakes.length > 0 && (
          <div>
            <button
              onClick={() => setShowMistakes(!showMistakes)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-teal-700 transition-colors"
            >
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Common mistakes to avoid
              {showMistakes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showMistakes && (
              <ul className="mt-2 space-y-1.5 pl-6">
                {preview.common_mistakes.map((mistake, idx) => (
                  <li key={idx} className="text-sm text-slate-600 list-disc">{mistake}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Relevant rules (collapsed) */}
        {preview.relevant_rules.length > 0 && (
          <div>
            <button
              onClick={() => setShowRules(!showRules)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-teal-700 transition-colors"
            >
              <BookOpen className="w-4 h-4 text-slate-500" />
              Relevant rules
              {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showRules && (
              <ul className="mt-2 space-y-1 pl-6">
                {preview.relevant_rules.map((rule, idx) => (
                  <li key={idx} className="text-xs text-slate-500 list-disc">{rule}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
