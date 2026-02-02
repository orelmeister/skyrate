# 🚀 SkyRate AI - E-Rate Funding Intelligence Platform

> **AI-powered E-Rate intelligence for consultants and vendors. Maximize funding, win more appeals, and discover opportunities.**

[![Live Demo](https://img.shields.io/badge/Demo-skyrate.ai-blue?style=for-the-badge)](https://skyrate.ai)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## 🎯 What is SkyRate AI?

SkyRate AI is the only platform that combines **real-time USAC data**, **AI-powered denial analysis**, and **automated appeal generation** to help E-Rate professionals maximize funding for schools and clients.

Whether you're a **consultant** managing hundreds of schools or a **vendor** chasing Form 470 leads, SkyRate AI gives you the tools to work smarter, not harder.

---

## 💼 Why Choose SkyRate AI?

### For E-Rate Consultants
| Challenge | SkyRate AI Solution |
|-----------|---------------------|
| Hours spent on USAC portal research | **Natural language search** - Ask in plain English |
| Manual denial tracking | **Automatic denial monitoring** with AI analysis |
| Writing appeal letters from scratch | **AI-generated appeals** using proven strategies |
| Managing multiple school portfolios | **Dashboard with CRN auto-import** |
| Missing filing deadlines | **Real-time status tracking** and alerts |

### For E-Rate Vendors
| Challenge | SkyRate AI Solution |
|-----------|---------------------|
| Finding new Form 470 opportunities | **Lead tracking by manufacturer** (Cisco, Fortinet, Aruba, etc.) |
| Tracking your FRN status | **SPIN validation & FRN monitoring** |
| Understanding competitor landscape | **Competitor analysis** with win rate comparisons |
| Missing bid deadlines | **Response deadline tracking** with alerts |
| Market sizing | **Market intelligence dashboard** |

---

## ✨ Features

### 📋 Consultant Portal

#### Dashboard & Analytics
- **Real-time Statistics**: Total schools, C2 funding, denial counts, application status
- **C2 Budget Tracking**: Integrated with USAC C2 Budget Tool API
- **Funding Year Analysis**: Track performance across multiple funding years

#### CRN Verification & Auto-Import
- Verify your Consultant Registration Number (CRN) against USAC records
- **One-click import** of all schools associated with your CRN
- Preview schools before importing to your portfolio

#### AI-Powered Denial Analysis
- **Automatic denial detection** from USAC data
- AI analysis of denial reasons with **recommended appeal strategies**
- Pattern recognition across similar denials

#### AI Appeal Generation
- Generate **professional, USAC-compliant appeal letters** in seconds
- Uses advanced AI trained on E-Rate regulations and FCC orders
- **Cite relevant FCC orders** automatically
- Interactive chat interface for refining appeals

#### School Management
- Search USAC Open Data by BEN, name, state, or city
- Filter by funding status (Denied, Funded, Pending)
- Bulk operations for portfolio management
- Enriched school data with C2 budgets and funding history

#### Natural Language Search
- Ask questions in plain English:
  - *"Show me denied schools in California for 2024"*
  - *"What's the total C2 budget for my Texas schools?"*
  - *"List all pending Form 471 applications"*

---

### 🏢 Vendor Portal

#### SPIN Validation & Profile
- Validate your Service Provider Identification Number (SPIN)
- Automatic profile creation with company details
- Track your E-Rate history and performance

#### Form 470 Lead Generation
- **Track Form 470 postings by manufacturer**:
  - Cisco, Fortinet, Aruba, Meraki, Juniper, Palo Alto, and more
- Filter by state, category, and posting date
- View full RFP descriptions and requirements
- **Response deadline tracking** with countdown timers

#### FRN Status Tracking
- Real-time FRN status from USAC
- Track funding requests across all your clients
- Status history and decision tracking
- Filter by status, funding year, and amount

#### Competitor Analysis
- **Compare your performance** against competitors by SPIN
- Win rate analysis
- Market share visualization
- Response time benchmarking

#### Market Intelligence Dashboard
- Total market opportunity by state and category
- Your market share vs. competitors
- Trend analysis over funding years
- High-value opportunity identification

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **Backend** | FastAPI, Python 3.12, SQLAlchemy |
| **Database** | SQLite (dev) / PostgreSQL (prod) |
| **State Management** | Zustand |
| **AI/ML** | Advanced AI models, Custom prompts for E-Rate |
| **Data Source** | USAC Open Data Portal (Socrata API) |
| **Authentication** | Custom JWT with bcrypt |

---

## 📁 Project Structure

```
skyrate/
├── frontend/                 # Next.js 14 application
│   ├── app/                  
│   │   ├── page.tsx          # SEO-optimized landing page
│   │   ├── consultant/       # Consultant portal dashboard
│   │   ├── vendor/           # Vendor portal dashboard
│   │   ├── sign-in/          # Authentication
│   │   └── sign-up/          # Registration with role selection
│   ├── components/           
│   │   ├── AppealChat.tsx    # AI appeal generation interface
│   │   └── SearchResultsTable.tsx
│   └── lib/                  
│       ├── api.ts            # API client
│       └── auth-store.ts     # Zustand auth store
│
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── api/v1/           # API endpoints
│   │   │   ├── auth.py       # Authentication (register, login)
│   │   │   ├── consultant.py # Dashboard, schools, CRN, appeals
│   │   │   ├── vendor.py     # SPIN, Form 470, FRN, competitors
│   │   │   ├── schools.py    # School enrichment
│   │   │   ├── appeals.py    # AI appeal generation
│   │   │   └── query.py      # Natural language search
│   │   ├── models/           # SQLAlchemy models
│   │   ├── services/         # Business logic
│   │   │   ├── ai_service.py      # AI model integration
│   │   │   ├── usac_service.py    # USAC API client
│   │   │   ├── denial_service.py  # Denial analysis
│   │   │   └── appeals_service.py # Appeal generation
│   │   └── core/             # Config, database, security
│   └── requirements.txt
│
└── docs/                     # Documentation
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (v20 recommended)
- Python 3.11+
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/orelmeister/skyrate.git
cd skyrate
```

### 2. Backend Setup
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

# Create .env file
echo "SECRET_KEY=your-secret-key-here" > .env
echo "AI_API_KEY=your-ai-api-key" >> .env

# Run the server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Create environment file
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Run development server
npm run dev
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

---

## 🎮 Demo Access

### Demo Accounts
Use these credentials to test the application:

| Role | Email | Password |
|------|-------|----------|
| **Consultant** | test_consultant@example.com | TestPass123! |
| **Vendor** | test_vendor@example.com | TestPass123! |

> ⚠️ **Note**: These demo accounts are for testing only. Credentials will be removed for production deployment.

---

## 📝 Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)
```env
SECRET_KEY=your-secret-key-here
AI_API_KEY=your-ai-api-key
DATABASE_URL=sqlite:///./skyrate.db  # Optional, defaults to SQLite
USAC_API_TOKEN=optional-for-higher-rate-limits
```

---

## 📚 API Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/register` | POST | Register new user (consultant/vendor) |
| `/api/v1/auth/login` | POST | Login with email/password |
| `/api/v1/auth/me` | GET | Get current user profile |

### Consultant Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/consultant/dashboard-stats` | GET | Get dashboard statistics |
| `/api/v1/consultant/crn/verify` | POST | Verify CRN and preview schools |
| `/api/v1/consultant/crn/import` | POST | Import schools from CRN |
| `/api/v1/consultant/schools` | GET | List consultant's schools |
| `/api/v1/consultant/schools` | POST | Add school to portfolio |
| `/api/v1/consultant/schools/{ben}` | DELETE | Remove school |
| `/api/v1/consultant/schools/{ben}/budget` | GET | Get C2 budget data |
| `/api/v1/consultant/schools/{ben}/comprehensive` | GET | Get comprehensive funding data |
| `/api/v1/consultant/search/institutions` | GET | Search any US institution |
| `/api/v1/consultant/denials` | GET | Get denials for portfolio |
| `/api/v1/consultant/denials/{id}/analyze` | POST | AI analysis of denial |

### Vendor Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/vendor/profile` | GET | Get vendor profile |
| `/api/v1/vendor/spin/validate` | POST | Validate SPIN |
| `/api/v1/vendor/form470/leads` | GET | Get Form 470 leads by manufacturer |
| `/api/v1/vendor/frn/status` | GET | Get FRN status for SPIN |
| `/api/v1/vendor/competitors/analyze` | GET | Competitor analysis |
| `/api/v1/vendor/market-intelligence` | GET | Market intelligence data |

### AI & Search
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/query` | POST | Natural language search |
| `/api/v1/appeals/generate` | POST | Generate AI appeal letter |
| `/api/v1/appeals/chat` | POST | Interactive appeal chat |

### Data Enrichment
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/schools/search` | GET | Search USAC schools |
| `/api/v1/schools/enrich/{ben}` | GET | Get enriched school data |

---

## 🔗 USAC Data Sources

SkyRate AI integrates with official USAC Open Data APIs:

| Dataset | ID | Description |
|---------|-------|-------------|
| Form 471 Applications | `srbr-2d59` | Funding requests and status |
| C2 Budget Tool | `6brt-5pbv` | Category 2 budget data |
| Form 470 | `ajh7-s7bh` | Competitive bidding posts |
| FRN Status | `qdmp-ygft` | Funding request decisions |

---

## 💰 Pricing

| Plan | Price | Best For |
|------|-------|----------|
| **Consultant** | $300/month or $3,000/year | E-Rate consultants managing school portfolios |
| **Vendor** | $200/month or $2,000/year | E-Rate vendors tracking leads and competitors |

✅ **14-day free trial** included with all plans

---

## 🔒 Security

- **JWT Authentication** with bcrypt password hashing
- **SSL/TLS** encryption in transit
- **FERPA-ready** data handling practices
- **No data sharing** - your client data is never sold

---

## 🗺️ Roadmap

- [x] Consultant portal with CRN verification
- [x] AI-powered appeal generation
- [x] Vendor portal with Form 470 leads
- [x] Competitor analysis
- [x] Comprehensive budget display
- [x] National institution search
- [ ] Email alerts for Form 470 postings
- [ ] Automated USAC status polling
- [ ] Mobile app
- [ ] Team collaboration features

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **Email**: support@skyrate.ai
- **Documentation**: https://skyrate.ai/docs
- **Issues**: [GitHub Issues](https://github.com/orelmeister/skyrate/issues)

---

<p align="center">
  <strong>Built with ❤️ for the E-Rate community</strong><br/>
  <a href="https://skyrate.ai">skyrate.ai</a>
</p>