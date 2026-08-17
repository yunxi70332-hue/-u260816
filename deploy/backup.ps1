param(
  [Parameter(Mandatory = $true)]
  [string]$Instance,
  [string]$EnvFile,
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = if ($EnvFile) { Resolve-Path $EnvFile } else { Join-Path $root "..\instances\$Instance\.env" }
if (-not (Test-Path $EnvFile)) { throw "Instance environment file was not found: $EnvFile" }
$configuredProject = (Get-Content $EnvFile | Where-Object { $_ -match '^COMPOSE_PROJECT_NAME=' } | Select-Object -First 1) -replace '^COMPOSE_PROJECT_NAME=', ''
if ($configuredProject -ne $Instance) { throw "COMPOSE_PROJECT_NAME in $EnvFile must equal $Instance" }
$backupDirectory = (Get-Content $EnvFile | Where-Object { $_ -match '^BACKUP_DIR=' } | Select-Object -First 1) -replace '^BACKUP_DIR=', ''
if (-not $backupDirectory) { throw "BACKUP_DIR is required in $EnvFile" }
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "$Instance-$timestamp.dump"

Push-Location $root
try {
  $dumpCommand = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="/backups/' + $fileName + '"'
  docker compose --project-name $Instance --env-file $EnvFile -f $ComposeFile exec -T postgres sh -c $dumpCommand
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed." }
  Write-Host "Database backup created: $backupDirectory\$fileName"
} finally {
  Pop-Location
}
