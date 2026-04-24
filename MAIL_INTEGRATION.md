# mail.skyrate.ai Integration (P4-frontend + P5)

This doc describes how skyrate.ai integrates with the mail.skyrate.ai email campaign
worker (DigitalOcean App `7743f6e0-9a31-433d-8ef0-3bf3367bfaa3`, live at
`https://skyratemail-65jh2.ondigitalocean.app`).

## 1. Branded tracking proxy (P4-frontend)

Outbound emails embed open/click/unsubscribe links under the **skyrate.ai** domain
for brand trust and deliverability. Next.js rewrites forward them to the worker:

| Public URL (in email) | Rewrites to |
|-----------------------|-------------|
| `https://skyrate.ai/api/mail/track/open/<token>.gif` | `https://skyratemail-65jh2.ondigitalocean.app/t/o/<token>.gif` |
| `https://skyrate.ai/api/mail/track/click/<token>`    | `https://skyratemail-65jh2.ondigitalocean.app/t/c/<token>` |
| `https://skyrate.ai/api/mail/unsub?t=<token>`        | `https://skyratemail-65jh2.ondigitalocean.app/unsub?t=<token>` |

Configured in `frontend/next.config.js` BEFORE the `/api/:path*` catch-all so the
FastAPI backend still receives all other `/api/*` calls.

## 2. Mail worker env vars (set on DO App `7743f6e0`)

Action required: open the DO app settings and add the following. These make the
worker emit branded tracking links and enable the full intelligence stack.

```
# Branded tracking (P4-frontend)
PUBLIC_TRACKING_BASE=https://skyrate.ai/api/mail
PUBLIC_UNSUB_BASE=https://skyrate.ai/api/mail/unsub

# LLM (P1-P3)
GEMINI_API_KEY=<user provides>
ANTHROPIC_API_KEY=<user provides>

# DMARC IMAP (P2)
DMARC_IMAP_PASSWORD=<Gmail app password for dmarc@mail.skyrate.ai>

# From-alias routing (P3)
FROM_ALIAS_CONSULTANT=hello@mail.skyrate.ai
FROM_ALIAS_ENTITY=schools@mail.skyrate.ai
FROM_ALIAS_VENDOR=hello@mail.skyrate.ai
REPLY_TO=ari@skyrate.ai
```

## 3. Google Workspace aliases (free, no extra seats)

Create in Workspace admin for `mail.skyrate.ai` and `skyrate.ai`:

| Alias | Forwards to |
|-------|-------------|
| `hello@mail.skyrate.ai`  | `david@mail.skyrate.ai` |
| `schools@mail.skyrate.ai`| `david@mail.skyrate.ai` |
| `unsub@mail.skyrate.ai`  | `david@mail.skyrate.ai` |
| `bounce@mail.skyrate.ai` | `david@mail.skyrate.ai` |
| `dmarc@mail.skyrate.ai`  | `david@mail.skyrate.ai` |
| `ari@skyrate.ai`         | `david@mail.skyrate.ai` |

## 4. Superadmin dashboard (P5)

Route: `/superadmin/mail-campaigns` (admin/super role required).

Backend router: `backend/app/api/v1/mail_campaigns.py` — uses a **separate** read-only
SQLAlchemy engine pointing at the Hostinger `u892988798_mail_skyrate` database.
All queries are raw `text()` — no new ORM models are introduced.

### Required env vars on skyrate.ai DO app

```
MAIL_DB_HOST=srv1361.hstgr.io
MAIL_DB_PORT=3306
MAIL_DB_USER=u892988798_mail_skyrate
MAIL_DB_PASSWORD=<ask ops>
MAIL_DB_NAME=u892988798_mail_skyrate
ADMIN_EMAILS=david@skyrate.ai,ari@skyrate.ai
```

### Endpoints (all require `admin` or `super` role)

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/v1/mail/live`                         | 24h sends by tier/status + current sender_health |
| GET  | `/api/v1/mail/deliverability`               | Trailing-200 bounce rate + 7d DMARC alignment |
| GET  | `/api/v1/mail/funnel?days=7`                | sent -> opens -> clicks -> replies -> unsubs |
| GET  | `/api/v1/mail/suppression`                  | Paginated suppression_list (filter by reason) |
| GET  | `/api/v1/mail/llm-insights`                 | 30d campaign_reports + 7d llm_budget_ledger |
| GET  | `/api/v1/mail/dmarc`                        | Pending-first dmarc_findings + 30d aggregate |
| GET  | `/api/v1/mail/experiments`                  | experiments table (status filter) |
| POST | `/api/v1/mail/dmarc/{id}/approve`           | Approve finding |
| POST | `/api/v1/mail/dmarc/{id}/reject`            | Reject finding |
| POST | `/api/v1/mail/experiments/{id}/approve`     | Approve experiment |
| POST | `/api/v1/mail/experiments/{id}/reject`      | Reject experiment |

## 5. Post-deploy smoke tests

```bash
curl -sI https://skyrate.ai/api/mail/track/open/invalid.gif
# expect: 200 OK, Content-Type: image/gif

curl -sI https://skyrate.ai/api/mail/unsub?t=invalid
# expect: 400 (worker validates token)

curl -sI https://skyrate.ai/superadmin/mail-campaigns
# expect: 200 (client-side redirect for non-admins)
```
