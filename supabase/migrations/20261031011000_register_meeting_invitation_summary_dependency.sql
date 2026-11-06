-- Register the cross-module call introduced by the persistent invitation
-- summary. The execute grant already exists; this forward-only repair makes
-- the dependency explicit in the architecture contract as required by the
-- runtime security boundary suite.
begin;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module,
  target_schema,
  function_name,
  identity_arguments,
  rationale
) values (
  'meetings',
  'qarar_governance',
  'get_meeting_invitation_summary',
  'p_organization_id uuid, p_meeting_id uuid',
  'Read the persisted delivery summary while composing meeting detail'
) on conflict do nothing;

commit;
