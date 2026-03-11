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
    python gsc_analyzer.py --action report   [--email david@skyrate.ai]

    # Subcommand style also supported:
    python gsc_analyzer.py errors   [--site URL]
    python gsc_analyzer.py queries  [--site URL] [--days 30]
    python gsc_analyzer.py inspect  --url PAGE_URL [--site URL]
    python gsc_analyzer.py report   [--email david@skyrate.ai]

Environment:
    GOOGLE_APPLICATION_CREDENTIALS — path to Service Account JSON
        (default: ../../../.credentials/gsc-key.json relative to this script)
    GSC_DEFAULT_SITE — default property URL (default: sc-domain:erateapp.com)
"""

from __future__ import annotations

import argparse
import json
import os
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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
    str(Path(__file__).resolve().parent.parent.parent.parent / ".credentials" / "gsc-key.json"),
)

# SkyRate public properties (Domain or URL-prefix format)
# Note: app.erateapp.com is a private CRM — not tracked in GSC
SKYRATE_SITES = {
    "erateapp":     "sc-domain:erateapp.com",
    "skyrate":      "sc-domain:skyrate.ai",
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
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
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
        end_date = datetime.now(timezone.utc).date()
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
    end_date = datetime.now(timezone.utc).date()
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
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
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
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
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
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
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
# Email Report: Generate & Send HTML SEO Report
# ═══════════════════════════════════════════════════════════════════════════

# SMTP config — reads from env vars or skyrate.ai backend .env
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _load_env_file() -> dict[str, str]:
    """Load key=value pairs from .env file (simple parser, no lib needed)."""
    env: dict[str, str] = {}
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def _get_smtp_config() -> dict[str, str]:
    """Resolve SMTP config from environment or .env file."""
    env = _load_env_file()
    return {
        "host": os.getenv("SMTP_HOST", env.get("SMTP_HOST", "smtp.gmail.com")),
        "port": int(os.getenv("SMTP_PORT", env.get("SMTP_PORT", "587"))),
        "user": os.getenv("SMTP_USER", env.get("SMTP_USER", "")),
        "password": os.getenv("SMTP_PASSWORD", env.get("SMTP_PASSWORD", "")),
        "from_email": os.getenv("FROM_EMAIL", env.get("FROM_EMAIL", "alerts@skyrate.ai")),
    }


def _build_html_report(audit_data: dict[str, Any]) -> str:
    """
    Build a styled HTML email report from the full audit data.
    Returns a complete HTML document suitable for email clients.
    """
    timestamp = audit_data.get("timestamp", datetime.now(timezone.utc).isoformat())

    # ── Per-domain sections ──
    domain_sections = ""
    total_clicks_all = 0
    total_impressions_all = 0
    total_queries_all = 0
    critical_items = []

    for name, domain_data in audit_data.get("domains", {}).items():
        if "error" in domain_data:
            domain_sections += f"""
            <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:16px;margin:16px 0;border-radius:4px;">
                <h3 style="color:#991B1B;margin:0 0 8px 0;">{name}</h3>
                <p style="color:#991B1B;margin:0;">Error: {domain_data['error']}</p>
            </div>"""
            continue

        queries = domain_data.get("top_queries", {})
        errors = domain_data.get("indexing_errors", {})
        summary = queries.get("summary", {})
        period = queries.get("period", {})
        query_list = queries.get("queries", [])

        total_clicks = summary.get("total_clicks", 0)
        total_impressions = summary.get("total_impressions", 0)
        avg_ctr = summary.get("avg_ctr", 0)
        avg_position = summary.get("avg_position", 0)
        total_errors = errors.get("total_errors", 0)

        total_clicks_all += total_clicks
        total_impressions_all += total_impressions
        total_queries_all += queries.get("total_queries", 0)

        # Color-code CTR
        ctr_color = "#EF4444" if avg_ctr < 0.01 else "#F59E0B" if avg_ctr < 0.03 else "#10B981"
        clicks_color = "#EF4444" if total_clicks == 0 else "#10B981"

        # Find critical/high opportunity queries
        for q in query_list:
            if q.get("opportunity_score") in ("CRITICAL", "HIGH"):
                critical_items.append({
                    "domain": name,
                    "query": q["query"],
                    "impressions": q["impressions"],
                    "position": q["position"],
                    "score": q["opportunity_score"],
                })

        # Build query table rows
        query_rows = ""
        for q in query_list[:15]:
            opp = q.get("opportunity_score", "LOW")
            opp_badge_color = {
                "CRITICAL": "#DC2626", "HIGH": "#EA580C",
                "MEDIUM": "#CA8A04", "LOW": "#6B7280"
            }.get(opp, "#6B7280")
            query_rows += f"""
                <tr style="border-bottom:1px solid #E5E7EB;">
                    <td style="padding:8px 12px;font-size:13px;">{q['query']}</td>
                    <td style="padding:8px 12px;text-align:center;font-size:13px;">{q['impressions']}</td>
                    <td style="padding:8px 12px;text-align:center;font-size:13px;color:{clicks_color};font-weight:600;">{q['clicks']}</td>
                    <td style="padding:8px 12px;text-align:center;font-size:13px;">{q['position']:.1f}</td>
                    <td style="padding:8px 6px;text-align:center;">
                        <span style="background:{opp_badge_color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">{opp}</span>
                    </td>
                </tr>"""

        # Error summary
        error_section = ""
        if total_errors > 0:
            error_section = f"""
            <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:12px;margin:12px 0;border-radius:4px;">
                <strong style="color:#991B1B;">{total_errors} Indexing Issue{'s' if total_errors != 1 else ''} Detected</strong>
            </div>"""

        domain_sections += f"""
        <div style="background:white;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0;overflow:hidden;">
            <div style="background:#1E293B;padding:16px 20px;">
                <h2 style="color:white;margin:0;font-size:18px;">{domain_data.get('site', name)}</h2>
                <p style="color:#94A3B8;margin:4px 0 0 0;font-size:13px;">{period.get('start', '')} to {period.get('end', '')}</p>
            </div>
            <div style="display:flex;padding:16px 20px;gap:16px;flex-wrap:wrap;">
                <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:#F8FAFC;border-radius:8px;">
                    <div style="font-size:28px;font-weight:700;color:{clicks_color};">{total_clicks}</div>
                    <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Clicks</div>
                </div>
                <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:#F8FAFC;border-radius:8px;">
                    <div style="font-size:28px;font-weight:700;color:#1E293B;">{total_impressions:,}</div>
                    <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Impressions</div>
                </div>
                <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:#F8FAFC;border-radius:8px;">
                    <div style="font-size:28px;font-weight:700;color:{ctr_color};">{avg_ctr:.1%}</div>
                    <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Avg CTR</div>
                </div>
                <div style="flex:1;min-width:100px;text-align:center;padding:12px;background:#F8FAFC;border-radius:8px;">
                    <div style="font-size:28px;font-weight:700;color:#1E293B;">{avg_position:.1f}</div>
                    <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;">Avg Position</div>
                </div>
            </div>
            {error_section}
            <div style="padding:0 20px 20px 20px;">
                <h3 style="margin:16px 0 8px 0;font-size:15px;color:#1E293B;">Top Queries</h3>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#F8FAFC;border-bottom:2px solid #E5E7EB;">
                            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748B;text-transform:uppercase;">Query</th>
                            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748B;text-transform:uppercase;">Impr</th>
                            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748B;text-transform:uppercase;">Clicks</th>
                            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748B;text-transform:uppercase;">Pos</th>
                            <th style="padding:8px 6px;text-align:center;font-size:12px;color:#64748B;text-transform:uppercase;">Opp</th>
                        </tr>
                    </thead>
                    <tbody>{query_rows}</tbody>
                </table>
            </div>
        </div>"""

    # ── Action items section ──
    action_section = ""
    if critical_items:
        action_rows = ""
        for item in critical_items:
            badge_color = "#DC2626" if item["score"] == "CRITICAL" else "#EA580C"
            action_rows += f"""
                <tr style="border-bottom:1px solid #E5E7EB;">
                    <td style="padding:8px 12px;font-size:13px;">
                        <span style="background:{badge_color};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">{item['score']}</span>
                    </td>
                    <td style="padding:8px 12px;font-size:13px;">{item['domain']}</td>
                    <td style="padding:8px 12px;font-size:13px;font-weight:600;">{item['query']}</td>
                    <td style="padding:8px 12px;text-align:center;font-size:13px;">{item['impressions']}</td>
                    <td style="padding:8px 12px;text-align:center;font-size:13px;">{item['position']:.1f}</td>
                </tr>"""
        action_section = f"""
        <div style="background:white;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0;overflow:hidden;">
            <div style="background:#7C3AED;padding:16px 20px;">
                <h2 style="color:white;margin:0;font-size:18px;">Action Items ({len(critical_items)})</h2>
            </div>
            <div style="padding:16px 20px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#F8FAFC;border-bottom:2px solid #E5E7EB;">
                            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748B;">Priority</th>
                            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748B;">Domain</th>
                            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748B;">Query</th>
                            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748B;">Impr</th>
                            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#64748B;">Pos</th>
                        </tr>
                    </thead>
                    <tbody>{action_rows}</tbody>
                </table>
            </div>
        </div>"""

    # ── Assemble full HTML ──
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:20px;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border-radius:12px 12px 0 0;padding:28px 24px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">SkyRate SEO Monitor</h1>
            <p style="color:#94A3B8;margin:8px 0 0 0;font-size:14px;">Weekly Search Performance Report</p>
            <p style="color:#64748B;margin:4px 0 0 0;font-size:12px;">{timestamp[:10]}</p>
        </div>

        <!-- Executive Summary -->
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:0 0 12px 12px;padding:16px 24px;margin-bottom:8px;">
            <p style="margin:0;font-size:14px;color:#1E40AF;">
                <strong>Summary:</strong> {total_queries_all} queries tracked | {total_impressions_all:,} total impressions | {total_clicks_all} total clicks |
                {len(critical_items)} action item{'s' if len(critical_items) != 1 else ''}
            </p>
        </div>

        {action_section}
        {domain_sections}

        <!-- Footer -->
        <div style="text-align:center;padding:24px;color:#94A3B8;font-size:12px;">
            <p>SkyRate LLC | 30 N Gould St Ste N, Sheridan, WY 82801</p>
            <p>Generated by gsc_analyzer.py | Data source: Google Search Console API</p>
        </div>
    </div>
</body>
</html>"""


def send_report_email(
    audit_data: dict[str, Any],
    to_email: str = "david@skyrate.ai",
    creds_path: str = DEFAULT_CREDENTIALS_PATH,
) -> dict[str, Any]:
    """
    Generate an HTML report from audit data and send it via email.

    Returns:
        {"success": True/False, "message": "...", "to": "..."}
    """
    smtp_cfg = _get_smtp_config()

    if not smtp_cfg["user"] or not smtp_cfg["password"]:
        return {
            "success": False,
            "message": "SMTP credentials not configured. Set SMTP_USER and SMTP_PASSWORD.",
            "to": to_email,
        }

    html_body = _build_html_report(audit_data)

    # Build summary line for subject
    total_clicks = 0
    total_impressions = 0
    for domain_data in audit_data.get("domains", {}).values():
        s = domain_data.get("top_queries", {}).get("summary", {})
        total_clicks += s.get("total_clicks", 0)
        total_impressions += s.get("total_impressions", 0)

    date_str = datetime.now(timezone.utc).strftime("%b %d, %Y")
    subject = f"SEO Report {date_str} — {total_impressions:,} impressions, {total_clicks} clicks"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"SkyRate SEO Monitor <{smtp_cfg['from_email']}>"
    msg["To"] = to_email

    # Plain text fallback
    plain = f"SkyRate SEO Report for {date_str}\n\n"
    plain += f"Total impressions: {total_impressions:,}\nTotal clicks: {total_clicks}\n\n"
    plain += "View the full HTML report in a compatible email client."

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        server = smtplib.SMTP(smtp_cfg["host"], int(smtp_cfg["port"]))
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_cfg["user"], smtp_cfg["password"])
        server.sendmail(smtp_cfg["from_email"], [to_email], msg.as_string())
        server.quit()
        return {
            "success": True,
            "message": f"Report sent to {to_email}",
            "to": to_email,
            "subject": subject,
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"SMTP error: {str(e)}",
            "to": to_email,
        }


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
  python gsc_analyzer.py --action report
  python gsc_analyzer.py --action report --email someone@example.com

Examples (subcommand style — also supported):
  python gsc_analyzer.py errors
  python gsc_analyzer.py queries --days 7
  python gsc_analyzer.py inspect --url https://erateapp.com/schools.html
  python gsc_analyzer.py audit
  python gsc_analyzer.py report --email someone@example.com
        """,
    )

    # ── Top-level --action flag (primary interface per spec) ─────────
    parser.add_argument(
        "--action",
        choices=["errors", "queries", "inspect", "audit", "report"],
        help="Action to perform (errors|queries|inspect|audit|report)",
    )
    parser.add_argument("--site", default=DEFAULT_SITE, help="GSC property URL")
    parser.add_argument("--url", default=None, help="Full URL to inspect (required for inspect action)")
    parser.add_argument("--days", type=int, default=30, help="Lookback period in days")
    parser.add_argument("--limit", type=int, default=100, help="Max rows to return")
    parser.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")
    parser.add_argument("--email", default="david@skyrate.ai", help="Email recipient for report action")

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

    p_report = subparsers.add_parser("report", help="Run full audit and email HTML report")
    p_report.add_argument("--email", default="david@skyrate.ai", help="Recipient email address")
    p_report.add_argument("--creds", default=DEFAULT_CREDENTIALS_PATH, help="Path to SA JSON key")

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
        elif action == "report":
            print("Running full audit...")
            audit_data = full_audit(args.creds)
            print("Generating and sending email report...")
            result = send_report_email(audit_data, to_email=args.email, creds_path=args.creds)
            _json_out(result)
            if result["success"]:
                print(f"\n[OK] Report sent to {result['to']}")
            else:
                print(f"\n[FAIL] {result['message']}")
                sys.exit(1)
    except FileNotFoundError as e:
        _json_out({"error": str(e), "hint": "Set up GSC Service Account credentials first."})
        sys.exit(1)
    except HttpError as e:
        _json_out({"error": f"Google API Error: {e.resp.status} {e._get_reason()}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
