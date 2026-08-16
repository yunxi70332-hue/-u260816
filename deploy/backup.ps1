param(
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDirectory = Join-Path $PSScriptRoot "backups"
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "usm-erp-$timestamp.dump"

Push-Location $root
try {
  $dumpCommand = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="/backups/' + $fileName + '"'
  docker compose -f $ComposeFile exec -T postgres sh -c $dumpCommand
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed." }
  Write-Host "Database backup created: $backupDirectory\$fileName"
} finally {
  Pop-Location
}
