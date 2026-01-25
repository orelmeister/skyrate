# SkyRate AI v2 - Production Deployment

## Full Stack Architecture

### Backend (FastAPI)
```
skyrate-ai-v2/backend/
├── app/
│   └── main.py       # FastAPI endpoints
├── requirements.txt
└── Dockerfile
```

### Frontend (Next.js 14)
```
skyrate-ai-v2/frontend/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx         # Home/landing
│   ├── sign-in/page.tsx
│   ├── sign-up/page.tsx
│   └── dashboard/page.tsx
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
└── package.json
```

## Quick Start (Development)

### 1. Backend
```bash
cd skyrate-ai-v2/backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
```bash
cd skyrate-ai-v2/frontend
npm install
npm run dev
```

Visit: http://localhost:3000

## Production Deployment

### Docker Compose (Recommended)

Create `docker-compose.yml` in skyrate-ai-v2:

```yaml
version: "3.8"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
    volumes:
      - ../data:/app/data:ro
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000
    depends_on:
      - backend
    restart: unless-stopped
```

### DigitalOcean App Platform

1. Push to GitHub
2. Create App on DigitalOcean App Platform
3. Add both services (backend + frontend)
4. Set environment variables
5. Deploy

### Hostinger VPS

```bash
# SSH to server
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone repo
git clone https://github.com/your-repo/skyrate-ai-v2.git
cd skyrate-ai-v2

# Create .env
echo "ANTHROPIC_API_KEY=your-key" >> .env
echo "GOOGLE_API_KEY=your-key" >> .env

# Deploy
docker-compose up -d
```

## Environment Variables

### Backend (.env)
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=https://yourdomain.com
```

## Features

✅ **Chat Interface** - Natural language E-Rate queries
✅ **Vendor Scout** - Service provider search
✅ **Reports** - Denial analysis and insights
✅ **Email Campaigns** - Outreach management
✅ **Dark Mode** - System preference detection
✅ **Responsive** - Mobile-first design
