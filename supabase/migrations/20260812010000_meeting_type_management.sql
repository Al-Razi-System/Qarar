begin;

-- Administrative reference data for the meeting creation form.
create or replace function qarar_meetings.admin_list_meeting_types(
  p_query text default null,
  p_is_active boolean default null
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, qarar_meetings
as $$
declare v_org uuid := qarar_iam.current_organization_id();
begin
  if not (qarar_iam.is_system_admin() or qarar_iam.has_role_code(array['governance_admin'])) then
    raise exception using errcode = '42501', message = 'ليس لديك صلاحية إدارة أنواع الاجتماعات';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(to_jsonb(item) order by item.is_active desc, item.name_ar)
    from (
      select t.id,t.code,t.name_ar,t.name_en,t.description,t.is_active,t.created_at,t.updated_at,
        count(m.id)::integer as meeting_count
      from qarar_meetings.meeting_types t
      left join qarar_meetings.meetings m
        on m.meeting_type_id=t.id and m.organization_id=t.organization_id
      where t.organization_id=v_org and (p_is_active is null or t.is_active=p_is_active)
        and (nullif(btrim(p_query),'') is null or t.name_ar ilike '%'||btrim(p_query)||'%'
          or coalesce(t.name_en,'') ilike '%'||btrim(p_query)||'%' or t.code ilike '%'||btrim(p_query)||'%')
      group by t.id
    ) item
  ), '[]'::jsonb));
end;
$$;

create or replace function qarar_meetings.admin_create_meeting_type(
  p_name_ar text, p_description text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, qarar_meetings
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_id uuid;
  v_code text := 'meeting-type-' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
  v_updated_at timestamptz;
begin
  if not (qarar_iam.is_system_admin() or qarar_iam.has_role_code(array['governance_admin'])) then
    raise exception using errcode='42501', message='ليس لديك صلاحية إدارة أنواع الاجتماعات';
  end if;
  if char_length(btrim(coalesce(p_name_ar,'')))<3 then
    raise exception using errcode='22023', message='اسم نوع الاجتماع يجب أن يحتوي على 3 أحرف على الأقل';
  end if;
  insert into qarar_meetings.meeting_types(organization_id,code,name_ar,description,is_active)
  values(v_org,v_code,btrim(p_name_ar),nullif(btrim(coalesce(p_description,'')),''),true)
  returning id,updated_at into v_id,v_updated_at;
  perform qarar_audit.append_audit_log(v_org,'meeting_type.created','meeting_type',v_id,
    jsonb_build_object('code',v_code,'name_ar',btrim(p_name_ar)));
  return jsonb_build_object('id',v_id,'code',v_code,'is_active',true,'updated_at',v_updated_at);
end;
$$;

create or replace function qarar_meetings.admin_update_meeting_type(
  p_meeting_type_id uuid,p_name_ar text,p_description text,p_is_active boolean,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, qarar_meetings
as $$
declare v_org uuid := qarar_iam.current_organization_id();v_updated_at timestamptz;
begin
  if not (qarar_iam.is_system_admin() or qarar_iam.has_role_code(array['governance_admin'])) then
    raise exception using errcode='42501', message='ليس لديك صلاحية إدارة أنواع الاجتماعات';
  end if;
  if char_length(btrim(coalesce(p_name_ar,'')))<3 then
    raise exception using errcode='22023', message='اسم نوع الاجتماع يجب أن يحتوي على 3 أحرف على الأقل';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode='22023', message='يلزم تحديث بيانات النوع قبل حفظ التعديل';
  end if;
  update qarar_meetings.meeting_types
  set name_ar=btrim(p_name_ar),description=nullif(btrim(coalesce(p_description,'')),''),is_active=coalesce(p_is_active,true)
  where id=p_meeting_type_id and organization_id=v_org and updated_at=p_expected_updated_at
  returning updated_at into v_updated_at;
  if v_updated_at is null then
    if exists(select 1 from qarar_meetings.meeting_types where id=p_meeting_type_id and organization_id=v_org) then
      raise exception using errcode='40001', message='تم تعديل نوع الاجتماع بواسطة مستخدم آخر؛ حدّث القائمة ثم أعد المحاولة';
    end if;
    raise exception using errcode='P0002', message='نوع الاجتماع غير موجود';
  end if;
  perform qarar_audit.append_audit_log(v_org,'meeting_type.updated','meeting_type',p_meeting_type_id,
    jsonb_build_object('is_active',coalesce(p_is_active,true),'updated_at',v_updated_at));
  return jsonb_build_object('id',p_meeting_type_id,'updated_at',v_updated_at);
end;
$$;

alter function qarar_meetings.admin_list_meeting_types(text,boolean) owner to qarar_meetings_executor;
alter function qarar_meetings.admin_create_meeting_type(text,text) owner to qarar_meetings_executor;
alter function qarar_meetings.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.admin_list_meeting_types(text,boolean) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.admin_create_meeting_type(text,text) from public,anon,authenticated,service_role;
revoke all on function qarar_meetings.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) from public,anon,authenticated,service_role;

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale) values
  ('meetings','qarar_iam','current_organization_id','','Bind meeting-type administration to the authenticated tenant'),
  ('meetings','qarar_iam','is_system_admin','','Authorize system administrators to manage meeting types'),
  ('meetings','qarar_iam','has_role_code','role_codes text[]','Authorize governance administrators to manage meeting types'),
  ('meetings','qarar_audit','append_audit_log','p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb','Record meeting-type administration audit events')
on conflict do nothing;
grant usage on schema qarar_iam,qarar_audit to qarar_meetings_executor;
grant execute on function qarar_iam.current_organization_id(),qarar_iam.is_system_admin(),qarar_iam.has_role_code(text[]) to qarar_meetings_executor;
grant execute on function qarar_audit.append_audit_log(uuid,text,text,uuid,jsonb) to qarar_meetings_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='qarar_meetings' and p.proname in('admin_list_meeting_types','admin_create_meeting_type','admin_update_meeting_type')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
 ('v1','admin_list_meeting_types','qarar_meetings','admin_list_meeting_types','p_query text, p_is_active boolean','meetings','authenticated'),
 ('v1','admin_create_meeting_type','qarar_meetings','admin_create_meeting_type','p_name_ar text, p_description text','meetings','authenticated'),
 ('v1','admin_update_meeting_type','qarar_meetings','admin_update_meeting_type','p_meeting_type_id uuid, p_name_ar text, p_description text, p_is_active boolean, p_expected_updated_at timestamp with time zone','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

create or replace function api_v1.admin_list_meeting_types(p_query text default null,p_is_active boolean default null)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$ select qarar_meetings.admin_list_meeting_types($1,$2) $$;
create or replace function api_v1.admin_create_meeting_type(p_name_ar text,p_description text default null)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$ select qarar_meetings.admin_create_meeting_type($1,$2) $$;
create or replace function api_v1.admin_update_meeting_type(p_meeting_type_id uuid,p_name_ar text,p_description text,p_is_active boolean,p_expected_updated_at timestamptz)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$ select qarar_meetings.admin_update_meeting_type($1,$2,$3,$4,$5) $$;
alter function api_v1.admin_list_meeting_types(text,boolean) owner to qarar_api_executor;
alter function api_v1.admin_create_meeting_type(text,text) owner to qarar_api_executor;
alter function api_v1.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) owner to qarar_api_executor;
revoke all on function api_v1.admin_list_meeting_types(text,boolean) from public,anon;
revoke all on function api_v1.admin_create_meeting_type(text,text) from public,anon;
revoke all on function api_v1.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) from public,anon;
grant execute on function api_v1.admin_list_meeting_types(text,boolean),api_v1.admin_create_meeting_type(text,text),api_v1.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) to authenticated,service_role;
grant usage on schema qarar_meetings to qarar_api_executor;
grant execute on function qarar_meetings.admin_list_meeting_types(text,boolean),qarar_meetings.admin_create_meeting_type(text,text),qarar_meetings.admin_update_meeting_type(uuid,text,text,boolean,timestamptz) to qarar_api_executor;

update qarar_architecture.api_release_registry set contract_hash=(
 select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
 join qarar_architecture.api_contract_registry r on r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid)
 where r.api_version='v1'
),contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),released_at=now(),notes='Meeting type management contracts added.' where api_version='v1';

commit;
