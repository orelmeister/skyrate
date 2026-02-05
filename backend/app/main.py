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
from app.api.v1 import auth, subscriptions, consultant, vendor, admin, query, schools, appeals, alerts, applicant

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
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")
    
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
        "https://*.skyrate.ai",
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
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "An error occurred"
        }
    )

# ==================== API ROUTERS ====================
# V1 API - Authentication, Subscriptions, Portals
app.include_router(auth.router, prefix="/api/v1")
app.include_router(subscriptions.router, prefix="/api/v1")
app.include_router(consultant.router, prefix="/api/v1")
app.include_router(vendor.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(query.router, prefix="/api/v1")
app.include_router(schools.router, prefix="/api/v1")
app.include_router(appeals.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(applicant.router, prefix="/api/v1")

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

# Keep /api/v1/health for backwards compatibility
@app.get("/api/v1/health")
async def health_check_v1():
    return {"status": "healthy", "version": "2.0.0"}

@app.post("/api/v1/query", response_model=QueryResponse)
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

@app.post("/api/v1/search")
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

@app.post("/api/v1/analyze")
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

@app.get("/api/v1/history")
async def get_history(limit: int = 20):
    """Get recent query history - placeholder"""
    return {"success": True, "history": [], "message": "Query history available via /api/v1/query/history"}

@app.post("/api/v1/campaigns/send")
async def send_campaign(request: EmailCampaignRequest, background_tasks: BackgroundTasks):
    """Send email campaign (runs in background) - placeholder for future implementation"""
    # Email campaigns will be implemented in a future version
    raise HTTPException(
        status_code=501, 
        detail="Email campaigns feature not yet implemented. Use /api/v1/consultant/email for direct emails."
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
