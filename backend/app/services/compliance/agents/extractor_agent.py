"""
Agent 1: Document Extractor.

Uses Gemini Flash to extract structured data from Form 470 text.
Strict JSON output schema — no free-form generation.

Advisory only. Not legal or USAC official guidance.
"""

import json
import logging
from typing import Optional

import google.generativeai as genai
from pydantic import BaseModel, Field

from ....core.config import get_settings

logger = logging.getLogger(__name__)

MAX_DOC_TOKENS = 12000  # Truncate doc to ~12k tokens for Flash context


class ExtractedEntity(BaseModel):
    """An entity mentioned in the document."""
    name: str
    ben: Optional[str] = None
    role: str = ""  # applicant, consultant, vendor


class ExtractedData(BaseModel):
    """Structured data extracted from the Form 470 document."""
    form_type: str = "Form 470"
    posting_date: Optional[str] = None
    closing_date: Optional[str] = None
    service_categories: list[str] = Field(default_factory=list)
    services_requested: list[str] = Field(default_factory=list)
    entities: list[ExtractedEntity] = Field(default_factory=list)
    evaluation_criteria: list[str] = Field(default_factory=list)
    cost_allocation_mentioned: bool = False
    ineligible_services_mentioned: bool = False
    raw_dates: list[str] = Field(default_factory=list)
    document_length_chars: int = 0


EXTRACTION_PROMPT = """You are a structured data extractor for E-Rate Form 470 documents.
Extract the following fields from the document text. Return ONLY valid JSON matching this schema:

{
  "form_type": "Form 470",
  "posting_date": "YYYY-MM-DD or null",
  "closing_date": "YYYY-MM-DD or null",
  "service_categories": ["Category 1", "Category 2"],
  "services_requested": ["Internet Access", "WAN", ...],
  "entities": [{"name": "...", "ben": "...", "role": "applicant|consultant|vendor"}],
  "evaluation_criteria": ["price", "experience", ...],
  "cost_allocation_mentioned": true/false,
  "ineligible_services_mentioned": true/false,
  "raw_dates": ["any date strings found"],
  "document_length_chars": <integer>
}

Rules:
- If a field cannot be determined, use null or empty array.
- Dates should be ISO format when possible; otherwise put original string in raw_dates.
- service_categories should be "Category 1" and/or "Category 2" only.
- Do NOT hallucinate data not present in the text.

DOCUMENT TEXT:
"""


async def extract_document_data(document_text: str, metadata: dict) -> ExtractedData:
    """
    Run Gemini Flash to extract structured data from document text.

    Args:
        document_text: Raw text from the uploaded document.
        metadata: Upload metadata (filename, etc.)

    Returns:
        ExtractedData with all fields populated.
    """
    settings = get_settings()

    # Truncate to MAX_DOC_TOKENS (~4 chars per token)
    truncated = document_text[:MAX_DOC_TOKENS * 4]

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = EXTRACTION_PROMPT + truncated
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )

        raw_text = response.text.strip()
        # Parse JSON response
        data = json.loads(raw_text)
        data["document_length_chars"] = len(document_text)

        return ExtractedData(**data)

    except json.JSONDecodeError as e:
        logger.error("Extractor JSON parse error: %s", str(e))
        return ExtractedData(document_length_chars=len(document_text))
    except Exception as e:
        logger.error("Extractor agent failed: %s", str(e))
        return ExtractedData(document_length_chars=len(document_text))
