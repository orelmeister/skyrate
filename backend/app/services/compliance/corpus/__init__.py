"""
RAG Corpus — Citation lookup for compliance rule grounding.
Phase 1: Simple JSON-based lookup keyed by rule_id.
Phase 2 will add pgvector embeddings for semantic search.
"""

import json
import os
from typing import Optional

_CORPUS: Optional[dict] = None
_CORPUS_PATH = os.path.join(os.path.dirname(__file__), "citations.json")


def load_corpus() -> dict:
    """
    Load the citation corpus from JSON.
    Returns dict keyed by citation_id with full citation metadata.
    Caches in module-level variable after first load.
    """
    global _CORPUS
    if _CORPUS is not None:
        return _CORPUS

    with open(_CORPUS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    _CORPUS = {entry["id"]: entry for entry in data["citations"]}
    return _CORPUS


def get_citation(citation_id: str) -> Optional[dict]:
    """Get a single citation by its ID."""
    corpus = load_corpus()
    return corpus.get(citation_id)


def get_citations_for_rule(rule_id: str) -> list[dict]:
    """Get all citations mapped to a specific rule_id."""
    corpus = load_corpus()
    return [
        entry for entry in corpus.values()
        if rule_id in entry.get("applicable_rules", [])
    ]
