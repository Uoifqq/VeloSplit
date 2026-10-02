@echo off
cd /d "%~dp0..\frontend"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 24 (
  echo Node.js 24 or newer is required. Current major version: %NODE_MAJOR%
  pause
  exit /b 1
)
if not exist "node_modules\next\package.json" (
  echo Installing VeloSplit dependencies...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Starting VeloSplit. Open http://localhost:3000
call npm run dev -- --hostname 0.0.0.0
pause
