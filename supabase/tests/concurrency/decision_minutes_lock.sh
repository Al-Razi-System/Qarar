#!/usr/bin/env bash
# Two real sessions race a decision text edit against minutes submission and
# check that the shared per-meeting lock serialises them (20261010030000).
# It commits a fixture, so run it against a throwaway database only, e.g. the
# one supabase/tests/local-postgres/run.sh builds:
#
#   PGHOST=127.0.0.1 PGPORT=54329 PGDATABASE=qarar_local_test PGUSER=postgres \
#     supabase/tests/concurrency/decision_minutes_lock.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
hold=${QARAR_LOCK_HOLD_SECONDS:-3}
meeting=89000000-0000-0000-0000-000000000081
chair='{"sub":"89000000-0000-0000-0000-000000000011","role":"authenticated"}'
rapporteur='{"sub":"89000000-0000-0000-0000-000000000012","role":"authenticated"}'
psql_q=(psql -X -q -At -v ON_ERROR_STOP=0)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

check() { # check <description> <condition-result>
  if [ "$2" = "yes" ]; then echo "ok - $1"; else echo "not ok - $1"; failures=$((failures + 1)); fi
}

lock_held() {
  "${psql_q[@]}" -c "select exists(select 1 from pg_locks where locktype='advisory' and granted
    and ((classid::bigint<<32)|objid::bigint)=hashtextextended('meeting-minutes-sync:$meeting',0))"
}

wait_for_lock() { # gives the first session a second to take the lock, then lets the checks judge
  for _ in $(seq 1 10); do
    [ "$(lock_held)" = "t" ] && return 0
    sleep 0.1
  done
  echo "# the first session holds no meeting lock" >&2
}

if [ "$("${psql_q[@]}" -c "select exists(select 1 from public.organizations where id='89000000-0000-0000-0000-000000000001')")" = "t" ]; then
  echo "the fixture already exists; rebuild the throwaway database first" >&2
  exit 1
fi
psql -X -q -v ON_ERROR_STOP=1 -f "$here/decision_minutes_lock_setup.sql" >/dev/null

# Scenario 1: the rapporteur's edit holds the lock; the chair submits the old draft.
cat >"$work/edit.sql" <<SQL
select id as decision_id, updated_at as token from qarar_decisions.decisions where meeting_id='$meeting' \gset
begin;
set local role authenticated;
set local request.jwt.claims='$rapporteur';
select api_v1.update_meeting_decision_text(:'decision_id','Approve the proposal with the amended budget.',:'token')->>'changed';
select pg_sleep($hold);
commit;
SQL
cat >"$work/submit.sql" <<SQL
select content_draft as draft, updated_at as token from qarar_minutes.meeting_minutes where meeting_id='$meeting' \gset
set role authenticated;
set request.jwt.claims='$chair';
select api_v1.submit_meeting_minutes('$meeting',:'draft',:'token')->>'status';
SQL
"${psql_q[@]}" -f "$work/edit.sql" >"$work/edit.out" 2>&1 &
editor=$!
wait_for_lock
started=$(date +%s.%N)
"${psql_q[@]}" -f "$work/submit.sql" >"$work/submit.out" 2>&1 || true
waited=$(echo "$(date +%s.%N) - $started" | bc)
wait "$editor"
check "the edit commits" "$(grep -qx true "$work/edit.out" && echo yes || echo no)"
check "the submission waited for the edit to commit (${waited}s, hold ${hold}s)" "$(echo "$waited >= $hold - 1" | bc | sed 's/1/yes/;s/0/no/')"
check "the submission then sees the new text and refuses the old draft" "$(grep -q 'لا يطابق نصه الحالي' "$work/submit.out" && echo yes || echo no)"

# Scenario 2: the chair's submission of a regenerated draft holds the lock; the rapporteur edits.
"${psql_q[@]}" -c "set role authenticated; set request.jwt.claims='$chair'; select api_v1.generate_meeting_minutes_draft('$meeting')" >/dev/null
cat >"$work/submit2.sql" <<SQL
select content_draft as draft, updated_at as token from qarar_minutes.meeting_minutes where meeting_id='$meeting' \gset
begin;
set local role authenticated;
set local request.jwt.claims='$chair';
select api_v1.submit_meeting_minutes('$meeting',:'draft',:'token')->>'status';
select pg_sleep($hold);
commit;
SQL
cat >"$work/edit2.sql" <<SQL
select id as decision_id, updated_at as token from qarar_decisions.decisions where meeting_id='$meeting' \gset
set role authenticated;
set request.jwt.claims='$rapporteur';
select api_v1.update_meeting_decision_text(:'decision_id','Approve the proposal; wording changed during submission.',:'token')->>'changed';
SQL
"${psql_q[@]}" -f "$work/submit2.sql" >"$work/submit2.out" 2>&1 &
submitter=$!
wait_for_lock
started=$(date +%s.%N)
"${psql_q[@]}" -f "$work/edit2.sql" >"$work/edit2.out" 2>&1 || true
waited=$(echo "$(date +%s.%N) - $started" | bc)
wait "$submitter"
check "the regenerated minutes are submitted" "$(grep -qx ready_for_approval "$work/submit2.out" && echo yes || echo no)"
check "the edit waited for the submission to commit (${waited}s, hold ${hold}s)" "$(echo "$waited >= $hold - 1" | bc | sed 's/1/yes/;s/0/no/')"
check "the edit then sees the minutes out for approval and is refused" "$(grep -q 'المحضر معروض للمصادقة' "$work/edit2.out" && echo yes || echo no)"

final_text=$("${psql_q[@]}" -c "select decision_text from qarar_decisions.decisions where meeting_id='$meeting'")
certified=$("${psql_q[@]}" -c "select strpos(content_final,'$final_text')>0 from qarar_minutes.meeting_minutes where meeting_id='$meeting'")
check "the minutes out for approval carry the decision text as it stands" "$([ "$certified" = "t" ] && echo yes || echo no)"

if [ "$failures" -gt 0 ]; then
  for f in "$work"/*.out; do echo "--- $(basename "$f")"; cat "$f"; done
  exit 1
fi
