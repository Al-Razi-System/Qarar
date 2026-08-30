begin;

create or replace function qarar_governance.admin_remove_empty_policy_version(
  p_policy_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_policy_id uuid;
  v_status text;
begin
  perform qarar_iam.assert_permission('governance.policies.manage', null);

  select policy_id, legal_status
    into v_policy_id, v_status
  from qarar_governance.policy_versions
  where id = p_policy_version_id
    and organization_id = v_org
  for update;

  if v_policy_id is null then
    raise exception using errcode = 'P0002', message = 'إصدار اللائحة غير موجود.';
  end if;

  if v_status <> 'draft' then
    raise exception using errcode = '55000', message = 'لا يمكن حذف إصدار ليس في حالة مسودة.';
  end if;

  if exists (
    select 1 from qarar_governance.policy_items
    where policy_version_id = p_policy_version_id
  ) or exists (
    select 1 from qarar_governance.policy_scope_assignments
    where policy_version_id = p_policy_version_id
  ) or exists (
    select 1 from qarar_governance.policy_attachments
    where policy_version_id = p_policy_version_id
  ) or exists (
    select 1 from qarar_governance.policy_references
    where target_policy_version_id = p_policy_version_id
  ) or exists (
    select 1 from qarar_governance.policy_versions
    where supersedes_version_id = p_policy_version_id
  ) then
    raise exception using errcode = '55000', message = 'لا يمكن حذف الإصدار لأنه مرتبط بمحتوى أو نطاق أو مرفق أو إصدار آخر.';
  end if;

  delete from qarar_governance.policy_versions
  where id = p_policy_version_id
    and organization_id = v_org;

  perform qarar_audit.append_audit_log(
    v_org,
    'governance.policy_version.delete_empty',
    'policy_versions',
    p_policy_version_id,
    jsonb_build_object('policy_id', v_policy_id)
  );

  return jsonb_build_object('id', p_policy_version_id, 'removed', true);
end;
$$;

alter function qarar_governance.admin_remove_empty_policy_version(uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_remove_empty_policy_version(uuid)
  from public, anon;
grant execute on function qarar_governance.admin_remove_empty_policy_version(uuid)
  to qarar_api_executor;

create or replace function api_v1.admin_remove_empty_policy_version(
  p_policy_version_id uuid
) returns jsonb
language sql
security definer
set search_path=pg_catalog
as $$
  select qarar_governance.admin_remove_empty_policy_version($1)
$$;

alter function api_v1.admin_remove_empty_policy_version(uuid)
  owner to qarar_api_executor;
revoke all on function api_v1.admin_remove_empty_policy_version(uuid)
  from public, anon;
grant execute on function api_v1.admin_remove_empty_policy_version(uuid)
  to authenticated, service_role;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name,
  identity_arguments, module_code, audience
) values (
  'v1', 'admin_remove_empty_policy_version', 'qarar_governance',
  'admin_remove_empty_policy_version', 'p_policy_version_id uuid',
  'governance', 'authenticated'
) on conflict do nothing;

update qarar_architecture.api_release_registry
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
    contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid) where r.api_version='v1'),
    released_at=now()
where api_version='v1';

commit;
