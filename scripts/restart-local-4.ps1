param(
  [int]$Port = 5174,
  [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outputDir = Join-Path $root "output"
$stdoutLog = Join-Path $outputDir "vite-$Port.log"
$stderrLog = Join-Path $outputDir "vite-$Port.err.log"
$url = "http://127.0.0.1:$Port/"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$deadline = (Get-Date).AddSeconds(6)
do {
  Start-Sleep -Milliseconds 150
  $busy = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
} while ($busy -and (Get-Date) -lt $deadline)

if ($busy) {
  Write-Error "Port $Port is still busy. Check the process using: Get-NetTCPConnection -LocalPort $Port"
  exit 1
}

$process = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev:4") `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden `
  -PassThru

$ready = $false
$deadline = (Get-Date).AddSeconds(12)
do {
  Start-Sleep -Milliseconds 250
  if (Test-Path $stdoutLog) {
    $ready = (Get-Content -LiteralPath $stdoutLog -Raw -ErrorAction SilentlyContinue) -match "Local:\s+$([regex]::Escape($url))"
  }
  if (-not $ready) {
    $ready = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  }
} while (-not $ready -and (Get-Date) -lt $deadline)

if (-not $ready) {
  Write-Host "Service process started but readiness was not confirmed yet. PID: $($process.Id)"
  Write-Host "Log: $stdoutLog"
  Write-Host "Error log: $stderrLog"
  exit 2
}

if ($OpenBrowser) {
  Start-Process $url | Out-Null
}

Write-Host "USM 4.0 local service restarted"
Write-Host "URL: $url"
Write-Host "PID: $($process.Id)"
Write-Host "Log: $stdoutLog"
