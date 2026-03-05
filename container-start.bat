@echo off
REM Builds and starts the Docker container, then runs health checks.
REM If the container is already running, prompts for rebuild or just runs checks.
REM The container stays running for manual testing at http://localhost:8080

setlocal enabledelayedexpansion
set IMAGE=natpuzzle:local
set CONTAINER=natpuzzle-app
set PORT=8080
set TIMEOUT=60

REM Check if container is already running
docker inspect --format "{{.State.Running}}" %CONTAINER% >nul 2>&1
if errorlevel 1 goto build

REM Container exists — check if it's running
for /f %%i in ('docker inspect --format "{{.State.Running}}" %CONTAINER% 2^>nul') do set RUNNING=%%i
if not "%RUNNING%"=="true" goto build

echo.
echo Container %CONTAINER% is already running on port %PORT%.
echo.
set /p REBUILD="Rebuild and restart? [y/N] "
if /i "!REBUILD!"=="y" goto build
goto healthcheck

:build
echo.
echo ==^> Building Docker image: %IMAGE%
docker build -t %IMAGE% .
if errorlevel 1 (
    echo.
    echo ERROR: Docker build failed
    exit /b 1
)

echo.
echo ==^> Stopping any existing container
docker rm -f %CONTAINER% >nul 2>&1

echo.
echo ==^> Starting container: %CONTAINER% on port %PORT%
docker run -d --name %CONTAINER% -p %PORT%:8080 ^
    -e "ASPNETCORE_ENVIRONMENT=Production" ^
    -e "ConnectionStrings__DefaultConnection=Data Source=/data/naturalization.db" ^
    -v natpuzzle-data:/data ^
    %IMAGE%
if errorlevel 1 (
    echo.
    echo ERROR: Docker run failed
    exit /b 1
)

:healthcheck
echo.
echo ==^> Waiting for health endpoint (timeout: %TIMEOUT%s)
set /a ELAPSED=0

:healthloop
if !ELAPSED! geq %TIMEOUT% goto healthfail
timeout /t 2 /nobreak >nul
set /a ELAPSED+=2
curl -sf http://localhost:%PORT%/api/health >nul 2>&1
if not errorlevel 1 goto healthpassed
echo     Waiting... [!ELAPSED!s]
goto healthloop

:healthpassed
echo.
echo ==^> Health check passed!
curl -s http://localhost:%PORT%/api/health
echo.

REM Smoke test — static files
echo.
echo ==^> Verifying static file serving
curl -sf -o nul -w "  HTTP status: %%{http_code}" http://localhost:%PORT%/
echo.
if errorlevel 1 (
    echo   WARNING: Static files not responding
) else (
    echo   Static files: OK
)

echo.
echo Container is running at http://localhost:%PORT%
echo Use container-stop.bat to stop it.
exit /b 0

:healthfail
echo.
echo ERROR: Health check failed after %TIMEOUT%s
echo.
echo Container logs:
docker logs %CONTAINER%
docker rm -f %CONTAINER% >nul 2>&1
exit /b 1
