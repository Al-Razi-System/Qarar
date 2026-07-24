#!/bin/sh
set -eu

compose="docker compose --env-file supabase/docker/.env -f supabase/docker/docker-compose.yml"
first_pid=''
second_pid=''

cleanup() {
  [ -z "$first_pid" ] || kill "$first_pid" >/dev/null 2>&1 || true
  [ -z "$second_pid" ] || kill "$second_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

$compose run --rm --no-deps \
  -e QARAR_MIGRATION_LOCK_HOLD_SECONDS=8 \
  db-migrate >/tmp/qarar-migration-first.log 2>&1 &
first_pid=$!

attempt=0
while :; do
  granted=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
    "select count(*) from pg_locks where locktype='advisory' and classid=19017 and objid=20260724 and granted")
  [ "$granted" = "1" ] && break
  attempt=$((attempt + 1))
  [ "$attempt" -lt 20 ] || {
    cat /tmp/qarar-migration-first.log
    echo "First migration runner did not acquire the advisory lock" >&2
    exit 1
  }
  sleep 1
done

$compose run --rm --no-deps db-migrate >/tmp/qarar-migration-second.log 2>&1 &
second_pid=$!

attempt=0
while :; do
  waiting=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
    "select count(*) from pg_locks where locktype='advisory' and classid=19017 and objid=20260724 and not granted")
  [ "$waiting" = "1" ] && break
  if ! kill -0 "$second_pid" >/dev/null 2>&1; then
    cat /tmp/qarar-migration-second.log
    echo "Second migration runner exited instead of waiting for the lock" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  [ "$attempt" -lt 10 ] || {
    cat /tmp/qarar-migration-second.log
    echo "Second migration runner was not observed waiting for the advisory lock" >&2
    exit 1
  }
  sleep 1
done

wait "$first_pid"
first_pid=''
wait "$second_pid"
second_pid=''

remaining=$(docker exec qarar-supabase-db psql -U supabase_admin -d postgres -Atqc \
  "select count(*) from pg_locks where locktype='advisory' and classid=19017 and objid=20260724")
[ "$remaining" = "0" ] || {
  echo "Migration advisory lock leaked after concurrent runners completed" >&2
  exit 1
}

trap - EXIT INT TERM
echo "Concurrent migration runners serialized successfully"
