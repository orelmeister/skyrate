"""
Google Search Console Service
Fetches GSC performance data and generates SEO briefs for blog optimization.
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Default credentials path — can be overridden via GSC_CREDENTIALS_PATH env var
_DEFAULT_CREDENTIALS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "authentic-genre-258317-46c9d5fae9ca.json"
)
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
DEFAULT_SITE_URL = "sc-domain:skyrate.ai"


def _get_service():
    """Build and return an authenticated GSC API service client."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds_path = os.environ.get("GSC_CREDENTIALS_PATH", _DEFAULT_CREDENTIALS_PATH)
    creds_path = os.path.normpath(creds_path)

    if not os.path.isfile(creds_path):
        raise FileNotFoundError(
            f"GSC service account credentials not found at {creds_path}. "
            "Set GSC_CREDENTIALS_PATH env var to the correct path."
        )

    credentials = service_account.Credentials.from_service_account_file(
        creds_path, scopes=SCOPES
    )
    return build("searchconsole", "v1", credentials=credentials, cache_discovery=False)


def get_top_queries(
    site_url: str = DEFAULT_SITE_URL,
    days: int = 28,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Get top performing queries by clicks from Google Search Console.

    Returns a list of dicts with keys: query, clicks, impressions, ctr, position.
    """
    service = _get_service()

    end_date = datetime.utcnow().date() - timedelta(days=3)  # GSC data lags ~3 days
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": ["query"],
        "rowLimit": limit,
        "dataState": "final",
    }

    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()
    rows = response.get("rows", [])

    return [
        {
            "query": row["keys"][0],
            "clicks": row["clicks"],
            "impressions": row["impressions"],
            "ctr": round(row["ctr"], 4),
            "position": round(row["position"], 1),
        }
        for row in rows
    ]


def get_opportunities(
    site_url: str = DEFAULT_SITE_URL,
    days: int = 28,
) -> List[Dict[str, Any]]:
    """
    Find keyword opportunities: queries with high impressions but low CTR,
    ranking in positions 5-20 (page 1-2 of Google where improvements yield big gains).

    Returns a list sorted by impressions descending.
    """
    service = _get_service()

    end_date = datetime.utcnow().date() - timedelta(days=3)
    start_date = end_date - timedelta(days=days)

    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": ["query"],
        "rowLimit": 500,
        "dataState": "final",
    }

    response = service.searchanalytics().query(siteUrl=site_url, body=body).execute()
    rows = response.get("rows", [])

    opportunities = []
    for row in rows:
        position = row["position"]
        ctr = row["ctr"]
        impressions = row["impressions"]

        # High-impression queries ranking on page 1-2 with below-expected CTR
        if 5 <= position <= 20 and impressions >= 10 and ctr < 0.05:
            opportunities.append({
                "query": row["keys"][0],
                "clicks": row["clicks"],
                "impressions": row["impressions"],
                "ctr": round(ctr, 4),
                "position": round(position, 1),
                "potential": "high" if impressions >= 50 else "medium",
            })

    opportunities.sort(key=lambda x: x["impressions"], reverse=True)
    return opportunities[:30]


def generate_seo_brief(
    site_url: str = DEFAULT_SITE_URL,
    topic: Optional[str] = None,
    days: int = 28,
) -> Dict[str, Any]:
    """
    Generate an SEO brief with keyword recommendations based on GSC data.

    If a topic is provided, filters queries to those relevant to the topic.
    Returns a dict with target_keywords, related_queries, competitive_context, and raw brief text.
    """
    try:
        top_queries = get_top_queries(site_url, days=days, limit=100)
        opportunities = get_opportunities(site_url, days=days)
    except Exception as e:
        logger.warning(f"Failed to fetch GSC data: {e}")
        return {
            "available": False,
            "error": str(e),
            "brief_text": "",
            "target_keywords": [],
            "related_queries": [],
        }

    # Filter by topic relevance if provided
    if topic:
        topic_lower = topic.lower()
        topic_words = set(topic_lower.split())

        def is_relevant(query: str) -> bool:
            q_lower = query.lower()
            # Direct substring match or shared significant words
            if topic_lower in q_lower or q_lower in topic_lower:
                return True
            q_words = set(q_lower.split())
            return len(topic_words & q_words) >= 1

        relevant_opportunities = [o for o in opportunities if is_relevant(o["query"])]
        relevant_top = [q for q in top_queries if is_relevant(q["query"])]
    else:
        relevant_opportunities = opportunities[:15]
        relevant_top = top_queries[:20]

    # Build the target keywords list (from opportunities — these need improvement)
    target_keywords = [
        {
            "keyword": opp["query"],
            "current_position": opp["position"],
            "impressions": opp["impressions"],
            "potential": opp["potential"],
        }
        for opp in relevant_opportunities[:10]
    ]

    # Build related queries list (from top performing — these already work well)
    related_queries = [
        {
            "query": q["query"],
            "clicks": q["clicks"],
            "position": q["position"],
        }
        for q in relevant_top[:10]
    ]

    # Format the brief as text for injection into AI prompts
    brief_lines = ["## SEO Brief from Google Search Console Data\n"]

    if target_keywords:
        brief_lines.append("### Target Keywords (Opportunities — high impressions, low CTR):")
        for kw in target_keywords:
            brief_lines.append(
                f"- \"{kw['keyword']}\" — Position {kw['current_position']}, "
                f"{kw['impressions']} impressions, potential: {kw['potential']}"
            )
        brief_lines.append("")

    if related_queries:
        brief_lines.append("### Related Queries (Already performing well — include naturally):")
        for rq in related_queries:
            brief_lines.append(
                f"- \"{rq['query']}\" — Position {rq['position']}, {rq['clicks']} clicks"
            )
        brief_lines.append("")

    if target_keywords:
        brief_lines.append("### Instructions for Content Writer:")
        brief_lines.append(
            "- Naturally incorporate the TARGET KEYWORDS above into your content "
            "(headings, first paragraph, body text)."
        )
        brief_lines.append(
            "- Reference the RELATED QUERIES as secondary keywords or synonyms throughout."
        )
        brief_lines.append(
            "- Focus on queries with 'high' potential — these have the most impressions "
            "but we're not capturing clicks yet."
        )

    brief_text = "\n".join(brief_lines)

    return {
        "available": True,
        "target_keywords": target_keywords,
        "related_queries": related_queries,
        "competitive_context": {
            "total_opportunities": len(opportunities),
            "total_top_queries": len(top_queries),
            "date_range_days": days,
        },
        "brief_text": brief_text,
    }
