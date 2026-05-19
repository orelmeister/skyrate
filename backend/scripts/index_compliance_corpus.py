"""
Index the compliance corpus for RAG retrieval.

Run this once at deploy time or after corpus edits:
    python -m scripts.index_compliance_corpus

Uses in-memory indexing (MySQL fallback mode). The embedding model
(bge-large-en-v1.5, ~1.3GB) is downloaded on first run and cached.
Subsequent runs are fast (<5s for the small corpus).

Advisory only. Not legal or USAC official guidance.
"""

import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def main():
    logger.info("Starting compliance corpus indexing...")
    start = time.time()

    from app.services.compliance.retriever import index_corpus
    count = index_corpus(force=True)

    elapsed = time.time() - start
    if count > 0:
        logger.info("[OK] Indexed %d chunks in %.1fs", count, elapsed)
    else:
        logger.error("[FAIL] No chunks indexed. Check citations.json exists.")
        sys.exit(1)


if __name__ == "__main__":
    main()
