"""
Vendor Alert Matcher (P2)

Matches newly-ingested `form470_postings` rows against all active
`vendor_alert_subscriptions` and writes hits into `vendor_alert_matches`.
The UNIQUE constraint on (subscription_id, form_470_application_number)
guarantees idempotency: re-runs across the same (posting, subscription)
pair are silently skipped.

Two subscription modes are supported:

  filter    - AND across populated criteria; empty criterion = wildcard.
              Criteria: states, service_categories, applicant_types,
              min_amount, max_amount.
  watchlist - posting.ben is in subscription.watchlist_bens.

This module is pure logic + DB I/O; the actual dispatch (email/SMS/push)
lives in P3-P7.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Iterable, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.database import SessionLocal
from ..models.vendor_alerts import (
    Form470Posting,
    VendorAlertMatch,
    VendorAlertSubscription,
)

logger = logging.getLogger(__name__)


# Maps our normalized subscription enum to the USAC-side raw applicant
# type strings observed on the jt8s-3q52 dataset. Keys MUST stay in sync
# with the values that the vendor UI / AlertSubscriptionCreate sends.
APPLICANT_TYPE_MAP = {
    "k12_public": [
        "School District",
        "Public School District",
        "Independent School",
        "School",
    ],
    "private": [
        "Private School",
        "Non-Public School",
    ],
    "charter": [
        "Charter School",
    ],
    "library": [
        "Library",
        "Library System",
        "Public Library",
    ],
    "consortium": [
        "Consortium",
    ],
}


def _normalized_applicant_types(subscription_types: Optional[List[str]]) -> set:
    """Expand the subscription's normalized applicant types into the raw
    USAC strings the posting layer stores in `applicant_type`."""
    if not subscription_types:
        return set()
    expanded: set = set()
    for t in subscription_types:
        for raw in APPLICANT_TYPE_MAP.get(t, []):
            expanded.add(raw.lower())
    return expanded


def _matches_filter(sub: VendorAlertSubscription, posting: Form470Posting) -> bool:
    """Return True iff a filter-mode subscription matches the posting.
    Each criterion is wildcard when empty/None. All populated criteria
    must agree (AND)."""
    # State
    if sub.states:
        if not posting.state:
            return False
        if posting.state.upper() not in {s.upper() for s in sub.states}:
            return False

    # Service categories: intersection must be non-empty.
    if sub.service_categories:
        posting_cats = {c for c in (posting.service_categories or []) if c}
        sub_cats = {c for c in sub.service_categories if c}
        if not (posting_cats & sub_cats):
            return False

    # Applicant types (normalized -> raw USAC strings).
    if sub.applicant_types:
        if not posting.applicant_type:
            return False
        raw_targets = _normalized_applicant_types(sub.applicant_types)
        if not raw_targets:
            # The subscription set strings we don't recognize; treat as miss.
            return False
        if posting.applicant_type.lower() not in raw_targets:
            return False

    # Dollar bounds: None = wildcard; missing posting cost only fails when
    # a bound is set.
    if sub.min_amount is not None:
        if posting.total_pre_discount_cost is None:
            return False
        if Decimal(posting.total_pre_discount_cost) < Decimal(sub.min_amount):
            return False
    if sub.max_amount is not None:
        if posting.total_pre_discount_cost is None:
            return False
        if Decimal(posting.total_pre_discount_cost) > Decimal(sub.max_amount):
            return False

    return True


def _matches_watchlist(sub: VendorAlertSubscription, posting: Form470Posting) -> bool:
    if not sub.watchlist_bens:
        return False
    if not posting.ben:
        return False
    return str(posting.ben) in {str(b) for b in sub.watchlist_bens}


def _subscription_matches(sub: VendorAlertSubscription, posting: Form470Posting) -> bool:
    if sub.mode == "watchlist":
        return _matches_watchlist(sub, posting)
    # default + filter
    return _matches_filter(sub, posting)


def match_postings(new_posting_ids: Iterable[int], db: Optional[Session] = None) -> int:
    """Score each posting in `new_posting_ids` against every active
    vendor_alert_subscription. Insert into vendor_alert_matches on hit.
    Returns the number of new match rows inserted."""
    owns_session = db is None
    if owns_session:
        db = SessionLocal()

    matches_created = 0
    try:
        ids = [int(i) for i in new_posting_ids if i is not None]
        if not ids:
            return 0

        postings = db.query(Form470Posting).filter(Form470Posting.id.in_(ids)).all()
        if not postings:
            return 0

        subs = db.query(VendorAlertSubscription).filter(
            VendorAlertSubscription.active == True  # noqa: E712
        ).all()
        if not subs:
            return 0

        for posting in postings:
            for sub in subs:
                if not _subscription_matches(sub, posting):
                    continue
                match = VendorAlertMatch(
                    subscription_id=sub.id,
                    form_470_application_number=posting.application_number,
                    ben=posting.ben,
                )
                db.add(match)
                try:
                    db.commit()
                    matches_created += 1
                except IntegrityError:
                    # Already matched on a prior scan; UNIQUE dedupe.
                    db.rollback()
                except Exception as e:  # pragma: no cover - defensive
                    db.rollback()
                    logger.error(
                        "[alert_matcher] failed to record match sub=%s posting=%s err=%s",
                        sub.id,
                        posting.application_number,
                        e,
                    )
        return matches_created
    finally:
        if owns_session:
            db.close()


def preview_matches(
    sub_proxy: VendorAlertSubscription,
    days_back: int = 30,
    limit: int = 25,
    db: Optional[Session] = None,
) -> dict:
    """Run the same match logic against postings whose `certified_date`
    falls within the last `days_back` days. Used by the preview endpoint
    so vendors can validate a subscription before saving it.

    `sub_proxy` may be a persisted row OR a transient instance built from
    a request body; only its filter/watchlist fields are read."""
    from datetime import datetime, timedelta  # local to keep imports tight

    owns_session = db is None
    if owns_session:
        db = SessionLocal()

    try:
        cutoff = datetime.utcnow() - timedelta(days=days_back)
        q = db.query(Form470Posting).filter(
            (Form470Posting.certified_date == None) | (Form470Posting.certified_date >= cutoff)  # noqa: E711
        )
        candidates = q.order_by(Form470Posting.certified_date.desc()).limit(2000).all()

        hits: List[Form470Posting] = []
        for p in candidates:
            if _subscription_matches(sub_proxy, p):
                hits.append(p)

        sample = hits[:max(0, int(limit))]
        return {
            "count": len(hits),
            "sample": [p.to_dict() for p in sample],
            "window_days": days_back,
        }
    finally:
        if owns_session:
            db.close()
