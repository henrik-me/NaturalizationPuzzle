<#
.SYNOPSIS
    Builds the production Docker image, runs it, and executes the full Playwright
    suite against the running container (PLAYWRIGHT_BASE_URL=http://localhost:<port>).

.DESCRIPTION
    Pre-push reproducer for Docker-context-only bugs that the dev-stack E2E
    cannot catch (e.g., missing-from-build-context embedded resources — see
    PR #81 silent-empty-stories incident). Exit code 0 = success, non-zero =
    failure. Suitable for local pre-push verification.

.EXAMPLE
    .\scripts\container-e2e.ps1
    .\scripts\container-e2e.ps1 -SkipBuild
    .\scripts\container-e2e.ps1 -PlaywrightArgs @("--grep","offline")
#>

param(
    [string]$ImageName = "natpuzzle",
    [string]$ImageTag = "local",
    # Mirror the bash script's `require_positive_int` / port-range validation
    # so non-integer or out-of-range values are rejected up-front with a clear
    # PowerShell parameter-binding error instead of failing later in the
    # docker port-mapping or HTTP loop.
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,
    [ValidateRange(1, [int]::MaxValue)]
    [int]$HealthTimeoutSeconds = 60,
    [switch]$SkipBuild,
    [string[]]$PlaywrightArgs = @()
)

$ErrorActionPreference = "Stop"
$containerName = "natpuzzle-e2e"
$image = "${ImageName}:${ImageTag}"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pushed = $false

function Write-Step($message) {
    Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Stop-E2EContainer {
    docker rm -f $containerName 2>$null | Out-Null
}

# Prereq check — fail fast with a clear message rather than mid-script with a
# confusing error. docker is required for the container build/run; node/npm/npx
# are required for the Playwright bootstrap and test execution.
$missing = @()
foreach ($tool in @("docker", "node", "npm", "npx")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        $missing += $tool
    }
}
if ($missing.Count -gt 0) {
    Write-Host "ERROR: required tool(s) not found in PATH: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  Install hints:" -ForegroundColor Red
    Write-Host "    docker:        https://docs.docker.com/get-docker/" -ForegroundColor Red
    Write-Host "    node/npm/npx:  install Node.js 22+ from https://nodejs.org/ (bundles npm/npx)" -ForegroundColor Red
    exit 1
}

try {
    Write-Step "Stopping any prior '$containerName' container"
    Stop-E2EContainer

    if (-not $SkipBuild) {
        Write-Step "Building Docker image: $image (context: $repoRoot)"
        docker build -t $image "$repoRoot"
        if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }
    }
    else {
        Write-Step "Skipping build (-SkipBuild); reusing existing image $image"
    }

    Write-Step "Starting container: $containerName on port $Port"
    docker run -d --name $containerName -p "${Port}:8080" `
        -e "ASPNETCORE_ENVIRONMENT=Production" `
        $image
    if ($LASTEXITCODE -ne 0) { throw "Docker run failed" }

    Write-Step "Waiting for health endpoint (timeout: ${HealthTimeoutSeconds}s)"
    $elapsed = 0
    $healthy = $false
    $response = $null

    while ($elapsed -lt $HealthTimeoutSeconds) {
        Start-Sleep -Seconds 2
        $elapsed += 2

        try {
            $response = Invoke-RestMethod -Uri "http://localhost:${Port}/api/health" `
                -TimeoutSec 5 -ErrorAction Stop
            if ($response.status -eq "healthy" -and $response.database -eq $true -and $response.questionCount -gt 0) {
                $healthy = $true
                break
            }
        }
        catch {
            Write-Host "  Waiting... (${elapsed}s)" -ForegroundColor DarkGray
        }
    }

    if (-not $healthy) {
        Write-Host "`nContainer logs:" -ForegroundColor Yellow
        docker logs $containerName
        throw "Health check failed after ${HealthTimeoutSeconds}s"
    }

    Write-Step "Health check passed!"
    Write-Host "  Status:         $($response.status)" -ForegroundColor Green
    Write-Host "  Database:       $($response.database)" -ForegroundColor Green
    Write-Host "  Question count: $($response.questionCount)" -ForegroundColor Green

    Write-Step "Bootstrapping Playwright in tests/e2e"
    Push-Location (Join-Path $repoRoot (Join-Path 'tests' 'e2e'))
    $pushed = $true

    # Always run `npm ci` for a reproducible install matching package-lock.json.
    # Skipping when node_modules exists can mask stale-deps regressions, which
    # defeats the point of a pre-push reproducer.
    Write-Host "  Installing tests/e2e dependencies (npm ci)..." -ForegroundColor DarkGray
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci in tests/e2e failed" }

    Write-Host "  Ensuring Chromium browser is installed..." -ForegroundColor DarkGray
    # On Linux, install Chromium's system dependencies too (mirrors the bash
    # script's branch and matches CI's `playwright install --with-deps chromium`
    # in ci-cd.yml). $IsLinux is a PowerShell Core automatic variable, defined
    # only on pwsh 6+ — Windows PowerShell 5.1 doesn't run on Linux, so it being
    # $null there is fine and correctly takes the else branch.
    if ($IsLinux) {
        npx playwright install --with-deps chromium
    }
    else {
        npx playwright install chromium
    }
    if ($LASTEXITCODE -ne 0) { throw "playwright install chromium failed" }

    Write-Step "Running Playwright suite against http://localhost:${Port}"
    $env:PLAYWRIGHT_BASE_URL = "http://localhost:${Port}"
    npx playwright test --reporter=list @PlaywrightArgs
    $playwrightExit = $LASTEXITCODE

    if ($playwrightExit -ne 0) {
        Write-Host "`nPlaywright failed (exit $playwrightExit). Last 200 lines of container logs:" -ForegroundColor Yellow
        docker logs --tail 200 $containerName
        throw "Playwright suite failed with exit code $playwrightExit"
    }

    Write-Host "`n✅ Container E2E passed!" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n❌ Container E2E failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    if ($pushed) { Pop-Location }
    Write-Step "Cleaning up container"
    Stop-E2EContainer
}
