#!/bin/bash
# SkyRate AI - Local Backend Startup Script (Linux/Mac)

echo "========================================"
echo "  SkyRate AI Backend - Local Dev Mode"
echo "========================================"

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo "⚠️  No .env file found. Copying from .env.example..."
    cp backend/.env.example backend/.env
    echo "📝 Please edit backend/.env with your API keys"
fi

# Check for virtual environment
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r backend/requirements.txt

# Start backend
echo "🚀 Starting FastAPI backend on http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""

cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
