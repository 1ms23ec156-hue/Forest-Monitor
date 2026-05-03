@echo off
REM VanRakshak Python agent launcher (Windows).
REM First run will create a venv and install requirements.

cd /d %~dp0

if not exist .venv (
    echo [setup] Creating virtual env...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    echo [setup] Installing requirements...
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

REM No local .env needed: the agent reads ..\.env from the project root.
REM Create python_agent\.env only if you want to override values for the agent.

echo.
echo [run] Starting VanRakshak Graph Agent on http://127.0.0.1:8000
echo.
uvicorn app:app --host 0.0.0.0 --port 8000
