-- Close pre-existing runtime-boundary drift surfaced by the mandatory architecture suite.
begin;

revoke all on function qarar_voting.block_session_end_with_pending_rejection()
  from public,anon,authenticated,service_role;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values(
  'voting','qarar_governance','current_active_topic_title',
  'p_topic_id uuid, p_workflow_instance_step_id uuid, p_expected_version integer',
  'Read the active routed topic title while resolving a rejected vote'
) on conflict do nothing;

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values
  ('governance','qarar_execution','action_item_events','Read task evidence while composing the governed topic journey'),
  ('governance','qarar_meetings','agenda_items','Read meeting agenda history while composing the governed topic journey'),
  ('meetings','qarar_governance','notification_outbox','Enqueue meeting notification events through the governed outbox')
on conflict do nothing;

insert into qarar_architecture.module_table_read_allowlist(
  source_module,target_schema,table_name,rationale
) values(
  'attendance','qarar_core','organizations',
  'Calculate meeting schedule boundaries in the organization timezone'
) on conflict do nothing;
grant select on qarar_core.organizations to qarar_attendance_executor;

commit;
