Set-StrictMode -Version Latest

$script:QararBackupMagic = [System.Text.Encoding]::ASCII.GetBytes("QARARBG2")
$script:QararBackupFormatVersion = [byte]1
$script:QararBackupNonceLength = 12
$script:QararBackupTagLength = 16
$script:QararBackupChunkSize = 1MB
$script:QararManifestFormatVersion = 2
$script:QararBackupMaxSidecarBytes = 1024

function Test-QararProductionEnvironment {
  return [string]::Equals([string]$env:NODE_ENV, "production", [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-QararPowerShellCryptoSupport {
  if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw "Encrypted backups require PowerShell 7 or later."
  }
  # Unix permission enforcement relies on the .NET 6 file-mode APIs, which
  # first ship with PowerShell 7.2.  Reject older PS 7 builds explicitly rather
  # than accepting encryption and later leaving a plaintext work file broad.
  if (-not $IsWindows -and $PSVersionTable.PSVersion -lt [version]"7.2") {
    throw "Encrypted backups require PowerShell 7.2 or later on Unix hosts."
  }

  if (-not ("System.Security.Cryptography.AesGcm" -as [type])) {
    throw "AES-GCM support is unavailable in this PowerShell runtime."
  }
}

function Get-QararBackupEncryptionKey {
  [CmdletBinding()]
  param([string]$EncryptionKeyFile)

  Assert-QararPowerShellCryptoSupport

  $environmentKeyFile = $env:QARAR_BACKUP_ENCRYPTION_KEY_FILE
  if ($EncryptionKeyFile -and $environmentKeyFile) {
    throw "Configure the backup encryption key file through either -EncryptionKeyFile or QARAR_BACKUP_ENCRYPTION_KEY_FILE, not both."
  }
  $configuredFile = if ($EncryptionKeyFile) { $EncryptionKeyFile } else { $environmentKeyFile }
  $configuredEnvironmentKey = $env:QARAR_BACKUP_ENCRYPTION_KEY
  if ($configuredFile -and $configuredEnvironmentKey) {
    throw "Configure the backup encryption key through exactly one source: QARAR_BACKUP_ENCRYPTION_KEY_FILE or QARAR_BACKUP_ENCRYPTION_KEY."
  }

  [string]$encodedKey = ""
  if ($configuredFile) {
    $resolvedFile = Resolve-QararSecretFile -Path $configuredFile
    $encodedKey = [System.IO.File]::ReadAllText($resolvedFile).Trim()
  } elseif ($configuredEnvironmentKey) {
    $encodedKey = $configuredEnvironmentKey.Trim()
  } else {
    throw "Backup encryption key is required. Supply a protected key file or inject QARAR_BACKUP_ENCRYPTION_KEY into the runner environment."
  }

  $isCanonical = $false
  try {
    [byte[]]$key = [Convert]::FromBase64String($encodedKey)
    $isCanonical = [Convert]::ToBase64String($key) -ceq $encodedKey
  } catch {
    throw "Backup encryption key must be canonical base64 for exactly 32 bytes."
  } finally {
    $encodedKey = ""
  }

  if ($key.Length -ne 32 -or -not $isCanonical) {
    if ($key) { [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key) }
    throw "Backup encryption key must be canonical base64 for exactly 32 bytes."
  }

  return $key
}

function Resolve-QararSecretFile {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Backup encryption key file does not exist or is not a regular file."
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Backup encryption key file must not be a symbolic link or reparse point."
  }

  $resolved = $item.FullName
  Assert-QararSecretFilePermissions -Path $resolved
  return $resolved
}

function Assert-QararRegularFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Label,
    [Int64]$MaximumBytes = -1
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "$Label does not exist or is not a regular file."
  }
  $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "$Label must not be a symbolic link or reparse point."
  }
  if ($MaximumBytes -ge 0 -and $item.Length -gt $MaximumBytes) {
    throw "$Label exceeds the maximum allowed size."
  }
  return $item
}

function Assert-QararSecretFilePermissions {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  if ($IsWindows) {
    try {
      $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
      if ($null -eq $currentUser -or -not (Test-QararWindowsPathIsOwnerOnly -Path $Path -CurrentUser $currentUser)) {
        throw "Backup encryption key file must be owned and readable only by the backup operator."
      }
    } catch {
      if ($_.Exception.Message -like "Backup encryption key file must be owned*") { throw }
      throw "Unable to verify permissions on the backup encryption key file."
    }
    return
  }

  try {
    $mode = [System.IO.File]::GetUnixFileMode($Path)
    $forbidden = [System.IO.UnixFileMode]::GroupRead -bor [System.IO.UnixFileMode]::GroupWrite -bor [System.IO.UnixFileMode]::GroupExecute -bor [System.IO.UnixFileMode]::OtherRead -bor [System.IO.UnixFileMode]::OtherWrite -bor [System.IO.UnixFileMode]::OtherExecute
    if (($mode -band $forbidden) -ne 0 -or ($mode -band [System.IO.UnixFileMode]::UserRead) -eq 0) {
      throw "Backup encryption key file must be owner-readable with no group or other permissions."
    }
  } catch {
    if ($_.Exception.Message -like "Backup encryption key file must be owner-readable*") { throw }
    throw "Unable to verify permissions on the backup encryption key file."
  }
}

function Clear-QararSensitiveBytes {
  [CmdletBinding()]
  param([byte[]]$Bytes)

  if ($null -ne $Bytes -and $Bytes.Length -gt 0) {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($Bytes)
  }
}

function Assert-QararContainerName {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Container)

  if ($Container -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$') {
    throw "Container name contains unsupported characters."
  }
}

function Assert-QararPostgresIdentifier {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Value, [Parameter(Mandatory)][string]$Label)

  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
    throw "$Label must be a simple PostgreSQL identifier."
  }
}

function Get-QararSha256Hex {
  [CmdletBinding()]
  param([Parameter(Mandatory)][System.IO.Stream]$Stream)

  $hasher = [System.Security.Cryptography.IncrementalHash]::CreateHash([System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $buffer = $null
  try {
    [byte[]]$buffer = New-Object byte[] 131072
    while (($read = $Stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $hasher.AppendData($buffer, 0, $read)
    }
    return ([Convert]::ToHexString($hasher.GetHashAndReset())).ToLowerInvariant()
  } finally {
    $hasher.Dispose()
    Clear-QararSensitiveBytes -Bytes $buffer
  }
}

function Get-QararFileSha256Hex {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    return Get-QararSha256Hex -Stream $stream
  } finally {
    $stream.Dispose()
  }
}

function Test-QararFixedTimeHexEqual {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Expected, [Parameter(Mandatory)][string]$Actual)

  if ($Expected.Length -ne $Actual.Length) { return $false }
  [byte[]]$expectedBytes = [System.Text.Encoding]::ASCII.GetBytes($Expected)
  [byte[]]$actualBytes = [System.Text.Encoding]::ASCII.GetBytes($Actual)
  try {
    return [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals($expectedBytes, $actualBytes)
  } finally {
    Clear-QararSensitiveBytes -Bytes $expectedBytes
    Clear-QararSensitiveBytes -Bytes $actualBytes
  }
}

function Write-QararSha256Sidecar {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  $hash = Get-QararFileSha256Hex -Path $Path
  $sidecar = "$Path.sha256"
  [System.IO.File]::WriteAllText($sidecar, "$hash  $([System.IO.Path]::GetFileName($Path))`n", [System.Text.Encoding]::ASCII)
  Protect-QararPathForOwner -Path $sidecar
  return $hash
}

function Assert-QararSha256Sidecar {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path)

  $sidecar = "$Path.sha256"
  [void](Assert-QararRegularFile -Path $sidecar -Label "Required SHA-256 sidecar for $([System.IO.Path]::GetFileName($Path))" -MaximumBytes $script:QararBackupMaxSidecarBytes)

  $line = [System.IO.File]::ReadAllText($sidecar, [System.Text.Encoding]::ASCII).Trim()
  $match = [regex]::Match($line, '^(?<hash>[a-fA-F0-9]{64})  (?<name>[^\\/]+)$')
  if (-not $match.Success -or $match.Groups['name'].Value -cne [System.IO.Path]::GetFileName($Path)) {
    throw "SHA-256 sidecar format is invalid for $([System.IO.Path]::GetFileName($Path))."
  }

  $actual = Get-QararFileSha256Hex -Path $Path
  if (-not (Test-QararFixedTimeHexEqual -Expected $match.Groups['hash'].Value.ToLowerInvariant() -Actual $actual)) {
    throw "SHA-256 verification failed for $([System.IO.Path]::GetFileName($Path))."
  }
  return $actual
}

function Test-QararWindowsPathIsOwnerOnly {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][System.Security.Principal.SecurityIdentifier]$CurrentUser
  )

  try {
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -cne $CurrentUser.Value) {
      return $false
    }

    $hasCurrentUserFullControl = $false
    foreach ($accessRule in @($acl.Access)) {
      if ($accessRule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
        return $false
      }
      $ruleSid = $accessRule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier])
      if ($ruleSid.Value -cne $CurrentUser.Value) {
        return $false
      }
      if (($accessRule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) {
        $hasCurrentUserFullControl = $true
      }
    }
    return $hasCurrentUserFullControl
  } catch {
    return $false
  }
}

function Protect-QararPathForOwner {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path, [switch]$Directory)

  if ($IsWindows) {
    try {
      $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
      if ($null -eq $currentUser) { throw "Current Windows identity is unavailable." }
      # The common path is a child of an already owner-only work directory.
      # Do not reapply a Windows descriptor in that case: Windows may try to
      # persist a SACL on a second Set-Acl call and require SeSecurityPrivilege.
      if (Test-QararWindowsPathIsOwnerOnly -Path $Path -CurrentUser $currentUser) {
        return
      }
      $inheritance = if ($Directory) { [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit } else { [System.Security.AccessControl.InheritanceFlags]::None }
      # Build a fresh DACL rather than mutating the descriptor returned by
      # Get-Acl.  Re-applying a descriptor that carries a SACL can require
      # SeSecurityPrivilege on Windows, which both makes the backup flaky and
      # risks carrying unrelated audit permissions into the artifact.
      $acl = if ($Directory) {
        [System.Security.AccessControl.DirectorySecurity]::new()
      } else {
        [System.Security.AccessControl.FileSecurity]::new()
      }
      $acl.SetOwner($currentUser)
      $acl.SetAccessRuleProtection($true, $false)
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
      $acl.AddAccessRule($rule)
      Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
      if (-not (Test-QararWindowsPathIsOwnerOnly -Path $Path -CurrentUser $currentUser)) {
        throw "Backup artifact permissions could not be restricted to the backup operator."
      }
    } catch {
      throw "Unable to restrict backup artifact permissions to the backup operator."
    }
    return
  }

  try {
    $mode = if ($Directory) {
      [System.IO.UnixFileMode]::UserRead -bor [System.IO.UnixFileMode]::UserWrite -bor [System.IO.UnixFileMode]::UserExecute
    } else {
      [System.IO.UnixFileMode]::UserRead -bor [System.IO.UnixFileMode]::UserWrite
    }
    [System.IO.File]::SetUnixFileMode($Path, $mode)
  } catch {
    throw "Unable to restrict backup artifact permissions to the backup operator."
  }
}

function New-QararControlledTemporaryDirectory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][ValidateSet("backup", "restore")][string]$Purpose,
    [switch]$ProtectRoot
  )

  $resolvedRoot = [System.IO.Path]::GetFullPath($Root)
  [System.IO.Directory]::CreateDirectory($resolvedRoot) | Out-Null
  if ($ProtectRoot) {
    $rootItem = Get-Item -LiteralPath $resolvedRoot -Force -ErrorAction Stop
    if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Temporary work root must not be a symbolic link or reparse point."
    }
    Protect-QararPathForOwner -Path $resolvedRoot -Directory
  }
  $leaf = "qarar-$Purpose-$PID-$([guid]::NewGuid().ToString('N'))"
  $path = Join-Path $resolvedRoot $leaf
  [System.IO.Directory]::CreateDirectory($path) | Out-Null
  try {
    Protect-QararPathForOwner -Path $path -Directory
  } catch {
    if (Test-Path -LiteralPath $path -PathType Container) {
      try { Remove-QararControlledTemporaryDirectory -Path $path -Purpose $Purpose } catch { }
    }
    throw
  }
  return $path
}

function Remove-QararControlledTemporaryDirectory {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][ValidateSet("backup", "restore")][string]$Purpose)

  $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) { return }
  if (-not $item.PSIsContainer -or $item.Name -notmatch "^qarar-$Purpose-[0-9]+-[a-f0-9]{32}$") {
    throw "Refusing to remove an unexpected temporary directory."
  }
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    # Never recurse through a substituted directory.  Removing only the link
    # avoids turning a cleanup path into deletion of an attacker-selected tree.
    Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
    throw "Temporary work directory was replaced by a reparse point; the link was removed without recursive traversal."
  }
  Remove-Item -LiteralPath $item.FullName -Recurse -Force
}

function Get-QararChunkNonce {
  [CmdletBinding()]
  param([Parameter(Mandatory)][byte[]]$BaseNonce, [Parameter(Mandatory)][UInt64]$ChunkIndex)

  if ($BaseNonce.Length -ne $script:QararBackupNonceLength) { throw "Invalid AES-GCM base nonce length." }
  [byte[]]$nonce = $BaseNonce.Clone()
  [UInt64]$counter = $ChunkIndex
  for ($offset = 0; $offset -lt 8; $offset += 1) {
    $position = $nonce.Length - 1 - $offset
    $nonce[$position] = $nonce[$position] -bxor [byte]($counter -band [UInt64]0xff)
    $counter = $counter -shr 8
  }
  return $nonce
}

function Get-QararChunkAuthenticationData {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$BackupFileName,
    [Parameter(Mandatory)][Int64]$PlaintextLength,
    [Parameter(Mandatory)][Int32]$ChunkSize,
    [Parameter(Mandatory)][byte[]]$BaseNonce,
    [Parameter(Mandatory)][UInt64]$ChunkIndex,
    [Parameter(Mandatory)][Int32]$ChunkLength
  )

  $value = "qarar-backup-chunk-v1`n$BackupFileName`n$PlaintextLength`n$ChunkSize`n$([Convert]::ToBase64String($BaseNonce))`n$ChunkIndex`n$ChunkLength"
  return [System.Text.Encoding]::UTF8.GetBytes($value)
}

function Get-QararManifestAuthenticationData {
  [CmdletBinding()]
  param([Parameter(Mandatory)]$Manifest)

  # ConvertFrom-Json materializes ISO timestamps as DateTime on newer
  # PowerShell versions. Authenticate one invariant representation so the
  # writer's string and the restore reader's DateTime produce identical AAD.
  $capturedValue = $Manifest.captured_at_utc
  $capturedAt = if ($capturedValue -is [DateTime]) {
    ([DateTimeOffset]$capturedValue.ToUniversalTime()).ToString("o", [Globalization.CultureInfo]::InvariantCulture)
  } else {
    [DateTimeOffset]::Parse(
      [string]$capturedValue,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal
    ).ToUniversalTime().ToString("o", [Globalization.CultureInfo]::InvariantCulture)
  }
  $value = @(
    "qarar-backup-manifest-v1",
    [string]$Manifest.format_version,
    [string]$Manifest.backup_filename,
    [string]$Manifest.backup_sha256,
    [string]$Manifest.backup_bytes,
    [string]$Manifest.encryption.algorithm,
    [string]$Manifest.encryption.envelope_format,
    [string]$Manifest.encryption.nonce_b64,
    [string]$Manifest.encryption.chunk_size_bytes,
    [string]$Manifest.encryption.tag_length_bytes,
    [string]$Manifest.encryption.plaintext_bytes,
    [string]$Manifest.encryption.chunk_count,
    [string]$Manifest.cron_manifest.filename,
    [string]$Manifest.cron_manifest.sha256,
    [string]$Manifest.cron_manifest.bytes,
    [string]$Manifest.database,
    $capturedAt
  ) -join "`n"
  return [System.Text.Encoding]::UTF8.GetBytes($value)
}

function Get-QararManifestAuthenticationTag {
  [CmdletBinding()]
  param([Parameter(Mandatory)][byte[]]$Key, [Parameter(Mandatory)][byte[]]$BaseNonce, [Parameter(Mandatory)]$Manifest)

  [byte[]]$nonce = Get-QararChunkNonce -BaseNonce $BaseNonce -ChunkIndex ([UInt64]::MaxValue)
  [byte[]]$aad = Get-QararManifestAuthenticationData -Manifest $Manifest
  [byte[]]$tag = New-Object byte[] $script:QararBackupTagLength
  [byte[]]$empty = [byte[]]::new(0)
  try {
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, $script:QararBackupTagLength)
    try {
      $aes.Encrypt($nonce, $empty, $empty, $tag, $aad)
      return $tag
    } finally {
      $aes.Dispose()
    }
  } finally {
    Clear-QararSensitiveBytes -Bytes $nonce
    Clear-QararSensitiveBytes -Bytes $aad
  }
}

function Assert-QararManifestAuthenticationTag {
  [CmdletBinding()]
  param([Parameter(Mandatory)][byte[]]$Key, [Parameter(Mandatory)]$Manifest)

  if ($Manifest.manifest_authentication.algorithm -cne "AES-256-GCM" -or $Manifest.manifest_authentication.nonce_derivation -cne "base_nonce_xor_uint64_max" -or -not $Manifest.manifest_authentication.tag_b64) {
    throw "Backup manifest authentication metadata is invalid."
  }
  try {
    [byte[]]$baseNonce = [Convert]::FromBase64String([string]$Manifest.encryption.nonce_b64)
    [byte[]]$tag = [Convert]::FromBase64String([string]$Manifest.manifest_authentication.tag_b64)
  } catch {
    throw "Backup manifest authentication metadata is not valid base64."
  }
  if ($baseNonce.Length -ne $script:QararBackupNonceLength -or $tag.Length -ne $script:QararBackupTagLength) {
    Clear-QararSensitiveBytes -Bytes $baseNonce
    Clear-QararSensitiveBytes -Bytes $tag
    throw "Backup manifest authentication metadata has an invalid length."
  }

  [byte[]]$nonce = Get-QararChunkNonce -BaseNonce $baseNonce -ChunkIndex ([UInt64]::MaxValue)
  [byte[]]$aad = Get-QararManifestAuthenticationData -Manifest $Manifest
  [byte[]]$empty = [byte[]]::new(0)
  try {
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, $script:QararBackupTagLength)
    try {
      $aes.Decrypt($nonce, $empty, $tag, $empty, $aad)
    } catch [System.Security.Cryptography.CryptographicException] {
      throw "Backup manifest authentication failed."
    } finally {
      $aes.Dispose()
    }
  } finally {
    Clear-QararSensitiveBytes -Bytes $baseNonce
    Clear-QararSensitiveBytes -Bytes $tag
    Clear-QararSensitiveBytes -Bytes $nonce
    Clear-QararSensitiveBytes -Bytes $aad
  }
}

function Read-QararExactBytes {
  [CmdletBinding()]
  param([Parameter(Mandatory)][System.IO.Stream]$Stream, [Parameter(Mandatory)][Int32]$Length)

  if ($Length -lt 0) { throw "Invalid encrypted backup length." }
  [byte[]]$buffer = New-Object byte[] $Length
  $offset = 0
  while ($offset -lt $Length) {
    $read = $Stream.Read($buffer, $offset, $Length - $offset)
    if ($read -le 0) { Clear-QararSensitiveBytes -Bytes $buffer; throw "Encrypted backup is truncated." }
    $offset += $read
  }
  return $buffer
}

function Get-QararChunkCount {
  [CmdletBinding()]
  param([Parameter(Mandatory)][Int64]$PlaintextLength, [Parameter(Mandatory)][Int32]$ChunkSize)

  if ($PlaintextLength -le 0 -or $ChunkSize -le 0) { throw "Backup plaintext length and chunk size must be positive." }
  [Int64]$remainder = 0
  [Int64]$whole = [Math]::DivRem($PlaintextLength, [Int64]$ChunkSize, [ref]$remainder)
  return [UInt64]($whole + $(if ($remainder -gt 0) { 1 } else { 0 }))
}

function Protect-QararBackupFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$PlaintextPath,
    [Parameter(Mandatory)][string]$EncryptedPath,
    [Parameter(Mandatory)][byte[]]$Key,
    [Parameter(Mandatory)][string]$BackupFileName,
    [int]$ChunkSize = $script:QararBackupChunkSize
  )

  Assert-QararPowerShellCryptoSupport
  if ($ChunkSize -lt 65536 -or $ChunkSize -gt 16777216 -or ($ChunkSize % 16 -ne 0)) {
    throw "Backup encryption chunk size must be between 64 KiB and 16 MiB and divisible by 16."
  }
  $baseNonce = $null
  $input = [System.IO.File]::Open($PlaintextPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    [Int64]$plaintextLength = $input.Length
    [UInt64]$chunkCount = Get-QararChunkCount -PlaintextLength $plaintextLength -ChunkSize $ChunkSize
    if ($chunkCount -ge [UInt64]::MaxValue) { throw "Backup is too large for the encrypted envelope format." }
    [byte[]]$baseNonce = New-Object byte[] $script:QararBackupNonceLength
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($baseNonce)
    $output = [System.IO.File]::Open($EncryptedPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    try {
      $writer = [System.IO.BinaryWriter]::new($output, [System.Text.Encoding]::ASCII, $true)
      try {
        $writer.Write($script:QararBackupMagic)
        $writer.Write($script:QararBackupFormatVersion)
        $writer.Write([Int32]$ChunkSize)
        $writer.Write([Int64]$plaintextLength)
        $writer.Write($baseNonce)
        $aes = [System.Security.Cryptography.AesGcm]::new($Key, $script:QararBackupTagLength)
        try {
          [Int64]$processed = 0
          for ([UInt64]$index = 0; $index -lt $chunkCount; $index += 1) {
            [Int32]$length = [Math]::Min([Int64]$ChunkSize, $plaintextLength - $processed)
            [byte[]]$plain = Read-QararExactBytes -Stream $input -Length $length
            [byte[]]$cipher = New-Object byte[] $length
            [byte[]]$tag = New-Object byte[] $script:QararBackupTagLength
            [byte[]]$nonce = Get-QararChunkNonce -BaseNonce $baseNonce -ChunkIndex $index
            [byte[]]$aad = Get-QararChunkAuthenticationData -BackupFileName $BackupFileName -PlaintextLength $plaintextLength -ChunkSize $ChunkSize -BaseNonce $baseNonce -ChunkIndex $index -ChunkLength $length
            try {
              $aes.Encrypt($nonce, $plain, $cipher, $tag, $aad)
              $writer.Write($cipher)
              $writer.Write($tag)
            } finally {
              Clear-QararSensitiveBytes -Bytes $plain
              Clear-QararSensitiveBytes -Bytes $cipher
              Clear-QararSensitiveBytes -Bytes $tag
              Clear-QararSensitiveBytes -Bytes $nonce
              Clear-QararSensitiveBytes -Bytes $aad
            }
            $processed += $length
          }
          $writer.Flush()
        } finally {
          $aes.Dispose()
        }
      } finally {
        $writer.Dispose()
      }
    } finally {
      $output.Dispose()
    }
    return [pscustomobject]@{
      algorithm = "AES-256-GCM"
      envelope_format = "qarar-chunked-aes-gcm-v1"
      nonce_b64 = [Convert]::ToBase64String($baseNonce)
      chunk_size_bytes = $ChunkSize
      tag_length_bytes = $script:QararBackupTagLength
      tag_storage = "appended_to_each_ciphertext_chunk"
      plaintext_bytes = $plaintextLength
      chunk_count = $chunkCount
    }
  } finally {
    if ($input) { $input.Dispose() }
    Clear-QararSensitiveBytes -Bytes $baseNonce
  }
}

function Assert-QararBackupManifestShape {
  [CmdletBinding()]
  param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][string]$BackupPath)

  $backupName = [System.IO.Path]::GetFileName($BackupPath)
  if ($Manifest.format_version -ne $script:QararManifestFormatVersion -or $Manifest.artifact_type -cne "qarar-postgresql-logical-backup" -or $Manifest.backup_filename -cne $backupName) {
    throw "Backup manifest does not match the encrypted backup artifact."
  }
  if ($Manifest.encryption.algorithm -cne "AES-256-GCM" -or $Manifest.encryption.envelope_format -cne "qarar-chunked-aes-gcm-v1" -or $Manifest.encryption.tag_storage -cne "appended_to_each_ciphertext_chunk") {
    throw "Backup manifest declares an unsupported encryption format."
  }
  if ([Int32]$Manifest.encryption.chunk_size_bytes -lt 65536 -or [Int32]$Manifest.encryption.chunk_size_bytes -gt 16777216 -or ([Int32]$Manifest.encryption.chunk_size_bytes % 16 -ne 0) -or [Int32]$Manifest.encryption.tag_length_bytes -ne $script:QararBackupTagLength -or [Int64]$Manifest.encryption.plaintext_bytes -le 0 -or [UInt64]$Manifest.encryption.chunk_count -le 0) {
    throw "Backup manifest encryption parameters are invalid."
  }
  if ($Manifest.backup_sha256 -notmatch '^[a-f0-9]{64}$' -or [Int64]$Manifest.backup_bytes -le 0) {
    throw "Backup manifest backup integrity fields are invalid."
  }
  if ($Manifest.cron_manifest.filename -cne "$backupName.cron.json" -or $Manifest.cron_manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or [Int64]$Manifest.cron_manifest.bytes -le 0) {
    throw "Backup manifest cron integrity fields are invalid."
  }
}

function Unprotect-QararBackupFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$EncryptedPath,
    [Parameter(Mandatory)][string]$PlaintextPath,
    [Parameter(Mandatory)][byte[]]$Key,
    [Parameter(Mandatory)]$Manifest
  )

  Assert-QararBackupManifestShape -Manifest $Manifest -BackupPath $EncryptedPath
  $plaintextCreated = $false
  $plaintextCompleted = $false
  $input = [System.IO.File]::Open($EncryptedPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $reader = [System.IO.BinaryReader]::new($input, [System.Text.Encoding]::ASCII, $true)
    $magic = $null
    $baseNonce = $null
    try {
      [byte[]]$magic = Read-QararExactBytes -Stream $input -Length $script:QararBackupMagic.Length
      [byte]$version = $reader.ReadByte()
      [Int32]$chunkSize = $reader.ReadInt32()
      [Int64]$plaintextLength = $reader.ReadInt64()
      [byte[]]$baseNonce = Read-QararExactBytes -Stream $input -Length $script:QararBackupNonceLength
      if (-not [System.Security.Cryptography.CryptographicOperations]::FixedTimeEquals([byte[]]$magic, [byte[]]$script:QararBackupMagic) -or $version -ne $script:QararBackupFormatVersion -or $chunkSize -ne [Int32]$Manifest.encryption.chunk_size_bytes -or $plaintextLength -ne [Int64]$Manifest.encryption.plaintext_bytes -or [Convert]::ToBase64String($baseNonce) -cne [string]$Manifest.encryption.nonce_b64) {
        throw "Encrypted backup header does not match its authenticated manifest."
      }
      [UInt64]$chunkCount = Get-QararChunkCount -PlaintextLength $plaintextLength -ChunkSize $chunkSize
      if ($chunkCount -ne [UInt64]$Manifest.encryption.chunk_count) { throw "Encrypted backup chunk count does not match its manifest." }
      $output = [System.IO.File]::Open($PlaintextPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      $plaintextCreated = $true
      try {
        $aes = [System.Security.Cryptography.AesGcm]::new($Key, $script:QararBackupTagLength)
        try {
          [Int64]$processed = 0
          for ([UInt64]$index = 0; $index -lt $chunkCount; $index += 1) {
            [Int32]$length = [Math]::Min([Int64]$chunkSize, $plaintextLength - $processed)
            [byte[]]$cipher = Read-QararExactBytes -Stream $input -Length $length
            [byte[]]$tag = Read-QararExactBytes -Stream $input -Length $script:QararBackupTagLength
            [byte[]]$plain = New-Object byte[] $length
            [byte[]]$nonce = Get-QararChunkNonce -BaseNonce $baseNonce -ChunkIndex $index
            [byte[]]$aad = Get-QararChunkAuthenticationData -BackupFileName ([string]$Manifest.backup_filename) -PlaintextLength $plaintextLength -ChunkSize $chunkSize -BaseNonce $baseNonce -ChunkIndex $index -ChunkLength $length
            try {
              $aes.Decrypt($nonce, $cipher, $tag, $plain, $aad)
              $output.Write($plain, 0, $plain.Length)
            } catch [System.Security.Cryptography.CryptographicException] {
              throw "Encrypted backup authentication failed."
            } finally {
              Clear-QararSensitiveBytes -Bytes $cipher
              Clear-QararSensitiveBytes -Bytes $tag
              Clear-QararSensitiveBytes -Bytes $plain
              Clear-QararSensitiveBytes -Bytes $nonce
              Clear-QararSensitiveBytes -Bytes $aad
            }
            $processed += $length
          }
          if ($input.Position -ne $input.Length) { throw "Encrypted backup contains unexpected trailing data." }
          $output.Flush($true)
        } finally {
          $aes.Dispose()
        }
      } finally {
        $output.Dispose()
      }
      Protect-QararPathForOwner -Path $PlaintextPath
      $plaintextCompleted = $true
    } finally {
      $reader.Dispose()
      Clear-QararSensitiveBytes -Bytes $magic
      Clear-QararSensitiveBytes -Bytes $baseNonce
    }
  } catch {
    if ($plaintextCreated -and -not $plaintextCompleted -and (Test-Path -LiteralPath $PlaintextPath -PathType Leaf)) {
      try {
        Remove-Item -LiteralPath $PlaintextPath -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $PlaintextPath -PathType Leaf) {
          throw "partial plaintext file still exists after deletion"
        }
      } catch {
        throw "Encrypted backup processing failed and the partial plaintext could not be removed."
      }
    }
    throw
  } finally {
    $input.Dispose()
  }
}

Export-ModuleMember -Function @(
  "Assert-QararBackupManifestShape",
  "Assert-QararContainerName",
  "Assert-QararManifestAuthenticationTag",
  "Assert-QararPostgresIdentifier",
  "Assert-QararRegularFile",
  "Assert-QararSha256Sidecar",
  "Clear-QararSensitiveBytes",
  "Get-QararBackupEncryptionKey",
  "Get-QararFileSha256Hex",
  "Get-QararManifestAuthenticationData",
  "Get-QararManifestAuthenticationTag",
  "New-QararControlledTemporaryDirectory",
  "Protect-QararBackupFile",
  "Protect-QararPathForOwner",
  "Remove-QararControlledTemporaryDirectory",
  "Test-QararFixedTimeHexEqual",
  "Test-QararProductionEnvironment",
  "Unprotect-QararBackupFile",
  "Write-QararSha256Sidecar"
)
