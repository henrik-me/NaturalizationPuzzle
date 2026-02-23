@echo off
setlocal

echo ============================================
echo  NaturalizationPuzzle — Starting Application
echo ============================================
echo.

set API_DIR=%~dp0src\api
set CLIENT_DIR=%~dp0src\client
set API_PORT=5099
set CLIENT_PORT=5173
set CLIENT_URL=http://localhost:%CLIENT_PORT%

:: Check prerequisites
where dotnet >nul 2>&1
if errorlevel 1 (
    echo [ERROR] .NET SDK not found. Install it from https://dotnet.microsoft.com/download
    pause
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org/
    pause
    exit /b 1
)

:: Start the backend API
echo [1/3] Starting backend API on port %API_PORT%...
start "NatPuzzle API" /D "%API_DIR%" cmd /c "dotnet run"

:: Start the frontend dev server
echo [2/3] Starting frontend dev server on port %CLIENT_PORT%...
start "NatPuzzle Client" /D "%CLIENT_DIR%" cmd /c "npm run dev"

:: Wait for the frontend to be ready, then open browser
echo [3/3] Waiting for frontend to be ready...
set /a ATTEMPTS=0
:wait_loop
if %ATTEMPTS% geq 30 (
    echo [WARN] Timed out waiting for frontend. Open %CLIENT_URL% manually.
    goto :done
)
timeout /t 1 /nobreak >nul
set /a ATTEMPTS+=1
curl -s -o nul -w "" %CLIENT_URL% >nul 2>&1
if errorlevel 1 goto :wait_loop

echo.
echo  Frontend is ready! Opening browser...
start "" "%CLIENT_URL%"

:done
echo.
echo ============================================
echo  App running at: %CLIENT_URL%
echo  API running at: http://localhost:%API_PORT%
echo.
echo  Close the "NatPuzzle API" and "NatPuzzle Client"
echo  console windows to stop the servers.
echo ============================================
