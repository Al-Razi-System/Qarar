begin;

-- JSON PostgREST claims and legacy claim.sub both resolve through auth.uid().
-- Keep the facade signature stable; the retired parent argument must be null.
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
  v_actor uuid:=auth.uid();
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
  if v_actor is null then raise exception using errcode='42501',message='يلزم تسجيل الدخول لإنشاء المجلس'; end if;
  if p_parent_council_id is not null then raise exception using errcode='22023',message='يرتبط المجلس بوحدته التنظيمية؛ لا تحدد مجلسًا أبًا'; end if;
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
    where u.id=p_scope_unit_id and u.organization_id=v_org and u.status='active' and not t.is_council_type
  ) then raise exception using errcode='23503',message='النطاق التنظيمي غير موجود أو ليس وحدة تنظيمية'; end if;
  if p_scope_unit_id is not null then
    select level_no into v_level from qarar_core.governance_units where id=p_scope_unit_id and organization_id=v_org;
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
  values(v_org,null,p_scope_unit_id,p_unit_type_id,v_code,v_reference,btrim(p_name_ar),nullif(btrim(p_name_en),''),nullif(btrim(p_description),''),v_level,'inactive',p_governance_class_id,p_minimum_active_members,coalesce(p_allow_dual_leadership,false),v_actor,p_client_request_id,'created') returning id into v_id;
  if p_meeting_plan is not null then
    insert into qarar_meetings.council_meeting_plans_v2(organization_id,governance_unit_id,meeting_type_id,recurrence,first_meeting_date,start_time,end_time,ends_on,missed_after_days,created_by_user_id)
    values(v_org,v_id,v_meeting_type,v_recurrence,v_first_date,v_start,v_end,v_ends_on,v_missed,v_actor) returning id into v_plan_id;
  end if;
  perform qarar_audit.append_audit_log(v_org,'council.v2.created','governance_unit',v_id,jsonb_build_object('reference_number',v_reference,'scope_unit_id',p_scope_unit_id,'meeting_plan_id',v_plan_id,'client_request_id',p_client_request_id));
  return jsonb_build_object('id',v_id,'reference_number',v_reference,'status','inactive','meeting_plan_id',v_plan_id,'idempotent_replay',false);
end $$;

commit;

