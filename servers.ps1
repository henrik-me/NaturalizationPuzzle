#Requires -Version 5.1
<#
.SYNOPSIS
    Manages NaturalizationPuzzle development servers (API + Frontend).

.DESCRIPTION
    Start, stop, and monitor the .NET API and Vite frontend dev servers.

    Process state is persisted in .servers/*.json so services can be found
    even after the controlling terminal crashes. Services are also
    identifiable by their window title (NatPuzzle-API / NatPuzzle-Client)
    and by port-based discovery as a final fallback.

    Discovery order:
      1. State file PID  — fast, reliable when state is fresh
      2. Window title    — finds titled cmd.exe wrappers
      3. Port listener   — finds any process on the expected port

.PARAMETER Action
    start  - Launch services (skips if already running).
    stop   - Stop services and clean up state files.
    status - Show current status of all services.

.PARAMETER Service
    all (default), api, or client.

.PARAMETER NoBrowser
    Start only: do not open the browser after launch.

.EXAMPLE
    .\servers.ps1 start                 # Start everything + open browser
    .\servers.ps1 start -Service api    # Start only the API
    .\servers.ps1 start -NoBrowser      # Start without opening browser
    .\servers.ps1 stop                  # Stop all services
    .\servers.ps1 stop -Service client  # Stop only the frontend
    .\servers.ps1 status                # Show service status
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action,

    [ValidateSet('all', 'api', 'client')]
    [string]$Service = 'all',

    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Configuration ─────────────────────────────────────────────

$script:StateDir = Join-Path $PSScriptRoot '.servers'

$script:Services = [ordered]@{
    api    = @{
        DisplayName = 'API'
        Title       = 'NatPuzzle-API'
        Port        = 7075
        Command     = 'dotnet run --launch-profile https'
        WorkDir     = Join-Path $PSScriptRoot 'src\api'
    }
    client = @{
        DisplayName = 'Frontend'
        Title       = 'NatPuzzle-Client'
        Port        = 5173
        Command     = 'npm run dev'
        WorkDir     = Join-Path $PSScriptRoot 'src\client'
    }
}

# ── State File Helpers ────────────────────────────────────────

function Get-StatePath([string]$Name) {
    Join-Path $script:StateDir "$Name.json"
}

function Read-ServiceState([string]$Name) {
    $path = Get-StatePath $Name
    if (Test-Path $path) {
        return Get-Content $path -Raw | ConvertFrom-Json
    }
    $null
}

function Save-ServiceState([string]$Name, [hashtable]$Data) {
    if (-not (Test-Path $script:StateDir)) {
        New-Item -ItemType Directory -Path $script:StateDir -Force | Out-Null
    }
    $Data | ConvertTo-Json -Depth 3 |
        Set-Content (Get-StatePath $Name) -Encoding UTF8
}

function Remove-ServiceState([string]$Name) {
    $path = Get-StatePath $Name
    if (Test-Path $path) { Remove-Item $path -Force }
}

# ── Process Discovery ─────────────────────────────────────────

function Test-Pid([int]$Id) {
    try {
        $p = Get-Process -Id $Id -ErrorAction SilentlyContinue
        $null -ne $p -and -not $p.HasExited
    } catch { $false }
}

function Test-Port([int]$Port) {
    # Synchronous connect — TcpClient(hostname, port) resolves and tries
    # all addresses for 'localhost' (IPv4 127.0.0.1 and IPv6 ::1).
    # Connection refused returns immediately; open port connects instantly.
    try {
        $tcp = [System.Net.Sockets.TcpClient]::new('localhost', $Port)
        $tcp.Dispose()
        $true
    } catch {
        $false
    }
}

function Find-PidByPort([int]$Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen `
                    -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) { return $conn.OwningProcess }
    } catch { }
    # Fallback: parse netstat if Get-NetTCPConnection failed
    try {
        $line = netstat -ano 2>$null |
            Select-String "^\s+TCP\s+.*:$Port\s+.*LISTENING\s+(\d+)" |
            Select-Object -First 1
        if ($line) { return [int]$line.Matches[0].Groups[1].Value }
    } catch { }
    $null
}

function Find-Service([string]$Name) {
    $svc  = $script:Services[$Name]
    $info = [ordered]@{
        Found      = $false
        WrapperPid = $null
        ServicePid = $null
        Source      = $null
        PortOpen   = Test-Port $svc.Port
    }

    # Strategy 1 — state file
    $state = Read-ServiceState $Name
    if ($state) {
        $wOk = $state.wrapperPid -and (Test-Pid ([int]$state.wrapperPid))
        $sOk = $state.servicePid -and (Test-Pid ([int]$state.servicePid))
        if ($wOk -or $sOk) {
            $info.Found      = $true
            $info.WrapperPid = if ($wOk) { [int]$state.wrapperPid } else { $null }
            $info.ServicePid = if ($sOk) { [int]$state.servicePid } else { $null }
            $info.Source     = 'state file'
            return $info
        }
    }

    # Strategy 2 — window title
    $byTitle = Get-Process |
        Where-Object { $_.MainWindowTitle -eq $svc.Title } |
        Select-Object -First 1
    if ($byTitle) {
        $info.Found      = $true
        $info.WrapperPid = $byTitle.Id
        $info.Source     = 'window title'
        return $info
    }

    # Strategy 3 — port listener
    $byPort = Find-PidByPort $svc.Port
    if ($byPort) {
        $info.Found      = $true
        $info.ServicePid = $byPort
        $info.Source     = 'port listener'
        return $info
    }

    $info
}

# ── Actions ───────────────────────────────────────────────────

function Start-ServiceByName([string]$Name) {
    $svc = $script:Services[$Name]
    Write-Host "`n  [$($svc.DisplayName)] " -NoNewline -ForegroundColor Cyan

    $found = Find-Service $Name
    if ($found.Found) {
        $runPid = if ($found.ServicePid) { $found.ServicePid } else { $found.WrapperPid }
        Write-Host "already running (PID $runPid, via $($found.Source))" -ForegroundColor Green
        # Re-save state so it's current
        if ($found.Source -ne 'state file') {
            Save-ServiceState $Name @{
                service     = $Name
                wrapperPid  = $found.WrapperPid
                servicePid  = $found.ServicePid
                port        = $svc.Port
                title       = $svc.Title
                command     = $svc.Command
                workDir     = $svc.WorkDir
                startedAt   = (Get-Date -Format 'o')
                recoveredVia = $found.Source
            }
        }
        return $true
    }

    Write-Host "starting..." -ForegroundColor Yellow

    $cmdArgs = "/k title $($svc.Title) && cd /d `"$($svc.WorkDir)`" && $($svc.Command)"
    $proc = Start-Process cmd.exe -ArgumentList $cmdArgs -PassThru

    Save-ServiceState $Name @{
        service    = $Name
        wrapperPid = $proc.Id
        servicePid = $null
        port       = $svc.Port
        title      = $svc.Title
        command    = $svc.Command
        workDir    = $svc.WorkDir
        startedAt  = (Get-Date -Format 'o')
    }

    Write-Host "  [$($svc.DisplayName)] window PID $($proc.Id)  title: $($svc.Title)" `
        -ForegroundColor DarkGray

    # Wait for port to become available
    Write-Host "  [$($svc.DisplayName)] waiting for port $($svc.Port) " `
        -NoNewline -ForegroundColor Yellow
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        if (Test-Port $svc.Port) { $ready = $true; break }
        Write-Host '.' -NoNewline -ForegroundColor DarkGray
        Start-Sleep 1
    }
    Write-Host ''

    if ($ready) {
        # Resolve actual service PID and update state
        $servicePid = Find-PidByPort $svc.Port
        Save-ServiceState $Name @{
            service    = $Name
            wrapperPid = $proc.Id
            servicePid = $servicePid
            port       = $svc.Port
            title      = $svc.Title
            command    = $svc.Command
            workDir    = $svc.WorkDir
            startedAt  = (Read-ServiceState $Name).startedAt
        }
        Write-Host "  [$($svc.DisplayName)] ready on port $($svc.Port)" `
            -NoNewline -ForegroundColor Green
        if ($servicePid) {
            Write-Host " (service PID $servicePid)" -ForegroundColor Green
        } else {
            Write-Host '' 
        }
    } else {
        Write-Host "  [$($svc.DisplayName)] timed out waiting for port $($svc.Port)" `
            -ForegroundColor Red
    }

    $ready
}

function Stop-ServiceByName([string]$Name) {
    $svc = $script:Services[$Name]
    Write-Host "`n  [$($svc.DisplayName)] " -NoNewline -ForegroundColor Cyan

    $found = Find-Service $Name
    if (-not $found.Found) {
        Write-Host "not running" -ForegroundColor DarkGray
        Remove-ServiceState $Name
        return
    }

    Write-Host "stopping..." -ForegroundColor Yellow

    # Kill wrapper process tree (cmd.exe + children)
    if ($found.WrapperPid) {
        Write-Host "  [$($svc.DisplayName)] killing process tree (wrapper PID $($found.WrapperPid))" `
            -ForegroundColor DarkGray
        & taskkill /T /F /PID $found.WrapperPid 2>&1 | Out-Null
    }

    # Kill service process if still alive
    if ($found.ServicePid -and (Test-Pid $found.ServicePid)) {
        Write-Host "  [$($svc.DisplayName)] killing service (PID $($found.ServicePid))" `
            -ForegroundColor DarkGray
        Stop-Process -Id $found.ServicePid -Force -ErrorAction SilentlyContinue
    }

    # Wait for port to free
    for ($i = 0; $i -lt 10; $i++) {
        if (-not (Test-Port $svc.Port)) { break }
        Start-Sleep 1
    }

    Remove-ServiceState $Name

    if (Test-Port $svc.Port) {
        Write-Host "  [$($svc.DisplayName)] warning: port $($svc.Port) still in use" `
            -ForegroundColor Red
    } else {
        Write-Host "  [$($svc.DisplayName)] stopped" -ForegroundColor Green
    }
}

function Show-ServiceStatus([string]$Name) {
    $svc   = $script:Services[$Name]
    $found = Find-Service $Name
    $state = Read-ServiceState $Name

    Write-Host ''
    Write-Host "  $($svc.DisplayName)" -NoNewline -ForegroundColor White
    if ($found.Found) {
        Write-Host '  RUNNING' -ForegroundColor Green
    } else {
        Write-Host '  STOPPED' -ForegroundColor Red
    }

    $portColor = if ($found.PortOpen) { 'Green' } else { 'DarkGray' }
    $portLabel = if ($found.PortOpen) { '(listening)' } else { '(closed)' }
    Write-Host "    Port:    $($svc.Port) $portLabel" -ForegroundColor $portColor
    Write-Host "    Title:   $($svc.Title)" -ForegroundColor Gray

    $pids = @()
    if ($found.WrapperPid) { $pids += "wrapper=$($found.WrapperPid)" }
    if ($found.ServicePid) { $pids += "service=$($found.ServicePid)" }
    if ($pids) {
        Write-Host "    PIDs:    $($pids -join ', ')" -ForegroundColor Gray
    }
    if ($found.Found) {
        Write-Host "    Found:   $($found.Source)" -ForegroundColor DarkGray
    }
    if ($state -and $state.startedAt) {
        Write-Host "    Started: $($state.startedAt)" -ForegroundColor DarkGray
    }

    # Clean stale state
    if (-not $found.Found -and $state) {
        Remove-ServiceState $Name
        Write-Host '    (cleaned up stale state file)' -ForegroundColor DarkYellow
    }
}

# ── Main ──────────────────────────────────────────────────────

$targets = if ($Service -eq 'all') { @('api', 'client') } else { @($Service) }

Write-Host ''
Write-Host '  ============================================' -ForegroundColor White

switch ($Action) {
    'start' {
        Write-Host '   NaturalizationPuzzle — Start Servers' -ForegroundColor White
        Write-Host '  ============================================' -ForegroundColor White

        $ok = @{}
        foreach ($t in $targets) { $ok[$t] = Start-ServiceByName $t }

        Write-Host "`n  ────────────────────────────────────────────" -ForegroundColor DarkGray
        Write-Host "  API:      https://localhost:$($script:Services.api.Port)" -ForegroundColor White
        Write-Host "  Frontend: https://localhost:$($script:Services.client.Port)" -ForegroundColor White
        Write-Host "  State:    $script:StateDir\" -ForegroundColor DarkGray
        Write-Host '  ============================================' -ForegroundColor White

        if (-not $NoBrowser -and 'client' -in $targets -and $ok['client']) {
            Write-Host "`n  Opening browser..." -ForegroundColor Cyan
            Start-Process "https://localhost:$($script:Services.client.Port)"
        }
    }

    'stop' {
        Write-Host '   NaturalizationPuzzle — Stop Servers' -ForegroundColor White
        Write-Host '  ============================================' -ForegroundColor White

        # Stop client first (it proxies to the API)
        $stopOrder = if ($Service -eq 'all') { @('client', 'api') } else { @($Service) }
        foreach ($t in $stopOrder) { Stop-ServiceByName $t }

        Write-Host "`n  ============================================" -ForegroundColor White
    }

    'status' {
        Write-Host '   NaturalizationPuzzle — Server Status' -ForegroundColor White
        Write-Host '  ============================================' -ForegroundColor White

        foreach ($t in $targets) { Show-ServiceStatus $t }

        Write-Host "`n  State dir: $script:StateDir\" -ForegroundColor DarkGray
        Write-Host '  ============================================' -ForegroundColor White
    }
}

Write-Host ''
