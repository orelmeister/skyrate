"""
Base models for the deterministic compliance rule engine.
All rules return RuleFinding instances with FCC/USAC citations.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Severity(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class RuleFinding(BaseModel):
    """A single deterministic rule finding with full citation chain."""

    rule_id: str = Field(..., description="Unique rule identifier, e.g. RULE-001")
    rule_version: str = Field(..., description="Semantic version of the rule logic")
    severity: Severity
    area: str = Field(..., description="Compliance area (e.g. Competitive Bidding)")
    description: str
    suggestion: str
    rule_reference: str = Field(
        ..., description="FCC/USAC regulatory citation"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0,
        description="Confidence score 0-1 for this finding"
    )
    evidence_snippet: Optional[str] = Field(
        None, description="Text excerpt that triggered the rule"
    )
