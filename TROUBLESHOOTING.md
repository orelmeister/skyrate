# SkyRate AI — Troubleshooting & Incident Log

> **Created:** February 17, 2026  
> **Purpose:** Permanent reference for production issues, root causes, and fixes. If something breaks again, check here first.

---

## Table of Contents

1. [Incident #1: White Screen Crash on skyrate.ai (React Error #300)](#incident-1-white-screen-crash-on-skyrateai-react-error-300)
2. [Incident #2: DigitalOcean Deploy Failure (Health Check)](#incident-2-digitalocean-deploy-failure-health-check)
3. [Incident #3: Backend Login 500 Error](#incident-3-backend-login-500-error)
4. [How to Diagnose Future Issues](#how-to-diagnose-future-issues)
5. [Quick Reference: Key URLs & Commands](#quick-reference-key-urls--commands)
6. [Architecture Notes That Matter](#architecture-notes-that-matter)

---

## Incident #1: White Screen Crash on skyrate.ai (React Error #300)

### Severity: CRITICAL — All pages crash, entire site unusable

### Symptoms
- Visiting `https://skyrate.ai` shows a blank white page with "Application error"
- Browser console shows: `Error: Objects are not valid as a React child` (Error #300)
- Happens on EVERY page (landing, login, signup, dashboards — everything)
- The same pages work perfectly at the DigitalOcean direct URL: `https://skyrate-unox7.ondigitalocean.app`

### Root Cause: Cloudflare Email Address Obfuscation

Cloudflare has a feature called **"Email Address Obfuscation"** that is **ON by default**. It scans all HTML responses going through Cloudflare and replaces anything that looks like an email address with encoded JavaScript elements.

**What Cloudflare does to the HTML:**

```html
<!-- What Next.js server sends: -->
<a href="mailto:support@skyrate.ai">support@skyrate.ai</a>

<!-- What Cloudflare delivers to the browser: -->
<a href="/cdn-cgi/l/email-protection#abc7c4...">
  <span class="__cf_email__" data-cfemail="abc7c4...">[email&#160;protected]</span>
</a>
```

**Why this breaks React:**

1. Next.js server-renders the page with the original HTML (containing `<a>` with email text)
2. Cloudflare intercepts the response and replaces emails with `<span class="__cf_email__">` elements
3. React's hydration step compares the server-rendered DOM with what it expects
4. The DOM no longer matches → React throws Error #300
5. Because this is in the root layout (footer has `support@skyrate.ai`), **every single page crashes**

### How We Confirmed This

1. **Comparison test:** Same page loaded from two URLs:
   - `https://skyrate-unox7.ondigitalocean.app/` → Works perfectly (no Cloudflare)
   - `https://skyrate.ai/` → Crashes (through Cloudflare)
2. **HTML diff:** Downloaded raw HTML from both URLs, byte-level diff showed Cloudflare injecting `/cdn-cgi/l/email-protection#` patterns
3. **Email in HTML:** Found `support@skyrate.ai` in:
   - Landing page footer (all pages via layout)
   - Contact page
   - Privacy policy (3 locations)
   - Terms of service (3 locations)
   - Subscribe page
   - 6 blog posts
   - JSON-LD structured data in `<head>`

### The Fix: SafeEmail Component

**File:** `frontend/components/SafeEmail.tsx`

**Concept:** Don't put email addresses in the server-rendered HTML. Instead, render them only after React hydration (client-side), so Cloudflare never sees them.

```tsx
'use client';

import { useEffect, useState } from 'react';

export function SafeEmail({ user = 'support', domain = 'skyrate.ai', className, subject, children, fallback }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // During SSR: no email in HTML = Cloudflare can't mangle it
    return <span className={className}>{fallback || children || 'contact us'}</span>;
  }

  // After hydration: safe to render the real email link
  const email = `${user}@${domain}`;
  const href = subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
  return <a href={href} className={className} suppressHydrationWarning>{children || email}</a>;
}
```

**Key design decisions:**
- `suppressHydrationWarning` on the `<a>` tag prevents React from complaining about the SSR→client mismatch (since we intentionally change from `<span>` to `<a>`)
- Email is constructed from separate `user` + `domain` parts so even the string `support@skyrate.ai` never appears in the source code (extra safety)
- `DynamicEmailLink` variant exists for variable email addresses (e.g., vendor contact emails)

**Files that were updated to use SafeEmail (14 total):**

| File | What Changed |
|------|-------------|
| `frontend/components/SafeEmail.tsx` | NEW — The component itself |
| `frontend/app/page.tsx` | Landing page footer email link |
| `frontend/app/contact/page.tsx` | Contact page email |
| `frontend/app/subscribe/page.tsx` | Subscribe page email |
| `frontend/app/privacy/page.tsx` | 3 email references |
| `frontend/app/terms/page.tsx` | 3 email references |
| `frontend/app/blog/how-to-appeal-erate-denial/page.tsx` | CTA email |
| `frontend/app/blog/erate-form-470-guide/page.tsx` | CTA email |
| `frontend/app/blog/top-erate-denial-reasons/page.tsx` | CTA email |
| `frontend/app/blog/erate-category-2-budget-guide/page.tsx` | CTA email |
| `frontend/app/blog/erate-consultant-software-guide/page.tsx` | CTA email |
| `frontend/app/blog/erate-vendor-form-470-strategy/page.tsx` | CTA email |
| `frontend/app/layout.tsx` | Added `<!--email_off-->` comments around `<body>` content |
| `frontend/app/pricing/page.tsx` | FAQ text email reference |

**Secondary protection in `layout.tsx`:**
```tsx
{/* Disable Cloudflare Email Obfuscation for entire body */}
<div dangerouslySetInnerHTML={{ __html: '<!--email_off-->' }} style={{ display: 'none' }} />
<ErrorBoundary>
  {children}
</ErrorBoundary>
<div dangerouslySetInnerHTML={{ __html: '<!--/email_off-->' }} style={{ display: 'none' }} />
```

Cloudflare is supposed to respect `<!--email_off-->` / `<!--/email_off-->` comments, but this is used as a backup only — the primary fix is the SafeEmail component.

### Known Remaining Risk

The JSON-LD structured data in `layout.tsx` still contains:
```json
"contactPoint": {
  "@type": "ContactPoint",
  "email": "support@skyrate.ai",
  "contactType": "customer support"
}
```
This is inside `<script type="application/ld+json">` which Cloudflare *typically* does not modify (it's not visible text). If it ever causes issues, replace with a generic contact URL or remove the email.

### Alternative Fix (Not Implemented)

**Disable Cloudflare Email Obfuscation entirely:**
1. Log into Cloudflare dashboard
2. Go to `skyrate.ai` → Settings → Scrape Shield (or Security → Settings)
3. Toggle off "Email Address Obfuscation"

This would fix the problem globally but removes the obfuscation protection. The SafeEmail approach is better because it fixes the crash while still letting Cloudflare protect any emails we *don't* control.

### If This Happens Again

1. **First check:** Does `https://skyrate-unox7.ondigitalocean.app` work but `https://skyrate.ai` doesn't? → It's a Cloudflare issue
2. **Check for new email addresses:** Did someone add a raw `mailto:` or email string to any page? Search for `@skyrate.ai` or `@` in frontend files
3. **Quick test:** View page source on `skyrate.ai` and search for `__cf_email__` or `email-protection` — if found, Cloudflare is mangling emails
4. **Fix:** Replace any new raw emails with `<SafeEmail>` component
5. **Nuclear option:** Disable Email Address Obfuscation in Cloudflare

**Commits:** `321990c`, `d139422`

---

## Incident #2: DigitalOcean Deploy Failure (Health Check)

### Severity: HIGH — Blocks all code deployments to production

### Symptoms
- `git push` to `main` triggers DigitalOcean auto-deploy
- Deploy starts building but fails during the backend service startup
- Error message: `"backend deploy failed because your container did not respond to health checks"`
- Frontend never deploys either (backend failure blocks the whole deploy)

### Root Cause: Explicit health_check Config in app-spec.yaml

In commit `184b302`, an explicit `health_check` block was added to `app-spec.yaml`:

```yaml
# THIS CAUSED THE FAILURE:
health_check:
  http_path: /health
  initial_delay_seconds: 30
  period_seconds: 10
  timeout_seconds: 5
  success_threshold: 1
  failure_threshold: 3
```

**Why this broke things:**
- DigitalOcean has **default health check behavior** that was working fine
- Adding an explicit config **overrode the defaults** with stricter settings
- The backend takes time to start (loading heavy Python dependencies like pandas, numpy, matplotlib, google-generativeai on a 512MB instance)
- With `initial_delay_seconds: 30` and `failure_threshold: 3`, the backend had only ~60 seconds to start responding
- On a small `apps-s-1vcpu-0.5gb` instance, this wasn't enough time

**Compounding factor:** The backend's `lifespan` function does database operations (create tables, run migrations, seed accounts) at startup. If MySQL at Bluehost is slow to respond, startup takes even longer.

### The Fix

**Removed the entire `health_check` block from `app-spec.yaml`:**

```yaml
# BEFORE (broken):
  name: backend
  run_command: uvicorn app.main:app --host 0.0.0.0 --port 8000
  source_dir: backend
  health_check:
    http_path: /health
    initial_delay_seconds: 30
    period_seconds: 10
    timeout_seconds: 5
    success_threshold: 1
    failure_threshold: 3

# AFTER (fixed — use DO defaults):
  name: backend
  run_command: uvicorn app.main:app --host 0.0.0.0 --port 8000
  source_dir: backend
```

DigitalOcean's default health check is more lenient and was working perfectly before this config was added.

### Why We Didn't Just Increase the Timeouts

We could have set `initial_delay_seconds: 120` or `failure_threshold: 10`, but:
1. We don't know exactly what DO's defaults are (they're not documented precisely)
2. The defaults were working — no reason to override them
3. Explicit health check configs can have unexpected interactions with DO's deployment pipeline
4. Simpler is better — removing the block is a one-line diff with no unknowns

### If This Happens Again

1. **Check `app-spec.yaml`:** Did someone add a `health_check` block? Remove it.
2. **Check instance size:** If backend keeps failing to start, the `apps-s-1vcpu-0.5gb` (512MB RAM) might be too small. Try upgrading to `apps-s-1vcpu-1gb` (1GB RAM).
3. **Check `requirements.txt`:** Heavy dependencies (pandas, numpy, matplotlib, plotly) consume a lot of memory. If you keep adding dependencies, you may need more RAM.
4. **Check the run command:** Currently `uvicorn app.main:app --host 0.0.0.0 --port 8000`. You could add `--timeout-keep-alive 120` for more graceful handling.
5. **Check database connection:** If MySQL at Bluehost is down or slow, the backend will hang at startup. The lifespan function has try/except so it shouldn't block health checks, but verify this.
6. **Check DO deploy logs:** DigitalOcean App Platform → Your App → Activity → Latest deploy → View logs. This will show the actual startup output and where it stalls.
7. **Manual redeploy:** Sometimes a deploy just fails due to transient issues. Try: DigitalOcean dashboard → Create Deployment (or `doctl apps create-deployment <app-id>`)

### Backend Startup Resilience (Already Implemented)

The backend's startup is designed to be non-blocking for health checks:

```python
# In backend/app/main.py lifespan():
try:
    Base.metadata.create_all(bind=engine)    # Create tables
    _run_schema_migrations(engine)            # Add missing columns
    seed_demo_accounts()                      # Seed test data
except Exception as e:
    logger.error(f"Database initialization error (will retry on first request): {e}")

# Health endpoint is available immediately — doesn't need DB
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}
```

The health check endpoint responds **immediately** without waiting for database operations. The DB init is wrapped in try/except so a slow database won't block startup.

**Commit:** `c488419`

---

## Incident #3: Backend Login 500 Error

### Severity: HIGH — Users cannot log in

### Symptoms
- POST to `/api/v1/auth/login` returns HTTP 500
- Error in logs: `OperationalError: Unknown column 'users.phone_verified' in 'field list'`
- Only happens on production (MySQL). Works locally (SQLite).

### Root Cause: Missing MySQL Columns

New features added columns to the SQLAlchemy `User` model:
- `phone_verified` (for SMS verification)
- `onboarding_completed` (for onboarding wizard)
- `auth_provider` (for Google auth)
- `full_name` (for profile)

But **SQLAlchemy's `create_all()` only creates NEW tables** — it does NOT add columns to existing tables. Since the `users` table already existed in MySQL, these columns were never created.

This doesn't happen in local development with SQLite because:
- SQLite databases are often deleted and recreated from scratch
- Or local dev uses `alembic` migrations

### The Fix: Runtime Schema Migrations

Added `_run_schema_migrations()` to `backend/app/main.py`:

```python
def _run_schema_migrations(engine):
    """
    Add missing columns to existing tables in MySQL.
    SQLAlchemy's create_all() only creates NEW tables — it won't add columns
    to tables that already exist. This function handles that.
    """
    from sqlalchemy import text, inspect
    
    migrations = [
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
```

This runs on every startup and idempotently adds any missing columns. It checks if the column exists before trying to add it, so it's safe to run repeatedly.

### If This Happens Again

1. **When adding a new column to any SQLAlchemy model**, add a corresponding entry to the `migrations` list in `_run_schema_migrations()` in `backend/app/main.py`
2. **Better long-term fix:** Use Alembic migrations properly. The project has Alembic set up (`backend/alembic/`) but it's not being used for production migrations yet.
3. **Quick diagnosis:** If a login or any API call returns 500, check the backend logs for `Unknown column` errors.
4. **Manual fix:** You can also SSH into production or run a MySQL client to manually add the column:
   ```sql
   ALTER TABLE users ADD COLUMN phone_verified TINYINT(1) DEFAULT 0;
   ```

**Commit:** `753f188`

---

## How to Diagnose Future Issues

### Decision Tree: Site Is Down

```
Is skyrate.ai returning errors?
├── YES → Is skyrate-unox7.ondigitalocean.app also broken?
│         ├── YES → Problem is in the code or DO infrastructure
│         │         → Check DO deploy logs
│         │         → Check backend health: curl https://skyrate-unox7.ondigitalocean.app/api/health
│         │         → If backend is down: check DO activity/deploy status
│         │         → If backend is up but frontend crashes: check browser console for errors
│         │
│         └── NO  → Problem is Cloudflare-specific
│                   → Check for __cf_email__ in page source (View Source, Ctrl+U)
│                   → Check for other Cloudflare transformations
│                   → Check Cloudflare dashboard for configuration changes
│                   → See Incident #1 for email obfuscation fix
│
└── NO  → Site is working. Clear browser cache if seeing stale content.
```

### Decision Tree: Deploy Failed

```
Did the deploy fail?
├── Check DO dashboard → Activity → Latest deployment
├── Is it a BUILD failure?
│   ├── Frontend build: Check for TypeScript errors (run `npm run build` locally)
│   └── Backend build: Check for missing dependencies in requirements.txt
│
├── Is it a STARTUP failure ("container did not respond to health checks")?
│   ├── Check if health_check config was added to app-spec.yaml → REMOVE IT
│   ├── Check if a new import fails → run `python -c "from app.main import app"` locally
│   ├── Check if instance is out of memory → upgrade instance size
│   └── Check if database connection is failing → verify DATABASE_URL
│
└── Is it a RUNTIME failure (deploy succeeded but app crashes)?
    ├── Check backend logs in DO dashboard
    ├── Check browser console for frontend errors
    └── Verify API health: curl https://skyrate-unox7.ondigitalocean.app/api/health
```

### Decision Tree: API Returns 500

```
API returns 500 error?
├── Check which endpoint → Look at backend/app/api/v1/{router}.py
├── Common causes:
│   ├── Missing database column → See Incident #3, add to _run_schema_migrations()
│   ├── Missing environment variable → Check if new env var added to config.py but not to DO
│   ├── External API failure (USAC, Stripe, AI) → Check if API key is set in DO env vars
│   └── Database connection timeout → MySQL at Bluehost might be slow
├── How to check logs:
│   ├── DO Dashboard → App → Runtime Logs
│   └── Or: doctl apps logs <app-id> --type=run
└── Quick local test:
    ├── cd backend && uvicorn app.main:app --reload --port 8000
    └── curl http://localhost:8000/v1/{endpoint}
```

---

## Quick Reference: Key URLs & Commands

### Production URLs

| URL | What | Cloudflare? |
|-----|------|-------------|
| `https://skyrate.ai` | Live site (users access this) | YES |
| `https://www.skyrate.ai` | Alias → redirects to above | YES |
| `https://skyrate-unox7.ondigitalocean.app` | Direct DO URL (bypass CF) | NO |
| `https://skyrate.ai/api/health` | Backend health check | YES |
| `https://skyrate-unox7.ondigitalocean.app/api/health` | Backend health (bypass CF) | NO |

### Local Development

```bash
# Frontend
cd frontend && npm run dev
# → http://localhost:3000

# Backend
cd backend && uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
# Note: needs pymysql installed locally, or set DATABASE_URL="" to use SQLite fallback
```

### Deployment

```bash
# Auto-deploy (standard workflow):
git add -A && git commit -m "type: description" && git push
# DigitalOcean auto-deploys from main branch

# Check deploy status:
# → DigitalOcean dashboard → Apps → skyrate → Activity

# Force redeploy (if auto-deploy didn't trigger):
# → DO dashboard → Create Deployment
# → Or: doctl apps create-deployment <app-id>
```

### Verification Checks

```bash
# Backend is alive?
curl https://skyrate-unox7.ondigitalocean.app/api/health

# Frontend build passes?
cd frontend && npm run build

# Backend imports work?
cd backend && python -c "from app.main import app; print('OK')"

# Search for raw emails (potential Cloudflare issue):
grep -r "@skyrate.ai" frontend/app/ --include="*.tsx" --include="*.ts" | grep -v "SafeEmail" | grep -v "node_modules"

# Check if SafeEmail is used everywhere:
grep -r "mailto:" frontend/app/ --include="*.tsx" | grep -v "SafeEmail"
```

### Test Accounts

```
test_consultant@example.com / TestPass123!  → Consultant role
test_vendor@example.com / TestPass123!      → Vendor role
test_applicant@example.com / TestPass123!   → Applicant role
admin@skyrate.ai / SkyRateAdmin2024!        → Admin role

Free coupons: SKYRATEFREE, BETATESTER, DEMO2024, INTERNAL
```

---

## Architecture Notes That Matter

### Why the Instance Size Matters
- Backend: `apps-s-1vcpu-0.5gb` (512MB RAM)
- Heavy Python dependencies: pandas, numpy, matplotlib, plotly, google-generativeai, anthropic, scikit-learn
- All these load into memory at import time
- If you add more dependencies, you may need `apps-s-1vcpu-1gb` (1GB)

### Why SQLAlchemy create_all() Isn't Enough
- `Base.metadata.create_all()` creates tables that don't exist
- It does NOT alter existing tables (no column additions, no type changes)
- For production MySQL, always add new columns to `_run_schema_migrations()` in `main.py`
- Long-term: migrate to proper Alembic migrations

### Why Cloudflare + Next.js SSR Is Tricky
- Next.js renders HTML on the server → Cloudflare modifies it → React hydrates on client
- If Cloudflare changes the HTML structure, React's hydration fails
- This is a known Next.js + Cloudflare conflict, not specific to SkyRate
- SafeEmail pattern (client-only rendering) is the standard workaround
- Always be careful with any data that looks like an email, phone number, or other pattern Cloudflare might transform

### app-spec.yaml: Change With Extreme Caution
- This file controls the entire deployment infrastructure
- Changes here can break deploys without any code changes
- Always test deploy after modifying this file
- Do NOT add `health_check` blocks unless you know exactly what DO's defaults are
- The current working state has NO explicit health_check config

### Environment Variables That Must Be in DigitalOcean

**Currently configured (in app-spec.yaml):**
- `SECRET_KEY`, `DATABASE_URL`, `ENVIRONMENT`, `DEBUG`
- `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL`
- `NEXT_PUBLIC_API_URL` (frontend, BUILD_TIME scope)
- `NEXT_PUBLIC_VAPID_KEY` (frontend, BUILD_TIME scope)

**Missing (needed for new features to work):**
- `DEEPSEEK_API_KEY` — AI denial analysis & appeal generation
- `GEMINI_API_KEY` — Alternative AI model
- `ANTHROPIC_API_KEY` — Claude AI model
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` — SMS verification
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` — Email notifications
- `HUNTER_API_KEY` — Contact enrichment for vendor leads

---

## Commit History for Reference

### Incident-Related Commits (most recent first)
```
c488419 fix: remove explicit health check config (use DO defaults) + add project status memory file
184b302 fix: add health check config + resilient startup      ← CAUSED DEPLOY FAILURE
d139422 fix: add CF email_off comments                        ← SafeEmail secondary fix
321990c fix: prevent Cloudflare email obfuscation              ← SafeEmail primary fix
2c7dbc4 fix: add error boundary to diagnose production crash
753f188 fix: add missing MySQL columns migration               ← Login 500 fix
```

### Key Feature Commits (for context on what changed)
```
3fe7d47 feat: AI blog image generation (Nano Banana)
fe17c7c feat: auto blog generator + admin management
9cd291a feat: 6 SEO blog posts + landing page links + sitemap
bc5afac feat: complete SEO infrastructure
21eec96 feat: email verification for onboarding
df0c9bb feat: onboarding wizard, SMS service, admin broadcast
6916722 feat: admin dashboard, support tickets, chat widget    ← Admin portal
0731c0e feat: Google Workspace email integration
949484c feat: domain DNS migration to skyrate.ai               ← When Cloudflare was added
```

---

## Lessons Learned

1. **Never add infrastructure config changes (health checks, scaling, etc.) along with code changes.** Deploy infrastructure changes separately so you can isolate failures.

2. **Cloudflare transforms HTML in ways you don't expect.** Any data that looks like an email, phone, or credit card might be modified. Always test through the Cloudflare URL, not just the direct DO URL.

3. **SQLAlchemy `create_all()` has a major limitation.** It won't update existing tables. Any schema change on production MySQL needs explicit migration.

4. **Always verify deploy succeeded before assuming your fix is live.** Code can be correct but never reach production if the deploy fails.

5. **The DigitalOcean direct URL is your best debugging tool.** If `skyrate-unox7.ondigitalocean.app` works but `skyrate.ai` doesn't, the problem is in the Cloudflare/DNS layer, not your code.

6. **512MB instances are tight for Python ML/AI backends.** Keep an eye on memory usage. If deploys start failing without code changes, it might be an OOM issue.

7. **`app-spec.yaml` is production infrastructure code.** Treat all changes to it as carefully as database migrations. Small changes can have huge impacts.
