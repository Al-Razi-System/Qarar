begin;

create or replace function qarar_governance.admin_move_policy_item(
  p_policy_item_id uuid,
  p_parent_item_id uuid,
  p_sort_order integer
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_version uuid;
begin
  perform qarar_iam.assert_permission('governance.policies.manage',null);
  select policy_version_id into v_version
  from qarar_governance.policy_items
  where id=p_policy_item_id and organization_id=v_org;
  if v_version is null then raise exception using errcode='P0002',message='بند اللائحة غير موجود';end if;
  perform qarar_governance.assert_policy_version_editable(v_version);
  if p_sort_order is null or p_sort_order<1 then
    raise exception using errcode='22023',message='ترتيب البند يجب أن يكون رقمًا موجبًا';
  end if;
  if p_parent_item_id=p_policy_item_id then
    raise exception using errcode='23514',message='لا يمكن أن يكون البند أبًا لنفسه';
  end if;
  if p_parent_item_id is not null and not exists(
    select 1 from qarar_governance.policy_items
    where id=p_parent_item_id and policy_version_id=v_version and organization_id=v_org
  ) then raise exception using errcode='23514',message='البند الأب لا ينتمي إلى الإصدار نفسه';end if;
  if p_parent_item_id is not null and exists(
    with recursive descendants(id) as (
      select id from qarar_governance.policy_items where parent_item_id=p_policy_item_id
      union all
      select i.id from qarar_governance.policy_items i join descendants d on i.parent_item_id=d.id
    ) select 1 from descendants where id=p_parent_item_id
  ) then raise exception using errcode='23514',message='لا يمكن نقل البند داخل أحد البنود التابعة له';end if;
  if exists(select 1 from qarar_governance.policy_items where policy_version_id=v_version and sort_order=p_sort_order and id<>p_policy_item_id) then
    update qarar_governance.policy_items set sort_order=sort_order+100000
    where policy_version_id=v_version and sort_order>=p_sort_order and id<>p_policy_item_id;
  end if;
  update qarar_governance.policy_items
  set parent_item_id=p_parent_item_id,sort_order=p_sort_order
  where id=p_policy_item_id and organization_id=v_org;
  update qarar_governance.policy_items set sort_order=sort_order-99999
  where policy_version_id=v_version and sort_order>=100000+p_sort_order and id<>p_policy_item_id;
  perform qarar_audit.append_audit_log(v_org,'governance.policy_item.move','policy_items',p_policy_item_id,
    jsonb_build_object('parent_item_id',p_parent_item_id,'sort_order',p_sort_order));
  return jsonb_build_object('id',p_policy_item_id,'parent_item_id',p_parent_item_id,'sort_order',p_sort_order);
end $$;

alter function qarar_governance.admin_move_policy_item(uuid,uuid,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.admin_move_policy_item(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.admin_move_policy_item(uuid,uuid,integer) to qarar_api_executor;

create or replace function api_v1.admin_move_policy_item(p_policy_item_id uuid,p_parent_item_id uuid,p_sort_order integer)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_governance.admin_move_policy_item($1,$2,$3)$$;
alter function api_v1.admin_move_policy_item(uuid,uuid,integer) owner to qarar_api_executor;
revoke all on function api_v1.admin_move_policy_item(uuid,uuid,integer) from public,anon;
grant execute on function api_v1.admin_move_policy_item(uuid,uuid,integer) to authenticated,service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience
) values('v1','admin_move_policy_item','qarar_governance','admin_move_policy_item',
  'p_policy_item_id uuid, p_parent_item_id uuid, p_sort_order integer','governance','authenticated')
on conflict do nothing;

update qarar_architecture.api_release_registry
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry r on r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid) where r.api_version='v1'),
released_at=now() where api_version='v1';

commit;
