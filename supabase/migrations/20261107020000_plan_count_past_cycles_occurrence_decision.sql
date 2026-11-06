-- Three follow-ups of the periodic-council mechanism:
--  * a plan may end after a number of cycles instead of on a date;
--  * a plan made with a start date in the past does not create the cycles that
--    are already history (their next cycle began);
--  * a periodic topic obligation shows the meeting, the day it was discussed, its
--    timing and the decision issued for it.
-- Impact map: docs/engineering/impact/PLAN_COUNT_PAST_CYCLES_OCCURRENCE_DECISION_20261107_AR.md
begin;

-- 1. The end date that a number of cycles gives.
create function qarar_meetings.plan_ends_on_v2(p_recurrence text,p_first date,p_ends date,p_plan jsonb)
returns date language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare v_text text:=nullif(btrim(coalesce(p_plan->>'occurrence_count','')),'');v_count integer;
begin
  if v_text is null then return p_ends; end if;
  if v_text !~ '^[0-9]{1,3}$' or v_text::integer not between 1 and 520 then
    raise exception using errcode='22023',message='عدد الدورات يجب أن يكون عددًا صحيحًا من 1 إلى 520.';
  end if;
  if p_ends is not null then
    raise exception using errcode='22023',message='حدد نهاية الخطة بتاريخ أو بعدد دورات، لا بالاثنين.';
  end if;
  if p_first is null then return null; end if;
  v_count:=v_text::integer;
  return case p_recurrence
    when 'weekly' then p_first+7*(v_count-1)
    when 'monthly' then (p_first+make_interval(months=>v_count-1))::date
    when 'quarterly' then (p_first+make_interval(months=>3*(v_count-1)))::date
    when 'semiannual' then (p_first+make_interval(months=>6*(v_count-1)))::date
    when 'annual' then (p_first+make_interval(years=>v_count-1))::date
    else p_ends end;
end;
$$;
alter function qarar_meetings.plan_ends_on_v2(text,date,date,jsonb) owner to qarar_meetings_executor;
revoke all on function qarar_meetings.plan_ends_on_v2(text,date,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function qarar_meetings.plan_ends_on_v2(text,date,date,jsonb) to qarar_core_executor;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('core','qarar_meetings','plan_ends_on_v2','p_recurrence text, p_first date, p_ends date, p_plan jsonb','A council created with its plan ends it after a number of cycles the same way the plan does')
on conflict do nothing;

-- 2. Every path that saves a plan reads the number of cycles.
do $$
declare v_def text;
  procedure_text text;
begin
  -- Creating a council's plan with the council (and for an existing council).
  v_def:=pg_get_functiondef('qarar_core.admin_update_council_v2(uuid,jsonb,timestamptz,jsonb)'::regprocedure);
  procedure_text:='  if mt is null or not exists(select 1 from qarar_meetings.meeting_types where id=mt and organization_id=o and is_active) then';
  if (length(v_def)-length(replace(v_def,procedure_text,'')))/length(procedure_text)<>1 then raise exception 'admin_update_council_v2 anchor'; end if;
  execute replace(v_def,procedure_text,'  ends_date:=qarar_meetings.plan_ends_on_v2(recurrence_value,first_date,ends_date,p_meeting_plan);'||chr(10)||procedure_text);

  v_def:=pg_get_functiondef('qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid)'::regprocedure);
  procedure_text:='  v_quorum:=qarar_meetings.plan_quorum_from_json_v2(p_plan);';
  if (length(v_def)-length(replace(v_def,procedure_text,'')))/length(procedure_text)<>1 then raise exception 'save_council_meeting_plan_v2 anchor'; end if;
  execute replace(v_def,procedure_text,procedure_text||chr(10)||'  v_ends:=qarar_meetings.plan_ends_on_v2(v_recurrence,v_first,v_ends,p_plan);');

  v_def:=pg_get_functiondef('qarar_core.admin_create_council_v2(text,text,text,uuid,uuid,uuid,uuid,integer,boolean,jsonb,uuid)'::regprocedure);
  procedure_text:='    if v_meeting_type is null or not exists(select 1 from qarar_meetings.meeting_types where id=v_meeting_type and organization_id=v_org and is_active) then';
  if (length(v_def)-length(replace(v_def,procedure_text,'')))/length(procedure_text)<>1 then raise exception 'admin_create_council_v2 anchor'; end if;
  execute replace(v_def,procedure_text,'    v_ends_on:=qarar_meetings.plan_ends_on_v2(v_recurrence,v_first_date,v_ends_on,p_meeting_plan);'||chr(10)||procedure_text);
end;
$$;

-- 3. A plan does not create cycles that are already history.
create or replace function qarar_meetings.materialize_council_meeting_plan_v2(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();v_org uuid;v_plan qarar_meetings.council_meeting_plans_v2%rowtype;
  v_unit_name text;v_cursor date;v_horizon date;v_window jsonb;v_start date;v_end date;
  v_number integer;v_reference text;v_id uuid;v_created integer:=0;v_existing integer:=0;v_year integer;
  v_next_cursor date;v_next_start date;v_today date;v_skipped integer:=0;
begin
  select * into v_plan from qarar_meetings.council_meeting_plans_v2
  where id=p_plan_id for update;
  if v_plan.id is null then raise exception using errcode='P0002',message='خطة الاجتماعات غير موجودة.';end if;
  v_org:=v_plan.organization_id;
  v_today:=qarar_meetings.organization_today_v2(v_org);
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
    v_next_cursor:=case v_plan.recurrence
      when 'weekly' then v_cursor+7
      when 'monthly' then (v_cursor+interval '1 month')::date
      when 'quarterly' then (v_cursor+interval '3 months')::date
      when 'semiannual' then (v_cursor+interval '6 months')::date
      else (v_cursor+interval '1 year')::date end;
    v_next_start:=case when v_plan.monthly_week is not null
      then (qarar_meetings.council_month_week_window_v2(v_next_cursor,v_plan.monthly_week)->>'starts_on')::date
      else v_next_cursor-extract(dow from v_next_cursor)::integer end;
    if exists(select 1 from qarar_meetings.meetings m where m.source_plan_id=v_plan.id and m.planned_date=v_start) then
      v_existing:=v_existing+1;
    elsif v_next_cursor<=v_horizon and v_next_start<=v_today then
      -- A cycle whose next cycle (within the plan) already began is history when
      -- the plan is made: it is not created, so it never shows as needing action.
      -- A plan's last cycle has no next one, so it is always created.
      v_skipped:=v_skipped+1;
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
  return jsonb_build_object('plan_id',v_plan.id,'created_count',v_created,'existing_count',v_existing,'skipped_past_count',v_skipped,'ends_on',v_horizon);
end;
$$;

-- 4. A topic's periodic obligations, with the meeting, the day it was
-- discussed, its timing and the decision issued for its agenda item.
create function qarar_governance.get_topic_schedule_occurrences_v2(p_topic_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_unit uuid;
begin
  select current_unit_id into v_unit from qarar_topics.topics where id=p_topic_id and organization_id=v_org;
  if v_unit is null then raise exception using errcode='P0002',message='الموضوع غير موجود'; end if;
  perform qarar_iam.assert_permission('topics.read',v_unit);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',occ.id,'reference_number',occ.reference_number,'period_key',occ.period_key,
      'available_from',occ.available_from,'due_on',occ.due_on,'status',occ.status,
      'execution_timing',occ.execution_timing,'discussed_on',(occ.completed_at at time zone 'Asia/Aden')::date,
      'meeting',case when m.id is null then null else jsonb_build_object('id',m.id,'meeting_no',m.meeting_no,'title_ar',m.title_ar) end,
      'decision',(select jsonb_build_object('id',d.id,'decision_no',d.decision_no,'decision_status',d.decision_status)
        from qarar_decisions.decisions d where d.agenda_item_id=occ.agenda_item_id and d.organization_id=v_org
        order by d.created_at desc limit 1)
    ) order by occ.available_from)
    from qarar_governance.topic_schedule_occurrences_v2 occ
    left join qarar_meetings.meetings m on m.id=occ.meeting_id and m.organization_id=v_org
    where occ.organization_id=v_org and occ.topic_id=p_topic_id),'[]'::jsonb);
end;
$$;
create function api_v2.get_topic_schedule_occurrences_v2(p_topic_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_governance.get_topic_schedule_occurrences_v2($1)$$;
alter function qarar_governance.get_topic_schedule_occurrences_v2(uuid) owner to qarar_governance_executor;
alter function api_v2.get_topic_schedule_occurrences_v2(uuid) owner to qarar_api_executor;
revoke all on function qarar_governance.get_topic_schedule_occurrences_v2(uuid) from public,anon,authenticated,service_role;
revoke all on function api_v2.get_topic_schedule_occurrences_v2(uuid) from public,anon,service_role;
grant execute on function qarar_governance.get_topic_schedule_occurrences_v2(uuid) to qarar_api_executor;
grant execute on function api_v2.get_topic_schedule_occurrences_v2(uuid) to authenticated;
grant select on qarar_decisions.decisions to qarar_governance_executor;
insert into qarar_architecture.module_table_read_allowlist(source_module,target_schema,table_name,rationale)
select v.source_module,v.target_schema,v.table_name,v.rationale from (values
  ('governance','qarar_decisions','decisions','A periodic topic obligation shows the decision issued for its agenda item')
) v(source_module,target_schema,table_name,rationale)
where not exists(select 1 from qarar_architecture.module_table_read_allowlist a
  where a.source_module=v.source_module and a.target_schema=v.target_schema and a.table_name=v.table_name);

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),case n.nspname when 'qarar_governance' then 'governance' else 'meetings' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in('qarar_meetings.plan_ends_on_v2(text,date,date,jsonb)'::regprocedure,'qarar_governance.get_topic_schedule_occurrences_v2(uuid)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v2','get_topic_schedule_occurrences_v2','qarar_governance','get_topic_schedule_occurrences_v2','p_topic_id uuid','governance','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
