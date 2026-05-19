"""
Compliance corpus embeddings service.
Uses bge-large-en-v1.5 for 1024-dim vectors on CPU.
MySQL fallback: in-memory cosine similarity over small corpus (<500 chunks).
Migrate to pgvector when corpus exceeds 5k chunks.
"""

import hashlib
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_model = None
_tokenizer = None


def _get_model():
    """Lazy singleton load of BAAI/bge-large-en-v1.5 via sentence-transformers."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading bge-large-en-v1.5 embedding model (first call)...")
        _model = SentenceTransformer("BAAI/bge-large-en-v1.5")
        logger.info("Embedding model loaded successfully")
    return _model


def _get_tokenizer():
    """Get the model's tokenizer for chunk sizing."""
    global _tokenizer
    if _tokenizer is None:
        model = _get_model()
        _tokenizer = model.tokenizer
    return _tokenizer


def embed_text(text: str) -> list[float]:
    """Embed a single text string, returns 1024-dim vector."""
    model = _get_model()
    # bge-large-en-v1.5 recommends prefixing queries with "Represent this sentence:"
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch-embed multiple texts, returns list of 1024-dim vectors."""
    model = _get_model()
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return embeddings.tolist()


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    """
    Token-aware chunking via the model tokenizer.

    Args:
        text: Input text to chunk.
        chunk_size: Target tokens per chunk.
        overlap: Overlap tokens between consecutive chunks.

    Returns:
        List of text chunks.
    """
    tokenizer = _get_tokenizer()
    tokens = tokenizer.encode(text, add_special_tokens=False)

    if len(tokens) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text_decoded = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
        chunks.append(chunk_text_decoded.strip())
        start += chunk_size - overlap

    return chunks


def text_hash(text: str) -> str:
    """SHA-256 hash of text for idempotency checks."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))
