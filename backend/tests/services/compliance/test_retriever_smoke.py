"""
Smoke test for compliance corpus retriever.
Requires sentence-transformers model loaded — skipped in CI.

Advisory only. Not legal or USAC official guidance.
"""

import pytest


@pytest.mark.integration
def test_retrieve_28_day_rule():
    """Query '28 day waiting period' returns chunk referencing 54.504."""
    from app.services.compliance.retriever import retrieve, index_corpus

    # Index corpus first
    count = index_corpus(force=True)
    assert count > 0, "Corpus must index at least one chunk"

    # Query
    results = retrieve("28 day waiting period", k=3)
    assert len(results) > 0, "Should return at least one chunk"

    # At least one result should reference 54.504 or 28-day
    found = any(
        "54.504" in r.source_url or "28" in r.text.lower()
        for r in results
    )
    assert found, "Expected a chunk mentioning 47 CFR 54.504 or 28-day rule"


@pytest.mark.integration
def test_corpus_chunk_count():
    """Verify corpus has expected number of citations."""
    from app.services.compliance.retriever import index_corpus, get_chunk_count

    index_corpus(force=True)
    count = get_chunk_count()
    # 7 citations, each produces at least 1 chunk
    assert count >= 7, f"Expected at least 7 chunks, got {count}"
