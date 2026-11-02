-- Every council meeting carries its session number within the academic year
-- and a name built from it; the council plan sets the quorum of its meetings;
-- meetings archive themselves a set number of days after their minutes close.
-- Impact map: docs/engineering/impact/MEETING_SESSION_NUMBERING_ARCHIVE_20261101_AR.md
begin;

-- 1. Organisation settings: when the academic year starts and when to archive.
create table qarar_meetings.meeting_settings(
  organization_id uuid primary key references qarar_core.organizations(id) on delete restrict,
  academic_year_start_month smallint not null default 9 check(academic_year_start_month between 1 and 12),
  archive_after_days integer not null default 30 check(archive_after_days between 1 and 365),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by_user_id uuid
);
alter table qarar_meetings.meeting_settings enable row level security;
alter table qarar_meetings.meeting_settings force row level security;
revoke all on qarar_meetings.meeting_settings from public,anon,authenticated,service_role;
grant select,insert,update on qarar_meetings.meeting_settings to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values('meeting_settings','meetings',false)
on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;

-- 2. The session number, its academic year and whether the name is generated.
alter table qarar_meetings.meetings
  add column session_sequence_no integer check(session_sequence_no>0),
  add column academic_year_start date,
  add column title_is_custom boolean not null default true;

-- 3. The plan's quorum, copied into each meeting it creates.
alter table qarar_meetings.council_meeting_plans_v2
  add column quorum_percentage integer not null default 51 check(quorum_percentage between 1 and 100);

-- 4. Naming helpers.
create function qarar_meetings.arabic_session_ordinal_v2(p_number integer)
returns text language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare
  v_ones text[]:=array['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع'];
  v_compound text[]:=array['الحادي','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع'];
  v_tens text[]:=array['العاشر','العشرون','الثلاثون','الأربعون','الخمسون','الستون','السبعون','الثمانون','التسعون'];
begin
  if p_number is null or p_number<1 then return null; end if;
  if p_number<10 then return v_ones[p_number]; end if;
  if p_number=10 then return v_tens[1]; end if;
  if p_number<20 then return v_compound[p_number-10]||' عشر'; end if;
  if p_number<100 then
    if p_number%10=0 then return v_tens[p_number/10]; end if;
    return v_compound[p_number%10]||' و'||v_tens[p_number/10];
  end if;
  return 'رقم '||p_number;
end;
$$;

create function qarar_meetings.council_session_title_v2(p_unit_name text,p_sequence integer,p_date date)
returns text language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare
  v_months text[]:=array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  v_name text:=btrim(p_unit_name);
begin
  if v_name is null or p_sequence is null or p_date is null then return null; end if;
  -- «لـ» before «ال» drops the alif («للكلية»), and before «الل» a lam too («للجنة»).
  v_name:=case when v_name like 'الل%' then 'لل'||substr(v_name,4)
    when v_name like 'ال%' then 'لل'||substr(v_name,3) else 'ل'||v_name end;
  return 'الاجتماع '||qarar_meetings.arabic_session_ordinal_v2(p_sequence)||' '||v_name
    ||' — '||v_months[extract(month from p_date)::integer]||' '||extract(year from p_date)::integer;
end;
$$;

create function qarar_meetings.academic_year_start_v2(p_organization_id uuid,p_date date)
returns date language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_month integer;v_start date;
begin
  if p_date is null then return null; end if;
  select academic_year_start_month into v_month from qarar_meetings.meeting_settings where organization_id=p_organization_id;
  v_start:=make_date(extract(year from p_date)::integer,coalesce(v_month,9),1);
  return case when p_date<v_start then (v_start-interval '1 year')::date else v_start end;
end;
$$;

-- 5. Numbering. A session that has started keeps its number for good; the
-- sessions still ahead are numbered after it, in date order. A cancelled or
-- postponed session no longer takes a number and keeps the name it had.
create function qarar_meetings.refresh_council_session_numbers_v2(p_organization_id uuid,p_unit_id uuid,p_year_start date)
returns integer language plpgsql security definer set search_path=pg_catalog
as $$
declare v_unit_name text;v_held integer;v_changed integer:=0;v_rows integer;r record;
begin
  if p_organization_id is null or p_unit_id is null or p_year_start is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('meeting-session-sequence:'||p_unit_id::text||':'||p_year_start::text,0));
  perform set_config('qarar.meeting_sequence_refresh','on',true);
  select name_ar into v_unit_name from qarar_core.governance_units where id=p_unit_id and organization_id=p_organization_id;
  select coalesce(max(session_sequence_no),0) into v_held from qarar_meetings.meetings
  where organization_id=p_organization_id and governance_unit_id=p_unit_id and academic_year_start=p_year_start
    and status in('in_progress','waiting_for_minutes','waiting_for_approval','closed','archived')
    and session_sequence_no is not null;
  -- Sessions held before numbering existed take the next numbers in date order;
  -- a session whose minutes closed keeps the name it was recorded under.
  for r in select id,scheduled_date,status,title_is_custom from qarar_meetings.meetings
    where organization_id=p_organization_id and governance_unit_id=p_unit_id and academic_year_start=p_year_start
      and status in('in_progress','waiting_for_minutes','waiting_for_approval','closed','archived')
      and session_sequence_no is null
    order by scheduled_date,start_time nulls last,created_at,id
  loop
    v_held:=v_held+1;
    update qarar_meetings.meetings set session_sequence_no=v_held,
      title_ar=case when r.title_is_custom or r.status in('closed','archived') then title_ar
        else qarar_meetings.council_session_title_v2(v_unit_name,v_held,r.scheduled_date) end
    where id=r.id;
    v_changed:=v_changed+1;
  end loop;
  with ranked as(
    select id,v_held+row_number() over(order by scheduled_date,start_time nulls last,created_at,id) as n
    from qarar_meetings.meetings
    where organization_id=p_organization_id and governance_unit_id=p_unit_id and academic_year_start=p_year_start
      and status in('draft','scheduled','ready_to_start')
  )
  update qarar_meetings.meetings m set session_sequence_no=ranked.n,
    title_ar=case when m.title_is_custom then m.title_ar else qarar_meetings.council_session_title_v2(v_unit_name,ranked.n::integer,m.scheduled_date) end
  from ranked where m.id=ranked.id and (m.session_sequence_no is distinct from ranked.n
    or (not m.title_is_custom and m.title_ar is distinct from qarar_meetings.council_session_title_v2(v_unit_name,ranked.n::integer,m.scheduled_date)));
  get diagnostics v_rows=row_count;
  perform set_config('qarar.meeting_sequence_refresh','',true);
  return v_changed+v_rows;
end;
$$;

create function qarar_meetings.number_council_sessions_on_change_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare v_year date;v_number integer;v_unit_name text;
begin
  if current_setting('qarar.meeting_sequence_refresh',true)='on' or new.governance_unit_id is null then return null; end if;
  v_year:=qarar_meetings.academic_year_start_v2(new.organization_id,new.scheduled_date);
  perform set_config('qarar.meeting_sequence_refresh','on',true);
  if tg_op='UPDATE' and old.status in('draft','scheduled','ready_to_start')
     and new.status in('in_progress','waiting_for_minutes','waiting_for_approval','closed','archived') then
    -- The session started: its number is the next one held this year, whatever its date.
    perform pg_advisory_xact_lock(hashtextextended('meeting-session-sequence:'||new.governance_unit_id::text||':'||v_year::text,0));
    select coalesce(max(session_sequence_no),0)+1 into v_number from qarar_meetings.meetings
    where organization_id=new.organization_id and governance_unit_id=new.governance_unit_id and academic_year_start=v_year
      and id<>new.id and status in('in_progress','waiting_for_minutes','waiting_for_approval','closed','archived');
    select name_ar into v_unit_name from qarar_core.governance_units where id=new.governance_unit_id and organization_id=new.organization_id;
    update qarar_meetings.meetings set session_sequence_no=v_number,academic_year_start=v_year,
      title_ar=case when title_is_custom then title_ar else qarar_meetings.council_session_title_v2(v_unit_name,v_number,scheduled_date) end
    where id=new.id;
  elsif new.academic_year_start is null
     or (new.status in('draft','scheduled','ready_to_start') and new.academic_year_start is distinct from v_year) then
    -- A session ahead follows its date; any other takes a year once and keeps it.
    update qarar_meetings.meetings set academic_year_start=v_year where id=new.id;
  end if;
  perform set_config('qarar.meeting_sequence_refresh','',true);
  perform qarar_meetings.refresh_council_session_numbers_v2(new.organization_id,new.governance_unit_id,v_year);
  if tg_op='UPDATE' and (old.academic_year_start is distinct from v_year or old.governance_unit_id is distinct from new.governance_unit_id) then
    perform qarar_meetings.refresh_council_session_numbers_v2(old.organization_id,old.governance_unit_id,old.academic_year_start);
  end if;
  return null;
end;
$$;

create trigger number_council_sessions
after insert or update of scheduled_date,start_time,status,governance_unit_id,title_is_custom
on qarar_meetings.meetings
for each row execute function qarar_meetings.number_council_sessions_on_change_v2();

-- 6. Plan meetings carry the plan's quorum and a generated name.
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
      -- The name is generated from the session number by the numbering trigger.
      insert into qarar_meetings.meetings(
        organization_id,meeting_no,governance_unit_id,meeting_type_id,title_ar,title_is_custom,scheduled_date,
        start_time,end_time,status,created_by_user_id,source_plan_id,planned_window_start,
        planned_window_end,schedule_date_confirmed,planned_date,quorum_percentage
      ) values(
        v_org,v_reference,v_plan.governance_unit_id,v_plan.meeting_type_id,'اجتماع '||v_unit_name,false,
        v_start,v_plan.start_time,v_plan.end_time,'draft',v_actor,v_plan.id,
        case when v_plan.monthly_week is not null then v_start end,
        case when v_plan.monthly_week is not null then v_end end,
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

create function qarar_meetings.plan_quorum_from_json_v2(p_plan jsonb)
returns integer language plpgsql immutable security definer set search_path=pg_catalog
as $$
declare v_text text:=nullif(btrim(p_plan->>'quorum_percentage'),'');
begin
  if v_text is null then return 51; end if;
  if v_text !~ '^[0-9]{1,3}$' or v_text::integer not between 1 and 100 then
    raise exception using errcode='22023',message='نسبة النصاب يجب أن تكون عددًا صحيحًا من 1 إلى 100.';
  end if;
  return v_text::integer;
end;
$$;

-- 7. A council created with its plan keeps the plan's quorum.
create or replace function qarar_core.admin_update_council_v2(p_council_id uuid, p_values jsonb, p_expected_updated_at timestamp with time zone, p_meeting_plan jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o uuid:=qarar_iam.current_organization_id(); r jsonb; plan_id uuid;
 mt uuid; recurrence_value text; first_date date; ends_date date; missed integer; month_week integer; quorum integer;
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
  quorum:=qarar_meetings.plan_quorum_from_json_v2(p_meeting_plan);
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
   first_meeting_date,ends_on,missed_after_days,created_by_user_id,quorum_percentage)
  values(o,p_council_id,mt,recurrence_value,month_week,case when month_week is null then 'draft' else 'active' end,first_date,ends_date,missed,auth.uid(),quorum) returning id into plan_id;
  perform qarar_audit.append_audit_log(o,'council.meeting_plan.created','governance_unit',p_council_id,
   jsonb_build_object('meeting_plan_id',plan_id,'quorum_percentage',quorum));
 end if;
 return r || jsonb_build_object('meeting_plan_id',plan_id,'saved',true);
end $function$;

-- 8. Saving a plan for an existing council: the quorum is part of the plan, and
-- changing only the quorum updates the sessions not yet held without recreating them.
create or replace function qarar_meetings.save_council_meeting_plan_v2(p_council_id uuid, p_plan jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_org uuid:=qarar_iam.current_organization_id();v_plan qarar_meetings.council_meeting_plans_v2%rowtype;
v_type uuid;v_recurrence text;v_first date;v_ends date;v_week integer;v_start time;v_end time;v_result jsonb;v_quorum integer;
begin
  perform qarar_iam.assert_permission('governance.units.manage',p_council_id);
  if p_request_id is null or jsonb_typeof(p_plan)<>'object' then raise exception using errcode='22023',message='بيانات خطة الاجتماعات غير مكتملة.';end if;
  v_type:=nullif(p_plan->>'meeting_type_id','')::uuid;v_recurrence:=p_plan->>'recurrence';
  v_first:=nullif(p_plan->>'first_meeting_date','')::date;v_ends:=nullif(p_plan->>'ends_on','')::date;
  v_week:=nullif(p_plan->>'monthly_week','')::integer;v_start:=nullif(p_plan->>'start_time','')::time;v_end:=nullif(p_plan->>'end_time','')::time;
  v_quorum:=qarar_meetings.plan_quorum_from_json_v2(p_plan);
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
      first_meeting_date,start_time,end_time,ends_on,created_by_user_id,quorum_percentage
    ) values(v_org,p_council_id,v_type,v_recurrence,v_week,'active',v_first,v_start,v_end,v_ends,auth.uid(),v_quorum) returning * into v_plan;
    -- The trigger materialized the complete cycle.
    select qarar_meetings.materialize_council_meeting_plan_v2(v_plan.id) into v_result;
  elsif (v_plan.meeting_type_id,v_plan.recurrence,v_plan.monthly_week,v_plan.first_meeting_date,v_plan.start_time,v_plan.end_time,v_plan.ends_on)
       is not distinct from (v_type,v_recurrence,v_week,v_first,v_start,v_end,v_ends) then
    update qarar_meetings.council_meeting_plans_v2 set quorum_percentage=v_quorum,status='active',updated_at=clock_timestamp()
    where id=v_plan.id returning * into v_plan;
    v_result:=jsonb_build_object('plan_id',v_plan.id,'created_count',0,'schedule_unchanged',true);
  else
    if exists(select 1 from qarar_meetings.meetings m where m.source_plan_id=v_plan.id and
         (m.status<>'draft' or exists(select 1 from qarar_governance.notification_outbox o where o.aggregate_type='meeting' and o.aggregate_id=m.id and o.event_type='meeting.invitation.requested'))) then
      raise exception using errcode='55000',message='تتضمن الخطة اجتماعات بدأت أو أرسلت دعوتها؛ عدّل المواعيد غير المبدوءة منفردة أو أنشئ دورة جديدة.';
    end if;
    update qarar_meetings.council_meeting_plans_v2 set meeting_type_id=v_type,recurrence=v_recurrence,monthly_week=v_week,
      first_meeting_date=v_first,start_time=v_start,end_time=v_end,ends_on=v_ends,quorum_percentage=v_quorum,status='active',updated_at=clock_timestamp()
    where id=v_plan.id returning * into v_plan;
    with cancelled as (
      update qarar_meetings.meetings set status='cancelled',updated_at=clock_timestamp()
      where source_plan_id=v_plan.id and status='draft' returning id
    ) insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
      select v_org,id,'draft','cancelled',auth.uid(),'replaced by edited council meeting plan' from cancelled;
    update qarar_meetings.meetings set source_plan_id=null where source_plan_id=v_plan.id and status='cancelled';
    select qarar_meetings.materialize_council_meeting_plan_v2(v_plan.id) into v_result;
  end if;
  update qarar_meetings.meetings set quorum_percentage=v_quorum
  where source_plan_id=v_plan.id and status in('draft','scheduled','ready_to_start') and quorum_percentage is distinct from v_quorum;
  perform qarar_audit.append_audit_log(v_org,'council.meeting_plan.saved','governance_unit',p_council_id,
    jsonb_build_object('meeting_plan_id',v_plan.id,'request_id',p_request_id,'quorum_percentage',v_quorum,'materialization',v_result));
  return jsonb_build_object('plan_id',v_plan.id,'materialization',v_result);
end;
$function$;

-- 9. The older one-call council creation honours the whole plan: the week of
-- the month (it was dropped) and the quorum, still validated before anything is created.
create or replace function qarar_core.admin_create_council_v2(p_name_ar text, p_name_en text, p_description text, p_unit_type_id uuid, p_scope_unit_id uuid, p_parent_council_id uuid, p_governance_class_id uuid, p_minimum_active_members integer, p_allow_dual_leadership boolean, p_meeting_plan jsonb, p_client_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'qarar_core', 'qarar_meetings', 'qarar_governance'
AS $function$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
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
  v_week integer;
  v_quorum integer;
begin
  perform qarar_iam.assert_permission('governance.units.manage',null);
  if v_actor is null then raise exception using errcode='42501',message='يلزم تسجيل الدخول لإنشاء المجلس'; end if;
  if p_parent_council_id is not null then raise exception using errcode='22023',message='يرتبط المجلس بوحدته التنظيمية؛ لا تحدد مجلسًا أبًا'; end if;
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
  if p_scope_unit_id is not null then
    select level_no into v_level from qarar_core.governance_units where id=p_scope_unit_id and organization_id=v_org;
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
    v_week:=nullif(p_meeting_plan->>'monthly_week','')::integer;
    v_quorum:=qarar_meetings.plan_quorum_from_json_v2(p_meeting_plan);
    if v_week is not null then
      if v_recurrence is distinct from 'monthly' or v_week not between 1 and 5 then
        raise exception using errcode='22023',message='الأسبوع الشهري يتطلب دورية شهرية وأسبوعاً صحيحاً';
      end if;
      v_first_date:=(qarar_meetings.council_month_week_window_v2(v_first_date,v_week)->>'starts_on')::date;
    end if;
    if v_meeting_type is null or not exists(select 1 from qarar_meetings.meeting_types where id=v_meeting_type and organization_id=v_org and is_active) then raise exception using errcode='23503',message='نوع الاجتماع غير موجود أو غير نشط'; end if;
    if v_recurrence not in ('weekly','monthly','quarterly','semiannual','annual') or v_first_date is null or ((v_start is null) <> (v_end is null)) or v_end<=v_start or v_missed not between 0 and 90 or (v_ends_on is not null and v_ends_on<v_first_date) then raise exception using errcode='22023',message='أكمل إعدادات خطة الاجتماعات بقيم صحيحة'; end if;
  end if;
  v_reference:=qarar_governance.next_v2_reference('CNL');
  v_code:=lower(replace(v_reference,'-','_'));
  insert into qarar_core.governance_units(organization_id,parent_unit_id,scope_unit_id,unit_type_id,code,reference_number,name_ar,name_en,description,level_no,status,governance_class_id,minimum_active_members,allow_dual_leadership,created_by_user_id,client_request_id,status_reason)
  values(v_org,null,p_scope_unit_id,p_unit_type_id,v_code,v_reference,btrim(p_name_ar),nullif(btrim(p_name_en),''),nullif(btrim(p_description),''),v_level,'inactive',p_governance_class_id,p_minimum_active_members,coalesce(p_allow_dual_leadership,false),v_actor,p_client_request_id,'created') returning id into v_id;
  if p_meeting_plan is not null then
    insert into qarar_meetings.council_meeting_plans_v2(organization_id,governance_unit_id,meeting_type_id,recurrence,monthly_week,status,first_meeting_date,start_time,end_time,ends_on,missed_after_days,created_by_user_id,quorum_percentage)
    values(v_org,v_id,v_meeting_type,v_recurrence,v_week,case when v_week is null then 'draft' else 'active' end,v_first_date,v_start,v_end,v_ends_on,v_missed,v_actor,v_quorum) returning id into v_plan_id;
  end if;
  perform qarar_audit.append_audit_log(v_org,'council.v2.created','governance_unit',v_id,jsonb_build_object('reference_number',v_reference,'scope_unit_id',p_scope_unit_id,'meeting_plan_id',v_plan_id,'client_request_id',p_client_request_id));
  return jsonb_build_object('id',v_id,'reference_number',v_reference,'status','inactive','meeting_plan_id',v_plan_id,'idempotent_replay',false);
end $function$;

-- 10. Settings contracts.
create function qarar_meetings.get_meeting_settings_v2()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();s qarar_meetings.meeting_settings%rowtype;
begin
  if v_org is null then raise exception using errcode='42501',message='يلزم تسجيل الدخول.'; end if;
  select * into s from qarar_meetings.meeting_settings where organization_id=v_org;
  return jsonb_build_object(
    'academic_year_start_month',coalesce(s.academic_year_start_month,9),
    'archive_after_days',coalesce(s.archive_after_days,30),
    'updated_at',s.updated_at,
    'can_manage',coalesce(qarar_iam.has_permission('meetings.manage',null),false));
end;
$$;

create function qarar_meetings.save_meeting_settings_v2(p_academic_year_start_month integer,p_archive_after_days integer,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare v_org uuid:=qarar_iam.current_organization_id();s qarar_meetings.meeting_settings%rowtype;r record;v_month_changed boolean;
begin
  perform qarar_iam.assert_permission('meetings.manage',null);
  if p_academic_year_start_month is null or p_academic_year_start_month not between 1 and 12 then
    raise exception using errcode='22023',message='اختر شهر بداية العام الجامعي.';
  end if;
  if p_archive_after_days is null or p_archive_after_days not between 1 and 365 then
    raise exception using errcode='22023',message='مدة الأرشفة يجب أن تكون من 1 إلى 365 يومًا.';
  end if;
  select * into s from qarar_meetings.meeting_settings where organization_id=v_org for update;
  if s.organization_id is not null and s.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='عدّل شخص آخر هذه الإعدادات للتو. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  v_month_changed:=coalesce(s.academic_year_start_month,9)<>p_academic_year_start_month;
  insert into qarar_meetings.meeting_settings(organization_id,academic_year_start_month,archive_after_days,updated_at,updated_by_user_id)
  values(v_org,p_academic_year_start_month,p_archive_after_days,clock_timestamp(),auth.uid())
  on conflict(organization_id) do update set academic_year_start_month=excluded.academic_year_start_month,
    archive_after_days=excluded.archive_after_days,updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id;
  if v_month_changed then
    -- Sessions still ahead move into the academic year the new start month gives them.
    perform set_config('qarar.meeting_sequence_refresh','on',true);
    update qarar_meetings.meetings set academic_year_start=qarar_meetings.academic_year_start_v2(organization_id,scheduled_date)
    where organization_id=v_org and status in('draft','scheduled','ready_to_start');
    perform set_config('qarar.meeting_sequence_refresh','',true);
    for r in select distinct governance_unit_id,academic_year_start from qarar_meetings.meetings
      where organization_id=v_org and status in('draft','scheduled','ready_to_start') and governance_unit_id is not null
    loop perform qarar_meetings.refresh_council_session_numbers_v2(v_org,r.governance_unit_id,r.academic_year_start); end loop;
  end if;
  perform qarar_audit.append_audit_log(v_org,'meetings.settings.saved','meeting_settings',v_org,jsonb_build_object(
    'academic_year_start_month',p_academic_year_start_month,'archive_after_days',p_archive_after_days));
  return qarar_meetings.get_meeting_settings_v2();
end;
$$;

-- 11. Daily housekeeping: archive closed sessions whose time has come, and keep
-- the names of sessions ahead current (a renamed council, a new academic year).
create function qarar_meetings.run_meeting_housekeeping_v2()
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare r record;v_archived integer:=0;v_renamed integer:=0;
begin
  for r in
    select m.id,m.organization_id,coalesce(s.archive_after_days,30) as days
    from qarar_meetings.meetings m
    left join qarar_meetings.meeting_settings s on s.organization_id=m.organization_id
    where m.status='closed'
      and coalesce((select max(h.changed_at) from qarar_meetings.meeting_status_history h
                    where h.meeting_id=m.id and h.organization_id=m.organization_id and h.to_status='closed'),m.updated_at)
          <= clock_timestamp()-make_interval(days=>coalesce(s.archive_after_days,30))
    for update of m skip locked
  loop
    update qarar_meetings.meetings set status='archived' where id=r.id;
    insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
    values(r.organization_id,r.id,'closed','archived',null,'أرشفة تلقائية بعد '||r.days||' يومًا من اعتماد المحضر');
    perform qarar_audit.append_audit_log(r.organization_id,'meetings.archived.automatic','meetings',r.id,jsonb_build_object('archive_after_days',r.days));
    v_archived:=v_archived+1;
  end loop;
  perform set_config('qarar.meeting_sequence_refresh','on',true);
  update qarar_meetings.meetings set academic_year_start=qarar_meetings.academic_year_start_v2(organization_id,scheduled_date)
  where status in('draft','scheduled','ready_to_start')
    and academic_year_start is distinct from qarar_meetings.academic_year_start_v2(organization_id,scheduled_date);
  perform set_config('qarar.meeting_sequence_refresh','',true);
  for r in select distinct organization_id,governance_unit_id,academic_year_start from qarar_meetings.meetings
    where status in('draft','scheduled','ready_to_start') and governance_unit_id is not null
  loop v_renamed:=v_renamed+qarar_meetings.refresh_council_session_numbers_v2(r.organization_id,r.governance_unit_id,r.academic_year_start); end loop;
  return jsonb_build_object('archived_count',v_archived,'renamed_count',v_renamed);
end;
$$;

-- 12. A topic in an archived session is as settled as one in a closed session.
do $$
declare v_def text;v_new text;
begin
  v_def:=pg_get_functiondef('qarar_governance.open_topic_correction'::regproc);
  v_new:=replace(v_def,'m.status not in(''closed'',''cancelled'')','m.status not in(''closed'',''archived'',''cancelled'')');
  if v_new=v_def then raise exception 'open_topic_correction closed-meeting check not found'; end if;
  execute v_new;
  v_def:=pg_get_functiondef('qarar_governance.return_topic_to_previous_council'::regproc);
  v_new:=replace(v_def,'m.status not in (''closed'',''cancelled'')','m.status not in (''closed'',''archived'',''cancelled'')');
  if v_new=v_def then raise exception 'return_topic_to_previous_council closed-meeting check not found'; end if;
  execute v_new;
end;
$$;

-- 13. The meetings list carries the session number and its academic year.
do $$
declare v_def text;v_new text;
begin
  v_def:=pg_get_functiondef('qarar_meetings.search_meetings'::regproc);
  -- Only the select list ends the line with this column; the date filter does not.
  if (length(v_def)-length(replace(v_def,E'meeting.planned_window_start,\n','')))/length(E'meeting.planned_window_start,\n')<>1 then
    raise exception 'search_meetings column list not found exactly once';
  end if;
  v_new:=replace(v_def,E'meeting.planned_window_start,\n',E'meeting.planned_window_start, meeting.session_sequence_no, meeting.academic_year_start, meeting.title_is_custom,\n');
  execute v_new;
end;
$$;

-- 13b. The council details show the plan's quorum.
do $$
declare v_def text;v_new text;
begin
  v_def:=pg_get_functiondef('qarar_core.admin_get_council_detail_v2(uuid)'::regprocedure);
  v_new:=replace(v_def,'''monthly_week'',p.monthly_week','''monthly_week'',p.monthly_week,''quorum_percentage'',p.quorum_percentage');
  if v_new=v_def or (length(v_new)-length(v_def))<>length(',''quorum_percentage'',p.quorum_percentage') then
    raise exception 'admin_get_council_detail_v2 plan fields not found exactly once';
  end if;
  execute v_new;
end;
$$;

-- 14. Backfill: plan meetings still carrying the copied council name get the
-- generated name; every council meeting gets its year and number.
update qarar_meetings.meetings m set title_is_custom=false
from qarar_core.governance_units u
where u.id=m.governance_unit_id and u.organization_id=m.organization_id
  and m.source_plan_id is not null and m.title_ar='اجتماع '||u.name_ar;

alter table qarar_meetings.meetings disable trigger council_window_confirmation;
alter table qarar_meetings.meetings disable trigger number_council_sessions;
update qarar_meetings.meetings set academic_year_start=qarar_meetings.academic_year_start_v2(organization_id,scheduled_date)
where scheduled_date is not null;
do $$
declare r record;
begin
  for r in select distinct organization_id,governance_unit_id,academic_year_start from qarar_meetings.meetings
    where governance_unit_id is not null and academic_year_start is not null
  loop perform qarar_meetings.refresh_council_session_numbers_v2(r.organization_id,r.governance_unit_id,r.academic_year_start); end loop;
end;
$$;
alter table qarar_meetings.meetings enable trigger number_council_sessions;
alter table qarar_meetings.meetings enable trigger council_window_confirmation;

-- 15. Ownership, grants, API wrappers and registries.
create function api_v2.get_meeting_settings_v2() returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.get_meeting_settings_v2()$$;
create function api_v2.save_meeting_settings_v2(p_academic_year_start_month integer,p_archive_after_days integer,p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.save_meeting_settings_v2($1,$2,$3)$$;

alter function qarar_meetings.arabic_session_ordinal_v2(integer) owner to qarar_meetings_executor;
alter function qarar_meetings.council_session_title_v2(text,integer,date) owner to qarar_meetings_executor;
alter function qarar_meetings.academic_year_start_v2(uuid,date) owner to qarar_meetings_executor;
alter function qarar_meetings.refresh_council_session_numbers_v2(uuid,uuid,date) owner to qarar_meetings_executor;
alter function qarar_meetings.number_council_sessions_on_change_v2() owner to qarar_meetings_executor;
alter function qarar_meetings.plan_quorum_from_json_v2(jsonb) owner to qarar_meetings_executor;
alter function qarar_meetings.get_meeting_settings_v2() owner to qarar_meetings_executor;
alter function qarar_meetings.save_meeting_settings_v2(integer,integer,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.run_meeting_housekeeping_v2() owner to qarar_meetings_executor;
alter function api_v2.get_meeting_settings_v2() owner to qarar_api_executor;
alter function api_v2.save_meeting_settings_v2(integer,integer,timestamptz) owner to qarar_api_executor;

revoke all on function qarar_meetings.arabic_session_ordinal_v2(integer),
  qarar_meetings.council_session_title_v2(text,integer,date),
  qarar_meetings.academic_year_start_v2(uuid,date),
  qarar_meetings.refresh_council_session_numbers_v2(uuid,uuid,date),
  qarar_meetings.number_council_sessions_on_change_v2(),
  qarar_meetings.plan_quorum_from_json_v2(jsonb),
  qarar_meetings.get_meeting_settings_v2(),
  qarar_meetings.save_meeting_settings_v2(integer,integer,timestamptz),
  qarar_meetings.run_meeting_housekeeping_v2()
from public,anon,authenticated,service_role;
revoke all on function api_v2.get_meeting_settings_v2(),api_v2.save_meeting_settings_v2(integer,integer,timestamptz) from public,anon,service_role;
grant execute on function qarar_meetings.plan_quorum_from_json_v2(jsonb) to qarar_core_executor;
grant execute on function qarar_meetings.get_meeting_settings_v2(),qarar_meetings.save_meeting_settings_v2(integer,integer,timestamptz) to qarar_api_executor;
grant execute on function api_v2.get_meeting_settings_v2(),api_v2.save_meeting_settings_v2(integer,integer,timestamptz) to authenticated;
insert into qarar_architecture.module_function_execute_allowlist(source_module,target_schema,function_name,identity_arguments,rationale)
values('core','qarar_meetings','plan_quorum_from_json_v2','p_plan jsonb','A council created with its plan validates the plan quorum the same way the plan does')
on conflict do nothing;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),
  'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.arabic_session_ordinal_v2(integer)'::regprocedure,
  'qarar_meetings.council_session_title_v2(text,integer,date)'::regprocedure,
  'qarar_meetings.academic_year_start_v2(uuid,date)'::regprocedure,
  'qarar_meetings.refresh_council_session_numbers_v2(uuid,uuid,date)'::regprocedure,
  'qarar_meetings.number_council_sessions_on_change_v2()'::regprocedure,
  'qarar_meetings.plan_quorum_from_json_v2(jsonb)'::regprocedure,
  'qarar_meetings.get_meeting_settings_v2()'::regprocedure,
  'qarar_meetings.save_meeting_settings_v2(integer,integer,timestamptz)'::regprocedure,
  'qarar_meetings.run_meeting_housekeeping_v2()'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
('v2','get_meeting_settings_v2','qarar_meetings','get_meeting_settings_v2','','meetings','authenticated'),
('v2','save_meeting_settings_v2','qarar_meetings','save_meeting_settings_v2',
  'p_academic_year_start_month integer, p_archive_after_days integer, p_expected_updated_at timestamp with time zone','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='qarar-meeting-housekeeping';
    perform cron.schedule('qarar-meeting-housekeeping','40 0 * * *','select qarar_meetings.run_meeting_housekeeping_v2()');
  end if;
end;
$$;

notify pgrst,'reload schema';
commit;
