begin;
-- The new command runs as the module executor, not the legacy API owner.
grant execute on function qarar_governance.admin_create_policy_idempotent(text,text,text,text,text,uuid,uuid) to qarar_governance_executor;
create function qarar_governance.admin_search_regulation_library_v2(p_query text,p_limit integer,p_offset integer)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select qarar_governance.admin_search_policies(p_query,null,p_limit,p_offset)
 || jsonb_build_object('capabilities',jsonb_build_object('can_manage',qarar_iam.has_permission('governance.policies.manage',null),'can_approve',qarar_iam.has_permission('governance.policies.approve',null)))
$$;
alter function qarar_governance.admin_search_regulation_library_v2(text,integer,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_search_regulation_library_v2(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_search_regulation_library_v2(text,integer,integer) to qarar_api_executor;
create function api_v2.admin_search_regulation_library_v2(p_query text,p_limit integer,p_offset integer)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$ select qarar_governance.admin_search_regulation_library_v2(p_query,p_limit,p_offset) $$;
alter function api_v2.admin_search_regulation_library_v2(text,integer,integer) owner to qarar_api_executor;
revoke all on function api_v2.admin_search_regulation_library_v2(text,integer,integer) from public,anon,service_role;
grant execute on function api_v2.admin_search_regulation_library_v2(text,integer,integer) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='qarar_governance' and p.proname='admin_search_regulation_library_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_governance',p.proname,pg_get_function_identity_arguments(p.oid),'governance','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname='admin_search_regulation_library_v2';
notify pgrst,'reload schema';
commit;
