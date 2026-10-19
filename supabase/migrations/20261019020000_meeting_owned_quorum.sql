-- Impact: docs/engineering/impact/MEETING_QUORUM_AR.md
-- Integrated after 20261019010000; no shared environment ran the former draft.
begin;
alter table qarar_meetings.meetings add column quorum_percentage integer;
-- Preserve every existing meeting, including those already in progress.
update qarar_meetings.meetings m set quorum_percentage=g.quorum_percentage
from qarar_core.governance_units g where g.id=m.governance_unit_id and g.organization_id=m.organization_id;
alter table qarar_meetings.meetings alter column quorum_percentage set default 51;
alter table qarar_meetings.meetings alter column quorum_percentage set not null;
alter table qarar_meetings.meetings add constraint meetings_quorum_percentage_check check(quorum_percentage between 1 and 100);

-- Keep existing authorization, roster accounting, audit and signatures intact.
-- Refuse unexpected source drift rather than silently patching the wrong body.
do $$
declare definition text; before text; after text;
begin
 before:='select quorum_percentage into v_required from qarar_core.governance_units where id=v_m.governance_unit_id;';
 after:='v_required := v_m.quorum_percentage;';
 definition:=pg_get_functiondef('qarar_attendance.recalculate_meeting_quorum(uuid,boolean)'::regprocedure);
 if position(before in definition)=0 then raise exception 'Unexpected quorum calculation source'; end if;
 execute replace(definition,before,after);
 before:='select quorum_percentage into v_quorum_pct from qarar_core.governance_units where id = v_unit_id;';
 after:='select quorum_percentage into v_quorum_pct from qarar_meetings.meetings where id = p_meeting_id;';
 definition:=pg_get_functiondef('qarar_attendance.calculate_meeting_quorum(uuid)'::regprocedure);
 if position(before in definition)=0 then raise exception 'Unexpected legacy quorum source'; end if;
 execute replace(definition,before,after);
 before:='return detail||jsonb_build_object(';
 after:='return detail||jsonb_build_object(''quorum_percentage'',(select quorum_percentage from qarar_meetings.meetings where id=p_meeting_id and organization_id=qarar_iam.current_organization_id()))||jsonb_build_object(';
 definition:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
 if position(before in definition)=0 then raise exception 'Unexpected meeting detail source'; end if;
 execute replace(definition,before,after);
end $$;

create function qarar_meetings.save_meeting_with_quorum(p_action text,p_values jsonb,p_quorum_percentage integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; entry jsonb; m qarar_meetings.meetings%rowtype;
 percentage integer:=coalesce(p_quorum_percentage,51); ids uuid[]; meeting_id uuid;
begin
 if jsonb_typeof(p_values) is distinct from 'object' or p_action is null or p_action not in('create','series','update') then
  raise exception using errcode='22023',message='بيانات حفظ الاجتماع غير صالحة.';
 end if;
 if percentage not between 1 and 100 then
  raise exception using errcode='22023',message='نسبة النصاب يجب أن تكون عددًا صحيحًا بين 1 و100.';
 end if;
 if p_action='update' then
  select * into m from qarar_meetings.meetings where id=(p_values->>'p_meeting_id')::uuid
   and organization_id=qarar_iam.current_organization_id() for update;
  if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  perform qarar_iam.assert_permission('meetings.manage',m.governance_unit_id);
  if m.status not in('draft','scheduled') or m.attendance_locked_at is not null then
   raise exception using errcode='23514',message='لا يمكن تعديل النصاب بعد بدء الجلسة أو تثبيت الحضور.';
  end if;
  result:=qarar_meetings.update_meeting(m.id,p_values->>'p_title_ar',(p_values->>'p_scheduled_date')::date,
   nullif(p_values->>'p_start_time','')::time,nullif(p_values->>'p_end_time','')::time,
   coalesce(p_values->>'p_location_type','onsite'),p_values->>'p_location_details',p_values->>'p_title_en',
   (p_values->>'p_meeting_type_id')::uuid,(p_values->>'p_expected_updated_at')::timestamptz);
  ids:=array[m.id];
 elsif p_action='create' then
  result:=qarar_meetings.create_meeting((p_values->>'p_governance_unit_id')::uuid,(p_values->>'p_meeting_type_id')::uuid,
   p_values->>'p_title_ar',(p_values->>'p_scheduled_date')::date,nullif(p_values->>'p_start_time','')::time,
   nullif(p_values->>'p_end_time','')::time,coalesce(p_values->>'p_location_type','onsite'),
   p_values->>'p_location_details',p_values->>'p_title_en',(p_values->>'p_client_request_id')::uuid);
  if coalesce((result->>'idempotent_replay')::boolean,false) then
   select quorum_percentage into percentage from qarar_meetings.meetings where id=(result->>'id')::uuid and organization_id=qarar_iam.current_organization_id();
   if percentage<>coalesce(p_quorum_percentage,51) then
    raise exception using errcode='40001',message='سبق حفظ هذا الاجتماع بنصاب مختلف؛ افتحه للتعديل.';
   end if;
   return result||jsonb_build_object('quorum_percentage',percentage);
  end if;
  ids:=array[(result->>'id')::uuid];
 else
  result:=qarar_meetings.create_meeting_series((p_values->>'p_governance_unit_id')::uuid,(p_values->>'p_meeting_type_id')::uuid,
   p_values->>'p_title_ar',(p_values->>'p_first_date')::date,nullif(p_values->>'p_start_time','')::time,
   nullif(p_values->>'p_end_time','')::time,coalesce(p_values->>'p_location_type','onsite'),p_values->>'p_location_details',
   p_values->>'p_frequency',(p_values->>'p_interval_count')::integer,(p_values->>'p_occurrence_count')::integer);
  for entry in select value from jsonb_array_elements(result->'occurrences') loop
   ids:=array_append(ids,(entry->>'id')::uuid);
  end loop;
 end if;
 foreach meeting_id in array ids loop
  select * into m from qarar_meetings.meetings where id=meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  update qarar_meetings.meetings set quorum_percentage=percentage where id=m.id and organization_id=m.organization_id;
  perform qarar_audit.append_audit_log(m.organization_id,'meetings.quorum.set','meetings',m.id,
   jsonb_build_object('previous_percentage',m.quorum_percentage,'quorum_percentage',percentage));
 end loop;
 if p_action='update' then return qarar_meetings.get_meeting_detail(m.id); end if;
 return result||jsonb_build_object('quorum_percentage',percentage);
end $$;
alter function qarar_meetings.save_meeting_with_quorum(text,jsonb,integer) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.save_meeting_with_quorum(text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.save_meeting_with_quorum(text,jsonb,integer) to qarar_api_executor;
create function api_v2.save_meeting_with_quorum_v2(p_action text,p_values jsonb,p_quorum_percentage integer default null)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.save_meeting_with_quorum($1,$2,$3)$$;
alter function api_v2.save_meeting_with_quorum_v2(text,jsonb,integer) owner to qarar_api_executor;
revoke all on function api_v2.save_meeting_with_quorum_v2(text,jsonb,integer) from public,anon,service_role;
grant execute on function api_v2.save_meeting_with_quorum_v2(text,jsonb,integer) to authenticated;
insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p
where p.pronamespace='qarar_meetings'::regnamespace and p.proname='save_meeting_with_quorum';
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','save_meeting_with_quorum_v2','qarar_meetings','save_meeting_with_quorum','p_action text, p_values jsonb, p_quorum_percentage integer','meetings','authenticated');
notify pgrst,'reload schema';
commit;
