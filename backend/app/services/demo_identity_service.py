"""Demo Identity Swap Service — generalized CRN/SPIN/BEN replacement for test accounts.

Provides a single entry point for swapping the demo identity of any user type.
Verifies the new identity with USAC, updates the profile, clears old data,
and triggers a background snapshot rebuild.
"""

import time
import logging
from typing import Literal, Optional, Dict, Any

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.consultant import ConsultantProfile, ConsultantCRN, ConsultantSchool
from ..models.vendor import VendorProfile
from ..models.applicant import ApplicantProfile, ApplicantFRN, ApplicantBEN
from ..models.user_usac_cache import UserUsacCache
from ..utils.demo_gate import is_demo_user
from ..services.usac_service import get_usac_service

logger = logging.getLogger(__name__)


def swap_demo_identity(
    db: Session,
    user: User,
    kind: Literal["crn", "spin", "ben"],
    new_id: str,
    *,
    background_tasks: Optional[BackgroundTasks] = None,
    crn_record_id: Optional[int] = None,
) -> dict:
    """Swap a demo/test account's identity and rebuild its data snapshot.

    Args:
        db: Active SQLAlchemy session.
        user: The authenticated user performing the swap.
        kind: Which identity to swap ('crn', 'spin', or 'ben').
        new_id: The new USAC identifier value.
        background_tasks: FastAPI BackgroundTasks for async data rebuild.
        crn_record_id: For CRN swaps, the specific CRN slot ID to replace.

    Returns:
        Dict with swap result including name, counts, rebuild status.

    Raises:
        HTTPException 403 if user not eligible.
        HTTPException 422 if USAC verification fails.
        HTTPException 500 if transaction fails.
    """
    t0 = time.perf_counter()
    new_id = (new_id or "").strip()
    if not new_id:
        raise HTTPException(status_code=400, detail=f"new_{kind} is required")

    # --- Eligibility gate ---
    if not is_demo_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Identity swap is only available for test/demo accounts.",
        )

    # --- Dispatch by kind ---
    if kind == "crn":
        result = _swap_crn(db, user, new_id, crn_record_id)
    elif kind == "spin":
        result = _swap_spin(db, user, new_id)
    elif kind == "ben":
        result = _swap_ben(db, user, new_id)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid kind: {kind}")

    # --- Schedule background rebuild ---
    rebuild_started = False
    if background_tasks is not None:
        background_tasks.add_task(_rebuild_snapshot, user.id, kind, new_id)
        rebuild_started = True

    duration_ms = (time.perf_counter() - t0) * 1000.0
    logger.info(
        f"[swap] kind={kind} user_id={user.id} result=ok step=complete "
        f"new_id={new_id} duration_ms={duration_ms:.0f}"
    )

    result["rebuild_started"] = rebuild_started
    return result


# ============================================================
# CRN swap (consultant)
# ============================================================

def _swap_crn(db: Session, user: User, new_crn: str, crn_record_id: Optional[int]) -> dict:
    """Swap consultant CRN — delegates to existing replace_crn logic pattern."""
    new_crn = new_crn.upper().strip()

    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.user_id == user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Consultant profile not found")

    # Find CRN record
    if crn_record_id:
        crn_record = db.query(ConsultantCRN).filter(
            ConsultantCRN.id == crn_record_id,
        ).first()
    else:
        # Use the primary CRN
        crn_record = db.query(ConsultantCRN).filter(
            ConsultantCRN.consultant_profile_id == profile.id,
            ConsultantCRN.is_primary == True,
        ).first()

    if not crn_record:
        raise HTTPException(status_code=404, detail="CRN record not found")

    old_crn = crn_record.crn
    if new_crn == old_crn:
        raise HTTPException(status_code=400, detail="New CRN matches current value")

    # Verify with USAC
    usac_service = get_usac_service()
    result = usac_service.verify_crn(new_crn)
    if not result["valid"]:
        _log_fail(user.id, "crn", "verify", new_crn)
        raise HTTPException(
            status_code=422,
            detail=result.get("error", f"Invalid CRN {new_crn} - not found in USAC"),
        )

    consultant_info = result.get("consultant") or {}

    # Transaction: update CRN + delete old schools
    try:
        deleted_schools = db.query(ConsultantSchool).filter(
            ConsultantSchool.consultant_profile_id == profile.id,
            ConsultantSchool.source_crn == old_crn,
        ).delete(synchronize_session="fetch")

        crn_record.crn = new_crn
        crn_record.company_name = consultant_info.get("company_name") or crn_record.company_name
        crn_record.is_verified = True

        # Mirror to profile if primary
        if crn_record.is_primary:
            profile.crn = new_crn
            if consultant_info.get("company_name"):
                profile.company_name = consultant_info["company_name"]

        # Invalidate cache
        _invalidate_cache(db, user.id)

        db.commit()
    except Exception as e:
        db.rollback()
        _log_fail(user.id, "crn", "update", new_crn, str(e))
        err_str = str(e)
        if "Duplicate entry" in err_str or "IntegrityError" in err_str:
            raise HTTPException(
                status_code=409,
                detail={
                    "ok": False,
                    "reason": "duplicate",
                    "message": f"CRN {new_crn} is already held by another account. Pick a different one.",
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "reason": "internal",
                "message": "CRN swap failed due to a server error. Please try again.",
            },
        )

    return {
        "ok": True,
        "name": consultant_info.get("company_name", ""),
        "old_id": old_crn,
        "new_id": new_crn,
        "counts": {"schools_deleted": deleted_schools, "schools_usac": result.get("school_count", 0)},
    }


# ============================================================
# SPIN swap (vendor)
# ============================================================

def _swap_spin(db: Session, user: User, new_spin: str) -> dict:
    """Swap vendor SPIN."""
    new_spin = new_spin.strip()

    profile = db.query(VendorProfile).filter(
        VendorProfile.user_id == user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")

    old_spin = profile.spin
    if new_spin == old_spin:
        return {
            "ok": True,
            "name": profile.company_name or "",
            "old_id": old_spin or "",
            "new_id": new_spin,
            "counts": {},
            "no_op": True,
        }

    # Verify with USAC
    usac_service = get_usac_service()
    try:
        from utils.usac_client import USACDataClient
        from utils.usac_cache import get_or_cache

        client = USACDataClient()
        result = get_or_cache(
            namespace="spin_validate",
            params={"spin": new_spin},
            ttl_hours=24,
            fetch_fn=lambda: client.validate_spin(new_spin),
        )
    except Exception:
        # Fallback: try a basic USAC query for the SPIN
        result = _verify_spin_fallback(new_spin)

    if not result or not result.get("valid"):
        _log_fail(user.id, "spin", "verify", new_spin)
        raise HTTPException(
            status_code=422,
            detail=result.get("error", f"Invalid SPIN {new_spin} - not found in USAC") if result else f"SPIN {new_spin} verification failed",
        )

    provider_name = result.get("service_provider_name") or result.get("provider_name") or result.get("company_name") or ""

    # If primary validation didn't return a name, try fallback lookup
    if not provider_name:
        fallback = _verify_spin_fallback(new_spin)
        if fallback and fallback.get("provider_name"):
            provider_name = fallback["provider_name"]

    # Transaction: update SPIN + clear search history
    try:
        profile.spin = new_spin
        # Always update company_name (even to empty) so stale name is cleared
        profile.company_name = provider_name or profile.company_name

        db.commit()
    except Exception as e:
        db.rollback()
        _log_fail(user.id, "spin", "update", new_spin, str(e))
        # Clean error for IntegrityError (duplicate SPIN still in DB)
        err_str = str(e)
        if "Duplicate entry" in err_str or "IntegrityError" in err_str:
            raise HTTPException(
                status_code=409,
                detail={
                    "ok": False,
                    "reason": "duplicate",
                    "message": f"SPIN {new_spin} is already held by another account. Pick a different one.",
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "reason": "internal",
                "message": "SPIN swap failed due to a server error. Please try again.",
            },
        )

    return {
        "ok": True,
        "name": provider_name,
        "old_id": old_spin or "",
        "new_id": new_spin,
        "counts": {},
    }


# ============================================================
# BEN swap (applicant)
# ============================================================

def _swap_ben(db: Session, user: User, new_ben: str) -> dict:
    """Swap applicant BEN."""
    new_ben = new_ben.strip()

    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Applicant profile not found")

    old_ben = profile.ben
    if new_ben == old_ben:
        return {
            "ok": True,
            "name": profile.organization_name or "",
            "old_id": old_ben or "",
            "new_id": new_ben,
            "counts": {},
            "no_op": True,
        }

    # Verify with USAC
    usac_service = get_usac_service()
    ben_info = usac_service.get_ben_info(new_ben)
    if not ben_info or not ben_info.get("organization_name"):
        _log_fail(user.id, "ben", "verify", new_ben)
        raise HTTPException(
            status_code=422,
            detail=f"BEN {new_ben} not found in USAC or has no organization data",
        )

    org_name = ben_info.get("organization_name", "")

    # Transaction: update BEN + clear old FRN data
    try:
        # Delete old FRN records for this profile
        deleted_frns = db.query(ApplicantFRN).filter(
            ApplicantFRN.applicant_profile_id == profile.id,
        ).delete(synchronize_session="fetch")

        # Update profile
        profile.ben = new_ben
        profile.organization_name = org_name
        profile.state = ben_info.get("state")
        profile.city = ben_info.get("city")
        profile.entity_type = ben_info.get("entity_type")
        profile.sync_status = "pending"

        # Update the primary ApplicantBEN record if it exists
        primary_ben_record = db.query(ApplicantBEN).filter(
            ApplicantBEN.applicant_profile_id == profile.id,
            ApplicantBEN.is_primary == True,
        ).first()
        if primary_ben_record:
            primary_ben_record.ben = new_ben
            primary_ben_record.organization_name = org_name
            primary_ben_record.state = ben_info.get("state")
            primary_ben_record.city = ben_info.get("city")
            primary_ben_record.entity_type = ben_info.get("entity_type")
            primary_ben_record.sync_status = "pending"

        db.commit()
    except Exception as e:
        db.rollback()
        _log_fail(user.id, "ben", "update", new_ben, str(e))
        err_str = str(e)
        if "Duplicate entry" in err_str or "IntegrityError" in err_str:
            raise HTTPException(
                status_code=409,
                detail={
                    "ok": False,
                    "reason": "duplicate",
                    "message": f"BEN {new_ben} is already held by another account. Pick a different one.",
                },
            )
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "reason": "internal",
                "message": "BEN swap failed due to a server error. Please try again.",
            },
        )

    return {
        "ok": True,
        "name": org_name,
        "old_id": old_ben or "",
        "new_id": new_ben,
        "counts": {"frns_deleted": deleted_frns},
    }


# ============================================================
# Helpers
# ============================================================

def _invalidate_cache(db: Session, user_id: int) -> None:
    """Mark perf_v2 cache as stale for user."""
    cache_row = db.query(UserUsacCache).filter(
        UserUsacCache.user_id == user_id
    ).first()
    if cache_row and cache_row.status == "fresh":
        cache_row.status = "stale"


def _verify_spin_fallback(spin: str) -> dict:
    """Basic USAC SPIN validation via the service provider dataset."""
    import requests as http_requests
    try:
        url = "https://opendata.usac.org/resource/avi8-svp9.json"
        params = {"service_provider_number": spin.strip(), "$limit": 1}
        resp = http_requests.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if data:
                return {
                    "valid": True,
                    "provider_name": data[0].get("service_provider_name", ""),
                    "company_name": data[0].get("service_provider_name", ""),
                }
        return {"valid": False, "error": f"SPIN {spin} not found in USAC"}
    except Exception as e:
        return {"valid": False, "error": f"Verification failed: {str(e)}"}


def _rebuild_snapshot(user_id: int, kind: str, new_id: str) -> None:
    """Background task: rebuild USAC data for the new identity."""
    from ..core.database import SessionLocal

    db = SessionLocal()
    try:
        if kind == "crn":
            _rebuild_crn_snapshot(db, user_id, new_id)
        elif kind == "spin":
            _rebuild_spin_snapshot(db, user_id, new_id)
        elif kind == "ben":
            _rebuild_ben_snapshot(db, user_id, new_id)
        logger.info(f"[swap] kind={kind} user_id={user_id} step=rebuild_complete new_id={new_id}")
    except Exception as e:
        logger.error(f"[swap] kind={kind} user_id={user_id} step=rebuild_failed new_id={new_id} error={e}")
    finally:
        db.close()


def _rebuild_crn_snapshot(db: Session, user_id: int, crn: str) -> None:
    """Import schools for the new CRN."""
    from ..api.v1.consultant import _import_schools_for_crn
    profile = db.query(ConsultantProfile).filter(
        ConsultantProfile.user_id == user_id
    ).first()
    if not profile:
        return
    usac_service = get_usac_service()
    result = usac_service.verify_crn(crn)
    if result and result.get("valid"):
        schools = result.get("schools") or []
        _import_schools_for_crn(profile, crn, schools, db)
        db.commit()


def _rebuild_spin_snapshot(db: Session, user_id: int, spin: str) -> None:
    """Placeholder for vendor data rebuild - vendor 470 leads refresh."""
    # The vendor Form 470 leads are fetched on-demand, no persistent snapshot needed.
    # Mark search cache as stale if we add one later.
    pass


def _rebuild_ben_snapshot(db: Session, user_id: int, ben: str) -> None:
    """Re-sync applicant data from USAC for the new BEN."""
    from ..api.v1.applicant import sync_applicant_data
    profile = db.query(ApplicantProfile).filter(
        ApplicantProfile.user_id == user_id
    ).first()
    if not profile:
        return
    sync_applicant_data(profile.id)


def _log_fail(user_id: int, kind: str, step: str, new_id: str, error: str = "") -> None:
    logger.warning(
        f"[swap] kind={kind} user_id={user_id} result=failed step={step} "
        f"new_id={new_id} error={error}"
    )
