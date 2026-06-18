"""
FRN Ownership Resolution

Determines which users "own" a given FRN based on BEN, FRN, or SPIN.
Used by the queue producer to insert per-user queue rows.
"""
import logging
from typing import List

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def resolve_owners(db: Session, *, ben: str = "", frn: str = "", spin: str = "") -> List[int]:
    """
    Return a deduplicated list of user_ids whose portfolio contains the given FRN.

    Ownership rules:
      - Consultants: whose CRN portfolio contains a ConsultantSchool with this BEN
      - Applicants: whose ApplicantProfile.ben == this BEN OR have an ApplicantBEN row for it
      - Vendors: whose VendorProfile.spin == this SPIN (the awarded SPIN on the FRN)
      - Super/Admin: routed by their explicit portfolio only (same as consultants)
    """
    from ..models.consultant import ConsultantProfile, ConsultantSchool
    from ..models.applicant import ApplicantProfile, ApplicantBEN
    from ..models.vendor import VendorProfile

    owner_ids: set = set()

    # 1. Consultants who have this BEN in their school portfolio
    if ben:
        consultant_user_ids = (
            db.query(ConsultantProfile.user_id)
            .join(ConsultantSchool, ConsultantSchool.consultant_profile_id == ConsultantProfile.id)
            .filter(ConsultantSchool.ben == ben)
            .all()
        )
        for (uid,) in consultant_user_ids:
            owner_ids.add(uid)

    # 2. Applicants who own this BEN (primary or additional)
    if ben:
        # Primary BEN on profile
        applicant_primary = (
            db.query(ApplicantProfile.user_id)
            .filter(ApplicantProfile.ben == ben)
            .all()
        )
        for (uid,) in applicant_primary:
            owner_ids.add(uid)

        # Additional BENs
        applicant_additional = (
            db.query(ApplicantProfile.user_id)
            .join(ApplicantBEN, ApplicantBEN.applicant_profile_id == ApplicantProfile.id)
            .filter(ApplicantBEN.ben == ben)
            .all()
        )
        for (uid,) in applicant_additional:
            owner_ids.add(uid)

    # 3. Vendors whose SPIN matches the service provider on this FRN
    if spin:
        vendor_user_ids = (
            db.query(VendorProfile.user_id)
            .filter(VendorProfile.spin == spin)
            .all()
        )
        for (uid,) in vendor_user_ids:
            owner_ids.add(uid)

    # 4. Super/Admin users — routed by their explicit portfolio only.
    #    They are NOT auto-included for every FRN.  If an admin/super
    #    has a ConsultantSchool with the BEN, they were already added
    #    in step 1 above.

    return list(owner_ids)
