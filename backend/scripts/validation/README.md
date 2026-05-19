# Compliance Validation Harness

A 3-stage calibration pipeline that tests the SkyRate compliance scanner against
real Form 470 records filed by CRM customers.

**This is a calibration/validation tool, NOT a training set.**

## Prerequisites

- Python 3.11+
- Environment variables set (see `.env.example`)
- The CRM admin endpoint must return `form470_records` (see below)
- Backend server running locally for Stage 2 (or use direct import mode)

## 3-Stage Flow

### Stage 1: Build Corpus (one-time, re-run quarterly)

```bash
cd backend/
python -m scripts.validation.build_validation_corpus [--limit N] [--out PATH]
```

Fetches Form 470 filing metadata from the CRM, enriches each with USAC Open Data
narrative text, anonymizes entity identifiers, and writes one JSON per record to
`data/validation/form470_corpus/`.

### Stage 2: Run Evaluation (re-run after every pipeline change)

```bash
cd backend/
python -m scripts.validation.run_compliance_eval [--limit N] [--in PATH] [--out PATH]
```

Feeds each corpus narrative through the compliance analyzer and captures the full
structured output (rule findings, LLM findings, risk level).

### Stage 3: Generate Report (open the HTML)

```bash
cd backend/
python -m scripts.validation.validation_report [--in PATH] [--out PATH]
```

Computes fire rates, confidence distributions, severity breakdowns, and generates
a self-contained `data/validation/report.html`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ERATEAPP_ADMIN_EMAIL` | Yes (Stage 1) | Admin email for app.erateapp.com |
| `ERATEAPP_ADMIN_PASSWORD` | Yes (Stage 1) | Admin password |
| `USAC_APP_TOKEN` | No | Socrata app token (improves rate limits) |
| `VALIDATION_SALT` | Recommended | Stable salt for entity anonymization |
| `COMPLIANCE_API_URL` | No | Default: `http://localhost:8000` |

## CRM Endpoint Prerequisite

Stage 1 expects the admin endpoint at:
```
GET https://app.erateapp.com/api/v1/admin_compliance_corpus_stats
```

To return a `form470_records` array with shape:
```json
[
  {
    "entity_id": "123",
    "form470_number": "261042134",
    "form470_status": "Certified",
    "form470_posting_date": "2026-01-15",
    "form470_certified_date": "2026-02-20",
    "funding_year": 2026
  }
]
```

## Output Location

All output is written to `data/validation/` which is gitignored (contains
customer-derived data even after anonymization).
