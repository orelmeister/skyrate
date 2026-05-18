"""Poll DigitalOcean deploys until top deploy is ACTIVE or ERROR."""
import subprocess, time, sys, json

APP = "8f201fb9-f0f1-4b58-a329-e1fb41ef9f69"
MAX_MIN = int(sys.argv[1]) if len(sys.argv) > 1 else 20

start = time.time()
last = ""
while time.time() - start < MAX_MIN * 60:
    out = subprocess.run(
        ["doctl", "apps", "list-deployments", APP, "--format", "ID,Phase", "--no-header"],
        capture_output=True, text=True, shell=True
    )
    lines = [l.strip() for l in out.stdout.splitlines() if l.strip()]
    if not lines:
        print(f"[{int(time.time()-start)}s] no output: {out.stderr[:200]}")
        time.sleep(15); continue
    top = lines[0]
    if top != last:
        elapsed = int(time.time() - start)
        print(f"[{elapsed:>4}s] {top}", flush=True)
        last = top
    parts = top.split()
    phase = parts[1] if len(parts) > 1 else "?"
    if phase == "ACTIVE":
        print(f"\n>>> Top deploy ACTIVE after {int(time.time()-start)}s: {parts[0]}")
        sys.exit(0)
    if phase in ("ERROR", "FAILED"):
        print(f"\n!!! Top deploy {phase}: {parts[0]}")
        sys.exit(2)
    time.sleep(20)
print(f"\n!!! Timeout after {MAX_MIN} min, last: {last}")
sys.exit(3)
