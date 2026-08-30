$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "backup-crypto.psm1") -Force

function Assert-True {
  param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Assert-Throws {
  param([Parameter(Mandatory)][scriptblock]$Action, [Parameter(Mandatory)][string]$Message)
  try {
    & $Action
  } catch {
    return
  }
  throw "Assertion failed: $Message"
}

$root = Join-Path ([IO.Path]::GetTempPath()) "qarar-backup-crypto-test-$PID-$([guid]::NewGuid().ToString('N'))"
$workDirectory = $null
$key = $null
$priorEnvironmentKey = $env:QARAR_BACKUP_ENCRYPTION_KEY
$priorEnvironmentKeyFile = $env:QARAR_BACKUP_ENCRYPTION_KEY_FILE
try {
  [IO.Directory]::CreateDirectory($root) | Out-Null
  $workDirectory = New-QararControlledTemporaryDirectory -Root $root -Purpose backup -ProtectRoot
  $source = Join-Path $workDirectory "fixture.dump"
  $encrypted = Join-Path $workDirectory "fixture.dump.enc"
  $decrypted = Join-Path $workDirectory "restored.dump"
  [byte[]]$payload = New-Object byte[] (1MB + 257)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($payload)
  [IO.File]::WriteAllBytes($source, $payload)
  Clear-QararSensitiveBytes -Bytes $payload
  # Permission hardening is intentionally idempotent, including on Windows
  # runners that do not hold SeSecurityPrivilege.
  Protect-QararPathForOwner -Path $source
  Protect-QararPathForOwner -Path $source

  [byte[]]$key = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
  $encryption = Protect-QararBackupFile -PlaintextPath $source -EncryptedPath $encrypted -Key $key -BackupFileName "fixture.dump.enc"
  $backupHash = Get-QararFileSha256Hex -Path $encrypted
  [void](Write-QararSha256Sidecar -Path $encrypted)
  [void](Assert-QararSha256Sidecar -Path $encrypted)
  Assert-True -Condition ($encryption.algorithm -ceq "AES-256-GCM") -Message "AES-GCM metadata is emitted"
  Assert-True -Condition ($encryption.chunk_count -gt 1) -Message "fixture crosses a chunk boundary"

  $cronManifestPath = "$encrypted.cron.json"
  [IO.File]::WriteAllText($cronManifestPath, '{"format_version":1,"pg_cron_catalog_available":true,"jobs":[]}', [Text.UTF8Encoding]::new($false))
  $cronHash = Get-QararFileSha256Hex -Path $cronManifestPath
  [void](Write-QararSha256Sidecar -Path $cronManifestPath)
  [void](Assert-QararSha256Sidecar -Path $cronManifestPath)
  $manifest = [ordered]@{
    format_version = 2
    artifact_type = "qarar-postgresql-logical-backup"
    captured_at_utc = "2026-08-16T00:00:00.0000000Z"
    database = "postgres"
    backup_filename = "fixture.dump.enc"
    backup_sha256 = $backupHash
    backup_bytes = (Get-Item -LiteralPath $encrypted).Length
    encryption = $encryption
    cron_manifest = [ordered]@{
      filename = "fixture.dump.enc.cron.json"
      sha256 = $cronHash
      bytes = (Get-Item -LiteralPath $cronManifestPath).Length
    }
    manifest_authentication = [ordered]@{
      algorithm = "AES-256-GCM"
      nonce_derivation = "base_nonce_xor_uint64_max"
      tag_b64 = ""
    }
  }
  [byte[]]$baseNonce = [Convert]::FromBase64String([string]$encryption.nonce_b64)
  try {
    [byte[]]$tag = Get-QararManifestAuthenticationTag -Key $key -BaseNonce $baseNonce -Manifest $manifest
    try { $manifest.manifest_authentication.tag_b64 = [Convert]::ToBase64String($tag) } finally { Clear-QararSensitiveBytes -Bytes $tag }
  } finally {
    Clear-QararSensitiveBytes -Bytes $baseNonce
  }

  Assert-QararBackupManifestShape -Manifest $manifest -BackupPath $encrypted
  Assert-QararManifestAuthenticationTag -Key $key -Manifest $manifest
  $originalDatabase = $manifest.database
  $manifest.database = "other_database"
  Assert-Throws -Action { Assert-QararManifestAuthenticationTag -Key $key -Manifest $manifest } -Message "tampered manifest is rejected"
  $manifest.database = $originalDatabase
  Unprotect-QararBackupFile -EncryptedPath $encrypted -PlaintextPath $decrypted -Key $key -Manifest $manifest
  Assert-True -Condition ((Get-QararFileSha256Hex -Path $source) -ceq (Get-QararFileSha256Hex -Path $decrypted)) -Message "decrypted bytes equal plaintext"

  [byte[]]$wrongKey = New-Object byte[] 32
  try {
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($wrongKey)
    $wrongKeyOutput = Join-Path $workDirectory "wrong-key.dump"
    Assert-Throws -Action { Unprotect-QararBackupFile -EncryptedPath $encrypted -PlaintextPath $wrongKeyOutput -Key $wrongKey -Manifest $manifest } -Message "wrong key is rejected"
    Assert-True -Condition (-not (Test-Path -LiteralPath $wrongKeyOutput -PathType Leaf)) -Message "wrong-key failure removes partial plaintext"
  } finally {
    Clear-QararSensitiveBytes -Bytes $wrongKey
  }

  [byte[]]$ciphertext = [IO.File]::ReadAllBytes($encrypted)
  try {
    $ciphertext[40] = $ciphertext[40] -bxor 1
    [IO.File]::WriteAllBytes($encrypted, $ciphertext)
  } finally {
    Clear-QararSensitiveBytes -Bytes $ciphertext
  }
  Assert-Throws -Action { Assert-QararSha256Sidecar -Path $encrypted } -Message "ciphertext hash mismatch is rejected before decryption"
  # An attacker able to replace a checksum sidecar still cannot forge an AEAD tag.
  [void](Write-QararSha256Sidecar -Path $encrypted)
  $tamperedOutput = Join-Path $workDirectory "tampered.dump"
  Assert-Throws -Action { Unprotect-QararBackupFile -EncryptedPath $encrypted -PlaintextPath $tamperedOutput -Key $key -Manifest $manifest } -Message "tampered ciphertext is rejected"
  Assert-True -Condition (-not (Test-Path -LiteralPath $tamperedOutput -PathType Leaf)) -Message "tampered ciphertext failure removes partial plaintext"
  [IO.File]::WriteAllBytes("$encrypted.sha256", [byte[]]::new(1025))
  Assert-Throws -Action { Assert-QararSha256Sidecar -Path $encrypted | Out-Null } -Message "oversized checksum sidecar is rejected"

  Remove-Item Env:QARAR_BACKUP_ENCRYPTION_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:QARAR_BACKUP_ENCRYPTION_KEY_FILE -ErrorAction SilentlyContinue
  Assert-Throws -Action { Get-QararBackupEncryptionKey | Out-Null } -Message "missing key fails closed"
  $keyFile = Join-Path $workDirectory "backup-aes256.key"
  [IO.File]::WriteAllText($keyFile, [Convert]::ToBase64String($key), [Text.UTF8Encoding]::new($false))
  Protect-QararPathForOwner -Path $keyFile
  $env:QARAR_BACKUP_ENCRYPTION_KEY_FILE = $keyFile
  [byte[]]$fileKey = Get-QararBackupEncryptionKey
  try {
    Assert-True -Condition ([System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($key, $fileKey)) -Message "owner-only key file is accepted"
  } finally {
    Clear-QararSensitiveBytes -Bytes $fileKey
  }
  Assert-Throws -Action { Get-QararBackupEncryptionKey -EncryptionKeyFile $keyFile | Out-Null } -Message "parameter and environment key-file sources are mutually exclusive"
  $env:QARAR_BACKUP_ENCRYPTION_KEY = [Convert]::ToBase64String($key)
  Assert-Throws -Action { Get-QararBackupEncryptionKey | Out-Null } -Message "key file and environment key sources are mutually exclusive"
  Remove-Item Env:QARAR_BACKUP_ENCRYPTION_KEY_FILE -ErrorAction SilentlyContinue
  [byte[]]$environmentKey = Get-QararBackupEncryptionKey
  try {
    Assert-True -Condition ([System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($key, $environmentKey)) -Message "canonical environment key is accepted"
  } finally {
    Clear-QararSensitiveBytes -Bytes $environmentKey
  }

  Write-Output "backup-crypto unit tests passed"
} finally {
  Clear-QararSensitiveBytes -Bytes $key
  if ($null -eq $priorEnvironmentKey) { Remove-Item Env:QARAR_BACKUP_ENCRYPTION_KEY -ErrorAction SilentlyContinue } else { $env:QARAR_BACKUP_ENCRYPTION_KEY = $priorEnvironmentKey }
  if ($null -eq $priorEnvironmentKeyFile) { Remove-Item Env:QARAR_BACKUP_ENCRYPTION_KEY_FILE -ErrorAction SilentlyContinue } else { $env:QARAR_BACKUP_ENCRYPTION_KEY_FILE = $priorEnvironmentKeyFile }
  if ($workDirectory) { Remove-QararControlledTemporaryDirectory -Path $workDirectory -Purpose backup }
  if (Test-Path -LiteralPath $root -PathType Container) { Remove-Item -LiteralPath $root -Recurse -Force }
}
