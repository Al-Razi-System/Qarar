begin;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,target_schema,function_name,identity_arguments,rationale
) values
  ('governance','qarar_iam','current_organization_id','',
   'Bind every governance operation to the authenticated tenant'),
  ('governance','qarar_iam','assert_permission','permission_code text, target_unit_id uuid',
   'Enforce reviewed application permissions before governance operations')
on conflict do nothing;

grant execute on function qarar_iam.current_organization_id()
  to qarar_governance_executor;
grant execute on function qarar_iam.assert_permission(text,uuid)
  to qarar_governance_executor;

commit;
