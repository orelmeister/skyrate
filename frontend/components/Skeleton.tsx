/**
 * Lightweight skeleton-loader primitives.
 * Added 2026-05-11 as part of Phase A4 (loading UX) to smooth the perceived
 * latency of USAC-backed endpoints (vendor dashboard, search, predicted leads,
 * 470 leads, FRN status). Pure Tailwind, no dependencies.
 */
import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/70 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

/** Vertical stack of rectangular rows, mimicking a table or list. */
export function SkeletonRows({
  rows = 6,
  height = "h-12",
  gap = "space-y-2",
}: {
  rows?: number;
  height?: string;
  gap?: string;
}) {
  return (
    <div className={gap} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${height}`} />
      ))}
    </div>
  );
}

/** Table-shaped skeleton with a thicker header row. */
export function SkeletonTable({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div
      className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="grid gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50"
           style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 w-3/4" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-3 px-4 py-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-4" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard stat-card skeleton. */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
