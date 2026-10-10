#!/usr/bin/env bash
# Rebuilds a throwaway database from supabase/migrations on a plain PostgreSQL 16
# server and runs the pgTAP files. For machines without Docker. It is NOT a
# substitute for the Supabase stack: Auth, Storage, PostgREST, Realtime and
# pg_cron are replaced by minimal stand-ins (bootstrap.sql). Read README_AR.md.
#
#   PGHOST=127.0.0.1 PGPORT=54329 supabase/tests/local-postgres/run.sh [test files...]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
db="${QARAR_TEST_DB:-qarar_local_test}"
admin="${QARAR_TEST_ADMIN:-supabase_admin}"
psql_base=(psql -X -q -v ON_ERROR_STOP=1)

"${psql_base[@]}" -U "$admin" -d postgres -c "drop database if exists $db" -c "create database $db" >/dev/null 2>&1
"${psql_base[@]}" -U "$admin" -d "$db" -v db="$db" -f "$here/bootstrap.sql" >/dev/null

count=0
for migration in "$root"/supabase/migrations/*.sql; do
  if ! PGOPTIONS="-c client_min_messages=warning" "${psql_base[@]}" -U postgres -d "$db" -1 -f "$migration" >/tmp/qarar-migration.log 2>&1; then
    echo "FAILED after $count migrations: $migration"; grep -m3 -A3 ERROR /tmp/qarar-migration.log; exit 1
  fi
  count=$((count + 1))
done
echo "applied $count migrations"

if [ "$#" -eq 0 ]; then set -- "$root"/supabase/tests/database/*.sql; fi
failed=0
for test in "$@"; do
  out="$(PGOPTIONS="-c client_min_messages=warning" psql -X -q -At -U postgres -d "$db" -f "$test" 2>&1 || true)"
  bad="$(printf '%s\n' "$out" | grep -cE '^not ok|ERROR|Looks like' || true)"
  echo "$(basename "$test"): ok=$(printf '%s\n' "$out" | grep -c '^ok' || true) bad=$bad"
  if [ "$bad" != "0" ]; then failed=1; printf '%s\n' "$out" | grep -E '^not ok|ERROR|Looks like|^#' | head -8; fi
done
exit "$failed"
