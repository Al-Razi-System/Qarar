#!/bin/sh
# Explicit isolated target only; never defaults to development or production.
set -eu
test_container=${DB_CONTAINER:?Set DB_CONTAINER to an isolated test container}
case "$test_container" in
  qarar-council-test-db-*) ;;
  *) echo 'Refusing non-isolated database target' >&2; exit 1 ;;
esac
test_role=${DB_SUPER_USER:-supabase_admin}
test_failures=0
test_files=0
for test_file in supabase/tests/database/*.sql; do
  test_files=$((test_files + 1))
  if test_output=$(docker exec -i "$test_container" psql -X -U "$test_role" \
    -d postgres -v ON_ERROR_STOP=1 < "$test_file" 2>&1) \
    && ! printf '%s\n' "$test_output" | rg -q 'not ok|Looks like you'; then
    echo "PASS $test_file"
  else
    test_failures=$((test_failures + 1))
    echo "FAIL $test_file"
    printf '%s\n' "$test_output" | rg 'not ok|ERROR|^#' || true
  fi
done
echo "Files: $test_files; failed: $test_failures"
test "$test_failures" -eq 0
