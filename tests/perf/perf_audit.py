"""perf_v2 audit harness — measure cold sign-in + portal navigation timings.

Usage
-----
    # Capture baseline BEFORE flipping PERF_V2_ENABLED on:
    python tests/perf/perf_audit.py --base-url https://skyrate.ai \\
        --api-base https://api.skyrate.ai \\
        --email tester@skyrate.ai --password '<password>' \\
        --job-token "$NIGHTLY_JOB_TOKEN" \\
        --out tests/perf/before.json

    # AFTER flipping the flag on and rebuilding the frontend:
    python tests/perf/perf_audit.py ... --out tests/perf/after.json

Notes
-----
* Requires ``playwright`` installed. Run ``playwright install chromium`` once.
* The script captures cold sign-in (no browser state), warm re-navigation,
  and per-endpoint timings from the perf-summary admin endpoint.
* No production data is mutated. The test account must already exist with an
  active subscription so the portal does NOT redirect to /subscribe.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import httpx  # type: ignore
    from playwright.async_api import async_playwright  # type: ignore
except ImportError as exc:  # pragma: no cover
    sys.stderr.write(
        "[FAIL] missing dependency: %s. Install with:\n"
        "  pip install playwright httpx && playwright install chromium\n" % exc
    )
    sys.exit(2)


# ---------- helpers ----------------------------------------------------------

def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round(pct / 100.0 * (len(s) - 1)))))
    return s[k]


def _aggregate(samples: List[float]) -> Dict[str, float]:
    if not samples:
        return {"count": 0}
    return {
        "count": len(samples),
        "min_ms": round(min(samples), 1),
        "p50_ms": round(statistics.median(samples), 1),
        "p95_ms": round(_percentile(samples, 95), 1),
        "p99_ms": round(_percentile(samples, 99), 1),
        "max_ms": round(max(samples), 1),
        "avg_ms": round(sum(samples) / len(samples), 1),
    }


# ---------- audit ------------------------------------------------------------

async def measure_cold_signin(
    base_url: str,
    email: str,
    password: str,
    runs: int,
    portal_path: str = "/consultant",
) -> Dict[str, Any]:
    """Open a fresh browser context, sign in, measure time-to-portal-interactive.

    "Interactive" = the URL is the portal path AND the document is no longer
    showing the 'Verifying your subscription' / 'Loading your dashboard'
    full-screen flashes.
    """
    timings_to_interactive_ms: List[float] = []
    flash_seen_counts: List[int] = []

    async with async_playwright() as pw:
        for i in range(runs):
            browser = await pw.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            flash_count = 0

            async def _flash_probe() -> None:
                # Poll body text quickly for the flash strings while
                # navigation runs in parallel. We count appearances so the
                # before-vs-after delta reflects the UX improvement.
                nonlocal flash_count
                deadline = time.perf_counter() + 25.0
                try:
                    while time.perf_counter() < deadline:
                        try:
                            text = await page.inner_text("body", timeout=250)
                            if (
                                "Verifying your subscription" in text
                                or "Loading your dashboard" in text
                            ):
                                flash_count += 1
                                await asyncio.sleep(0.05)
                                continue
                            if portal_path.strip("/") and page.url.endswith(portal_path):
                                return
                        except Exception:
                            pass
                        await asyncio.sleep(0.1)
                except asyncio.CancelledError:
                    return

            probe_task = None
            try:
                start = time.perf_counter()
                await page.goto(f"{base_url}/sign-in", wait_until="networkidle")
                # Wait for React to hydrate the form
                await page.wait_for_selector('button[type="submit"]:not([disabled])', timeout=10_000)
                await page.fill('input[type="email"]', email)
                await page.fill('input[type="password"]', password)
                # Kick off flash probe in parallel.
                probe_task = asyncio.create_task(_flash_probe())
                # Submit via Enter key on password field (form onSubmit handler)
                await page.press('input[type="password"]', "Enter")

                # Wait until URL matches portal AND no flash text is visible.
                await page.wait_for_url(f"**{portal_path}*", timeout=25_000)
                await page.wait_for_function(
                    """() => {
                        const t = document.body && document.body.innerText || '';
                        return !t.includes('Verifying your subscription') &&
                               !t.includes('Loading your dashboard');
                    }""",
                    timeout=25_000,
                )
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                timings_to_interactive_ms.append(elapsed_ms)
            except Exception as exc:
                sys.stderr.write(f"[WARN] cold-signin run {i+1} failed: {type(exc).__name__}: {str(exc)[:200]}\n")
                try:
                    sys.stderr.write(f"[WARN] final url: {page.url}\n")
                except Exception:
                    pass
            finally:
                if probe_task is not None:
                    probe_task.cancel()
                    try:
                        await asyncio.wait_for(probe_task, timeout=1.0)
                    except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                        pass
                flash_seen_counts.append(flash_count)
                try:
                    await context.close()
                except Exception:
                    pass
                try:
                    await browser.close()
                except Exception:
                    pass

    return {
        "runs": runs,
        "time_to_interactive_ms": _aggregate(timings_to_interactive_ms),
        "flash_seen_per_run": {
            "avg": round(sum(flash_seen_counts) / max(1, len(flash_seen_counts)), 1),
            "max": max(flash_seen_counts) if flash_seen_counts else 0,
            "samples": flash_seen_counts,
        },
    }


async def measure_warm_renav(
    base_url: str,
    email: str,
    password: str,
    runs: int,
    portal_path: str = "/consultant",
) -> Dict[str, Any]:
    """Sign in once, then measure time-to-interactive on subsequent navs."""
    timings_ms: List[float] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(f"{base_url}/sign-in", wait_until="networkidle")
        await page.wait_for_selector('button[type="submit"]:not([disabled])', timeout=10_000)
        await page.fill('input[type="email"]', email)
        await page.fill('input[type="password"]', password)
        await page.click('button[type="submit"]')
        await page.wait_for_url(f"**{portal_path}*", timeout=20_000)

        for _ in range(runs):
            await page.goto(f"{base_url}/", wait_until="domcontentloaded")
            start = time.perf_counter()
            await page.goto(f"{base_url}{portal_path}", wait_until="domcontentloaded")
            try:
                await page.wait_for_function(
                    """() => {
                        const t = document.body && document.body.innerText || '';
                        return !t.includes('Verifying your subscription') &&
                               !t.includes('Loading your dashboard');
                    }""",
                    timeout=15_000,
                )
                timings_ms.append((time.perf_counter() - start) * 1000.0)
            except Exception as exc:
                sys.stderr.write(f"[WARN] warm renav failed: {exc}\n")
        await context.close()
        await browser.close()

    return {"runs": runs, "time_to_interactive_ms": _aggregate(timings_ms)}


def fetch_backend_perf_summary(api_base: str, job_token: str) -> Dict[str, Any]:
    """Pull p50/p95/p99 + cache_hit_ratio from the server's in-memory ring."""
    url = api_base.rstrip("/") + "/v1/admin/jobs/perf-summary"
    try:
        r = httpx.get(url, headers={"X-Job-Token": job_token}, timeout=30.0)
        if r.status_code != 200:
            return {"error": f"HTTP {r.status_code}", "body": r.text[:500]}
        return r.json().get("summary", {})
    except Exception as exc:
        return {"error": str(exc)}


# ---------- main -------------------------------------------------------------

async def _amain(args: argparse.Namespace) -> int:
    print(f"[INFO] cold sign-in x{args.runs} ...")
    cold = await measure_cold_signin(
        args.base_url, args.email, args.password, args.runs, args.portal_path
    )
    print(f"[INFO] warm re-nav x{args.runs} ...")
    warm = await measure_warm_renav(
        args.base_url, args.email, args.password, args.runs, args.portal_path
    )
    backend = (
        fetch_backend_perf_summary(args.api_base, args.job_token)
        if args.job_token
        else None
    )

    report = {
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": args.base_url,
        "api_base": args.api_base,
        "portal_path": args.portal_path,
        "runs": args.runs,
        "cold_signin": cold,
        "warm_renav": warm,
        "backend_summary": backend,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(f"[OK] wrote {out_path}")

    # Pass/fail thresholds per the perf_v2 plan.
    cold_p95 = cold.get("time_to_interactive_ms", {}).get("p95_ms", 0)
    warm_p95 = warm.get("time_to_interactive_ms", {}).get("p95_ms", 0)
    print(f"[RES] cold p95 = {cold_p95} ms   warm p95 = {warm_p95} ms")
    if args.assert_thresholds:
        ok = cold_p95 <= args.cold_threshold and warm_p95 <= args.warm_threshold
        if not ok:
            print(
                f"[FAIL] thresholds: cold<={args.cold_threshold}ms warm<={args.warm_threshold}ms"
            )
            return 1
        print("[PASS] thresholds met")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="perf_v2 audit harness")
    p.add_argument("--base-url", required=True, help="e.g. https://skyrate.ai")
    p.add_argument("--api-base", required=True, help="e.g. https://api.skyrate.ai")
    p.add_argument("--email", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--portal-path", default="/consultant")
    p.add_argument("--runs", type=int, default=5)
    p.add_argument("--job-token", default=None, help="X-Job-Token for backend summary")
    p.add_argument("--out", required=True, help="output JSON path")
    p.add_argument("--assert-thresholds", action="store_true")
    p.add_argument("--cold-threshold", type=float, default=3000.0)
    p.add_argument("--warm-threshold", type=float, default=800.0)
    args = p.parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    raise SystemExit(main())
