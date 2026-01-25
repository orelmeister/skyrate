# SkyRate AI V2 - E-Rate Funding Intelligence Platform

A modern web application for E-Rate consultants to track school funding, analyze denials, and manage their client portfolios.

## 🚀 Features

### Dashboard
- **Real-time Stats**: View total schools, C2 funding totals, denial counts, and application statistics
- **C2 Funding Analysis**: Integrated with USAC C2 Budget Tool API for accurate funding data
- **School Portfolio Management**: Track and manage your client schools

### CRN Verification & Auto-Import
- Verify your Consultant Registration Number (CRN) against USAC records
- Auto-import schools associated with your CRN
- Preview schools before importing

### School Search & Management
- Search USAC Open Data for schools by BEN, name, state, or city
- Filter by funding status (Denied, Funded, Pending)
- Bulk add schools to your portfolio
- View detailed school funding information

### USAC API Integration
- Form 471 application data (dataset: `srbr-2d59`)
- C2 Budget Tool data (dataset: `6brt-5pbv`)
- Real-time data from USAC Open Data Portal

## 📁 Project Structure

```
skyrate-ai-v2/
├── frontend/                 # Next.js 14 application
│   ├── app/                  # App router pages
│   │   ├── consultant/       # Consultant portal
│   │   ├── vendor/           # Vendor portal
│   │   ├── sign-in/          # Authentication
│   │   └── sign-up/          # Registration
│   ├── components/           # React components
│   │   ├── ui/               # Shadcn/ui components
│   │   └── SearchResultsTable.tsx
│   └── lib/                  # Utilities & API client
│
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/v1/           # API endpoints
│   │   │   ├── consultant.py # Dashboard, schools, CRN
│   │   │   ├── schools.py    # School enrichment
│   │   │   └── auth.py       # Authentication
│   │   ├── services/         # Business logic
│   │   │   └── usac_service.py
│   │   └── main.py           # FastAPI app
│   └── requirements.txt
│
├── docs/                     # Documentation
└── docker-compose.yml        # Docker deployment
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+, SQLAlchemy |
| Database | SQLite (dev) / PostgreSQL (prod) |
| State | Zustand |
| Auth | NextAuth.js (planned) / Custom JWT |
| API | USAC Open Data (Socrata) |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (v20 recommended)
- Python 3.11+
- Git

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Activate (Mac/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Run development server
npm run dev
```

### Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/docs

## 📝 Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8001
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000
```

### Backend (.env)
```env
DATABASE_URL=sqlite:///./skyrate.db
SECRET_KEY=your-secret-key
USAC_API_TOKEN=optional-for-higher-rate-limits
```

## 📚 API Documentation

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/consultant/dashboard-stats` | GET | Get dashboard statistics |
| `/api/v1/consultant/crn/verify` | POST | Verify CRN and preview schools |
| `/api/v1/consultant/schools` | GET | List consultant's schools |
| `/api/v1/consultant/schools` | POST | Add school to portfolio |
| `/api/v1/schools/enrich/{ben}` | GET | Get enriched school data |
| `/api/v1/query` | POST | Natural language query |

### USAC Data Sources
- **Form 471**: `https://opendata.usac.org/resource/srbr-2d59.json`
- **C2 Budget Tool**: `https://opendata.usac.org/resource/6brt-5pbv.json`

## 🔧 Development

### VS Code Tasks
The project includes VS Code tasks for easy development:
- `Run SkyRate V2 Backend` - Start FastAPI server
- `Run SkyRate V2 Frontend` - Start Next.js dev server

### Running Tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

## 📦 Deployment

### Docker
```bash
docker-compose up -d
```

### Manual Deployment
See [DIGITAL_OCEAN_DEPLOY.md](./DIGITAL_OCEAN_DEPLOY.md) for deployment instructions.

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
