"""
Compliance / Assignment Tracker API.

Turns Ari's 12-phase E-Rate calendar into a per-user, per-funding-year checklist:
get-or-create a plan, mark tasks complete, add custom tasks, and read compliance
roll-ups (per phase + overall, overdue and upcoming deadlines).

Brand-agnostic: the same endpoints back both the SkyRate and white-labeled
erateapp front doors (shared user base, shared DB).

NOTE: This router is NOT yet registered in `app/main.py`. Registration + an
Alembic migration for the tracker tables are the final steps to ship it.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...core.security import get_current_user
from ...core.database import get_db
from ...models.user import User
from ...models.compliance_tracker import (
    CompliancePlan,
    ComplianceTask,
    TASK_STATUSES,
    TASK_CATEGORIES,
)
from ...services.compliance.tracker_seed import (
    get_templates,
    compute_due_date,
    TEMPLATE_VERSION,
    PHASE_MONTHS,
)

router = APIRouter(prefix="/compliance/tracker", tags=["Compliance Tracker"])


# ==================== SCHEMAS ====================

class TaskOut(BaseModel):
    id: int
    phase_step: int
    title: str
    category: str
    required: bool
    due_date: Optional[date]
    status: str
    is_overdue: bool
    document_analysis_id: Optional[int]
    notes: Optional[str]
    is_custom: bool
    sort_order: int


class PhaseGroup(BaseModel):
    phase_step: int
    total: int
    required_total: int
    complete: int
    required_complete: int
    percent: int
    overdue: int
    next_due: Optional[date]
    tasks: List[TaskOut]


class PlanOut(BaseModel):
    plan_id: int
    funding_year: int
    ben: Optional[str]
    overall_percent: int
    required_total: int
    required_complete: int
    overdue_total: int
    phases: List[PhaseGroup]


class StatusUpdate(BaseModel):
    status: str


class NewTask(BaseModel):
    phase_step: int = Field(ge=1, le=12)
    title: str = Field(min_length=1, max_length=255)
    category: str = "task"
    due_date: Optional[date] = None
    required: bool = False


class TaskPatch(BaseModel):
    due_date: Optional[date] = None
    notes: Optional[str] = None


# ==================== HELPERS ====================

def _default_funding_year(today: Optional[date] = None) -> int:
    """The funding year whose planning cycle is currently active.

    Planning (steps 1-6, months 7-12) runs in the calendar year before the FY
    starts, so from July onward we are planning next year's funding year.
    """
    today = today or date.today()
    return today.year + 1 if today.month >= 7 else today.year


def _instantiate_tasks(plan: CompliancePlan) -> List[ComplianceTask]:
    """Build ComplianceTask rows for a fresh plan from the seed templates."""
    tasks: List[ComplianceTask] = []
    for tpl in get_templates(TEMPLATE_VERSION):
        due = compute_due_date(
            phase_step=tpl["phase_step"],
            anchor=tpl["anchor"],
            offset_days=tpl["offset_days"],
            funding_year=plan.funding_year,
        )
        tasks.append(
            ComplianceTask(
                plan_id=plan.id,
                template_id=None,
                phase_step=tpl["phase_step"],
                title=tpl["title"],
                category=tpl["category"],
                required=tpl["required"],
                due_date=due,
                status="not_started",
                sort_order=tpl["sort_order"],
            )
        )
    return tasks


def _get_or_create_plan(
    db: Session, user_id: int, funding_year: int
) -> CompliancePlan:
    plan = (
        db.query(CompliancePlan)
        .filter(
            CompliancePlan.user_id == user_id,
            CompliancePlan.funding_year == funding_year,
            CompliancePlan.ben.is_(None),
        )
        .first()
    )
    if plan:
        return plan

    plan = CompliancePlan(
        user_id=user_id,
        funding_year=funding_year,
        template_version=TEMPLATE_VERSION,
    )
    db.add(plan)
    db.flush()  # assign plan.id
    for t in _instantiate_tasks(plan):
        db.add(t)
    db.commit()
    db.refresh(plan)
    return plan


def _task_out(t: ComplianceTask) -> TaskOut:
    return TaskOut(
        id=t.id,
        phase_step=t.phase_step,
        title=t.title,
        category=t.category,
        required=t.required,
        due_date=t.due_date,
        status=t.status,
        is_overdue=t.is_overdue,
        document_analysis_id=t.document_analysis_id,
        notes=t.notes,
        is_custom=t.is_custom,
        sort_order=t.sort_order,
    )


def _build_plan_out(plan: CompliancePlan) -> PlanOut:
    by_phase: dict[int, List[ComplianceTask]] = {}
    for t in plan.tasks:
        by_phase.setdefault(t.phase_step, []).append(t)

    phases: List[PhaseGroup] = []
    req_total = req_complete = overdue_total = 0

    for step in sorted(PHASE_MONTHS.keys()):
        tasks = sorted(
            by_phase.get(step, []), key=lambda x: (x.sort_order, x.id)
        )
        p_req = [t for t in tasks if t.required]
        p_req_done = [t for t in p_req if t.status == "complete"]
        p_done = [t for t in tasks if t.status == "complete"]
        p_overdue = [t for t in tasks if t.is_overdue]
        upcoming_due = sorted(
            [t.due_date for t in tasks if t.due_date and t.status != "complete"]
        )
        percent = round(len(p_req_done) / len(p_req) * 100) if p_req else 100

        req_total += len(p_req)
        req_complete += len(p_req_done)
        overdue_total += len(p_overdue)

        phases.append(
            PhaseGroup(
                phase_step=step,
                total=len(tasks),
                required_total=len(p_req),
                complete=len(p_done),
                required_complete=len(p_req_done),
                percent=percent,
                overdue=len(p_overdue),
                next_due=upcoming_due[0] if upcoming_due else None,
                tasks=[_task_out(t) for t in tasks],
            )
        )

    overall = round(req_complete / req_total * 100) if req_total else 100
    return PlanOut(
        plan_id=plan.id,
        funding_year=plan.funding_year,
        ben=plan.ben,
        overall_percent=overall,
        required_total=req_total,
        required_complete=req_complete,
        overdue_total=overdue_total,
        phases=phases,
    )


# ==================== ENDPOINTS ====================

@router.get("/plan", response_model=PlanOut)
def get_plan(
    funding_year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get (or lazily create) the current user's tracker plan for a funding year."""
    fy = funding_year or _default_funding_year()
    plan = _get_or_create_plan(db, current_user.id, fy)
    return _build_plan_out(plan)


@router.get("/summary")
def get_summary(
    funding_year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compact roll-up: overall %, overdue and next-30-day deadlines."""
    fy = funding_year or _default_funding_year()
    plan = _get_or_create_plan(db, current_user.id, fy)
    out = _build_plan_out(plan)

    today = date.today()
    horizon = date.fromordinal(today.toordinal() + 30)
    overdue = []
    upcoming = []
    for ph in out.phases:
        for t in ph.tasks:
            if t.status == "complete" or not t.due_date:
                continue
            if t.due_date < today:
                overdue.append(t)
            elif t.due_date <= horizon:
                upcoming.append(t)
    upcoming.sort(key=lambda t: t.due_date or date.max)

    return {
        "funding_year": fy,
        "overall_percent": out.overall_percent,
        "required_total": out.required_total,
        "required_complete": out.required_complete,
        "overdue_total": out.overdue_total,
        "overdue": [t.dict() for t in overdue],
        "upcoming": [t.dict() for t in upcoming],
    }


@router.post("/task/{task_id}/status", response_model=TaskOut)
def update_task_status(
    task_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a task not_started / in_progress / complete / skipped / blocked."""
    if payload.status not in TASK_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Allowed: {', '.join(TASK_STATUSES)}",
        )
    task = _owned_task_or_404(db, task_id, current_user.id)
    task.status = payload.status
    if payload.status == "complete":
        task.completed_at = datetime.utcnow()
        task.completed_by = current_user.id
    else:
        task.completed_at = None
        task.completed_by = None
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.post("/task", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def add_custom_task(
    payload: NewTask,
    funding_year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a user-defined task to a phase of the current plan."""
    if payload.category not in TASK_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Allowed: {', '.join(TASK_CATEGORIES)}",
        )
    fy = funding_year or _default_funding_year()
    plan = _get_or_create_plan(db, current_user.id, fy)
    max_order = max(
        [t.sort_order for t in plan.tasks if t.phase_step == payload.phase_step],
        default=-1,
    )
    task = ComplianceTask(
        plan_id=plan.id,
        phase_step=payload.phase_step,
        title=payload.title,
        category=payload.category,
        required=payload.required,
        due_date=payload.due_date,
        status="not_started",
        is_custom=True,
        sort_order=max_order + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.patch("/task/{task_id}", response_model=TaskOut)
def patch_task(
    task_id: int,
    payload: TaskPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a task's due date and/or notes."""
    task = _owned_task_or_404(db, task_id, current_user.id)
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.notes is not None:
        task.notes = payload.notes
    db.commit()
    db.refresh(task)
    return _task_out(task)


@router.delete("/task/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a user-added custom task (seeded tasks cannot be deleted)."""
    task = _owned_task_or_404(db, task_id, current_user.id)
    if not task.is_custom:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only custom tasks can be deleted; seeded tasks can be skipped instead.",
        )
    db.delete(task)
    db.commit()
    return None


# ==================== INTERNAL ====================

def _owned_task_or_404(db: Session, task_id: int, user_id: int) -> ComplianceTask:
    task = (
        db.query(ComplianceTask)
        .join(CompliancePlan, ComplianceTask.plan_id == CompliancePlan.id)
        .filter(ComplianceTask.id == task_id, CompliancePlan.user_id == user_id)
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )
    return task
