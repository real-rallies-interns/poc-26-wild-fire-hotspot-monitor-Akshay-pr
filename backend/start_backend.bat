@echo off
:: ── Wildfire Hotspot Monitor — Backend Startup ───────────────────────────────
:: Runs the FastAPI server via uvicorn on port 8000 with hot-reload.
:: Usage: start_backend.bat

echo.
echo  Wildfire Hotspot Monitor — FastAPI Backend
echo  ==========================================
echo  Starting on http://localhost:8000
echo  API docs: http://localhost:8000/docs
echo  Press Ctrl+C to stop.
echo.

cd /d "%~dp0"

:: Load .env if present
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
    )
)

python -m uvicorn main:app --host 0.0.0.0 --port %BACKEND_PORT% --reload
