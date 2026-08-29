begin;

-- These calls are deliberate module-to-module commands.  Keep their grants
-- constrained and record them in the architecture ledger so clean installs
-- cannot silently acquire broad EXECUTE privileges.
insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values
  ('decisions', 'qarar_attendance', 'can_manage_live_meeting',
   'p_meeting_id uuid', 'Authorize governed decision finalization during a live meeting'),
  ('voting', 'qarar_attendance', 'can_manage_live_meeting',
   'p_meeting_id uuid', 'Authorize governed voting closure during a live meeting'),
  ('meetings', 'qarar_governance', 'get_topic_agenda_context',
   'p_topic_id uuid', 'Load reviewed governance context while preparing an agenda')
on conflict do nothing;

grant usage on schema qarar_attendance, qarar_governance
  to qarar_decisions_executor, qarar_voting_executor, qarar_meetings_executor;

grant execute on function qarar_attendance.can_manage_live_meeting(uuid)
  to qarar_decisions_executor, qarar_voting_executor;
grant execute on function qarar_governance.get_topic_agenda_context(uuid)
  to qarar_meetings_executor;

commit;
