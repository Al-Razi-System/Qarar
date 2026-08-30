begin;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values (
  'minutes', 'qarar_iam', 'has_permission',
  'permission_code text, target_unit_id uuid',
  'Authorize meeting readers and managers before exposing governed minutes'
)
on conflict do nothing;

grant usage on schema qarar_iam to qarar_minutes_executor;
grant execute on function qarar_iam.has_permission(text, uuid)
  to qarar_minutes_executor;

notify pgrst, 'reload schema';
commit;
