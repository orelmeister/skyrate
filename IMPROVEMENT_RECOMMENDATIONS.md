# SkyRate AI V2 - Improvement Recommendations

> **Document Version**: 1.0  
> **Date**: January 2025  
> **Repository**: SkyRate AI V2 - E-Rate Funding Intelligence Platform

This document provides a comprehensive analysis of the SkyRate AI V2 codebase with actionable recommendations for improving security, code quality, testing, documentation, and developer experience.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Recommendations](#security-recommendations)
3. [Code Quality & Architecture](#code-quality--architecture)
4. [Testing Strategy](#testing-strategy)
5. [DevOps & Infrastructure](#devops--infrastructure)
6. [Documentation](#documentation)
7. [Developer Experience](#developer-experience)
8. [Frontend Improvements](#frontend-improvements)
9. [Backend Improvements](#backend-improvements)
10. [Database & Data Layer](#database--data-layer)
11. [API Design](#api-design)
12. [Performance Optimization](#performance-optimization)
13. [Monitoring & Observability](#monitoring--observability)
14. [Implementation Roadmap](#implementation-roadmap)
15. [Appendix](#appendix)

---

## Executive Summary

### Current State Assessment

| Category | Status | Score |
|----------|--------|-------|
| Security | ⚠️ Needs Attention | 5/10 |
| Code Quality | 🟡 Moderate | 6/10 |
| Testing | 🔴 Critical Gap | 1/10 |
| Documentation | 🟡 Moderate | 5/10 |
| DevOps | 🔴 Missing | 2/10 |
| Developer Experience | 🟡 Moderate | 5/10 |

### Key Findings

- **No test coverage** - Zero test files found in the repository
- **Security concerns** - Hardcoded secrets, missing rate limiting, permissive CORS
- **Missing DevOps** - No CI/CD, no Docker configuration (despite README references)
- **Large files** - Some service files exceed 800 lines, reducing maintainability
- **Good foundation** - Well-structured FastAPI backend, modern Next.js frontend

### Priority Actions

1. 🔴 **Immediate**: Fix hardcoded secret key, add rate limiting to auth
2. 🔴 **This Week**: Add basic test coverage for critical paths
3. 🟠 **This Month**: Implement CI/CD pipeline, add Docker configuration
4. 🟡 **Ongoing**: Refactor large files, improve documentation

---

## Security Recommendations

### 🔴 Critical: Hardcoded Secret Key

**Location**: `backend/app/core/config.py`

**Current Code**:
```python
SECRET_KEY: str = "your-super-secret-key-change-in-production"
```

**Problem**: Default secret key is a security vulnerability if deployed to production.

**Recommendation**:
```python
SECRET_KEY: str = Field(..., description="JWT Secret Key - REQUIRED")

# Or with validation:
@validator('SECRET_KEY')
def validate_secret_key(cls, v, values):
    if values.get('ENVIRONMENT') != 'development':
        if v == "your-super-secret-key-change-in-production":
            raise ValueError("SECRET_KEY must be changed in production")
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
    return v
```

**Impact**: Prevents accidental deployment with insecure defaults.

---

### 🔴 Critical: Missing Rate Limiting on Authentication

**Location**: `backend/app/api/v1/auth.py`

**Problem**: No rate limiting on `/auth/login` or `/auth/register` endpoints, enabling brute-force attacks.

**Recommendation**:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    # ... existing code
```

**Suggested Limits**:
| Endpoint | Rate Limit |
|----------|------------|
| `/auth/login` | 5 requests/minute |
| `/auth/register` | 3 requests/minute |
| `/auth/forgot-password` | 3 requests/hour |
| `/auth/refresh` | 30 requests/minute |

---

### 🟠 High: Permissive CORS Configuration

**Location**: `frontend/next.config.js`

**Current Code**:
```javascript
headers: [
  { key: "Access-Control-Allow-Origin", value: "*" },
]
```

**Problem**: Allows requests from any origin, potential security risk in production.

**Recommendation**:
```javascript
headers: [
  { 
    key: "Access-Control-Allow-Origin", 
    value: process.env.NODE_ENV === 'production' 
      ? "https://app.skyrate.ai" 
      : "http://localhost:3000" 
  },
]
```

---

### 🟠 High: Input Sanitization for AI Queries

**Location**: `backend/app/main.py` - `/api/v1/query` endpoint

**Problem**: User input passed directly to AI services without validation, risking prompt injection.

**Recommendation**:
```python
import re

def sanitize_query(query: str) -> str:
    """Sanitize user query before AI processing."""
    # Remove potential prompt injection patterns
    query = re.sub(r'(ignore|disregard|forget)\s+(previous|above|all)', '', query, flags=re.IGNORECASE)
    # Limit length
    query = query[:500]
    # Remove special characters that could affect prompts
    query = re.sub(r'[<>{}[\]|\\]', '', query)
    return query.strip()

@app.post("/api/v1/query")
async def process_query(request: QueryRequest):
    sanitized_query = sanitize_query(request.query)
    # ... rest of implementation
```

---

### 🟡 Medium: Password Policy Enhancement

**Location**: `backend/app/api/v1/auth.py`

**Current Code**:
```python
password: str = Field(..., min_length=8)
```

**Recommendation**: Add comprehensive password validation:
```python
from pydantic import validator
import re

class UserRegister(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)
    
    @validator('password')
    def validate_password_strength(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v
```

---

### 🟡 Medium: Add Security Headers

**Recommendation**: Add security headers middleware to FastAPI:

```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

# Add to main.py
if settings.ENVIRONMENT == "production":
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(
        TrustedHostMiddleware, 
        allowed_hosts=["skyrate.ai", "*.skyrate.ai"]
    )

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

---

### Security Checklist

- [ ] Remove/protect default secret key
- [ ] Implement rate limiting on auth endpoints
- [ ] Restrict CORS in production
- [ ] Add input sanitization for AI queries
- [ ] Enhance password policy
- [ ] Add security headers middleware
- [ ] Enable secret scanning in repository
- [ ] Implement API key rotation strategy
- [ ] Add audit logging for sensitive operations
- [ ] Review and secure all OAuth configurations

---

## Code Quality & Architecture

### 🔴 Critical: Large File Refactoring

**Problem**: Several files exceed recommended size limits, reducing maintainability.

| File | Lines | Recommended Action |
|------|-------|-------------------|
| `backend/app/services/usac_service.py` | 802 | Split into 3-4 modules |
| `backend/app/api/v1/consultant.py` | 600+ | Split into 3 modules |
| `backend/app/services/appeals_service.py` | 373 | Consider splitting |
| `frontend/app/consultant/page.tsx` | 800+ | Extract components |

**Recommendation for `usac_service.py`**:
```
backend/app/services/usac/
├── __init__.py           # Re-exports all services
├── base.py               # USACService base class, shared utilities
├── form_471_service.py   # Form 471 specific operations
├── form_470_service.py   # Form 470 specific operations
├── c2_budget_service.py  # C2 Budget Tool operations
├── ben_service.py        # BEN entity operations
└── cache.py              # Caching utilities
```

**Recommendation for `consultant.py` API**:
```
backend/app/api/v1/consultant/
├── __init__.py           # Router aggregation
├── dashboard.py          # Dashboard stats endpoints
├── crn.py                # CRN verification endpoints
├── schools.py            # School management endpoints
└── schemas.py            # Shared Pydantic models
```

---

### 🟠 High: Singleton Pattern Issues

**Location**: `backend/app/services/usac_service.py`

**Current Code**:
```python
class USACService:
    _instance: Optional['USACService'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
```

**Problem**: Manual singleton is hard to test and doesn't integrate with FastAPI's DI.

**Recommendation**: Use FastAPI's dependency injection:
```python
from functools import lru_cache

@lru_cache()
def get_usac_service() -> USACService:
    """Cached singleton via FastAPI dependency injection."""
    return USACService()

# In endpoints:
@router.get("/schools")
async def get_schools(
    usac: USACService = Depends(get_usac_service)
):
    # ...
```

---

### 🟠 High: Mixed Sync/Async Code

**Problem**: FastAPI endpoints are async but services use synchronous `requests` library.

**Locations**:
- `backend/app/services/usac_service.py`
- `backend/utils/usac_client.py`

**Recommendation**: Migrate to `httpx` async client:
```python
import httpx

class USACService:
    def __init__(self):
        self._client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=100)
        )
    
    async def fetch_form_471(self, year: int) -> List[Dict]:
        response = await self._client.get(
            f"{self.BASE_URL}/resource/srbr-2d59.json",
            params={"funding_year": year}
        )
        response.raise_for_status()
        return response.json()
```

---

### 🟡 Medium: Inconsistent Error Handling

**Problem**: Mixed error response patterns across endpoints.

**Pattern 1** (HTTPException):
```python
raise HTTPException(status_code=404, detail="Not found")
```

**Pattern 2** (Dict response):
```python
return {"success": False, "error": "Not found"}
```

**Recommendation**: Standardize with custom exception handlers:
```python
# backend/app/core/exceptions.py
class APIException(Exception):
    def __init__(self, status_code: int, error_code: str, message: str, details: dict = None):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}

# Standard error response
class ErrorResponse(BaseModel):
    success: bool = False
    error_code: str
    message: str
    details: dict = {}
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# Exception handler
@app.exception_handler(APIException)
async def api_exception_handler(request: Request, exc: APIException):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error_code=exc.error_code,
            message=exc.message,
            details=exc.details
        ).dict()
    )
```

---

### 🟡 Medium: Type Hints Improvement

**Problem**: Inconsistent type hints, especially for complex return types.

**Current**:
```python
def fetch_form_471(self, year=None, filters=None, limit=1000):
    # Returns List[Dict[str, Any]] but not annotated
```

**Recommendation**:
```python
from typing import TypedDict

class Form471Record(TypedDict):
    ben: str
    applicant_name: str
    funding_year: int
    application_status: str
    # ... all fields

def fetch_form_471(
    self, 
    year: Optional[int] = None, 
    filters: Optional[Dict[str, Any]] = None, 
    limit: int = 1000
) -> List[Form471Record]:
    """Fetch Form 471 records from USAC."""
```

---

### Code Quality Checklist

- [ ] Split large files (>400 lines) into modules
- [ ] Replace manual singletons with DI
- [ ] Migrate sync HTTP calls to async httpx
- [ ] Standardize error handling
- [ ] Add comprehensive type hints
- [ ] Enable strict mypy checking
- [ ] Add docstrings to all public functions
- [ ] Remove dead code and unused imports
- [ ] Apply consistent naming conventions

---

## Testing Strategy

### 🔴 Critical: No Test Coverage

**Current State**: Zero test files in the repository.

**Impact**: 
- Cannot verify code correctness
- Refactoring is risky
- Bugs reach production
- No confidence in deployments

### Recommended Test Structure

```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Pytest fixtures
│   ├── unit/
│   │   ├── test_security.py     # Password hashing, JWT
│   │   ├── test_usac_service.py # Service logic
│   │   └── test_validators.py   # Input validation
│   ├── integration/
│   │   ├── test_auth_api.py     # Auth endpoints
│   │   ├── test_consultant_api.py
│   │   └── test_schools_api.py
│   └── fixtures/
│       ├── users.json           # Test user data
│       └── usac_responses.json  # Mock USAC API responses

frontend/
├── __tests__/
│   ├── components/
│   │   ├── SearchResultsTable.test.tsx
│   │   └── Dashboard.test.tsx
│   ├── lib/
│   │   ├── api.test.ts
│   │   └── auth-store.test.ts
│   └── pages/
│       └── consultant.test.tsx
```

### Priority Test Cases

#### 1. Authentication (Critical)
```python
# backend/tests/unit/test_security.py
import pytest
from app.core.security import hash_password, verify_password, create_access_token

def test_password_hashing():
    password = "SecurePass123!"
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password("WrongPassword", hashed)

def test_password_truncation():
    """Ensure bcrypt 72-byte limit is handled correctly."""
    long_password = "a" * 100
    hashed = hash_password(long_password)
    assert verify_password(long_password, hashed)

def test_jwt_token_creation():
    token = create_access_token({"sub": "user@example.com"})
    assert token is not None
    assert len(token.split('.')) == 3  # Valid JWT format
```

#### 2. CRN Verification (Critical)
```python
# backend/tests/integration/test_consultant_api.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_crn_verification_valid():
    response = client.post(
        "/api/v1/consultant/crn/verify",
        json={"crn": "12345678"},
        headers={"Authorization": "Bearer <test_token>"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "schools" in data

def test_crn_verification_invalid():
    response = client.post(
        "/api/v1/consultant/crn/verify",
        json={"crn": "invalid"},
        headers={"Authorization": "Bearer <test_token>"}
    )
    assert response.status_code in [400, 404]
```

#### 3. Frontend Components
```typescript
// frontend/__tests__/components/SearchResultsTable.test.tsx
import { render, screen } from '@testing-library/react';
import { SearchResultsTable } from '@/components/SearchResultsTable';

describe('SearchResultsTable', () => {
  it('renders empty state when no data', () => {
    render(<SearchResultsTable data={[]} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('renders school rows correctly', () => {
    const mockData = [
      { ben: '123456', name: 'Test School', state: 'CA' }
    ];
    render(<SearchResultsTable data={mockData} />);
    expect(screen.getByText('Test School')).toBeInTheDocument();
  });
});
```

### Test Configuration

#### Backend: `pytest.ini`
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
addopts = -v --cov=app --cov-report=html --cov-report=term-missing
filterwarnings = ignore::DeprecationWarning
```

#### Frontend: `jest.config.js`
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

### Coverage Goals

| Phase | Target Coverage | Timeline |
|-------|-----------------|----------|
| Phase 1 | 30% (critical paths) | Week 1-2 |
| Phase 2 | 50% (core features) | Week 3-4 |
| Phase 3 | 70% (comprehensive) | Month 2 |
| Phase 4 | 80%+ (maintenance) | Ongoing |

### Testing Checklist

- [ ] Set up pytest with coverage reporting
- [ ] Set up Jest with React Testing Library
- [ ] Write auth/security unit tests
- [ ] Write CRN verification integration tests
- [ ] Write API endpoint tests
- [ ] Add frontend component tests
- [ ] Configure CI to run tests
- [ ] Set coverage thresholds
- [ ] Add test data fixtures
- [ ] Document testing patterns

---

## DevOps & Infrastructure

### 🔴 Critical: Missing Docker Configuration

**Problem**: README references `docker-compose.yml` but file doesn't exist.

**Recommendation**: Create complete Docker setup:

#### `Dockerfile` (Backend)
```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/
COPY utils/ ./utils/

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

#### `Dockerfile` (Frontend)
```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

#### `docker-compose.yml`
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/skyrate
      - REDIS_URL=redis://redis:6379
      - SECRET_KEY=${SECRET_KEY}
    depends_on:
      - db
      - redis
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8001
    depends_on:
      - backend
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=skyrate
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

### 🔴 Critical: Missing CI/CD Pipeline

**Recommendation**: Create GitHub Actions workflows:

#### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-lint-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./backend
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Lint with ruff
        run: |
          pip install ruff
          ruff check .
      
      - name: Type check with mypy
        run: |
          pip install mypy
          mypy app/ --ignore-missing-imports
      
      - name: Run tests
        run: |
          pip install pytest pytest-cov
          pytest --cov=app --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-lint-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./frontend
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Lint
        run: npm run lint
      
      - name: Type check
        run: npx tsc --noEmit
      
      - name: Run tests
        run: npm test -- --coverage
      
      - name: Build
        run: npm run build
```

#### `.github/workflows/deploy.yml`
```yaml
name: Deploy

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to staging
        run: echo "Deploy to staging environment"
        # Add actual deployment steps
      
  release:
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref_name }}
          release_name: Release ${{ github.ref_name }}
          draft: false
          prerelease: false
```

---

### 🟠 High: Environment Configuration

**Recommendation**: Create environment templates:

#### `backend/.env.example`
```env
# Application
APP_NAME=SkyRate AI
ENVIRONMENT=development
DEBUG=true
PORT=8001

# Database
DATABASE_URL=sqlite:///./skyrate.db
# For production: DATABASE_URL=postgresql://user:password@localhost:5432/skyrate

# Redis
REDIS_URL=redis://localhost:6379

# Security (CHANGE IN PRODUCTION)
SECRET_KEY=generate-a-secure-random-key-min-32-chars

# AI Services (Optional)
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# Stripe (Optional)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email (Optional)
GMAIL_USER=
GMAIL_APP_PASSWORD=

# USAC API (Optional - for higher rate limits)
USAC_API_TOKEN=
```

#### `frontend/.env.example`
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8001

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-a-secure-random-key

# Optional: Analytics
NEXT_PUBLIC_GA_ID=
```

---

### DevOps Checklist

- [ ] Create backend Dockerfile
- [ ] Create frontend Dockerfile
- [ ] Create docker-compose.yml
- [ ] Add docker-compose.override.yml for dev
- [ ] Create CI workflow (lint, test, build)
- [ ] Create CD workflow (deploy)
- [ ] Add environment templates
- [ ] Configure secrets management
- [ ] Set up staging environment
- [ ] Document deployment process

---

## Documentation

### 🟠 High: Missing AGENTS.md

**Purpose**: Guide AI agents (and developers) in working with the codebase.

**Recommendation**: Create `AGENTS.md`:

```markdown
# AGENTS.md - SkyRate AI Development Guide

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

- `backend/` - FastAPI Python backend
- `frontend/` - Next.js 14 React frontend
- `backend/app/api/v1/` - API endpoints
- `backend/app/services/` - Business logic
- `backend/app/models/` - SQLAlchemy models

## Common Tasks

### Add a new API endpoint
1. Create/modify file in `backend/app/api/v1/`
2. Add router to `backend/app/main.py`
3. Add tests in `backend/tests/`

### Add a new frontend page
1. Create page in `frontend/app/[route]/page.tsx`
2. Use `"use client"` directive for interactive pages
3. Import API client from `@/lib/api`

## Code Style

- Python: Follow PEP 8, use type hints
- TypeScript: Use strict mode, prefer interfaces
- Commits: Conventional commits format

## Testing

```bash
# Backend
cd backend && pytest

# Frontend  
cd frontend && npm test
```

## Environment Variables

See `.env.example` files in both directories.

## API Documentation

- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc
```

---

### 🟡 Medium: API Documentation Enhancement

**Recommendation**: Add comprehensive API documentation:

1. **Export OpenAPI spec** to version control
2. **Add request/response examples** to docstrings
3. **Create Postman collection** for testing
4. **Document error codes** and their meanings

```python
# Example enhanced docstring
@router.post("/crn/verify", response_model=CRNVerificationResponse)
async def verify_crn(
    request: CRNVerificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify a Consultant Registration Number (CRN) against USAC records.
    
    This endpoint:
    1. Validates the CRN format
    2. Queries USAC Open Data for associated schools
    3. Returns preview of schools that can be imported
    
    **Example Request:**
    ```json
    {"crn": "12345678"}
    ```
    
    **Example Response:**
    ```json
    {
        "valid": true,
        "crn": "12345678",
        "consultant_name": "John Doe Consulting",
        "schools": [
            {"ben": "123456", "name": "Example School", "state": "CA"}
        ],
        "school_count": 1
    }
    ```
    
    **Error Codes:**
    - `CRN_INVALID_FORMAT`: CRN must be 8 digits
    - `CRN_NOT_FOUND`: CRN not found in USAC records
    - `CRN_ALREADY_VERIFIED`: CRN already associated with another account
    """
```

---

### Documentation Checklist

- [ ] Create AGENTS.md
- [ ] Add .env.example files
- [ ] Export and version OpenAPI spec
- [ ] Add API examples to docstrings
- [ ] Create Postman/Insomnia collection
- [ ] Document error codes
- [ ] Add architecture diagrams
- [ ] Create deployment guide
- [ ] Add contributing guidelines
- [ ] Create changelog

---

## Developer Experience

### 🟠 High: Add Pre-commit Hooks

**Recommendation**: Create `.pre-commit-config.yaml`:

```yaml
repos:
  # Python
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, fastapi]
        args: [--ignore-missing-imports]

  # JavaScript/TypeScript
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v8.56.0
    hooks:
      - id: eslint
        files: \.(js|jsx|ts|tsx)$
        types: [file]
        additional_dependencies:
          - eslint
          - eslint-config-next

  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v3.1.0
    hooks:
      - id: prettier
        types_or: [javascript, jsx, ts, tsx, json, yaml, markdown]

  # General
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-added-large-files
        args: ['--maxkb=1000']
      - id: detect-private-key

  # Secrets detection
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

---

### 🟡 Medium: VS Code Configuration

**Recommendation**: Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true
  },
  
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  
  "python.analysis.typeCheckingMode": "basic",
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["backend/tests"],
  
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.tsdk": "frontend/node_modules/typescript/lib"
}
```

**Create `.vscode/launch.json`**:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload", "--port", "8001"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/backend/.env"
    },
    {
      "name": "Frontend: Next.js",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/frontend"
    },
    {
      "name": "Backend: Debug Tests",
      "type": "python",
      "request": "launch",
      "module": "pytest",
      "args": ["-v"],
      "cwd": "${workspaceFolder}/backend"
    }
  ],
  "compounds": [
    {
      "name": "Full Stack",
      "configurations": ["Backend: FastAPI", "Frontend: Next.js"]
    }
  ]
}
```

---

### DX Checklist

- [ ] Add pre-commit hooks
- [ ] Configure VS Code settings
- [ ] Add launch configurations
- [ ] Create Makefile for common tasks
- [ ] Add scripts to package.json
- [ ] Configure editor settings (.editorconfig)
- [ ] Add recommended extensions list
- [ ] Create development setup script

---

## Frontend Improvements

### 🟠 High: Enable TypeScript Strict Mode

**Location**: `frontend/tsconfig.json`

**Recommendation**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

---

### 🟠 High: Extract Reusable Components

**Problem**: `frontend/app/consultant/page.tsx` is 800+ lines with inline components.

**Recommendation**: Create component library:
```
frontend/components/
├── ui/                    # Base UI components (already exists)
├── dashboard/
│   ├── StatsCard.tsx
│   ├── StatsGrid.tsx
│   └── RecentActivity.tsx
├── schools/
│   ├── SchoolCard.tsx
│   ├── SchoolList.tsx
│   ├── SchoolFilters.tsx
│   └── AddSchoolModal.tsx
├── crn/
│   ├── CRNVerificationForm.tsx
│   └── SchoolImportPreview.tsx
└── shared/
    ├── LoadingSpinner.tsx
    ├── ErrorBoundary.tsx
    └── EmptyState.tsx
```

---

### 🟡 Medium: State Management Patterns

**Problem**: Mixed usage of Zustand and local state.

**Recommendation**: Document and enforce patterns:

```typescript
// lib/stores/README.md
/**
 * State Management Patterns
 * 
 * 1. Server State: Use React Query
 *    - API data, caching, refetching
 *    
 * 2. Global Client State: Use Zustand
 *    - Auth state, user preferences, UI state
 *    
 * 3. Local Component State: Use useState
 *    - Form inputs, toggles, local UI state
 */

// Example: Proper separation
// lib/stores/auth-store.ts - Zustand for auth
// lib/hooks/useSchools.ts - React Query for server data
```

---

### Frontend Checklist

- [ ] Enable TypeScript strict mode
- [ ] Extract reusable components
- [ ] Document state management patterns
- [ ] Add error boundaries
- [ ] Implement loading states consistently
- [ ] Add accessibility (a11y) improvements
- [ ] Optimize bundle size
- [ ] Add PWA support (optional)

---

## Backend Improvements

### 🟠 High: Add Request Validation Middleware

**Recommendation**: Centralize request validation:

```python
# backend/app/middleware/validation.py
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import time

class RequestValidationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Add request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        # Timing
        start_time = time.time()
        
        response = await call_next(request)
        
        # Add headers
        process_time = time.time() - start_time
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(process_time)
        
        return response
```

---

### 🟡 Medium: Implement Repository Pattern

**Recommendation**: Abstract database operations:

```python
# backend/app/repositories/base.py
from typing import Generic, TypeVar, Type, Optional, List
from sqlalchemy.orm import Session
from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], db: Session):
        self.model = model
        self.db = db
    
    def get(self, id: int) -> Optional[ModelType]:
        return self.db.query(self.model).filter(self.model.id == id).first()
    
    def get_all(self, skip: int = 0, limit: int = 100) -> List[ModelType]:
        return self.db.query(self.model).offset(skip).limit(limit).all()
    
    def create(self, obj_in: dict) -> ModelType:
        db_obj = self.model(**obj_in)
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

# backend/app/repositories/user.py
class UserRepository(BaseRepository[User]):
    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()
```

---

### Backend Checklist

- [ ] Add request validation middleware
- [ ] Implement repository pattern
- [ ] Add structured logging
- [ ] Implement caching layer
- [ ] Add background task queue (Celery/ARQ)
- [ ] Implement database connection pooling
- [ ] Add health check dependencies
- [ ] Create admin CLI commands

---

## Database & Data Layer

### 🔴 Critical: Missing Database Migrations

**Problem**: Alembic is in requirements but no migrations directory.

**Recommendation**: Initialize and configure Alembic:

```bash
cd backend
alembic init alembic
```

**Configure `alembic/env.py`**:
```python
from app.core.config import settings
from app.core.database import Base
from app.models import *  # Import all models

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
target_metadata = Base.metadata
```

**Create initial migration**:
```bash
alembic revision --autogenerate -m "Initial migration"
alembic upgrade head
```

---

### 🟡 Medium: Add Database Indexes

**Recommendation**: Review and add indexes for common queries:

```python
# backend/app/models/consultant.py
class ConsultantSchool(Base):
    __tablename__ = "consultant_schools"
    
    id = Column(Integer, primary_key=True)
    consultant_id = Column(Integer, ForeignKey("consultant_profiles.id"), index=True)
    ben = Column(String(20), index=True)  # Frequently queried
    
    __table_args__ = (
        Index('ix_consultant_school_lookup', 'consultant_id', 'ben'),
    )
```

---

### Database Checklist

- [ ] Initialize Alembic migrations
- [ ] Create initial migration
- [ ] Add database indexes
- [ ] Implement soft deletes
- [ ] Add audit columns (created_at, updated_at)
- [ ] Configure connection pooling
- [ ] Add database backup strategy
- [ ] Document schema

---

## API Design

### 🟡 Medium: Implement API Versioning Strategy

**Recommendation**: Document and enforce versioning:

```markdown
## API Versioning Policy

- Current version: v1
- Version in URL path: `/api/v1/...`
- Breaking changes require new version
- Old versions supported for 12 months after deprecation
- Deprecation announced via `Deprecation` header
```

**Add deprecation middleware**:
```python
@app.middleware("http")
async def add_deprecation_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Example: deprecating an endpoint
    if request.url.path == "/api/v1/old-endpoint":
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = "Sat, 01 Jun 2025 00:00:00 GMT"
        response.headers["Link"] = '</api/v1/new-endpoint>; rel="successor-version"'
    
    return response
```

---

### 🟡 Medium: Standardize Response Format

**Recommendation**: Create consistent response wrapper:

```python
# backend/app/schemas/response.py
from typing import Generic, TypeVar, Optional, List
from pydantic import BaseModel
from datetime import datetime

T = TypeVar('T')

class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total: int
    total_pages: int

class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None
    meta: Optional[dict] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PaginatedResponse(APIResponse[List[T]], Generic[T]):
    pagination: PaginationMeta

# Usage
@router.get("/schools", response_model=PaginatedResponse[SchoolSchema])
async def list_schools(page: int = 1, per_page: int = 20):
    schools, total = await get_schools_paginated(page, per_page)
    return PaginatedResponse(
        data=schools,
        pagination=PaginationMeta(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=ceil(total / per_page)
        )
    )
```

---

### API Checklist

- [ ] Document versioning strategy
- [ ] Standardize response format
- [ ] Add pagination to list endpoints
- [ ] Implement filtering/sorting consistently
- [ ] Add rate limit headers
- [ ] Document all error codes
- [ ] Add request/response logging
- [ ] Create API changelog

---

## Performance Optimization

### 🟡 Medium: Implement Caching

**Recommendation**: Add Redis caching for USAC data:

```python
# backend/app/core/cache.py
import redis
import json
from functools import wraps
from app.core.config import settings

redis_client = redis.from_url(settings.REDIS_URL)

def cache(ttl: int = 300, prefix: str = ""):
    """Cache decorator with TTL in seconds."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = f"{prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            
            # Try cache
            cached = redis_client.get(key)
            if cached:
                return json.loads(cached)
            
            # Execute and cache
            result = await func(*args, **kwargs)
            redis_client.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

# Usage
@cache(ttl=3600, prefix="usac")
async def fetch_form_471(year: int):
    # ... expensive USAC API call
```

---

### 🟡 Medium: Add Database Query Optimization

**Recommendation**: Use eager loading to prevent N+1 queries:

```python
# Instead of:
schools = db.query(ConsultantSchool).filter_by(consultant_id=user_id).all()
for school in schools:
    print(school.consultant.name)  # N+1 query!

# Use:
schools = db.query(ConsultantSchool)\
    .options(joinedload(ConsultantSchool.consultant))\
    .filter_by(consultant_id=user_id)\
    .all()
```

---

### Performance Checklist

- [ ] Implement Redis caching
- [ ] Add cache invalidation strategy
- [ ] Optimize database queries
- [ ] Add database query logging
- [ ] Implement connection pooling
- [ ] Add response compression
- [ ] Optimize frontend bundle size
- [ ] Add lazy loading for components

---

## Monitoring & Observability

### 🟡 Medium: Add Structured Logging

**Recommendation**: Implement structured JSON logging:

```python
# backend/app/core/logging.py
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        if hasattr(record, 'request_id'):
            log_data['request_id'] = record.request_id
        
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_data)

# Configure logging
def setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    
    logger = logging.getLogger("skyrate")
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    
    return logger
```

---

### 🟡 Medium: Add Health Check Dependencies

**Recommendation**: Enhance health checks:

```python
@app.get("/health")
async def health_check():
    """Comprehensive health check."""
    checks = {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "checks": {}
    }
    
    # Database check
    try:
        db.execute("SELECT 1")
        checks["checks"]["database"] = "healthy"
    except Exception as e:
        checks["checks"]["database"] = f"unhealthy: {str(e)}"
        checks["status"] = "degraded"
    
    # Redis check
    try:
        redis_client.ping()
        checks["checks"]["redis"] = "healthy"
    except Exception as e:
        checks["checks"]["redis"] = f"unhealthy: {str(e)}"
        checks["status"] = "degraded"
    
    # USAC API check (cached)
    checks["checks"]["usac_api"] = "healthy"  # Implement actual check
    
    return checks
```

---

### Observability Checklist

- [ ] Implement structured logging
- [ ] Add request tracing (correlation IDs)
- [ ] Enhance health checks
- [ ] Add metrics collection (Prometheus)
- [ ] Set up error tracking (Sentry)
- [ ] Create monitoring dashboards
- [ ] Configure alerting
- [ ] Add performance monitoring

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
**Focus**: Security and critical infrastructure

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Fix hardcoded secret key | 🔴 Critical | 1h | Backend |
| Add rate limiting to auth | 🔴 Critical | 2h | Backend |
| Create .env.example files | 🔴 Critical | 1h | Both |
| Set up basic pytest | 🔴 Critical | 4h | Backend |
| Add auth unit tests | 🔴 Critical | 4h | Backend |

### Phase 2: Quality (Week 3-4)
**Focus**: Testing and code quality

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Add pre-commit hooks | 🟠 High | 2h | Both |
| Set up CI pipeline | 🟠 High | 4h | DevOps |
| Add integration tests | 🟠 High | 8h | Backend |
| Enable TypeScript strict | 🟠 High | 4h | Frontend |
| Add frontend tests | 🟠 High | 8h | Frontend |

### Phase 3: Infrastructure (Week 5-6)
**Focus**: DevOps and deployment

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Create Dockerfiles | 🟠 High | 4h | DevOps |
| Create docker-compose | 🟠 High | 2h | DevOps |
| Initialize Alembic | 🟠 High | 2h | Backend |
| Create initial migration | 🟠 High | 2h | Backend |
| Set up staging env | 🟠 High | 8h | DevOps |

### Phase 4: Polish (Week 7-8)
**Focus**: Documentation and DX

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Create AGENTS.md | 🟡 Medium | 2h | All |
| Document API | 🟡 Medium | 4h | Backend |
| Add VS Code config | 🟡 Medium | 1h | All |
| Refactor large files | 🟡 Medium | 16h | Both |
| Add structured logging | 🟡 Medium | 4h | Backend |

### Phase 5: Optimization (Ongoing)
**Focus**: Performance and monitoring

| Task | Priority | Effort | Owner |
|------|----------|--------|-------|
| Implement Redis caching | 🟡 Medium | 8h | Backend |
| Add metrics collection | 🟡 Medium | 4h | Backend |
| Set up error tracking | 🟡 Medium | 2h | Both |
| Optimize queries | 🟡 Medium | 8h | Backend |
| Bundle optimization | 🟡 Medium | 4h | Frontend |

---

## Appendix

### A. Useful Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
pytest --cov=app
ruff check .
mypy app/

# Frontend
cd frontend
npm install
npm run dev
npm run lint
npm run build
npm test

# Docker
docker-compose up -d
docker-compose logs -f
docker-compose down

# Database
alembic revision --autogenerate -m "Description"
alembic upgrade head
alembic downgrade -1
```

### B. Recommended VS Code Extensions

```json
{
  "recommendations": [
    "ms-python.python",
    "ms-python.vscode-pylance",
    "charliermarsh.ruff",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "mtxr.sqltools",
    "eamodio.gitlens",
    "usernamehw.errorlens"
  ]
}
```

### C. Reference Links

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [USAC Open Data](https://opendata.usac.org/)
- [Pydantic V2](https://docs.pydantic.dev/latest/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)
- [React Query](https://tanstack.com/query/latest)
- [Zustand](https://zustand-demo.pmnd.rs/)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Jan 2025 | AI Analysis | Initial comprehensive review |

---

*This document should be reviewed and updated quarterly or after major releases.*
