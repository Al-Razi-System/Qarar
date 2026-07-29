begin;

create or replace function qarar_core.admin_get_councils_tree()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();
begin
 perform qarar_iam.assert_permission('governance.units.read',null);
 return coalesce((with recursive tree as(
  select u.id,u.parent_unit_id,u.code,u.name_ar,u.name_en,u.status,u.level_no,
   array[u.id] path_ids,array[u.name_ar] path_names
  from qarar_core.governance_units u join qarar_core.governance_unit_types t
   on t.id=u.unit_type_id and t.organization_id=u.organization_id and t.is_council_type
  where u.organization_id=o and u.parent_unit_id is null
  union all
  select c.id,c.parent_unit_id,c.code,c.name_ar,c.name_en,c.status,c.level_no,
   p.path_ids||c.id,p.path_names||c.name_ar
  from qarar_core.governance_units c join tree p on p.id=c.parent_unit_id
  join qarar_core.governance_unit_types t on t.id=c.unit_type_id
   and t.organization_id=c.organization_id and t.is_council_type
  where c.organization_id=o and not c.id=any(p.path_ids)
 )select jsonb_agg(to_jsonb(tree) order by path_names,id)from tree),'[]'::jsonb);
end $$;

create or replace function qarar_core.admin_move_council(
 p_council_id uuid,p_new_parent_unit_id uuid,p_reason text,p_expected_updated_at timestamptz
)returns jsonb language plpgsql security definer
set search_path=pg_catalog,qarar_core as $$
declare o uuid:=qarar_iam.current_organization_id();old_parent uuid;old_level integer;
 new_level integer:=1;delta integer;changed timestamptz;
begin
 perform qarar_iam.assert_permission('governance.units.manage',p_council_id);
 if nullif(btrim(p_reason),'') is null then
  raise exception using errcode='22023',message='سبب النقل مطلوب';
 end if;
 if p_council_id=p_new_parent_unit_id then
  raise exception using errcode='23514',message='لا يمكن أن يكون المجلس أبًا لنفسه';
 end if;
 select parent_unit_id,level_no into old_parent,old_level
 from qarar_core.governance_units
 where id=p_council_id and organization_id=o and status<>'archived'
 for update;
 if old_level is null then raise exception using errcode='P0002',message='المجلس غير موجود أو مؤرشف';end if;
 if p_new_parent_unit_id is not null then
  select level_no+1 into new_level from qarar_core.governance_units u
  where u.id=p_new_parent_unit_id and u.organization_id=o and u.status<>'archived'
  for update of u;
  if new_level is null then raise exception using errcode='23503',message='المجلس الأب غير موجود أو مؤرشف';end if;
  if exists(with recursive descendants as(
   select id from qarar_core.governance_units where parent_unit_id=p_council_id and organization_id=o
   union all select u.id from qarar_core.governance_units u join descendants d on u.parent_unit_id=d.id
    where u.organization_id=o
  )select 1 from descendants where id=p_new_parent_unit_id)then
   raise exception using errcode='23514',message='النقل ينشئ علاقة دائرية';
  end if;
 end if;
 update qarar_core.governance_units set parent_unit_id=p_new_parent_unit_id,level_no=new_level
 where id=p_council_id and organization_id=o and updated_at=p_expected_updated_at
 returning updated_at into changed;
 if changed is null then raise exception using errcode='40001',message='تم تعديل المجلس؛ حدّث البيانات';end if;
 delta:=new_level-old_level;
 if delta<>0 then
  with recursive descendants as(
   select id from qarar_core.governance_units where parent_unit_id=p_council_id and organization_id=o
   union all select u.id from qarar_core.governance_units u join descendants d on u.parent_unit_id=d.id
    where u.organization_id=o
  )update qarar_core.governance_units u set level_no=u.level_no+delta
   from descendants d where u.id=d.id and u.organization_id=o;
 end if;
 perform qarar_audit.append_audit_log(o,'council.parent_changed','governance_unit',p_council_id,
  jsonb_build_object('from_parent_unit_id',old_parent,'to_parent_unit_id',p_new_parent_unit_id,
   'reason',btrim(p_reason)));
 return jsonb_build_object('id',p_council_id,'parent_unit_id',p_new_parent_unit_id,
  'level_no',new_level,'updated_at',changed);
end $$;

alter function qarar_core.admin_get_councils_tree() owner to qarar_core_executor;
alter function qarar_core.admin_move_council(uuid,uuid,text,timestamptz) owner to qarar_core_executor;
revoke all on function qarar_core.admin_get_councils_tree() from public,anon,authenticated,service_role;
revoke all on function qarar_core.admin_move_council(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_core' and p.proname in('admin_get_councils_tree','admin_move_council')
on conflict(function_name,identity_arguments)do update set function_oid=excluded.function_oid,module_code='core',owning_schema='qarar_core';

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)values
('v1','admin_get_councils_tree','qarar_core','admin_get_councils_tree','','core','authenticated'),
('v1','admin_move_council','qarar_core','admin_move_council',
 'p_council_id uuid, p_new_parent_unit_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','core','authenticated')
on conflict do nothing;

do $$
declare c record;p record;args text;s text;
begin for c in select * from qarar_architecture.api_contract_registry where contract_name in('admin_get_councils_tree','admin_move_council')
loop select x.oid,pg_get_function_arguments(x.oid) a,pg_get_function_result(x.oid) r into p
 from pg_proc x join pg_namespace n on n.oid=x.pronamespace where n.nspname='qarar_core'
 and x.proname=c.implementation_name and pg_get_function_identity_arguments(x.oid)=c.identity_arguments;
 select string_agg(split_part(btrim(v),' ',1),',' order by ord)into args
 from unnest(string_to_array(c.identity_arguments,','))with ordinality z(v,ord);
 s:=format('create or replace function api_v1.%I(%s) returns %s language sql volatile security definer set search_path=pg_catalog as $f$select qarar_core.%I(%s)$f$',
  c.contract_name,p.a,p.r,c.implementation_name,coalesce(args,''));
 execute s;
 execute format('alter function api_v1.%I(%s) owner to qarar_api_executor',c.contract_name,c.identity_arguments);
 execute format('revoke all on function api_v1.%I(%s) from public,anon,service_role',c.contract_name,c.identity_arguments);
 execute format('grant execute on function api_v1.%I(%s) to authenticated',c.contract_name,c.identity_arguments);
 execute format('grant execute on function qarar_core.%I(%s) to qarar_api_executor',c.implementation_name,c.identity_arguments);
end loop;end $$;

update qarar_architecture.api_release_registry
set contract_count=130,contract_hash='2d0e3c092ab51129ca52a5639ddc2007',
 released_at='2026-07-29 00:00:00+00',
 notes='Sprint 03.6 PB-075 adds safe council hierarchy read and move contracts.'
where api_version='v1';

commit;
