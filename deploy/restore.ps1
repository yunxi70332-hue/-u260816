param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [switch]$ConfirmRestore,
  [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) {
  throw "Restore replaces the current ERP database. Re-run with -ConfirmRestore after verifying the backup file."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backupDirectory = Resolve-Path (Join-Path $PSScriptRoot "backups")
$candidate = Resolve-Path (Join-Path $backupDirectory $BackupFile)
if (-not $candidate.Path.StartsWith($backupDirectory.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup file must be inside deploy\backups."
}

Push-Location $root
try {
  $name = Split-Path $candidate -Leaf
  $restoreCommand = 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "/backups/' + $name + '"'
  docker compose -f $ComposeFile exec -T postgres sh -c $restoreCommand
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL restore failed." }
  Write-Host "Database restored from $name"
} finally {
  Pop-Location
}
