#!/usr/bin/env python
"""Simple script to start the FastAPI server."""
import os
import sys

# Change to backend directory
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))
sys.path.insert(0, os.getcwd())

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)
