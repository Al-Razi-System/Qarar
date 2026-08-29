begin;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,
  target_schema,
  function_name,
  identity_arguments,
  rationale
) values (
  'attendance',
  'qarar_iam',
  'has_unit_role_code',
  'target_unit_id uuid, role_codes text[]',
  'Authorize council chairs through the shared live-meeting guard'
)
on conflict do nothing;

grant usage on schema qarar_iam to qarar_attendance_executor;
grant execute on function qarar_iam.has_unit_role_code(uuid,text[])
  to qarar_attendance_executor;

commit;
