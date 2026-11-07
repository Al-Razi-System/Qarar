-- Enforce the agreed periodic-meeting mechanism where it was left open, and let
-- the meetings list filter and count by stage on the server.
--  * Before its cycle opens a plan meeting is for viewing only: no date, time or
--    place, no scheduling, no agenda items and no invitations.
--  * An inactive council may prepare its agenda but may not open the session.
--  * A cancelled meeting is reactivated only with a stated reason, and never once
--    a later cycle has begun or the plan that made it was replaced.
-- Impact map: docs/engineering/impact/MEETING_CYCLE_GATES_20261106_AR.md
begin;

-- 1. Helpers: the organisation's today, and a date in Arabic words.
create function qarar_meetings.organization_today_v2(p_organization_id uuid)
returns date language sql stable security definer set search_path=pg_catalog
as $$
  select (clock_timestamp() at time zone coalesce(
    (select nullif(o.timezone,'') from qarar_core.organizations o where o.id=p_organization_id),'Asia/Aden'))::date
$$;

create function qarar_meetings.arabic_date_v2(p_date date)
returns text language sql immutable security definer set search_path=pg_catalog
as $$
  select case when p_date is null then null else
    extract(day from p_date)::integer||' '||(array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'])[extract(month from p_date)::integer]
    ||' '||extract(year from p_date)::integer end
$$;

-- The one sentence every refusal before the cycle uses.
create function qarar_meetings.cycle_not_open_message_v2(p_window_start date)
returns text language sql immutable security definer set search_path=pg_catalog
as $$ select 'لم تبدأ فترة إعداد هذا الاجتماع بعد؛ تبدأ دورته في '||qarar_meetings.arabic_date_v2(p_window_start)||'.' $$;

-- 2. Lifecycle: no scheduling before the cycle; no session for an inactive council.
create or replace function qarar_meetings.guard_meeting_status_transitions()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_today date;
  v_council_status text;
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

-- 3. Date, time and place stay as planned until the cycle opens.
create or replace function qarar_meetings.guard_council_window_confirmation_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
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

-- 4. No agenda item and no invitation before the cycle opens, whatever the path.
create function qarar_meetings.guard_meeting_cycle_open_v2()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_meeting_id uuid;v_window date;v_org uuid;v_status text;
begin
  if tg_table_name='notification_outbox' then
    if new.aggregate_type<>'meeting' or new.event_type<>'meeting.invitation.requested' then return new; end if;
    v_meeting_id:=new.aggregate_id;
  else
    v_meeting_id:=new.meeting_id;
  end if;
  select planned_window_start,organization_id,status into v_window,v_org,v_status
  from qarar_meetings.meetings where id=v_meeting_id;
  if v_window is not null and v_status in('draft','scheduled','ready_to_start')
     and qarar_meetings.organization_today_v2(v_org)<v_window then
    raise exception using errcode='55000',message=qarar_meetings.cycle_not_open_message_v2(v_window);
  end if;
  return new;
end $$;

create trigger agenda_items_wait_for_cycle before insert on qarar_meetings.agenda_items
for each row execute function qarar_meetings.guard_meeting_cycle_open_v2();
create trigger meeting_invitations_wait_for_cycle before insert on qarar_governance.notification_outbox
for each row execute function qarar_meetings.guard_meeting_cycle_open_v2();

-- 5. Repair: meetings scheduled before their cycle opened go back to draft,
-- unless their invitations already went out (those stay, and are reported).
do $$
declare r record;v_kept integer;
begin
  for r in
    select m.id,m.organization_id from qarar_meetings.meetings m
    where m.status='scheduled' and m.planned_window_start is not null
      and qarar_meetings.organization_today_v2(m.organization_id)<m.planned_window_start
      and not exists(select 1 from qarar_governance.notification_outbox o
        where o.aggregate_type='meeting' and o.aggregate_id=m.id and o.event_type='meeting.invitation.requested')
  loop
    update qarar_meetings.meetings set status='draft' where id=r.id;
    insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason)
    values(r.organization_id,r.id,'scheduled','draft',null,'أُعيد إلى مسودة لأنه جُدول قبل بدء دورته');
    perform qarar_audit.append_audit_log(r.organization_id,'meeting.cycle.unscheduled_early','meetings',r.id,jsonb_build_object('reason','scheduled before its cycle opened'));
  end loop;
  select count(*) into v_kept from qarar_meetings.meetings m
  where m.status in('scheduled','ready_to_start') and m.planned_window_start is not null
    and qarar_meetings.organization_today_v2(m.organization_id)<m.planned_window_start;
  if v_kept>0 then
    raise notice 'Meetings still scheduled before their cycle because invitations were already sent: %',v_kept;
  end if;
end;
$$;

-- 6. Reactivation takes a reason and respects the cycles that came after.
create function qarar_meetings.reactivate_cancelled_meeting_v2(
  p_meeting_id uuid,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare m qarar_meetings.meetings%rowtype;v_target text;v_actor uuid:=auth.uid();v_reason text:=btrim(coalesce(p_reason,''));
  v_today date;v_next date;v_replaced boolean;
begin
  select * into m from qarar_meetings.meetings
  where id=p_meeting_id and organization_id=qarar_iam.current_organization_id() for update;
  if m.id is null then raise exception using errcode='P0002',message='الاجتماع غير موجود.'; end if;
  perform qarar_iam.assert_permission('meetings.manage',m.governance_unit_id);
  if m.status<>'cancelled' then
    raise exception using errcode='23514',message='لا يمكن إعادة تفعيل اجتماع غير ملغى.';
  end if;
  if p_expected_updated_at is null or m.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='عدّل شخص آخر هذا الاجتماع للتو. حدّث الصفحة ثم أعد المحاولة.';
  end if;
  if char_length(v_reason) not between 5 and 1000 then
    raise exception using errcode='22023',message='اكتب سبب إعادة تفعيل الاجتماع (5 أحرف على الأقل).';
  end if;
  select exists(select 1 from qarar_meetings.meeting_status_history h where h.meeting_id=m.id and h.to_status='cancelled'
    and h.change_reason='replaced by edited council meeting plan') into v_replaced;
  if v_replaced then
    raise exception using errcode='55000',message='أُلغي هذا الاجتماع لأن خطة المجلس عُدّلت، ولدورته اجتماع جديد في الخطة؛ لا يمكن إعادة تفعيله.';
  end if;
  v_today:=qarar_meetings.organization_today_v2(m.organization_id);
  if m.source_plan_id is not null then
    select min(coalesce(x.planned_window_start,x.planned_date)) into v_next from qarar_meetings.meetings x
    where x.source_plan_id=m.source_plan_id and x.planned_date>m.planned_date;
    if v_next is not null and v_next<=v_today then
      raise exception using errcode='55000',message='بدأت الدورة التالية لهذا المجلس في '||qarar_meetings.arabic_date_v2(v_next)||'؛ لا يمكن إعادة تفعيل اجتماع دورة سابقة.';
    end if;
  end if;
  v_target:=case when m.schedule_date_confirmed and m.scheduled_date is not null
    and m.start_time is not null and m.end_time is not null
    and (m.planned_window_start is null or m.planned_window_start<=v_today) then 'scheduled' else 'draft' end;
  update qarar_meetings.meetings set status=v_target,updated_at=clock_timestamp() where id=m.id;
  insert into qarar_meetings.meeting_status_history(
    organization_id,meeting_id,from_status,to_status,changed_by_user_id,change_reason
  ) values(m.organization_id,m.id,'cancelled',v_target,v_actor,v_reason);
  perform qarar_audit.append_audit_log(
    m.organization_id,'meeting.cancelled.reactivated','meetings',m.id,
    jsonb_build_object('from_status','cancelled','to_status',v_target,'reason',v_reason,'source_plan_id',m.source_plan_id,'planned_date',m.planned_date)
  );
  return qarar_meetings.get_meeting_detail(m.id);
end;
$$;

-- The two-argument call no longer reactivates without a reason.
create or replace function qarar_meetings.reactivate_cancelled_meeting_v2(
  p_meeting_id uuid,p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
begin
  if qarar_iam.current_organization_id() is null then raise exception using errcode='42501',message='يلزم تسجيل الدخول.'; end if;
  raise exception using errcode='22023',message='اكتب سبب إعادة تفعيل الاجتماع (5 أحرف على الأقل).';
end;
$$;

create function api_v2.reactivate_cancelled_meeting_with_reason_v2(
  p_meeting_id uuid,p_reason text,p_expected_updated_at timestamptz
) returns jsonb language sql security definer set search_path=pg_catalog
as $$select qarar_meetings.reactivate_cancelled_meeting_v2($1,$2,$3)$$;

-- 7. The meetings list, filtered and counted by stage on the server.
create function qarar_meetings.meeting_stage_v2(p_status text,p_scheduled date,p_window_start date,p_window_end date,p_today date)
returns text language sql immutable security definer set search_path=pg_catalog
as $$
  select case
    when p_status in('draft','scheduled','ready_to_start') and p_window_start is not null and p_window_start>p_today then 'future'
    when p_status in('scheduled','ready_to_start') and p_scheduled<p_today then 'missed'
    when p_status='draft' and p_window_end is not null and p_window_end<p_today then 'missed'
    when p_status in('scheduled','ready_to_start') then 'upcoming'
    when p_status='draft' then 'drafts'
    when p_status='in_progress' then 'live'
    when p_status in('waiting_for_minutes','waiting_for_approval') then 'completion'
    when p_status='closed' then 'completed'
    when p_status='archived' then 'archived'
    when p_status='not_held' then 'not_held'
    when p_status in('cancelled','postponed') then 'cancelled'
  end
$$;

create function qarar_meetings.search_meetings_v2(
  p_query text,p_stage text,p_unit_id uuid,p_from_date date,p_to_date date,p_limit integer,p_offset integer
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_org uuid:=qarar_iam.current_organization_id();
  v_actor uuid:=auth.uid();
  v_admin boolean:=coalesce(qarar_iam.is_system_admin(),false);
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_today date;
  v_query text:=nullif(btrim(coalesce(p_query,'')),'');
begin
  if v_org is null then raise exception using errcode='42501',message='يلزم تسجيل الدخول.'; end if;
  if p_stage is not null and p_stage not in('future','missed','upcoming','drafts','live','completion','completed','archived','not_held','cancelled') then
    raise exception using errcode='22023',message='حالة الاجتماعات المطلوبة غير معروفة.';
  end if;
  v_today:=qarar_meetings.organization_today_v2(v_org);
  return (
    with authorized_units as materialized(
      select access.governance_unit_id from qarar_iam.current_meeting_access_units() access
    ),scoped as materialized(
      select meeting.id,meeting.meeting_no,meeting.title_ar,meeting.title_en,meeting.scheduled_date,
        meeting.planned_window_start,meeting.planned_window_end,meeting.schedule_date_confirmed,
        meeting.session_sequence_no,meeting.academic_year_start,meeting.title_is_custom,meeting.schedule_exception_reason,
        meeting.start_time,meeting.end_time,meeting.location_type,meeting.location_details,meeting.status,meeting.updated_at,meeting.created_at,
        unit.id governance_unit_id,unit.name_ar governance_unit_name_ar,unit.name_ar unit_name_ar,unit.status council_status,
        meeting_type.id meeting_type_id,meeting_type.name_ar meeting_type_name_ar,
        (select count(*)::integer from qarar_meetings.agenda_items ai where ai.meeting_id=meeting.id and ai.organization_id=v_org) agenda_item_count,
        qarar_meetings.meeting_stage_v2(meeting.status,meeting.scheduled_date,meeting.planned_window_start,meeting.planned_window_end,v_today) stage
      from qarar_meetings.meetings meeting
      join qarar_core.governance_units unit on unit.id=meeting.governance_unit_id and unit.organization_id=meeting.organization_id
      left join qarar_meetings.meeting_types meeting_type on meeting_type.id=meeting.meeting_type_id
      where meeting.organization_id=v_org
        and (v_admin or meeting.created_by_user_id=v_actor or exists(
          select 1 from authorized_units access where access.governance_unit_id is null
            or access.governance_unit_id=meeting.governance_unit_id))
        and (p_unit_id is null or meeting.governance_unit_id=p_unit_id)
        and (p_from_date is null or coalesce(meeting.planned_window_end,meeting.scheduled_date)>=p_from_date)
        and (p_to_date is null or coalesce(meeting.planned_window_start,meeting.scheduled_date)<=p_to_date)
        and (v_query is null or meeting.meeting_no ilike '%'||v_query||'%' or meeting.title_ar ilike '%'||v_query||'%'
          or unit.name_ar ilike '%'||v_query||'%')
    ),filtered as(
      -- «All» is the working list; sessions ahead of their cycle have their own tab.
      select * from scoped where (p_stage is null and stage is distinct from 'future') or stage=p_stage
    ),paged as(
      select * from filtered order by
        case stage when 'live' then 0 when 'missed' then 1 when 'upcoming' then 2 when 'drafts' then 3
          when 'future' then 4 when 'completion' then 5 else 6 end,
        case when stage in('missed','upcoming','drafts','future') then coalesce(planned_window_start,scheduled_date) end asc nulls last,
        coalesce(scheduled_date,planned_window_start) desc,created_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(item) - 'council_status' || jsonb_build_object('council_active',item.council_status='active')) from paged item),'[]'::jsonb),
      'total',(select count(*) from filtered),
      'counts',(select coalesce(jsonb_object_agg(stage,n),'{}'::jsonb) from (select stage,count(*) n from scoped where stage is not null group by stage) c),
      -- Every council the user can see a meeting of, whatever the filters, so the
      -- council choice does not shrink to the council already chosen.
      'councils',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name_ar',u.name_ar) order by u.name_ar),'[]'::jsonb)
        from qarar_core.governance_units u where u.organization_id=v_org and exists(
          select 1 from qarar_meetings.meetings mm where mm.governance_unit_id=u.id and mm.organization_id=v_org
            and (v_admin or mm.created_by_user_id=v_actor or exists(select 1 from authorized_units access
              where access.governance_unit_id is null or access.governance_unit_id=mm.governance_unit_id)))),
      'limit',v_limit,'offset',v_offset,'today',v_today)
  );
end $$;

create function api_v2.search_meetings_v2(
  p_query text,p_stage text,p_unit_id uuid,p_from_date date,p_to_date date,p_limit integer,p_offset integer
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $$select qarar_meetings.search_meetings_v2($1,$2,$3,$4,$5,$6,$7)$$;

-- 8. The meeting details say the same sentence, with the date in Arabic.
do $$
declare v_def text;v_new text;v_old text:='to_jsonb(''تبدأ دورة هذا الاجتماع في ''||v_window_start::text||''.''::text)';
begin
  v_def:=pg_get_functiondef('qarar_meetings.get_meeting_detail(uuid)'::regprocedure);
  if (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old)<>1 then
    raise exception 'get_meeting_detail cycle sentence not found exactly once';
  end if;
  v_new:=replace(v_def,v_old,'to_jsonb(qarar_meetings.cycle_not_open_message_v2(v_window_start))');
  execute v_new;
end;
$$;

-- 9. Ownership, grants and registries.
alter function qarar_meetings.organization_today_v2(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.arabic_date_v2(date) owner to qarar_meetings_executor;
alter function qarar_meetings.cycle_not_open_message_v2(date) owner to qarar_meetings_executor;
alter function qarar_meetings.guard_meeting_cycle_open_v2() owner to qarar_meetings_executor;
alter function qarar_meetings.reactivate_cancelled_meeting_v2(uuid,text,timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.meeting_stage_v2(text,date,date,date,date) owner to qarar_meetings_executor;
alter function qarar_meetings.search_meetings_v2(text,text,uuid,date,date,integer,integer) owner to qarar_meetings_executor;
alter function api_v2.reactivate_cancelled_meeting_with_reason_v2(uuid,text,timestamptz) owner to qarar_api_executor;
alter function api_v2.search_meetings_v2(text,text,uuid,date,date,integer,integer) owner to qarar_api_executor;

revoke all on function qarar_meetings.organization_today_v2(uuid),qarar_meetings.arabic_date_v2(date),
  qarar_meetings.cycle_not_open_message_v2(date),qarar_meetings.guard_meeting_cycle_open_v2(),
  qarar_meetings.reactivate_cancelled_meeting_v2(uuid,text,timestamptz),qarar_meetings.meeting_stage_v2(text,date,date,date,date),
  qarar_meetings.search_meetings_v2(text,text,uuid,date,date,integer,integer)
from public,anon,authenticated,service_role;
revoke all on function api_v2.reactivate_cancelled_meeting_with_reason_v2(uuid,text,timestamptz),
  api_v2.search_meetings_v2(text,text,uuid,date,date,integer,integer) from public,anon,service_role;
grant execute on function qarar_meetings.reactivate_cancelled_meeting_v2(uuid,text,timestamptz),
  qarar_meetings.search_meetings_v2(text,text,uuid,date,date,integer,integer) to qarar_api_executor;
grant execute on function api_v2.reactivate_cancelled_meeting_with_reason_v2(uuid,text,timestamptz),
  api_v2.search_meetings_v2(text,text,uuid,date,date,integer,integer) to authenticated;


insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in(
  'qarar_meetings.organization_today_v2(uuid)'::regprocedure,
  'qarar_meetings.arabic_date_v2(date)'::regprocedure,
  'qarar_meetings.cycle_not_open_message_v2(date)'::regprocedure,
  'qarar_meetings.guard_meeting_cycle_open_v2()'::regprocedure,
  'qarar_meetings.reactivate_cancelled_meeting_v2(uuid,text,timestamptz)'::regprocedure,
  'qarar_meetings.meeting_stage_v2(text,date,date,date,date)'::regprocedure,
  'qarar_meetings.search_meetings_v2(text,text,uuid,date,date,integer,integer)'::regprocedure)
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,
  module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
('v2','reactivate_cancelled_meeting_with_reason_v2','qarar_meetings','reactivate_cancelled_meeting_v2',
  'p_meeting_id uuid, p_reason text, p_expected_updated_at timestamp with time zone','meetings','authenticated'),
('v2','search_meetings_v2','qarar_meetings','search_meetings_v2',
  'p_query text, p_stage text, p_unit_id uuid, p_from_date date, p_to_date date, p_limit integer, p_offset integer','meetings','authenticated')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,
  implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience;

notify pgrst,'reload schema';
commit;
