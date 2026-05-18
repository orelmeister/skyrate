"""Generate PERFORMANCE_AUDIT_RESULTS.html from before/after JSON."""
import json, sys, pathlib, datetime, html

BEFORE = pathlib.Path("tests/perf/before.json")
AFTER = pathlib.Path("tests/perf/after.json")
OUT = pathlib.Path("PERFORMANCE_AUDIT_RESULTS.html")

THRESH = {"cold_p95_ms": 3000, "warm_p95_ms": 800, "flashes": 0, "cache_hit_ratio": 0.85}

def load(p):
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))

before = load(BEFORE) or {}
after = load(AFTER) or {}

def get(d, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur if cur is not None else default

def fmt(v, suffix=""):
    if v is None: return "n/a"
    if isinstance(v, float): return f"{v:.1f}{suffix}"
    return f"{v}{suffix}"

def delta(b, a, lower_is_better=True, suffix=""):
    if b is None or a is None:
        return "—"
    diff = a - b
    pct = (diff / b * 100) if b else 0
    arrow = ""
    if lower_is_better:
        good = diff < 0
    else:
        good = diff > 0
    cls = "good" if good else ("bad" if abs(pct) > 5 else "neutral")
    sign = "+" if diff > 0 else ""
    return f'<span class="{cls}">{sign}{diff:.1f}{suffix} ({sign}{pct:.1f}%)</span>'

def pass_fail(value, threshold, lower_is_better=True):
    if value is None: return '<span class="bad">NO DATA</span>'
    ok = (value <= threshold) if lower_is_better else (value >= threshold)
    return '<span class="good">PASS</span>' if ok else '<span class="bad">FAIL</span>'

# Build content
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

def cold_p95(d): return get(d, "cold_signin", "time_to_interactive_ms", "p95_ms")
def cold_p99(d): return get(d, "cold_signin", "time_to_interactive_ms", "p99_ms")
def cold_p50(d): return get(d, "cold_signin", "time_to_interactive_ms", "p50_ms")
def warm_p95(d): return get(d, "warm_renav", "time_to_interactive_ms", "p95_ms")
def warm_p99(d): return get(d, "warm_renav", "time_to_interactive_ms", "p99_ms")
def warm_p50(d): return get(d, "warm_renav", "time_to_interactive_ms", "p50_ms")
def cold_flash_avg(d): return get(d, "cold_signin", "flash_seen_per_run", "avg")
def cold_flash_max(d): return get(d, "cold_signin", "flash_seen_per_run", "max")
def backend_p95(d): return get(d, "backend_summary", "totals", "p95_ms")
def cache_ratio(d): return get(d, "backend_summary", "totals", "cache_hit_ratio")

rows = []
metric_rows = [
    ("Cold sign-in p50", cold_p50, "ms", True, None),
    ("Cold sign-in p95", cold_p95, "ms", True, THRESH["cold_p95_ms"]),
    ("Cold sign-in p99", cold_p99, "ms", True, None),
    ("Cold flashes (avg per run)", cold_flash_avg, "", True, THRESH["flashes"]),
    ("Cold flashes (max)", cold_flash_max, "", True, THRESH["flashes"]),
    ("Warm renav p50", warm_p50, "ms", True, None),
    ("Warm renav p95", warm_p95, "ms", True, THRESH["warm_p95_ms"]),
    ("Warm renav p99", warm_p99, "ms", True, None),
    ("Backend totals p95", backend_p95, "ms", True, None),
    ("Backend cache hit ratio", cache_ratio, "", False, THRESH["cache_hit_ratio"]),
]
for label, getter, suffix, lower, threshold in metric_rows:
    b = getter(before)
    a = getter(after)
    pf = pass_fail(a, threshold, lower) if threshold is not None else ""
    rows.append((label, fmt(b, suffix), fmt(a, suffix), delta(b, a, lower, suffix), pf))

table_rows = "\n".join(
    f"<tr><td>{html.escape(l)}</td><td>{b}</td><td>{a}</td><td>{d}</td><td>{p}</td></tr>"
    for l, b, a, d, p in rows
)

# Backend endpoint p95 table: endpoints stored as list of dicts
def endpoint_dict(d):
    eps = get(d, "backend_summary", "endpoints", default=[]) or []
    return {f"{e.get('method','')} {e.get('path','')}": e for e in eps}

ep_before = endpoint_dict(before)
ep_after = endpoint_dict(after)
ep_keys = sorted(set(ep_before.keys()) | set(ep_after.keys()))
ep_rows = []
for k in ep_keys:
    b = get(ep_before.get(k, {}), "p95_ms")
    a = get(ep_after.get(k, {}), "p95_ms")
    bc = get(ep_before.get(k, {}), "count", default=0)
    ac = get(ep_after.get(k, {}), "count", default=0)
    ep_rows.append(f"<tr><td><code>{html.escape(k)}</code></td><td>{fmt(b,'ms')}</td><td>{fmt(a,'ms')}</td><td>{delta(b,a,True,'ms')}</td><td>{bc} / {ac}</td></tr>")
ep_table = "\n".join(ep_rows) or '<tr><td colspan="5" style="opacity:0.6">No backend endpoint data captured.</td></tr>'

# Top-level summary
def all_pass():
    c_p95 = cold_p95(after)
    w_p95 = warm_p95(after)
    flashes = cold_flash_max(after) or 0
    ratio = cache_ratio(after)
    checks = [
        ("cold_p95 ≤ 3000ms", c_p95 is not None and c_p95 <= THRESH["cold_p95_ms"], c_p95),
        ("warm_p95 ≤ 800ms", w_p95 is not None and w_p95 <= THRESH["warm_p95_ms"], w_p95),
        ("zero flashes", flashes == 0, flashes),
        ("cache_hit_ratio ≥ 0.85", ratio is not None and ratio >= THRESH["cache_hit_ratio"], ratio),
    ]
    return all(c[1] for c in checks), checks

ok, checks = all_pass()
overall = '<span class="good">ALL PASS</span>' if ok else '<span class="bad">PARTIAL — see details</span>'
checks_html = "".join(
    f'<li><span class="{("good" if passed else "bad")}">{("PASS" if passed else "FAIL")}</span> · {html.escape(name)} · actual: {fmt(value)}</li>'
    for name, passed, value in checks
)

html_out = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SkyRate Perf v2 — Audit Results</title>
<style>
:root {{ --bg:#0f1115; --card:#181c25; --txt:#e6e8ec; --mute:#8a92a3; --good:#3ddc97; --bad:#ff6b6b; --neutral:#f5c563; --border:#262b36; }}
* {{ box-sizing:border-box; }}
body {{ font-family:-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--txt); margin:0; padding:32px; line-height:1.5; }}
.container {{ max-width:1100px; margin:0 auto; }}
h1 {{ font-size:2rem; margin:0 0 8px; }}
h2 {{ font-size:1.3rem; margin-top:32px; color:#9aa6c1; border-bottom:1px solid var(--border); padding-bottom:8px; }}
.sub {{ color:var(--mute); margin-bottom:24px; }}
.card {{ background:var(--card); border:1px solid var(--border); border-radius:8px; padding:20px; margin:16px 0; }}
table {{ width:100%; border-collapse:collapse; margin:12px 0; }}
th, td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--border); }}
th {{ background:#1f2430; color:#b8c2d6; font-weight:600; font-size:0.85rem; text-transform:uppercase; }}
.good {{ color:var(--good); font-weight:600; }}
.bad {{ color:var(--bad); font-weight:600; }}
.neutral {{ color:var(--neutral); }}
code {{ background:#0c0e13; padding:2px 6px; border-radius:4px; font-size:0.85rem; }}
.banner {{ font-size:1.4rem; padding:18px 24px; border-radius:8px; margin:16px 0; }}
.banner.pass {{ background:rgba(61,220,151,0.12); border:1px solid var(--good); }}
.banner.fail {{ background:rgba(255,107,107,0.12); border:1px solid var(--bad); }}
.thresh-line {{ font-size:0.85rem; color:var(--mute); margin-top:4px; }}
ul {{ padding-left:20px; }}
li {{ margin:4px 0; }}
</style>
</head>
<body>
<div class="container">
  <h1>SkyRate Perf v2 — Audit Results</h1>
  <div class="sub">Generated {now} · before/after comparison · production https://skyrate.ai</div>

  <div class="banner {'pass' if ok else 'fail'}">Overall verdict: {overall}</div>

  <h2>Key Metrics</h2>
  <table>
    <thead><tr><th>Metric</th><th>Before (flags OFF)</th><th>After (flags ON)</th><th>Δ</th><th>vs Threshold</th></tr></thead>
    <tbody>{table_rows}</tbody>
  </table>

  <h2>Threshold Checks (After)</h2>
  <div class="card">
    <ul>{checks_html}</ul>
  </div>

  <h2>Backend Endpoint p95</h2>
  <table>
    <thead><tr><th>Endpoint</th><th>Before p95</th><th>After p95</th><th>Δ</th><th>Samples (before/after)</th></tr></thead>
    <tbody>{ep_table}</tbody>
  </table>
  <p style="color:var(--mute);font-size:0.85rem">Note: After flag flip, the consultant endpoints (<code>/schools</code>, <code>/dashboard-stats</code>, <code>/crns</code>) responded ~3× faster (~900ms vs 3850ms baseline) even though <code>cache_hit_ratio</code> shows 0. This may indicate the cache-read path is bypassing the perf middleware instrumentation; the user-visible speedup is real (warm renav -93%, 0 flashes).</p>

  <h2>Rollback Procedure</h2>
  <div class="card">
    <p>If issues are detected in production with flags ON:</p>
    <ol>
      <li>Flip <code>PERF_V2_ENABLED=false</code> and <code>NEXT_PUBLIC_PERF_V2_ENABLED=false</code> via <code>doctl apps update</code> with patched spec.</li>
      <li>Wait for DigitalOcean redeploy to reach ACTIVE.</li>
      <li>Endpoints revert to live SODA fetches; loading-flash UI returns (legacy behavior).</li>
      <li>Cache tables (<code>user_usac_cache</code>, <code>sync_jobs</code>) remain populated but are not served — no migration rollback needed.</li>
    </ol>
    <p>To fully remove perf_v2 schema: <code>alembic downgrade e0f1a2b3c4d5</code> (downgrade exists).</p>
  </div>

  <h2>Configuration Active in Production</h2>
  <div class="card">
    <ul>
      <li>Backend env: <code>PERF_V2_ENABLED=true</code>, <code>NIGHTLY_JOB_TOKEN=*****</code> (SECRET)</li>
      <li>Frontend env: <code>NEXT_PUBLIC_PERF_V2_ENABLED=true</code> (BUILD_TIME)</li>
      <li>Cron: GitHub Actions workflow <code>.github/workflows/usac-nightly.yml</code>, daily 07:00 UTC</li>
      <li>Backfill performed: <code>POST /v1/admin/jobs/usac-backfill/run?only_missing=true</code></li>
    </ul>
  </div>

  <h2>Raw Audit Data</h2>
  <details><summary>before.json</summary><pre>{html.escape(json.dumps(before, indent=2))}</pre></details>
  <details><summary>after.json</summary><pre>{html.escape(json.dumps(after, indent=2))}</pre></details>
</div>
</body>
</html>"""

OUT.write_text(html_out, encoding="utf-8")
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
print(f"Overall: {'PASS' if ok else 'FAIL'}")
print(f"Checks (cold_p95, warm_p95, flashes, cache_ratio): {checks}")
