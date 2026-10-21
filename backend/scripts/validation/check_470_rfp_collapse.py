"""Offline check: collapse the USAC Form 470 services cross product.

Run from skyrate.ai/backend:  python scripts/validation/check_470_rfp_collapse.py
Hits USAC Open Data directly, no app/database required.
"""
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
# usac_client imports pandas at module load but the collapse helper does not use
# it; stub it so this check runs without the full backend dependency set.
if "pandas" not in sys.modules:
    _pd = types.ModuleType("pandas")
    _pd.DataFrame = object  # type: ignore[attr-defined]
    _pd.Series = object  # type: ignore[attr-defined]
    sys.modules["pandas"] = _pd

import requests  # noqa: E402

from utils.usac_client import _collapse_470_service_rows  # noqa: E402

SERVICES = "https://opendata.usac.org/resource/39tn-hjzv.json"

# (application_number, expected distinct service lines, expected distinct RFP docs)
CASES = [
    ("270000804", 32, 8),    # Wasco UESD - 512 raw rows (32 x 8 x 2 versions)
    ("270000588", 14, 22),   # 640 raw rows
    ("270000137", 22, 14),   # 616 raw rows
    ("270000798", 1, 1),     # The Opportunity Charter School - genuinely 1 doc
    ("270000788", 1, 2),      # 4 raw rows = 1 line x 2 docs x 2 versions
    ("270001027", 2, 27),     # most attachments of any FY2027 470
    ("270000162", 7, 0),     # American Dream Charter School Ii - genuinely 0 docs
]


def main() -> int:
    failures = 0
    for app, want_services, want_docs in CASES:
        rows = requests.get(
            SERVICES,
            params={"$where": f"application_number='{app}'", "$limit": 5000},
            timeout=90,
        ).json()
        version = "Current" if any(
            (r.get("form_version") or "").lower() == "current" for r in rows
        ) else "Original"
        services, docs = _collapse_470_service_rows(rows, version)
        ok = len(services) == want_services and len(docs) == want_docs
        failures += 0 if ok else 1
        print(
            f"[{'OK' if ok else 'FAIL'}] {app} raw={len(rows):>4} version={version:<8} "
            f"services={len(services)} (want {want_services})  "
            f"docs={len(docs)} (want {want_docs})"
        )
        if len(docs) != len(set(d["url"] for d in docs)):
            print(f"       duplicate URLs returned for {app}")
            failures += 1
    print("RESULT:", "PASS" if failures == 0 else f"FAIL ({failures})")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
