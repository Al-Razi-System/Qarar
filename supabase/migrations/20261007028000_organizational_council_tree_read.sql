begin;
create function qarar_core.admin_get_council_organizational_tree_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_org uuid:=qarar_iam.current_organization_id();
begin
 perform qarar_iam.assert_permission('governance.units.read',null);
 return jsonb_build_object(
  'units',coalesce((select jsonb_agg(to_jsonb(item) order by item.name_ar,item.id) from (
   select u.id,u.parent_unit_id,u.name_ar,u.code,u.status,t.name_ar type_name_ar
   from qarar_core.governance_units u join qarar_core.governance_unit_types t
    on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=v_org and not t.is_council_type
  ) item),'[]'::jsonb),
  'councils',coalesce((select jsonb_agg(to_jsonb(item) order by item.name_ar,item.id) from (
   select u.id,u.scope_unit_id,u.name_ar,u.name_en,u.code,u.description,u.status,u.level_no,
    u.unit_type_id,u.governance_class_id,u.minimum_active_members,u.allow_dual_leadership,u.updated_at
   from qarar_core.governance_units u join qarar_core.governance_unit_types t
    on t.id=u.unit_type_id and t.organization_id=u.organization_id
   where u.organization_id=v_org and t.is_council_type
  ) item),'[]'::jsonb));
end $$;
alter function qarar_core.admin_get_council_organizational_tree_v2() owner to qarar_core_executor;
revoke all on function qarar_core.admin_get_council_organizational_tree_v2() from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_get_council_organizational_tree_v2() to qarar_api_executor;
create function api_v2.admin_get_council_organizational_tree_v2()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select qarar_core.admin_get_council_organizational_tree_v2()
$$;
alter function api_v2.admin_get_council_organizational_tree_v2() owner to qarar_api_executor;
revoke all on function api_v2.admin_get_council_organizational_tree_v2() from public,anon,service_role;
grant execute on function api_v2.admin_get_council_organizational_tree_v2() to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='qarar_core' and p.proname='admin_get_council_organizational_tree_v2';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','admin_get_council_organizational_tree_v2','qarar_core','admin_get_council_organizational_tree_v2','','core','authenticated');
update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v2'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
  pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v2'
  join qarar_architecture.api_contract_registry c on c.api_version='v2' and c.contract_name=p.proname
   and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
 where r.api_version='v2';
notify pgrst,'reload schema';
commit;
