-- Provider-neutral events for meeting reminders, cycle deadlines, and task transitions.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

grant usage on schema qarar_governance to qarar_meetings_executor;
grant insert on qarar_governance.notification_outbox to qarar_meetings_executor;
grant select(organization_id,deduplication_key) on qarar_governance.notification_outbox to qarar_meetings_executor;

create function qarar_meetings.generate_meeting_notification_events(p_as_of date,p_reminder_days integer)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare r record; v_event text; v_count integer:=0;
begin
  if p_as_of is null or p_reminder_days not between 0 and 30 then
    raise exception using errcode='22023',message='حدد تاريخ تشغيل وفترة تذكير صحيحة';
  end if;

  for r in
    select m.id,m.organization_id,m.title_ar,m.scheduled_date,m.start_time,m.end_time,
      ms.user_id,'member'::text recipient_role
    from qarar_meetings.meetings m
    join qarar_iam.memberships ms on ms.organization_id=m.organization_id
      and ms.governance_unit_id=m.governance_unit_id and ms.membership_status='active'
      and ms.start_date<=m.scheduled_date and (ms.end_date is null or ms.end_date>=m.scheduled_date)
    where m.status in('scheduled','ready_to_start') and m.schedule_date_confirmed
      and m.scheduled_date between p_as_of and p_as_of+p_reminder_days
  loop
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(r.organization_id,'meeting',r.id,'meeting.reminder.due',jsonb_build_object(
      'meeting_id',r.id,'title_ar',r.title_ar,'scheduled_date',r.scheduled_date,'start_time',r.start_time,
      'end_time',r.end_time,'recipient_user_id',r.user_id,'recipient_role',r.recipient_role
    ),'meeting.reminder.due:'||r.id||':'||r.user_id||':'||r.scheduled_date)
    on conflict(organization_id,deduplication_key) do nothing;
    if found then v_count:=v_count+1;end if;
  end loop;

  for r in
    select m.id,m.organization_id,m.title_ar,m.planned_window_start,m.planned_window_end,
      ms.user_id,roles.code recipient_role
    from qarar_meetings.meetings m
    join qarar_iam.memberships ms on ms.organization_id=m.organization_id
      and ms.governance_unit_id=m.governance_unit_id and ms.membership_status='active'
      and ms.start_date<=p_as_of and (ms.end_date is null or ms.end_date>=p_as_of)
    join qarar_iam.roles roles on roles.id=ms.role_id and roles.organization_id=ms.organization_id
      and roles.code in('council_chair','council_rapporteur')
    where m.status='draft' and not m.schedule_date_confirmed and m.planned_window_end is not null
      and m.planned_window_end<=p_as_of+p_reminder_days
  loop
    v_event:=case when r.planned_window_end<p_as_of then 'meeting.cycle.overdue' else 'meeting.cycle.due_soon' end;
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(r.organization_id,'meeting',r.id,v_event,jsonb_build_object(
      'meeting_id',r.id,'title_ar',r.title_ar,'planned_window_start',r.planned_window_start,
      'planned_window_end',r.planned_window_end,'recipient_user_id',r.user_id,'recipient_role',r.recipient_role
    ),v_event||':'||r.id||':'||r.user_id||':'||r.planned_window_end)
    on conflict(organization_id,deduplication_key) do nothing;
    if found then v_count:=v_count+1;end if;
  end loop;
  return v_count;
end $$;

create function qarar_execution.enqueue_action_item_transition_notifications()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record; v_event text;
begin
  if old.status=new.status then return new;end if;
  v_event:=case
    when new.status='submitted' then 'execution.task.submitted'
    when old.status='submitted' and new.status='in_progress' then 'execution.task.returned'
    when new.status='completed' then 'execution.task.completed'
    else null end;
  if v_event is null then return new;end if;

  for r in
    select recipient_user_id,min(recipient_role) recipient_role
    from (
      select new.assigned_user_id recipient_user_id,'assignee'::text recipient_role
      where v_event in('execution.task.returned','execution.task.completed')
      union all
      select new.follow_up_user_id,'follower'::text
      where v_event in('execution.task.submitted','execution.task.completed')
    ) recipients where recipient_user_id is not null group by recipient_user_id
  loop
    insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key)
    values(new.organization_id,'action_item',new.id,v_event,jsonb_build_object(
      'action_item_id',new.id,'action_no',new.action_no,'title_ar',new.title_ar,'due_date',new.due_date,
      'recipient_user_id',r.recipient_user_id,'recipient_role',r.recipient_role
    ),v_event||':'||new.id||':'||r.recipient_user_id||':'||new.updated_at)
    on conflict(organization_id,deduplication_key) do nothing;
  end loop;
  return new;
end $$;

create trigger action_item_transition_notification_events
after update of status on qarar_execution.action_items
for each row execute function qarar_execution.enqueue_action_item_transition_notifications();

alter function qarar_meetings.generate_meeting_notification_events(date,integer) owner to qarar_meetings_executor;
alter function qarar_execution.enqueue_action_item_transition_notifications() owner to qarar_execution_executor;
revoke all on function qarar_meetings.generate_meeting_notification_events(date,integer),qarar_execution.enqueue_action_item_transition_notifications() from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),case when n.nspname='qarar_meetings' then 'meetings' else 'execution' end,n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname,p.proname) in (('qarar_meetings','generate_meeting_notification_events'),('qarar_execution','enqueue_action_item_transition_notifications'))
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('qarar-meeting-notification-events','30 * * * *',
    'select qarar_meetings.generate_meeting_notification_events((clock_timestamp() at time zone ''Asia/Riyadh'')::date,2)');
 end if;
end $$;

commit;
