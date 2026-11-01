-- The trigger routines are internal-only and must not inherit PostgreSQL's public EXECUTE default.
begin;

revoke all on function qarar_meetings.guard_agenda_voting_policy()
  from public,anon,authenticated,service_role;
revoke all on function qarar_voting.guard_optional_direct_vote()
  from public,anon,authenticated,service_role;

commit;
