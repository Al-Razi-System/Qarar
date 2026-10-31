begin;
alter table qarar_meetings.council_meeting_plans_v2 add column monthly_week integer;
alter table qarar_meetings.council_meeting_plans_v2 add constraint council_plan_month_week
 check (monthly_week is null or (recurrence='monthly' and monthly_week between 1 and 5));
-- Existing grants from council creation; record the same narrow read boundary.
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale) values
('core','qarar_meetings','meeting_types','Validate and display the council meeting plan type'),
('core','qarar_meetings','council_meeting_plans_v2','Create and display the council periodic plan, without managing existing meetings')
on conflict do nothing;
create function qarar_core.admin_get_council_detail_v2(p_council_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); r jsonb;
begin
 r:=qarar_core.admin_get_council_detail(p_council_id);
 return r || jsonb_build_object('can_create_meeting_plan',qarar_iam.has_permission('governance.units.manage',null),'meeting_plan',(
  select jsonb_build_object('id',p.id,'recurrence',p.recurrence,'monthly_week',p.monthly_week,'first_meeting_date',p.first_meeting_date,
   'ends_on',p.ends_on,'meeting_type_name_ar',t.name_ar)
  from qarar_meetings.council_meeting_plans_v2 p
  join qarar_meetings.meeting_types t on t.id=p.meeting_type_id and t.organization_id=p.organization_id
  where p.organization_id=o and p.governance_unit_id=p_council_id));
end $$;

create function qarar_core.admin_update_council_v2(
 p_council_id uuid,p_values jsonb,p_expected_updated_at timestamptz,p_meeting_plan jsonb default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); r jsonb; plan_id uuid;
 mt uuid; recurrence_value text; first_date date; ends_date date; missed integer; month_week integer;
begin
 perform qarar_iam.assert_permission('governance.units.manage',p_council_id);
 if jsonb_typeof(p_values) is distinct from 'object' or p_expected_updated_at is null then
  raise exception using errcode='22023',message='بيانات المجلس وتاريخ نسخته مطلوبان';
 end if;
 perform 1 from qarar_core.governance_units where id=p_council_id and organization_id=o for update;
 if not found then raise exception using errcode='P0002',message='المجلس غير موجود'; end if;
 if p_meeting_plan is not null then
  -- Match the existing first-draft trigger's institutional authority boundary.
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if exists(select 1 from qarar_meetings.council_meeting_plans_v2 where organization_id=o and governance_unit_id=p_council_id) then
   raise exception using errcode='40001',message='للمجلس خطة اجتماعات محفوظة؛ حدّث بياناته قبل الحفظ';
  end if;
  if jsonb_typeof(p_meeting_plan) is distinct from 'object' then
   raise exception using errcode='22023',message='بيانات خطة الاجتماعات غير صالحة';
  end if;
  mt:=nullif(p_meeting_plan->>'meeting_type_id','')::uuid;
  recurrence_value:=p_meeting_plan->>'recurrence';
  first_date:=nullif(p_meeting_plan->>'first_meeting_date','')::date;
  ends_date:=nullif(p_meeting_plan->>'ends_on','')::date;
  missed:=coalesce((p_meeting_plan->>'missed_after_days')::integer,7);
  month_week:=nullif(p_meeting_plan->>'monthly_week','')::integer;
  if month_week is not null then
   if recurrence_value is distinct from 'monthly' or month_week not between 1 and 5 then
    raise exception using errcode='22023',message='الأسبوع الشهري يتطلب دورية شهرية وأسبوعاً صحيحاً';
   end if;
   first_date:=(qarar_meetings.council_month_week_window_v2(first_date,month_week)->>'starts_on')::date;
  end if;
  if mt is null or not exists(select 1 from qarar_meetings.meeting_types where id=mt and organization_id=o and is_active) then
   raise exception using errcode='23503',message='نوع الاجتماع غير موجود أو غير نشط';
  end if;
  if recurrence_value is null or recurrence_value not in ('weekly','monthly','quarterly','semiannual','annual')
   or first_date is null or missed not between 0 and 90 or (ends_date is not null and ends_date<first_date) then
   raise exception using errcode='22023',message='أكمل إعدادات خطة الاجتماعات بقيم صحيحة';
  end if;
 end if;
 r:=qarar_core.admin_update_council(p_council_id,p_values->>'name_ar',p_values->>'name_en',p_values->>'description',
  (p_values->>'unit_type_id')::uuid,nullif(p_values->>'governance_class_id','')::uuid,
  (p_values->>'minimum_active_members')::integer,(p_values->>'allow_dual_leadership')::boolean,p_expected_updated_at);
 if p_meeting_plan is not null then
  insert into qarar_meetings.council_meeting_plans_v2(organization_id,governance_unit_id,meeting_type_id,recurrence,monthly_week,status,
   first_meeting_date,ends_on,missed_after_days,created_by_user_id)
  values(o,p_council_id,mt,recurrence_value,month_week,case when month_week is null then 'draft' else 'active' end,first_date,ends_date,missed,auth.uid()) returning id into plan_id;
  perform qarar_audit.append_audit_log(o,'council.meeting_plan.created','governance_unit',p_council_id,
   jsonb_build_object('meeting_plan_id',plan_id));
 end if;
 return r || jsonb_build_object('meeting_plan_id',plan_id,'saved',true);
end $$;
alter function qarar_core.admin_get_council_detail_v2(uuid) owner to qarar_core_executor;
alter function qarar_core.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) owner to qarar_core_executor;
revoke all on function qarar_core.admin_get_council_detail_v2(uuid),qarar_core.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_core.admin_get_council_detail_v2(uuid),qarar_core.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) to qarar_api_executor;
create function api_v2.admin_get_council_detail_v2(p_council_id uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$select qarar_core.admin_get_council_detail_v2(p_council_id)$$;
create function api_v2.admin_update_council_v2(p_council_id uuid,p_values jsonb,p_expected_updated_at timestamptz,p_meeting_plan jsonb default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$select qarar_core.admin_update_council_v2(p_council_id,p_values,p_expected_updated_at,p_meeting_plan)$$;
alter function api_v2.admin_get_council_detail_v2(uuid) owner to qarar_api_executor;
alter function api_v2.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) owner to qarar_api_executor;
revoke all on function api_v2.admin_get_council_detail_v2(uuid),api_v2.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) from public,anon,service_role;
grant execute on function api_v2.admin_get_council_detail_v2(uuid),api_v2.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'core','qarar_core',false from pg_proc p
where p.pronamespace='qarar_core'::regnamespace and p.proname in ('admin_get_council_detail_v2','admin_update_council_v2');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','admin_get_council_detail_v2','qarar_core','admin_get_council_detail_v2','p_council_id uuid','core','authenticated'),
('v2','admin_update_council_v2','qarar_core','admin_update_council_v2','p_council_id uuid, p_values jsonb, p_expected_updated_at timestamp with time zone, p_meeting_plan jsonb','core','authenticated');
grant execute on function qarar_iam.has_permission(text,uuid) to qarar_core_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('core','qarar_iam','has_permission','permission_code text, target_unit_id uuid','Expose whether the council editor may create an institutional meeting plan') on conflict do nothing;
notify pgrst,'reload schema';
commit;
