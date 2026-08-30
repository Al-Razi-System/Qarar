begin;

update qarar_architecture.function_registry r
set function_oid=p.oid,owning_schema='qarar_topics',module_code='topics'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where r.function_name='create_topic'
  and r.identity_arguments=pg_get_function_identity_arguments(p.oid)
  and n.nspname='qarar_topics' and p.proname='create_topic';

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
)
select 'v1',p.proname,n.nspname,p.proname,
  pg_get_function_identity_arguments(p.oid),
  case when n.nspname='qarar_topics' then 'topics' else 'governance' end,
  'authenticated'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname,p.proname) in(
  ('qarar_governance','admin_create_policy'),
  ('qarar_governance','admin_create_policy_version'),
  ('qarar_governance','admin_add_policy_item'),
  ('qarar_governance','admin_set_policy_scope'),
  ('qarar_governance','admin_set_policy_item_scope_override'),
  ('qarar_governance','admin_create_workflow_template'),
  ('qarar_governance','admin_add_workflow_step'),
  ('qarar_governance','admin_add_workflow_transition'),
  ('qarar_governance','admin_submit_policy_for_review'),
  ('qarar_governance','admin_approve_policy_version'),
  ('qarar_governance','admin_activate_policy_version'),
  ('qarar_governance','admin_suspend_policy_version'),
  ('qarar_governance','resolve_topic_governance'),
  ('qarar_topics','create_topic_with_workflow'),
  ('qarar_governance','get_topic_governance'),
  ('qarar_governance','get_topic_workflow'),
  ('qarar_governance','complete_topic_workflow_step'),
  ('qarar_governance','return_topic_workflow_step'),
  ('qarar_governance','reject_topic_workflow_step'),
  ('qarar_governance','request_workflow_exception'),
  ('qarar_governance','approve_workflow_exception')
)
on conflict do nothing;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  case when n.nspname='qarar_topics' then 'topics' else 'governance' end,
  n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join qarar_architecture.api_contract_registry r
  on r.api_version='v1' and r.implementation_schema=n.nspname
  and r.implementation_name=p.proname
  and r.identity_arguments=pg_get_function_identity_arguments(p.oid)
where n.nspname in('qarar_governance','qarar_topics')
on conflict(function_oid) do update set
  function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

do $$
declare c record;f record;v_arguments text;v_result text;v_call_arguments text;
  v_call text;v_volatility text;v_sql text;
begin
  for c in select * from qarar_architecture.api_contract_registry
    where api_version='v1' and module_code in('governance','topics')
      and contract_name in(
        'admin_create_policy','admin_create_policy_version','admin_add_policy_item',
        'admin_set_policy_scope','admin_set_policy_item_scope_override',
        'admin_create_workflow_template','admin_add_workflow_step','admin_add_workflow_transition',
        'admin_submit_policy_for_review','admin_approve_policy_version',
        'admin_activate_policy_version','admin_suspend_policy_version',
        'resolve_topic_governance','create_topic_with_workflow','get_topic_governance',
        'get_topic_workflow','complete_topic_workflow_step','return_topic_workflow_step',
        'reject_topic_workflow_step','request_workflow_exception','approve_workflow_exception')
  loop
    select p.* into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=c.implementation_schema and p.proname=c.implementation_name
      and pg_get_function_identity_arguments(p.oid)=c.identity_arguments;
    v_arguments:=pg_get_function_arguments(f.oid);
    v_result:=pg_get_function_result(f.oid);
    select string_agg(format('$%s',i),',' order by i) into v_call_arguments
      from generate_series(1,f.pronargs) i;
    v_call:=format('%I.%I(%s)',c.implementation_schema,c.implementation_name,
      coalesce(v_call_arguments,''));
    v_volatility:=case f.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end;
    v_sql:=case when f.proretset then format('select * from %s',v_call)
      else format('select %s',v_call) end;
    execute format(
      'create or replace function api_v1.%I(%s) returns %s language sql %s security definer set search_path=pg_catalog as %L',
      c.contract_name,v_arguments,v_result,v_volatility,v_sql
    );
    execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',
      c.contract_name,c.identity_arguments);
    execute format('revoke all on function api_v1.%I(%s) from public,anon,authenticated,service_role',
      c.contract_name,c.identity_arguments);
    execute format('grant execute on function api_v1.%I(%s) to authenticated,service_role',
      c.contract_name,c.identity_arguments);
    execute format('grant usage on schema %I to qarar_api_executor',c.implementation_schema);
    execute format('grant execute on function %I.%I(%s) to qarar_api_executor',
      c.implementation_schema,c.implementation_name,c.identity_arguments);
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
      c.implementation_schema,c.implementation_name,c.identity_arguments);
  end loop;
end;
$$;

comment on schema api_v1 is
'Stable PostgREST RPC facade. Sprint 3.5 governance contracts are registry-backed and implementation schemas remain private.';

commit;
