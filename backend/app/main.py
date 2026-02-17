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

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Import core modules
from app.core.config import settings
from app.core.database import engine, Base

# Import API routers - services are imported lazily within these
from app.api.v1 import auth, subscriptions, consultant, vendor, admin, query, schools, appeals, alerts, applicant, notifications, support, onboarding, blog

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


def seed_demo_accounts():
    """Create demo accounts if they don't exist, and auto-sync data from USAC"""
    from app.models.applicant import ApplicantBEN
    from app.models.vendor import VendorProfile
    from app.models.consultant import ConsultantProfile
    from sqlalchemy.orm import Session
    from app.models.user import User, UserRole
    from app.models.applicant import ApplicantProfile
    from app.core.database import SessionLocal
    import bcrypt
    import threading
    
    # Track profiles that need USAC data sync
    _profiles_to_sync = []
    
    db = SessionLocal()
    try:
        demo_accounts = [
            ("test_consultant@example.com", UserRole.CONSULTANT.value, "TestPass123!"),
            ("test_vendor@example.com", UserRole.VENDOR.value, "TestPass123!"),
            ("test_applicant@example.com", UserRole.APPLICANT.value, "TestPass123!"),
        ]
        
        # Seed super admin account
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
            )
            db.add(admin_user)
            db.flush()
            logger.info(f"Created super admin account: {admin_email}")
        else:
            admin_existing.password_hash = admin_hashed
            admin_existing.role = UserRole.ADMIN.value
            admin_existing.is_active = True
            logger.info(f"Updated super admin account: {admin_email}")
        
        for email, role, password in demo_accounts:
            existing = db.query(User).filter(User.email == email).first()
            hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            if not existing:
                user = User(
                    email=email,
                    password_hash=hashed,
                    role=role,
                    is_active=True
                )
                db.add(user)
                db.flush()  # Get the user ID
                logger.info(f"Created demo account: {email}")
            else:
                # Update existing user's password hash to ensure login works
                existing.password_hash = hashed
                existing.is_active = True
                user = existing
                logger.info(f"Updated password for demo account: {email}")
            
            # Create vendor profile for test_vendor (whether new or existing user)
            if role == UserRole.VENDOR.value:
                existing_vp = db.query(VendorProfile).filter(
                    VendorProfile.user_id == user.id
                ).first()
                if not existing_vp:
                    vp = VendorProfile(
                        user_id=user.id,
                        spin="143032945",  # Real SPIN - CDW-G
                        company_name="Demo Vendor Co.",
                        contact_name="Test Vendor",
                    )
                    db.add(vp)
                    db.flush()
                    logger.info(f"Created vendor profile for {email} with SPIN 143032945")
                elif not existing_vp.spin:
                    existing_vp.spin = "143032945"
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
                    db.flush()  # Get the profile ID
                    
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
        
        # Also check if existing test_applicant user needs a profile
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
        logger.info("Demo accounts seeded")
        
        # Now trigger USAC data sync for profiles that need it
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
            
    except Exception as e:
        logger.error(f"Error seeding demo accounts: {e}")
        db.rollback()
    finally:
        db.close()


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
        ("users", "onboarding_completed", "TINYINT(1) DEFAULT 0", None),
        ("users", "auth_provider", "VARCHAR(50) DEFAULT 'local'", None),
        ("users", "full_name", "VARCHAR(255) DEFAULT NULL", None),
    ]
    
    try:
        inspector = inspect(engine)
        for table, column, col_type, _ in migrations:
            if not inspector.has_table(table):
                continue
            existing_cols = [c["name"] for c in inspector.get_columns(table)]
            if column not in existing_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {col_type}"))
                logger.info(f"Migration: Added column {table}.{column}")
    except Exception as e:
        logger.error(f"Schema migration error (non-fatal): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("Starting SkyRate AI Backend...")
    
    # Import all models to register them
    from app.models import (
        User, Subscription, ConsultantProfile, ConsultantSchool,
        VendorProfile, VendorSearch, SchoolSnapshot, Application,
        AppealRecord, QueryHistory, ApplicantProfile, ApplicantFRN,
        ApplicantAutoAppeal, ApplicantStatusHistory
    )
    from app.models.push_subscription import PushSubscription
    from app.models.support_ticket import SupportTicket, TicketMessage
    
    # Create database tables (new tables only — does NOT add columns to existing tables)
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")
    
    # Run lightweight schema migrations for MySQL (add missing columns)
    _run_schema_migrations(engine)
    
    # Seed demo accounts for testing
    seed_demo_accounts()
    logger.info("Demo accounts seeded")
    
    # Initialize background scheduler for alerts/digests
    from app.services.scheduler_service import init_scheduler, shutdown_scheduler
    try:
        init_scheduler()
        logger.info("Background scheduler initialized")
    except Exception as e:
        logger.error(f"Failed to initialize scheduler: {e}")
    
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
    error_detail = f"{type(exc).__name__}: {str(exc)}"
    logger.error(f"Unhandled exception on {request.url.path}: {error_detail}\n{traceback.format_exc()}")
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

# Primary routes at /v1 (this is what DO sends after stripping /api)
app.include_router(auth.router, prefix="/v1")
app.include_router(subscriptions.router, prefix="/v1")
app.include_router(consultant.router, prefix="/v1")
app.include_router(vendor.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(query.router, prefix="/v1")
app.include_router(schools.router, prefix="/v1")
app.include_router(appeals.router, prefix="/v1")
app.include_router(alerts.router, prefix="/v1")
app.include_router(notifications.router, prefix="/v1")
app.include_router(applicant.router, prefix="/v1")
app.include_router(support.router, prefix="/v1")
app.include_router(onboarding.router, prefix="/v1")
app.include_router(blog.router, prefix="/v1")

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
    """Health check endpoint"""
    return {"status": "healthy", "version": "2.0.0"}

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

@app.on_event("startup")
async def startup_event():
    print("🚀 SkyRate AI API v2 starting...")
    # Pre-warm services
    get_usac_service()
    print("✅ USAC service ready")
    get_ai_service()
    print("✅ AI service ready")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
