-- Seasonal topics: a season is a period of the year (it may cross the new year),
-- 29 February follows the calendar, and a periodic obligation belongs to the
-- classification, so it is not lost when a new version of it takes effect.
-- Impact map: docs/engineering/impact/SEASONAL_TOPIC_SCHEDULES_20261107_AR.md
begin;

-- The obligation is owed by the classification; the version only says which rules created it.
alter table qarar_governance.topic_schedule_occurrences_v2 add column topic_type_id uuid;
update qarar_governance.topic_schedule_occurrences_v2 occ set topic_type_id=tv.topic_type_id
from qarar_governance.topic_type_versions_v2 tv
where tv.id=occ.topic_type_version_id and tv.organization_id=occ.organization_id and occ.topic_type_id is null;
alter table qarar_governance.topic_schedule_occurrences_v2 alter column topic_type_id set not null;
alter table qarar_governance.topic_schedule_occurrences_v2
  add constraint topic_schedule_occurrences_topic_type_fk
  foreign key(topic_type_id,organization_id) references qarar_governance.topic_types_v2(id,organization_id) on delete restrict;
create index topic_schedule_occurrences_type_open_idx on qarar_governance.topic_schedule_occurrences_v2
  (organization_id,governance_unit_id,topic_type_id,status,available_from);

create function qarar_governance.assign_topic_schedule_occurrence_type_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  select tv.topic_type_id into new.topic_type_id from qarar_governance.topic_type_versions_v2 tv
  where tv.id=new.topic_type_version_id and tv.organization_id=new.organization_id;
  return new;
end $$;
alter function qarar_governance.assign_topic_schedule_occurrence_type_v2() owner to qarar_governance_executor;
revoke all on function qarar_governance.assign_topic_schedule_occurrence_type_v2() from public,anon,authenticated,service_role;
create trigger assign_topic_schedule_occurrence_type before insert on qarar_governance.topic_schedule_occurrences_v2
for each row execute function qarar_governance.assign_topic_schedule_occurrence_type_v2();

create function qarar_governance.season_day_v2(p_year integer,p_month integer,p_day integer)
returns date language sql immutable security definer set search_path=pg_catalog as $$
  select make_date(p_year,p_month,case when p_month=2 and p_day=29
    and not (p_year%4=0 and (p_year%100<>0 or p_year%400=0)) then 28 else p_day end)
$$;
alter function qarar_governance.season_day_v2(integer,integer,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.season_day_v2(integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.season_day_v2(integer,integer,integer) to qarar_governance_executor;

create function qarar_governance.topic_type_id_of_version_v2(p_version_id uuid)
returns uuid language sql stable security definer set search_path=pg_catalog as $$
  select topic_type_id from qarar_governance.topic_type_versions_v2
  where id=p_version_id and organization_id=qarar_iam.current_organization_id()
$$;
alter function qarar_governance.topic_type_id_of_version_v2(uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.topic_type_id_of_version_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.topic_type_id_of_version_v2(uuid) to qarar_governance_executor,qarar_meetings_executor;


CREATE OR REPLACE FUNCTION qarar_governance.topic_schedule_windows_v2(p_rule text, p_config jsonb, p_from date, p_to date)
 RETURNS TABLE(period_key text, available_from date, due_on date)
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare starts date; ends date; cursor_date date; first_day date; last_day date; item jsonb; month_no int; day_no int; week_no int; year_no int; to_month_no int; to_day_no int; lower_bound date; upper_bound date;
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
    lower_bound:=greatest(p_from,starts);
    upper_bound:=least(p_to,coalesce(ends,p_to));
    -- A season that began last year may still be running, so start one year back.
    for year_no in extract(year from lower_bound)::int-1..extract(year from upper_bound)::int loop
      for item in select value from jsonb_array_elements(case when p_config ? 'dates' then p_config->'dates' else jsonb_build_array(jsonb_build_object('month',p_config->>'month','day',p_config->>'day')) end) loop
        month_no:=nullif(item->>'month','')::int; day_no:=nullif(item->>'day','')::int;
        to_month_no:=nullif(item->>'to_month','')::int; to_day_no:=nullif(item->>'to_day','')::int;
        if month_no is null or day_no is null or month_no not between 1 and 12 or day_no not between 1 and 31 then raise exception using errcode='22023',message='حدد يوم وشهر كل موعد موسمي'; end if;
        if (to_month_no is null) is distinct from (to_day_no is null) or to_month_no not between 1 and 12 or to_day_no not between 1 and 31 then
          raise exception using errcode='22023',message='حدد يوم وشهر نهاية الفترة الموسمية أو اتركهما فارغين';
        end if;
        -- Reject days that never exist (31 April) whatever the year being read.
        perform make_date(2024,month_no,day_no);
        if to_month_no is not null then perform make_date(2024,to_month_no,to_day_no); end if;
        first_day:=qarar_governance.season_day_v2(year_no,month_no,day_no);
        last_day:=case when to_month_no is null then first_day
          else qarar_governance.season_day_v2(year_no+case when (to_month_no,to_day_no)<(month_no,day_no) then 1 else 0 end,to_month_no,to_day_no) end;
        if first_day<=upper_bound and last_day>=lower_bound then
          period_key:='seasonal:'||first_day; available_from:=first_day; due_on:=last_day; return next;
        end if;
      end loop;
    end loop;
    return;
  end if;
  raise exception using errcode='22023',message='نوع توقيت الموضوع غير مدعوم';
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
  raise exception using errcode='22023',message='راجع تاريخ الموضوع وأيام الدورية';
end $function$;

CREATE OR REPLACE FUNCTION qarar_governance.materialize_topic_schedule_policy_v2(p_policy_id uuid, p_through date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    join qarar_core.governance_units u on u.organization_id=sp.organization_id and u.status in ('active','inactive')
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
        and ((s.governance_unit_id is not null and s.governance_unit_id=u.id)
          or (s.governance_unit_id is null and s.governance_class_id=u.governance_class_id)))
  ), inserted as (
    insert into qarar_governance.topic_schedule_occurrences_v2(organization_id,schedule_policy_id,topic_type_version_id,governance_unit_id,period_key,available_from,due_on)
    select c.organization_id,c.policy_id,c.topic_type_version_id,c.unit_id,c.period_key,c.available_from,c.due_on from candidates c
    -- A new version of the same classification must not repeat a period already owed.
    where not exists(
      select 1 from qarar_governance.topic_schedule_occurrences_v2 prior
      join qarar_governance.topic_type_versions_v2 prior_version on prior_version.id=prior.topic_type_version_id and prior_version.organization_id=prior.organization_id
      join qarar_governance.topic_type_versions_v2 this_version on this_version.id=c.topic_type_version_id and this_version.organization_id=c.organization_id
      where prior.organization_id=c.organization_id and prior.governance_unit_id=c.unit_id and prior.period_key=c.period_key
        and prior_version.topic_type_id=this_version.topic_type_id
        and prior.schedule_policy_id<>c.policy_id)
    on conflict(organization_id,schedule_policy_id,governance_unit_id,period_key) do nothing returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end $function$;

CREATE OR REPLACE FUNCTION qarar_governance.scheduled_agenda_suggestions_v2(p_council_id uuid, p_on date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); result jsonb;
begin
  perform qarar_iam.assert_permission('agenda.manage',p_council_id);
  if p_on is null then raise exception using errcode='22023',message='حدد تاريخ الاجتماع لعرض المقترحات المجدولة'; end if;
  if not exists(select 1 from qarar_core.governance_units where id=p_council_id and organization_id=o and status in ('active','inactive')) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'occurrence_id',occ.id,'reference_number',occ.reference_number,'period_key',occ.period_key,
    'topic_type_version_id',tv.id,'title_ar',tt.name_ar,'available_from',occ.available_from,'due_on',occ.due_on,
    'timing_status',case when p_on>occ.due_on then 'overdue' else 'due' end,
    'required_attachment_count',ap.required_attachment_count) order by occ.available_from,tt.name_ar,occ.id),'[]'::jsonb) into result
  from qarar_governance.topic_schedule_occurrences_v2 occ
  join qarar_governance.topic_types_v2 tt on tt.id=occ.topic_type_id and tt.organization_id=occ.organization_id and tt.is_enabled
  join qarar_governance.topic_type_versions_v2 tv on tv.topic_type_id=tt.id and tv.organization_id=tt.organization_id and tv.status='effective'
  join qarar_governance.topic_type_authoring_profiles_v2 ap on ap.topic_type_version_id=tv.id and ap.organization_id=tv.organization_id and ap.submission_mode='automatic_agenda'
  where occ.organization_id=o and occ.governance_unit_id=p_council_id and occ.status='due' and occ.available_from<=p_on;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION qarar_governance.track_topic_schedule_occurrence_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    select tv.topic_type_id,m.governance_unit_id,m.scheduled_date into topic_type,meeting_unit,meeting_date
      from qarar_topics.topics t join qarar_meetings.meetings m on m.id=new.meeting_id and m.organization_id=new.organization_id
      join qarar_governance.topic_type_versions_v2 tv on tv.id=t.topic_type_version_id and tv.organization_id=t.organization_id
      where t.id=new.topic_id and t.organization_id=new.organization_id;
    if topic_type is null then return new; end if;
    select * into occurrence from qarar_governance.topic_schedule_occurrences_v2
      where organization_id=new.organization_id and governance_unit_id=meeting_unit and topic_type_id=topic_type and status='due'
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
end $function$;

CREATE OR REPLACE FUNCTION qarar_meetings.submit_scheduled_agenda_proposal_v2(p_request_id uuid, p_meeting_id uuid, p_occurrence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  o uuid:=qarar_iam.current_organization_id();
  actor uuid:=auth.uid();
  preparation qarar_topics.typed_submission_preparations_v2%rowtype;
  meeting qarar_meetings.meetings%rowtype;
  occurrence qarar_governance.topic_schedule_occurrences_v2%rowtype;
  first_due_id uuid;
  submitted jsonb;
  agenda jsonb;
begin
  if o is null or actor is null or p_request_id is null or p_meeting_id is null or p_occurrence_id is null then
    raise exception using errcode='22023',message='بيانات استكمال المقترح غير صالحة';
  end if;

  select * into preparation
  from qarar_topics.typed_submission_preparations_v2
  where id=p_request_id and organization_id=o and actor_user_id=actor;
  if preparation.id is null then
    raise exception using errcode='42501',message='تجهيز الموضوع غير متاح';
  end if;

  select * into meeting
  from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=o
  for update;
  if meeting.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود'; end if;
  perform qarar_iam.assert_permission('agenda.manage',meeting.governance_unit_id);
  if meeting.status not in ('draft','scheduled') then
    raise exception using errcode='55000',message='لم يعد الاجتماع قابلاً لتعديل جدول الأعمال';
  end if;

  select * into occurrence
  from qarar_governance.topic_schedule_occurrences_v2
  where id=p_occurrence_id and organization_id=o
  for update;
  if occurrence.id is null then raise exception using errcode='P0002',message='الاستحقاق الدوري غير موجود'; end if;

  if occurrence.status='scheduled'
     and occurrence.meeting_id=meeting.id
     and occurrence.topic_id=(preparation.result->>'topic_id')::uuid then
    return preparation.result||jsonb_build_object(
      'agenda_item_id',occurrence.agenda_item_id,
      'occurrence_id',occurrence.id,
      'idempotent_replay',true
    );
  end if;
  if occurrence.status<>'due' then
    raise exception using errcode='55000',message='تمت معالجة هذا الاستحقاق الدوري مسبقًا';
  end if;
  if occurrence.governance_unit_id<>meeting.governance_unit_id
     or occurrence.topic_type_id is distinct from qarar_governance.topic_type_id_of_version_v2((preparation.input->>'versionId')::uuid)
     or meeting.governance_unit_id<>(preparation.input->>'unitId')::uuid
     or occurrence.available_from>coalesce(meeting.scheduled_date,current_date) then
    raise exception using errcode='23514',message='المقترح لا يطابق مجلس الاجتماع أو دورته';
  end if;

  select id into first_due_id
  from qarar_governance.topic_schedule_occurrences_v2
  where organization_id=o
    and governance_unit_id=meeting.governance_unit_id
    and topic_type_id=occurrence.topic_type_id
    and status='due'
    and available_from<=coalesce(meeting.scheduled_date,current_date)
  order by available_from,id
  for update
  limit 1;
  if first_due_id is distinct from occurrence.id then
    raise exception using errcode='55000',message='استكمل الاستحقاق الأقدم لهذا التصنيف أولًا';
  end if;

  submitted:=qarar_topics.submit_typed_submission_v2(p_request_id);
  agenda:=qarar_meetings.add_agenda_item(
    p_meeting_id,
    (submitted->>'topic_id')::uuid,
    false,
    null
  );

  select * into occurrence
  from qarar_governance.topic_schedule_occurrences_v2
  where id=p_occurrence_id and organization_id=o;
  if occurrence.status<>'scheduled'
     or occurrence.topic_id<>(submitted->>'topic_id')::uuid
     or occurrence.agenda_item_id<>(agenda->>'id')::uuid then
    raise exception using errcode='55000',message='تعذر ربط البند بالاستحقاق الدوري المحدد';
  end if;

  perform qarar_audit.append_audit_log(
    o,
    'meetings.scheduled_agenda_proposal.submit',
    'topic_schedule_occurrences_v2',
    occurrence.id,
    jsonb_build_object('meeting_id',meeting.id,'topic_id',occurrence.topic_id,'agenda_item_id',occurrence.agenda_item_id)
  );
  return submitted||jsonb_build_object(
    'agenda_item_id',occurrence.agenda_item_id,
    'occurrence_id',occurrence.id
  );
end $function$;
grant execute on function qarar_governance.topic_schedule_windows_v2(text,jsonb,date,date) to qarar_governance_executor,qarar_meetings_executor;

insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('meetings','qarar_governance','topic_type_id_of_version_v2','p_version_id uuid','A scheduled proposal checks that its classification is the one the obligation belongs to')
on conflict do nothing;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_governance.season_day_v2(integer,integer,integer)'::regprocedure,
  'qarar_governance.topic_type_id_of_version_v2(uuid)'::regprocedure,
  'qarar_governance.assign_topic_schedule_occurrence_type_v2()'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

notify pgrst,'reload schema';
commit;
