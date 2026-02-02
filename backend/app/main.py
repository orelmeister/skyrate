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
from app.api.v1 import auth, subscriptions, consultant, vendor, admin, query, schools, appeals, alerts

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
    """Create demo accounts if they don't exist"""
    from sqlalchemy.orm import Session
    from app.models.user import User, UserRole
    from app.core.database import SessionLocal
    import bcrypt
    
    db = SessionLocal()
    try:
        demo_accounts = [
            ("test_consultant@example.com", UserRole.CONSULTANT.value, "TestPass123!"),
            ("test_vendor@example.com", UserRole.VENDOR.value, "TestPass123!"),
        ]
        
        for email, role, password in demo_accounts:
            existing = db.query(User).filter(User.email == email).first()
            if not existing:
                hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
                user = User(
                    email=email,
                    password_hash=hashed,
                    role=role,
                    is_active=True
                )
                db.add(user)
                logger.info(f"Created demo account: {email}")
        
        db.commit()
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
        AppealRecord, QueryHistory
    )
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")
    
    # Seed demo accounts for testing
    seed_demo_accounts()
    logger.info("Demo accounts seeded")
    
    yield
    
    # Shutdown
    logger.info("Shutting down SkyRate AI Backend...")


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
