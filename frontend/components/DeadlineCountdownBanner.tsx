"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Phase 2: Dismissible countdown banner shown above the homepage header.
// Surfaces the soonest upcoming E-Rate filing milestone. We pick the next
// future date from a hardcoded list so the bar gracefully self-retires when
// a deadline passes.

type Milestone = { label: string; iso: string; cta: string };

// Order matters: we pick the first one that is still in the future.
const MILESTONES: Milestone[] = [
  // FY2026 wave window — last applicants still amending
  { label: "FY2026 invoicing deadline (BEAR/SPI)", iso: "2026-10-28T23:59:00-05:00", cta: "Stay invoice-ready" },
  // FY2027 cycle
  { label: "FY2027 Form 470 latest recommended date", iso: "2027-02-01T23:59:00-05:00", cta: "Plan FY2027 procurement" },
  { label: "FY2027 Form 471 filing window closes", iso: "2027-03-26T23:59:00-04:00", cta: "Don't miss the window" },
];

const STORAGE_KEY = "skyrate-deadline-banner-dismissed-v1";

function pickActiveMilestone(now: Date): Milestone | null {
  const future = MILESTONES.filter((m) => new Date(m.iso).getTime() > now.getTime());
  return future[0] || null;
}

function formatRemaining(targetMs: number, nowMs: number): string {
  let diff = Math.max(0, targetMs - nowMs);
  const days = Math.floor(diff / 86_400_000);
  diff -= days * 86_400_000;
  const hours = Math.floor(diff / 3_600_000);
  diff -= hours * 3_600_000;
  const minutes = Math.floor(diff / 60_000);
  return `${days}d ${hours}h ${minutes}m`;
}

export default function DeadlineCountdownBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      setDismissed(v === "1");
    } catch {
      setDismissed(false);
    }
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (dismissed || !now) return null;
  const active = pickActiveMilestone(now);
  if (!active) return null;

  const target = new Date(active.iso);
  const remaining = formatRemaining(target.getTime(), now.getTime());

  return (
    <div
      role="status"
      aria-label="E-Rate deadline countdown"
      data-testid="deadline-countdown-banner"
      className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-700 text-white text-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
          <span className="font-semibold truncate">{active.label}</span>
          <span className="hidden sm:inline text-purple-100">·</span>
          <span className="font-mono text-white/90">{remaining}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-up?source=deadline-banner"
            className="hidden sm:inline-block px-3 py-1 bg-white/15 hover:bg-white/25 rounded-md font-medium transition"
          >
            See What&apos;s Due →
          </Link>
          <button
            type="button"
            aria-label="Dismiss banner"
            className="text-white/70 hover:text-white text-lg leading-none"
            onClick={() => {
              try {
                window.localStorage.setItem(STORAGE_KEY, "1");
              } catch {
                /* ignore */
              }
              setDismissed(true);
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
