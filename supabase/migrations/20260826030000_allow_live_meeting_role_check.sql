begin;

-- The shared live-meeting guard is owned by the attendance module and checks
-- the governance-admin role before voting and meeting commands proceed.
insert into qarar_architecture.module_function_execute_allowlist(
  source_module,
  target_schema,
  function_name,
  identity_arguments,
  rationale
) values (
  'attendance',
  'qarar_iam',
  'has_role_code',
  'role_codes text[]',
  'Authorize governance administrators through the shared live-meeting guard'
)
on conflict do nothing;

grant usage on schema qarar_iam to qarar_attendance_executor;
grant execute on function qarar_iam.has_role_code(text[])
  to qarar_attendance_executor;

commit;
