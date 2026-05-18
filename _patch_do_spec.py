"""Patch DigitalOcean app spec to add perf_v2 env vars without disturbing existing secrets."""
import sys, secrets, os, pathlib, subprocess, json, tempfile

try:
    import yaml
except ImportError:
    print("Installing PyYAML..."); subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "pyyaml"])
    import yaml

APP_ID = "8f201fb9-f0f1-4b58-a329-e1fb41ef9f69"
TEMP = pathlib.Path(os.environ["TEMP"])
SPEC_IN = TEMP / "skyrate_spec_current.yaml"
SPEC_OUT = TEMP / "skyrate_spec_patched.yaml"
TOKEN_FILE = TEMP / "skyrate_nightly_token.txt"

# Mode: "off" = both flags false (initial deploy), "on" = both flags true (flip)
mode = sys.argv[1] if len(sys.argv) > 1 else "off"
assert mode in ("off", "on"), "mode must be 'off' or 'on'"

spec = yaml.safe_load(SPEC_IN.read_text(encoding="utf-8"))

# Load or generate token
if TOKEN_FILE.exists() and TOKEN_FILE.read_text().strip():
    token = TOKEN_FILE.read_text().strip()
    print(f"Reusing token (len={len(token)})")
else:
    token = secrets.token_urlsafe(32)
    TOKEN_FILE.write_text(token)
    print(f"Generated new token (len={len(token)})")

flag_val = "true" if mode == "on" else "false"

def upsert_env(envs, key, value, scope="RUN_AND_BUILD_TIME", is_secret=False):
    """Update existing env var or append new one."""
    for e in envs:
        if e["key"] == key:
            e["value"] = value
            e["scope"] = scope
            if is_secret:
                e["type"] = "SECRET"
            else:
                e.pop("type", None)
            print(f"  updated: {key}={value if not is_secret else '<secret>'} scope={scope}")
            return
    new = {"key": key, "scope": scope, "value": value}
    if is_secret:
        new["type"] = "SECRET"
    envs.append(new)
    print(f"  added:   {key}={value if not is_secret else '<secret>'} scope={scope}")

backend = next(s for s in spec["services"] if s["name"] == "backend")
frontend = next(s for s in spec["services"] if s["name"] == "frontend")

print("Backend envs:")
upsert_env(backend["envs"], "PERF_V2_ENABLED", flag_val, scope="RUN_AND_BUILD_TIME")
upsert_env(backend["envs"], "NIGHTLY_JOB_TOKEN", token, scope="RUN_TIME", is_secret=True)

print("Frontend envs:")
upsert_env(frontend["envs"], "NEXT_PUBLIC_PERF_V2_ENABLED", flag_val, scope="BUILD_TIME")

SPEC_OUT.write_text(yaml.safe_dump(spec, sort_keys=False), encoding="utf-8")
print(f"\nWrote patched spec ({SPEC_OUT.stat().st_size} bytes) → {SPEC_OUT}")
print(f"Mode: {mode}  (PERF_V2_ENABLED={flag_val}, NEXT_PUBLIC_PERF_V2_ENABLED={flag_val})")
