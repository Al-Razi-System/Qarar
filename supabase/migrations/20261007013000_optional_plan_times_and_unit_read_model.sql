begin;

alter table qarar_meetings.council_meeting_plans_v2 alter column start_time drop not null, alter column end_time drop not null;
alter table qarar_meetings.council_meeting_plans_v2 add constraint council_plan_time_pair check ((start_time is null) = (end_time is null));

create or replace function qarar_core.admin_create_council_v2(
  p_name_ar text,
  p_name_en text,
  p_description text,
  p_unit_type_id uuid,
  p_scope_unit_id uuid,
  p_parent_council_id uuid,
  p_governance_class_id uuid,
  p_minimum_active_members integer,
  p_allow_dual_leadership boolean,
  p_meeting_plan jsonb,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,qarar_core,qarar_meetings,qarar_governance
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  v_id uuid;
  v_reference text;
  v_code text;
  v_level integer:=1;
  v_plan_id uuid;
  v_existing qarar_core.governance_units;
  v_meeting_type uuid;
  v_recurrence text;
  v_first_date date;
  v_start time;
  v_end time;
  v_ends_on date;
  v_missed integer;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if nullif(btrim(p_name_ar),'') is null or p_client_request_id is null then
    raise exception using errcode='22023',message='اسم المجلس ومفتاح الطلب مطلوبان';
  end if;
  if coalesce(p_minimum_active_members,0) not between 1 and 999 then
    raise exception using errcode='22023',message='الحد الأدنى للأعضاء غير صالح';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_actor::text||':'||p_client_request_id::text,0));
  select * into v_existing from qarar_core.governance_units
   where organization_id=v_org and created_by_user_id=v_actor and client_request_id=p_client_request_id;
  if found then
    select id into v_plan_id from qarar_meetings.council_meeting_plans_v2
     where organization_id=v_org and governance_unit_id=v_existing.id;
    return jsonb_build_object('id',v_existing.id,'reference_number',v_existing.reference_number,'status',v_existing.status,'meeting_plan_id',v_plan_id,'idempotent_replay',true);
  end if;
  if not exists(select 1 from qarar_core.governance_unit_types where id=p_unit_type_id and organization_id=v_org and is_council_type and is_active) then
    raise exception using errcode='23503',message='نوع المجلس غير موجود أو غير نشط';
  end if;
  if p_scope_unit_id is not null and not exists(
    select 1 from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
    where u.id=p_scope_unit_id and u.organization_id=v_org and u.status<>'archived' and not t.is_council_type
  ) then raise exception using errcode='23503',message='النطاق التنظيمي غير موجود أو ليس وحدة تنظيمية'; end if;
  if p_parent_council_id is not null then
    select u.level_no+1 into v_level from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
     where u.id=p_parent_council_id and u.organization_id=v_org and u.status<>'archived' and t.is_council_type;
    if v_level is null then raise exception using errcode='23503',message='المجلس الأعلى غير موجود أو مؤرشف'; end if;
  end if;
  if p_governance_class_id is not null and not exists(select 1 from qarar_governance.governance_unit_classes where id=p_governance_class_id and organization_id=v_org and is_active) then
    raise exception using errcode='23503',message='تصنيف المجلس غير موجود أو غير نشط';
  end if;
  if p_meeting_plan is not null then
    if jsonb_typeof(p_meeting_plan)<>'object' then raise exception using errcode='22023',message='بيانات خطة الاجتماعات غير صالحة'; end if;
    v_meeting_type:=nullif(p_meeting_plan->>'meeting_type_id','')::uuid;
    v_recurrence:=p_meeting_plan->>'recurrence';
    v_first_date:=nullif(p_meeting_plan->>'first_meeting_date','')::date;
    v_start:=nullif(p_meeting_plan->>'start_time','')::time;
    v_end:=nullif(p_meeting_plan->>'end_time','')::time;
    v_ends_on:=nullif(p_meeting_plan->>'ends_on','')::date;
    v_missed:=coalesce((p_meeting_plan->>'missed_after_days')::integer,7);
    if v_meeting_type is null or not exists(select 1 from qarar_meetings.meeting_types where id=v_meeting_type and organization_id=v_org and is_active) then raise exception using errcode='23503',message='نوع الاجتماع غير موجود أو غير نشط'; end if;
    if v_recurrence not in ('weekly','monthly','quarterly','semiannual','annual') or v_first_date is null or ((v_start is null) <> (v_end is null)) or v_end<=v_start or v_missed not between 0 and 90 or (v_ends_on is not null and v_ends_on<v_first_date) then raise exception using errcode='22023',message='أكمل إعدادات خطة الاجتماعات بقيم صحيحة'; end if;
  end if;
  v_reference:=qarar_governance.next_v2_reference('CNL');
  v_code:=lower(replace(v_reference,'-','_'));
  insert into qarar_core.governance_units(organization_id,parent_unit_id,scope_unit_id,unit_type_id,code,reference_number,name_ar,name_en,description,level_no,status,governance_class_id,minimum_active_members,allow_dual_leadership,created_by_user_id,client_request_id,status_reason)
  values(v_org,p_parent_council_id,p_scope_unit_id,p_unit_type_id,v_code,v_reference,btrim(p_name_ar),nullif(btrim(p_name_en),''),nullif(btrim(p_description),''),v_level,'inactive',p_governance_class_id,p_minimum_active_members,coalesce(p_allow_dual_leadership,false),v_actor,p_client_request_id,'created') returning id into v_id;
  if p_meeting_plan is not null then
    insert into qarar_meetings.council_meeting_plans_v2(organization_id,governance_unit_id,meeting_type_id,recurrence,first_meeting_date,start_time,end_time,ends_on,missed_after_days,created_by_user_id)
    values(v_org,v_id,v_meeting_type,v_recurrence,v_first_date,v_start,v_end,v_ends_on,v_missed,v_actor) returning id into v_plan_id;
  end if;
  perform qarar_audit.append_audit_log(v_org,'council.v2.created','governance_unit',v_id,jsonb_build_object('reference_number',v_reference,'scope_unit_id',p_scope_unit_id,'meeting_plan_id',v_plan_id,'client_request_id',p_client_request_id));
  return jsonb_build_object('id',v_id,'reference_number',v_reference,'status','inactive','meeting_plan_id',v_plan_id,'idempotent_replay',false);
end $$;

create or replace function qarar_core.get_council_form_options()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_core
as $$ declare v_org uuid:=qarar_iam.current_organization_id(); begin
  perform qarar_iam.assert_permission('governance.units.read',null);
  return jsonb_build_object(
    'council_types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by code) from qarar_core.governance_unit_types where organization_id=v_org and is_council_type and is_active),'[]'::jsonb),
    'scope_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status='active' and not t.is_council_type),'[]'::jsonb),
    'parent_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status<>'archived' and t.is_council_type),'[]'::jsonb),
    'governance_classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by code) from qarar_governance.governance_unit_classes where organization_id=v_org and is_active),'[]'::jsonb),
    'meeting_types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by name_ar) from qarar_meetings.meeting_types where organization_id=v_org and is_active),'[]'::jsonb),
    'leadership_roles',jsonb_build_array('council_chair','council_rapporteur'));
end $$;

create or replace function qarar_core.admin_list_organizational_units_v2(p_query text default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,qarar_core as $$
declare v_org uuid:=qarar_iam.current_organization_id(); v_result jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),100); v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
  perform qarar_iam.assert_permission('governance.units.read',null);
  with filtered as (
    select u.id,u.name_ar,u.reference_number,u.code,u.parent_unit_id,u.unit_type_id,u.status,u.updated_at,t.name_ar as type_name_ar,p.name_ar as parent_name_ar
      from qarar_core.governance_units u
      join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id
      left join qarar_core.governance_units p on p.id=u.parent_unit_id and p.organization_id=u.organization_id
      where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type
      and (nullif(btrim(p_query),'') is null
        or u.name_ar ilike '%'||btrim(p_query)||'%'
        or u.code ilike '%'||btrim(p_query)||'%'
        or u.reference_number ilike '%'||btrim(p_query)||'%')
  ), page as (select * from filtered order by name_ar,id limit v_limit offset v_offset)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page) order by name_ar,id) from page),'[]'::jsonb),'total',(select count(*) from filtered),'limit',v_limit,'offset',v_offset) into v_result;
  return v_result||jsonb_build_object(
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name_ar',name_ar) order by name_ar,id) from qarar_core.governance_unit_types where organization_id=v_org and is_active and not is_council_type),'[]'::jsonb),
    'parents',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar) order by u.name_ar,u.id) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status='active' and not t.is_council_type),'[]'::jsonb));
end $$;

notify pgrst,'reload schema';
commit;

