"""
Bid Compliance Copilot models.

Three tables power the vendor-side pre-submission bid compliance tool:

- ``VendorBidAnalysis`` — one uploaded bid + the 470 it targets + the produced
  score, sub-scores, cited findings, refined draft, and refine-chat history.
- ``FccKbChunk`` — the retrieval-augmented knowledge base: chunked, citable
  passages of the FCC rules (47 CFR Part 54 Subpart F), the Eligible Services
  List, and appeal/denial precedents. Retrieval is TF-IDF cosine in Python, so
  no embeddings API or vector DB is required for a corpus this size.
- ``AppealPrecedent`` — a structured index of FCC/USAC appeal & denial fact
  patterns (issue tags + outcome + source URL) the copilot can point to.

All three are created on startup via ``Base.metadata.create_all`` (the app's
existing pattern) plus an Alembic migration — startup-safe.
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON, Text, ForeignKey, Index
from datetime import datetime

from ..core.database import Base


class VendorBidAnalysis(Base):
    """A single vendor bid scored for FCC / E-Rate compliance against a Form 470."""

    __tablename__ = "vendor_bid_analyses"
    __table_args__ = (
        Index("ix_vendor_bid_analyses_vendor_created", "vendor_profile_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_profile_id = Column(
        Integer, ForeignKey("vendor_profiles.id"), nullable=False, index=True
    )

    # Target Form 470 the bid is responding to.
    form_470_number = Column(String(40), nullable=True, index=True)
    ben = Column(String(40), nullable=True)
    funding_year = Column(Integer, nullable=True)
    applicant_name = Column(String(255), nullable=True)

    # Uploaded proposal (parsed to text). Capped before storage — MySQL TEXT is
    # ~64 KB; we only need the substantive text for the refine loop.
    bid_filename = Column(String(255), nullable=True)
    bid_text = Column(Text, nullable=True)

    # Results.
    overall_score = Column(Float, nullable=True)
    subscores_json = Column(JSON, nullable=True)   # [{key,label,weight,score,level}]
    findings_json = Column(JSON, nullable=True)     # [{dimension,level,rule_cite,precedent_id,message,fix}]
    context_json = Column(JSON, nullable=True)      # the 470 context used (services, category, entity)
    sources_json = Column(JSON, nullable=True)      # retrieved KB citations used to ground the analysis

    refined_bid_text = Column(Text, nullable=True)
    chat_history_json = Column(JSON, nullable=True)  # [{role, content, ts}]

    # draft (deterministic only) | scored (AI) | finalized
    status = Column(String(20), nullable=False, default="scored")
    engine = Column(String(40), nullable=True)  # which analysis engine/model produced it

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_summary(self) -> dict:
        return {
            "id": self.id,
            "form_470_number": self.form_470_number,
            "ben": self.ben,
            "funding_year": self.funding_year,
            "applicant_name": self.applicant_name,
            "bid_filename": self.bid_filename,
            "overall_score": self.overall_score,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def to_dict(self) -> dict:
        d = self.to_summary()
        d.update({
            "subscores": self.subscores_json or [],
            "findings": self.findings_json or [],
            "context": self.context_json or {},
            "sources": self.sources_json or [],
            "refined_bid_text": self.refined_bid_text,
            "chat_history": self.chat_history_json or [],
            "engine": self.engine,
            "bid_excerpt": (self.bid_text or "")[:1500],
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        })
        return d


class FccKbChunk(Base):
    """A retrievable, citable passage of the FCC rules / ESL / appeal corpus."""

    __tablename__ = "fcc_kb_chunks"
    __table_args__ = (
        Index("ix_fcc_kb_chunks_source", "source_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    # cfr | esl | fcc_appeal | usac | denial
    source_type = Column(String(20), nullable=False, default="cfr")
    citation = Column(String(160), nullable=True)   # e.g. "47 CFR § 54.511"
    title = Column(String(255), nullable=True)
    url = Column(String(500), nullable=True)
    text = Column(Text, nullable=False)
    funding_year = Column(Integer, nullable=True)    # ESL versioning
    # Stable de-dupe key so re-seeding is idempotent.
    seed_key = Column(String(120), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source_type": self.source_type,
            "citation": self.citation,
            "title": self.title,
            "url": self.url,
            "text": self.text,
            "funding_year": self.funding_year,
        }


class AppealPrecedent(Base):
    """A structured FCC/USAC appeal or denial fact-pattern the copilot can cite."""

    __tablename__ = "appeal_precedents"
    __table_args__ = (
        Index("ix_appeal_precedents_outcome", "outcome"),
    )

    id = Column(Integer, primary_key=True, index=True)
    docket = Column(String(40), nullable=True)          # e.g. "WC 02-6"
    release_id = Column(String(80), nullable=True)       # DA/FCC number or pattern id
    title = Column(String(300), nullable=True)
    issue_tags_json = Column(JSON, nullable=True)        # ["eligibility","bidding",...]
    outcome = Column(String(20), nullable=True)          # granted | denied | remanded | pattern
    summary = Column(Text, nullable=True)
    url = Column(String(500), nullable=True)
    funding_year = Column(Integer, nullable=True)
    seed_key = Column(String(120), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "docket": self.docket,
            "release_id": self.release_id,
            "title": self.title,
            "issue_tags": self.issue_tags_json or [],
            "outcome": self.outcome,
            "summary": self.summary,
            "url": self.url,
            "funding_year": self.funding_year,
        }
