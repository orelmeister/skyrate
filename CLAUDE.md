# CLAUDE.md — SkyRate AI Project Context

> **Read this file FIRST before making any changes.** It contains critical project context, architecture decisions, naming conventions, and rules that MUST be followed.

---

## Project Overview

**SkyRate AI** is an AI-powered E-Rate Funding Intelligence Platform. It helps three user types maximize school/library funding through the federal E-Rate program (managed by USAC/FCC):

- **Consultants** — Manage school portfolios, track denials, generate AI-powered appeal letters, monitor FRN status
- **Vendors** — Find Form 470 leads by manufacturer, track SPIN status, competitor analysis, market intelligence
- **Applicants** — Track their own applications, manage funding, view denial analysis

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14.1.0 (App Router)
- **Language**: TypeScript, React 18
- **Styling**: Tailwind CSS + custom utility classes in `globals.css`
- **State**: Zustand (`lib/auth-store.ts`)
- **Data**: React Query (@tanstack/react-query)
- **UI Components**: Radix UI (dialog, dropdown, select, tabs), Lucide icons
- **Dev server**: `npm run dev` → `localhost:3000`

### Backend
- **Framework**: FastAPI 0.109.0
- **Language**: Python 3.x
- **ORM**: SQLAlchemy 2.0 with Pydantic v2 settings
- **Database**: MySQL on Bluehost (production), SQLite (local dev fallback)
- **Auth**: JWT tokens via python-jose, bcrypt passwords via passlib
- **Payments**: Stripe (subscriptions)
- **Dev server**: `uvicorn app.main:app` → `localhost:8000`

### AI Services
- **DeepSeek** (`deepseek-chat`) — Primary AI for denial analysis & appeals
- **Google Gemini** (`gemini-2.0-flash`) — Alternative AI model
- **Claude** (`claude-3-5-sonnet-latest`) — Premium AI model
- **Nano Banana** (`gemini-2.5-flash-image`) — Image generation for brand assets
- **Imagen 4** (`imagen-4.0-generate-001`) — Alternative image generation

### Data Sources
- **USAC/Socrata API** (via `sodapy`) — E-Rate funding data, FRN status, school info
- **Hunter.io** — Contact enrichment for vendor leads
- **USAC C2 Budget Tool** — Category 2 budget tracking

### Deployment
- **Platform**: DigitalOcean App Platform
- **App URL**: `https://skyrate-unox7.ondigitalocean.app`
- **App spec**: `.do/app.yaml` (also mirrored in `app-spec.yaml`)
- **Auto-deploy**: Enabled — pushes to `main` trigger automatic builds
- **Backend**: Python service, `apps-s-2vcpu-4gb`, port 8000, route `/api`
- **Frontend**: Node.js service, `apps-s-2vcpu-4gb`, port 3000, route `/`
- **Frontend env**: `NEXT_PUBLIC_API_URL=https://skyrate-unox7.ondigitalocean.app/api`
- **Database (prod)**: MySQL on Bluehost (credentials in DigitalOcean dashboard environment variables)

### Key Config
- API keys stored in `backend/.env` (GEMINI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, etc.)
- CORS allows: localhost:3000, skyrate.ai
- Image generation script: `scripts/enhance_icon.py`

---

## Project Structure

```
skyrate/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── api/v1/                 # API route handlers
│   │   │   ├── auth.py             # Login, register, JWT refresh
│   │   │   ├── consultant.py       # Consultant portal endpoints
│   │   │   ├── vendor.py           # Vendor portal endpoints
│   │   │   ├── applicant.py        # Applicant portal endpoints
│   │   │   ├── admin.py            # Admin endpoints
│   │   │   ├── query.py            # Natural language USAC search
│   │   │   ├── schools.py          # School/BEN data endpoints
│   │   │   ├── appeals.py          # AI appeal generation
│   │   │   ├── alerts.py           # Notification/alert endpoints
│   │   │   └── subscriptions.py    # Stripe subscription management
│   │   ├── core/
│   │   │   ├── config.py           # Pydantic Settings (env vars)
│   │   │   ├── database.py         # SQLAlchemy engine/session
│   │   │   └── security.py         # JWT token creation/validation
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── user.py, application.py, consultant.py, vendor.py, subscription.py
│   │   └── services/               # Business logic layer
│   │       ├── ai_service.py       # Multi-provider AI abstraction
│   │       ├── appeals_service.py  # Appeal generation logic
│   │       ├── denial_service.py   # Denial analysis
│   │       ├── usac_service.py     # USAC data fetching
│   │       ├── enrichment_service.py # Data enrichment (Hunter.io, etc.)
│   │       ├── email_service.py    # SMTP email sending
│   │       ├── alert_service.py    # Alert/notification logic
│   │       └── scheduler_service.py # Background jobs (APScheduler)
│   ├── utils/
│   │   ├── ai_models.py           # AI model configurations
│   │   ├── appeals_strategy.py    # Appeal strategy templates
│   │   ├── denial_analyzer.py     # Denial code analysis
│   │   └── usac_client.py         # Low-level USAC/Socrata client
│   ├── .env                        # Environment variables (DO NOT COMMIT)
│   └── requirements.txt
│
├── frontend/
│   ├── app/                        # Next.js App Router pages
│   │   ├── page.tsx                # Landing page (~805 lines, V3 design)
│   │   ├── layout.tsx              # Root layout
│   │   ├── globals.css             # Custom CSS classes + design system
│   │   ├── sign-in/page.tsx        # Sign-in (split layout)
│   │   ├── sign-up/page.tsx        # Sign-up (split layout, ~400 lines)
│   │   ├── consultant/page.tsx     # Consultant dashboard
│   │   ├── vendor/page.tsx         # Vendor dashboard
│   │   ├── applicant/              # Applicant dashboard
│   │   ├── dashboard/page.tsx      # Generic dashboard redirect
│   │   ├── settings/               # Account settings
│   │   └── subscribe/              # Subscription page
│   ├── components/
│   │   ├── AppealChat.tsx          # AI appeal chat component
│   │   ├── SearchResultsTable.tsx  # USAC search results table
│   │   └── brand/Logo.tsx          # Logo component
│   ├── lib/
│   │   ├── api.ts                  # Axios API client (baseURL: localhost:8000)
│   │   └── auth-store.ts           # Zustand auth state management
│   └── public/images/
│       ├── logos/                   # Logo files (see Logo System below)
│       ├── icons/                   # Feature icons (AI-generated PNGs)
│       ├── illustrations/           # Section illustrations (AI-generated)
│       └── marketing/               # OG images, social cards
│
├── assets/generated/               # Source AI-generated assets (high-res)
│   ├── v3/logos/                    # V3 logo sources
│   ├── v3/icons/                    # V3 icon sources
│   └── v3/illustrations/           # V3 illustration sources
│
├── scripts/
│   ├── generate_brand_assets.py    # Full brand asset generation pipeline
│   ├── enhance_icon.py             # Quick icon enhancement via Nano Banana
│   ├── optimize_assets.py          # Resize/optimize for web
│   └── test_image_gen.py           # Test image generation APIs
│
├── CLAUDE.md                        # THIS FILE - project context
└── README.md                        # Project documentation
```

---

## Design System (V3 — Current)

### Layout Philosophy
- **Landing page**: Dark hero section (slate-950 bg) → Light body sections (white/slate-50 bg)
- **Sign-in / Sign-up**: Split layout — left panel (indigo→purple gradient) + right panel (slate-50 form)
- **Dashboards**: Light theme with card-based layouts

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| Primary Purple | `#7c3aed` | Brand color, CTAs, headings |
| Indigo | `#4f46e5` | Gradients, dark accents |
| Violet | `#8b5cf6` | Lighter purple accents |
| Purple-300 | `#c4b5fd` | Light text on dark backgrounds |
| Purple-400 | `#a78bfa` | `.AI` text in header on dark bg |
| Slate-950 | `#020617` | Hero background, header |
| Slate-900 | `#0f172a` | Footer background |
| Slate-50 | `#f8fafc` | Light section backgrounds |
| White | `#ffffff` | Cards, form backgrounds |

### Custom CSS Classes (in `globals.css`)
| Class | Purpose |
|-------|---------|
| `.light-card` | White card with subtle shadow, hover lift |
| `.hover-lift` | Hover: translateY(-6px) + shadow |
| `.glassmorphism-card` | Glass effect for dark sections (blur + transparency) |
| `.gradient-text` | Purple gradient text (light theme) |
| `.gradient-text-dark` | Deeper purple gradient text (for headings) |
| `.shimmer-btn` | Animated shimmer on CTA buttons |
| `.animate-slide-up` | Fade-in + slide-up entrance (+ delay-1 through delay-5) |
| `.floating` | Gentle float animation (for decorative blobs) |
| `.pulse-glow` | Subtle pulsing glow |
| `.animate-gentle-bounce` | Soft bounce animation |
| `.mesh-gradient-bg` | Decorative radial mesh gradient overlay |
| `.subtle-glow` | Box shadow glow for highlighted elements |
| `.gradient-border` | Gradient border effect (pricing cards) |

### Component Patterns
- **Header**: Sticky, dark bg (`slate-950/80`), backdrop-blur, logo + nav + CTA
- **Footer**: Dark bg (`slate-900`), 4-column grid (brand, product, resources, company)
- **Cards**: `.light-card` for light sections, `.glassmorphism-card` for dark sections
- **Buttons**: Primary = gradient purple with `.shimmer-btn`, Secondary = outlined/ghost
- **Animations**: Staggered `.animate-slide-up-delay-N` for progressive reveal

---

## Logo System

### Active Files (in `frontend/public/images/logos/`)
| File | Status | Description |
|------|--------|-------------|
| `logo-icon-transparent.png` | **ACTIVE** | Shiny purple S, transparent bg, 1024x1024. Used everywhere. |
| `logo-icon-enhanced.png` | Backup | Same shiny S with white background |
| `logo-icon.png` | Legacy | Original v3 S icon (smaller, less vibrant) |
| `logo-dark.png` | Available | Full wordmark, dark text (has opaque bg) |
| `logo-white.png` | Available | Full wordmark, white text (has opaque bg) |
| `logo-horizontal.png` | Available | Horizontal wordmark (has opaque bg) |

### Logo Usage Pattern
```tsx
{/* Standard logo in dark header/panels */}
<img src="/images/logos/logo-icon-transparent.png" alt="" width={32} height={32} className="rounded-lg" />
<span className="text-white font-bold text-xl">SkyRate<span className="text-purple-400">.AI</span></span>

{/* Larger logo (sign-in/sign-up left panel, dark bg) */}
<img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
<span className="text-white font-bold text-2xl">SkyRate<span className="text-purple-300">.AI</span></span>

{/* Mobile logo (light bg) */}
<img src="/images/logos/logo-icon-transparent.png" alt="" width={40} height={40} className="rounded-xl" />
<span className="text-slate-900 font-bold text-2xl">SkyRate<span className="text-purple-600">.AI</span></span>
```

### Source Assets
- High-res sources: `assets/generated/v3/logos/`
- Generated via `scripts/enhance_icon.py` (sends to Nano Banana API)
- Optimized copies made by `scripts/optimize_assets.py`
- Logo component: `frontend/components/brand/Logo.tsx`

---

## Naming Conventions

| Context | Convention | Examples |
|---------|-----------|----------|
| Frontend pages | kebab-case directories | `sign-in/`, `sign-up/` |
| React components | PascalCase files + exports | `AppealChat.tsx`, `SearchResultsTable.tsx` |
| CSS classes | kebab-case utility classes | `light-card`, `hover-lift`, `gradient-text-dark` |
| Backend Python | snake_case everywhere | `ai_service.py`, `denial_analyzer.py` |
| API routes | `/api/v1/{resource}` | `/api/v1/auth`, `/api/v1/consultant` |
| Database models | PascalCase classes, snake_case tables | `class User`, table `users` |
| Environment vars | UPPER_SNAKE_CASE | `GEMINI_API_KEY`, `DATABASE_URL` |
| Git commits | `type: description` | `feat: ...`, `fix: ...`, `logo: ...` |
| Logo files | kebab-case with descriptors | `logo-icon-transparent.png` |

---

## Current Focus

**Module**: Frontend design & branding (V3 complete)

**Recently completed**:
- V3 landing page redesign (dark hero + light body)
- Sign-in and sign-up pages redesigned to match V3
- Logo system finalized: shiny purple transparent S icon across all pages
- Nano Banana image generation pipeline for logo iteration

**Next likely areas**:
- Dashboard pages (consultant, vendor, applicant) may need V3 design alignment
- Backend API refinement / new features
- Stripe integration testing
- Production deployment setup

---

## Key Business Logic

### User Roles & Pricing
| Role | Monthly | Yearly | Sign-up Display |
|------|---------|--------|-----------------|
| Consultant | $300/mo | $3,000/yr | `$300/mo or $3,000/yr` |
| Vendor | $199/mo | $1,999/yr | `$199/mo or $1,999/yr` |
| Applicant | $200/mo | $2,000/yr | (not on sign-up page currently) |

### Test/Demo Accounts
```
test_consultant@example.com / TestPass123!  → Consultant role, free access
test_vendor@example.com / TestPass123!      → Vendor role, free access
test_applicant@example.com / TestPass123!   → Applicant role, free access
```
Free access coupons: `SKYRATEFREE`, `BETATESTER`, `DEMO2024`, `INTERNAL`

### Test Data
- **Test CRN**: `17026509` — Consultant Registration Number for testing CRN verification

### Dashboard Routing
After login, users redirect based on role:
- `vendor` → `/vendor`
- `consultant` → `/consultant`
- `applicant` → `/applicant`
- `admin` → `/admin`

### Platform Stats (for marketing)
- `$500M+` Funding Tracked
- `2,500+` Schools
- `98%` Success Rate
- `500+` E-Rate Professionals (trusted by)

---

## Git History (Key Commits)

| Hash | Description |
|------|-------------|
| `e3d7427` | Pre-redesign checkpoint (safe revert target) |
| `5cd1912` | V2 dark theme landing page |
| `2e6e548` | **V3 light theme redesign** (current design base) |
| `784b5cd` | Sign-in/sign-up V3 design match |
| `422c179` | Switched to paid logo-icon.png |
| `3a10dd1` | Shiny purple transparent S icon |
| `a6afab9` | CLAUDE.md project context |
| `daaf0fa` | **Logo icon on all remaining pages** (latest) |

---

## Critical Rules

> **These rules are NON-NEGOTIABLE. Violating them wastes the user's money and time.**

1. **NEVER create new brand assets (logos, icons, SVGs) without explicit user approval.** Use the paid AI-generated assets that exist. If they don't work, ASK the user what to do.

2. **ALWAYS use sequential thinking** for complex decisions or multi-step tasks.

3. **Minimize token and resource usage.** Be efficient. Don't take screenshots of every page unless needed for verification. Don't run unnecessary commands.

4. **The active logo icon is `logo-icon-transparent.png`** (shiny purple S with transparent background). Do not change this without user approval.

5. **Consult the user** before making architectural decisions, design changes, or anything that deviates from what was asked.

6. **Git workflow**: Always `git add -A && git commit -m "type: description" && git push` after completing a task.

7. **Dev servers**: Frontend runs on `localhost:3000` (npm run dev), Backend on `localhost:8000`. Check if they're running before trying to access them.

8. **Image generation**: Use `scripts/enhance_icon.py` with Nano Banana (`gemini-2.5-flash-image`). API key from `backend/.env`. Auto-crop whitespace with Pillow after generation.

9. **When clearing browser state** (e.g., for screenshots of sign-in page without auto-redirect): Use `localStorage.clear(); sessionStorage.clear()` via browser evaluate.

---

## Environment Setup

```bash
# Frontend (local dev)
cd frontend && npm install && npm run dev

# Backend (local dev)
cd backend && pip install -r requirements.txt
# Copy .env.example to .env and fill in keys
uvicorn app.main:app --reload --port 8000

# Or use the convenience scripts:
./start-backend.ps1   # Windows
./start-backend.sh    # Linux/Mac
```

### Production Deployment
- Push to `main` → DigitalOcean App Platform auto-deploys both frontend & backend
- App spec file: `.do/app.yaml`
- Production URL: `https://skyrate-unox7.ondigitalocean.app`
- Monitor deploys via DigitalOcean dashboard or `doctl apps list-deployments`
- **Database**: Production uses MySQL on Bluehost (persistent). `DATABASE_URL` env var in `.env` and on DigitalOcean connects to Bluehost MySQL.
- Demo accounts are re-seeded on startup via `seed_demo_accounts()` in `main.py`.
- Migration script: `backend/migrate_to_mysql.py` for SQLite → MySQL migration.
- **Note**: If `DATABASE_URL` is not set, falls back to local SQLite (`skyrate.db`).
