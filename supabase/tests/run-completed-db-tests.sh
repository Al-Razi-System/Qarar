#!/bin/sh
set -eu

# Runs every pgTAP file, then fails if any failed. Running them all (instead of
# stopping at the first failure) keeps the result of each file visible in CI.
db_super_user=${DB_SUPER_USER:-supabase_admin}
total=0
failed=''
for test_file in $(find supabase/tests/database -maxdepth 1 -type f -name '*.sql' \
  ! -name '04_*' ! -name '05_*' | sort); do
  plan=$(sed -n 's/.*select plan(\([0-9][0-9]*\)).*/\1/p' "$test_file" | head -1)
  total=$((total + ${plan:-0}))
  if output=$(docker exec -i qarar-supabase-db \
    psql -U "$db_super_user" -d postgres -v ON_ERROR_STOP=1 < "$test_file" 2>&1) \
    && ! printf '%s\n' "$output" | grep -q 'not ok'; then
    echo "Passed: $test_file"
  else
    printf '%s\n' "$output" | grep -E 'not ok|ERROR|^#' | head -20
    echo "Failed: $test_file" >&2
    failed="$failed $test_file"
  fi
done
echo "Completed database assertions: $total"
if [ -n "$failed" ]; then
  echo "Failed files:$failed" >&2
  exit 1
fi
