#!/bin/sh
set -eu

db_super_user=${DB_SUPER_USER:-supabase_admin}
total=0
for test_file in $(find supabase/tests/database -maxdepth 1 -type f -name '*.sql' \
  ! -name '04_*' ! -name '05_*' | sort); do
  plan=$(sed -n 's/.*select plan(\([0-9][0-9]*\)).*/\1/p' "$test_file" | head -1)
  total=$((total + ${plan:-0}))
  output=$(docker exec -i qarar-supabase-db \
    psql -U "$db_super_user" -d postgres -v ON_ERROR_STOP=1 < "$test_file")
  if printf '%s\n' "$output" | grep -q 'not ok'; then
    printf '%s\n' "$output"
    echo "Failed: $test_file" >&2
    exit 1
  fi
  echo "Passed: $test_file"
done
echo "Completed database assertions: $total"
