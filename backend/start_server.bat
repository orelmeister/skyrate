@echo off
REM Start SkyRate AI Backend
cd /d "%~dp0"
echo Starting SkyRate AI Backend...
echo API Docs: http://localhost:8001/docs
echo.
"C:\Users\orelm\OneDrive\Documents\GitHub\erateapp.com\opendata\erate\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8001
pause
