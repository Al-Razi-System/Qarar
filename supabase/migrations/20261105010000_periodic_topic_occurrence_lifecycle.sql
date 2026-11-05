begin;

-- Stable occurrences turn a date-derived hint into an auditable obligation.
create table qarar_governance.topic_schedule_occurrences_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null,
  schedule_policy_id uuid not null,
  topic_type_version_id uuid not null,
  governance_unit_id uuid not null,
  period_key text not null,
  available_from date not null,
  due_on date not null,
  status text not null default 'due' check(status in ('due','scheduled','completed','waived')),
  topic_id uuid,
  meeting_id uuid,
  agenda_item_id uuid,
  completed_at timestamptz,
  execution_timing text check(execution_timing in ('within_window','late')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(organization_id,reference_number),
  unique(organization_id,schedule_policy_id,governance_unit_id,period_key),
  unique(agenda_item_id),
  foreign key(schedule_policy_id,organization_id) references qarar_governance.topic_schedule_policies_v2(id,organization_id) on delete restrict,
  foreign key(topic_type_version_id,organization_id) references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict,
  foreign key(governance_unit_id,organization_id) references qarar_core.governance_units(id,organization_id) on delete restrict,
  foreign key(topic_id,organization_id) references qarar_topics.topics(id,organization_id) on delete restrict,
  foreign key(meeting_id,organization_id) references qarar_meetings.meetings(id,organization_id) on delete restrict,
  foreign key(agenda_item_id,organization_id) references qarar_meetings.agenda_items(id,organization_id) on delete restrict,
  check(due_on>=available_from),
  check((status='due' and topic_id is null and meeting_id is null and agenda_item_id is null and completed_at is null and execution_timing is null)
     or (status='scheduled' and topic_id is not null and meeting_id is not null and agenda_item_id is not null and completed_at is null and execution_timing is null)
     or (status='completed' and topic_id is not null and meeting_id is not null and agenda_item_id is not null and completed_at is not null and execution_timing is not null)
     or status='waived')
);
create index topic_schedule_occurrences_open_idx on qarar_governance.topic_schedule_occurrences_v2
  (organization_id,governance_unit_id,status,available_from,due_on);
alter table qarar_governance.topic_schedule_occurrences_v2 enable row level security;
alter table qarar_governance.topic_schedule_occurrences_v2 force row level security;
alter table qarar_governance.topic_schedule_occurrences_v2 owner to qarar_governance_executor;
revoke all on qarar_governance.topic_schedule_occurrences_v2 from public,anon,authenticated,service_role;
grant select,insert,update on qarar_governance.topic_schedule_occurrences_v2 to qarar_governance_executor,qarar_meetings_executor;

create function qarar_governance.assign_topic_schedule_occurrence_reference_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare sequence_value bigint; v_reference_year int:=extract(year from new.available_from);
begin
  if new.reference_number is not null then return new; end if;
  insert into qarar_governance.reference_counters_v2(organization_id,entity_prefix,reference_year,last_value)
  values(new.organization_id,'TSO',v_reference_year,1)
  on conflict(organization_id,entity_prefix,reference_year) do update
    set last_value=qarar_governance.reference_counters_v2.last_value+1,updated_at=clock_timestamp()
  returning last_value into sequence_value;
  new.reference_number:=format('TSO-%s-%s',v_reference_year,lpad(sequence_value::text,6,'0'));
  return new;
end $$;
alter function qarar_governance.assign_topic_schedule_occurrence_reference_v2() owner to qarar_governance_executor;
revoke all on function qarar_governance.assign_topic_schedule_occurrence_reference_v2() from public,anon,authenticated,service_role;
create trigger assign_topic_schedule_occurrence_reference before insert on qarar_governance.topic_schedule_occurrences_v2
for each row execute function qarar_governance.assign_topic_schedule_occurrence_reference_v2();

create function qarar_governance.topic_schedule_windows_v2(p_rule text,p_config jsonb,p_from date,p_to date)
returns table(period_key text,available_from date,due_on date)
language plpgsql immutable security definer set search_path=pg_catalog as $$
declare starts date; ends date; cursor_date date; first_day date; last_day date; item jsonb; month_no int; day_no int; week_no int;
begin
  if p_from is null or p_to is null or p_to<p_from or jsonb_typeof(p_config) is distinct from 'object' then
    raise exception using errcode='22023',message='إعداد توقيت الموضوع غير صالح';
  end if;
  if p_rule='none' then return; end if;
  if p_rule='fixed_date' then
    first_day:=nullif(p_config->>'date','')::date;
    if first_day is null then raise exception using errcode='22023',message='حدد تاريخ مناقشة الموضوع'; end if;
    if first_day between p_from and p_to then
      period_key:='fixed:'||first_day; available_from:=first_day; due_on:=first_day; return next;
    end if;
    return;
  end if;
  starts:=nullif(p_config->>'starts_on','')::date;
  ends:=nullif(p_config->>'ends_on','')::date;
  if starts is null or (ends is not null and ends<starts) then
    raise exception using errcode='22023',message='حدد بداية الدورية ونهاية لا تسبقها';
  end if;
  if p_rule='monthly_week' then
    week_no:=nullif(p_config->>'week','')::int;
    if week_no is null or week_no not between 1 and 4 then raise exception using errcode='22023',message='اختر أسبوعًا من الأول إلى الرابع'; end if;
    cursor_date:=date_trunc('month',greatest(p_from,starts))::date;
    while cursor_date<=least(p_to,coalesce(ends,p_to)) loop
      first_day:=cursor_date+(week_no-1)*7;
      last_day:=case when week_no=4 then (cursor_date+interval '1 month - 1 day')::date else first_day+6 end;
      first_day:=greatest(first_day,starts); last_day:=least(last_day,coalesce(ends,last_day));
      if last_day>=first_day and first_day<=p_to and last_day>=p_from then
        period_key:='month:'||to_char(cursor_date,'YYYY-MM'); available_from:=first_day; due_on:=last_day; return next;
      end if;
      cursor_date:=(cursor_date+interval '1 month')::date;
    end loop;
    return;
  end if;
  if p_rule='seasonal' then
    if p_config ? 'dates' then
      if jsonb_typeof(p_config->'dates') is distinct from 'array' or jsonb_array_length(p_config->'dates') not between 1 and 24
        or exists(select 1 from jsonb_array_elements(p_config->'dates') d where jsonb_typeof(d) is distinct from 'object')
        or (select count(*) from jsonb_array_elements(p_config->'dates'))<>(select count(distinct (d->>'month')||':'||(d->>'day')) from jsonb_array_elements(p_config->'dates') d) then
        raise exception using errcode='22023',message='حدد مواعيد موسمية صحيحة وغير مكررة';
      end if;
    elsif not (p_config ? 'month' and p_config ? 'day') then
      raise exception using errcode='22023',message='حدد يومًا موسميًا واحدًا على الأقل';
    end if;
    for cursor_date in select make_date(y,1,1) from generate_series(extract(year from greatest(p_from,starts))::int,extract(year from least(p_to,coalesce(ends,p_to)))::int) y loop
      for item in select value from jsonb_array_elements(case when p_config ? 'dates' then p_config->'dates' else jsonb_build_array(jsonb_build_object('month',p_config->>'month','day',p_config->>'day')) end) loop
        month_no:=nullif(item->>'month','')::int; day_no:=nullif(item->>'day','')::int;
        if month_no is null or day_no is null or month_no not between 1 and 12 or day_no not between 1 and 31 then raise exception using errcode='22023',message='حدد يوم وشهر كل موعد موسمي'; end if;
        first_day:=make_date(extract(year from cursor_date)::int,month_no,day_no);
        if first_day between greatest(p_from,starts) and least(p_to,coalesce(ends,p_to)) then
          period_key:='seasonal:'||first_day; available_from:=first_day; due_on:=first_day; return next;
        end if;
      end loop;
    end loop;
    return;
  end if;
  raise exception using errcode='22023',message='نوع توقيت الموضوع غير مدعوم';
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='راجع تاريخ الموضوع وأيام الدورية';
end $$;
alter function qarar_governance.topic_schedule_windows_v2(text,jsonb,date,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.topic_schedule_windows_v2(text,jsonb,date,date) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.topic_schedule_windows_v2(text,jsonb,date,date) to qarar_governance_executor,qarar_meetings_executor;

create or replace function qarar_governance.topic_schedule_window_v2(p_rule text,p_config jsonb,p_on date)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  if p_on is null then raise exception using errcode='22023',message='إعداد توقيت الموضوع غير صالح'; end if;
  select jsonb_build_object('available_from',w.available_from,'due_on',w.due_on,'is_due',p_on between w.available_from and w.due_on)
    into result from qarar_governance.topic_schedule_windows_v2(p_rule,p_config,date_trunc('year',p_on)::date,(date_trunc('year',p_on)+interval '1 year - 1 day')::date) w
    order by case when p_on between w.available_from and w.due_on then 0 else 1 end,abs(p_on-w.available_from) limit 1;
  return result;
end $$;
alter function qarar_governance.topic_schedule_window_v2(text,jsonb,date) owner to qarar_governance_executor;

create function qarar_governance.materialize_topic_schedule_policy_v2(p_policy_id uuid,p_through date)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare inserted_count int;
begin
  if p_policy_id is null or p_through is null then raise exception using errcode='22023',message='تعذر تحديد سياسة الاستحقاق'; end if;
  with candidates as (
    select sp.organization_id,sp.id policy_id,sp.topic_type_version_id,u.id unit_id,w.*
    from qarar_governance.topic_schedule_policies_v2 sp
    join qarar_governance.topic_type_versions_v2 tv on tv.id=sp.topic_type_version_id and tv.organization_id=sp.organization_id and tv.status='effective'
    join qarar_governance.governance_bundles_v2 b on b.topic_type_version_id=tv.id and b.organization_id=tv.organization_id and b.status='effective'
    join qarar_governance.topic_type_authoring_profiles_v2 ap on ap.topic_type_version_id=tv.id and ap.organization_id=tv.organization_id and ap.submission_mode='automatic_agenda'
    join qarar_governance.topic_type_workflow_bindings_v2 wb on wb.topic_type_version_id=tv.id and wb.organization_id=tv.organization_id and wb.status='effective'
    join qarar_core.governance_units u on u.organization_id=sp.organization_id and u.status='active'
    join qarar_core.governance_unit_types ut on ut.id=u.unit_type_id and ut.organization_id=u.organization_id and ut.is_council_type
    cross join lateral qarar_governance.topic_schedule_windows_v2(sp.rule_type,sp.rule_config,
      greatest(coalesce(sp.effective_from,tv.effective_from,current_date),coalesce((sp.rule_config->>'starts_on')::date,coalesce(sp.effective_from,tv.effective_from,current_date))),p_through) w
    where sp.id=p_policy_id and sp.status='effective' and sp.rule_type<>'none'
      and (sp.effective_to is null or sp.effective_to>=current_date)
      and (tv.effective_to is null or tv.effective_to>=current_date)
      and ((ap.scope_kind='route')
        or (ap.scope_kind='councils' and exists(select 1 from qarar_governance.topic_type_origin_scopes_v2 s where s.topic_type_version_id=tv.id and s.organization_id=tv.organization_id and s.council_id=u.id))
        or (ap.scope_kind='classes' and exists(select 1 from qarar_governance.topic_type_origin_scopes_v2 s where s.topic_type_version_id=tv.id and s.organization_id=tv.organization_id and s.governance_class_id=u.governance_class_id)))
      and exists(select 1 from qarar_governance.workflow_template_steps s where s.workflow_template_version_id=wb.workflow_template_version_id and s.organization_id=sp.organization_id and s.is_initial
        and qarar_governance.resolve_step_unit(sp.organization_id,u.id,s.governance_unit_id,s.governance_class_id)=u.id)
  ), inserted as (
    insert into qarar_governance.topic_schedule_occurrences_v2(organization_id,schedule_policy_id,topic_type_version_id,governance_unit_id,period_key,available_from,due_on)
    select organization_id,policy_id,topic_type_version_id,unit_id,period_key,available_from,due_on from candidates
    on conflict(organization_id,schedule_policy_id,governance_unit_id,period_key) do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end $$;
alter function qarar_governance.materialize_topic_schedule_policy_v2(uuid,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.materialize_topic_schedule_policy_v2(uuid,date) from public,anon,authenticated,service_role;

create function qarar_governance.sync_topic_schedule_occurrences_v2(p_through date default current_date+366)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare policy record; inserted_count int:=0;
begin
  if auth.uid() is not null then raise exception using errcode='42501',message='مزامنة الاستحقاقات عملية داخلية فقط'; end if;
  if p_through is null or p_through<current_date then raise exception using errcode='22023',message='نطاق مزامنة الاستحقاقات غير صالح'; end if;
  for policy in select id from qarar_governance.topic_schedule_policies_v2 where status='effective' and rule_type<>'none' loop
    inserted_count:=inserted_count+qarar_governance.materialize_topic_schedule_policy_v2(policy.id,p_through);
  end loop;
  return inserted_count;
end $$;
alter function qarar_governance.sync_topic_schedule_occurrences_v2(date) owner to qarar_governance_executor;
revoke all on function qarar_governance.sync_topic_schedule_occurrences_v2(date) from public,anon,authenticated,service_role;

create function qarar_governance.refresh_topic_schedule_policy_occurrences_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.status='effective' and new.rule_type<>'none' then
    perform qarar_governance.materialize_topic_schedule_policy_v2(new.id,current_date+366);
  end if;
  return new;
end $$;
alter function qarar_governance.refresh_topic_schedule_policy_occurrences_v2() owner to qarar_governance_executor;
revoke all on function qarar_governance.refresh_topic_schedule_policy_occurrences_v2() from public,anon,authenticated,service_role;
create trigger refresh_topic_schedule_policy_occurrences after insert or update of status,rule_type,rule_config,effective_from,effective_to
on qarar_governance.topic_schedule_policies_v2 for each row execute function qarar_governance.refresh_topic_schedule_policy_occurrences_v2();

create or replace function qarar_governance.scheduled_agenda_suggestions_v2(p_council_id uuid,p_on date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
  perform qarar_iam.assert_permission('agenda.manage',p_council_id);
  if p_on is null then raise exception using errcode='22023',message='حدد تاريخ الاجتماع لعرض المقترحات المجدولة'; end if;
  if not exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o and status='active') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurrence_id',occ.id,'reference_number',occ.reference_number,'period_key',occ.period_key,
    'topic_type_version_id',occ.topic_type_version_id,'title_ar',tt.name_ar,'available_from',occ.available_from,'due_on',occ.due_on,
    'timing_status',case when p_on>occ.due_on then 'overdue' else 'due' end,
    'required_attachment_count',ap.required_attachment_count) order by occ.available_from,tt.name_ar,occ.id),'[]'::jsonb) into result
  from qarar_governance.topic_schedule_occurrences_v2 occ
  join qarar_governance.topic_type_versions_v2 tv on tv.id=occ.topic_type_version_id and tv.organization_id=occ.organization_id and tv.status='effective'
  join qarar_governance.topic_types_v2 tt on tt.id=tv.topic_type_id and tt.organization_id=tv.organization_id and tt.is_enabled
  join qarar_governance.topic_type_authoring_profiles_v2 ap on ap.topic_type_version_id=tv.id and ap.organization_id=tv.organization_id and ap.submission_mode='automatic_agenda'
  where occ.organization_id=o and occ.governance_unit_id=p_council_id and occ.status='due' and occ.available_from<=p_on;
  return result;
end $$;
alter function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) owner to qarar_governance_executor;
revoke all on function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.scheduled_agenda_suggestions_v2(uuid,date) to qarar_meetings_executor;

create function qarar_governance.track_topic_schedule_occurrence_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare topic_type uuid; meeting_unit uuid; meeting_date date; occurrence record;
begin
  if tg_op='DELETE' then
    update qarar_governance.topic_schedule_occurrences_v2 set status='due',topic_id=null,meeting_id=null,agenda_item_id=null,updated_at=clock_timestamp()
      where agenda_item_id=old.id and status='scheduled' returning id,organization_id,reference_number into occurrence;
    if occurrence.id is not null then
      perform qarar_audit.append_audit_log(occurrence.organization_id,'governance.topic_schedule_occurrence.reopened','topic_schedule_occurrences_v2',occurrence.id,
        jsonb_build_object('reference_number',occurrence.reference_number,'removed_agenda_item_id',old.id));
    end if;
    return old;
  end if;
  if tg_op='INSERT' then
    select t.topic_type_version_id,m.governance_unit_id,m.scheduled_date into topic_type,meeting_unit,meeting_date
      from qarar_topics.topics t join qarar_meetings.meetings m on m.id=new.meeting_id and m.organization_id=new.organization_id
      where t.id=new.topic_id and t.organization_id=new.organization_id;
    if topic_type is null then return new; end if;
    select * into occurrence from qarar_governance.topic_schedule_occurrences_v2
      where organization_id=new.organization_id and governance_unit_id=meeting_unit and topic_type_version_id=topic_type and status='due'
        and available_from<=coalesce(meeting_date,current_date)
      order by available_from,id for update skip locked limit 1;
    if occurrence.id is not null then
      update qarar_governance.topic_schedule_occurrences_v2 set status='scheduled',topic_id=new.topic_id,meeting_id=new.meeting_id,agenda_item_id=new.id,updated_at=clock_timestamp() where id=occurrence.id;
      perform qarar_audit.append_audit_log(new.organization_id,'governance.topic_schedule_occurrence.scheduled','topic_schedule_occurrences_v2',occurrence.id,
        jsonb_build_object('reference_number',occurrence.reference_number,'topic_id',new.topic_id,'meeting_id',new.meeting_id,'agenda_item_id',new.id));
    end if;
    return new;
  end if;
  if new.agenda_status='discussed' and old.agenda_status is distinct from new.agenda_status then
    select scheduled_date into meeting_date from qarar_meetings.meetings where id=new.meeting_id and organization_id=new.organization_id;
    update qarar_governance.topic_schedule_occurrences_v2 set status='completed',completed_at=clock_timestamp(),
      execution_timing=case when coalesce(meeting_date,current_date) between available_from and due_on then 'within_window' else 'late' end,updated_at=clock_timestamp()
      where agenda_item_id=new.id and status='scheduled' returning id,reference_number,execution_timing into occurrence;
    if occurrence.id is not null then
      perform qarar_audit.append_audit_log(new.organization_id,'governance.topic_schedule_occurrence.completed','topic_schedule_occurrences_v2',occurrence.id,
        jsonb_build_object('reference_number',occurrence.reference_number,'meeting_id',new.meeting_id,'agenda_item_id',new.id,'execution_timing',occurrence.execution_timing));
    end if;
  end if;
  return new;
end $$;
alter function qarar_governance.track_topic_schedule_occurrence_v2() owner to qarar_governance_executor;
revoke all on function qarar_governance.track_topic_schedule_occurrence_v2() from public,anon,authenticated,service_role;
create trigger track_topic_schedule_occurrence_insert after insert on qarar_meetings.agenda_items for each row execute function qarar_governance.track_topic_schedule_occurrence_v2();
create trigger track_topic_schedule_occurrence_status after update of agenda_status on qarar_meetings.agenda_items for each row execute function qarar_governance.track_topic_schedule_occurrence_v2();
create trigger track_topic_schedule_occurrence_delete before delete on qarar_meetings.agenda_items for each row execute function qarar_governance.track_topic_schedule_occurrence_v2();

do $$begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='qarar-sync-topic-schedule-occurrences';
    perform cron.schedule('qarar-sync-topic-schedule-occurrences','20 0 * * *','select qarar_governance.sync_topic_schedule_occurrences_v2()');
  end if;
end$$;

select qarar_governance.sync_topic_schedule_occurrences_v2(current_date+366);

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
 'qarar_governance.topic_schedule_windows_v2(text,jsonb,date,date)'::regprocedure,
 'qarar_governance.materialize_topic_schedule_policy_v2(uuid,date)'::regprocedure,
 'qarar_governance.sync_topic_schedule_occurrences_v2(date)'::regprocedure,
 'qarar_governance.refresh_topic_schedule_policy_occurrences_v2()'::regprocedure,
 'qarar_governance.assign_topic_schedule_occurrence_reference_v2()'::regprocedure,
 'qarar_governance.track_topic_schedule_occurrence_v2()'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

notify pgrst,'reload schema';

commit;
