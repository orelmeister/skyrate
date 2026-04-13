"""
PIA Response Model
Handles PIA (Program Integrity Assurance) review responses
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from datetime import datetime

from ..core.database import Base


class PIAResponse(Base):
    """Generated PIA response records for USAC PIA review questions"""
    __tablename__ = "pia_responses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Entity context
    ben = Column(String(20), nullable=True, index=True)
    frn = Column(String(20), nullable=True, index=True)
    funding_year = Column(Integer, default=2026)
    application_number = Column(String(50), nullable=True)
    organization_name = Column(String(255), nullable=True)
    state = Column(String(2), nullable=True)
    entity_type = Column(String(50), nullable=True)

    # PIA specifics
    pia_category = Column(String(50), nullable=False)
    original_question = Column(Text, nullable=False)
    response_text = Column(Text, nullable=True)
    supporting_docs = Column(JSON, default=list)
    strategy = Column(JSON, default=dict)
    chat_history = Column(JSON, default=list)

    # Status lifecycle
    status = Column(String(50), default="draft")
    deadline_date = Column(DateTime, nullable=True)

    # Timestamps
    generated_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    def to_dict(self) -> dict:
        """Return all fields as dict."""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "ben": self.ben,
            "frn": self.frn,
            "funding_year": self.funding_year,
            "application_number": self.application_number,
            "organization_name": self.organization_name,
            "state": self.state,
            "entity_type": self.entity_type,
            "pia_category": self.pia_category,
            "original_question": self.original_question,
            "response_text": self.response_text,
            "supporting_docs": self.supporting_docs or [],
            "strategy": self.strategy or {},
            "chat_history": self.chat_history or [],
            "status": self.status,
            "deadline_date": self.deadline_date.isoformat() if self.deadline_date else None,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
