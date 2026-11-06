-- Every council plan's meeting has a cycle window, whatever its recurrence, and
-- the agreed late rule holds: after its window a meeting is still held, with a
-- stated reason and the out-of-cycle label, until the next cycle begins; then it
-- is «لم يُنفذ». A date inside the next cycle is never accepted.
-- Impact map: docs/engineering/impact/MEETING_CYCLE_WINDOWS_LATE_RULE_20261107_AR.md
begin;

-- 1. When the next cycle of a plan meeting begins.
create function qarar_meetings.next_cycle_start_v2(p_meeting_id uuid)
returns date language sql stable security definer set search_path=pg_catalog
as $$
  select min(coalesce(x.planned_window_start,x.planned_date))
  from qarar_meetings.meetings m
  join qarar_meetings.meetings x on x.source_plan_id=m.source_plan_id and x.planned_date>m.planned_date
  where m.id=p_meeting_id and m.source_plan_id is not null
$$;
alter function qarar_meetings.next_cycle_start_v2(uuid) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.next_cycle_start_v2(uuid) from public,anon,authenticated,service_role;

-- 2. Lifecycle: a late session needs its reason; none once the next cycle began.
create or replace function qarar_meetings.guard_meeting_status_transitions()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_today date;
  v_council_status text;
  v_next date;
begin
  if old.status=new.status then return new; end if;
  if old.status='draft' and new.status not in('scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='scheduled' and new.status not in('ready_to_start','cancelled','draft','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='ready_to_start' and new.status not in('in_progress','scheduled','cancelled','not_held') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='in_progress' and new.status not in('waiting_for_minutes','postponed','cancelled') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_minutes' and new.status not in('waiting_for_approval') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='waiting_for_approval' and new.status not in('closed','waiting_for_minutes') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='closed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='cancelled' and new.status not in('draft','scheduled','archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='postponed' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='not_held' and new.status not in('archived') then
    raise exception 'Invalid transition from % to %',old.status,new.status;
  elsif old.status='archived' then
    raise exception 'Cannot transition from archived status.';
  end if;

  if new.status in('scheduled','ready_to_start','in_progress') and new.planned_window_start is not null then
    v_today:=qarar_meetings.organization_today_v2(new.organization_id);
    if v_today<new.planned_window_start then
      raise exception using errcode='23514',message=qarar_meetings.cycle_not_open_message_v2(new.planned_window_start);
    end if;
  end if;

  if new.status in('ready_to_start','in_progress') and new.source_plan_id is not null then
    v_today:=coalesce(v_today,qarar_meetings.organization_today_v2(new.organization_id));
    v_next:=qarar_meetings.next_cycle_start_v2(new.id);
    if v_next is not null and v_today>=v_next then
      raise exception using errcode='55000',message='بدأت دورة الاجتماع التالية في '||qarar_meetings.arabic_date_v2(v_next)||'؛ لم يعد هذا الاجتماع قابلًا للانعقاد.';
    end if;
    if new.planned_window_end is not null and v_today>new.planned_window_end
       and nullif(btrim(coalesce(new.schedule_exception_reason,'')),'') is null then
      raise exception using errcode='55000',message='انتهت فترة دورة هذا الاجتماع في '||qarar_meetings.arabic_date_v2(new.planned_window_end)
        ||'؛ حدد موعده الجديد واكتب سبب انعقاده خارج الدورة'||case when v_next is null then '' else '، قبل '||qarar_meetings.arabic_date_v2(v_next) end||'.';
    end if;
  end if;

  if new.status='in_progress' then
    select status into v_council_status from qarar_core.governance_units
    where id=new.governance_unit_id and organization_id=new.organization_id;
    if v_council_status is distinct from 'active' then
      raise exception using errcode='55000',message='المجلس غير مفعّل؛ فعّله أولًا ثم افتح الجلسة. يمكن تجهيز جدول الأعمال قبل التفعيل.';
    end if;
  end if;

  if new.status='waiting_for_minutes' and new.quorum_status<>'met' and new.quorum_continuation is null then
    raise exception 'Cannot proceed to minutes phase. Quorum is not met.';
  end if;
  return new;
end $$;

-- 3. A date inside the next cycle is refused.
create or replace function qarar_meetings.guard_council_window_confirmation_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_next date;
begin
  if new.planned_window_start is not null then
    if old.planned_window_start is distinct from new.planned_window_start or old.planned_window_end is distinct from new.planned_window_end
      or old.source_plan_id is distinct from new.source_plan_id then
      raise exception using errcode='22023',message='نافذة الخطة محفوظة ولا تعدّل من الاجتماع';
    end if;
    if (new.scheduled_date,new.start_time,new.end_time,new.location_type,new.location_details)
       is distinct from (old.scheduled_date,old.start_time,old.end_time,old.location_type,old.location_details)
       and new.status in('draft','scheduled','ready_to_start')
       and qarar_meetings.organization_today_v2(new.organization_id)<new.planned_window_start then
      raise exception using errcode='55000',message=qarar_meetings.cycle_not_open_message_v2(new.planned_window_start);
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
    if new.scheduled_date is distinct from old.scheduled_date and new.source_plan_id is not null then
      v_next:=qarar_meetings.next_cycle_start_v2(new.id);
      if v_next is not null and new.scheduled_date>=v_next then
        raise exception using errcode='22023',message='يقع هذا اليوم في دورة الاجتماع التالية التي تبدأ في '||qarar_meetings.arabic_date_v2(v_next)||'؛ اختر يومًا قبلها.';
      end if;
    end if;
    if new.schedule_date_confirmed and new.scheduled_date not between new.planned_window_start and new.planned_window_end
      and nullif(btrim(coalesce(new.schedule_exception_reason,'')),'') is null then
      raise exception using errcode='22023',message='هذا اليوم خارج أسبوع الاجتماع المخطط؛ اكتب سبب انعقاده فيه.';
    end if;
    if new.status not in('draft','cancelled','archived','not_held') and not new.schedule_date_confirmed then
      raise exception using errcode='55000',message='حدد يوم الاجتماع ووقت انعقاده قبل الجدولة.';
    end if;
  end if;
  return new;
end;
$$;

-- 4. Weekly, quarterly, half-yearly and yearly plans get the week of the planned day.
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
    else
      -- A plan without a week of the month meets on its planned day, inside that
      -- day's week (Sunday to Saturday): the cycle's preparation and late period
      -- are measured from that week, as they are for a month's week.
      v_start:=v_cursor;v_end:=v_cursor;
    end if;
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
      -- The name is generated from the session number by the numbering trigger.
      insert into qarar_meetings.meetings(
        organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,title_is_custom,scheduled_date,
        start_time,end_time,status,created_by_user_id,source_plan_id,planned_window_start,
        planned_window_end,schedule_date_confirmed,planned_date,quorum_percentage
      ) values(
        v_org,v_reference,v_plan.governance_unit_id,v_plan.meeting_type_id,'اجتماع '||v_unit_name,false,
        v_start,v_plan.start_time,v_plan.end_time,'draft',v_actor,v_plan.id,
        case when v_plan.monthly_week is not null then v_start else v_start-extract(dow from v_start)::integer end,
        case when v_plan.monthly_week is not null then v_end else v_start-extract(dow from v_start)::integer+6 end,
        v_plan.monthly_week is null,v_start,v_plan.quorum_percentage
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

-- 5. Existing plan meetings without a window get the week of their planned day.
alter table qarar_meetings.meetings disable trigger council_window_confirmation;
update qarar_meetings.meetings
set planned_window_start=planned_date-extract(dow from planned_date)::integer,
    planned_window_end=planned_date-extract(dow from planned_date)::integer+6
where source_plan_id is not null and planned_window_start is null and planned_date is not null;
alter table qarar_meetings.meetings enable trigger council_window_confirmation;

-- 6. The meeting details say when the next cycle begins.
do $$
declare v_def text;v_new text;v_old text:='  return v_detail;';
begin
  v_def:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'get_meeting_detail return not found exactly once';
  end if;
  v_new:=replace(v_def,v_old,'  v_detail:=jsonb_set(v_detail,''{next_cycle_start}'',coalesce(to_jsonb(qarar_meetings.next_cycle_start_v2(p_meeting_id)),''null''::jsonb),true);
'||v_old);
  execute v_new;
end;
$$;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p where p.oid='qarar_meetings.next_cycle_start_v2(uuid)'::regprocedure
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

-- 7. Cycles that ended while their plan had no window are classified now.
select qarar_meetings.finalize_unheld_plan_meetings_v2(current_date);

notify pgrst,'reload schema';
commit;
