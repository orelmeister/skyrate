#!/usr/bin/env python3
"""
GSC Analyzer — Google Search Console Integration Engine
========================================================
Connects the SkyRate agent swarm to real-time GSC data so agents can
autonomously detect and fix SEO issues across all three domains.

Usage (CLI):
    python gsc_analyzer.py --action errors   [--site URL]
    python gsc_analyzer.py --action queries  [--site URL] [--days 30]
    python gsc_analyzer.py --action inspect  --site https://erateapp.com --url https://erateapp.com/schools.html
    python gsc_analyzer.py --action audit

    # Subcommand style also supported:
    python gsc_analyzer.py errors   [--site URL]
    python gsc_analyzer.py queries  [--site URL] [--days 30]
    python gsc_analyzer.py inspect  --url PAGE_URL [--site URL]

Environment:
    GOOGLE_APPLICATION_CREDENTIALS — path to Service Account JSON
        (default: ../../../.credentials/gsc-key.json relative to this script)
    GSC_DEFAULT_SITE — default property URL (default: sc-domain:erateapp.com)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Google API imports
# ---------------------------------------------------------------------------
try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    sys.exit(
        "ERROR: google-api-python-client or google-auth is not installed.\n"
        "Run:  pip install google-api-python-client google-auth google-auth-httplib2"
    )

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/webmasters",
]

DEFAULT_CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    str(Path(__file__).resolve().parent.parent.parent / ".credentials" / "gsc-key.json"),
)

# All three SkyRate properties (Domain or URL-prefix format)
SKYRATE_SITES = {
    "erateapp":     "sc-domain:erateapp.com",
    "skyrate":      "sc-domain:skyrate.ai",
    "app_erateapp": "sc-domain:app.erateapp.com",
}

DEFAULT_SITE = os.getenv("GSC_DEFAULT_SITE", SKYRATE_SITES["erateapp"])


# ═══════════════════════════════════════════════════════════════════════════
# Authentication
# ═══════════════════════════════════════════════════════════════════════════
def _get_credentials(creds_path: str = DEFAULT_CREDENTIALS_PATH):
    """Load Service Account credentials from a JSON key file."""
    path = Path(creds_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Service Account key not found at {path}.\n"
            f"Place your GSC Service Account JSON at: {path}\n"
            f"Or set the GSC_CREDENTIALS environment variable."
        )
    return service_account.Credentials.from_service_account_file(
        str(path), scopes=SCOPES
    )


def _build_searchconsole(creds_path: str = DEFAULT_CREDENTIALS_PATH):
    """Return an authenticated Search Console API service."""
    creds = _get_credentials(creds_path)
    return build("searchconsole", "v1", credentials=creds)


def _build_webmasters(creds_path: str = DEFAULT_CREDENTIALS_PATH):
    """Return an authenticated Webmasters (v3) API service for search analytics."""
    creds = _get_credentials(creds_path)
    return build("webmasters", "v3", credentials=creds)


# ═══════════════════════════════════════════════════════════════════════════
# Core Function 1: get_indexing_errors()
# ═══════════════════════════════════════════════════════════════════════════
def get_indexing_errors(
    site_url: str = DEFAULT_SITE,
    creds_path: str = DEFAULT_CREDENTIALS_PATH,
) -> dict[str, Any]:
    """
    Fetch pages with indexing problems: Excluded, Errors, Warnings.

    Uses the URL Inspection API in batch mode via the Search Console
    sitemaps endpoint + search analytics to identify problematic pages,
    then inspects each one.

    Returns JSON:
    {
        "site": "...",
        "timestamp": "...",
        "total_errors": N,
        "categories": {
            "crawl_errors":    [...],
            "not_indexed":     [...],
            "mobile_issues":   [...],
            "redirect_issues": [...],
            "soft_404":        [...],
            "other":           [...]
        }
    }
    """
    service = _build_searchconsole(creds_path)

    result: dict[str, Any] = {
        "site": site_url,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "total_errors": 0,
        "categories": {
            "crawl_errors": [],
            "not_indexed": [],
            "mobile_issues": [],
            "redirect_issues": [],
            "soft_404": [],
            "server_errors": [],
            "other": [],
        },
    }

    # ── Step 1: Get sitemaps to discover submitted URLs ──────────────
    try:
        sitemaps_resp = service.sitemaps().list(siteUrl=site_url).execute()
        sitemaps = sitemaps_resp.get("sitemap", [])
        for sm in sitemaps:
            for content in sm.get("contents", []):
                if content.get("type") == "web":
                    errors = int(content.get("errors", 0) or 0)
                    warnings = int(content.get("warnings", 0) or 0)
                    if errors > 0 or warnings > 0:
                        result["categories"]["other"].append({
                            "sitemap": sm.get("path"),
                            "submitted": content.get("submitted"),
                            "indexed": content.get("indexed"),
                            "errors": errors,
                            "warnings": warnings,
                        })
    except HttpError as e:
        result["categories"]["other"].append({
            "error": f"Sitemaps API error: {e.resp.status} {e._get_reason()}"
        })

    # ── Step 2: Inspect known pages for indexing issues ──────────────
    # We gather URLs from search analytics (pages with 0 clicks) as
    # candidates for indexing problems
    try:
        wm = _build_webmasters(creds_path)
        end_date = datetime.utcnow().date()
        start_date = end_date - timedelta(days=30)

        analytics_body = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dimensions": ["page"],
            "rowLimit": 500,
            "dimensionFilterGroups": [
                {
                    "filters": [
                        {
                            "dimension": "page",
                            "operator": "contains",
                            "expression": site_url.replace("sc-domain:", ""),
                        }
                    ]
                }
            ],
        }

        analytics_resp = (
            wm.searchanalytics()
            .query(siteUrl=site_url, body=analytics_body)
            .execute()
        )

        low_performing = [
            row
            for row in analytics_resp.get("rows", [])
            if row.get("clicks", 0) == 0 and row.get("impressions", 0) > 10
        ]

        # Inspect each low-performing page
        for row in low_performing[:25]:  # cap at 25 to stay within quotas
            page_url = row["keys"][0]
            inspection = _inspect_single_url(service, page_url, site_url)
            if inspection and inspection.get("verdict") != "PASS":
                category = _categorize_issue(inspection)
                issue_record = {
                    "url": page_url,
                    "impressions": row.get("impressions", 0),
                    "verdict": inspection.get("verdict"),
                    "coverage_state": inspection.get("coverage_state"),
                    "indexing_state": inspection.get("indexing_state"),
                    "robots_txt_state": inspection.get("robots_txt_state"),
                    "crawled_as": inspection.get("crawled_as"),
                    "last_crawl_time": inspection.get("last_crawl_time"),
                    "referring_urls": inspection.get("referring_urls", []),
                }
                result["categories"][category].append(issue_record)
                result["total_errors"] += 1

    except HttpError as e:
        result["categories"]["other"].append({
            "error": f"Search Analytics API error: {e.resp.status} {e._get_reason()}"
        })

    return result


def _inspect_single_url(
    service, page_url: str, site_url: str
) -> dict[str, Any] | None:
    """Run the URL Inspection API on a single URL and return flattened result."""
    try:
        body = {"inspectionUrl": page_url, "siteUrl": site_url}
        resp = service.urlInspection().index().inspect(body=body).execute()
        result = resp.get("inspectionResult", {})
        index_status = result.get("indexStatusResult", {})
        mobile = result.get("mobileUsabilityResult", {})

        return {
            "verdict": index_status.get("verdict", "UNKNOWN"),
            "coverage_state": index_status.get("coverageState", ""),
            "indexing_state": index_status.get("indexingState", ""),
            "robots_txt_state": index_status.get("robotsTxtState", ""),
            "crawled_as": index_status.get("crawledAs", ""),
            "last_crawl_time": index_status.get("lastCrawlTime", ""),
            "page_fetch_state": index_status.get("pageFetchState", ""),
            "referring_urls": index_status.get("referringUrls", []),
            "mobile_verdict": mobile.get("verdict", "UNKNOWN"),
            "mobile_issues": [
                issue.get("message", "")
                for issue in mobile.get("issues", [])
            ],
        }
    except HttpError:
        return None


def _categorize_issue(inspection: dict) -> str:
    """Classify an inspection result into the right error category."""
    state = (inspection.get("coverage_state") or "").lower()
    verdict = (inspection.get("verdict") or "").lower()

    if "404" in state or "not found" in state:
        return "crawl_errors"
    if "soft 404" in state:
        return "soft_404"
    if "redirect" in state:
        return "redirect_issues"
    if "server error" in state or "5xx" in state:
        return "server_errors"
    if inspection.get("mobile_issues"):
        return "mobile_issues"
    if "noindex" in state or "excluded" in state or verdict == "fail":
        return "not_indexed"
    return "other"


# ═══════════════════════════════════════════════════════════════════════════
# Core Function 2: get_top_queries()
# ═══════════════════════════════════════════════════════════════════════════
def get_top_queries(
    site_url: str = DEFAULT_SITE,
    days: int = 30,
    row_limit: int = 100,
    creds_path: str = DEFAULT_CREDENTIALS_PATH,
) -> dict[str, Any]:
    """
    Fetch top search queries: clicks, impressions, CTR, position.

    Returns JSON:
    {
        "site": "...",
        "period": {"start": "...", "end": "..."},
        "total_queries": N,
        "queries": [
            {
                "query": "e-rate appeal",
                "clicks": 42,
                "impressions": 1200,
                "ctr": 0.035,
                "position": 8.3,
                "opportunity_score": "HIGH"    <-- computed scoring
            },
            ...
        ],
        "summary": {
            "total_clicks": N,
            "total_impressions": N,
            "avg_ctr": 0.XX,
            "avg_position": X.X
        }
    }
    """
    wm = _build_webmasters(creds_path)
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": ["query"],
        "rowLimit": row_limit,
    }

    resp = wm.searchanalytics().query(siteUrl=site_url, body=body).execute()
    rows = resp.get("rows", [])

    queries = []
    total_clicks = 0
    total_impressions = 0

    for row in rows:
        clicks = row.get("clicks", 0)
        impressions = row.get("impressions", 0)
        ctr = row.get("ctr", 0.0)
        position = row.get("position", 0.0)

        total_clicks += clicks
        total_impressions += impressions

        # Opportunity scoring: high-impression, low-position queries
        # are the best candidates for SEO improvement
        opportunity = _score_opportunity(clicks, impressions, position)

        queries.append({
            "query": row["keys"][0],
            "clicks": clicks,
            "impressions": impressions,
            "ctr": round(ctr, 4),
            "position": round(position, 1),
            "opportunity_score": opportunity,
        })

    # Sort by opportunity: HIGH first, then by impressions
    priority = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    queries.sort(key=lambda q: (priority.get(q["opportunity_score"], 4), -q["impressions"]))

    avg_ctr = total_clicks / total_impressions if total_impressions else 0
    avg_pos = sum(q["position"] for q in queries) / len(queries) if queries else 0

    return {
        "site": site_url,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        "total_queries": len(queries),
        "queries": queries,
        "summary": {
            "total_clicks": total_clicks,
            "total_impressions": total_impressions,
            "avg_ctr": round(avg_ctr, 4),
            "avg_position": round(avg_pos, 1),
        },
    }


def _score_opportunity(clicks: int, impressions: int, position: float) -> str:
    """
    Score a query's optimization opportunity.

    CRITICAL: Position 1-3 with low CTR   → title/description problem
    HIGH:     Position 4-10 with high impr → within striking distance of page 1
    MEDIUM:   Position 11-20              → page 2, achievable with effort
    LOW:      Position 20+                → needs significant work
    """
    if position <= 3 and impressions > 50:
        ctr = clicks / impressions if impressions else 0
        if ctr < 0.05:
            return "CRITICAL"  # Top positions but terrible CTR — meta tags broken
    if 4 <= position <= 10 and impressions > 20:
        return "HIGH"
    if 11 <= position <= 20:
        return "MEDIUM"
    return "LOW"


# ═══════════════════════════════════════════════════════════════════════════
# Core Function 3: inspect_url()
# ═══════════════════════════════════════════════════════════════════════════
def inspect_url(
    page_url: str,
    site_url: str = DEFAULT_SITE,
    creds_path: str = DEFAULT_CREDENTIALS_PATH,
) -> dict[str, Any]:
    """
    Deep-inspect a single URL via the URL Inspection API.

    Returns JSON:
    {
        "url": "https://erateapp.com/schools.html",
        "site": "sc-domain:erateapp.com",
        "timestamp": "...",
        "index_status": {
            "verdict": "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL",
            "coverage_state": "Submitted and indexed",
            "indexing_state": "INDEXING_ALLOWED",
            "robots_txt_state": "ALLOWED",
            "page_fetch_state": "SUCCESSFUL",
            "crawled_as": "DESKTOP",
            "last_crawl_time": "2026-03-01T...",
            "referring_urls": [...]
        },
        "mobile_usability": {
            "verdict": "PASS" | "FAIL",
            "issues": [...]
        },
        "rich_results": {
            "verdict": "PASS" | "FAIL",
            "detected_items": [...]
        },
        "recommendations": [...]
    }
    """
    service = _build_searchconsole(creds_path)

    body = {"inspectionUrl": page_url, "siteUrl": site_url}

    try:
        resp = service.urlInspection().index().inspect(body=body).execute()
    except HttpError as e:
        return {
            "url": page_url,
            "site": site_url,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "error": f"API Error {e.resp.status}: {e._get_reason()}",
        }

    result = resp.get("inspectionResult", {})
    index_status = result.get("indexStatusResult", {})
    mobile = result.get("mobileUsabilityResult", {})
    rich = result.get("richResultsResult", {})

    # ── Build recommendations based on issues found ──────────────
    recommendations = _generate_recommendations(index_status, mobile, rich, page_url)

    return {
        "url": page_url,
        "site": site_url,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "index_status": {
            "verdict": index_status.get("verdict", "UNKNOWN"),
            "coverage_state": index_status.get("coverageState", ""),
            "indexing_state": index_status.get("indexingState", ""),
            "robots_txt_state": index_status.get("robotsTxtState", ""),
            "page_fetch_state": index_status.get("pageFetchState", ""),
            "crawled_as": index_status.get("crawledAs", ""),
            "last_crawl_time": index_status.get("lastCrawlTime", ""),
            "google_canonical": index_status.get("googleCanonical", ""),
            "user_canonical": index_status.get("userCanonical", ""),
            "referring_urls": index_status.get("referringUrls", []),
        },
        "mobile_usability": {
            "verdict": mobile.get("verdict", "UNKNOWN"),
            "issues": [
                {
                    "issue": issue.get("issueType", ""),
                    "message": issue.get("message", ""),
                    "severity": issue.get("severity", ""),
                }
                for issue in mobile.get("issues", [])
            ],
        },
        "rich_results": {
            "verdict": rich.get("verdict", "UNKNOWN"),
            "detected_items": [
                {
                    "type": item.get("richResultType", ""),
                    "items": [
                        {
                            "name": ri.get("name", ""),
                            "issues": [
                                iss.get("issueMessage", "")
                                for iss in ri.get("issues", [])
                            ],
                        }
                        for ri in item.get("items", [])
                    ],
                }
                for item in rich.get("detectedItems", [])
            ],
        },
        "recommendations": recommendations,
    }


def _generate_recommendations(
    index_status: dict, mobile: dict, rich: dict, url: str
) -> list[dict[str, str]]:
    """Generate actionable fix recommendations from inspection results."""
    recs: list[dict[str, str]] = []

    # Index status issues
    verdict = index_status.get("verdict", "")
    coverage = (index_status.get("coverageState") or "").lower()

    if verdict == "FAIL" or "excluded" in coverage:
        if "noindex" in coverage:
            recs.append({
                "severity": "CRITICAL",
                "issue": "Page has noindex directive",
                "fix": f"Remove <meta name='robots' content='noindex'> from {url}",
                "agent": "seo_specialist",
            })
        elif "404" in coverage:
            recs.append({
                "severity": "CRITICAL",
                "issue": "Page returns 404",
                "fix": f"Restore page content or add redirect for {url}",
                "agent": "seo_specialist",
            })
        elif "soft 404" in coverage:
            recs.append({
                "severity": "HIGH",
                "issue": "Soft 404 detected — page has thin/no content",
                "fix": f"Add substantial content to {url} or return proper 404 status",
                "agent": "seo_specialist",
            })
        elif "redirect" in coverage:
            recs.append({
                "severity": "MEDIUM",
                "issue": "Redirect issue detected",
                "fix": f"Check redirect chain for {url} — may have loops or too many hops",
                "agent": "seo_specialist",
            })
        elif "server error" in coverage:
            recs.append({
                "severity": "CRITICAL",
                "issue": "Server error (5xx) on crawl",
                "fix": f"Investigate server logs for {url} — page is crashing",
                "agent": "backend_architect" if "skyrate.ai" in url else "seo_specialist",
            })

    # Canonical mismatch
    google_canonical = index_status.get("googleCanonical", "")
    user_canonical = index_status.get("userCanonical", "")
    if google_canonical and user_canonical and google_canonical != user_canonical:
        recs.append({
            "severity": "HIGH",
            "issue": "Canonical mismatch — Google chose a different canonical",
            "fix": (
                f"Your canonical: {user_canonical}\n"
                f"Google's canonical: {google_canonical}\n"
                f"Align <link rel='canonical'> or consolidate duplicate content."
            ),
            "agent": "seo_specialist",
        })

    # Robots.txt blocking
    if index_status.get("robotsTxtState") == "DISALLOWED":
        recs.append({
            "severity": "CRITICAL",
            "issue": "Page blocked by robots.txt",
            "fix": f"Update robots.txt to allow crawling of {url}",
            "agent": "seo_specialist",
        })

    # Mobile usability
    for issue in mobile.get("issues", []):
        recs.append({
            "severity": "HIGH",
            "issue": f"Mobile issue: {issue.get('message', issue.get('issueType', 'Unknown'))}",
            "fix": "Add <meta name='viewport' content='width=device-width, initial-scale=1'> and fix CSS for mobile",
            "agent": "ui_designer" if "skyrate.ai" in url else "seo_specialist",
        })

    # Rich results issues
    for item in rich.get("detectedItems", []):
        for ri in item.get("items", []):
            for iss in ri.get("issues", []):
                recs.append({
                    "severity": "MEDIUM",
                    "issue": f"Rich result issue ({item.get('richResultType', '')}): {iss.get('issueMessage', '')}",
                    "fix": "Fix Schema.org structured data markup",
                    "agent": "seo_specialist",
                })

    if not recs:
        recs.append({
            "severity": "NONE",
            "issue": "No issues detected",
            "fix": "Page is healthy — no action required",
            "agent": "none",
        })

    return recs


# ═══════════════════════════════════════════════════════════════════════════
# Convenience: Audit All SkyRate Domains
# ═══════════════════════════════════════════════════════════════════════════
def full_audit(creds_path: str = DEFAULT_CREDENTIALS_PATH) -> dict[str, Any]:
    """
    Run a complete SEO audit across all three SkyRate domains.
    Returns a combined report suitable for the Master Orchestrator.
    """
    report: dict[str, Any] = {
        "audit_type": "full_skyrate_seo_audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "domains": {},
    }

    for name, site_url in SKYRATE_SITES.items():
        domain_report: dict[str, Any] = {"site": site_url}
        try:
            domain_report["indexing_errors"] = get_indexing_errors(site_url, creds_path)
            domain_report["top_queries"] = get_top_queries(site_url, days=30, creds_path=creds_path)
        except Exception as e:
            domain_report["error"] = str(e)
        report["domains"][name] = domain_report

    return report


# ═══════════════════════════════════════════════════════════════════════════
# CLI Interface
# ═══════════════════════════════════════════════════════════════════════════
def _json_out(data: Any) -> None:
    """Print data as formatted JSON to stdout for agent consumption."""
    print(json.dumps(data, indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SkyRate GSC Analyzer — SEO data bridge for the agent swarm",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples (--action flag style):
  python gsc_analyzer.py --action errors
  python gsc_analyzer.py --action errors --site sc-domain:skyrate.ai
  python gsc_analyzer.py --action queries --days 7 --limit 50
  python gsc_analyzer.py --action inspect --site https://erateapp.com --url https://erateapp.com/schools.html
  python gsc_analyzer.py --action audit

Examples (subcommand style — also supported):
  python gsc_analyzer.py errors
  python gsc_analyzer.py queries --days 7
  python gsc_analyzer.py inspect --url https://erateapp.com/schools.html
  python gsc_analyzer.py audit
        """,
    )

    # ── Top-level --action flag (primary interface per spec) ─────────
    parser.add_argument(
        "--action",
        choices=["errors", "queries", "inspect", "audit"],
        help="Action to perform (errors|queries|inspect|audit)",
    )
    parser.add_argument("--site", default=DEFAULT_SITE, help="GSC property URL")
    parser.add_argument("--url", default=None, help="Full URL to inspect (required for inspect action)")
    parser.add_argument("--days", type=int, default=30, help="Lookback period in days")
    parser.add_argument("--limit", type=int, default=100, help="Max rows to return")
    parser.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

    # ── Subcommand style (also supported for convenience) ───────────
    subparsers = parser.add_subparsers(dest="command", help="Command to execute (alternative to --action)")

    p_errors = subparsers.add_parser("errors", help="Fetch indexing errors")
    p_errors.add_argument("--site", default=DEFAULT_SITE, help="GSC property URL")
    p_errors.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

    p_queries = subparsers.add_parser("queries", help="Fetch top search queries")
    p_queries.add_argument("--site", default=DEFAULT_SITE, help="GSC property URL")
    p_queries.add_argument("--days", type=int, default=30, help="Lookback period in days")
    p_queries.add_argument("--limit", type=int, default=100, help="Max rows to return")
    p_queries.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

    p_inspect = subparsers.add_parser("inspect", help="Inspect a specific URL")
    p_inspect.add_argument("--url", required=True, help="The full URL to inspect")
    p_inspect.add_argument("--site", default=DEFAULT_SITE, help="GSC property URL")
    p_inspect.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

    p_audit = subparsers.add_parser("audit", help="Full audit across all SkyRate domains")
    p_audit.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

    args = parser.parse_args()

    # Resolve action from either --action flag or subcommand
    action = args.action or args.command
    if not action:
        parser.print_help()
        sys.exit(1)

    try:
        if action == "errors":
            _json_out(get_indexing_errors(args.site, args.creds))
        elif action == "queries":
            _json_out(get_top_queries(args.site, args.days, args.limit, args.creds))
        elif action == "inspect":
            if not args.url:
                parser.error("--url is required for the inspect action")
            _json_out(inspect_url(args.url, args.site, args.creds))
        elif action == "audit":
            _json_out(full_audit(args.creds))
    except FileNotFoundError as e:
        _json_out({"error": str(e), "hint": "Set up GSC Service Account credentials first."})
        sys.exit(1)
    except HttpError as e:
        _json_out({"error": f"Google API Error: {e.resp.status} {e._get_reason()}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
