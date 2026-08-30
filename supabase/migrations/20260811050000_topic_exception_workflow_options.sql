begin;

-- The topic creation flow needs a small, permission-aware list of possible
-- temporary routes.  It must not reuse the workflow-administration listing,
-- which exposes management data to ordinary topic creators.
create or replace function qarar_governance.get_topic_exception_workflow_options(
  p_governance_unit_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_allowed boolean;
  v_items jsonb;
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'An active account is required';
  end if;

  perform qarar_iam.assert_permission('topics.create', p_governance_unit_id);
  v_allowed := qarar_iam.has_permission('governance.exceptions.request', p_governance_unit_id);
  if not v_allowed then
    return jsonb_build_object('can_request', false, 'items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', wv.id,
    'label', wt.name_ar || ' · الإصدار ' || wv.version_no,
    'description', nullif(btrim(wt.description), '')
  ) order by wt.name_ar, wv.version_no desc), '[]'::jsonb)
  into v_items
  from qarar_governance.workflow_template_versions wv
  join qarar_governance.workflow_templates wt
    on wt.id = wv.workflow_template_id and wt.organization_id = wv.organization_id
  where wv.organization_id = v_org
    and wv.status = 'active'
    and wv.validation_status = 'valid'
    and wt.status = 'active';

  return jsonb_build_object('can_request', true, 'items', v_items);
end;
$$;

alter function qarar_governance.get_topic_exception_workflow_options(uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_exception_workflow_options(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_topic_exception_workflow_options(uuid)
  to qarar_api_executor;
grant usage on schema qarar_governance to qarar_api_executor;
-- The security-definer implementation evaluates this policy check under the
-- governance executor role, so it needs this narrow internal dependency grant.
grant execute on function qarar_iam.has_permission(text, uuid)
  to qarar_governance_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname = 'get_topic_exception_workflow_options'
on conflict(function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values (
  'v1', 'get_topic_exception_workflow_options', 'qarar_governance', 'get_topic_exception_workflow_options',
  'p_governance_unit_id uuid', 'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  audience = excluded.audience;

create or replace function api_v1.get_topic_exception_workflow_options(
  p_governance_unit_id uuid
) returns jsonb
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select qarar_governance.get_topic_exception_workflow_options($1)
$$;

alter function api_v1.get_topic_exception_workflow_options(uuid)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_exception_workflow_options(uuid)
  from public, anon;
grant execute on function api_v1.get_topic_exception_workflow_options(uuid)
  to authenticated, service_role;

commit;
