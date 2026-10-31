-- Calendar read model and eager, idempotent council-plan materialization.
begin;

drop trigger if exists council_plan_first_draft on qarar_meetings.council_meeting_plans_v2;

create function qarar_meetings.materialize_council_meeting_plan_v2(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();v_plan qarar_meetings.council_meeting_plans_v2%rowtype;
  v_unit_name text;v_cursor date;v_horizon date;v_window jsonb;v_start date;v_end date;
  v_number integer;v_reference text;v_id uuid;v_created integer:=0;v_existing integer:=0;v_year integer;
begin
  select * into v_plan from qarar_meetings.council_meeting_plans_v2
  where id=p_plan_id and organization_id=v_org for update;
  if v_plan.id is null then raise exception using errcode='P0002',message='خطة الاجتماعات غير موجودة.';end if;
  if not (qarar_iam.has_permission('governance.units.manage',v_plan.governance_unit_id)
    or qarar_iam.has_permission('meetings.create',v_plan.governance_unit_id)) then
    raise exception using errcode='42501',message='لا تملك صلاحية إنشاء اجتماعات هذا المجلس.';
  end if;
  select name_ar into v_unit_name from qarar_core.governance_units
  where id=v_plan.governance_unit_id and organization_id=v_org and is_active;
  if v_unit_name is null then raise exception using errcode='23503',message='المجلس غير موجود أو غير نشط.';end if;
  v_horizon:=coalesce(v_plan.ends_on,(v_plan.first_meeting_date+interval '1 year'-interval '1 day')::date);
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
      insert into qarar_meetings.meeting_number_counters(organization_id,year_no,last_value)
      values(v_org,v_year,1) on conflict(organization_id,year_no) do update
      set last_value=qarar_meetings.meeting_number_counters.last_value+1,updated_at=clock_timestamp()
      returning last_value into v_number;
      v_reference:='MTG-'||v_year::text||'-'||lpad(v_number::text,6,'0');
      insert into qarar_meetings.meetings(
        organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,scheduled_date,
        start_time,end_time,status,created_by_user_id,source_plan_id,planned_window_start,
        planned_window_end,schedule_date_confirmed
      ) values(
        v_org,v_reference,v_plan.governance_unit_id,v_plan.meeting_type_id,'اجتماع '||v_unit_name,
        v_start,v_plan.start_time,v_plan.end_time,'draft',auth.uid(),v_plan.id,
        case when v_plan.monthly_week is not null then v_start end,
        case when v_plan.monthly_week is not null then v_end end,
        v_plan.monthly_week is null
      ) returning id into v_id;
      insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
      values(v_org,v_id,null,'draft',auth.uid(),'created from complete council meeting plan');
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

create function qarar_meetings.materialize_council_plan_cycle_trigger()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$begin perform qarar_meetings.materialize_council_meeting_plan_v2(new.id);return new;end$$;
create trigger council_plan_materialize_cycle after insert on qarar_meetings.council_meeting_plans_v2
for each row execute function qarar_meetings.materialize_council_plan_cycle_trigger();

create function qarar_meetings.save_council_meeting_plan_v2(p_council_id uuid,p_plan jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_plan qarar_meetings.council_meeting_plans_v2%rowtype;
v_type uuid;v_recurrence text;v_first date;v_ends date;v_week integer;v_start time;v_end time;v_result jsonb;
begin
  perform qarar_iam.assert_permission('governance.units.manage',p_council_id);
  if p_request_id is null or jsonb_typeof(p_plan)<>'object' then raise exception using errcode='22023',message='بيانات خطة الاجتماعات غير مكتملة.';end if;
  v_type:=nullif(p_plan->>'meeting_type_id','')::uuid;v_recurrence:=p_plan->>'recurrence';
  v_first:=nullif(p_plan->>'first_meeting_date','')::date;v_ends:=nullif(p_plan->>'ends_on','')::date;
  v_week:=nullif(p_plan->>'monthly_week','')::integer;v_start:=nullif(p_plan->>'start_time','')::time;v_end:=nullif(p_plan->>'end_time','')::time;
  if v_recurrence not in('weekly','monthly','quarterly','semiannual','annual') or v_first is null
    or (v_ends is not null and v_ends<v_first) or (v_week is not null and (v_recurrence<>'monthly' or v_week not between 1 and 5))
    or ((v_start is null)<>(v_end is null)) or (v_start is not null and v_end<=v_start) then
    raise exception using errcode='22023',message='أكمل دورة الخطة وتواريخها وأوقاتها بقيم صحيحة.';
  end if;
  if not exists(select 1 from qarar_meetings.meeting_types where id=v_type and organization_id=v_org and is_active) then
    raise exception using errcode='23503',message='نوع الاجتماع غير موجود أو غير نشط.';
  end if;
  select * into v_plan from qarar_meetings.council_meeting_plans_v2
  where organization_id=v_org and governance_unit_id=p_council_id for update;
  if v_plan.id is null then
    insert into qarar_meetings.council_meeting_plans_v2(
      organization_id,governance_unit_id,meeting_type_id,recurrence,monthly_week,status,
      first_meeting_date,start_time,end_time,ends_on,created_by_user_id
    ) values(v_org,p_council_id,v_type,v_recurrence,v_week,'active',v_first,v_start,v_end,v_ends,auth.uid()) returning * into v_plan;
    -- The trigger materialized the complete cycle.
    select qarar_meetings.materialize_council_meeting_plan_v2(v_plan.id) into v_result;
  else
    if (v_plan.meeting_type_id,v_plan.recurrence,v_plan.monthly_week,v_plan.first_meeting_date,v_plan.start_time,v_plan.end_time,v_plan.ends_on)
       is distinct from (v_type,v_recurrence,v_week,v_first,v_start,v_end,v_ends)
       and exists(select 1 from qarar_meetings.meetings m where m.source_plan_id=v_plan.id and
         (m.status<>'draft' or exists(select 1 from qarar_governance.notification_outbox o where o.aggregate_type='meeting' and o.aggregate_id=m.id and o.event_type='meeting.invitation.requested'))) then
      raise exception using errcode='55000',message='تتضمن الخطة اجتماعات بدأت أو أرسلت دعوتها؛ عدّل المواعيد غير المبدوءة منفردة أو أنشئ دورة جديدة.';
    end if;
    update qarar_meetings.council_meeting_plans_v2 set meeting_type_id=v_type,recurrence=v_recurrence,monthly_week=v_week,
      first_meeting_date=v_first,start_time=v_start,end_time=v_end,ends_on=v_ends,status='active',updated_at=clock_timestamp()
    where id=v_plan.id returning * into v_plan;
    with cancelled as (
      update qarar_meetings.meetings set status='cancelled',updated_at=clock_timestamp()
      where source_plan_id=v_plan.id and status='draft' returning id
    ) insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
      select v_org,id,'draft','cancelled',auth.uid(),'replaced by edited council meeting plan' from cancelled;
    update qarar_meetings.meetings set source_plan_id=null where source_plan_id=v_plan.id and status='cancelled';
    select qarar_meetings.materialize_council_meeting_plan_v2(v_plan.id) into v_result;
  end if;
  perform qarar_audit.append_audit_log(v_org,'council.meeting_plan.saved','governance_unit',p_council_id,
    jsonb_build_object('meeting_plan_id',v_plan.id,'request_id',p_request_id,'materialization',v_result));
  return jsonb_build_object('plan_id',v_plan.id,'materialization',v_result);
end;
$$;

create function qarar_meetings.list_meetings_calendar_v2(p_from_date date,p_to_date date,p_unit_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();v_actor uuid:=auth.uid();v_admin boolean:=coalesce(qarar_iam.is_system_admin(),false);
begin
  if p_from_date is null or p_to_date is null or p_to_date<p_from_date or p_to_date-p_from_date>370 then
    raise exception using errcode='22023',message='اختر نطاق تقويم صحيحاً لا يتجاوز سنة.';
  end if;
  return coalesce((with authorized_units as materialized(select governance_unit_id from qarar_iam.current_meeting_access_units())
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'meeting_no',m.meeting_no,'title_ar',m.title_ar,'status',m.status,
      'scheduled_date',m.scheduled_date,'planned_window_start',m.planned_window_start,
      'planned_window_end',m.planned_window_end,'schedule_date_confirmed',m.schedule_date_confirmed,
      'start_time',m.start_time,'end_time',m.end_time,'governance_unit_id',m.governance_unit_id,
      'unit_name_ar',u.name_ar,'agenda_item_count',(select count(*) from qarar_meetings.agenda_items ai where ai.meeting_id=m.id)
    ) order by coalesce(m.planned_window_start,m.scheduled_date),m.start_time nulls last)
    from qarar_meetings.meetings m join qarar_core.governance_units u on u.id=m.governance_unit_id and u.organization_id=m.organization_id
    where m.organization_id=v_org
      and coalesce(m.planned_window_end,m.scheduled_date)>=p_from_date and coalesce(m.planned_window_start,m.scheduled_date)<=p_to_date
      and (p_unit_ids is null or cardinality(p_unit_ids)=0 or m.governance_unit_id=any(p_unit_ids))
      and (v_admin or m.created_by_user_id=v_actor or exists(select 1 from authorized_units a where a.governance_unit_id is null or a.governance_unit_id=m.governance_unit_id))
  ),'[]'::jsonb);
end;
$$;

create function api_v2.save_council_meeting_plan_v2(p_council_id uuid,p_plan jsonb,p_request_id uuid) returns jsonb
language sql security definer set search_path=pg_catalog as $$select qarar_meetings.save_council_meeting_plan_v2($1,$2,$3)$$;
create function api_v2.list_meetings_calendar_v2(p_from_date date,p_to_date date,p_unit_ids uuid[] default null) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$select qarar_meetings.list_meetings_calendar_v2($1,$2,$3)$$;

alter function qarar_meetings.materialize_council_meeting_plan_v2(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.materialize_council_plan_cycle_trigger() owner to qarar_meetings_executor;
alter function qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) owner to qarar_meetings_executor;
alter function api_v2.save_council_meeting_plan_v2(uuid,jsonb,uuid) owner to qarar_api_executor;
alter function api_v2.list_meetings_calendar_v2(date,date,uuid[]) owner to qarar_api_executor;
revoke all on function api_v2.save_council_meeting_plan_v2(uuid,jsonb,uuid),api_v2.list_meetings_calendar_v2(date,date,uuid[]) from public,anon,service_role;
grant execute on function api_v2.save_council_meeting_plan_v2(uuid,jsonb,uuid),api_v2.list_meetings_calendar_v2(date,date,uuid[]) to authenticated;
grant execute on function qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid),qarar_meetings.list_meetings_calendar_v2(date,date,uuid[]) to qarar_api_executor;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in('qarar_meetings.materialize_council_meeting_plan_v2(uuid)'::regprocedure,'qarar_meetings.materialize_council_plan_cycle_trigger()'::regprocedure,'qarar_meetings.save_council_meeting_plan_v2(uuid,jsonb,uuid)'::regprocedure,'qarar_meetings.list_meetings_calendar_v2(date,date,uuid[])'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v2','save_council_meeting_plan_v2','qarar_meetings','save_council_meeting_plan_v2','p_council_id uuid, p_plan jsonb, p_request_id uuid','meetings','authenticated'),
('v2','list_meetings_calendar_v2','qarar_meetings','list_meetings_calendar_v2','p_from_date date, p_to_date date, p_unit_ids uuid[]','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;
notify pgrst,'reload schema';
commit;
