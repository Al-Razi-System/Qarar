#!/bin/sh
set -eu

compose="docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml"
upgrade_cutoff="20260724040000"

is_upgrade_migration() {
  version=$1
  [ "$(printf '%s\n%s\n' "$version" "$upgrade_cutoff" | sort | head -n 1)" = "$upgrade_cutoff" ]
}

apply_migration() {
  migration=$1
  version=$(basename "$migration" .sql)
  checksum=$(sha256sum "$migration" | awk '{print $1}')
  {
    cat "$migration"
    printf "\ninsert into qarar_internal.applied_migrations(version,checksum_sha256) values ('%s','%s');\n" \
      "$version" "$checksum"
  } | docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres \
    -v ON_ERROR_STOP=1 --single-transaction
}

attempt=0
until $compose pull db; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 4 ] || { echo "database image pull failed" >&2; exit 1; }
  sleep $((attempt * 15))
done
$compose up -d --pull never db

# The Supabase image exposes a temporary PostgreSQL server while its
# entrypoint migrations run, so pg_isready alone can report a false-ready
# state. Wait until the entrypoint has either completed first-time
# initialization or explicitly skipped it for an existing data directory.
attempt=0
until docker logs qarar-supabase-db 2>&1 |
  grep -Eq 'PostgreSQL init process complete|Skipping initialization'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 120 ] || {
    echo "database entrypoint initialization did not complete" >&2
    docker logs qarar-supabase-db --tail 100 >&2
    exit 1
  }
  sleep 1
done

attempt=0
until docker exec qarar-supabase-db pg_isready -U supabase_admin -d postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo "database did not become ready" >&2; exit 1; }
  sleep 2
done

docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists qarar_internal;
create table if not exists qarar_internal.applied_migrations(
 version text primary key,
 checksum_sha256 text,
 applied_at timestamptz not null default now()
);
alter table qarar_internal.applied_migrations
 add column if not exists checksum_sha256 text;
-- The database image initializes auth.users, while GoTrue normally creates
-- auth.sessions on first start. The upgrade rehearsal runs without GoTrue so
-- project migrations cannot be applied accidentally by its Compose dependency.
create table if not exists auth.sessions(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create or replace function auth.jwt()
returns jsonb language sql stable as $$
 select coalesce(
  nullif(current_setting('request.jwt.claim',true),''),
  nullif(current_setting('request.jwt.claims',true),''),
  '{}'
 )::jsonb
$$;
SQL

for migration in $(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort); do
  version=$(basename "$migration" .sql)
  if ! is_upgrade_migration "$version"; then
    apply_migration "$migration"
  fi
done

docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into public.organizations(id,code,name_ar)
values('91000000-0000-0000-0000-000000000001','upgrade-fixture','Upgrade Fixture');
insert into auth.users(id,email)
values('91000000-0000-0000-0000-000000000011','upgrade@example.test');
insert into public.users(id,organization_id,email,full_name_ar)
values('91000000-0000-0000-0000-000000000011',
 '91000000-0000-0000-0000-000000000001','upgrade@example.test','Upgrade User');
insert into public.governance_unit_types(id,organization_id,code,name_ar)
values('91000000-0000-0000-0000-000000000021',
 '91000000-0000-0000-0000-000000000001','committee','Committee');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar)
values('91000000-0000-0000-0000-000000000022',
 '91000000-0000-0000-0000-000000000001',
 '91000000-0000-0000-0000-000000000021','upgrade-unit','Upgrade Unit');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status)
values('91000000-0000-0000-0000-000000000031',
 '91000000-0000-0000-0000-000000000001','UPGRADE-1','Upgrade Topic',
 '91000000-0000-0000-0000-000000000022',
 '91000000-0000-0000-0000-000000000011','new');
SQL

for migration in $(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort); do
  version=$(basename "$migration" .sql)
  if is_upgrade_migration "$version"; then
    apply_migration "$migration"
  fi
done

docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
 if not exists(
  select 1 from qarar_topics.topics t
  join qarar_core.governance_units u on u.id=t.current_unit_id
  join qarar_iam.users usr on usr.id=t.submitted_by_user_id
  where t.id='91000000-0000-0000-0000-000000000031'
   and u.organization_id=t.organization_id
   and usr.organization_id=t.organization_id
 ) then raise exception 'upgrade fixture or tenant relationships were not preserved'; end if;
 if exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in('r','p')
 ) then raise exception 'application base tables remain in public'; end if;
end $$;
SQL

# A deliberately failing migration must leave neither its DDL nor its ledger row.
set +e
docker exec -i qarar-supabase-db psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction >/dev/null 2>&1 <<'SQL'
create table qarar_internal.atomic_failure_probe(id integer);
insert into qarar_internal.applied_migrations(version) values('atomic_failure_probe');
select 1/0;
SQL
failure_status=$?
set -e
[ "$failure_status" -ne 0 ] || { echo "failure injection unexpectedly succeeded" >&2; exit 1; }

probe=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atc \
 "select to_regclass('qarar_internal.atomic_failure_probe') is null
  and not exists(select 1 from qarar_internal.applied_migrations where version='atomic_failure_probe')")
[ "$probe" = "t" ] || { echo "migration rollback was not atomic" >&2; exit 1; }

echo "Existing-data upgrade and atomic failure rollback passed"
