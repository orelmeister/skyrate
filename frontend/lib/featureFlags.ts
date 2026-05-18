// perf_v2 client-side feature flag.
// Toggled at build time via NEXT_PUBLIC_PERF_V2_ENABLED.
export const PERF_V2_ENABLED: boolean =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_PERF_V2_ENABLED === "true";
