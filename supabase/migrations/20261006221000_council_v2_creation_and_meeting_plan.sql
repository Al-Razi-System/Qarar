begin;

alter table qarar_core.governance_units
  add column reference_number text,
  add column scope_unit_id uuid,
  add constraint governance_units_scope_tenant_fk
    foreign key (scope_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict;

create unique index governance_units_reference_number_uidx
  on qarar_core.governance_units(organization_id, reference_number)
  where reference_number is not null;

create table qarar_meetings.council_meeting_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('MTP'),
  governance_unit_id uuid not null,
  meeting_type_id uuid not null,
  status text not null default 'draft',
  recurrence text not null,
  first_meeting_date date not null,
  start_time time not null,
  end_time time not null,
  ends_on date,
  missed_after_days integer not null default 7,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (organization_id, governance_unit_id),
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (meeting_type_id, organization_id)
    references qarar_meetings.meeting_types(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (status in ('draft','active','paused','retired')),
  check (recurrence in ('weekly','monthly','quarterly','semiannual','annual')),
  check (end_time > start_time),
  check (ends_on is null or ends_on >= first_meeting_date),
  check (missed_after_days between 0 and 90)
);

alter table qarar_meetings.council_meeting_plans_v2 enable row level security;
alter table qarar_meetings.council_meeting_plans_v2 force row level security;
alter table qarar_meetings.council_meeting_plans_v2 owner to qarar_meetings_executor;
revoke all on table qarar_meetings.council_meeting_plans_v2 from public,anon,authenticated,service_role;
grant select,insert,update on table qarar_meetings.council_meeting_plans_v2 to qarar_core_executor;

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
    if v_recurrence not in ('weekly','monthly','quarterly','semiannual','annual') or v_first_date is null or v_start is null or v_end is null or v_end<=v_start or v_missed not between 0 and 90 or (v_ends_on is not null and v_ends_on<v_first_date) then raise exception using errcode='22023',message='أكمل إعدادات خطة الاجتماعات بقيم صحيحة'; end if;
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
    'scope_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status<>'archived' and not t.is_council_type),'[]'::jsonb),
    'parent_units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name_ar',u.name_ar,'name_en',u.name_en) order by u.name_ar) from qarar_core.governance_units u join qarar_core.governance_unit_types t on t.id=u.unit_type_id and t.organization_id=u.organization_id where u.organization_id=v_org and u.status<>'archived' and t.is_council_type),'[]'::jsonb),
    'governance_classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by code) from qarar_governance.governance_unit_classes where organization_id=v_org and is_active),'[]'::jsonb),
    'meeting_types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'name_ar',name_ar,'name_en',name_en) order by name_ar) from qarar_meetings.meeting_types where organization_id=v_org and is_active),'[]'::jsonb),
    'leadership_roles',jsonb_build_array('council_chair','council_rapporteur'));
end $$;

alter function qarar_core.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid) owner to qarar_core_executor;
grant execute on function qarar_core.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid) to qarar_api_executor;

create or replace function api_v2.admin_create_council_v2(p_name_ar text,p_name_en text,p_description text,p_unit_type_id uuid,p_scope_unit_id uuid,p_parent_council_id uuid,p_governance_class_id uuid,p_minimum_active_members integer,p_allow_dual_leadership boolean,p_meeting_plan jsonb,p_client_request_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $$select qarar_core.admin_create_council_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)$$;
alter function api_v2.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid) owner to qarar_api_executor;
revoke all on function api_v2.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function api_v2.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid) to authenticated,service_role;

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view) values('council_meeting_plans_v2','meetings',false) on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values('v2','admin_create_council_v2','qarar_core','admin_create_council_v2','p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_scope_unit_id uuid, p_parent_council_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_meeting_plan jsonb, p_client_request_id uuid','core','authenticated') on conflict do nothing;

notify pgrst,'reload schema';
commit;
