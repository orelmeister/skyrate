"""
Account resolution for the team-seats feature.

An "account" is anchored by a ConsultantProfile owned by a single user (the owner).
Team seats are additional users (AccountSeat rows) who log in with their own
credentials but operate INSIDE the owner's account, inheriting full data access
(everything except billing + seat management). resolve_account maps any user --
owner or seat -- to the owning user plus the owner's ConsultantProfile, so existing
consultant endpoints automatically scope a seat's requests to the owner's data.
"""

from typing import Optional, Tuple

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from .security import get_current_user
from ..models.user import User
from ..models.consultant import ConsultantProfile
from ..models.account_seat import AccountSeat


def get_active_seat(user: User, db: Session) -> Optional[AccountSeat]:
    """Return the user's ACTIVE seat row (they are a team member of someone else's
    account), or None if the user is not an active seat."""
    if user is None:
        return None
    return (
        db.query(AccountSeat)
        .filter(
            AccountSeat.user_id == user.id,
            AccountSeat.seat_role == "seat",
            AccountSeat.status == "active",
        )
        .first()
    )


def resolve_account(user: User, db: Session) -> Tuple[User, ConsultantProfile]:
    """Resolve any authenticated user to (owner_user, owner_profile).

    - If the user is an active SEAT, return the OWNER's user and ConsultantProfile.
    - Otherwise the user is an owner / standalone consultant: return their own
      profile, auto-creating it if missing (preserves prior get_consultant_profile
      behavior).
    """
    seat = get_active_seat(user, db)
    if seat is not None:
        profile = (
            db.query(ConsultantProfile)
            .filter(ConsultantProfile.id == seat.consultant_profile_id)
            .first()
        )
        if profile is not None:
            owner = db.query(User).filter(User.id == profile.user_id).first() or user
            return owner, profile
        # Defensive: seat's account vanished -> fall through to self.

    profile = (
        db.query(ConsultantProfile)
        .filter(ConsultantProfile.user_id == user.id)
        .first()
    )
    if profile is None:
        profile = ConsultantProfile(
            user_id=user.id,
            company_name=user.company_name,
            contact_name=user.full_name,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return user, profile


async def require_account_owner(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: allow only the ACCOUNT OWNER (or admin/super) through.
    Blocks team seats from billing and seat-management endpoints (OWASP A01
    broken access control). Enforced server-side, never UI-only."""
    if current_user.role in ("admin", "super"):
        return current_user
    seat = get_active_seat(current_user, db)
    if seat is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the account owner can manage billing and team seats.",
        )
    return current_user
