begin;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
)
select 'v1',p.proname,'qarar_governance',p.proname,
  pg_get_function_identity_arguments(p.oid),'governance','authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname in(
  'admin_search_policies','admin_get_policy_detail','admin_update_policy',
  'admin_update_policy_item','admin_remove_policy_item','admin_remove_policy_scope',
  'admin_create_workflow_version','admin_update_workflow_step',
  'admin_remove_workflow_step','admin_activate_workflow_template_version')
on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  'governance','qarar_governance',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_governance' and p.proname in(
  'admin_search_policies','admin_get_policy_detail','admin_update_policy',
  'admin_update_policy_item','admin_remove_policy_item','admin_remove_policy_scope',
  'admin_create_workflow_version','admin_update_workflow_step',
  'admin_remove_workflow_step','admin_activate_workflow_template_version')
on conflict(function_oid) do update set function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,module_code='governance',
  owning_schema='qarar_governance',is_rls_predicate=false;

do $$
declare c record;f record;v_arguments text;v_result text;v_call_arguments text;v_call text;v_sql text;
begin
  for c in select r.* from qarar_architecture.api_contract_registry r
  where r.api_version='v1' and r.contract_name in(
    'admin_search_policies','admin_get_policy_detail','admin_update_policy',
    'admin_update_policy_item','admin_remove_policy_item','admin_remove_policy_scope',
    'admin_create_workflow_version','admin_update_workflow_step',
    'admin_remove_workflow_step','admin_activate_workflow_template_version')
    and exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=r.implementation_schema and p.proname=r.implementation_name
        and pg_get_function_identity_arguments(p.oid)=r.identity_arguments)
  loop
    select p.* into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=c.implementation_schema and p.proname=c.implementation_name
      and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
    v_arguments:=pg_get_function_arguments(f.oid);v_result:=pg_get_function_result(f.oid);
    select string_agg(format('$%s',i),',' order by i) into v_call_arguments
    from generate_series(1,f.pronargs)i;
    v_call:=format('%I.%I(%s)',c.implementation_schema,c.implementation_name,
      coalesce(v_call_arguments,''));
    v_sql:=case when f.proretset then format('select * from %s',v_call)
      else format('select %s',v_call) end;
    execute format('drop function if exists api_v1.%I(%s)',c.contract_name,c.identity_arguments);
    execute format(
      'create or replace function api_v1.%I(%s) returns %s language sql %s security definer set search_path=pg_catalog as %L',
      c.contract_name,v_arguments,v_result,
      case f.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end,v_sql);
    execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',
      c.contract_name,c.identity_arguments);
    execute format('revoke all on function api_v1.%I(%s) from public,anon,authenticated,service_role',
      c.contract_name,c.identity_arguments);
    execute format('grant execute on function api_v1.%I(%s) to authenticated,service_role',
      c.contract_name,c.identity_arguments);
    execute format('grant execute on function qarar_governance.%I(%s) to qarar_api_executor',
      c.implementation_name,c.identity_arguments);
  end loop;
end;
$$;

commit;
