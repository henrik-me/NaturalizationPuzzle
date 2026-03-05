@echo off
REM Stops the Docker container and verifies it is no longer running.

setlocal
set CONTAINER=natpuzzle-app

echo.
echo ==^> Stopping container: %CONTAINER%
docker stop %CONTAINER% >nul 2>&1
docker rm -f %CONTAINER% >nul 2>&1

REM Verify the container is gone
docker inspect %CONTAINER% >nul 2>&1
if errorlevel 1 (
    echo.
    echo Container stopped and removed.
) else (
    echo.
    echo ERROR: Container %CONTAINER% is still running!
    docker ps --filter "name=%CONTAINER%" --format "table {{.ID}}\t{{.Status}}\t{{.Ports}}"
    exit /b 1
)

REM Show that nothing is listening on port 8080
echo.
echo ==^> Verifying port 8080 is free
curl -sf http://localhost:8080/api/health >nul 2>&1
if errorlevel 1 (
    echo   Port 8080: free
) else (
    echo   WARNING: Something is still listening on port 8080
)

echo.
echo Done.
exit /b 0
