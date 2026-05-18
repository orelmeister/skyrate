# perf_v2 audit harness

Captures cold sign-in and warm re-nav timings against the production frontend
plus the in-memory backend perf summary (`/v1/admin/jobs/perf-summary`).

## Run

```powershell
# One-time
pip install playwright httpx
playwright install chromium

# Baseline (BEFORE flipping PERF_V2_ENABLED on)
python tests/perf/perf_audit.py `
  --base-url https://skyrate.ai `
  --api-base https://api.skyrate.ai `
  --email "tester@skyrate.ai" `
  --password "<password>" `
  --job-token "$env:NIGHTLY_JOB_TOKEN" `
  --out tests/perf/before.json

# After flag flip + rebuild + cache backfill
python tests/perf/perf_audit.py ... --out tests/perf/after.json --assert-thresholds
```

Outputs `before.json` / `after.json`, used by the final
`PERFORMANCE_AUDIT_RESULTS.html` report.

## Thresholds (from the perf_v2 plan)
| Metric | Threshold |
|---|---|
| Cold sign-in p95 time-to-interactive | <= 3000 ms |
| Warm re-nav p95 time-to-interactive | <= 800 ms |
| "Verifying your subscription" / "Loading your dashboard" flash count per cold run | 0 |
