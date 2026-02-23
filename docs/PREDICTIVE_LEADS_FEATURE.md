# Feature: Predictive Lead Intelligence for Vendors

> **Status:** PLANNED  
> **Priority:** HIGH — Unique differentiator, high vendor willingness-to-pay  
> **Target Users:** Vendors (ISPs, equipment providers, managed service providers)

---

## The Insight

By the time a school files **Form 470** (request for proposals), it's already competitive bidding — every vendor sees it simultaneously. But what if a vendor knew a school was *going to need* new equipment or services **months before** they file?

Using historical USAC data (Form 471 filings from previous years), we can predict:

1. **Contract Renewals** — Multi-year service contracts (ISP, managed Wi-Fi) that are expiring
2. **Equipment Aging** — Category 2 equipment purchases (switches, APs, UPS, cabling) that are reaching end-of-life
3. **License Expirations** — Software/service licenses purchased 1-3 years ago
4. **Rebid Requirements** — Schools whose competitive bidding window is closing
5. **Budget Cycle Signals** — Schools whose C2 budget is refreshing (5-year cycle)

## Why This Matters

- Schools **must** competitively bid via Form 470 — that's the law
- But vendors are **free to reach out anytime** — relationship building is legal and expected
- Human psychology: a vendor who's already demonstrated expertise and built rapport has a significant competitive edge when bids are evaluated
- The vendor isn't doing anything wrong — they're doing **market research** using public data, just like any business

## Competitive Advantage for SkyRate

- **No one else does this** in the E-Rate space
- Moves vendors from reactive (wait for 470) to proactive (predict and pre-position)
- Justifies premium pricing — this is genuine sales intelligence
- Creates vendor lock-in — once they see predicted leads converting, they won't leave

---

## Data Sources (All Public via USAC/Socrata API)

### Form 471 Historical Data
- `funding_year` — When the service/equipment was funded
- `service_type` — Internet, Voice, Internal Connections, Managed Wi-Fi, etc.
- `contract_expiration_date` — When the current contract ends
- `narrative` — Free text describing what was purchased
- `frn_status` — Was it funded? (only predict renewals for funded items)
- `total_funding_commitment` — Size of the deal

### Form 470 Historical Data
- `form470_number` — Track which schools filed 470s in which years
- `category_of_service` — C1 (Internet/Voice) vs C2 (Equipment/Internal Connections)
- `service_description` — What they were looking for

### Entity Data
- `ben` — Billed Entity Number (unique school/library ID)
- `entity_type` — School, Library, School District, Consortium
- `state`, `city`, `zip` — Geography for territory-based vendors

---

## Prediction Logic

### 1. Contract Expiration Predictor
```
IF a school had a Form 471 funded in Year X
AND the contract_expiration_date is within the next 12 months
AND the service_type matches the vendor's specialty
THEN → "This school's [ISP/managed Wi-Fi/etc.] contract expires [month/year]"
```

### 2. Equipment Replacement Predictor
```
IF a school purchased C2 equipment in Year X
AND that was 4-5 years ago (typical refresh cycle)
AND the equipment type matches (switches, APs, firewalls, UPS)
THEN → "This school's [equipment] was purchased [X] years ago — likely due for refresh"
```

### 3. C2 Budget Refresh Predictor
```
IF a school's Category 2 budget 5-year window is resetting
AND they historically spend their C2 budget
THEN → "This school's C2 budget refreshes in [year] — they'll have $[amount] to spend"
```

### 4. Rebid Signal Detector
```
IF a school had a multi-year contract (3-5 years)
AND it's the final year of that contract
AND they haven't filed a new Form 470 yet
THEN → "This school will need to rebid [service type] — no Form 470 filed yet"
```

### 5. Growth/Expansion Predictor
```
IF a school's enrollment is growing (cross-reference NCES data)
AND their current bandwidth/equipment may be undersized
THEN → "This school may need to upgrade capacity"
```

---

## MVP Implementation Plan

### Phase 1: Contract Expiration Alerts
- Query USAC API for all funded Form 471s with contract expiration dates
- Filter by vendor's service category and geographic territory
- Show as a timeline: "Expiring in 30/60/90/180 days"
- **Data needed:** Form 471 detailed data with contract dates

### Phase 2: Equipment Age Analysis
- Track C2 purchases by entity over time
- Flag equipment that's 4+ years old (approaching useful life end)
- Categorize by equipment type (networking, wireless, telephony, etc.)
- **Data needed:** Form 471 line items with product descriptions

### Phase 3: Pre-470 Intelligence Dashboard
- Combine contract expiration + equipment age + budget refresh
- Score leads by "likelihood to file Form 470 in next 6 months"
- Enable vendor to filter by geography, equipment type, deal size
- Add "Reach Out" button that generates personalized outreach templates

### Phase 4: AI-Powered Analysis
- Use AI to parse Form 471 narratives and extract product/vendor info
- Identify which specific vendor currently serves each school
- Generate competitive displacement strategies
- "School X currently uses [Competitor] for managed Wi-Fi — their contract expires in [month]"

---

## UI Concept (Vendor Dashboard)

```
┌─────────────────────────────────────────────────────────┐
│  🔮 Predicted Leads                                     │
│                                                         │
│  ┌─── Expiring in 30 Days ──────────────────────────┐  │
│  │ Lincoln Elementary (TX) — ISP contract expires    │  │
│  │ $45,000/yr | Current: Spectrum | 📧 Reach Out    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─── Equipment Due for Refresh ────────────────────┐  │
│  │ Jefferson Middle School (CA) — Cisco APs (2021)  │  │
│  │ 47 APs funded $62,000 | 5 years old | 📧 Reach  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─── C2 Budget Refreshing ─────────────────────────┐  │
│  │ Oakwood School District (FL) — Budget resets 2027│  │
│  │ Estimated C2 budget: $350,000 | 📧 Reach Out    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Filter: [Geography ▼] [Service Type ▼] [Timeline ▼]  │
└─────────────────────────────────────────────────────────┘
```

---

## Pricing Impact

This feature alone could justify a **premium vendor tier**:

| Tier | Price | Features |
|------|-------|----------|
| Vendor Basic | $199/mo | Form 470 lead alerts (current) |
| Vendor Pro | $399/mo | + Predictive leads + AI outreach templates |
| Vendor Enterprise | $799/mo | + Competitive displacement + Territory exclusivity |

---

## Technical Requirements

### Backend
- New service: `prediction_service.py`
- New API endpoints: `GET /api/v1/vendor/predicted-leads`
- USAC data fetch: Form 471 historical with contract dates
- Caching: Predictions don't change daily — cache for 24h
- AI: Parse Form 471 narratives to extract vendor/product info

### Frontend
- New vendor dashboard tab: "Predicted Leads" or "🔮 Intelligence"
- Timeline view for expiring contracts
- Filter/sort by geography, service type, expiration date, deal size
- "Reach Out" action with AI-generated email draft

### Data Pipeline
- Scheduled job: Refresh predictions weekly
- Cross-reference Form 470/471 data across multiple funding years
- Build entity profile: What did they buy, when, from whom, how much

---

## Key Messaging for Vendors

> "Stop waiting for Form 470s. Know which schools need your services before they even start the bidding process. Build relationships early and win more E-Rate business."

> "Our AI analyzes millions of historical E-Rate records to predict which schools will need new equipment, renew contracts, or refresh their budgets — and tells you months in advance."
