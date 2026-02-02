"""
Simple health check app for diagnosing startup issues.
Replace main.py temporarily to test if basic FastAPI works.
"""

from fastapi import FastAPI
import os

app = FastAPI(title="SkyRate Health Check")

@app.get("/")
def root():
    return {"status": "ok", "environment": os.environ.get("ENVIRONMENT", "unknown")}

@app.get("/api")
def api_root():
    return {"status": "ok", "message": "API is working"}

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "env_vars": {
            "ENVIRONMENT": os.environ.get("ENVIRONMENT"),
            "DATABASE_URL": "set" if os.environ.get("DATABASE_URL") else "not set",
            "SECRET_KEY": "set" if os.environ.get("SECRET_KEY") else "not set",
        }
    }
