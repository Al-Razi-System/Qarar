#!/bin/sh
set -eu

# Development fixtures are opt-in at the deployment boundary. The production
# compose overlay sets this to false so the migration runner can keep mounting
# the tracked seed file without ever executing it in production.
apply_seed=${QARAR_APPLY_SEED:-true}
case "$apply_seed" in
  true|false) ;;
  *)
    echo "QARAR_APPLY_SEED must be either true or false" >&2
    exit 1
    ;;
esac

lock_output=$(mktemp)
lock_pid=''
lock_backend_pid=''
release_migration_lock() {
  if [ -n "$lock_backend_pid" ]; then
    psql -Atq -c "select pg_terminate_backend($lock_backend_pid)" >/dev/null 2>&1 || true
  fi
  if [ -n "$lock_pid" ]; then
    kill "$lock_pid" >/dev/null 2>&1 || true
    wait "$lock_pid" >/dev/null 2>&1 || true
  fi
  rm -f "$lock_output"
}
trap release_migration_lock EXIT INT TERM

# Keep one database session alive for the whole migration batch. Competing
# runners block on the same two-part key until this process disconnects.
psql -Atq >"$lock_output" 2>&1 <<'SQL' &
select 'QARAR_MIGRATION_LOCK_BACKEND=' || pg_backend_pid();
select pg_advisory_lock(19017, 20260724);
select 'QARAR_MIGRATION_LOCK_ACQUIRED';
select pg_sleep(2147483647);
SQL
lock_pid=$!

while ! grep -q 'QARAR_MIGRATION_LOCK_ACQUIRED' "$lock_output"; do
  if ! kill -0 "$lock_pid" >/dev/null 2>&1; then
    cat "$lock_output" >&2
    echo "Migration lock session terminated before acquiring the lock" >&2
    exit 1
  fi
  sleep 1
done
lock_backend_pid=$(sed -n 's/^QARAR_MIGRATION_LOCK_BACKEND=//p' "$lock_output" | head -1)
case "$lock_backend_pid" in
  ''|*[!0-9]*)
    cat "$lock_output" >&2
    echo "Migration lock backend PID was not reported" >&2
    exit 1
    ;;
esac

lock_hold_seconds=${QARAR_MIGRATION_LOCK_HOLD_SECONDS:-0}
case "$lock_hold_seconds" in
  ''|*[!0-9]*)
    echo "QARAR_MIGRATION_LOCK_HOLD_SECONDS must be a non-negative integer" >&2
    exit 1
    ;;
esac
if [ "$lock_hold_seconds" -gt 0 ]; then
  sleep "$lock_hold_seconds"
fi

psql -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare migration_role record;
begin
  select rolsuper, rolcreaterole, rolbypassrls
  into migration_role
  from pg_roles
  where rolname = current_user;

  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Qarar requires PostgreSQL 15 or newer';
  end if;
  if not migration_role.rolsuper
     or not migration_role.rolcreaterole
     or not migration_role.rolbypassrls then
    raise exception
      'Migration role % must be SUPERUSER, CREATEROLE, and BYPASSRLS in the self-hosted environment',
      current_user;
  end if;
  if not exists(select 1 from pg_language where lanname = 'plpgsql') then
    raise exception 'PL/pgSQL is required';
  end if;
end;
$$;

create schema if not exists qarar_internal;
create table if not exists qarar_internal.applied_migrations (
  version text primary key,
  checksum_sha256 text,
  applied_at timestamptz not null default now()
);
alter table qarar_internal.applied_migrations
  add column if not exists checksum_sha256 text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'qarar_internal.applied_migrations'::regclass
      and conname = 'applied_migrations_checksum_sha256_check'
  ) then
    alter table qarar_internal.applied_migrations
      add constraint applied_migrations_checksum_sha256_check
      check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

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

-- Supabase images differ in how auth.uid()/auth.role() read PostgREST claims:
-- some use the legacy request.jwt.claim.* settings while newer gateways set a
-- JSON request.jwt.claim(s). Accept both representations so authorization does
-- not silently lose the caller identity after an image or gateway upgrade.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(auth.jwt() ->> 'sub', '')::uuid
  );
$$;
alter function auth.uid() owner to supabase_auth_admin;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.jwt() ->> 'role', '')
  );
$$;
alter function auth.role() owner to supabase_auth_admin;
SQL

# A migration image must be able to account for every entry already recorded
# by the target database before it changes that database. Without this gate a
# rebuilt image can silently continue from a ledger whose historical source
# files are missing, making restore and incident recovery non-reproducible.
applied_versions=$(psql -Atqc "select version from qarar_internal.applied_migrations where version <> 'seed' order by version")
for applied_version in $applied_versions; do
  if [ ! -f "/migrations/$applied_version.sql" ]; then
    echo "Applied migration is absent from this release image: $applied_version" >&2
    exit 1
  fi
done

for migration in $(find /migrations -maxdepth 1 -type f -name '*.sql' | sort); do
  version=$(basename "$migration" .sql)
  checksum=$(sha256sum "$migration" | awk '{print $1}')
  applied=$(psql -Atqc "select checksum_sha256 from qarar_internal.applied_migrations where version = '$version'")
  exists=$(psql -Atqc "select exists(select 1 from qarar_internal.applied_migrations where version = '$version')")
  if [ "$exists" = "t" ]; then
    if [ -z "$applied" ]; then
      psql -v ON_ERROR_STOP=1 -c \
        "update qarar_internal.applied_migrations set checksum_sha256 = '$checksum' where version = '$version' and checksum_sha256 is null"
    elif [ "$applied" != "$checksum" ]; then
      echo "Checksum mismatch for applied migration: $version" >&2
      exit 1
    fi
    echo "Skipping verified migration: $version"
    continue
  fi

  echo "Applying migration: $version"
  # Apply the migration and its ledger entry in one transaction. A statement
  # failure or container interruption cannot leave an unrecorded partial schema.
  psql -v ON_ERROR_STOP=1 --single-transaction \
    -f "$migration" \
    -c "insert into qarar_internal.applied_migrations(version,checksum_sha256) values ('$version','$checksum')"
done

if [ "$apply_seed" = "true" ]; then
  seed_checksum=$(sha256sum /seed/seed.sql | awk '{print $1}')
  seed_applied=$(psql -Atqc "select checksum_sha256 from qarar_internal.applied_migrations where version = 'seed'")
  seed_exists=$(psql -Atqc "select exists(select 1 from qarar_internal.applied_migrations where version = 'seed')")
  if [ "$seed_exists" != "t" ]; then
    echo "Applying development seed"
    psql -v ON_ERROR_STOP=1 --single-transaction \
      -f /seed/seed.sql \
      -c "insert into qarar_internal.applied_migrations(version,checksum_sha256) values ('seed','$seed_checksum')"
  elif [ -z "$seed_applied" ]; then
    psql -v ON_ERROR_STOP=1 -c \
      "update qarar_internal.applied_migrations set checksum_sha256 = '$seed_checksum' where version = 'seed' and checksum_sha256 is null"
  elif [ "$seed_applied" != "$seed_checksum" ]; then
    echo "Checksum mismatch for applied development seed" >&2
    exit 1
  fi
else
  echo "Skipping development seed (QARAR_APPLY_SEED=false)"
fi
