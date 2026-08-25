param(
    [string]$Container = "qarar-supabase-db",
    [string]$Database = "postgres",
    [string]$DatabaseUser = "supabase_admin",
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repositoryRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot "docs\technical\database"
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$jsonPath = Join-Path $OutputDirectory "qarar-schema-reference.json"
$markdownPath = Join-Path $OutputDirectory "Qarar_Database_Schema_Reference_Arabic.md"

$sql = @'
with app_namespaces as (
  select oid,nspname
  from pg_namespace
  where nspname = 'public' or nspname = 'api_v1' or nspname like 'qarar\_%' escape '\'
), relations as (
  select c.oid,n.nspname as schema_name,c.relname as relation_name,c.relkind
  from pg_class c join app_namespaces n on n.oid=c.relnamespace
  where c.relkind in ('r','p','v','m','f')
), payload as (
  select jsonb_build_object(
    'generated_at',clock_timestamp(),
    'database',current_database(),
    'schemas',(select jsonb_agg(nspname order by nspname) from app_namespaces),
    'relations',coalesce((select jsonb_agg(jsonb_build_object(
      'schema',r.schema_name,
      'name',r.relation_name,
      'kind',case r.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' when 'm' then 'materialized_view' when 'f' then 'foreign_table' end,
      'columns',coalesce((select jsonb_agg(jsonb_build_object(
        'position',a.attnum,
        'name',a.attname,
        'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
        'nullable',not a.attnotnull,
        'default',pg_get_expr(ad.adbin,ad.adrelid),
        'identity',nullif(a.attidentity,''),
        'generated',nullif(a.attgenerated,'')
      ) order by a.attnum)
        from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
        where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
      'constraints',coalesce((select jsonb_agg(jsonb_build_object(
        'name',con.conname,
        'type',case con.contype when 'p' then 'primary_key' when 'f' then 'foreign_key' when 'u' then 'unique' when 'c' then 'check' when 'x' then 'exclusion' else con.contype::text end,
        'definition',pg_get_constraintdef(con.oid,true)
      ) order by con.contype,con.conname) from pg_constraint con where con.conrelid=r.oid),'[]'::jsonb),
      'indexes',coalesce((select jsonb_agg(jsonb_build_object('name',i.indexname,'definition',i.indexdef) order by i.indexname)
        from pg_indexes i where i.schemaname=r.schema_name and i.tablename=r.relation_name),'[]'::jsonb)
    ) order by r.schema_name,r.relation_name) from relations r),'[]'::jsonb),
    'routines',coalesce((select jsonb_agg(jsonb_build_object(
      'schema',n.nspname,
      'name',p.proname,
      'arguments',pg_get_function_identity_arguments(p.oid),
      'result',pg_get_function_result(p.oid),
      'language',l.lanname,
      'security_definer',p.prosecdef
    ) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
      from pg_proc p join app_namespaces n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang),'[]'::jsonb),
    'enums',coalesce((select jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',t.typname,
      'values',(select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid)
    ) order by n.nspname,t.typname)
      from pg_type t join app_namespaces n on n.oid=t.typnamespace where t.typtype='e'),'[]'::jsonb)
  ) as document
)
select jsonb_pretty(document) from payload;
'@

$rawJson = $sql | & docker exec -i $Container psql -X -q -v ON_ERROR_STOP=1 -U $DatabaseUser -d $Database -At
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawJson)) {
    throw "Database schema export failed. Verify that container '$Container' is running."
}

[System.IO.File]::WriteAllText($jsonPath,($rawJson -join [Environment]::NewLine),$utf8)
$schema = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8 | ConvertFrom-Json

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Qarar Database Schema Reference")
$lines.Add("")
$lines.Add("> Generated from the live database. Do not edit manually. Run ``scripts/export-database-schema-reference.ps1`` after every migration.")
$lines.Add("")
$lines.Add("- Generated at: ``$($schema.generated_at)``")
$lines.Add("- Database: ``$($schema.database)``")
$lines.Add("- Relations: **$($schema.relations.Count)**")
$lines.Add("- Routines and API contracts: **$($schema.routines.Count)**")
$lines.Add("")
$lines.Add("## Included Schemas")
$lines.Add("")
$lines.Add(($schema.schemas | ForEach-Object { "``$_``" }) -join ", ")
$lines.Add("")
$lines.Add("## Relations and Columns")

foreach ($relation in $schema.relations) {
    $lines.Add("")
    $lines.Add("### ``$($relation.schema).$($relation.name)``")
    $lines.Add("")
    $lines.Add("Kind: ``$($relation.kind)``")
    $lines.Add("")
    $lines.Add("| # | Column | Type | Nullable | Default |")
    $lines.Add("|---:|---|---|:---:|---|")
    foreach ($column in $relation.columns) {
        $default = if ($null -eq $column.default) { "-" } else { ([string]$column.default).Replace("|","\|") }
        $nullable = if ($column.nullable) { "yes" } else { "no" }
        $lines.Add("| $($column.position) | ``$($column.name)`` | ``$($column.type)`` | $nullable | ``$default`` |")
    }
    if ($relation.constraints.Count -gt 0) {
        $lines.Add("")
        $lines.Add("**Constraints and relationships**")
        foreach ($constraint in $relation.constraints) {
            $lines.Add("- ``$($constraint.name)`` ($($constraint.type)): ``$($constraint.definition)``")
        }
    }
    if ($relation.indexes.Count -gt 0) {
        $lines.Add("")
        $lines.Add("**Indexes**")
        foreach ($index in $relation.indexes) {
            $lines.Add("- ``$($index.name)``: ``$($index.definition)``")
        }
    }
}

$lines.Add("")
$lines.Add("## Routines and API Contracts")
$lines.Add("")
$lines.Add("| Schema | Routine | Arguments | Result | SECURITY DEFINER |")
$lines.Add("|---|---|---|---|:---:|")
foreach ($routine in $schema.routines) {
    $arguments = ([string]$routine.arguments).Replace("|","\|")
    $result = ([string]$routine.result).Replace("|","\|")
    $security = if ($routine.security_definer) { "yes" } else { "no" }
    $lines.Add("| ``$($routine.schema)`` | ``$($routine.name)`` | ``$arguments`` | ``$result`` | $security |")
}

[System.IO.File]::WriteAllLines($markdownPath,$lines,$utf8)
Write-Host "Schema reference generated:"
Write-Host "  $markdownPath"
Write-Host "  $jsonPath"
