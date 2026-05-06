# Signup Flow Investigation — Empty Portfolios Root Cause

**Date:** 2026-05-06
**Scope:** `skyrate.ai/` (frontend + backend + production DB)
**Mode:** Read-only. No code changes. No deployments.
**Reporter:** skyrate.ai Domain Orchestrator

---

## TL;DR

**Root cause: (a) + (e).** The `/sign-up` form **never asks for BEN/SPIN/CRN** — by explicit design ("Add details later"). USAC identifier capture was deferred to a 5-step onboarding wizard at `/onboarding`. **All 8 signups in the last 30 days bounced before completing step 1 of onboarding.** None verified email, none entered an identifier, none ever logged back in. The admin users tab is reading the database correctly — the portfolios are genuinely empty.

This is a **funnel collapse**, not a data-capture bug. The signup → onboarding handoff is losing 100% of new users.

---

## 1. Signup flow map (end-to-end)

### 1.1 Frontend `/sign-up` form (production)
File: [skyrate.ai/frontend/app/sign-up/page.tsx](skyrate.ai/frontend/app/sign-up/page.tsx)

Fields rendered on `https://skyrate.ai/sign-up` (verified with Playwright on prod, screenshot in `_signup_form_audit.png`):

| Field | Required | Notes |
|---|---|---|
| Role (radio: consultant / vendor / applicant) | yes | |
| Email | yes | |
| Password | yes | 8+ chars, upper/lower/digit/special enforced client + server |
| "How did you hear about us?" (referral) | no | not sent to backend |

**Fields that are NOT on the form:** first name, last name, company, phone, **BEN**, **SPIN**, **CRN**, FCC RN.

The marketing copy on the same page makes the design intent explicit:
- > "Start in 30 seconds. Add details later."
- > "Just email and password. We'll set up CRN/SPIN/BEN verification after you're inside."
- > "Just email and password. Verify your USAC entity later."

### 1.2 What the client POSTs
`useAuthStore.register({ email, password, role, promo_token? })` → `POST /api/v1/auth/register`. Only those four fields. No identifier sent.

### 1.3 Backend `POST /api/v1/auth/register`
File: [skyrate.ai/backend/app/api/v1/auth.py](skyrate.ai/backend/app/api/v1/auth.py#L38-L70) (schema), [auth.py](skyrate.ai/backend/app/api/v1/auth.py#L298-L385) (handler)

Pydantic `UserRegister` schema accepts these as **all optional**: `first_name`, `last_name`, `company_name`, `phone`, `crn`, `spin`, `ben`, `promo_token`. So the backend would happily store BEN/SPIN/CRN if the frontend sent them — but it doesn't.

Handler logic:
1. Insert `users` row. `first_name` defaults to email-local-part if not provided (this is why all 8 recent users have `first_name = "erateman"`, `"rhine"`, `"bbauer"`, etc.).
2. Insert role-specific profile row (`consultant_profiles` / `vendor_profiles` / `applicant_profiles`) with `crn` / `spin` / `ben` set to **NULL** (because frontend didn't send any).
3. Create 14-day trialing `subscriptions` row.
4. Send verification email, return JWT, redirect to `/onboarding`.

### 1.4 Onboarding `/onboarding` (where BEN/SPIN/CRN is *supposed* to be captured)
File: [skyrate.ai/frontend/app/onboarding/page.tsx](skyrate.ai/frontend/app/onboarding/page.tsx)

Five-step wizard:
| Step | Component | Mandatory? | Captures |
|---|---|---|---|
| 0 | `ProfileDetailsStep` | optional save | first name (req'd), last name, company, phone, **CRN/SPIN/BEN (optional with explicit "Skip identifier for now" button)** |
| 1 | `EmailVerificationStep` | **mandatory** | 6-digit email code |
| 2 | `PhoneVerificationStep` | optional | phone OTP |
| 3 | `FRNDiscoveryStep` | optional | discovers FRNs from USAC |
| 4 | `AlertPreferencesStep` | optional | notification prefs |

Step 0 PUTs to `PUT /api/v1/auth/me` with `{first_name, last_name, phone, company_name, crn|spin|ben?, verified_entity?}`. The "Verify" button calls `POST /api/v1/auth/validate-{crn|spin|ben}` against USAC before saving.

**Critical:** the identifier field has a **"Skip identifier for now"** button that saves the profile without writing CRN/SPIN/BEN. If the user clicks that, the profile gets `crn=NULL` permanently until they revisit settings.

---

## 2. Schema audit

`users` table columns (production MySQL `skylimi5_skyrate.users`): `id, email, password_hash, role, auth_provider, first_name, last_name, company_name, phone, phone_verified, phone_verified_at, is_active, is_verified, email_verified, email_verified_at, sms_opt_in, sms_opted_in_at, verified_entity, verified_entity_at, onboarding_completed, full_name, created_at, updated_at, last_login`.

**No** `ben` / `spin` / `crn` / `fcc_registration_number` columns directly on `users` — they live on profile tables:

- `consultant_profiles.crn` (nullable, varchar(50)) — primary CRN
- `consultant_crns.crn` (nullable, varchar(50)) — multi-CRN table for paid extras (6 rows total platform-wide)
- `vendor_profiles.spin` (nullable, varchar(50))
- `applicant_profiles.ben` (nullable, varchar(50))

All identifier columns are **nullable**, and **all 8 recent consultant signups have `crn = NULL`** in `consultant_profiles`. No CRN rows for any of them in `consultant_crns`. No vendor or applicant signups in this window.

There is no `sessions` / `login_history` / `audit_log` table — login activity is tracked only via `users.last_login`.

---

## 3. Production form audit (Playwright)

Visited `https://skyrate.ai/sign-up`, captured DOM and screenshot (`_signup_form_audit.png`). The page renders **exactly** what the source says it should: role radios + email + password + optional referral. There is no hidden BEN/SPIN field, no CSS-collapsed input, no JS-conditional reveal. The source code matches production. **No bug here — this is the intended design.**

---

## 4. Recent users table (last 30 days, redacted)

| user_id | email | role | joined | last_login | login_count | has BEN/SPIN/CRN? | has portfolio? |
|---:|---|---|---|---|---:|---|---|
| 16 | e***n@gmail.com | consultant | 2026-05-04 16:16 | **never** | 0 | no (NULL) | 0 schools |
| 15 | r***e@hwc-consultants.com | consultant | 2026-04-30 18:36 | **never** | 0 | no (NULL) | 0 schools |
| 14 | b***r@eratefirst.com | consultant | 2026-04-30 15:32 | **never** | 0 | no (NULL) | 0 schools |
| 13 | b***e@eratefirst.com | consultant | 2026-04-30 15:32 | **never** | 0 | no (NULL) | 0 schools |
| 12 | r***z@ncsu.edu | consultant | 2026-04-29 18:52 | **never** | 0 | no (NULL) | 0 schools |
| 9  | s***a@gmail.com | consultant | 2026-04-28 14:02 | **never** | 0 | no (NULL) | 0 schools |
| 8  | s***2@gmail.com | consultant | 2026-04-27 18:43 | **never** | 0 | no (NULL) | 0 schools |
| 7  | s***a@usac.org | consultant | 2026-04-27 18:43 | **never** | 0 | no (NULL) | 0 schools |

Aggregate (last 30d): **total = 8, ever logged in = 0, email_verified = 0, onboarding_completed = 0, verified_entity = 0**.

Two domain pairs are suspicious (same domain, ~17 seconds apart on `eratefirst.com`; same domain on `gmail.com` for `s***a` / `s***a@usac.org`) — possibly bot/duplicate signups, but there's no log to confirm. The `s***a@usac.org` row is interesting (USAC employee?); they signed up and never came back.

**Note:** `last_login` is set on /api/v1/auth/login. The fact that all 8 are NULL means **none of these users ever signed back in via the login form** after registration — and registration itself does NOT update `last_login` (it returns a JWT directly). They received the auth token from /register, were redirected to /onboarding, and then never returned with a fresh login session.

---

## 5. Root-cause hypothesis (ranked)

| Rank | Cause | Verdict | Evidence |
|---:|---|---|---|
| 1 | **(a) Form never asks for BEN/SPIN/CRN** | **CONFIRMED** | Production /sign-up has no identifier field. Marketing copy explicitly says "verify later." |
| 2 | **(e) Onboarding wizard exists but users abandon it** | **CONFIRMED** | 0/8 recent users completed step 1 (email verify). 0/8 ever logged back in. Wizard step 0 has an explicit "Skip identifier for now" button that lets users bypass CRN/SPIN/BEN entirely. |
| 3 | (b) Form asks but field is hidden / users skip | N/A — there's no field to skip on /sign-up itself; the skip happens one screen later in /onboarding. |
| 4 | (c) Field captured but not persisted | Not happening for /sign-up (nothing to capture). The PUT /auth/me endpoint in onboarding step 0 *does* persist correctly when used. |
| 5 | (d) Field persisted but admin UI doesn't display | **NOT a bug.** Admin UsersTab reads `u.portfolio.crn / spin / ben` and `schools_count / ben_count` from the API and renders them. When the underlying value is NULL, it correctly shows "0 schools" / "—". The admin UI is reading reality. |
| 6 | (f) Other | Bot/abandoned-card signups are plausible (two `eratefirst.com` accounts 17s apart, never verified email) but don't change the headline finding. |

---

## 6. Retention note

**Of 8 recent signups, 0 came back even once.** Nobody verified email, nobody entered an identifier, nobody logged in a second time. The "Add details later" promise creates a dead end: users sign up, receive a verification email they don't act on, and never return. The 14-day trial clock starts ticking on registration regardless.

For comparison, the platform has 183 `consultant_schools` rows and 6 `consultant_crns` rows from older accounts — the system *does* work end-to-end when users complete onboarding. The breakdown is specifically post-signup engagement.

---

## 7. Recommended fixes (proposed only — NOT implemented)

Ranked by expected impact / effort:

1. **[HIGH impact, LOW effort] Capture role-specific identifier on /sign-up.**
   Add a single optional input on /sign-up (label changes by role: "BEN", "SPIN", or "CRN"). Validate against USAC inline. Send it through the existing `crn|spin|ben` fields the backend already accepts. This converts the immediate intent into a saved lead even if email verification stalls. Keep "skip" allowed — but capture when offered.

2. **[HIGH impact, LOW effort] Make Step 0 of /onboarding mandatory before reaching the dashboard.**
   Currently the user receives a JWT immediately, so they can navigate away and the trial just runs out. Either (a) gate the dashboard behind `onboarding_completed=true`, or (b) remove the "Skip identifier for now" button — name + identifier becomes a single forced step.

3. **[HIGH impact, MED effort] Email-verify before issuing JWT.**
   Today, `/register` returns a JWT and the user is sent to `/onboarding`. If they close the tab, they're never forced back to the verification email. Switch to: register → email with magic link → first login = email verified → onboarding.

4. **[MED impact, LOW effort] Re-engagement drip.**
   Day 1, 3, 7 emails to anyone with `email_verified=0` AND `crn IS NULL`. Currently 100% of last-30-day signups would qualify; nobody is being re-engaged.

5. **[MED impact, MED effort] Treat the 8 stranded signups as warm leads.**
   Manual outreach to the 5 distinct domains (`hwc-consultants.com`, `eratefirst.com`, `ncsu.edu`, `gmail.com` x3, `usac.org`). At minimum, email them through the existing admin "Email user" action.

6. **[LOW impact, LOW effort] De-dup signups from the same domain within 60s.**
   The two `eratefirst.com` accounts 17s apart suggest either a double-submit or a bot. Add a simple rate-limit per email-domain.

7. **[LOW impact, LOW effort] Fix admin display polish.**
   The portfolio column in admin UsersTab shows "0 schools" for empty consultants. Consider adding a "No identifier" badge in red so admins can spot the funnel-collapse pattern at a glance. Not a bug, just observability.

8. **[Tracking only] Funnel instrumentation.**
   `signup_complete` is tracked, but there's no event for `onboarding_step_0_complete`, `onboarding_step_1_complete`, `identifier_skipped`. Add these to confirm the abandonment point and measure the impact of fixes 1–3.

---

## Constraints honored

- ✅ Read-only: no code edits, no commits, no deploys.
- ✅ Only writes: SELECT queries against prod MySQL + this report file + temporary `_signup_investigation.py` (can be deleted).
- ✅ All emails redacted.
- ✅ No blockers — DB credentials worked from `skyrate.ai/backend/.env`; production `/sign-up` accessible via Playwright.

---

*End of report.*
