-- Keep every open-ended council meeting plan materialized one year ahead.
begin;

create function qarar_meetings.council_plan_materialization_horizon_v2(
  p_first_meeting_date date,
  p_ends_on date,
  p_today date
) returns date
language plpgsql immutable
set search_path=pg_catalog
as $$
begin
  if p_first_meeting_date is null or p_today is null then
    raise exception using errcode='22023',message='تعذر حساب أفق خطة الاجتماعات لغياب التاريخ.';
  end if;
  if p_ends_on is not null then return p_ends_on; end if;
  return greatest(
    (p_first_meeting_date+interval '1 year'-interval '1 day')::date,
    (p_today+interval '1 year'-interval '1 day')::date
  );
end;
$$;

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
    if exists(select 1 from qarar_meetings.meetings m where m.source_plan_id=v_plan.id and m.scheduled_date=v_start) then
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
        planned_window_end,schedule_date_confirmed
      ) values(
        v_org,v_reference,v_plan.governance_unit_id,v_plan.meeting_type_id,'اجتماع '||v_unit_name,
        v_start,v_plan.start_time,v_plan.end_time,'draft',v_actor,v_plan.id,
        case when v_plan.monthly_week is not null then v_start end,
        case when v_plan.monthly_week is not null then v_end end,
        v_plan.monthly_week is null
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

create function qarar_meetings.extend_open_ended_council_meeting_plans_v2()
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_plan record;v_result jsonb;v_plans integer:=0;v_created integer:=0;
begin
  if auth.uid() is not null then
    raise exception using errcode='42501',message='هذه العملية مخصصة للعامل الداخلي.';
  end if;
  for v_plan in
    select id from qarar_meetings.council_meeting_plans_v2
    where status='active' and ends_on is null order by id for update skip locked
  loop
    v_result:=qarar_meetings.materialize_council_meeting_plan_v2(v_plan.id);
    v_plans:=v_plans+1;
    v_created:=v_created+coalesce((v_result->>'created_count')::integer,0);
  end loop;
  return jsonb_build_object('plan_count',v_plans,'created_count',v_created,'ran_at',clock_timestamp());
end;
$$;

alter function qarar_meetings.council_plan_materialization_horizon_v2(date,date,date) owner to qarar_meetings_executor;
alter function qarar_meetings.materialize_council_meeting_plan_v2(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.extend_open_ended_council_meeting_plans_v2() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.council_plan_materialization_horizon_v2(date,date,date),
  qarar_meetings.materialize_council_meeting_plan_v2(uuid),
  qarar_meetings.extend_open_ended_council_meeting_plans_v2()
from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.council_plan_materialization_horizon_v2(date,date,date)'::regprocedure,
  'qarar_meetings.materialize_council_meeting_plan_v2(uuid)'::regprocedure,
  'qarar_meetings.extend_open_ended_council_meeting_plans_v2()'::regprocedure
)
on conflict(function_oid) do update set function_name=excluded.function_name,
  identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,
  owning_schema=excluded.owning_schema,is_rls_predicate=false;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='qarar-extend-open-ended-council-plans';
    perform cron.schedule(
      'qarar-extend-open-ended-council-plans','25 0 * * *',
      'select qarar_meetings.extend_open_ended_council_meeting_plans_v2()'
    );
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
