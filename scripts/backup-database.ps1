[CmdletBinding()]
param(
  [string]$OutputDirectory = "backups",
  [string]$Container = "qarar-supabase-db",
  [string]$Database = "postgres",
  [string]$User = "supabase_admin",
  # A path is safe to pass on the command line; the key itself never is.
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
Assert-QararPostgresIdentifier -Value $Database -Label "Database"
Assert-QararPostgresIdentifier -Value $User -Label "User"

$resolved = if ([IO.Path]::IsPathFullyQualified($OutputDirectory)) {
  [IO.Path]::GetFullPath($OutputDirectory)
} else {
  [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
}
[IO.Directory]::CreateDirectory($resolved) | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseName = "qarar-$stamp"
$encryptedName = "$baseName.dump.enc"
$target = Join-Path $resolved $encryptedName
$cronManifestTarget = "$target.cron.json"
$backupManifestTarget = "$target.manifest.json"
$artifactTargets = @(
  $target,
  "$target.sha256",
  $cronManifestTarget,
  "$cronManifestTarget.sha256",
  $backupManifestTarget,
  "$backupManifestTarget.sha256"
)
foreach ($path in $artifactTargets) {
  if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite an existing backup artifact." }
}

$workDirectory = $null
$containerDumpPath = "/tmp/qarar-backup-$PID-$([guid]::NewGuid().ToString('N')).dump"
$containerDumpCreated = $false
$key = $null
$published = @()
try {
  # Encryption is mandatory in every environment; a production runner therefore
  # fails closed before a plaintext dump is copied from the database container.
  $key = Get-QararBackupEncryptionKey -EncryptionKeyFile $EncryptionKeyFile
  $workDirectory = New-QararControlledTemporaryDirectory -Root (Join-Path $resolved ".qarar-backup-work") -Purpose backup -ProtectRoot
  $plaintextPath = Join-Path $workDirectory "source.dump"
  $encryptedTemporaryPath = Join-Path $workDirectory $encryptedName
  $cronManifestTemporaryPath = Join-Path $workDirectory "$encryptedName.cron.json"
  $backupManifestTemporaryPath = Join-Path $workDirectory "$encryptedName.manifest.json"

  # Mark this before pg_dump runs: a failing pg_dump can still leave a partial
  # plaintext file in the database container, and the finally block must try
  # to remove that exact generated path.
  $containerDumpCreated = $true
  Invoke-QararDocker -Operation "pg_dump" -Arguments @(
    "exec", $Container, "pg_dump", "-U", $User, "-d", $Database,
    "--format=custom", "--no-owner", "--no-privileges", "--exclude-extension=pg_cron", "--exclude-schema=cron",
    "--file", $containerDumpPath
  )
  Invoke-QararDocker -Operation "Copying backup from the database container" -Arguments @("cp", "${Container}:$containerDumpPath", $plaintextPath)
  if (-not (Test-Path -LiteralPath $plaintextPath -PathType Leaf) -or (Get-Item -LiteralPath $plaintextPath).Length -le 0) {
    throw "pg_dump produced no usable backup data."
  }

  # pg_cron belongs to the maintenance database and is intentionally excluded
  # from the dump. Its reviewed jobs remain a separately hashed artifact.
  $cronCatalog = & docker exec $Container psql -X -U $User -d $Database -At -v ON_ERROR_STOP=1 -c "select to_regclass('cron.job') is not null"
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the pg_cron catalog." }
  $cronJobs = @()
  if ($cronCatalog.Trim() -eq "t") {
    $cronJson = & docker exec $Container psql -X -U $User -d $Database -At -v ON_ERROR_STOP=1 -c "select coalesce(jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'command',command,'active',active) order by jobname),'[]'::jsonb) from cron.job"
    if ($LASTEXITCODE -ne 0) { throw "Unable to capture pg_cron jobs." }
    $cronJobs = @($cronJson | ConvertFrom-Json)
  }
  $cronManifest = [ordered]@{
    format_version = 1
    captured_at = (Get-Date).ToUniversalTime().ToString("o")
    database = $Database
    pg_cron_catalog_available = ($cronCatalog.Trim() -eq "t")
    jobs = $cronJobs
  }
  [IO.File]::WriteAllText($cronManifestTemporaryPath, ($cronManifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  Protect-QararPathForOwner -Path $cronManifestTemporaryPath
  $cronHash = Write-QararSha256Sidecar -Path $cronManifestTemporaryPath

  $encryption = Protect-QararBackupFile -PlaintextPath $plaintextPath -EncryptedPath $encryptedTemporaryPath -Key $key -BackupFileName $encryptedName
  Protect-QararPathForOwner -Path $encryptedTemporaryPath
  $backupHash = Write-QararSha256Sidecar -Path $encryptedTemporaryPath

  $backupManifest = [ordered]@{
    format_version = 2
    artifact_type = "qarar-postgresql-logical-backup"
    captured_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    database = $Database
    backup_filename = $encryptedName
    backup_sha256 = $backupHash
    backup_bytes = (Get-Item -LiteralPath $encryptedTemporaryPath).Length
    encryption = $encryption
    cron_manifest = [ordered]@{
      filename = "$encryptedName.cron.json"
      sha256 = $cronHash
      bytes = (Get-Item -LiteralPath $cronManifestTemporaryPath).Length
    }
    manifest_authentication = [ordered]@{
      algorithm = "AES-256-GCM"
      nonce_derivation = "base_nonce_xor_uint64_max"
      tag_b64 = ""
    }
  }
  [byte[]]$manifestBaseNonce = [Convert]::FromBase64String([string]$encryption.nonce_b64)
  try {
    [byte[]]$manifestTag = Get-QararManifestAuthenticationTag -Key $key -BaseNonce $manifestBaseNonce -Manifest $backupManifest
    try {
      $backupManifest.manifest_authentication.tag_b64 = [Convert]::ToBase64String($manifestTag)
    } finally {
      Clear-QararSensitiveBytes -Bytes $manifestTag
    }
  } finally {
    Clear-QararSensitiveBytes -Bytes $manifestBaseNonce
  }
  [IO.File]::WriteAllText($backupManifestTemporaryPath, ($backupManifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  Protect-QararPathForOwner -Path $backupManifestTemporaryPath
  [void](Write-QararSha256Sidecar -Path $backupManifestTemporaryPath)

  $moves = @(
    @{ source = $encryptedTemporaryPath; target = $target },
    @{ source = "$encryptedTemporaryPath.sha256"; target = "$target.sha256" },
    @{ source = $cronManifestTemporaryPath; target = $cronManifestTarget },
    @{ source = "$cronManifestTemporaryPath.sha256"; target = "$cronManifestTarget.sha256" },
    @{ source = $backupManifestTemporaryPath; target = $backupManifestTarget },
    @{ source = "$backupManifestTemporaryPath.sha256"; target = "$backupManifestTarget.sha256" }
  )
  foreach ($move in $moves) {
    Move-Item -LiteralPath $move.source -Destination $move.target -ErrorAction Stop
    $published += $move.target
    Protect-QararPathForOwner -Path $move.target
  }

  Write-Output $target
} catch {
  $publicationCleanupFailures = @()
  foreach ($path in $published) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    try {
      Remove-Item -LiteralPath $path -Force -ErrorAction Stop
      if (Test-Path -LiteralPath $path -PathType Leaf) {
        throw "artifact still exists after deletion"
      }
    } catch {
      $publicationCleanupFailures += [System.IO.Path]::GetFileName($path)
    }
  }
  if ($publicationCleanupFailures.Count -gt 0) {
    throw "Backup failed and could not remove partially published artifacts: $($publicationCleanupFailures -join ', ')."
  }
  throw
} finally {
  if ($containerDumpCreated) {
    Invoke-QararDocker -Operation "Removing temporary plaintext dump from the database container" -Arguments @("exec", $Container, "rm", "-f", "--", $containerDumpPath) | Out-Null
  }
  if ($workDirectory) { Remove-QararControlledTemporaryDirectory -Path $workDirectory -Purpose backup }
  Clear-QararSensitiveBytes -Bytes $key
}
