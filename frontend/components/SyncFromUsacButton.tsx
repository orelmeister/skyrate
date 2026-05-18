"use client";

/**
 * SyncFromUsacButton — perf_v2 manual refresh button for the consultant portal.
 *
 * Calls POST /v1/consultant/sync-usac to enqueue a background hydration
 * of the per-user USAC cache, then polls /sync-usac/{job_id} until done.
 * The user can keep working — the page does NOT block on completion.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
  /** Called after the sync finishes successfully so callers can reload data. */
  onComplete?: () => void;
  /** Optional className overrides for parent layout integration. */
  className?: string;
}

type JobStatus = "idle" | "pending" | "running" | "succeeded" | "failed";

export default function SyncFromUsacButton({ onComplete, className }: Props) {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleClick = useCallback(async () => {
    setError(null);
    setStatus("pending");
    try {
      const res = await api.syncUsacCache();
      if (!res.success || !res.data?.job_id) {
        throw new Error(res.error || "Failed to start sync");
      }
      const jobId = res.data.job_id;
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.getSyncUsacStatus(jobId);
          if (r.success && r.data) {
            const s = r.data.status as JobStatus;
            setStatus(s);
            if (s === "succeeded") {
              stopPolling();
              onComplete?.();
            } else if (s === "failed") {
              stopPolling();
              setError(r.data.error || "Sync failed");
            }
          }
        } catch (e: any) {
          stopPolling();
          setError(e?.message || "Sync poll failed");
          setStatus("failed");
        }
      }, 1500);
    } catch (e: any) {
      setStatus("failed");
      setError(e?.message || "Failed to start sync");
    }
  }, [onComplete, stopPolling]);

  const busy = status === "pending" || status === "running";
  const label =
    status === "pending"
      ? "Starting sync…"
      : status === "running"
      ? "Syncing from USAC…"
      : status === "succeeded"
      ? "Sync complete"
      : status === "failed"
      ? "Retry sync"
      : "Sync from USAC";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
          busy
            ? "bg-slate-100 text-slate-500 border-slate-200 cursor-wait"
            : status === "failed"
            ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
        }`}
        aria-busy={busy}
      >
        {busy && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        {label}
      </button>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
