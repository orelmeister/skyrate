# GSC-Powered Blog Generation Pipeline — Design Proposal

> **Status**: Pending Implementation | **Date**: March 11, 2026
> **Repo**: skyrate.ai/backend | **Author**: Master Orchestrator

---

## Overview

Feed **real Google Search Console data** into the LLM prompt so every blog post is written with knowledge of what people actually search for, where SkyRate currently ranks, and where the biggest SEO opportunities are.

## Current State

| Component | Location | What it does |
|---|---|---|
| Blog Generator | `backend/app/services/blog_service.py` | Takes topic + keyword → sends static prompt to Gemini/DeepSeek → returns HTML blog post |
| Blog API | `backend/app/api/v1/blog.py` | `POST /admin/generate` — accepts `topic`, `target_keyword`, `additional_instructions` |
| GSC Analyzer | `backend/scripts/gsc_analyzer.py` | `get_top_queries()` — fetches queries with clicks, impressions, CTR, position, opportunity score (CRITICAL/HIGH/MEDIUM/LOW) |

**Problem:** These two systems don't talk to each other. The blog generator has no idea what real users are searching for or where SkyRate ranks.

## Architecture

```
Admin clicks "Generate Blog" (topic + keyword)
    │
    ▼
┌─────────────────────────────────────────────┐
│  Blog API  (blog.py)                         │
│  use_gsc_data: true (new flag)               │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  GSC Service  (NEW: gsc_service.py)          │
│  1. Calls get_top_queries() from GSC API     │
│  2. Filters queries relevant to topic        │
│  3. Builds "SEO Intelligence Brief"          │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Blog Service  (blog_service.py)             │
│  Injects SEO Brief into LLM prompt:         │
│                                              │
│  [System Prompt]                             │
│  + [SEO Intelligence Brief] ← NEW           │
│  + [User Prompt with topic/keyword]          │
│                                              │
│  → Sends to Gemini/DeepSeek                  │
│  → LLM writes post INFORMED by real data     │
└─────────────────────────────────────────────┘
```

## SEO Intelligence Brief (Example)

Between the existing system prompt and user prompt, a new section gets injected:

```
═══════════════════════════════════════════════════════════
SEO INTELLIGENCE BRIEF — Google Search Console (Last 30 Days)
═══════════════════════════════════════════════════════════

TARGET KEYWORD PERFORMANCE:
  "e-rate form 470"           | Pos: 6.2  | Impr: 890  | CTR: 4.1% | HIGH
  "form 470 filing"           | Pos: 11.3 | Impr: 340  | CTR: 1.8% | MEDIUM
  "e-rate form 470 deadline"  | Pos: 8.7  | Impr: 520  | CTR: 3.2% | HIGH

RELATED QUERIES (people also search for):
  "e-rate competitive bidding" | Pos: 14.2 | Impr: 280  | CTR: 0.9% | MEDIUM
  "e-rate vendor selection"    | Pos: 18.1 | Impr: 190  | CTR: 0.5% | MEDIUM

AI WRITING INSTRUCTIONS (based on data):
1. PRIMARY: "e-rate form 470" (position 6.2 — almost top 5)
   → Use exact phrase in H1, first paragraph, and 2+ H2 headings
2. SECONDARY: "form 470 filing", "e-rate form 470 deadline"
   → Include 2-3 times each; dedicate one section to deadlines
3. SEMANTIC: "competitive bidding", "vendor selection"
   → Mention briefly for topical depth / long-tail capture
4. TITLE: CTR is only 4.1% at position 6.2 — write action-oriented
   title with year (2026) to improve click-through rate
5. META: Make meta description compelling with clear value prop + CTA
═══════════════════════════════════════════════════════════
```

## File Changes

| Action | File | What Changes |
|---|---|---|
| **CREATE** | `backend/app/services/gsc_service.py` | New service wrapping `gsc_analyzer.py` — async query fetching, relevance filtering, SEO brief builder, topic suggestions |
| **MODIFY** | `backend/app/services/blog_service.py` | Add `use_gsc` + `target_site` params to `generate_blog_with_ai()`, inject SEO brief into prompt |
| **MODIFY** | `backend/app/api/v1/blog.py` | Add `use_gsc_data` + `target_site` to `BlogGenerateRequest`, new `GET /admin/gsc-suggestions` endpoint |
| **UNCHANGED** | `backend/scripts/gsc_analyzer.py` | Stays as-is — the service imports from it |
| **UNCHANGED** | `backend/app/models/blog.py` | Stays as-is — `ai_prompt_used` already stores the full prompt |

## Key Functions

### gsc_service.py (NEW)

```python
async def get_seo_insights(site, days, limit) -> dict
    # Async wrapper around get_top_queries() via run_in_executor

def filter_queries_for_topic(queries, topic, keyword) -> dict
    # Returns: exact_matches, related_matches, top_opportunities

async def build_seo_brief(topic, keyword, site) -> str
    # Orchestrates fetch + filter → formatted text block for prompt

async def get_topic_suggestions(site, days) -> list
    # Returns CRITICAL/HIGH queries as blog topic recommendations
```

### blog_service.py (MODIFIED)

```python
async def generate_blog_with_ai(
    topic, target_keyword, additional_instructions="",
    preferred_model="gemini",
    use_gsc=False,          # NEW
    target_site="erateapp"  # NEW
) -> dict
```

### blog.py API (MODIFIED)

```python
class BlogGenerateRequest(BaseModel):
    topic: str
    target_keyword: str
    additional_instructions: str = ""
    preferred_model: str = "gemini"
    auto_publish: bool = True
    use_gsc_data: bool = True    # NEW
    target_site: str = "erateapp" # NEW
```

New endpoint: `GET /api/blog/admin/gsc-suggestions`

```json
{
  "suggestions": [
    {
      "primary_keyword": "e-rate appeal",
      "opportunity": "HIGH",
      "position": 8.3,
      "impressions": 1200,
      "ctr": 0.035,
      "related_keywords": ["e-rate appeal letter", "e-rate appeal deadline"],
      "rationale": "Position 8.3 with 1,200 impressions. A targeted blog post could push to top 5."
    }
  ]
}
```

## Implementation Phases

| Phase | What | Effort |
|---|---|---|
| **Phase 1** | GSC service + enriched prompt + `use_gsc_data` flag | ~2 hours |
| **Phase 2** | `GET /admin/gsc-suggestions` endpoint | ~1 hour |
| **Phase 3** | Frontend UI for topic suggestions in admin dashboard | ~2 hours |
| **Phase 4** | Redis caching of GSC data (1-hour TTL) | ~30 min |

## Safeguards

- **Graceful fallback**: If GSC API fails or credentials aren't configured, generation proceeds normally without the SEO brief
- **Prompt size cap**: GSC brief limited to top 10 queries (~500 tokens) to avoid overwhelming the LLM
- **Async-safe**: GSC API calls wrapped in `run_in_executor()` (same pattern already used for Gemini/DeepSeek)
- **No new dependencies**: `google-api-python-client` and `google-auth` already used by `gsc_analyzer.py`
