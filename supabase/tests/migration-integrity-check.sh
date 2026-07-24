#!/bin/sh
set -eu

compose="docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml"
version=$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort | head -1)
version=$(basename "$version" .sql)
original_checksum=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
  "select checksum_sha256 from qarar_internal.applied_migrations where version='$version'")

[ -n "$original_checksum" ] || {
  echo "Applied migration $version has no checksum" >&2
  exit 1
}

restore_checksum() {
  docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
    "update qarar_internal.applied_migrations set checksum_sha256='$original_checksum' where version='$version'" \
    >/dev/null 2>&1 || true
}
trap restore_checksum EXIT INT TERM

docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
  "update qarar_internal.applied_migrations set checksum_sha256='$(printf '0%.0s' $(seq 1 64))' where version='$version'"

if $compose run --rm --no-deps db-migrate >/tmp/qarar-migration-integrity.log 2>&1; then
  cat /tmp/qarar-migration-integrity.log
  echo "Migration runner accepted a modified applied checksum" >&2
  exit 1
fi

grep -q "Checksum mismatch for applied migration: $version" /tmp/qarar-migration-integrity.log || {
  cat /tmp/qarar-migration-integrity.log
  echo "Migration runner failed for an unexpected reason" >&2
  exit 1
}

restore_checksum
trap - EXIT INT TERM

lock_count=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
  "select count(*) from pg_locks where locktype='advisory' and classid=19017 and objid=20260724")
[ "$lock_count" = "0" ] || {
  echo "Migration advisory lock leaked after checksum rejection" >&2
  exit 1
}

echo "Migration checksum rejection and advisory-lock cleanup passed"
