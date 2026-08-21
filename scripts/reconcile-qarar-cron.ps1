param(
  [string]$Container = "qarar-supabase-db",
  [string]$Database = "postgres",
  [string]$User = "supabase_admin"
)

$ErrorActionPreference = "Stop"

# Run this only after restoring the maintenance database. pg_cron is excluded
# from the logical dump because its jobs are bound to that database; the
# migration-defined reconciliation function recreates the reviewed schedules.
$result = "select qarar_internal.reconcile_qarar_cron_jobs();" |
  docker exec -i $Container psql -X -U $User -d $Database -At -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Cron reconciliation query failed" }

try { $payload = $result.Trim() | ConvertFrom-Json } catch { throw "Cron reconciliation returned invalid JSON" }
if (-not $payload.ready) { throw "Cron reconciliation failed: $($payload | ConvertTo-Json -Compress)" }

Write-Output "Cron reconciliation passed: $($payload.jobs -join ', ')"
