begin;

-- Register pre-existing module tables that were created after the original
-- architecture registry baseline without changing their data or behavior.
insert into qarar_architecture.entity_registry(
  entity_name, module_code, legacy_public_view
) values
  ('reference_counters_v2', 'governance', false),
  ('topic_classifications_v2', 'governance', false),
  ('topic_types_v2', 'governance', false),
  ('topic_type_versions_v2', 'governance', false),
  ('legal_authorities_v2', 'governance', false),
  ('topic_type_authorities_v2', 'governance', false),
  ('topic_type_workflow_bindings_v2', 'governance', false),
  ('topic_schedule_policies_v2', 'governance', false),
  ('meeting_policies_v2', 'governance', false),
  ('topic_custom_route_drafts', 'governance', false),
  ('topic_custom_route_draft_steps', 'governance', false),
  ('meeting_series', 'meetings', false),
  ('meeting_series_occurrences', 'meetings', false)
on conflict (entity_name) do update
set module_code=excluded.module_code,
    legacy_public_view=excluded.legacy_public_view;

-- Remove signature spellings that are not identical to PostgreSQL's canonical
-- pg_get_function_identity_arguments output, then register the callable wrappers.
delete from qarar_architecture.api_contract_registry registry
where registry.api_version='v1'
  and registry.contract_name in (
    'admin_import_policy_bundle_v4',
    'create_topic_governance_exception_request'
  )
  and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='api_v1'
      and p.proname=registry.contract_name
      and pg_get_function_identity_arguments(p.oid)=registry.identity_arguments
  );

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
)
select
  'v1', p.proname, 'qarar_governance', p.proname,
  pg_get_function_identity_arguments(p.oid), 'governance', 'authenticated'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='api_v1'
  and p.proname in (
    'admin_import_policy_bundle_v4',
    'create_topic_governance_exception_request'
  )
on conflict (api_version, contract_name, identity_arguments) do update
set implementation_schema=excluded.implementation_schema,
    implementation_name=excluded.implementation_name,
    module_code=excluded.module_code,
    audience=excluded.audience,
    deprecated_at=null,
    replacement_contract=null;

commit;
