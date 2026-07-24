#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists qarar_internal;
create table if not exists qarar_internal.applied_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- The CLI image exposes auth.jwt(), while the self-hosted image may only expose
-- auth.uid()/auth.role(). Keep application migrations portable across both stacks.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;
alter function auth.jwt() owner to supabase_auth_admin;
SQL

for migration in $(find /migrations -maxdepth 1 -type f -name '*.sql' | sort); do
  version=$(basename "$migration" .sql)
  applied=$(psql -Atqc "select 1 from qarar_internal.applied_migrations where version = '$version'")
  if [ "$applied" = "1" ]; then
    echo "Skipping applied migration: $version"
    continue
  fi

  echo "Applying migration: $version"
  # Apply the migration and its ledger entry in one transaction. A statement
  # failure or container interruption cannot leave an unrecorded partial schema.
  psql -v ON_ERROR_STOP=1 --single-transaction \
    -f "$migration" \
    -c "insert into qarar_internal.applied_migrations(version) values ('$version')"
done

seed_applied=$(psql -Atqc "select 1 from qarar_internal.applied_migrations where version = 'seed'")
if [ "$seed_applied" != "1" ]; then
  echo "Applying development seed"
  psql -v ON_ERROR_STOP=1 --single-transaction \
    -f /seed/seed.sql \
    -c "insert into qarar_internal.applied_migrations(version) values ('seed')"
fi
