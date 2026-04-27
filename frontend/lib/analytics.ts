/**
 * Lightweight analytics helper for SkyRate AI (skyrate.ai).
 *
 * GTM (GTM-MRT2V6HZ) and GA4 (G-JQB71M4FN5) are wired in app/layout.tsx
 * via @next/third-parties — this helper just pushes structured events to
 * `window.dataLayer` so GTM tags can pick them up. It also calls
 * `window.gtag` directly for GA4 redundancy.
 *
 * Use anywhere on the client:
 *   import { trackEvent } from "@/lib/analytics";
 *   trackEvent("frn_lookup_submit", { frn });
 */

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

export type SkyRateEvent =
  | "frn_lookup_submit"
  | "frn_lookup_result"
  | "frn_urgent_help_shown"
  | "frn_urgent_help_cta_click"
  | "frn_alert_capture_submit"
  | "lead_capture_submit"
  | "roi_calculator_complete"
  | "signup_start"
  | "signup_complete"
  | "audience_chip_click"
  | "demo_viewed"
  | "case_study_viewed";

export function trackEvent(
  event: SkyRateEvent | string,
  params: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
    if (typeof window.gtag === "function") {
      window.gtag("event", event, params);
    }
  } catch {
    // never let analytics break the page
  }
}
