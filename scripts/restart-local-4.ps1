param(
  [int]$Port = 9011,
  [switch]$OpenBrowser,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$outputDir = Join-Path $root "output"
$stdoutLog = Join-Path $outputDir "vite-$Port.log"
$stderrLog = Join-Path $outputDir "vite-$Port.err.log"
$url = "http://127.0.0.1:$Port/"
$viteScript = Join-Path $root "node_modules\vite\bin\vite.js"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $viteScript)) {
  Write-Error "Vite was not found at $viteScript. Run npm install once before starting the local service."
  exit 1
}

$nodeCandidates = @()
if ($env:USERPROFILE) {
  $nodeCandidates += Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}
$nodeCandidates += "C:\Program Files\nodejs\node.exe"
$nodeCandidates += "C:\Program Files (x86)\nodejs\node.exe"
$pathNode = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if ($pathNode) {
  $nodeCandidates += $pathNode
}

$nodePath = $null
foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
  if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) {
    continue
  }
  try {
    & $candidate -v *> $null
    if ($LASTEXITCODE -eq 0) {
      $nodePath = $candidate
      break
    }
  } catch {
  }
}

if (-not $nodePath) {
  Write-Error "Node.js was not found or could not be executed. Install Node.js, then run this script again."
  exit 1
}

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$deadline = (Get-Date).AddSeconds(6)
do {
  Start-Sleep -Milliseconds 150
  $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
} while ($busy -and (Get-Date) -lt $deadline)

if ($busy) {
  Write-Error "Port $Port is still busy. Check the process using: Get-NetTCPConnection -LocalPort $Port"
  exit 1
}

if ($Foreground) {
  if ($OpenBrowser) {
    Start-Process `
      -FilePath "powershell" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Start-Sleep -Seconds 2; Start-Process '$url'") `
      -WindowStyle Hidden `
      | Out-Null
  }

  Write-Host "USM 4.0 local service starting in this window"
  Write-Host "URL: $url"
  Write-Host "Node: $nodePath"
  Write-Host "Press Ctrl+C or close this window to stop the service."
  Write-Host ""

  & $nodePath $viteScript --host 127.0.0.1 --port $Port --strictPort
  exit $LASTEXITCODE
}

$process = Start-Process `
  -FilePath $nodePath `
  -ArgumentList @($viteScript, "--host", "127.0.0.1", "--port", "$Port", "--strictPort") `
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
