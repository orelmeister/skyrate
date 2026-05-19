"""
Stage 2: Run Compliance Evaluation

Reads corpus JSON files, sends each narrative to the compliance analysis
endpoint (or calls the analyzer directly), and writes evaluation results.

Usage:
    python -m scripts.validation.run_compliance_eval [--limit N] [--in PATH] [--out PATH]
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# Default paths (relative to backend/)
DEFAULT_CORPUS_DIR = Path("data/validation/form470_corpus")
DEFAULT_RESULTS_DIR = Path("data/validation/eval_results")


def get_compliance_api_url() -> str:
    """Get compliance API base URL from environment."""
    base = os.environ.get("COMPLIANCE_API_URL", "http://localhost:8000")
    return f"{base}/api/v1/compliance/form470/analyze"


def scan_narrative_via_api(
    narrative: str, api_url: str, auth_token: Optional[str] = None
) -> dict:
    """
    Send narrative text to the compliance scan endpoint.

    Since the production endpoint expects a PDF file upload, this function
    creates a minimal text file upload to simulate it. For local dev/testing,
    the analyzer can also be called directly via scan_narrative_direct().

    Returns the parsed JSON response or an error dict.
    """
    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    # The endpoint expects a PDF file upload. We send a .txt file renamed to
    # .pdf for the harness (the extractor will return raw text for text-based PDFs).
    # For proper testing, wrap in a minimal PDF. Here we use direct import instead.
    # Fall back to direct analyzer call.
    try:
        from app.services.compliance.analyzer import analyze_form470
        import asyncio

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            analyze_form470(narrative, {"filename": "validation_harness.txt"})
        )
        loop.close()
        if result:
            return result
        return {"error": "Analyzer returned None"}
    except ImportError:
        # If running outside the backend package, try HTTP
        pass

    # HTTP fallback — requires a running server with a text-based endpoint
    # This is a placeholder; the PDF endpoint requires actual PDF bytes
    return {"error": "HTTP mode not available; run from backend/ directory"}


def scan_narrative_direct(narrative: str) -> dict:
    """
    Call the compliance analyzer directly (in-process).

    Must be run from the backend/ directory with app on the Python path.
    """
    try:
        from app.services.compliance.analyzer import analyze_form470
        import asyncio

        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(
                    asyncio.run, analyze_form470(narrative, {"filename": "validation_harness.txt"})
                ).result()
        else:
            result = asyncio.run(
                analyze_form470(narrative, {"filename": "validation_harness.txt"})
            )

        if result:
            return result
        return {"error": "Analyzer returned None", "overall_risk": "Unknown"}
    except Exception as e:
        return {"error": str(e), "overall_risk": "Unknown"}


def run_evaluation(
    corpus_dir: Optional[Path] = None,
    results_dir: Optional[Path] = None,
    limit: Optional[int] = None,
) -> dict:
    """
    Run compliance evaluation on all corpus records.

    Returns results manifest dict.
    """
    c_dir = corpus_dir or DEFAULT_CORPUS_DIR
    r_dir = results_dir or DEFAULT_RESULTS_DIR
    r_dir.mkdir(parents=True, exist_ok=True)

    # Find corpus files (exclude manifest.json)
    corpus_files = sorted(
        f for f in c_dir.glob("*.json") if f.name != "manifest.json"
    )

    if not corpus_files:
        print(f"[ERROR] No corpus files found in {c_dir}", file=sys.stderr)
        sys.exit(1)

    if limit and limit < len(corpus_files):
        corpus_files = corpus_files[:limit]

    print(f"[INFO] Found {len(corpus_files)} corpus files. Starting evaluation...")

    manifest = {
        "total_evaluated": 0,
        "successful": 0,
        "errors": 0,
        "total_elapsed_seconds": 0.0,
        "avg_elapsed_seconds": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": "",
        "error_details": [],
    }

    total_elapsed = 0.0

    for i, filepath in enumerate(corpus_files):
        with open(filepath, "r", encoding="utf-8") as f:
            record = json.load(f)

        anon_id = record.get("anon_id", "unknown")
        form470_number = record.get("form470_number", "unknown")
        narrative = record.get("narrative", "")

        if not narrative:
            manifest["errors"] += 1
            manifest["error_details"].append(
                {"file": filepath.name, "reason": "empty_narrative"}
            )
            continue

        print(
            f"[INFO] Evaluating {i + 1}/{len(corpus_files)}: "
            f"{anon_id} / {form470_number}"
        )

        start_time = time.time()
        result = scan_narrative_direct(narrative)
        elapsed = time.time() - start_time
        total_elapsed += elapsed

        manifest["total_evaluated"] += 1

        if "error" in result and result.get("overall_risk") == "Unknown":
            manifest["errors"] += 1
            manifest["error_details"].append(
                {
                    "file": filepath.name,
                    "reason": result.get("error", "unknown"),
                    "elapsed_seconds": round(elapsed, 3),
                }
            )
        else:
            manifest["successful"] += 1

        # Write result
        eval_record = {
            "anon_id": anon_id,
            "form470_number": form470_number,
            "elapsed_seconds": round(elapsed, 3),
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }

        out_filename = f"{anon_id}__{form470_number}.json"
        out_path = r_dir / out_filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(eval_record, f, indent=2, ensure_ascii=False)

    manifest["total_elapsed_seconds"] = round(total_elapsed, 3)
    if manifest["total_evaluated"] > 0:
        manifest["avg_elapsed_seconds"] = round(
            total_elapsed / manifest["total_evaluated"], 3
        )
    manifest["completed_at"] = datetime.now(timezone.utc).isoformat()

    # Write manifest
    manifest_path = r_dir / "results_manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[INFO] Evaluation complete. "
          f"Successful: {manifest['successful']}, "
          f"Errors: {manifest['errors']}, "
          f"Avg time: {manifest['avg_elapsed_seconds']}s")
    print(f"[INFO] Results manifest: {manifest_path}")

    return manifest


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Stage 2: Run compliance eval on validation corpus"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max records to evaluate (default: all)"
    )
    parser.add_argument(
        "--in", dest="input_dir", type=str, default=None,
        help="Corpus input directory"
    )
    parser.add_argument(
        "--out", type=str, default=None,
        help="Results output directory"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    corpus_path = Path(args.input_dir) if args.input_dir else None
    results_path = Path(args.out) if args.out else None

    run_evaluation(
        corpus_dir=corpus_path,
        results_dir=results_path,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
