"""Poll backfill last-run until status terminal."""
import subprocess, time, json, sys, os, pathlib
TOK = pathlib.Path(os.environ["TEMP"]) / "skyrate_nightly_token.txt"
token = TOK.read_text().strip()
URL = "https://skyrate.ai/api/v1/admin/jobs/usac-nightly-refresh/last-run"
start = time.time()
last = ""
MAX_MIN = int(sys.argv[1]) if len(sys.argv) > 1 else 15
while time.time() - start < MAX_MIN * 60:
    r = subprocess.run(["curl.exe","-s",URL,"-H",f"X-Job-Token: {token}"], capture_output=True, text=True, shell=True)
    body = r.stdout.strip()
    if body != last:
        elapsed = int(time.time() - start)
        print(f"[{elapsed:>4}s] {body[:300]}", flush=True)
        last = body
    try:
        data = json.loads(body) if body else {}
    except Exception:
        data = {}
    if data.get("finished_at"):
        succ = data.get("users_succeeded", 0); fail = data.get("users_failed", 0); tot = data.get("users_total", 0)
        print(f"\n>>> Done: {succ}/{tot} succeeded, {fail} failed, duration={data.get('duration_ms')}ms")
        sys.exit(0 if fail == 0 else 2)
    time.sleep(15)
print(f"\n!!! timeout {MAX_MIN}m")
sys.exit(3)
