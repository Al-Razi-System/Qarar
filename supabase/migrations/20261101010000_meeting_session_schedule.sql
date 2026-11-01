-- A session's time and place are rescheduled on their own; a planned meeting
-- keeps the day its plan intended; a day off the plan needs a stated reason.
-- Impact map: docs/engineering/impact/MEETING_SESSION_SCHEDULE_20261101_AR.md
begin;

-- 1. Saving a council plan through its v2 contract needs the plan reference.
grant execute on function qarar_governance.next_v2_reference(text) to qarar_meetings_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('meetings','qarar_governance','next_v2_reference','p_entity_prefix text','Council meeting plans take their reference when saved')
on conflict do nothing;

-- 2. The intended day and the reason for leaving it.
alter table qarar_meetings.meetings
  add column planned_date date,
  add column schedule_exception_reason text
    constraint meeting_schedule_exception_reason_length
    check (schedule_exception_reason is null or char_length(btrim(schedule_exception_reason)) between 5 and 1000);

-- Existing planned meetings: the window start for weekly windows, else the
-- current day. Only this column changes, so the date guard is not involved.
alter table qarar_meetings.meetings disable trigger council_window_confirmation;
update qarar_meetings.meetings
set planned_date=coalesce(planned_window_start,scheduled_date)
where source_plan_id is not null and planned_date is null;
alter table qarar_meetings.meetings enable trigger council_window_confirmation;
create unique index meeting_plan_planned_date_unique on qarar_meetings.meetings(source_plan_id,planned_date)
  where source_plan_id is not null;

-- 3. Plan materialization finds a meeting by its planned day.
create or replace function qarar_meetings.materialize_council_meeting_plan_v2(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();v_org uuid;v_plan qarar_meetings.council_meeting_plans_v2%rowtype;
  v_unit_name text;v_cursor date;v_horizon date;v_window jsonb;v_start date;v_end date;
  v_number integer;v_reference text;v_id uuid;v_created integer:=0;v_existing integer:=0;v_year integer;
begin
  select * into v_plan from qarar_meetings.council_meeting_plans_v2
  where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0002',message='خطة الاجتماعات غير موجودة.';end if;
  v_org:=v_plan.organization_id;
  if v_actor is not null then
    if qarar_iam.current_organization_id() is distinct from v_org then
      raise exception using errcode='P0002',message='خطة الاجتماعات غير موجودة.';
    end if;
    if not (qarar_iam.has_permission('governance.units.manage',v_plan.governance_unit_id)
      or qarar_iam.has_permission('meetings.create',v_plan.governance_unit_id)) then
      raise exception using errcode='42501',message='لا تملك صلاحية إنشاء اجتماعات هذا المجلس.';
    end if;
  else
    -- Scheduled materialization is deliberately internal and attributed to the plan creator.
    v_actor:=v_plan.created_by_user_id;
  end if;
  select name_ar into v_unit_name from qarar_core.governance_units
  where id=v_plan.governance_unit_id and organization_id=v_org and status<>'archived';
  if v_unit_name is null then raise exception using errcode='23503',message='المجلس غير موجود أو مؤرشف.';end if;
  v_horizon:=qarar_meetings.council_plan_materialization_horizon_v2(
    v_plan.first_meeting_date,v_plan.ends_on,(clock_timestamp() at time zone 'Asia/Aden')::date
  );
  v_cursor:=v_plan.first_meeting_date;
  while v_cursor<=v_horizon loop
    if v_plan.monthly_week is not null then
      v_window:=qarar_meetings.council_month_week_window_v2(v_cursor,v_plan.monthly_week);
      v_start:=(v_window->>'starts_on')::date;v_end:=(v_window->>'ends_on')::date;
    else v_start:=v_cursor;v_end:=v_cursor;end if;
    -- A meeting is found by the day its plan intended, not by the day it was
    -- moved to; otherwise a rescheduled meeting is created a second time.
    if exists(select 1 from qarar_meetings.meetings m where m.source_plan_id=v_plan.id and m.planned_date=v_start) then
      v_existing:=v_existing+1;
    else
      v_year:=extract(year from v_start)::integer;
      insert into qarar_meetings.meeting_number_counters(organization_id,calendar_year,last_value)
      values(v_org,v_year,1) on conflict(organization_id,calendar_year) do update
      set last_value=qarar_meetings.meeting_number_counters.last_value+1,updated_at=clock_timestamp()
      returning last_value into v_number;
      v_reference:='MTG-'||v_year::text||'-'||lpad(v_number::text,6,'0');
      insert into qarar_meetings.meetings(
        organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,scheduled_date,
        start_time,end_time,status,created_by_user_id,source_plan_id,planned_window_start,
        planned_window_end,schedule_date_confirmed,planned_date
      ) values(
        v_org,v_reference,v_plan.governance_unit_id,v_plan.meeting_type_id,'اجتماع '||v_unit_name,
        v_start,v_plan.start_time,v_plan.end_time,'draft',v_actor,v_plan.id,
        case when v_plan.monthly_week is not null then v_start end,
        case when v_plan.monthly_week is not null then v_end end,
        v_plan.monthly_week is null,v_start
      ) returning id into v_id;
      insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
      values(v_org,v_id,null,'draft',v_actor,'created from complete council meeting plan');
      perform qarar_audit.append_audit_log(v_org,'meeting.plan.occurrence.created','meetings',v_id,
        jsonb_build_object('meeting_no',v_reference,'source_plan_id',v_plan.id,'planned_window_start',v_start,'planned_window_end',v_end));
      v_created:=v_created+1;
    end if;
    v_cursor:=case v_plan.recurrence
      when 'weekly' then v_cursor+7
      when 'monthly' then (v_cursor+interval '1 month')::date
      when 'quarterly' then (v_cursor+interval '3 months')::date
      when 'semiannual' then (v_cursor+interval '6 months')::date
      else (v_cursor+interval '1 year')::date end;
  end loop;
  return jsonb_build_object('plan_id',v_plan.id,'created_count',v_created,'existing_count',v_existing,'ends_on',v_horizon);
end;
$$;

-- 4. The date guard: a day outside the planned week needs a stated reason, and a
-- day is confirmed only when the date or time is actually set, never as a side
-- effect of an unrelated update to the meeting.
create or replace function qarar_meetings.guard_council_window_confirmation_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.planned_window_start is not null then
    if old.planned_window_start is distinct from new.planned_window_start or old.planned_window_end is distinct from new.planned_window_end
      or old.source_plan_id is distinct from new.source_plan_id then
      raise exception using errcode='22023',message='نافذة الخطة محفوظة ولا تعدّل من الاجتماع';
    end if;
    if new.scheduled_date is distinct from old.scheduled_date or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time then
      if new.start_time is not null and new.end_time is not null then
        if new.end_time<=new.start_time then
          raise exception using errcode='22023',message='يجب أن يكون وقت النهاية بعد وقت البداية.';
        end if;
        new.schedule_date_confirmed:=true;
      else
        new.schedule_date_confirmed:=false;
      end if;
    end if;
    if new.schedule_date_confirmed and new.scheduled_date not between new.planned_window_start and new.planned_window_end
      and nullif(btrim(coalesce(new.schedule_exception_reason,'')),'') is null then
      raise exception using errcode='22023',message='هذا اليوم خارج أسبوع الاجتماع المخطط؛ اكتب سبب انعقاده فيه.';
    end if;
    if new.status not in ('draft','cancelled','archived') and not new.schedule_date_confirmed then
      raise exception using errcode='55000',message='حدد يوم الاجتماع ووقت انعقاده قبل الجدولة.';
    end if;
  end if;
  return new;
end $$;

-- 5. One contract for a session's time and place.
create function qarar_meetings.reschedule_meeting_session_v2(
  p_meeting_id uuid,p_scheduled_date date,p_start_time time,p_end_time time,
  p_location_type text,p_location_details text,p_off_plan_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  m qarar_meetings.meetings%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_off_plan_reason,'')),'');
  v_details text:=nullif(btrim(coalesce(p_location_details,'')),'');
  v_off boolean;
begin
  select * into m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  perform qarar_iam.assert_permission('meetings.manage',m.governance_unit_id);
  if m.status not in('draft','scheduled') then
    raise exception using errcode='23514',message='لا يمكن تغيير موعد الاجتماع أو مكانه بعد تجهيز الجلسة أو بدئها.';
  end if;
  if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if p_scheduled_date is null then raise exception using errcode='22023',message='حدد تاريخ الاجتماع.'; end if;
  if p_start_time is null or p_end_time is null then
    raise exception using errcode='22023',message='حدد وقتي البداية والنهاية.';
  end if;
  if p_end_time<=p_start_time then
    raise exception using errcode='22023',message='يجب أن يكون وقت النهاية بعد وقت البداية.';
  end if;
  if coalesce(p_location_type,'') not in('onsite','online','hybrid') then
    raise exception using errcode='22023',message='اختر نوع المكان: حضوري، أو عن بُعد، أو هجين.';
  end if;
  if char_length(coalesce(v_details,''))>300 then
    raise exception using errcode='22023',message='يجب ألا تتجاوز تفاصيل المكان 300 حرف.';
  end if;
  v_off:=case
    when m.planned_window_start is not null then p_scheduled_date not between m.planned_window_start and m.planned_window_end
    when m.planned_date is not null then p_scheduled_date<>m.planned_date
    else false end;
  if v_off and (v_reason is null or char_length(v_reason) not between 5 and 1000) then
    raise exception using errcode='22023',message='هذا اليوم خارج موعد الدورة المخطط؛ اكتب سبب انعقاده فيه (5 أحرف على الأقل).';
  end if;
  if not v_off then v_reason:=null; end if;
  if m.source_plan_id is not null and exists(
    select 1 from qarar_meetings.meetings o
    where o.source_plan_id=m.source_plan_id and o.id<>m.id and o.scheduled_date=p_scheduled_date
  ) then
    raise exception using errcode='23505',message='يوجد اجتماع آخر من خطة المجلس نفسها في هذا اليوم.';
  end if;
  update qarar_meetings.meetings set
    scheduled_date=p_scheduled_date,start_time=p_start_time,end_time=p_end_time,
    location_type=p_location_type,location_details=v_details,schedule_exception_reason=v_reason,
    updated_at=clock_timestamp()
  where id=m.id and organization_id=m.organization_id;
  perform qarar_audit.append_audit_log(m.organization_id,'meetings.session.rescheduled','meetings',m.id,jsonb_build_object(
    'previous',jsonb_build_object('scheduled_date',m.scheduled_date,'start_time',m.start_time,'end_time',m.end_time,
      'location_type',m.location_type,'location_details',m.location_details),
    'scheduled_date',p_scheduled_date,'start_time',p_start_time,'end_time',p_end_time,
    'location_type',p_location_type,'location_details',v_details,'off_plan_reason',v_reason));
  return qarar_meetings.get_meeting_detail(m.id);
end $$;

create function api_v2.reschedule_meeting_session_v2(
  p_meeting_id uuid,p_scheduled_date date,p_start_time time,p_end_time time,
  p_location_type text,p_location_details text,p_off_plan_reason text,p_expected_updated_at timestamptz
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.reschedule_meeting_session_v2($1,$2,$3,$4,$5,$6,$7,$8)$$;

alter function qarar_meetings.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) owner to qarar_meetings_executor;
alter function api_v2.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) owner to qarar_api_executor;
revoke all on function qarar_meetings.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function api_v2.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) from public,anon,service_role;
grant execute on function qarar_meetings.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) to qarar_api_executor;
grant execute on function api_v2.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz) to authenticated;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false from pg_proc p
where p.oid='qarar_meetings.reschedule_meeting_session_v2(uuid,date,time,time,text,text,text,timestamptz)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','reschedule_meeting_session_v2','qarar_meetings','reschedule_meeting_session_v2',
  'p_meeting_id uuid, p_scheduled_date date, p_start_time time without time zone, p_end_time time without time zone, p_location_type text, p_location_details text, p_off_plan_reason text, p_expected_updated_at timestamp with time zone',
  'meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
