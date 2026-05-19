"""
PDF Text Extractor for Form 470 documents.
Uses PyMuPDF (fitz) to extract text content from uploaded PDF files.
"""

import fitz  # PyMuPDF
import logging
from typing import Optional

logger = logging.getLogger(__name__)

MAX_PAGES = 50  # Safety limit for large PDFs


def extract_text_from_pdf(pdf_bytes: bytes) -> Optional[str]:
    """
    Extract all text content from a PDF file.

    Args:
        pdf_bytes: Raw bytes of the uploaded PDF file.

    Returns:
        Extracted text as a single string, or None if extraction fails.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_process = min(len(doc), MAX_PAGES)

        text_parts: list[str] = []
        for page_num in range(pages_to_process):
            page = doc[page_num]
            page_text = page.get_text("text")
            if page_text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")

        doc.close()

        if not text_parts:
            logger.warning("PDF contained no extractable text")
            return None

        full_text = "\n\n".join(text_parts)
        logger.info(
            "Extracted %d characters from %d pages", len(full_text), pages_to_process
        )
        return full_text

    except Exception as e:
        logger.error("PDF extraction failed: %s", str(e))
        return None
