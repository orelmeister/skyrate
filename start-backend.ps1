# SkyRate AI - Local Backend Startup Script (Windows)
# Run from skyrate-ai-v2 directory: .\start-backend.ps1

Write-Host "========================================"
Write-Host "  SkyRate AI Backend - Local Dev Mode"
Write-Host "========================================"

# Check if .env exists
if (-not (Test-Path "backend\.env")) {
    Write-Host "⚠️  No .env file found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "📝 Please edit backend\.env with your API keys" -ForegroundColor Yellow
}

# Check for virtual environment
if (-not (Test-Path "venv")) {
    Write-Host "📦 Creating virtual environment..." -ForegroundColor Cyan
    python -m venv venv
}

# Activate venv
Write-Host "🔌 Activating virtual environment..." -ForegroundColor Cyan
.\venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "📥 Installing dependencies..." -ForegroundColor Cyan
pip install -r backend\requirements.txt

# Start backend
Write-Host ""
Write-Host "🚀 Starting FastAPI backend..." -ForegroundColor Green
Write-Host "📍 API URL: http://localhost:8000" -ForegroundColor White
Write-Host "📚 API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "📖 ReDoc: http://localhost:8000/redoc" -ForegroundColor White
Write-Host ""

Set-Location backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
