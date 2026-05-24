"""
ComplianceAnalysis Model
Persists every compliance analysis result for audit history and re-analysis comparison.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from ..core.database import Base


class ComplianceAnalysis(Base):
    __tablename__ = "compliance_analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    form_type = Column(String(16), nullable=False, index=True)
    form_number = Column(String(64), nullable=True, index=True)
    primary_filename = Column(String(255), nullable=False)
    supporting_filenames = Column(JSON, nullable=True)  # list of strings
    overall_risk = Column(String(16), nullable=False)
    summary = Column(Text, nullable=True)
    result_json = Column(JSON, nullable=True)  # full result payload for reanalysis
    engine_version = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    prior_analysis_id = Column(
        Integer, ForeignKey("compliance_analyses.id"), nullable=True
    )
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, index=True
    )

    # Relationships
    user = relationship("User", backref="compliance_analyses")
    prior_analysis = relationship(
        "ComplianceAnalysis", remote_side=[id], backref="reanalyses"
    )
