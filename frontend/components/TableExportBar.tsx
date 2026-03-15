"use client";

interface TableExportBarProps {
  selectedCount: number;
  totalCount: number;
  onExportCsv: () => void;
  onClearSelection?: () => void;
  onSaveLeads?: () => void;
}

export function TableExportBar({
  selectedCount,
  totalCount,
  onExportCsv,
  onClearSelection,
  onSaveLeads,
}: TableExportBarProps) {
  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        {selectedCount > 0 ? (
          <>
            <span className="font-medium text-slate-900">{selectedCount} selected</span>
            {onClearSelection && (
              <button
                onClick={onClearSelection}
                className="text-slate-500 hover:text-slate-700 underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </>
        ) : (
          <span>{totalCount} row{totalCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onSaveLeads && selectedCount > 0 && (
          <button
            onClick={onSaveLeads}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Save to Leads ({selectedCount})
          </button>
        )}
        <button
          onClick={onExportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {selectedCount > 0 ? `Download CSV (${selectedCount})` : 'Download All CSV'}
        </button>
      </div>
    </div>
  );
}
