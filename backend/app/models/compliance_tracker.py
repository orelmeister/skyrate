"""
Compliance / Assignment Tracker models.

Turns Ari's 12-phase E-Rate planning calendar (see frontend
`app/compliance/ErateCalendar.tsx`) into an interactive, per-user compliance
tracker: each phase carries required tasks and documents that a user can mark
complete, upload/validate, and track against deadlines.

Three tables:
  * ComplianceTaskTemplate  — versioned master list, seeded from the 12 phases.
  * CompliancePlan          — one instance per user per funding year.
  * ComplianceTask          — the concrete, trackable items inside a plan.

NOTE: This module is intentionally standalone. It is NOT yet imported by
`models/__init__.py` and NOT yet wired into the API router, so importing it has
zero effect on the running app until the tracker is formally shipped.
"""

from datetime import datetime, date

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from ..core.database import Base


# Allowed values kept as plain strings (matches the codebase convention of
# storing short enums as String columns rather than DB-level enums).
TASK_CATEGORIES = ("task", "document")
TASK_STATUSES = ("not_started", "in_progress", "complete", "skipped", "blocked")

# Anchors describe how a template's due date is derived for a given funding year.
TASK_ANCHORS = ("phase_start", "phase_end", "form471_window", "ongoing")


class ComplianceTaskTemplate(Base):
    """Master, seeded definition of a tracker item for a calendar phase."""

    __tablename__ = "compliance_task_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    phase_step = Column(Integer, nullable=False, index=True)  # 1..12
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(16), nullable=False, default="task")  # task|document
    required = Column(Boolean, nullable=False, default=True)
    # For document items, the USAC form/doc type this satisfies (e.g. "470",
    # "471", "472", "474", "486", "500", "CIPA", "contract"). Null for tasks.
    doc_form_type = Column(String(32), nullable=True)
    # Due-date derivation.
    anchor = Column(String(24), nullable=False, default="phase_start")
    offset_days = Column(Integer, nullable=False, default=0)
    sort_order = Column(Integer, nullable=False, default=0)
    version = Column(Integer, nullable=False, default=1, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_task_template_phase_sort", "phase_step", "sort_order"),
    )


class CompliancePlan(Base):
    """A single user's compliance journey for one funding year."""

    __tablename__ = "compliance_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ben = Column(String(32), nullable=True, index=True)
    funding_year = Column(Integer, nullable=False, index=True)
    template_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user = relationship("User", backref="compliance_plans")
    tasks = relationship(
        "ComplianceTask",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="ComplianceTask.phase_step, ComplianceTask.sort_order",
    )

    __table_args__ = (
        UniqueConstraint("user_id", "ben", "funding_year", name="uq_plan_user_ben_fy"),
    )


class ComplianceTask(Base):
    """A concrete, trackable item within a CompliancePlan."""

    __tablename__ = "compliance_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    plan_id = Column(
        Integer, ForeignKey("compliance_plans.id"), nullable=False, index=True
    )
    template_id = Column(
        Integer, ForeignKey("compliance_task_templates.id"), nullable=True
    )
    phase_step = Column(Integer, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(16), nullable=False, default="task")
    required = Column(Boolean, nullable=False, default=True)
    due_date = Column(Date, nullable=True)  # null for ongoing/continuous phases
    status = Column(String(16), nullable=False, default="not_started", index=True)
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Optional link to an uploaded document validated by the compliance engine.
    document_analysis_id = Column(
        Integer, ForeignKey("compliance_analyses.id"), nullable=True
    )
    notes = Column(Text, nullable=True)
    is_custom = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    plan = relationship("CompliancePlan", back_populates="tasks")
    template = relationship("ComplianceTaskTemplate")
    document_analysis = relationship("ComplianceAnalysis")

    @property
    def is_overdue(self) -> bool:
        return (
            self.due_date is not None
            and self.status not in ("complete", "skipped")
            and self.due_date < date.today()
        )
