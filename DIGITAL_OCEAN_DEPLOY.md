# SkyRate AI V2 - Digital Ocean Deployment Guide

## Overview

This guide covers deploying SkyRate AI V2 to Digital Ocean using:
- **App Platform** - For the frontend (Next.js) and backend (FastAPI)
- **Managed Database** - PostgreSQL
- **Spaces** - For file storage (optional)

## Architecture

```
                    ┌─────────────────────────────┐
                    │     Digital Ocean CDN       │
                    │    (Cloudflare optional)    │
                    └─────────────┬───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   (Next.js)     │───▶│   (FastAPI)     │───▶│   (PostgreSQL)  │
│   App Platform  │    │   App Platform  │    │   Managed DB    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

1. Digital Ocean account
2. Domain name (optional but recommended)
3. API keys: ANTHROPIC_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY
4. Stripe keys (for payments)

## Step 1: Create Managed PostgreSQL Database

1. Go to **Databases** in Digital Ocean console
2. Click **Create Database**
3. Select **PostgreSQL 15**
4. Choose region (same as your app)
5. Select plan:
   - **Development**: $15/mo (1 vCPU, 1GB RAM, 10GB storage)
   - **Production**: $60/mo+ (2 vCPU, 4GB RAM, 38GB storage)
6. Name it: `skyrate-db`
7. Click **Create Database Cluster**
8. Save the connection string:
   ```
   postgresql://user:password@host:25060/defaultdb?sslmode=require
   ```

## Step 2: Deploy Backend via App Platform

### Option A: Using doctl CLI

```bash
# Install doctl
brew install doctl  # Mac
# or download from https://docs.digitalocean.com/reference/doctl/how-to/install/

# Authenticate
doctl auth init

# Create app from spec
doctl apps create --spec .do/app.yaml
```

### Option B: Using Web Console

1. Go to **Apps** → **Create App**
2. Select **GitHub** as source
3. Choose repository: `erateapp.com/opendata`
4. Select branch: `main`
5. Configure component:
   - **Type**: Web Service
   - **Name**: `skyrate-backend`
   - **Source Directory**: `/skyrate-ai-v2/backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Run Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **HTTP Port**: 8000
   - **Instance Size**: Basic ($5/mo) or Professional ($12/mo)

6. Add Environment Variables:
   ```
   DATABASE_URL=postgresql://...  (from Step 1)
   SECRET_KEY=<generate-with: openssl rand -hex 32>
   ANTHROPIC_API_KEY=sk-ant-...
   GOOGLE_API_KEY=AIza...
   DEEPSEEK_API_KEY=sk-...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   DEBUG=false
   ```

## Step 3: Deploy Frontend

1. In the same App, click **Add Component**
2. Configure:
   - **Type**: Web Service
   - **Name**: `skyrate-frontend`
   - **Source Directory**: `/skyrate-ai-v2/frontend`
   - **Build Command**: `npm install && npm run build`
   - **Run Command**: `npm start`
   - **HTTP Port**: 3000
   - **Instance Size**: Basic ($5/mo)

3. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://skyrate-backend-xxxxx.ondigitalocean.app
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   NEXTAUTH_SECRET=<generate-with: openssl rand -hex 32>
   NEXTAUTH_URL=https://skyrate.ai  (your domain)
   ```

## Step 4: Configure Domain (Optional)

1. Go to **Networking** → **Domains**
2. Add your domain: `skyrate.ai`
3. Point DNS to Digital Ocean nameservers:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```
4. In App Platform, go to **Settings** → **Domains**
5. Add custom domain and verify

## App Spec File (.do/app.yaml)

Create this file for one-click deployment:

```yaml
name: skyrate-ai
region: nyc
services:
  # Backend API
  - name: backend
    github:
      repo: yourusername/erateapp.com
      branch: main
      deploy_on_push: true
    source_dir: /opendata/skyrate-ai-v2/backend
    dockerfile_path: Dockerfile
    http_port: 8000
    instance_count: 1
    instance_size_slug: basic-xxs
    health_check:
      http_path: /health
    envs:
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${db.DATABASE_URL}
      - key: SECRET_KEY
        scope: RUN_TIME
        type: SECRET
      - key: ANTHROPIC_API_KEY
        scope: RUN_TIME
        type: SECRET
      - key: GOOGLE_API_KEY
        scope: RUN_TIME
        type: SECRET
      - key: DEEPSEEK_API_KEY
        scope: RUN_TIME
        type: SECRET
      - key: DEBUG
        scope: RUN_TIME
        value: "false"
  
  # Frontend
  - name: frontend
    github:
      repo: yourusername/erateapp.com
      branch: main
      deploy_on_push: true
    source_dir: /opendata/skyrate-ai-v2/frontend
    build_command: npm install && npm run build
    run_command: npm start
    http_port: 3000
    instance_count: 1
    instance_size_slug: basic-xxs
    envs:
      - key: NEXT_PUBLIC_API_URL
        scope: RUN_TIME
        value: ${backend.PUBLIC_URL}
      - key: NEXTAUTH_SECRET
        scope: RUN_TIME
        type: SECRET

databases:
  - name: db
    engine: PG
    production: false
    cluster_name: skyrate-db
```

## Cost Estimate

| Component | Plan | Monthly Cost |
|-----------|------|--------------|
| Backend (App Platform) | Basic | $5 |
| Frontend (App Platform) | Basic | $5 |
| PostgreSQL (Dev) | Basic | $15 |
| **Total** | | **$25/mo** |

For production scaling:
- Backend Professional: $12-25/mo
- Frontend Professional: $12-25/mo  
- PostgreSQL Production: $60+/mo
- **Production Total**: ~$100-150/mo

## Environment Variables Reference

### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://user:pass@host:25060/db?sslmode=require

# Security
SECRET_KEY=your-secret-key-here
DEBUG=false

# AI Services
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Frontend (.env)
```env
NEXT_PUBLIC_API_URL=https://api.skyrate.ai
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=https://skyrate.ai
```

## Deployment Commands

```bash
# Deploy with doctl
doctl apps create --spec .do/app.yaml

# Update deployment
doctl apps update APP_ID --spec .do/app.yaml

# View logs
doctl apps logs APP_ID --component backend --follow

# SSH into container (for debugging)
doctl apps console APP_ID backend
```

## Post-Deployment Checklist

- [ ] Database migrations run successfully
- [ ] Backend health check passes (`/health`)
- [ ] Frontend loads correctly
- [ ] User registration works
- [ ] Login/logout works
- [ ] USAC API queries work
- [ ] Stripe webhooks configured
- [ ] Custom domain SSL enabled
- [ ] Monitoring/alerts set up

## Troubleshooting

### Build Fails
- Check build logs in App Platform console
- Ensure requirements.txt is up to date
- Verify Dockerfile builds locally

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check firewall rules allow App Platform IPs
- Ensure SSL mode is enabled

### CORS Errors
- Update CORS origins in backend to include frontend URL
- Check NEXT_PUBLIC_API_URL points to correct backend

### Performance Issues
- Scale up instance size
- Add caching (Redis)
- Enable CDN for static assets
