param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [Parameter(Mandatory = $true)]
  [string]$Instance,
  [string]$EnvFile,
  [switch]$ConfirmRestore,
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
  throw "Restore replaces the current ERP database. Re-run with -ConfirmRestore after verifying the backup file."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = if ($EnvFile) { Resolve-Path $EnvFile } else { Join-Path $root "..\instances\$Instance\.env" }
if (-not (Test-Path $EnvFile)) { throw "Instance environment file was not found: $EnvFile" }
$configuredProject = (Get-Content $EnvFile | Where-Object { $_ -match '^COMPOSE_PROJECT_NAME=' } | Select-Object -First 1) -replace '^COMPOSE_PROJECT_NAME=', ''
if ($configuredProject -ne $Instance) { throw "COMPOSE_PROJECT_NAME in $EnvFile must equal $Instance" }
$backupDirectoryValue = (Get-Content $EnvFile | Where-Object { $_ -match '^BACKUP_DIR=' } | Select-Object -First 1) -replace '^BACKUP_DIR=', ''
if (-not $backupDirectoryValue) { throw "BACKUP_DIR is required in $EnvFile" }
$backupDirectory = Resolve-Path $backupDirectoryValue
$candidate = Resolve-Path (Join-Path $backupDirectory $BackupFile)
if (-not $candidate.Path.StartsWith($backupDirectory.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup file must be inside $backupDirectory."
}

Push-Location $root
try {
  $name = Split-Path $candidate -Leaf
  $restoreCommand = 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/' + $name + '"'
  docker compose --project-name $Instance --env-file $EnvFile -f $ComposeFile exec -T postgres sh -c $restoreCommand
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL restore failed." }
  Write-Host "Database restored from $name"
} finally {
  Pop-Location
}
