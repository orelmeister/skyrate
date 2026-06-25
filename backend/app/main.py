"""
SkyRate AI Production Backend
Main FastAPI Application with all routers
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
import logging
import sys
import os
import time

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Import core modules
from app.core.config import settings
from app.core.database import engine, Base
from app.core import perf_metrics

# Import API routers - services are imported lazily within these
from app.api.v1 import auth, subscriptions, consultant, vendor, admin, query, schools, appeals, alerts, applicant, notifications, support, onboarding, blog, frn_reports, usac, portfolio_analyzer, pia, mail_campaigns, leads, public_tools, denial_hunter, denial_hunter_tracking, admin_jobs, compliance

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Rate limiter (disabled for debugging)
# limiter = Limiter(key_func=get_remote_address)
limiter = None  # TODO: Fix limiter - causes app to shutdown on first request


# ==================== SECURITY MIDDLEWARE ====================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # XSS protection (legacy but still useful)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy (adjust as needed for your frontend)
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        
        # HSTS - enable in production with HTTPS
        if settings.ENVIRONMENT != "development":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Permissions Policy
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        return response


class IPBlocklistMiddleware(BaseHTTPMiddleware):
    """Block banned IP addresses with a 403 Forbidden response"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            client_ip = fwd.split(",")[0].strip()
        else:
            client_ip = (request.client.host if request.client else "unknown") or "unknown"
            
        if settings.BANNED_IPS and client_ip in settings.BANNED_IPS:
            logger.warning(f"Blocked request from banned IP: {client_ip} to {request.url.path}")
            return Response(
                content="Forbidden",
                status_code=403,
                media_type="text/plain"
            )
            
        return await call_next(request)


class PerfTimingMiddleware(BaseHTTPMiddleware):
    """perf_v2: record per-request latency + cache-hit flag + source tag for /v1 endpoints.

    Endpoint code calls ``perf_metrics_context.set_cache_hit(True)`` when it
    serves a response from user_usac_cache. The contextvar is read here.
    A response header ``X-Cache: hit`` is also emitted for client visibility.
    Source/rows/partial are read from ``request.state`` (set by utils.source_tag).
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        from app.core import perf_metrics_context
        perf_metrics_context.reset_cache_hit()
        start = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000.0
            cache_hit = perf_metrics_context.get_cache_hit()
            path = request.url.path
            if path.startswith("/v1") or path.startswith("/api/v1"):
                perf_metrics.record(
                    method=request.method,
                    path=path,
                    duration_ms=duration_ms,
                    status_code=response.status_code,
                    cache_hit=cache_hit,
                )
                # Structured telemetry log
                source = getattr(request.state, "data_source", None)
                rows = getattr(request.state, "data_rows", None)
                partial = getattr(request.state, "data_partial", None)
                user_id = getattr(request.state, "user_id", None)
                extra_parts = []
                if source:
                    extra_parts.append(f"source={source}")
                if user_id:
                    extra_parts.append(f"user_id={user_id}")
                if rows is not None:
                    extra_parts.append(f"rows={rows}")
                if partial is not None:
                    extra_parts.append(f"partial={str(partial).lower()}")
                extra = " ".join(extra_parts)
                if duration_ms > 1000 or source:
                    level = "SLOW" if duration_ms > 1000 else "OK"
                    logger.info(
                        f"[perf] {level} path={path} method={request.method} "
                        f"status={response.status_code} duration_ms={duration_ms:.0f} "
                        f"cache_hit={cache_hit} {extra}"
                    )
            if cache_hit:
                response.headers["X-Cache"] = "hit"
            response.headers["Server-Timing"] = f"app;dur={duration_ms:.1f}"
            return response
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000.0
            perf_metrics.record(
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
                status_code=500,
                cache_hit=False,
            )
            raise


def seed_demo_accounts():
    """Create demo accounts if they don't exist, and auto-sync data from USAC"""
    from app.models.applicant import ApplicantBEN
    from app.models.vendor import VendorProfile
    from app.models.consultant import ConsultantProfile, ConsultantCRN, ConsultantSchool
    from app.models.alert import AlertConfig
    from sqlalchemy.orm import Session
    from app.models.user import User, UserRole
    from app.models.applicant import ApplicantProfile
    from app.core.database import SessionLocal
    import bcrypt
    import threading
    
    # Track profiles that need USAC data sync
    _profiles_to_sync = []
    
    db = SessionLocal()

    # ── Seed admin account ──────────────────────────────────────────────────
    try:
        admin_email = "admin@skyrate.ai"
        admin_existing = db.query(User).filter(User.email == admin_email).first()
        admin_password = os.environ.get("ADMIN_PASSWORD", "SkyRateAdmin2024!")
        admin_hashed = bcrypt.hashpw(admin_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        if not admin_existing:
            admin_user = User(
                email=admin_email,
                password_hash=admin_hashed,
                role=UserRole.ADMIN.value,
                first_name="David",
                last_name="Admin",
                company_name="SkyRate AI",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(admin_user)
            db.flush()
            logger.info(f"Created super admin account: {admin_email}")
        else:
            admin_existing.password_hash = admin_hashed
            admin_existing.role = UserRole.ADMIN.value
            admin_existing.is_active = True
            admin_existing.is_verified = True
            admin_existing.email_verified = True
            logger.info(f"Updated super admin account: {admin_email}")
        db.commit()
        logger.info("Admin account seeded")
    except Exception as e:
        logger.error(f"Error seeding admin account: {e}")
        db.rollback()

    # ── Seed super account (consultant + vendor + applicant privileges) ─────
    try:
        super_email = "super@skyrate.ai"
        super_existing = db.query(User).filter(User.email == super_email).first()
        super_password = "super@12345"
        super_hashed = bcrypt.hashpw(super_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        if not super_existing:
            super_user = User(
                email=super_email,
                password_hash=super_hashed,
                role=UserRole.SUPER.value,
                first_name="Super",
                last_name="User",
                company_name="SkyRate AI",
                is_active=True,
                is_verified=True,
                email_verified=True,
            )
            db.add(super_user)
            db.flush()
            # Create both consultant and vendor profiles for super user
            super_cp = ConsultantProfile(
                user_id=super_user.id,
                company_name="SkyRate AI (Super)",
                contact_name="Super User",
            )
            db.add(super_cp)
            db.flush()

            # Add sample schools for super user's consultant profile (for PORTFOLIO FRN watches)
            sample_bens = [
                ("16056315", "San Francisco Unified School District", "CA", "San Francisco"),
                ("16042282", "Los Angeles Unified School District", "CA", "Los Angeles"),
                ("16003245", "Chicago Public Schools", "IL", "Chicago"),
            ]
            for ben, name, state, city in sample_bens:
                school = ConsultantSchool(
                    consultant_profile_id=super_cp.id,
                    ben=ben,
                    school_name=name,
                    state=state,
                    city=city,
                    entity_type="School District",
                    status="Unknown",
                    status_color="gray",
                )
                db.add(school)

            super_vp = VendorProfile(
                user_id=super_user.id,
                spin="143032945",  # CDW-G SPIN for testing
                company_name="SkyRate AI (Super)",
                contact_name="Super User",
            )
            db.add(super_vp)
            db.flush()

            super_ap = ApplicantProfile(
                user_id=super_user.id,
                ben="16056315",  # Same BEN as consultant school - San Francisco USD
                sync_status="pending",
                is_paid=True,
            )
            db.add(super_ap)
            db.flush()

            super_ap_ben = ApplicantBEN(
                applicant_profile_id=super_ap.id,
                ben="16056315",
                is_primary=True,
                is_paid=True,
                subscription_status="active",
                sync_status="pending",
            )
            db.add(super_ap_ben)
            db.flush()
            _profiles_to_sync.append(super_ap.id)
            logger.info(f"Created super account: {super_email} with consultant profile (3 schools) + vendor profile (SPIN 143032945) + applicant profile (BEN 16056315)")
        else:
            super_existing.password_hash = super_hashed
            super_existing.role = UserRole.SUPER.value
            super_existing.is_active = True
            super_existing.is_verified = True
            super_existing.email_verified = True
            # Ensure both profiles exist
            if not db.query(ConsultantProfile).filter(ConsultantProfile.user_id == super_existing.id).first():
                db.add(ConsultantProfile(user_id=super_existing.id, company_name="SkyRate AI (Super)", contact_name="Super User"))
            if not db.query(VendorProfile).filter(VendorProfile.user_id == super_existing.id).first():
                db.add(VendorProfile(user_id=super_existing.id, company_name="SkyRate AI (Super)", contact_name="Super User"))
            if not db.query(ApplicantProfile).filter(ApplicantProfile.user_id == super_existing.id).first():
                super_ap = ApplicantProfile(
                    user_id=super_existing.id,
                    ben="16056315",
                    sync_status="pending",
                    is_paid=True,
                )
                db.add(super_ap)
                db.flush()
                super_ap_ben = ApplicantBEN(
                    applicant_profile_id=super_ap.id,
                    ben="16056315",
                    is_primary=True,
                    is_paid=True,
                    subscription_status="active",
                    sync_status="pending",
                )
                db.add(super_ap_ben)
                db.flush()
                _profiles_to_sync.append(super_ap.id)
                logger.info(f"Created applicant profile for super account with BEN 16056315")
            logger.info(f"Updated super account: {super_email}")
        db.commit()
        logger.info("Super account seeded")
    except Exception as e:
        logger.error(f"Error seeding super account: {e}")
        db.rollback()

    # ── Seed demo accounts — each isolated so one failure never blocks others
    demo_accounts = [
        ("test_consultant@example.com", UserRole.CONSULTANT.value, "TestPass123!"),
        ("test_vendor@example.com", UserRole.VENDOR.value, "TestPass123!"),
        ("test_applicant@example.com", UserRole.APPLICANT.value, "TestPass123!"),
    ]
    for email, role, password in demo_accounts:
        try:
            existing = db.query(User).filter(User.email == email).first()
            hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            if not existing:
                user = User(
                    email=email,
                    password_hash=hashed,
                    role=role,
                    is_active=True,
                    is_verified=True,
                    email_verified=True,
                )
                db.add(user)
                db.flush()  # Get the user ID
                logger.info(f"Created demo account: {email}")
            else:
                # Update existing user's password hash to ensure login works
                existing.password_hash = hashed
                existing.is_active = True
                existing.is_verified = True
                existing.email_verified = True
                user = existing
                logger.info(f"Updated password for demo account: {email}")

            # Create vendor profile for test_vendor (whether new or existing user)
            if role == UserRole.VENDOR.value:
                existing_vp = db.query(VendorProfile).filter(
                    VendorProfile.user_id == user.id
                ).first()
                test_vendor_spin = "143000001"  # Unique test SPIN (avoids conflict with super's CDW-G SPIN 143032945)
                if not existing_vp:
                    # Check if SPIN is already taken (e.g., by super user's vendor profile)
                    spin_taken = db.query(VendorProfile).filter(VendorProfile.spin == test_vendor_spin).first()
                    if not spin_taken:
                        vp = VendorProfile(
                            user_id=user.id,
                            spin=test_vendor_spin,
                            company_name="Demo Vendor Co.",
                            contact_name="Test Vendor",
                        )
                        db.add(vp)
                        db.flush()
                        logger.info(f"Created vendor profile for {email} with SPIN {test_vendor_spin}")
                    else:
                        logger.info(f"Vendor SPIN {test_vendor_spin} already taken, skipping vendor profile creation for {email}")
                elif not existing_vp.spin:
                    existing_vp.spin = test_vendor_spin
                    logger.info(f"Updated vendor profile SPIN for {email}")

            # Create consultant profile for test_consultant (whether new or existing user)
            if role == UserRole.CONSULTANT.value:
                existing_cp = db.query(ConsultantProfile).filter(
                    ConsultantProfile.user_id == user.id
                ).first()
                if not existing_cp:
                    cp = ConsultantProfile(
                        user_id=user.id,
                        company_name="Demo Consulting LLC",
                        contact_name="Test Consultant",
                    )
                    db.add(cp)
                    db.flush()
                    logger.info(f"Created consultant profile for {email}")

            # Create applicant profile for test_applicant (whether new or existing user)
            if role == UserRole.APPLICANT.value:
                existing_profile = db.query(ApplicantProfile).filter(
                    ApplicantProfile.user_id == user.id
                ).first()
                if not existing_profile:
                    profile = ApplicantProfile(
                        user_id=user.id,
                        ben="16056315",  # Real BEN - will auto-sync from USAC
                        sync_status="pending",  # Will trigger auto-sync
                        is_paid=True,  # Mark as paid for demo
                    )
                    db.add(profile)
                    db.flush()

                    # Also create the ApplicantBEN record for the primary BEN
                    primary_ben = ApplicantBEN(
                        applicant_profile_id=profile.id,
                        ben="16056315",
                        is_primary=True,
                        is_paid=True,
                        subscription_status="active",
                        sync_status="pending",
                    )
                    db.add(primary_ben)
                    db.flush()

                    logger.info(f"Created applicant profile for {email} with BEN 16056315")
                    # Queue data sync (will happen after commit)
                    _profiles_to_sync.append(profile.id)

            db.commit()
            logger.info(f"Demo account seeded: {email}")
        except Exception as e:
            logger.error(f"Error seeding demo account {email}: {e}")
            db.rollback()

    # ── Extra reconciliation pass: ensure test_applicant BEN/profile is correct
    try:
        test_applicant = db.query(User).filter(User.email == "test_applicant@example.com").first()
        if test_applicant:
            existing_profile = db.query(ApplicantProfile).filter(
                ApplicantProfile.user_id == test_applicant.id
            ).first()
            if not existing_profile:
                profile = ApplicantProfile(
                    user_id=test_applicant.id,
                    ben="16056315",  # Real BEN - will auto-sync from USAC
                    sync_status="pending",  # Will trigger auto-sync
                    is_paid=True,  # Mark as paid for demo
                )
                db.add(profile)
                db.flush()

                # Also create the ApplicantBEN record for the primary BEN
                primary_ben = ApplicantBEN(
                    applicant_profile_id=profile.id,
                    ben="16056315",
                    is_primary=True,
                    is_paid=True,
                    subscription_status="active",
                    sync_status="pending",
                )
                db.add(primary_ben)
                db.flush()

                logger.info(f"Created applicant profile for existing test_applicant with BEN 16056315")
                _profiles_to_sync.append(profile.id)
            else:
                # Check if ApplicantBEN exists, create if not
                existing_ben = db.query(ApplicantBEN).filter(
                    ApplicantBEN.applicant_profile_id == existing_profile.id,
                    ApplicantBEN.ben == existing_profile.ben
                ).first()

                if not existing_ben:
                    primary_ben = ApplicantBEN(
                        applicant_profile_id=existing_profile.id,
                        ben=existing_profile.ben,
                        is_primary=True,
                        is_paid=True,
                        subscription_status="active",
                        sync_status="pending",
                        organization_name=existing_profile.organization_name,
                        state=existing_profile.state,
                        city=existing_profile.city,
                        entity_type=existing_profile.entity_type,
                        discount_rate=existing_profile.discount_rate,
                    )
                    db.add(primary_ben)
                    logger.info(f"Created ApplicantBEN for existing profile with BEN {existing_profile.ben}")

                if existing_profile.ben != "16056315":
                    # Update existing profile to use real BEN and resync
                    existing_profile.ben = "16056315"
                    existing_profile.sync_status = "pending"
                    existing_profile.organization_name = None  # Will be auto-populated
                    logger.info(f"Updated test_applicant BEN to 16056315, queuing resync")
                    _profiles_to_sync.append(existing_profile.id)
                elif existing_profile.sync_status in ("pending", None) or not existing_profile.last_sync_at:
                    # Profile exists with correct BEN but hasn't synced - trigger sync
                    existing_profile.sync_status = "pending"
                    logger.info(f"Test applicant profile needs sync, queuing sync")
                    _profiles_to_sync.append(existing_profile.id)
        db.commit()
    except Exception as e:
        logger.error(f"Error in test_applicant profile reconciliation: {e}")
        db.rollback()

    # ── Seed AlertConfig for admin and super users with daily_digest=True ───
    try:
        admin_super_users = db.query(User).filter(
            User.role.in_(["admin", "super"]),
            User.is_active == True
        ).all()

        for admin_user in admin_super_users:
            existing_config = db.query(AlertConfig).filter(
                AlertConfig.user_id == admin_user.id
            ).first()

            if not existing_config:
                alert_config = AlertConfig(
                    user_id=admin_user.id,
                    alert_on_denial=True,
                    alert_on_status_change=True,
                    alert_on_deadline=True,
                    alert_on_disbursement=True,
                    alert_on_funding_approved=True,
                    alert_on_form_470=True,  # Admin/super see all form 470s
                    alert_on_competitor=True,  # Admin/super monitor competitors
                    deadline_warning_days=14,
                    min_alert_amount=0,  # See all amounts
                    email_notifications=True,
                    in_app_notifications=True,
                    daily_digest=True,  # Enable daily digest for admin/super
                    notification_email=admin_user.email,
                    alert_filters={}
                )
                db.add(alert_config)
                logger.info(f"Created AlertConfig with daily_digest=True for {admin_user.email}")
            else:
                # Ensure daily_digest is enabled for existing admin/super configs
                if not existing_config.daily_digest:
                    existing_config.daily_digest = True
                    logger.info(f"Enabled daily_digest for existing admin/super user {admin_user.email}")

        db.commit()
        logger.info("Admin/super alert configs seeded")
    except Exception as e:
        logger.error(f"Error seeding alert configs: {e}")
        db.rollback()

    # ── Migrate existing CRN data to consultant_crns table ──────────────────
    try:
        all_consultant_profiles = db.query(ConsultantProfile).filter(
            ConsultantProfile.crn.isnot(None),
            ConsultantProfile.crn != ""
        ).all()
        for cp in all_consultant_profiles:
            existing_crn = db.query(ConsultantCRN).filter(
                ConsultantCRN.consultant_profile_id == cp.id,
                ConsultantCRN.crn == cp.crn
            ).first()
            if not existing_crn:
                crn_record = ConsultantCRN(
                    consultant_profile_id=cp.id,
                    crn=cp.crn,
                    company_name=cp.company_name,
                    phone=cp.phone,
                    is_primary=True,
                    is_verified=True,
                    verified_at=cp.updated_at or cp.created_at,
                    is_free=True,
                    payment_status="active",
                )
                db.add(crn_record)
                logger.info(f"Migrated CRN {cp.crn} to consultant_crns table for profile {cp.id}")
        db.commit()
        logger.info("CRN migration complete")
    except Exception as e:
        logger.error(f"Error in CRN migration: {e}")
        db.rollback()

    db.close()

    # ── Trigger USAC data sync for profiles that need it ────────────────────
    if _profiles_to_sync:
        logger.info(f"Queuing USAC data sync for {len(_profiles_to_sync)} profile(s)")

        def run_sync():
            """Run the sync in background thread"""
            import time
            time.sleep(2)  # Wait for server to fully start
            from app.api.v1.applicant import sync_applicant_data
            for profile_id in _profiles_to_sync:
                try:
                    logger.info(f"Starting USAC data sync for profile {profile_id}")
                    sync_applicant_data(profile_id)
                    logger.info(f"Completed USAC data sync for profile {profile_id}")
                except Exception as e:
                    logger.error(f"Error syncing profile {profile_id}: {e}")

        sync_thread = threading.Thread(target=run_sync, daemon=True)
        sync_thread.start()


def _run_schema_migrations(engine):
    """
    Add missing columns to existing tables in MySQL.
    SQLAlchemy's create_all() only creates NEW tables — it won't add columns
    to tables that already exist. This function handles that.
    """
    from sqlalchemy import text, inspect
    
    migrations = [
        # (table, column, SQL type, default)
        ("users", "phone_verified", "TINYINT(1) DEFAULT 0", None),
        ("users", "phone_verified_at", "DATETIME DEFAULT NULL", None),
        ("users", "onboarding_completed", "TINYINT(1) DEFAULT 0", None),
        ("users", "auth_provider", "VARCHAR(50) DEFAULT 'local'", None),
        ("users", "full_name", "VARCHAR(255) DEFAULT NULL", None),
        ("users", "email_verified", "TINYINT(1) DEFAULT 0", None),
        ("users", "email_verified_at", "DATETIME DEFAULT NULL", None),
        ("users", "sms_opt_in", "TINYINT(1) DEFAULT 0", None),
        ("users", "sms_opted_in_at", "DATETIME DEFAULT NULL", None),
        ("users", "verified_entity", "TINYINT(1) DEFAULT 0", None),
        ("users", "verified_entity_at", "DATETIME DEFAULT NULL", None),
        # Email verification codes table (replaces in-memory dict)
        # Note: This table is created via Base.metadata.create_all, migration entries here
        # are only for columns on existing tables.
        # Blog post image columns (added after initial table creation)
        ("blog_posts", "hero_image", "LONGBLOB DEFAULT NULL", None),
        ("blog_posts", "hero_image_mime", "VARCHAR(50) DEFAULT 'image/png'", None),
        ("blog_posts", "hero_image_prompt", "TEXT DEFAULT NULL", None),
        ("blog_posts", "mid_image", "LONGBLOB DEFAULT NULL", None),
        ("blog_posts", "mid_image_mime", "VARCHAR(50) DEFAULT 'image/png'", None),
        ("blog_posts", "mid_image_prompt", "TEXT DEFAULT NULL", None),
        # Alert config columns (added after initial table creation)
        ("alert_configs", "push_notifications", "TINYINT(1) DEFAULT 1", None),
        ("alert_configs", "sms_notifications", "TINYINT(1) DEFAULT 0", None),
        ("alert_configs", "daily_digest", "TINYINT(1) DEFAULT 0", None),
        ("alert_configs", "notification_frequency", "VARCHAR(20) DEFAULT 'realtime'", None),
        ("alert_configs", "notification_email", "VARCHAR(255) DEFAULT NULL", None),
        ("alert_configs", "notification_phone", "VARCHAR(50) DEFAULT NULL", None),
        ("alert_configs", "alert_filters", "JSON DEFAULT NULL", None),
        ("alert_configs", "alert_on_disbursement", "TINYINT(1) DEFAULT 1", None),
        ("alert_configs", "alert_on_funding_approved", "TINYINT(1) DEFAULT 1", None),
        ("alert_configs", "alert_on_form_470", "TINYINT(1) DEFAULT 1", None),
        ("alert_configs", "alert_on_competitor", "TINYINT(1) DEFAULT 0", None),
        ("alert_configs", "deadline_warning_days", "INT DEFAULT 14", None),
        ("alert_configs", "min_alert_amount", "FLOAT DEFAULT 0", None),
        # SavedLead columns (added after initial table creation)
        ("saved_leads", "frn", "VARCHAR(50) DEFAULT NULL", None),
        ("saved_leads", "entity_address", "VARCHAR(500) DEFAULT NULL", None),
        ("saved_leads", "entity_zip", "VARCHAR(20) DEFAULT NULL", None),
        ("saved_leads", "entity_phone", "VARCHAR(50) DEFAULT NULL", None),
        ("saved_leads", "entity_website", "VARCHAR(255) DEFAULT NULL", None),
        ("saved_leads", "contact_title", "VARCHAR(100) DEFAULT NULL", None),
        ("saved_leads", "all_contacts", "JSON DEFAULT NULL", None),
        ("saved_leads", "enriched_data", "JSON DEFAULT NULL", None),
        ("saved_leads", "enrichment_date", "DATETIME DEFAULT NULL", None),
        ("saved_leads", "tags", "JSON DEFAULT NULL", None),
        ("saved_leads", "application_status", "VARCHAR(50) DEFAULT NULL", None),
        ("saved_leads", "frn_status", "VARCHAR(50) DEFAULT NULL", None),
        ("saved_leads", "funding_year", "INT DEFAULT NULL", None),
        ("saved_leads", "funding_amount", "INT DEFAULT 0", None),
        ("saved_leads", "committed_amount", "INT DEFAULT 0", None),
        ("saved_leads", "funded_amount", "INT DEFAULT 0", None),
        ("saved_leads", "categories", "JSON DEFAULT NULL", None),
        ("saved_leads", "services", "JSON DEFAULT NULL", None),
        ("saved_leads", "service_type", "VARCHAR(255) DEFAULT NULL", None),
        ("saved_leads", "manufacturers", "JSON DEFAULT NULL", None),
        ("saved_leads", "source_data", "JSON DEFAULT NULL", None),
        # Multi-CRN: track which CRN imported each school
        ("consultant_schools", "source_crn", "VARCHAR(50) DEFAULT NULL", None),
        # FRN watches — columns added after initial table creation
        ("frn_watches", "target_name", "VARCHAR(255) DEFAULT NULL", None),
        ("frn_watches", "cc_emails", "JSON DEFAULT NULL", None),
        ("frn_watches", "delivery_mode", "VARCHAR(30) NOT NULL DEFAULT 'full_email'", None),
        ("frn_watches", "notify_sms", "TINYINT(1) DEFAULT 0", None),
        ("frn_watches", "sms_phone", "VARCHAR(50) DEFAULT NULL", None),
        ("frn_watches", "status_filter", "VARCHAR(50) DEFAULT NULL", None),
        ("frn_watches", "include_funded", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "include_pending", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "include_denied", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "include_summary", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "include_details", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "include_changes", "TINYINT(1) DEFAULT 1", None),
        ("frn_watches", "last_error", "TEXT DEFAULT NULL", None),
        ("frn_watches", "last_snapshot", "JSON DEFAULT NULL", None),
        ("frn_watches", "send_count", "INT DEFAULT 0", None),
        # FRN report history — columns added after initial table creation
        ("frn_report_history", "watch_names", "JSON DEFAULT NULL", None),
        ("frn_report_history", "funded_count", "INT DEFAULT 0", None),
        ("frn_report_history", "denied_count", "INT DEFAULT 0", None),
        ("frn_report_history", "pending_count", "INT DEFAULT 0", None),
        ("frn_report_history", "total_amount", "INT DEFAULT 0", None),
        ("frn_report_history", "changes_detected", "INT DEFAULT 0", None),
        ("frn_report_history", "sms_sent", "TINYINT(1) DEFAULT 0", None),
        ("frn_report_history", "delivery_modes", "JSON DEFAULT NULL", None),
        ("frn_report_history", "recipient_email", "VARCHAR(255) DEFAULT NULL", None),
        ("frn_report_history", "viewed_at", "DATETIME DEFAULT NULL", None),
        # FRN status change queue — enrichment columns for digest rendering
        ("frn_status_changes_queue", "ben", "VARCHAR(64) DEFAULT NULL", None),
        ("frn_status_changes_queue", "scope_type", "VARCHAR(16) DEFAULT NULL", None),
        ("frn_status_changes_queue", "scope_value", "VARCHAR(128) DEFAULT NULL", None),
        ("frn_status_changes_queue", "old_amount", "FLOAT DEFAULT NULL", None),
        ("frn_status_changes_queue", "new_amount", "FLOAT DEFAULT NULL", None),
        ("frn_status_changes_queue", "entity_name", "VARCHAR(512) DEFAULT NULL", None),
        ("frn_status_changes_queue", "processed_at", "DATETIME DEFAULT NULL", None),
        # Alert config — FRN digest tracking
        ("alert_configs", "last_frn_digest_at", "DATETIME DEFAULT NULL", None),
        ("alert_configs", "sms_enabled", "TINYINT(1) DEFAULT 0", None),
        # Alert config — approaching invoicing-deadline alerts (opt-in 30/7-day cards)
        ("alert_configs", "alert_on_invoice_deadline", "TINYINT(1) DEFAULT 0", None),
        ("alert_configs", "invoice_deadline_intervals", "JSON DEFAULT NULL", None),
        # Admin FRN snapshot — USAC PIA sub-status
        ("admin_frn_snapshots", "pending_reason", "VARCHAR(256) DEFAULT NULL", None),
        # Support chat voice notes / attachments + read tracking on ticket messages
        ("ticket_messages", "file_data", "LONGBLOB DEFAULT NULL", None),
        ("ticket_messages", "file_name", "VARCHAR(255) DEFAULT NULL", None),
        ("ticket_messages", "mime_type", "VARCHAR(100) DEFAULT NULL", None),
        ("ticket_messages", "read_at", "DATETIME DEFAULT NULL", None),
        # Team seats (Phase 4) — admin-granted seat capacity on subscriptions
        ("subscriptions", "seat_limit", "INT NOT NULL DEFAULT 0", None),
    ]
    
    try:
        inspector = inspect(engine)
        
        # Ensure pia_responses table exists (may not exist if app ran on SQLite when table was first deployed)
        if not inspector.has_table("pia_responses"):
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS pia_responses (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        ben VARCHAR(20),
                        frn VARCHAR(20),
                        funding_year INT DEFAULT 2026,
                        application_number VARCHAR(50),
                        organization_name VARCHAR(255),
                        state VARCHAR(2),
                        entity_type VARCHAR(50),
                        pia_category VARCHAR(50) NOT NULL,
                        original_question TEXT NOT NULL,
                        response_text TEXT,
                        supporting_docs JSON,
                        strategy JSON,
                        chat_history JSON,
                        status VARCHAR(50) DEFAULT 'draft',
                        deadline_date DATETIME,
                        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX ix_pia_responses_user_id (user_id),
                        INDEX ix_pia_responses_ben (ben),
                        INDEX ix_pia_responses_frn (frn),
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """))
            logger.info("Migration: Created pia_responses table")

        # Ensure dispatched_deadline_alerts table exists (double-send protection
        # for the opt-in invoicing-deadline alerts).
        if not inspector.has_table("dispatched_deadline_alerts"):
            with engine.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS dispatched_deadline_alerts (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        frn VARCHAR(64) NOT NULL,
                        deadline_type VARCHAR(50) NOT NULL,
                        days_remaining INT NOT NULL,
                        dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_dispatched_deadline_alert (user_id, frn, deadline_type, days_remaining),
                        INDEX ix_dispatched_deadline_user_frn (user_id, frn),
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """))
            logger.info("Migration: Created dispatched_deadline_alerts table")

        for table, column, col_type, _ in migrations:
            if not inspector.has_table(table):
                continue
            existing_cols = [c["name"] for c in inspector.get_columns(table)]
            if column not in existing_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {col_type}"))
                logger.info(f"Migration: Added column {table}.{column}")

        # Make applicant_profiles.ben nullable so users can sign up without a BEN
        # (BEN is collected during onboarding, not at registration)
        if inspector.has_table("applicant_profiles"):
            ben_col = next((c for c in inspector.get_columns("applicant_profiles") if c["name"] == "ben"), None)
            if ben_col and ben_col.get("nullable") is False:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE `applicant_profiles` MODIFY COLUMN `ben` VARCHAR(20) NULL"))
                logger.info("Migration: Made applicant_profiles.ben nullable")

        # Drop UNIQUE constraint on vendor_profiles.spin — demo accounts need to
        # share the same SPIN (Replace Identity feature). Keep a regular index for speed.
        if inspector.has_table("vendor_profiles"):
            indexes = inspector.get_indexes("vendor_profiles")
            unique_spin_idx = next(
                (idx for idx in indexes if "spin" in idx.get("column_names", []) and idx.get("unique")),
                None,
            )
            if unique_spin_idx:
                idx_name = unique_spin_idx["name"]
                with engine.begin() as conn:
                    conn.execute(text(f"DROP INDEX `{idx_name}` ON `vendor_profiles`"))
                    conn.execute(text("CREATE INDEX `ix_vendor_profiles_spin` ON `vendor_profiles` (`spin`)"))
                logger.info(f"Migration: Dropped unique index {idx_name} on vendor_profiles.spin, replaced with non-unique index")

        # Add index on frn_status_changes_queue.ben if column exists but index doesn't
        if inspector.has_table("frn_status_changes_queue"):
            existing_indexes = inspector.get_indexes("frn_status_changes_queue")
            has_ben_idx = any("ben" in idx.get("column_names", []) for idx in existing_indexes)
            existing_cols = [c["name"] for c in inspector.get_columns("frn_status_changes_queue")]
            if "ben" in existing_cols and not has_ben_idx:
                with engine.begin() as conn:
                    conn.execute(text("CREATE INDEX `ix_frn_status_changes_queue_ben` ON `frn_status_changes_queue` (`ben`)"))
                logger.info("Migration: Added index ix_frn_status_changes_queue_ben")

            # Composite (scope_type, scope_value) index — speeds up per-user digest queries
            has_scope_idx = any(
                idx.get("column_names", []) == ["scope_type", "scope_value"]
                for idx in existing_indexes
            )
            if (
                "scope_type" in existing_cols
                and "scope_value" in existing_cols
                and not has_scope_idx
            ):
                with engine.begin() as conn:
                    conn.execute(text(
                        "CREATE INDEX `ix_frn_status_changes_queue_scope` "
                        "ON `frn_status_changes_queue` (`scope_type`, `scope_value`)"
                    ))
                logger.info("Migration: Added composite index ix_frn_status_changes_queue_scope")

        # Retro-enable daily_digest for consultant/vendor users who have it OFF
        if inspector.has_table("alert_configs") and inspector.has_table("users"):
            with engine.begin() as conn:
                result = conn.execute(text("""
                    UPDATE alert_configs ac
                    INNER JOIN users u ON ac.user_id = u.id
                    SET ac.daily_digest = 1
                    WHERE u.role IN ('consultant', 'vendor')
                      AND ac.daily_digest = 0
                """))
                if result.rowcount > 0:
                    logger.info(f"Migration: Retro-enabled daily_digest for {result.rowcount} consultant/vendor users")
    except Exception as e:
        logger.error(f"Schema migration error (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("Starting SkyRate AI Backend...")
    
    # SMTP diagnostic logging
    import os
    smtp_user_env = os.environ.get('SMTP_USER', '<NOT SET>')
    smtp_pass_env = os.environ.get('SMTP_PASSWORD', '<NOT SET>')
    smtp_user_settings = settings.SMTP_USER
    smtp_pass_settings = settings.SMTP_PASSWORD
    logger.info(f"SMTP Config Check: SMTP_USER env={smtp_user_env!r}, settings={smtp_user_settings!r}")
    logger.info(f"SMTP Config Check: SMTP_PASSWORD env={'***' if smtp_pass_env != '<NOT SET>' else '<NOT SET>'}, settings={'***' if smtp_pass_settings else None}")
    
    # Import all models to register them
    from app.models import (
        User, Subscription, ConsultantProfile, ConsultantSchool,
        VendorProfile, VendorSearch, SchoolSnapshot, Application,
        AppealRecord, QueryHistory, ApplicantProfile, ApplicantFRN,
        ApplicantAutoAppeal, ApplicantStatusHistory, USACCache
    )
    from app.models.admin_frn_snapshot import AdminFRNSnapshot
    from app.models.frn_watch import FRNWatch
    from app.models.frn_report_history import FRNReportHistory
    from app.models.frn_disbursement import FRNDisbursement
    from app.models.promo_invite import PromoInvite
    from app.models.push_subscription import PushSubscription
    from app.models.support_ticket import SupportTicket, TicketMessage
    from app.models.prediction import PredictedLead, PredictionRefreshLog
    from app.models.email_verification import EmailVerificationCode
    
    # Guard: Warn loudly if running on SQLite in non-dev environment
    if settings.ENVIRONMENT != "development":
        from app.core.database import engine as _guard_engine
        db_url_str = str(_guard_engine.url)
        if "sqlite" in db_url_str:
            logger.critical(
                "CRITICAL WARNING: Application is running with SQLite database in a non-development environment. "
                "All user data will be LOST on restart/redeploy. "
                "Set DATABASE_URL environment variable immediately."
            )

    # Database initialization (non-blocking — health checks can pass even if DB is slow)
    try:
        # Create database tables (new tables only — does NOT add columns to existing tables)
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created")
        
        # Run lightweight schema migrations for MySQL (add missing columns)
        _run_schema_migrations(engine)
    except Exception as e:
        logger.error(f"Database schema initialization error (non-fatal): {e}")
    
    # Seed demo accounts — runs independently so schema errors don't block seeding
    try:
        seed_demo_accounts()
        logger.info("Demo accounts seeded")
    except Exception as e:
        logger.error(f"Demo account seeding error: {e}")
    
    # Initialize background scheduler for alerts/digests
    from app.services.scheduler_service import init_scheduler, shutdown_scheduler, refresh_admin_frn_snapshot
    try:
        init_scheduler()
        logger.info("Background scheduler initialized")
    except Exception as e:
        logger.error(f"Failed to initialize scheduler: {e}")

    # Populate admin FRN snapshot if table is empty (first deploy / after migration)
    try:
        from app.models.admin_frn_snapshot import AdminFRNSnapshot as _AFS
        _db = SessionLocal()
        _snap_count = _db.query(_AFS).count()
        _db.close()
        if _snap_count == 0:
            import threading
            threading.Thread(target=refresh_admin_frn_snapshot, daemon=True).start()
            logger.info("Admin FRN snapshot empty — background refresh started")
    except Exception as e:
        logger.warning(f"Admin FRN snapshot startup check skipped: {e}")

    # Self-heal: ensure vendor_form470_snapshots JSON cols are MEDIUMTEXT (TEXT 64KB cap
    # silently truncated rows -> JSONDecodeError on /vendor/470/leads). Idempotent.
    try:
        from sqlalchemy import text as _sql_text
        with engine.begin() as _c:
            _rows = _c.execute(_sql_text(
                "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_form470_snapshots' "
                "AND COLUMN_NAME IN ('services_json','manufacturers_json','service_types_json','categories_json')"
            )).fetchall()
            _need_alter = [r[0] for r in _rows if str(r[1]).lower() == "text"]
            for _col in _need_alter:
                logger.info(f"[startup] healing vendor_form470_snapshots.{_col}: TEXT -> MEDIUMTEXT")
                _c.execute(_sql_text(f"ALTER TABLE vendor_form470_snapshots MODIFY {_col} MEDIUMTEXT NULL"))
            if _need_alter:
                _del = _c.execute(_sql_text(
                    "DELETE FROM vendor_form470_snapshots "
                    "WHERE LENGTH(services_json) >= 65500 "
                    "OR LENGTH(manufacturers_json) >= 65500 "
                    "OR LENGTH(service_types_json) >= 65500 "
                    "OR LENGTH(categories_json) >= 65500"
                ))
                logger.info(f"[startup] deleted {_del.rowcount} truncated snapshot row(s) so next refresh repopulates clean")
    except Exception as _heal_err:
        logger.warning(f"[startup] vendor_form470_snapshots heal skipped: {_heal_err}")

    # Self-heal: ensure admin_frn_snapshots has spin + spin_name + contract_number columns.
    # Added in migration f1a2b3c4d5e6 but Alembic doesn't run automatically on deploy.
    try:
        from sqlalchemy import text as _sql_text2
        with engine.begin() as _c2:
            _existing = {r[0] for r in _c2.execute(_sql_text2(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_frn_snapshots' "
                "AND COLUMN_NAME IN ('spin','spin_name','contract_number')"
            )).fetchall()}
            if 'spin' not in _existing:
                logger.info("[startup] adding admin_frn_snapshots.spin column")
                _c2.execute(_sql_text2("ALTER TABLE admin_frn_snapshots ADD COLUMN spin VARCHAR(64) NULL"))
                _c2.execute(_sql_text2("CREATE INDEX ix_admin_frn_snap_spin ON admin_frn_snapshots (spin)"))
            if 'spin_name' not in _existing:
                logger.info("[startup] adding admin_frn_snapshots.spin_name column")
                _c2.execute(_sql_text2("ALTER TABLE admin_frn_snapshots ADD COLUMN spin_name VARCHAR(255) NULL"))
                _c2.execute(_sql_text2("CREATE INDEX ix_admin_frn_snap_spin_name ON admin_frn_snapshots (spin_name)"))
                # One-time backfill: historically the `spin` column was populated
                # with the SERVICE PROVIDER NAME (preferring `spin_name` over the
                # numeric SPIN). Move those values into the new `spin_name`
                # column so SPIN-by-number search starts working as data gets
                # refreshed. Rows where `spin` is purely numeric are left alone
                # (those already hold a real SPIN number).
                logger.info("[startup] backfilling admin_frn_snapshots.spin_name from non-numeric spin values")
                _bf = _c2.execute(_sql_text2(
                    "UPDATE admin_frn_snapshots "
                    "SET spin_name = spin "
                    "WHERE spin IS NOT NULL AND spin <> '' "
                    "AND spin NOT REGEXP '^[0-9]+$'"
                ))
                logger.info(f"[startup] spin_name backfill copied {_bf.rowcount} rows")
            if 'contract_number' not in _existing:
                logger.info("[startup] adding admin_frn_snapshots.contract_number column")
                _c2.execute(_sql_text2("ALTER TABLE admin_frn_snapshots ADD COLUMN contract_number VARCHAR(128) NULL"))
                _c2.execute(_sql_text2("CREATE INDEX ix_admin_frn_snap_contract ON admin_frn_snapshots (contract_number)"))
    except Exception as _heal_err2:
        logger.warning(f"[startup] admin_frn_snapshots spin/spin_name/contract_number heal skipped: {_heal_err2}")

    yield
    
    # Shutdown
    logger.info("Shutting down SkyRate AI Backend...")
    
    # Stop background scheduler
    try:
        shutdown_scheduler()
        logger.info("Background scheduler stopped")
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")


# Initialize FastAPI
app = FastAPI(
    title="SkyRate AI API",
    description="E-Rate Intelligence Platform API - Consultant & Vendor Portals",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add rate limiter to app state
# app.state.limiter = limiter
# app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# IP blocklist middleware
app.add_middleware(IPBlocklistMiddleware)

# perf_v2: record per-request latency / cache-hit telemetry.
app.add_middleware(PerfTimingMiddleware)

# CORS for frontend (after security headers so they're applied)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "https://skyrate.ai",
        "https://www.skyrate.ai",
        "https://*.skyrate.ai",
        "https://skyrate-unox7.ondigitalocean.app",
        "https://erateapp.com",
        "https://www.erateapp.com",
        "https://*.erateapp.com",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    from starlette.exceptions import HTTPException as StarletteHTTPException
    from fastapi.exceptions import HTTPException as FastAPIHTTPException, RequestValidationError

    # Prevent turning legitimate client-side exceptions (like 404 Ticket Not Found or 403 Forbidden)
    # into internal 500 errors and Telegram alerts, which can also trigger Starlette's BaseHTTPMiddleware
    # 'RuntimeError: No response returned' bug.
    if isinstance(exc, (StarletteHTTPException, FastAPIHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail}
        )
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"success": False, "error": "Validation error", "detail": exc.errors()}
        )

    error_detail = f"{type(exc).__name__}: {str(exc)}"
    tb = traceback.format_exc()
    logger.error(f"Unhandled exception on {request.url.path}: {error_detail}\n{tb}")

    # Fire-and-forget Telegram alert so we hear about prod 500s in real time.
    try:
        from .services.telegram_alerts import send_alert
        send_alert(
            title=f"500 on {request.method} {request.url.path}",
            body=f"{error_detail}\n\n{tb[-1500:]}",
            severity="error",
        )
    except Exception:
        pass

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": error_detail  # Always show detail for debugging
        }
    )

# ==================== API ROUTERS ====================
# V1 API - Authentication, Subscriptions, Portals
#
# ROUTING EXPLAINED:
# - Digital Ocean routing rule "/api" strips the prefix before forwarding to backend
# - So when frontend calls /api/v1/auth/login, backend receives /v1/auth/login
# - Therefore we mount all routers at /v1 (not /api/v1)
#
# For local development:
# - Frontend .env.local should set NEXT_PUBLIC_API_URL=http://localhost:8001/api
# - This way frontend calls http://localhost:8001/api/v1/auth/login
# - Which hits backend at /api/v1/auth/login, but we also need /v1 for local
#
# SOLUTION: Mount at /v1 for production (DO strips /api)
# Also add a redirect from /api/v1/* to /v1/* for local development

# Middleware to rewrite /api/v1/* to /v1/* for local development
# This simulates what Digital Ocean does (stripping /api prefix)
class ApiPrefixRewriteMiddleware(BaseHTTPMiddleware):
    """Rewrite /api/v1/* paths to /v1/* for local development compatibility"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # Check if path starts with /api/v1 or /api/ (for local dev)
        path = request.scope.get("path", "")
        if path.startswith("/api/"):
            # Rewrite to remove /api prefix (simulating DO routing)
            new_path = path[4:]  # Remove "/api" (4 chars)
            request.scope["path"] = new_path
            logger.debug(f"Rewriting path: {path} -> {new_path}")
        return await call_next(request)

# Add the rewrite middleware BEFORE routes are processed
app.add_middleware(ApiPrefixRewriteMiddleware)

# Request timing middleware (Phase A4 perf diagnosis).
# Logs server-side wall time for every /v1/* request. Logs to stderr at INFO so
# DigitalOcean runtime logs capture it. Adds an X-Server-Time-Ms response header
# so Playwright tests / browsers can read it without log access.
import time as _time_for_perf
@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    path = request.scope.get("path", "")
    started = _time_for_perf.perf_counter()
    response = await call_next(request)
    elapsed_ms = (_time_for_perf.perf_counter() - started) * 1000.0
    response.headers["X-Server-Time-Ms"] = f"{elapsed_ms:.1f}"
    # Only log API paths to reduce noise
    if path.startswith("/v1/") or path.startswith("/api/"):
        source = getattr(request.state, "data_source", "n/a")
        rows = getattr(request.state, "data_rows", "-")
        partial = str(getattr(request.state, "data_partial", False)).lower()
        user_id = getattr(request.state, "user_id", "-")
        tag = f"source={source} rows={rows} partial={partial} user_id={user_id}"
        # Threshold-aware log: warn if >1s, info otherwise
        if elapsed_ms >= 1000:
            logger.warning(f"[perf] SLOW {request.method} {path} = {elapsed_ms:.0f}ms (status={response.status_code}) {tag}")
        elif elapsed_ms >= 200:
            logger.info(f"[perf] {request.method} {path} = {elapsed_ms:.0f}ms {tag}")
        elif source != "n/a":
            logger.info(f"[perf] OK {request.method} {path} = {elapsed_ms:.0f}ms {tag}")
    return response

# Primary routes at /v1 (this is what DO sends after stripping /api)
app.include_router(auth.router, prefix="/v1")
app.include_router(subscriptions.router, prefix="/v1")
app.include_router(consultant.router, prefix="/v1")
app.include_router(vendor.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(admin_jobs.router, prefix="/v1")
app.include_router(query.router, prefix="/v1")
app.include_router(schools.router, prefix="/v1")
app.include_router(appeals.router, prefix="/v1")
app.include_router(alerts.router, prefix="/v1")
app.include_router(notifications.router, prefix="/v1")
app.include_router(applicant.router, prefix="/v1")
app.include_router(support.router, prefix="/v1")
app.include_router(onboarding.router, prefix="/v1")
app.include_router(blog.router, prefix="/v1")
app.include_router(frn_reports.router, prefix="/v1")
app.include_router(usac.router, prefix="/v1")
app.include_router(portfolio_analyzer.router, prefix="/v1")
app.include_router(pia.router, prefix="/v1")
app.include_router(mail_campaigns.router, prefix="/v1")
app.include_router(leads.router, prefix="/v1")
app.include_router(public_tools.router, prefix="/v1")
app.include_router(denial_hunter.router, prefix="/v1")
app.include_router(denial_hunter_tracking.router, prefix="/v1")
app.include_router(compliance.router, prefix="/v1")

# ==================== MODELS ====================

class QueryRequest(BaseModel):
    query: str
    year: Optional[int] = None
    limit: Optional[int] = 100

class QueryResponse(BaseModel):
    success: bool
    interpretation: Dict[str, Any]
    data: List[Dict[str, Any]]
    count: int
    explanation: str

class AnalysisRequest(BaseModel):
    records: List[Dict[str, Any]]
    analysis_type: str = "standard"  # standard, denial, appeal

class SearchRequest(BaseModel):
    year: int
    state: Optional[str] = None
    status: Optional[str] = None
    ben: Optional[str] = None
    service_type: Optional[str] = None
    limit: int = 100

class EmailCampaignRequest(BaseModel):
    recipients: List[str]
    template: str
    subject: str
    custom_data: Optional[Dict[str, Any]] = None

# ==================== ROOT ENDPOINTS ====================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "SkyRate AI API",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint — used by DigitalOcean health probes and post-deploy verification"""
    from app.core.database import engine as _health_engine
    from sqlalchemy import text

    db_status = "unknown"
    db_type = "unknown"
    db_warning = None

    try:
        with _health_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
        db_url = str(_health_engine.url)
        if "sqlite" in db_url:
            db_type = "sqlite"
            db_warning = "CRITICAL: Running on ephemeral SQLite — DATA WILL BE LOST ON RESTART. Set DATABASE_URL env var."
        elif "mysql" in db_url:
            db_type = "mysql"
        elif "postgresql" in db_url or "postgres" in db_url:
            db_type = "postgresql"
        else:
            db_type = db_url.split(":")[0]
    except Exception as e:
        db_status = f"error: {str(e)}"

    health = {
        "status": "healthy" if db_status == "ok" else "degraded",
        "database": db_status,
        "database_type": db_type,
        "environment": settings.ENVIRONMENT,
    }
    if db_warning:
        health["warning"] = db_warning

    return health

# Health check at /v1/health (after /api prefix strip)
@app.get("/v1/health")
async def health_check_v1():
    return {"status": "healthy", "version": "2.0.0"}

@app.post("/v1/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """Process a natural language query about E-Rate data"""
    try:
        ai = get_ai_service()
        usac = get_usac_service()
        
        # Interpret query with AI
        interpretation = ai.interpret_query(request.query)
        
        # Extract filters
        filters = interpretation.get('filters', {})
        year = request.year or interpretation.get('year')
        if isinstance(year, str):
            year = int(year) if year.isdigit() else None
        
        # Fetch data
        data = usac.fetch_form_471(year=year, filters=filters, limit=request.limit)
        
        return QueryResponse(
            success=True,
            interpretation=interpretation,
            data=data,
            count=len(data),
            explanation=interpretation.get('explanation', f'Found {len(data)} records')
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/search")
async def direct_search(request: SearchRequest):
    """Direct search with explicit filters (no AI interpretation)"""
    try:
        usac = get_usac_service()
        
        filters = {}
        if request.state:
            filters['state'] = request.state.upper()
        if request.status:
            filters['application_status'] = request.status
        if request.ben:
            filters['ben'] = request.ben
        if request.service_type:
            filters['form_471_service_type_name'] = request.service_type
        
        data = usac.fetch_form_471(year=request.year, filters=filters, limit=request.limit)
        
        return {"success": True, "data": data, "count": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/analyze")
async def analyze_records(request: AnalysisRequest):
    """Perform AI analysis on selected records"""
    try:
        ai = get_ai_service()
        denial = get_denial_service()
        
        if request.analysis_type == "denial":
            results = denial.analyze_denials_batch(request.records)
            return {"success": True, "analyses": results}
        else:
            # Standard analysis
            analysis = ai.analyze_data(request.records, request.analysis_type)
            return {"success": True, "analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/v1/history")
async def get_history(limit: int = 20):
    """Get recent query history - placeholder"""
    return {"success": True, "history": [], "message": "Query history available via /v1/query/history"}

@app.post("/v1/campaigns/send")
async def send_campaign(request: EmailCampaignRequest, background_tasks: BackgroundTasks):
    """Send email campaign (runs in background) - placeholder for future implementation"""
    # Email campaigns will be implemented in a future version
    raise HTTPException(
        status_code=501, 
        detail="Email campaigns feature not yet implemented. Use /v1/consultant/email for direct emails."
    )

# ==================== STARTUP ====================
# Note: Startup logic lives in the lifespan() context manager above (line ~810).
# FastAPI ignores @app.on_event("startup") when lifespan= is set on FastAPI().

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
