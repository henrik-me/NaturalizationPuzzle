<#
.SYNOPSIS
    Validates the Docker container build by building the image, starting it,
    running a health check, and stopping it.
.DESCRIPTION
    Exit code 0 = success, non-zero = failure. Suitable for CI pipelines.
#>

param(
    [string]$ImageName = "natpuzzle",
    [string]$ImageTag = "local",
    [int]$Port = 8080,
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$containerName = "natpuzzle-validation"
$image = "${ImageName}:${ImageTag}"

function Write-Step($message) {
    Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Stop-ValidationContainer {
    docker rm -f $containerName 2>$null | Out-Null
}

try {
    # Clean up any previous validation container
    Stop-ValidationContainer

    # Build
    Write-Step "Building Docker image: $image"
    docker build -t $image .
    if ($LASTEXITCODE -ne 0) { throw "Docker build failed" }

    # Start
    Write-Step "Starting container: $containerName on port $Port"
    docker run -d --name $containerName -p "${Port}:8080" `
        -e "ASPNETCORE_ENVIRONMENT=Production" `
        $image
    if ($LASTEXITCODE -ne 0) { throw "Docker run failed" }

    # Wait for healthy
    Write-Step "Waiting for health endpoint (timeout: ${TimeoutSeconds}s)"
    $elapsed = 0
    $healthy = $false

    while ($elapsed -lt $TimeoutSeconds) {
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
        throw "Health check failed after ${TimeoutSeconds}s"
    }

    # Report results
    Write-Step "Health check passed!"
    Write-Host "  Status:         $($response.status)" -ForegroundColor Green
    Write-Host "  Database:       $($response.database)" -ForegroundColor Green
    Write-Host "  Question count: $($response.questionCount)" -ForegroundColor Green

    # Quick smoke test — verify static files are served
    Write-Step "Verifying static file serving"
    $htmlResponse = Invoke-WebRequest -Uri "http://localhost:${Port}/" -UseBasicParsing -TimeoutSec 5
    if ($htmlResponse.StatusCode -eq 200 -and $htmlResponse.Content -match "index.html|<!DOCTYPE") {
        Write-Host "  Static files: OK" -ForegroundColor Green
    }
    else {
        Write-Host "  Static files: WARNING - unexpected response" -ForegroundColor Yellow
    }

    Write-Host "`n✅ Container validation passed!" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n❌ Container validation failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Write-Step "Cleaning up"
    Stop-ValidationContainer
}
