# perf_v2 single-shot — implementation status

**Branch:** `perf/v2-single-shot` (pushed; 3 commits ahead of `main`)
**Backups:** `_backups/skylimi5_skyrate_pre_perfv2_20260518_092017.sql` (58 MB)

## ✅ Complete (in branch, NOT yet merged to main)

| Step | Description | Commit |
|---|---|---|
| 1 | Alembic migration + ORM models for `user_usac_cache` + `usac_sync_jobs` | 5b64d4c |
| 2 | `UsacHydrationService` — pre-computes schools / dashboard-stats / crns payloads | 5b64d4c |
| 3 | Cache-first reads on `/crns`, `/schools`, `/dashboard-stats` + `/sync-usac` endpoints + signup/login background hooks | 5b64d4c |
| 4 | `admin_jobs` router: nightly-refresh, backfill, last-run, perf-summary (X-Job-Token gated) | 5b64d4c + 0a6f25f |
| 5 | `lib/featureFlags.ts` (`PERF_V2_ENABLED`) + API helpers `syncUsacCache` / `getSyncUsacStatus` | 55e88ce |
| 6 | Flag-gated flash suppression on `/consultant` and `/vendor` + reusable `SyncFromUsacButton` | 55e88ce |
| 7 | `.env.example` updates for `PERF_V2_ENABLED`, `NIGHTLY_JOB_TOKEN`, `NEXT_PUBLIC_PERF_V2_ENABLED` | 0a6f25f |
| 8 | `PerfTimingMiddleware` + `perf_metrics` ring buffer + `GET /v1/admin/jobs/perf-summary` | 0a6f25f |
| 9 | `tests/perf/perf_audit.py` Playwright harness + README | 0a6f25f |

## 🔲 Remaining ops actions (cannot be done autonomously)

### Step 10 — Deploy + flag flip
1. **Generate `NIGHTLY_JOB_TOKEN`** locally:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
2. **DigitalOcean App `8f201fb9` env vars** (Settings → Components → backend → Environment Variables):
   - `PERF_V2_ENABLED=false`  *(start OFF — code is identical until flipped)*
   - `NIGHTLY_JOB_TOKEN=<paste from step 1>` *(mark as Secret)*
   - `NEXT_PUBLIC_PERF_V2_ENABLED=false` on the frontend component
3. **Merge to main**:
   ```powershell
   cd skyrate.ai; git checkout main; git merge --ff-only perf/v2-single-shot; git push origin main
   ```
4. **Wait for DO deploy** (~5 min). Alembic upgrade runs on boot — new tables appear.
5. **Verify** `curl https://api.skyrate.ai/v1/admin/jobs/usac-nightly-refresh/last-run -H "X-Job-Token: $TOKEN"` returns 200 (empty stats).
6. **Seed cache** (no user-visible effect):
   ```bash
   curl -X POST "https://api.skyrate.ai/v1/admin/jobs/usac-backfill/run?only_missing=true" \
        -H "X-Job-Token: $NIGHTLY_JOB_TOKEN"
   ```
   Poll `/last-run` until `users_succeeded == users_total`.
7. **Capture baseline**:
   ```powershell
   pip install playwright httpx; playwright install chromium
   python tests/perf/perf_audit.py --base-url https://skyrate.ai `
     --api-base https://api.skyrate.ai `
     --email "<test_user>" --password "<pwd>" `
     --job-token "$env:NIGHTLY_JOB_TOKEN" --out tests/perf/before.json
   ```
8. **Flip flags** in DO console: `PERF_V2_ENABLED=true`, `NEXT_PUBLIC_PERF_V2_ENABLED=true` → triggers rebuild.
9. **Capture after**:
   ```powershell
   python tests/perf/perf_audit.py ... --out tests/perf/after.json --assert-thresholds
   ```
10. **Google Cloud Scheduler** job: daily 07:00 UTC, HTTP POST `https://api.skyrate.ai/v1/admin/jobs/usac-nightly-refresh`, header `X-Job-Token: <token>`.
11. **Playwright MCP** smoke test (per claude.md Rule 12) on `https://skyrate.ai/consultant` — confirm no "Verifying your subscription..." flash; screenshot.

### Step 11 — Audit report
Generate `PERFORMANCE_AUDIT_RESULTS.html` with before vs after table, p95 deltas, cache-hit ratio, flash-count delta, rollback drill (flip `PERF_V2_ENABLED` to false → verify portal reverts to live path).

## Rollback
- **Code:** revert the three commits (5b64d4c, 55e88ce, 0a6f25f) — alembic `downgrade` exists in `e0f1a2b3c4d5_perf_v2_user_usac_cache_and_sync_jobs.py`.
- **Live:** flip `PERF_V2_ENABLED=false` in DO env → backend immediately reverts to live USAC reads (no rebuild needed; settings reload per-request via `get_settings()`). Frontend rebuild needed to restore the loading spinners; flag-OFF code path is identical to today's UI.

## Notes
- Backend default flag is `False`; merging to main is safe and zero-risk.
- Hostinger MySQL is the system of record. The backup at `_backups/skylimi5_skyrate_pre_perfv2_20260518_092017.sql` predates any schema change.
- All new endpoints under `/v1/admin/jobs/*` refuse to operate when `NIGHTLY_JOB_TOKEN` is empty (return 503).
