begin;

create function qarar_core.admin_create_organizational_unit_v2(
  p_name_ar text, p_unit_type_id uuid, p_parent_unit_id uuid, p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,qarar_core as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_row qarar_core.governance_units%rowtype;
  v_level integer:=1;
  v_reference text;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if v_actor is null or p_client_request_id is null or char_length(btrim(coalesce(p_name_ar,''))) not between 2 and 300 then
    raise exception using errcode='22023',message='أدخل اسم الوحدة ونوعها بشكل صحيح';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_row from qarar_core.governance_units
    where organization_id=v_org and created_by_user_id=v_actor and client_request_id=p_client_request_id;
  if found then
    if v_row.reference_number not like 'ORU-%' then raise exception using errcode='22023',message='مفتاح الطلب مستخدم لعملية أخرى'; end if;
    return jsonb_build_object('id',v_row.id,'reference_number',v_row.reference_number,'status',v_row.status,'idempotent_replay',true);
  end if;
  if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=v_org and is_active and not is_council_type) then
    raise exception using errcode='22023',message='اختر نوع وحدة تنظيمية نشطاً وليس نوع مجلس';
  end if;
  if p_parent_unit_id is not null then
    select u.level_no+1 into v_level from qarar_core.governance_units u
      join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
      where u.id=p_parent_unit_id and u.organization_id=v_org and u.status<>'archived' and not t.is_council_type;
    if v_level is null then raise exception using errcode='22023',message='الجهة التابعة لها غير متاحة أو ليست وحدة تنظيمية'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':oru:'||p_unit_type_id::text||':'||btrim(p_name_ar),0));
  if exists(select 1 from qarar_core.governance_units where organization_id=v_org and unit_type_id=p_unit_type_id and name_ar=btrim(p_name_ar) and parent_unit_id is not distinct from p_parent_unit_id and status<>'archived') then
    raise exception using errcode='23505',message='هذه الوحدة موجودة بالفعل تحت الجهة المحددة';
  end if;
  v_reference:=qarar_governance.next_v2_reference('ORU');
  insert into qarar_core.governance_units(organization_id,code,reference_number,name_ar,unit_type_id,parent_unit_id,level_no,status,created_by_user_id,client_request_id,status_reason)
    values(v_org,lower(replace(v_reference,'-','_')),v_reference,btrim(p_name_ar),p_unit_type_id,p_parent_unit_id,v_level,'active',v_actor,p_client_request_id,'created') returning * into v_row;
  perform qarar_audit.append_audit_log(v_org,'organizational.unit.created','governance_units',v_row.id,jsonb_build_object('reference_number',v_reference,'client_request_id',p_client_request_id));
  return jsonb_build_object('id',v_row.id,'reference_number',v_reference,'status',v_row.status,'idempotent_replay',false);
end $$;

create function qarar_core.admin_list_organizational_units_v2(p_query text default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_result jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),100); v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  perform qarar_iam.assert_permission('governance.units.read',null);
  with filtered as (
    select u.id,u.name_ar,u.reference_number,u.code,u.parent_unit_id,t.name_ar as type_name_ar,p.name_ar as parent_name_ar
      from qarar_core.governance_units u
      join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
      left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
      where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type
      and (nullif(btrim(p_query),'') is null or u.name_ar ilike '%'||btrim(p_query)||'%' or u.code ilike '%'||btrim(p_query)||'%')
  ), page as (select * from filtered order by name_ar,id limit v_limit offset v_offset)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by name_ar,id) from page),'[]'::jsonb),'total',(select count(*) from filtered),'limit',v_limit,'offset',v_offset) into v_result;
  return v_result||jsonb_build_object(
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar,id) from qarar_core.governance_unit_types where organization_id=v_org and is_active and not is_council_type),'[]'::jsonb),
    'parents',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar) order by u.name_ar,u.id) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type),'[]'::jsonb));
end $$;

alter function qarar_core.admin_create_organizational_unit_v2(text,uuid,uuid,uuid) owner to qarar_core_executor;
alter function qarar_core.admin_list_organizational_units_v2(text,integer,integer) owner to qarar_core_executor;
revoke all on function qarar_core.admin_create_organizational_unit_v2(text,uuid,uuid,uuid),qarar_core.admin_list_organizational_units_v2(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_create_organizational_unit_v2(text,uuid,uuid,uuid),qarar_core.admin_list_organizational_units_v2(text,integer,integer) to qarar_api_executor;

create function api_v2.admin_create_organizational_unit_v2(p_name_ar text,p_unit_type_id uuid,p_parent_unit_id uuid,p_client_request_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_create_organizational_unit_v2($1,$2,$3,$4)$$;
create function api_v2.admin_list_organizational_units_v2(p_query text default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$select qarar_core.admin_list_organizational_units_v2($1,$2,$3)$$;
alter function api_v2.admin_create_organizational_unit_v2(text,uuid,uuid,uuid) owner to qarar_api_executor;
alter function api_v2.admin_list_organizational_units_v2(text,integer,integer) owner to qarar_api_executor;
revoke all on function api_v2.admin_create_organizational_unit_v2(text,uuid,uuid,uuid),api_v2.admin_list_organizational_units_v2(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function api_v2.admin_create_organizational_unit_v2(text,uuid,uuid,uuid),api_v2.admin_list_organizational_units_v2(text,integer,integer) to authenticated,service_role;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
select 'v2',p.proname,'qarar_core',p.proname,pg_get_function_identity_arguments(p.oid),'core','authenticated' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='api_v2' and p.proname in ('admin_create_organizational_unit_v2','admin_list_organizational_units_v2');
notify pgrst,'reload schema';
commit;
