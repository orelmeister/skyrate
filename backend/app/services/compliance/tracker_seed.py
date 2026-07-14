"""
Seed data + due-date logic for the compliance / assignment tracker.

The templates below mirror Ari's 12-phase E-Rate planning calendar
(`frontend/app/compliance/ErateCalendar.tsx`). Keeping them here — derived from
the same phase content — lets the backend instantiate a per-user, per-funding-year
checklist while the frontend renders the same phases.

Funding-year cycle mapping (a FY that *starts* July 1 of `funding_year`):
  * planning months 7..12 (steps 1-6) fall in calendar year `funding_year - 1`
  * months 1..6 (steps 7-9) and month 7 (step 10) fall in calendar year `funding_year`
  * steps 11-12 are continuous / post-year and carry no hard due date.
"""

from __future__ import annotations

import calendar
from datetime import date
from typing import Optional

TEMPLATE_VERSION = 1

# Phase -> the months it occupies (matches ErateCalendar `months`).
PHASE_MONTHS = {
    1: [7], 2: [8], 3: [9], 4: [10], 5: [11], 6: [12],
    7: [1, 2], 8: [3, 4], 9: [5, 6], 10: [7], 11: [], 12: [],
}
CONTINUOUS_PHASES = {10, 11, 12}

# Master template list. anchor: phase_start | phase_end | form471_window | ongoing.
# doc_form_type is set only when the item is a document the compliance engine can
# validate (470/471/472/474/486/500/498); otherwise it stays a plain task.
TEMPLATES = [
    # Phase 1 — July — Strategic Planning Begins
    {"phase": 1, "title": "Assess technology needs for the upcoming funding year", "category": "task", "doc": None},
    {"phase": 1, "title": "Review expiring contracts", "category": "task", "doc": None},
    {"phase": 1, "title": "Meet with IT staff and stakeholders", "category": "task", "doc": None},
    {"phase": 1, "title": "Develop an E-Rate procurement strategy", "category": "task", "doc": None},

    # Phase 2 — August — Requirements & Data Collection
    {"phase": 2, "title": "Verify enrollment and discount data", "category": "task", "doc": None},
    {"phase": 2, "title": "Define bandwidth and equipment needs", "category": "task", "doc": None},
    {"phase": 2, "title": "Build technical specifications", "category": "document", "doc": None},
    {"phase": 2, "title": "Prepare procurement documents", "category": "document", "doc": None},

    # Phase 3 — September — Form 470 Preparation & Early Posting
    {"phase": 3, "title": "Finalize bid specifications", "category": "task", "doc": None},
    {"phase": 3, "title": "Develop evaluation criteria", "category": "document", "doc": None},
    {"phase": 3, "title": "Post FCC Form 470", "category": "document", "doc": "470", "anchor": "phase_end"},

    # Phase 4 — October — Competitive Bidding
    {"phase": 4, "title": "Keep Form 470 open for the full 28-day bidding window", "category": "task", "doc": None},
    {"phase": 4, "title": "Collect and log vendor proposals", "category": "document", "doc": None},
    {"phase": 4, "title": "Respond to vendor questions", "category": "task", "doc": None},

    # Phase 5 — November — Vendor Evaluation & Selection
    {"phase": 5, "title": "Complete bid evaluation matrix", "category": "document", "doc": None},
    {"phase": 5, "title": "Select the most cost-effective solution", "category": "task", "doc": None},
    {"phase": 5, "title": "Negotiate final contract terms", "category": "task", "doc": None},

    # Phase 6 — December — Contract Execution & Form 471 Prep
    {"phase": 6, "title": "Execute signed vendor contract", "category": "document", "doc": "contract"},
    {"phase": 6, "title": "Verify funding requests (FRNs)", "category": "task", "doc": None},
    {"phase": 6, "title": "Organize supporting documentation", "category": "document", "doc": None},

    # Phase 7 — January-February — Form 471 Filing
    {"phase": 7, "title": "Submit FCC Form 471", "category": "document", "doc": "471", "anchor": "form471_window"},
    {"phase": 7, "title": "Review FRNs on the submitted Form 471", "category": "task", "doc": None},
    {"phase": 7, "title": "Prepare for PIA review", "category": "task", "doc": None},

    # Phase 8 — March-April — PIA Review
    {"phase": 8, "title": "Respond to Program Integrity Assurance (PIA) requests", "category": "task", "doc": None},
    {"phase": 8, "title": "Submit supporting documentation to USAC", "category": "document", "doc": None},
    {"phase": 8, "title": "Monitor application status", "category": "task", "doc": None},

    # Phase 9 — May-June — Funding Commitments
    {"phase": 9, "title": "Review Funding Commitment Decision Letter (FCDL)", "category": "document", "doc": None},
    {"phase": 9, "title": "Prepare implementation plan", "category": "task", "doc": None},
    {"phase": 9, "title": "Confirm CIPA and other compliance requirements", "category": "task", "doc": None},

    # Phase 10 — July (FY begins) — Service Delivery [continuous]
    {"phase": 10, "title": "File FCC Form 486 (Receipt of Service Confirmation)", "category": "document", "doc": "486", "anchor": "ongoing"},
    {"phase": 10, "title": "Begin eligible services and track installations", "category": "task", "doc": None, "anchor": "ongoing"},
    {"phase": 10, "title": "Maintain project documentation", "category": "task", "doc": None, "anchor": "ongoing"},

    # Phase 11 — Ongoing — Invoicing & Reimbursement [continuous]
    {"phase": 11, "title": "File BEAR (Form 472) or SPI (Form 474) invoices", "category": "document", "doc": "472", "anchor": "ongoing"},
    {"phase": 11, "title": "Track reimbursement status", "category": "task", "doc": None, "anchor": "ongoing"},
    {"phase": 11, "title": "Maintain audit documentation", "category": "task", "doc": None, "anchor": "ongoing"},

    # Phase 12 — Post-Funding Year — Closeout & Record Retention [continuous]
    {"phase": 12, "title": "Ensure all reimbursements are received", "category": "task", "doc": None, "anchor": "ongoing"},
    {"phase": 12, "title": "Retain records for the required retention period (10 years)", "category": "task", "doc": None, "anchor": "ongoing"},
]


def get_templates(version: int = TEMPLATE_VERSION) -> list[dict]:
    """Normalized template rows (fills defaults) ready for DB seeding."""
    rows: list[dict] = []
    per_phase_order: dict[int, int] = {}
    for t in TEMPLATES:
        phase = t["phase"]
        order = per_phase_order.get(phase, 0)
        per_phase_order[phase] = order + 1
        required = t.get("required", True)
        anchor = t.get("anchor", "phase_end")
        if phase in CONTINUOUS_PHASES and anchor != "form471_window":
            anchor = "ongoing"
        rows.append(
            {
                "phase_step": phase,
                "title": t["title"],
                "description": t.get("description"),
                "category": t["category"],
                "required": required,
                "doc_form_type": t.get("doc"),
                "anchor": anchor,
                "offset_days": t.get("offset_days", 0),
                "sort_order": order,
                "version": version,
            }
        )
    return rows


def _month_calendar_year(month: int, funding_year: int) -> int:
    """Map a planning-cycle month to its calendar year for a funding year."""
    return funding_year - 1 if month >= 7 else funding_year


def _last_day(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def compute_due_date(
    phase_step: int,
    anchor: str,
    offset_days: int,
    funding_year: int,
    form471_window_close: Optional[date] = None,
) -> Optional[date]:
    """Derive a concrete due date for a task in a given funding year.

    Continuous/ongoing items return None (no hard deadline). The Form 471 filing
    task can be pinned to the live USAC window close date when provided.
    """
    from datetime import timedelta

    if anchor == "ongoing":
        return None

    if anchor == "form471_window":
        if form471_window_close is not None:
            base = form471_window_close
        else:
            # Fallback estimate: USAC's window typically closes late March.
            base = date(funding_year, 3, 26)
        return base + timedelta(days=offset_days)

    months = PHASE_MONTHS.get(phase_step) or []
    if not months:
        return None

    if anchor == "phase_start":
        m = months[0]
        base = date(_month_calendar_year(m, funding_year), m, 1)
    else:  # phase_end (default)
        m = months[-1]
        base = _last_day(_month_calendar_year(m, funding_year), m)

    return base + timedelta(days=offset_days)
