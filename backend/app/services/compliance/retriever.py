"""
Compliance corpus retriever.
MySQL fallback: stores chunks in-memory with pre-computed embeddings.
No pgvector dependency — pure Python cosine similarity over small corpus.
Migrate to pgvector when corpus exceeds 5k chunks.

Advisory only. Not legal or USAC official guidance.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# In-memory index: populated by index_corpus()
_corpus_index: list[dict] = []
_index_built: bool = False


class CorpusChunk(BaseModel):
    """A single retrieved corpus chunk with relevance score."""
    citation_id: str
    source_url: str
    text: str
    score: float = Field(ge=0.0, le=1.0)


def index_corpus(force: bool = False) -> int:
    """
    Read citations.json, chunk each entry, embed, store in memory.
    Idempotent: skip if already indexed (unless force=True).

    Returns:
        Number of chunks indexed.
    """
    global _corpus_index, _index_built

    if _index_built and not force:
        logger.info("Corpus already indexed (%d chunks), skipping", len(_corpus_index))
        return len(_corpus_index)

    from .embeddings import chunk_text, embed_texts, text_hash

    corpus_path = Path(__file__).parent / "corpus" / "citations.json"
    if not corpus_path.exists():
        logger.error("citations.json not found at %s", corpus_path)
        return 0

    with open(corpus_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    citations = data.get("citations", [])
    if not citations:
        logger.warning("No citations found in corpus file")
        return 0

    # Build chunks
    all_chunks: list[dict] = []
    all_texts: list[str] = []

    for citation in citations:
        citation_id = citation["id"]
        source_url = citation.get("source_url", "")
        text = citation.get("text", "")

        if not text:
            continue

        chunks = chunk_text(text)
        for idx, chunk in enumerate(chunks):
            chunk_hash = text_hash(chunk)
            all_chunks.append({
                "citation_id": citation_id,
                "chunk_index": idx,
                "text": chunk,
                "source_url": source_url,
                "text_hash": chunk_hash,
                "embedding": None,  # filled after batch embed
            })
            all_texts.append(chunk)

    if not all_texts:
        logger.warning("No text chunks generated from corpus")
        return 0

    # Batch embed all chunks
    logger.info("Embedding %d corpus chunks...", len(all_texts))
    embeddings = embed_texts(all_texts)

    for i, emb in enumerate(embeddings):
        all_chunks[i]["embedding"] = emb

    _corpus_index = all_chunks
    _index_built = True
    logger.info("Corpus indexed: %d chunks from %d citations", len(_corpus_index), len(citations))
    return len(_corpus_index)


def retrieve(query: str, k: int = 5) -> list[CorpusChunk]:
    """
    Embed query, run cosine similarity against corpus, return top-k chunks.

    Args:
        query: Search query text.
        k: Number of top results to return.

    Returns:
        List of CorpusChunk with relevance scores.
    """
    from .embeddings import embed_text, cosine_similarity

    if not _index_built or not _corpus_index:
        # Try to index on first call
        index_corpus()
        if not _corpus_index:
            logger.warning("Empty corpus index, cannot retrieve")
            return []

    query_embedding = embed_text(query)

    # Compute cosine similarity against all chunks
    scored: list[tuple[float, dict]] = []
    for chunk in _corpus_index:
        if chunk["embedding"] is None:
            continue
        score = cosine_similarity(query_embedding, chunk["embedding"])
        scored.append((score, chunk))

    # Sort by score descending, take top-k
    scored.sort(key=lambda x: x[0], reverse=True)
    top_k = scored[:k]

    results = []
    for score, chunk in top_k:
        results.append(CorpusChunk(
            citation_id=chunk["citation_id"],
            source_url=chunk["source_url"],
            text=chunk["text"],
            score=round(score, 4),
        ))

    return results


def is_indexed() -> bool:
    """Check if corpus is already indexed in memory."""
    return _index_built


def get_chunk_count() -> int:
    """Return number of indexed chunks."""
    return len(_corpus_index)
