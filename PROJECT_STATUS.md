# SkyRate AI — Project Status & Memory File

> **Last Updated:** February 17, 2026  
> **Purpose:** Central knowledge file for continuity across development sessions.

---

## Current Production State

| Component | Status | Details |
|-----------|--------|---------|
| **Backend API** | ✅ HEALTHY | Responds 200 at `/api/health`, version 2.0.0 |
| **Frontend (DO URL)** | ✅ WORKS | `skyrate-unox7.ondigitalocean.app` renders correctly |
| **Frontend (skyrate.ai)** | ❌ CRASHING | React Error #300 — Cloudflare Email Obfuscation |
| **Latest Deploy** | ⚠️ PARTIAL | Backend running, frontend may be on older version |

**Production URLs:**
- Live: `https://skyrate.ai` (through Cloudflare — CRASHING)
- DO Direct: `https://skyrate-unox7.ondigitalocean.app` (bypasses Cloudflare — WORKS)
- API: `https://skyrate.ai/api` or `https://skyrate-unox7.ondigitalocean.app/api`

---

## Issue #1: Frontend React Crash on skyrate.ai

### Root Cause: Cloudflare Email Address Obfuscation

**What happens:**
1. Next.js server-renders HTML containing `support@skyrate.ai` (in footer, contact links, etc.)
2. Cloudflare's "Email Address Obfuscation" feature (enabled by default) replaces email patterns with `<span class="__cf_email__" data-cfemail="...">` elements and `<script>` tags
3. React tries to hydrate the page but finds different DOM than expected (server rendered `<a>` but client sees `<span>`)
4. React throws Error #300: "Objects are not valid as a React child"
5. The ENTIRE app crashes — blank white page with "Application error"

**Evidence:**
- `skyrate-unox7.ondigitalocean.app` (bypasses Cloudflare) → Works perfectly
- `skyrate.ai` (through Cloudflare) → Crashes on every page
- Byte-level diff of HTML from both URLs shows Cloudflare injecting `/cdn-cgi/l/email-protection#...` patterns

**Fix Implemented (NOT YET DEPLOYED):**
- Created `frontend/components/SafeEmail.tsx` — renders emails client-side only (after hydration)
- Uses `useState(false)` + `useEffect(() => setMounted(true))` pattern
- During SSR: renders fallback text ("Contact Support")
- After hydration: renders `<a href="mailto:...">` link
- Cloudflare never sees email patterns in the HTML → no obfuscation → no crash
- Updated 14 files to use SafeEmail component
- Added `<!--email_off-->` comments in `layout.tsx` as secondary protection

**Alternative Fix (NOT DONE):**
- Disable "Email Address Obfuscation" in Cloudflare dashboard (Settings → Scrape Shield)
- User doesn't have Cloudflare dashboard access currently

**Files Modified for SafeEmail:**
- `frontend/components/SafeEmail.tsx` (NEW)
- `frontend/app/page.tsx` (landing page footer)
- `frontend/app/contact/page.tsx`
- `frontend/app/subscribe/page.tsx`
- `frontend/app/privacy/page.tsx` (3 email references)
- `frontend/app/terms/page.tsx` (3 email references)
- `frontend/app/pricing/page.tsx` (FAQ text)
- 6 blog post pages (all had mailto links)
- `frontend/app/layout.tsx` (email_off comments)

**Commits:** `321990c`, `d139422`

---

## Issue #2: DigitalOcean Deploy Failures

### Root Cause: Explicit health_check config in app-spec.yaml

**What happened:**
1. Commit `184b302` added explicit `health_check` config to `app-spec.yaml`
2. This changed DO behavior from using default health checks to explicit ones
3. Deploy failed with: "backend deploy failed because your container did not respond to health checks"
4. The SafeEmail fix (already in the code) was NOT deployed because of this failure

**Fix Applied:**
- Removed the explicit `health_check` block from `app-spec.yaml`
- Let DigitalOcean use its default health check behavior (which was working before)

**Note on Instance Size:**
- Both backend and frontend use `apps-s-1vcpu-0.5gb` (512MB RAM)
- Backend has many heavy dependencies (pandas, numpy, matplotlib, plotly, google-generativeai, etc.)
- If memory becomes an issue, consider upgrading to `apps-s-1vcpu-1gb`
- For now, the 0.5GB instance was working before the health_check config change

---

## Issue #3: Backend Login 500 Error (RESOLVED)

**Root Cause:** Missing MySQL columns in production `users` table
- `phone_verified`, `onboarding_completed`, `auth_provider` columns didn't exist in MySQL
- SQLAlchemy's `create_all()` only creates NEW tables, doesn't add columns to existing ones

**Fix:** Added `_run_schema_migrations()` function to `backend/app/main.py` that uses `ALTER TABLE` to add missing columns on startup.

**Commit:** `753f188`  
**Status:** ✅ RESOLVED AND VERIFIED

---

## Git Commit Timeline (Feb 15-17, 2026)

```
184b302 fix: add health check config + resilient startup      ← CAUSED DEPLOY FAILURE
d139422 fix: add CF email_off comments                        ← SafeEmail secondary fix
321990c fix: prevent Cloudflare email obfuscation              ← SafeEmail component (KEY FIX)
a976c95 chore: remove debug file
2c7dbc4 fix: add error boundary to diagnose production crash
92d5b5e chore: remove debug files
753f188 fix: add missing MySQL columns migration               ← Login fix
3fe7d47 feat: AI blog image generation (Nano Banana)
fe17c7c feat: auto blog generator + admin management
9cd291a feat: 6 SEO blog posts + landing page links + sitemap
bc5afac feat: complete SEO infrastructure (feature pages, robots.txt, sitemap)
21eec96 feat: email verification for onboarding
7834143 fix: switch Twilio auth to Auth Token
b3044fa feat: terms of service page + SMS keywords
1039208 feat: privacy policy page
72cb6d3 feat: twilio API key auth + requirements
df0c9bb feat: onboarding wizard, SMS service, admin broadcast
7323141 fix: remove demo credentials from sign-in page
33f7772 fix: browser-specific PWA install instructions
980b848 fix: remove duplicate getAdminUsers in api.ts
6916722 feat: admin dashboard, support tickets, chat widget    ← ADMIN PORTAL ADDED
0731c0e feat: Google Workspace email integration
89f5e29 fix: push_subscriptions String(500) for MySQL
949484c feat: domain DNS migration to skyrate.ai               ← CLOUDFLARE STARTED
e649c66 feat: PWA support + push notifications
```

---

## Features Added Since Pre-Admin State (0731c0e → HEAD)

### Frontend (47 new files, ~13,000 lines)
- Admin dashboard page (`/admin`) — 1,510 lines
- Blog system — 7 pages + dynamic slug route
- Feature pages — 7 pages (consultants, vendors, applicants, appeal-generator, denial-analysis, form-470-tracking, frn-monitoring)
- About, Contact, Pricing, Privacy, Terms pages
- Onboarding wizard page
- ChatWidget component (325 lines)
- PricingCards component (193 lines)
- SafeEmail component (99 lines)
- ErrorBoundary component
- Global error page
- Layout files for multiple routes
- robots.txt, sitemap.xml
- Updated api.ts (+430 lines)

### Backend (11 new files, ~3,000 lines)
- Blog API router + service + image service + model
- Onboarding API router (667 lines)
- Support ticket system (router + model)
- SMS service (Twilio integration)
- Email service (Google Workspace SMTP)
- Scheduler service (APScheduler)
- Admin API expanded (+555 lines)
- Schema migrations in main.py
- New model files (blog, support_ticket)

### Dependencies Added
- `twilio>=9.0.0` — SMS/phone verification
- `markdown==3.10` — Blog content processing
- `aiosmtplib==3.0.1` — Async email sending
- `apscheduler==3.10.4` — Background job scheduling
- `pywebpush>=2.0.0` + `py-vapid>=1.9.0` — Push notifications (added in PWA commit)

---

## Architecture & Important Patterns

### SafeEmail Component Pattern
```tsx
// Client-side only rendering to prevent Cloudflare email obfuscation
'use client';
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
// SSR: renders fallback text (no email in HTML)
// Client: renders <a href="mailto:..."> after hydration
```

### Backend Startup Flow
1. Import `database.py` → creates SQLAlchemy engine (module-level)
2. Import all API routers (module-level)
3. Create FastAPI app with lifespan
4. Lifespan startup:
   - `Base.metadata.create_all()` — creates new tables
   - `_run_schema_migrations()` — adds missing columns
   - `seed_demo_accounts()` — creates test/admin accounts
   - `init_scheduler()` — starts background jobs
   - All wrapped in try/except (non-blocking for health checks)

### JSON-LD Email Warning
`layout.tsx` still has `"email": "support@skyrate.ai"` in the JSON-LD `<script>` tag.
This is inside `<script type="application/ld+json">` which Cloudflare typically doesn't modify.
Monitor this — if it causes issues, replace with SafeEmail or remove.

---

## Environment Variables (Required for Full Functionality)

### In app-spec.yaml (DigitalOcean)
- `SECRET_KEY` — JWT signing key
- `DATABASE_URL` — MySQL connection string (SECRET)
- `ENVIRONMENT` — "production"
- `OPENAI_API_KEY` — OpenAI API (SECRET)
- `STRIPE_SECRET_KEY` — Stripe payments (SECRET)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhooks (SECRET)
- `VAPID_PRIVATE_KEY` — Push notifications (SECRET)
- `VAPID_PUBLIC_KEY` — Push notifications (public)
- `VAPID_CONTACT_EMAIL` — Push notifications contact

### NOT in app-spec.yaml (need to add via DO dashboard if used)
- `DEEPSEEK_API_KEY` — Primary AI model
- `GEMINI_API_KEY` — Alternative AI model
- `ANTHROPIC_API_KEY` — Premium AI model
- `TWILIO_ACCOUNT_SID` — SMS service
- `TWILIO_AUTH_TOKEN` — SMS authentication
- `TWILIO_VERIFY_SERVICE_SID` — Phone verification
- `SMTP_HOST` — Email sending (Google Workspace)
- `SMTP_PORT` — Email SMTP port
- `SMTP_USERNAME` — Email username
- `SMTP_PASSWORD` — Email app password
- `HUNTER_API_KEY` — Contact enrichment
- `ADMIN_PASSWORD` — Super admin password override

---

## Key Decisions & Lessons Learned

1. **Cloudflare Email Obfuscation is dangerous for React SSR** — Any email address in server-rendered HTML will be modified by Cloudflare, breaking React hydration. Always use client-side rendering for emails, or disable the feature in Cloudflare dashboard.

2. **Don't add explicit health_check config to app-spec.yaml unless needed** — DigitalOcean defaults work fine. Explicit config can cause deploy failures if not carefully tuned.

3. **SQLAlchemy create_all() doesn't add columns** — Only creates new tables. For schema changes to existing tables, use Alembic migrations or manual ALTER TABLE statements.

4. **Test via DO URL before Cloudflare** — Always check `skyrate-unox7.ondigitalocean.app` vs `skyrate.ai` to distinguish CDN issues from app issues.

5. **Instance size matters** — 0.5GB RAM is tight for a Python app with heavy dependencies (pandas, numpy, AI SDKs, etc.). Monitor memory usage and upgrade if health checks fail intermittently.

---

## Next Steps (Priority Order)

1. **Deploy SafeEmail fix** — Push current code (health check config removed), let DO auto-deploy
2. **Verify production** — Check both `skyrate.ai` and DO URL after deploy
3. **Cloudflare dashboard access** — Get access to disable Email Obfuscation as a belt-and-suspenders fix
4. **Add missing env vars** — Add DEEPSEEK_API_KEY, TWILIO vars, SMTP vars to DO dashboard
5. **Dashboard V3 alignment** — Consultant, vendor, applicant dashboards may need design updates
6. **Consider instance upgrade** — If deploy issues persist, upgrade to `apps-s-1vcpu-1gb`

---

## Test/Demo Accounts

```
test_consultant@example.com / TestPass123!  → Consultant role
test_vendor@example.com / TestPass123!      → Vendor role
test_applicant@example.com / TestPass123!   → Applicant role
admin@skyrate.ai / SkyRateAdmin2024!        → Super admin
```

Free access coupons: `SKYRATEFREE`, `BETATESTER`, `DEMO2024`, `INTERNAL`
