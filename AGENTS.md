# AGENTS.md - SkyRate AI Development Guide

This document provides guidance for AI agents and developers working on the SkyRate AI codebase.

## Project Overview

SkyRate AI is an E-Rate funding intelligence platform for consultants and vendors. It helps track school funding, analyze denials, and manage client portfolios.

**Tech Stack:**
- Backend: FastAPI (Python 3.11+)
- Frontend: Next.js 14 (TypeScript)
- Database: SQLite (dev) / PostgreSQL (prod)
- Cache: Redis
- Payments: Stripe

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
NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev
```

### Both (Docker)
```bash
docker-compose up -d
```

## Project Structure

```
skyrate/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # API endpoints
│   │   │   ├── auth.py      # Authentication
│   │   │   ├── consultant.py # Consultant portal
│   │   │   ├── vendor.py    # Vendor portal
│   │   │   ├── subscriptions.py # Stripe payments
│   │   │   └── ...
│   │   ├── core/            # Config, database, security
│   │   ├── models/          # SQLAlchemy models
│   │   └── services/        # Business logic
│   ├── tests/               # Pytest tests
│   │   ├── unit/           # Unit tests
│   │   └── integration/    # API tests
│   └── utils/               # Utilities (USAC client, AI)
├── frontend/
│   ├── app/                 # Next.js pages
│   │   ├── consultant/     # Consultant dashboard
│   │   ├── vendor/         # Vendor portal
│   │   ├── paywall/        # Subscription paywall
│   │   ├── sign-in/        # Login
│   │   └── sign-up/        # Registration
│   ├── components/          # React components
│   └── lib/                 # API client, auth store
└── docker-compose.yml
```

## Common Tasks

### Add a new API endpoint

1. Create/modify file in `backend/app/api/v1/`
2. Register router in `backend/app/main.py` if new file
3. Add tests in `backend/tests/integration/`

Example:
```python
# backend/app/api/v1/example.py
from fastapi import APIRouter, Depends
from ...core.security import get_current_user

router = APIRouter(prefix="/example", tags=["Example"])

@router.get("/")
async def get_example(current_user = Depends(get_current_user)):
    return {"message": "Hello"}
```

### Add a new frontend page

1. Create directory in `frontend/app/[route]/`
2. Add `page.tsx` file
3. Use `"use client"` directive for interactive pages

Example:
```tsx
// frontend/app/example/page.tsx
"use client";

import { useAuthStore } from "@/lib/auth-store";

export default function ExamplePage() {
  const { user } = useAuthStore();
  return <div>Hello {user?.email}</div>;
}
```

### Run tests

```bash
# Backend tests
cd backend && source venv/bin/activate
python -m pytest tests/ -v

# Specific test file
python -m pytest tests/unit/test_security.py -v

# With coverage
python -m pytest tests/ --cov=app --cov-report=html
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app entry point |
| `backend/app/core/config.py` | Environment configuration |
| `backend/app/core/security.py` | JWT auth, password hashing |
| `frontend/lib/api.ts` | API client |
| `frontend/lib/auth-store.ts` | Auth state (Zustand) |

## Environment Variables

See `.env.example` files in `backend/` and `frontend/` directories.

### Required for Production
- `SECRET_KEY` - JWT signing key (min 32 chars)
- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY` - Stripe API key

### Optional
- `DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` - AI services
- `REDIS_URL` - Cache (defaults to localhost)

## Code Style

### Python (Backend)
- Follow PEP 8
- Use type hints
- Docstrings for public functions
- Run `ruff check app/` for linting

### TypeScript (Frontend)
- Use interfaces for props
- Prefer functional components
- Use `@/` path alias for imports
- Run `npm run lint` for linting

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/api/v1/auth/register` | POST | No | User registration |
| `/api/v1/auth/login` | POST | No | User login |
| `/api/v1/auth/me` | GET | Yes | Get profile |
| `/api/v1/subscriptions/payment-status` | GET | Yes | Check payment setup |
| `/api/v1/subscriptions/create-checkout` | POST | Yes | Create Stripe checkout |
| `/api/v1/consultant/dashboard-stats` | GET | Yes | Dashboard data |
| `/api/v1/consultant/schools` | GET | Yes | List schools |

Full API docs: http://localhost:8001/docs

## User Flow

```
Sign Up → Paywall → Stripe Checkout → Dashboard
           ↓
   (14-day free trial)
           ↓
   (Auto-charge after trial)
```

## Database Models

- `User` - User accounts
- `Subscription` - Stripe subscriptions
- `ConsultantProfile` - Consultant details + CRN
- `VendorProfile` - Vendor details + SPIN
- `ConsultantSchool` - Schools in portfolio

## Testing

Tests are in `backend/tests/`:
- `unit/` - Fast tests, no DB
- `integration/` - API tests with test DB

Run all: `pytest tests/ -v`

## Deployment

### Docker
```bash
docker-compose up -d
```

### Manual
1. Set environment variables
2. Run backend: `uvicorn app.main:app --host 0.0.0.0 --port 8001`
3. Build frontend: `npm run build`
4. Run frontend: `npm start`

## Troubleshooting

### "Not authenticated" errors
- Check token is being sent in Authorization header
- Token may be expired - try logging in again

### Database errors
- Run migrations: `alembic upgrade head`
- Check DATABASE_URL is correct

### CORS errors
- Backend CORS is configured in `main.py`
- Check allowed origins include your frontend URL
