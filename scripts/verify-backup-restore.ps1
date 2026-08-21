[CmdletBinding()]
param(
  [string]$BackupPath,
  [string]$Container = "qarar-supabase-db",
  [string]$User = "supabase_admin",
  [int]$ExpectedContractCount = 200,
  # This may be a controlled volume; no secret values are accepted as arguments.
  [string]$TemporaryRoot,
  [string]$EncryptionKeyFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module (Join-Path $PSScriptRoot "backup-crypto.psm1") -Force

function Invoke-QararDocker {
  param([Parameter(Mandatory)][string]$Operation, [Parameter(Mandatory)][string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Operation failed." }
}

Assert-QararContainerName -Container $Container
Assert-QararPostgresIdentifier -Value $User -Label "User"

if (-not $BackupPath) {
  $BackupPath = Get-ChildItem -LiteralPath (Join-Path (Get-Location) "backups") -Filter "*.dump.enc" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $BackupPath -or -not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw "Encrypted backup file not found." }
$BackupPath = [IO.Path]::GetFullPath($BackupPath)
$backupItem = Assert-QararRegularFile -Path $BackupPath -Label "Encrypted backup"
$backupName = [IO.Path]::GetFileName($BackupPath)
if (-not $backupName.EndsWith(".dump.enc", [System.StringComparison]::Ordinal)) {
  throw "Restore drills accept only encrypted .dump.enc backup artifacts."
}

$backupManifestPath = "$BackupPath.manifest.json"
$cronManifestPath = "$BackupPath.cron.json"
$backupManifestItem = Assert-QararRegularFile -Path $backupManifestPath -Label "Encrypted backup manifest" -MaximumBytes 1MB
$cronManifestItem = Assert-QararRegularFile -Path $cronManifestPath -Label "pg_cron manifest" -MaximumBytes 1MB

# Verify all hashes before any ciphertext is decrypted. The authenticated
# manifest binds those hashes, the nonce, and the expected encrypted format.
[void](Assert-QararSha256Sidecar -Path $backupManifestPath)
try {
  $backupManifest = [IO.File]::ReadAllText($backupManifestPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
} catch {
  throw "Encrypted backup manifest is not valid JSON."
}
Assert-QararBackupManifestShape -Manifest $backupManifest -BackupPath $BackupPath
$actualBackupHash = Assert-QararSha256Sidecar -Path $BackupPath
if (-not (Test-QararFixedTimeHexEqual -Expected ([string]$backupManifest.backup_sha256) -Actual $actualBackupHash)) {
  throw "Encrypted backup hash does not match its manifest."
}
if ($backupItem.Length -ne [Int64]$backupManifest.backup_bytes) {
  throw "Encrypted backup byte length does not match its manifest."
}
$actualCronHash = Assert-QararSha256Sidecar -Path $cronManifestPath
if (-not (Test-QararFixedTimeHexEqual -Expected ([string]$backupManifest.cron_manifest.sha256) -Actual $actualCronHash)) {
  throw "pg_cron manifest hash does not match the encrypted backup manifest."
}
if ($cronManifestItem.Length -ne [Int64]$backupManifest.cron_manifest.bytes) {
  throw "pg_cron manifest byte length does not match the encrypted backup manifest."
}
try {
  $cronManifest = [IO.File]::ReadAllText($cronManifestPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
} catch {
  throw "pg_cron manifest is not valid JSON."
}
if ($cronManifest.format_version -ne 1 -or -not $cronManifest.pg_cron_catalog_available) {
  throw "Backup does not contain a usable pg_cron manifest."
}
$requiredCronJobs = @("qarar-expire-access-delegations", "qarar-expire-governance-exceptions", "qarar-recover-notification-outbox")
$manifestJobNames = @($cronManifest.jobs | ForEach-Object { $_.jobname })
$missingCronJobs = @($requiredCronJobs | Where-Object { $_ -notin $manifestJobNames })
if ($missingCronJobs.Count -gt 0) { throw "pg_cron manifest is missing required jobs: $($missingCronJobs -join ', ')" }

$key = $null
$workDirectory = $null
$containerDumpPath = "/tmp/qarar-restore-$PID-$([guid]::NewGuid().ToString('N')).dump"
$containerDumpCopied = $false
$db = "qarar_restore_verify_" + (Get-Date -Format "yyyyMMddHHmmss") + "_" + ([guid]::NewGuid().ToString('N').Substring(0, 8))
if ($db -notmatch '^qarar_restore_verify_[0-9]{14}_[a-f0-9]{8}$') { throw "Unsafe verification database name." }
$databaseCreated = $false
try {
  $key = Get-QararBackupEncryptionKey -EncryptionKeyFile $EncryptionKeyFile
  Assert-QararManifestAuthenticationTag -Key $key -Manifest $backupManifest

  $temporaryVolume = if ($TemporaryRoot) {
    $TemporaryRoot
  } elseif ($env:QARAR_RESTORE_TEMP_ROOT) {
    $env:QARAR_RESTORE_TEMP_ROOT
  } else {
    Split-Path -LiteralPath $BackupPath -Parent
  }
  # Use a dedicated, owner-only directory inside any operator-supplied volume;
  # never loosen or take ownership of the volume itself.
  $workRoot = Join-Path $temporaryVolume ".qarar-restore-work"
  $workDirectory = New-QararControlledTemporaryDirectory -Root $workRoot -Purpose restore -ProtectRoot
  $plaintextPath = Join-Path $workDirectory "restore.dump"
  Unprotect-QararBackupFile -EncryptedPath $BackupPath -PlaintextPath $plaintextPath -Key $key -Manifest $backupManifest
  if (-not (Test-Path -LiteralPath $plaintextPath -PathType Leaf) -or (Get-Item -LiteralPath $plaintextPath).Length -ne [Int64]$backupManifest.encryption.plaintext_bytes) {
    throw "Decrypted backup is incomplete."
  }

  $containerDumpCopied = $true
  Invoke-QararDocker -Operation "Copying decrypted backup into the isolated database container" -Arguments @("cp", $plaintextPath, "${Container}:$containerDumpPath")
  $databaseCreated = $true
  Invoke-QararDocker -Operation "Creating isolated restore-drill database" -Arguments @("exec", $Container, "createdb", "-U", $User, $db)
  Invoke-QararDocker -Operation "Restoring isolated database" -Arguments @("exec", $Container, "pg_restore", "-U", $User, "-d", $db, "--no-owner", "--no-privileges", $containerDumpPath)
  $integrityJson = & docker exec $Container psql -X -U $User -d $db -At -v ON_ERROR_STOP=1 -c "select json_build_object('users',(select count(*) from qarar_iam.users),'contracts',(select count(*) from qarar_architecture.api_contract_registry),'released_contracts',(select contract_count from qarar_architecture.api_release_registry where api_version='v1'),'migrations',(select count(*) from qarar_internal.applied_migrations))"
  if ($LASTEXITCODE -ne 0) { throw "Restore integrity query failed." }
  try { $integrity = $integrityJson | ConvertFrom-Json } catch { throw "Restore integrity result is invalid." }
  if ([int]$integrity.users -lt 1 -or
      [int]$integrity.contracts -ne $ExpectedContractCount -or
      [int]$integrity.released_contracts -ne $ExpectedContractCount -or
      [int]$integrity.migrations -lt 1) {
    throw "Restore integrity check failed."
  }
  Write-Output "Encrypted restore drill passed: users=$($integrity.users); contracts=$($integrity.contracts); migrations=$($integrity.migrations); cron_manifest_jobs=$($manifestJobNames.Count). Run scripts/reconcile-qarar-cron.ps1 after restoring the maintenance database."
} finally {
  if ($databaseCreated -and $db -match '^qarar_restore_verify_[0-9]{14}_[a-f0-9]{8}$') {
    Invoke-QararDocker -Operation "Removing isolated restore-drill database" -Arguments @("exec", $Container, "dropdb", "-U", $User, "--if-exists", $db) | Out-Null
  }
  if ($containerDumpCopied) {
    Invoke-QararDocker -Operation "Removing decrypted backup from the database container" -Arguments @("exec", $Container, "rm", "-f", "--", $containerDumpPath) | Out-Null
  }
  if ($workDirectory) { Remove-QararControlledTemporaryDirectory -Path $workDirectory -Purpose restore }
  Clear-QararSensitiveBytes -Bytes $key
}
