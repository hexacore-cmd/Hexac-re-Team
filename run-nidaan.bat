@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Starting PostgreSQL...
docker compose up -d
if errorlevel 1 goto :error

echo [2/3] Installing dependencies if needed...
if not exist "node_modules" npm install

echo [3/3] Starting frontend + backend...
npm run dev
exit /b 0

:error
echo.
echo Docker failed to start. Make sure Docker Desktop is running.
pause
exit /b 1
