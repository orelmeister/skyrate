"""
Stage 1: Build Validation Corpus

Fetches Form 470 records from the CRM admin endpoint, enriches each with
USAC Open Data narrative text via Sodapy, anonymizes, and writes one JSON
file per record to data/validation/form470_corpus/.

Usage:
    python -m scripts.validation.build_validation_corpus [--limit N] [--out PATH]
"""

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from sodapy import Socrata

from .auth import get_admin_session, AuthError

logger = logging.getLogger(__name__)

# USAC Form 470 dataset on data.usac.org
# Dataset: "E-Rate FCC Form 470 Tool Data" — opendata.usac.org identifier jt8s-3q52
# Contains 167K+ FY2026 records with structured + narrative data.
# Fields used from this dataset (confirmed 2026-05-19):
#   application_number         — the 9-digit Form 470 number (string)
#   category_one_description   — free-text RFP narrative (may be empty for Cat 2-only forms)
#   service_type               — e.g. "Data Transmission and/or Internet Access", "Internal Connections"
#   service_category           — e.g. "Category 1", "Category 2"
#   function                   — e.g. "Internet Access and Data Transmission Service"
#   minimum_capacity           — e.g. "50.00 Mbps"
#   maximum_capacity           — e.g. "1024.00 Mbps"
#   installation_initial       — boolean (new installation or not)
#   fcc_form_470_status        — e.g. "Certified", "Posted"
#   billed_entity_name         — entity name (REDACTED in corpus)
#   form_nickname              — human-readable form label
USAC_DATASET_ID = "jt8s-3q52"
USAC_DOMAIN = "opendata.usac.org"

# Default output directory (relative to backend/)
DEFAULT_OUTPUT_DIR = Path("data/validation/form470_corpus")

# CRM admin endpoint
ADMIN_CORPUS_URL = (
    "https://app.erateapp.com/api/v1/admin_compliance_corpus_stats"
)


def anonymize_entity_id(entity_id: str, salt: str) -> str:
    """
    Generate a stable anonymous ID from entity_id + salt.

    Returns 'ENT-<first 8 chars of sha1 hex>'.
    """
    raw = f"{salt}:{entity_id}".encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()[:8]
    return f"ENT-{digest}"


def split_form470_numbers(raw: str | None) -> list[str]:
    """
    Split a pipe-delimited string of Form 470 numbers into individual numbers.

    The CRM stores form470_number as a pipe-delimited string when an entity
    files multiple Form 470s at once. Examples:
        "260026339|260025521"       -> ["260026339", "260025521"]
        "260026280|260026184|260013002" -> ["260026280", "260026184", "260013002"]
        "261042134"                 -> ["261042134"]
        ""                          -> []
        None                        -> []

    Handles whitespace + empties: " 1 || 2 " -> ["1", "2"]
    Returns deduplicated list preserving first-occurrence order.
    """
    if not raw:
        return []
    parts = raw.split("|")
    seen: set[str] = set()
    result: list[str] = []
    for part in parts:
        cleaned = part.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def strip_applicant_names(text: str) -> str:
    """
    Remove likely applicant/district names from narrative text.

    Targets patterns like 'Springfield School District', 'County Library System', etc.
    """
    # Pattern: capitalized words followed by common entity suffixes
    patterns = [
        r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\s+(?:School\s+District|"
        r"County\s+Schools?|Public\s+Schools?|Library\s+System|"
        r"Unified\s+School\s+District|Independent\s+School\s+District|"
        r"Board\s+of\s+Education|Regional\s+School|"
        r"Charter\s+School|Academy|Institute)\b",
    ]
    result = text
    for pat in patterns:
        result = re.sub(pat, "[ENTITY_REDACTED]", result)
    return result


def fetch_form470_records(session: requests.Session) -> list[dict]:
    """
    Fetch form470_records array from the CRM admin endpoint.

    Expected response shape:
    {
      "filing_data_coverage": {...},
      "form470_records": [
        {
          "entity_id": "...",
          "form470_number": "...",
          "form470_status": "...",
          "form470_posting_date": "...",
          "form470_certified_date": "...",
          "funding_year": 2026
        },
        ...
      ]
    }
    """
    try:
        resp = session.get(ADMIN_CORPUS_URL, timeout=30)
    except requests.RequestException as e:
        logger.error("Failed to reach CRM endpoint: %s", e)
        return []

    if resp.status_code != 200:
        logger.error("CRM endpoint returned HTTP %d: %s", resp.status_code, resp.text[:200])
        return []

    data = resp.json()
    records = data.get("form470_records", [])
    if not records:
        logger.warning("No form470_records in CRM response.")
    return records


def fetch_usac_record(
    client: Socrata, form470_number: str
) -> Optional[dict]:
    """
    Fetch a single Form 470 record from USAC Open Data by application_number.

    Returns the first matching row or None.
    """
    try:
        results = client.get(
            USAC_DATASET_ID,
            where=f"application_number='{form470_number}'",
            limit=1,
        )
        if results:
            return results[0]
    except Exception as e:
        logger.warning("Sodapy fetch failed for %s: %s", form470_number, e)
    return None


def build_narrative(usac_row: dict) -> str:
    """
    Concatenate relevant USAC fields into a synthetic RFP narrative.

    Fields used (when present): category_one_description, service_type,
    service_category, function, minimum_capacity, maximum_capacity,
    installation_initial, form_nickname.
    """
    fields = [
        "category_one_description",
        "service_type",
        "service_category",
        "function",
        "minimum_capacity",
        "maximum_capacity",
        "installation_initial",
        "form_nickname",
    ]
    parts = []
    for field in fields:
        value = usac_row.get(field)
        if value and str(value).strip():
            parts.append(f"{field}: {value}")
    return "\n".join(parts)


def build_corpus(
    limit: Optional[int] = None,
    output_dir: Optional[Path] = None,
) -> dict:
    """
    Main corpus building logic.

    Returns manifest dict with counts and errors.
    """
    out_dir = output_dir or DEFAULT_OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    salt = os.environ.get("VALIDATION_SALT", "default-dev-salt")
    if salt == "default-dev-salt":
        logger.warning(
            "VALIDATION_SALT not set -- using default. "
            "Set it for stable anonymization across runs."
        )

    # Authenticate with CRM
    print("[INFO] Authenticating with app.erateapp.com...")
    session = get_admin_session()

    # Fetch records from CRM
    print("[INFO] Fetching form470_records from CRM...")
    records = fetch_form470_records(session)
    print(f"[INFO] Got {len(records)} records from CRM.")

    if limit and limit < len(records):
        records = records[:limit]
        print(f"[INFO] Limiting to {limit} records.")

    # Connect to USAC Open Data
    app_token = os.environ.get("USAC_APP_TOKEN")
    client = Socrata(USAC_DOMAIN, app_token)

    manifest = {
        "total_crm_records": len(records),
        "total_form470_after_split": 0,
        "fetched_usac": 0,
        "missing_usac": 0,
        "written": 0,
        "errors": [],
        "built_at": datetime.now(timezone.utc).isoformat(),
    }

    for i, record in enumerate(records):
        raw_form470 = record.get("form470_number")
        entity_id = str(record.get("entity_id", ""))

        form470_numbers = split_form470_numbers(raw_form470)
        if not form470_numbers:
            manifest["errors"].append(
                {"index": i, "reason": "missing form470_number"}
            )
            continue

        manifest["total_form470_after_split"] += len(form470_numbers)
        anon_id = anonymize_entity_id(entity_id, salt)

        for form470_number in form470_numbers:
            print(
                f"[INFO] Processing CRM record {i + 1}/{len(records)}: "
                f"{anon_id} / Form 470 #{form470_number}"
            )

            # Fetch from USAC
            usac_row = fetch_usac_record(client, form470_number)
            time.sleep(0.3)  # Rate-limit courtesy for anonymous API access
            if not usac_row:
                manifest["missing_usac"] += 1
                manifest["errors"].append(
                    {
                        "index": i,
                        "form470_number": form470_number,
                        "reason": "not_found_in_usac",
                    }
                )
                continue

            manifest["fetched_usac"] += 1

            # Build narrative text
            narrative = build_narrative(usac_row)
            narrative = strip_applicant_names(narrative)

            # Extract service categories
            service_categories = []
            if usac_row.get("service_type"):
                service_categories.append(usac_row["service_type"])
            if usac_row.get("service_category"):
                service_categories.append(usac_row["service_category"])

            # Build output record
            corpus_record = {
                "anon_id": anon_id,
                "form470_number": form470_number,
                "funding_year": record.get("funding_year"),
                "form470_status": record.get("form470_status"),
                "posting_date": record.get("form470_posting_date"),
                "certified_date": record.get("form470_certified_date"),
                "narrative": narrative,
                "service_categories": service_categories,
                "source": f"usac_form470_{USAC_DATASET_ID.replace('-', '_')}",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }

            # Write to file
            filename = f"{anon_id}__{form470_number}.json"
            filepath = out_dir / filename
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(corpus_record, f, indent=2, ensure_ascii=False)
            manifest["written"] += 1

    # Write manifest
    manifest_path = out_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[INFO] Corpus build complete. Written: {manifest['written']}, "
          f"Missing: {manifest['missing_usac']}, Errors: {len(manifest['errors'])}")
    print(f"[INFO] Manifest: {manifest_path}")

    return manifest


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Stage 1: Build compliance validation corpus from CRM + USAC data"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Max records to process (default: all)"
    )
    parser.add_argument(
        "--out", type=str, default=None,
        help="Output directory (default: data/validation/form470_corpus/)"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    out_path = Path(args.out) if args.out else None

    try:
        build_corpus(limit=args.limit, output_dir=out_path)
    except AuthError as e:
        print(f"[ERROR] Authentication failed: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Corpus build failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
