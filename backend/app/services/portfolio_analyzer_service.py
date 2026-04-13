"""
Portfolio Analyzer Service for SkyRate AI
Universal E-Rate portfolio analyzer for CRN, BEN, and SPIN lookups.
Queries USAC Open Data and builds comprehensive portfolio reports.
"""

import os
import logging
import math
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

# USAC Socrata dataset base URL
SOCRATA_BASE = "https://opendata.usac.org/resource"

# Dataset IDs
DATASET_471_FULL = "srbr-2d59"       # Form 471 Full (crn_data, fcdl_comment, costs)
DATASET_FRN_STATUS = "qdmp-ygft"     # FRN Status (updated_at, pending_reason, SPIN)
DATASET_INVOICES = "jpiu-tj8h"       # Form 472 Invoice/Disbursements
DATASET_C2_BUDGET = "6brt-5pbv"      # C2 Budget Tool

# Denial classification keywords
DENIAL_CATEGORIES = {
    "Competitive Bidding": ["competitive bid", "28-day", "bid evaluation", "cost-effective", "cost effective"],
    "Form 470 Issues": ["form 470", "470 posted", "services requested"],
    "Eligibility": ["not eligible", "ineligible", "does not qualify"],
    "CIPA": ["cipa", "internet safety", "children's internet protection"],
    "Documentation": ["documentation", "insufficient", "did not provide", "failed to submit"],
    "Contract Issues": ["contract expired", "not executed", "voluntary extension"],
    "Cost Allocation": ["cost allocation", "ineligible costs"],
    "Duplicate/Overlap": ["duplicate", "overlap", "already funded"],
    "Late Filing": ["late", "deadline", "after the close", "window"],
    "Form 486": ["form 486", "486"],
}


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert a value to float, returning default on failure."""
    if val is None:
        return default
    try:
        result = float(val)
        if math.isnan(result) or math.isinf(result):
            return default
        return result
    except (ValueError, TypeError):
        return default


def _safe_str(val: Any, default: str = "") -> str:
    """Safely convert a value to string."""
    if val is None:
        return default
    return str(val).strip()


class PortfolioAnalyzerService:
    """Universal E-Rate portfolio analyzer for CRN, BEN, and SPIN lookups."""

    def __init__(self):
        self.app_token = os.environ.get("SOCRATA_APP_TOKEN", "")
        self.session = self._build_session()

    def _build_session(self) -> requests.Session:
        """Build an HTTP session with retry logic."""
        session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retries)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    # ==================== MAIN ENTRY ====================

    def analyze(self, lookup_type: str, lookup_value: str, funding_years: Optional[List[int]] = None) -> dict:
        """Main entry point. Dispatch to the appropriate handler."""
        lookup_value = lookup_value.strip()
        if not lookup_value:
            raise ValueError("lookup_value cannot be empty")

        lookup_type = lookup_type.lower()
        if lookup_type not in ("crn", "ben", "spin"):
            raise ValueError(f"Invalid lookup_type: {lookup_type}. Must be crn, ben, or spin.")

        years = funding_years or [2024, 2025, 2026]
        logger.info(f"[Portfolio Analyzer] Starting {lookup_type} analysis for: {lookup_value}, years={years}")

        if lookup_type == "crn":
            return self._analyze_crn(lookup_value, years)
        elif lookup_type == "ben":
            return self._analyze_ben(lookup_value, years)
        else:
            return self._analyze_spin(lookup_value, years)

    # ==================== CRN ANALYSIS ====================

    def _analyze_crn(self, crn: str, years: List[int]) -> dict:
        """CRN lookup: Query srbr-2d59 for CRN FRNs, then cross-reference qdmp-ygft for real financial data."""
        logger.info(f"[CRN Lookup] Querying Form 471 Full for CRN: {crn}")

        # Step 1: Query Form 471 Full to find all FRNs associated with this CRN
        # CRN data format: {Consultant Name|CRN_NUMBER|email}
        where = f"crn_data LIKE '%|{crn}|%'"
        year_filter = self._build_year_filter(years)
        if year_filter:
            where = f"({where}) AND ({year_filter})"

        frn_records = self._fetch_usac_data(DATASET_471_FULL, where, limit=50000)
        logger.info(f"[CRN Lookup] Got {len(frn_records)} FRN records from Form 471")

        # Step 2: Extract subject info (consultant name/email) from crn_data
        subject_info = self._extract_crn_subject(crn, frn_records)

        # Step 3: Build enrichment map from 471 records (keyed by FRN number)
        enrichment_map = {}
        for rec in frn_records:
            frn_num = _safe_str(rec.get("funding_request_number"))
            if frn_num:
                enrichment_map[frn_num] = rec

        # Step 4: Extract unique BENs from 471 records and query FRN Status (qdmp-ygft)
        # FRN Status has the real frn_status and original_commitment_adjustment fields
        bens = list(set(_safe_str(rec.get("ben")) for rec in frn_records if rec.get("ben")))
        logger.info(f"[CRN Lookup] Found {len(bens)} unique BENs, querying FRN Status dataset")

        status_records = []
        for chunk in self._chunk_list(bens, 20):
            ben_clause = " OR ".join(f"ben='{b}'" for b in chunk)
            status_where = ben_clause
            if year_filter:
                status_where = f"({ben_clause}) AND ({year_filter})"
            recs = self._fetch_usac_data(DATASET_FRN_STATUS, status_where, limit=50000)
            status_records.extend(recs)

        logger.info(f"[CRN Lookup] Got {len(status_records)} records from FRN Status")

        # Step 5: Build FRN list from status records, enriched with 471 data
        frns = self._build_frns_from_status(status_records, enrichment_map)

        # Step 6: Fetch disbursement data for all BENs
        disbursement_map = self._fetch_disbursements_for_bens(bens)
        self._apply_disbursements(frns, disbursement_map)

        return self._build_response("crn", crn, subject_info, frns)

    # ==================== BEN ANALYSIS ====================

    def _analyze_ben(self, ben: str, years: List[int]) -> dict:
        """BEN lookup: Query qdmp-ygft + srbr-2d59 for enrichment."""
        logger.info(f"[BEN Lookup] Querying FRN Status for BEN: {ben}")

        # Primary: FRN status
        where = f"ben='{ben}'"
        year_filter = self._build_year_filter(years)
        if year_filter:
            where = f"({where}) AND ({year_filter})"

        status_records = self._fetch_usac_data(DATASET_FRN_STATUS, where, limit=50000)
        logger.info(f"[BEN Lookup] Got {len(status_records)} records from FRN Status")

        # Enrichment: Form 471 Full
        where_471 = f"ben='{ben}'"
        if year_filter:
            where_471 = f"({where_471}) AND ({year_filter})"
        full_records = self._fetch_usac_data(DATASET_471_FULL, where_471, limit=50000)
        logger.info(f"[BEN Lookup] Got {len(full_records)} records from Form 471 Full")

        # Build enrichment map keyed by FRN
        enrichment_map = {}
        for rec in full_records:
            frn_num = _safe_str(rec.get("funding_request_number"))
            if frn_num:
                enrichment_map[frn_num] = rec

        # Build FRN list from status records, enriched with 471 data
        frns = self._build_frns_from_status(status_records, enrichment_map)

        # Subject info from first record
        subject_info = {
            "name": _safe_str(status_records[0].get("organization_name")) if status_records else ben,
            "type": "applicant",
            "identifier": ben,
            "email": None,
            "state": _safe_str(status_records[0].get("state")) if status_records else None,
        }

        # Fetch disbursements
        disbursement_map = self._fetch_disbursements_for_bens([ben])
        self._apply_disbursements(frns, disbursement_map)

        return self._build_response("ben", ben, subject_info, frns)

    # ==================== SPIN ANALYSIS ====================

    def _analyze_spin(self, spin: str, years: List[int]) -> dict:
        """SPIN lookup: Query qdmp-ygft with epc_organization_id='{SPIN}'."""
        logger.info(f"[SPIN Lookup] Querying FRN Status for SPIN: {spin}")

        where = f"epc_organization_id='{spin}'"
        year_filter = self._build_year_filter(years)
        if year_filter:
            where = f"({where}) AND ({year_filter})"

        status_records = self._fetch_usac_data(DATASET_FRN_STATUS, where, limit=50000)
        logger.info(f"[SPIN Lookup] Got {len(status_records)} records from FRN Status")

        # Enrichment from 471
        frn_numbers = list(set(_safe_str(r.get("funding_request_number")) for r in status_records if r.get("funding_request_number")))
        enrichment_map = {}
        # Batch fetch 471 data by FRN numbers (in chunks)
        for chunk in self._chunk_list(frn_numbers, 50):
            frn_clause = " OR ".join(f"funding_request_number='{f}'" for f in chunk)
            recs = self._fetch_usac_data(DATASET_471_FULL, frn_clause, limit=50000)
            for rec in recs:
                frn_num = _safe_str(rec.get("funding_request_number"))
                if frn_num:
                    enrichment_map[frn_num] = rec

        frns = self._build_frns_from_status(status_records, enrichment_map)

        # Subject info
        subject_info = {
            "name": _safe_str(status_records[0].get("spin_name")) if status_records else spin,
            "type": "service_provider",
            "identifier": spin,
            "email": None,
            "state": None,
        }

        # Fetch disbursements for all BENs
        bens = list(set(f.get("ben", "") for f in frns if f.get("ben")))
        disbursement_map = self._fetch_disbursements_for_bens(bens)
        self._apply_disbursements(frns, disbursement_map)

        return self._build_response("spin", spin, subject_info, frns)

    # ==================== USAC DATA FETCHER ====================

    def _fetch_usac_data(self, dataset_id: str, where_clause: str, limit: int = 50000) -> list:
        """Generic USAC Socrata API fetcher with pagination."""
        url = f"{SOCRATA_BASE}/{dataset_id}.json"
        all_records = []
        offset = 0
        page_size = min(limit, 10000)

        headers = {}
        if self.app_token:
            headers["X-App-Token"] = self.app_token

        while offset < limit:
            params = {
                "$where": where_clause,
                "$limit": page_size,
                "$offset": offset,
                "$order": ":id",
            }
            try:
                resp = self.session.get(url, params=params, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                all_records.extend(data)
                if len(data) < page_size:
                    break
                offset += page_size
            except requests.RequestException as e:
                logger.error(f"[USAC Fetch] Error fetching {dataset_id}: {e}")
                break

        return all_records

    # ==================== DATA PROCESSING ====================

    def _build_year_filter(self, years: List[int]) -> str:
        """Build a funding_year filter clause."""
        if not years:
            return ""
        clauses = [f"funding_year='{y}'" for y in years]
        return " OR ".join(clauses)

    def _extract_crn_subject(self, crn: str, records: list) -> dict:
        """Extract consultant name/email from crn_data field."""
        for rec in records:
            crn_data = _safe_str(rec.get("crn_data"))
            if not crn_data:
                continue
            # Format: {Name|CRN|email} — may have multiple entries separated by newlines or commas
            entries = crn_data.replace("{", "").replace("}", "").split("\n")
            for entry in entries:
                parts = entry.strip().split("|")
                if len(parts) >= 2 and parts[1].strip() == crn:
                    return {
                        "name": parts[0].strip() if parts[0].strip() else crn,
                        "type": "consultant",
                        "identifier": crn,
                        "email": parts[2].strip() if len(parts) > 2 else None,
                        "state": None,
                    }
        return {
            "name": crn,
            "type": "consultant",
            "identifier": crn,
            "email": None,
            "state": None,
        }

    def _enrich_frns_from_471(self, records: list) -> List[dict]:
        """Build FRN list from Form 471 Full records."""
        frns = []
        seen = set()
        for rec in records:
            frn_num = _safe_str(rec.get("funding_request_number"))
            if not frn_num or frn_num in seen:
                continue
            seen.add(frn_num)

            status = _safe_str(rec.get("frn_status", "")).title()
            committed = _safe_float(rec.get("original_commitment_adjustment"))
            if committed == 0:
                committed = _safe_float(rec.get("total_authorized_disbursement"))

            fcdl_comment = _safe_str(rec.get("fcdl_comment_frn", "")) or _safe_str(rec.get("fcdl_comment", ""))
            denial_cat = self._classify_denial(fcdl_comment) if "denied" in status.lower() else None

            frn = {
                "frn": frn_num,
                "ben": _safe_str(rec.get("ben")),
                "entity_name": _safe_str(rec.get("organization_name")),
                "spin_name": _safe_str(rec.get("spin_name")),
                "consultant": _safe_str(rec.get("consultant_name")),
                "consultant_crn": self._extract_crn_number(rec.get("crn_data")),
                "funding_year": _safe_str(rec.get("funding_year")),
                "service_type": _safe_str(rec.get("service_type")),
                "current_status": status,
                "pending_reason": _safe_str(rec.get("pending_reason")),
                "committed_amount": committed,
                "disbursed_amount": _safe_float(rec.get("total_authorized_disbursement")),
                "discount_rate": _safe_float(rec.get("discount_rate")),
                "fcdl_date": _safe_str(rec.get("fcdl_letter_date")),
                "revised_fcdl_date": _safe_str(rec.get("revised_fcdl_date")) or None,
                "wave_number": _safe_str(rec.get("wave_sequence_number")),
                "last_date_to_invoice": _safe_str(rec.get("last_date_to_invoice")),
                "invoicing_mode": _safe_str(rec.get("invoicing_mode")),
                "f486_status": _safe_str(rec.get("f486_case_status")),
                "fcdl_comment": fcdl_comment,
                "updated_at": _safe_str(rec.get(":updated_at")) or _safe_str(rec.get("updated_at")),
                "denial_category": denial_cat,
                "status_timeline": self._build_frn_timeline(rec),
            }
            frns.append(frn)
        return frns

    def _build_frns_from_status(self, status_records: list, enrichment_map: dict) -> List[dict]:
        """Build FRN list from FRN status records, enriched with 471 data."""
        frns = []
        seen = set()
        for rec in status_records:
            frn_num = _safe_str(rec.get("funding_request_number"))
            if not frn_num or frn_num in seen:
                continue
            seen.add(frn_num)

            enriched = enrichment_map.get(frn_num, {})
            status = _safe_str(rec.get("frn_status", "")).title()
            committed = _safe_float(rec.get("original_commitment_adjustment")) or _safe_float(enriched.get("original_commitment_adjustment"))

            fcdl_comment = _safe_str(enriched.get("fcdl_comment_frn", "")) or _safe_str(enriched.get("fcdl_comment", ""))
            denial_cat = self._classify_denial(fcdl_comment) if "denied" in status.lower() else None

            # Merge timeline source
            timeline_source = enriched if enriched else rec

            frn = {
                "frn": frn_num,
                "ben": _safe_str(rec.get("ben")),
                "entity_name": _safe_str(rec.get("organization_name")),
                "spin_name": _safe_str(rec.get("spin_name")),
                "consultant": _safe_str(enriched.get("consultant_name")),
                "consultant_crn": self._extract_crn_number(enriched.get("crn_data")),
                "funding_year": _safe_str(rec.get("funding_year")),
                "service_type": _safe_str(rec.get("service_type")),
                "current_status": status,
                "pending_reason": _safe_str(rec.get("pending_reason")),
                "committed_amount": committed,
                "disbursed_amount": _safe_float(rec.get("total_authorized_disbursement")),
                "discount_rate": _safe_float(enriched.get("discount_rate")),
                "fcdl_date": _safe_str(rec.get("fcdl_letter_date")) or _safe_str(enriched.get("fcdl_letter_date")),
                "revised_fcdl_date": _safe_str(enriched.get("revised_fcdl_date")) or None,
                "wave_number": _safe_str(rec.get("wave_sequence_number")) or _safe_str(enriched.get("wave_sequence_number")),
                "last_date_to_invoice": _safe_str(rec.get("last_date_to_invoice")) or _safe_str(enriched.get("last_date_to_invoice")),
                "invoicing_mode": _safe_str(enriched.get("invoicing_mode")),
                "f486_status": _safe_str(rec.get("f486_case_status")) or _safe_str(enriched.get("f486_case_status")),
                "fcdl_comment": fcdl_comment,
                "updated_at": _safe_str(rec.get(":updated_at")) or _safe_str(rec.get("updated_at")),
                "denial_category": denial_cat,
                "status_timeline": self._build_frn_timeline(timeline_source),
            }
            frns.append(frn)
        return frns

    def _extract_crn_number(self, crn_data: Any) -> Optional[str]:
        """Extract CRN number from crn_data field."""
        if not crn_data:
            return None
        text = str(crn_data).replace("{", "").replace("}", "")
        parts = text.strip().split("|")
        if len(parts) >= 2:
            return parts[1].strip()
        return None

    # ==================== FRN TIMELINE ====================

    def _build_frn_timeline(self, frn: dict) -> list:
        """Reconstruct FRN status timeline from timestamps."""
        events = []

        # Application Filed
        year = _safe_str(frn.get("funding_year"))
        if year:
            events.append({
                "date": f"{year}-01-01",
                "event": f"Application Filed (FY{year})",
                "type": "info",
            })

        # Contract Award
        award_date = _safe_str(frn.get("award_date"))
        if award_date:
            events.append({
                "date": award_date[:10],
                "event": "Contract Awarded",
                "type": "info",
            })

        # Pending reason sub-status
        pending = _safe_str(frn.get("pending_reason"))
        if pending:
            events.append({
                "date": _safe_str(frn.get(":updated_at", ""))[:10] or _safe_str(frn.get("updated_at", ""))[:10] or "",
                "event": f"Sub-Status: {pending}",
                "type": "pending",
            })

        # FCDL Issued
        fcdl_date = _safe_str(frn.get("fcdl_letter_date"))
        status = _safe_str(frn.get("frn_status", "")).title()
        wave = _safe_str(frn.get("wave_sequence_number"))
        if fcdl_date:
            wave_str = f" (Wave {wave})" if wave else ""
            events.append({
                "date": fcdl_date[:10],
                "event": f"FCDL Issued - {status}{wave_str}",
                "type": "funded" if "funded" in status.lower() else "denied" if "denied" in status.lower() else "info",
            })

        # Revised FCDL
        revised = _safe_str(frn.get("revised_fcdl_date"))
        if revised:
            events.append({
                "date": revised[:10],
                "event": "Revised FCDL",
                "type": "info",
            })

        # Form 486 status
        f486 = _safe_str(frn.get("f486_case_status"))
        if f486:
            events.append({
                "date": "",
                "event": f"Form 486: {f486}",
                "type": "info",
            })

        # Disbursement
        disbursed = _safe_float(frn.get("total_authorized_disbursement"))
        committed = _safe_float(frn.get("original_commitment_adjustment"))
        if disbursed > 0 and committed > 0:
            pct = round((disbursed / committed) * 100, 1)
            events.append({
                "date": "",
                "event": f"Disbursement: {pct}% of committed",
                "type": "disbursed",
            })

        # Sort by date (empty dates go last)
        events.sort(key=lambda e: e["date"] if e["date"] else "9999-99-99")
        return events

    # ==================== DENIAL CLASSIFICATION ====================

    def _classify_denial(self, fcdl_comment: str) -> str:
        """Classify denial reason into categories via keyword matching."""
        if not fcdl_comment:
            return "Other"
        comment_lower = fcdl_comment.lower()
        for category, keywords in DENIAL_CATEGORIES.items():
            for kw in keywords:
                if kw in comment_lower:
                    return category
        return "Other"

    # ==================== DISBURSEMENT FETCHING ====================

    def _fetch_disbursements_for_bens(self, bens: List[str]) -> Dict[str, float]:
        """Fetch total disbursements per FRN for a list of BENs."""
        if not bens:
            return {}
        disbursement_map: Dict[str, float] = {}
        # Process in chunks to avoid URL length issues
        for chunk in self._chunk_list(bens, 20):
            ben_clause = " OR ".join(f"billed_entity_number='{b}'" for b in chunk if b)
            if not ben_clause:
                continue
            records = self._fetch_usac_data(DATASET_INVOICES, ben_clause, limit=50000)
            for rec in records:
                frn_num = _safe_str(rec.get("funding_request_number"))
                amt = _safe_float(rec.get("approved_inv_line_amt"))
                if frn_num:
                    disbursement_map[frn_num] = disbursement_map.get(frn_num, 0.0) + amt
        return disbursement_map

    def _apply_disbursements(self, frns: List[dict], disbursement_map: Dict[str, float]):
        """Apply disbursement totals to FRN records."""
        for frn in frns:
            frn_num = frn.get("frn", "")
            if frn_num in disbursement_map:
                frn["disbursed_amount"] = disbursement_map[frn_num]

    # ==================== PORTFOLIO SUMMARY ====================

    def _calculate_portfolio_summary(self, frns: list) -> dict:
        """Calculate aggregate stats across all FRNs."""
        total_committed = 0.0
        total_disbursed = 0.0
        total_denied_amt = 0.0
        funded_count = 0
        pending_count = 0
        denied_count = 0
        other_count = 0
        bens = set()
        years = set()

        for frn in frns:
            status = (frn.get("current_status") or "").lower()
            committed = _safe_float(frn.get("committed_amount"))
            disbursed = _safe_float(frn.get("disbursed_amount"))
            ben = frn.get("ben", "")
            year = frn.get("funding_year", "")

            if ben:
                bens.add(ben)
            if year:
                years.add(year)

            if "funded" in status:
                funded_count += 1
                total_committed += committed
                total_disbursed += disbursed
            elif "pending" in status:
                pending_count += 1
                total_committed += committed
            elif "denied" in status:
                denied_count += 1
                total_denied_amt += committed
            else:
                other_count += 1

        total_frns = len(frns)
        decidable = funded_count + denied_count
        success_rate = round(funded_count / decidable, 4) if decidable > 0 else 0.0
        disbursement_rate = round(total_disbursed / total_committed, 4) if total_committed > 0 else 0.0
        money_left = round(total_committed - total_disbursed, 2)

        return {
            "total_bens": len(bens),
            "total_frns": total_frns,
            "total_committed": round(total_committed, 2),
            "total_disbursed": round(total_disbursed, 2),
            "total_denied_amount": round(total_denied_amt, 2),
            "funded_count": funded_count,
            "pending_count": pending_count,
            "denied_count": denied_count,
            "other_count": other_count,
            "success_rate": success_rate,
            "disbursement_rate": disbursement_rate,
            "money_left_on_table": max(money_left, 0),
            "active_funding_years": sorted(list(years), reverse=True),
        }

    # ==================== FRN STATUS SUMMARY ====================

    def _build_status_summary(self, frns: list) -> dict:
        """Build status group summary with counts and amounts."""
        summary: Dict[str, dict] = {}
        for frn in frns:
            status = frn.get("current_status", "Other")
            if status not in summary:
                summary[status] = {"count": 0, "amount": 0.0}
            summary[status]["count"] += 1
            summary[status]["amount"] += _safe_float(frn.get("committed_amount"))

        # Round amounts
        for v in summary.values():
            v["amount"] = round(v["amount"], 2)
        return summary

    # ==================== DENIAL ANALYSIS ====================

    def _build_denial_analysis(self, frns: list) -> dict:
        """Build denial breakdown by category, year, service type."""
        denied = [f for f in frns if "denied" in (f.get("current_status") or "").lower()]
        by_category: Dict[str, dict] = {}
        by_year: Dict[str, dict] = {}
        by_service: Dict[str, dict] = {}
        details = []

        total_denied_amt = 0.0

        for frn in denied:
            cat = frn.get("denial_category") or "Other"
            year = frn.get("funding_year") or "Unknown"
            svc = frn.get("service_type") or "Unknown"
            amt = _safe_float(frn.get("committed_amount"))
            total_denied_amt += amt

            # By category
            if cat not in by_category:
                by_category[cat] = {"count": 0, "amount": 0.0}
            by_category[cat]["count"] += 1
            by_category[cat]["amount"] += amt

            # By year
            if year not in by_year:
                by_year[year] = {"count": 0, "amount": 0.0}
            by_year[year]["count"] += 1
            by_year[year]["amount"] += amt

            # By service type
            if svc not in by_service:
                by_service[svc] = {"count": 0, "amount": 0.0}
            by_service[svc]["count"] += 1
            by_service[svc]["amount"] += amt

            details.append({
                "frn": frn.get("frn"),
                "ben": frn.get("ben"),
                "entity_name": frn.get("entity_name"),
                "year": year,
                "amount": amt,
                "category": cat,
                "fcdl_comment": frn.get("fcdl_comment"),
            })

        # Round amounts
        for d in [by_category, by_year, by_service]:
            for v in d.values():
                v["amount"] = round(v["amount"], 2)

        return {
            "total_denials": len(denied),
            "total_denied_amount": round(total_denied_amt, 2),
            "by_category": dict(sorted(by_category.items(), key=lambda x: x[1]["count"], reverse=True)),
            "by_year": dict(sorted(by_year.items(), key=lambda x: x[0], reverse=True)),
            "by_service_type": dict(sorted(by_service.items(), key=lambda x: x[1]["count"], reverse=True)),
            "details": sorted(details, key=lambda d: d["amount"], reverse=True),
        }

    # ==================== INSIGHTS GENERATION ====================

    def _generate_insights(self, summary: dict, denial_analysis: dict, frns: list) -> dict:
        """Generate rule-based strengths, weaknesses, opportunities, recommendations."""
        strengths = []
        weaknesses = []
        opportunities = []
        recommendations = []

        total_frns = summary.get("total_frns", 0)
        success_rate = summary.get("success_rate", 0)
        disbursement_rate = summary.get("disbursement_rate", 0)
        denied_count = summary.get("denied_count", 0)
        funded_count = summary.get("funded_count", 0)
        total_committed = summary.get("total_committed", 0)
        total_denied_amount = summary.get("total_denied_amount", 0)
        money_left = summary.get("money_left_on_table", 0)

        # -- Strengths --
        if success_rate >= 0.9:
            strengths.append(f"{success_rate*100:.0f}% funding success rate across {total_frns} FRNs - excellent track record")
        elif success_rate >= 0.75:
            strengths.append(f"{success_rate*100:.0f}% funding success rate across {total_frns} FRNs - solid performance")
        if disbursement_rate >= 0.8:
            strengths.append(f"{disbursement_rate*100:.0f}% disbursement rate - strong follow-through on funded FRNs")
        if funded_count >= 50:
            strengths.append(f"{funded_count} funded FRNs demonstrate consistent filing history")
        if total_committed >= 1_000_000:
            strengths.append(f"${total_committed:,.0f} in total committed funding")

        # -- Weaknesses --
        if denied_count > 0:
            weaknesses.append(f"{denied_count} denied FRNs totaling ${total_denied_amount:,.0f}")
        if disbursement_rate < 0.5 and funded_count > 0:
            weaknesses.append(f"Only {disbursement_rate*100:.0f}% disbursement rate - significant funded amounts uncollected")
        if success_rate < 0.7 and total_frns > 5:
            weaknesses.append(f"{success_rate*100:.0f}% success rate is below industry average")

        # Top denial category
        by_cat = denial_analysis.get("by_category", {})
        if by_cat:
            top_cat = next(iter(by_cat))
            top_count = by_cat[top_cat]["count"]
            weaknesses.append(f"Most common denial reason: {top_cat} ({top_count} FRNs)")

        # -- Opportunities --
        # FRNs with $0 disbursed that are funded
        zero_disbursed = [
            f for f in frns
            if "funded" in (f.get("current_status") or "").lower()
            and _safe_float(f.get("disbursed_amount")) == 0
            and _safe_float(f.get("committed_amount")) > 0
        ]
        if zero_disbursed:
            total_uncollected = sum(_safe_float(f.get("committed_amount")) for f in zero_disbursed)
            opportunities.append(
                f"{len(zero_disbursed)} funded FRNs with $0 disbursed (${total_uncollected:,.0f}) - ensure invoices are filed before deadlines"
            )

        if money_left > 0:
            opportunities.append(f"${money_left:,.0f} in committed funding not yet disbursed")

        # Recent denials that may be within appeal window
        recent_denied = [
            f for f in frns
            if "denied" in (f.get("current_status") or "").lower()
            and f.get("fcdl_date")
        ]
        if recent_denied:
            opportunities.append(f"{len(recent_denied)} denied FRNs may be eligible for appeal - review FCDL dates for 60-day window")

        # -- Recommendations --
        for cat, info in list(by_cat.items())[:3]:
            recommendations.append(
                f"Review {cat.lower()} process - {info['count']} denial(s) totaling ${info['amount']:,.0f}"
            )
        if disbursement_rate < 0.7 and funded_count > 0:
            recommendations.append("Prioritize invoice filing (BEAR/SPI) for funded FRNs to increase disbursement rate")
        if zero_disbursed:
            recommendations.append(f"File invoices for {len(zero_disbursed)} funded FRNs with $0 disbursed before deadlines expire")

        return {
            "strengths": strengths or ["No notable strengths identified with current data"],
            "weaknesses": weaknesses or ["No notable weaknesses identified"],
            "opportunities": opportunities or ["No immediate opportunities identified"],
            "recommendations": recommendations or ["Continue current filing practices"],
        }

    # ==================== RESPONSE BUILDER ====================

    def _build_response(self, lookup_type: str, lookup_value: str, subject_info: dict, frns: list) -> dict:
        """Build the final response JSON."""
        summary = self._calculate_portfolio_summary(frns)
        status_summary = self._build_status_summary(frns)
        denial_analysis = self._build_denial_analysis(frns)
        insights = self._generate_insights(summary, denial_analysis, frns)

        return {
            "lookup_type": lookup_type,
            "lookup_value": lookup_value,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "subject_info": subject_info,
            "portfolio_summary": summary,
            "frn_status_summary": status_summary,
            "frns": frns,
            "denial_analysis": denial_analysis,
            "insights": insights,
        }

    # ==================== UTILITIES ====================

    @staticmethod
    def _chunk_list(lst: list, size: int) -> list:
        """Split a list into chunks of given size."""
        return [lst[i:i + size] for i in range(0, len(lst), size)]
