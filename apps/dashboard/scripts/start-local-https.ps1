param(
    [string]$NetworkIp,
    [int]$Port = 3300
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $NetworkIp) {
    $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
        Sort-Object RouteMetric, InterfaceMetric |
        Select-Object -First 1
    $NetworkIp = (Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1).IPAddress
}

if (-not $NetworkIp) {
    throw "Unable to detect a LAN IPv4 address. Pass it with -NetworkIp."
}

$certificate = node "$PSScriptRoot\generate-local-https-cert.mjs" $NetworkIp | ConvertFrom-Json
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $projectRoot)
$envFileCandidates = @(
    (Join-Path $repositoryRoot "supabase\docker\.env"),
    (Join-Path (Split-Path -Parent $repositoryRoot) "Qarar-core01\supabase\docker\.env"),
    (Join-Path (Split-Path -Parent $projectRoot) "production-ready-v1\supabase\docker\.env")
)
$envFile = $envFileCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $envFile) {
    throw "The local Supabase environment file was not found."
}

$config = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        $config[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$env:APP_ORIGIN = "https://${NetworkIp}:$Port"
$env:APP_ORIGIN_ALIASES = "https://localhost:$Port,https://127.0.0.1:$Port"
$env:QARAR_ALLOWED_DEV_ORIGINS = "$NetworkIp,localhost,127.0.0.1"
$env:QARAR_SUPABASE_URL = $config["SUPABASE_PUBLIC_URL"]
$env:QARAR_SUPABASE_ANON_KEY = $config["ANON_KEY"]
$env:NEXT_TELEMETRY_DISABLED = "1"

Write-Host "Qarar HTTPS: https://${NetworkIp}:$Port" -ForegroundColor Green
Write-Host "Local HTTPS: https://localhost:$Port" -ForegroundColor Green
Write-Host "Certificate: $($certificate.certificatePath)" -ForegroundColor DarkGray

Set-Location -LiteralPath $projectRoot
& node "node_modules\next\dist\bin\next" dev `
    -H 0.0.0.0 `
    -p $Port `
    --experimental-https `
    --experimental-https-key $certificate.keyPath `
    --experimental-https-cert $certificate.certificatePath
