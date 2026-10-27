-- Notify the original invitees when a sent meeting invitation materially changes.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;

alter table qarar_governance.notification_template_settings
  drop constraint notification_template_settings_template_code_check;
alter table qarar_governance.notification_template_settings
  add constraint notification_template_settings_template_code_check
  check (template_code in (
    'meeting_invitation','meeting_reminder','meeting_cycle_due_soon','meeting_cycle_overdue',
    'meeting_postponed','meeting_cancelled','meeting_invitation_updated',
    'task_created_assignee','task_created_follower','task_due_soon','task_overdue',
    'task_submitted','task_returned','task_completed'
  ));

grant select on qarar_governance.notification_outbox to qarar_meetings_executor;

create function qarar_meetings.enqueue_invitee_change_notifications(
  p_meeting_id uuid,
  p_organization_id uuid,
  p_event_type text,
  p_change_key text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  r record;
  v_count integer := 0;
begin
  if p_event_type not in ('meeting.postponed','meeting.cancelled','meeting.invitation.updated') then
    raise exception using errcode = '22023', message = 'unsupported meeting notification event';
  end if;
  for r in
    select distinct payload->>'recipient_user_id' recipient_user_id
    from qarar_governance.notification_outbox
    where organization_id = p_organization_id
      and aggregate_type = 'meeting'
      and aggregate_id = p_meeting_id
      and event_type = 'meeting.invitation.requested'
      and nullif(payload->>'recipient_user_id','') is not null
  loop
    insert into qarar_governance.notification_outbox(
      organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key
    ) values (
      p_organization_id,'meeting',p_meeting_id,p_event_type,
      jsonb_build_object('meeting_id',p_meeting_id,'recipient_user_id',r.recipient_user_id,'recipient_role','member'),
      p_event_type||':'||p_meeting_id||':'||r.recipient_user_id||':'||p_change_key
    ) on conflict(organization_id,deduplication_key) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end
$$;

create function qarar_meetings.enqueue_meeting_record_change_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform qarar_meetings.enqueue_invitee_change_notifications(
      new.id,new.organization_id,'meeting.cancelled',txid_current()::text
    );
  elsif (new.scheduled_date,new.start_time,new.end_time,new.location_type,new.location_details)
        is distinct from
        (old.scheduled_date,old.start_time,old.end_time,old.location_type,old.location_details) then
    perform qarar_meetings.enqueue_invitee_change_notifications(
      new.id,new.organization_id,'meeting.postponed',txid_current()::text
    );
  end if;
  return new;
end
$$;

create function qarar_meetings.enqueue_agenda_change_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_meeting_id uuid := coalesce(new.meeting_id,old.meeting_id);
  v_organization_id uuid := coalesce(new.organization_id,old.organization_id);
begin
  if tg_op = 'UPDATE'
     and (new.meeting_id,new.topic_id,new.agenda_order)
         is not distinct from (old.meeting_id,old.topic_id,old.agenda_order) then
    return coalesce(new,old);
  end if;
  perform qarar_meetings.enqueue_invitee_change_notifications(
    v_meeting_id,v_organization_id,'meeting.invitation.updated',txid_current()::text
  );
  return coalesce(new,old);
end
$$;

create trigger meeting_record_change_notification_events
after update of status,scheduled_date,start_time,end_time,location_type,location_details
on qarar_meetings.meetings
for each row execute function qarar_meetings.enqueue_meeting_record_change_notifications();

create trigger meeting_agenda_change_notification_events
after insert or delete or update of meeting_id,topic_id,agenda_order
on qarar_meetings.agenda_items
for each row execute function qarar_meetings.enqueue_agenda_change_notifications();

alter function qarar_meetings.enqueue_invitee_change_notifications(uuid,uuid,text,text) owner to qarar_meetings_executor;
alter function qarar_meetings.enqueue_meeting_record_change_notifications() owner to qarar_meetings_executor;
alter function qarar_meetings.enqueue_agenda_change_notifications() owner to qarar_meetings_executor;
revoke all on function qarar_meetings.enqueue_invitee_change_notifications(uuid,uuid,text,text),
  qarar_meetings.enqueue_meeting_record_change_notifications(),
  qarar_meetings.enqueue_agenda_change_notifications()
from public,anon,authenticated,service_role;

insert into qarar_architecture.function_registry(
  function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate
)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'meetings','qarar_meetings',false
from pg_proc p
where p.oid in (
  'qarar_meetings.enqueue_invitee_change_notifications(uuid,uuid,text,text)'::regprocedure,
  'qarar_meetings.enqueue_meeting_record_change_notifications()'::regprocedure,
  'qarar_meetings.enqueue_agenda_change_notifications()'::regprocedure
);

create or replace function qarar_governance.claim_whatsapp_notification_outbox(
  p_worker_id uuid,p_lock_token uuid,p_limit integer default 25,p_lease_seconds integer default 60
) returns table(
  id uuid,organization_id uuid,aggregate_type text,aggregate_id uuid,event_type text,
  payload jsonb,deduplication_key text,attempts integer,lock_token uuid,lease_expires_at timestamptz
) language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare v_now timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
  if p_worker_id is null or p_lock_token is null then raise exception using errcode='22023',message='worker id and lock token are required';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='claim limit must be between 1 and 100';end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then raise exception using errcode='22023',message='lease duration must be between 30 and 3600 seconds';end if;
  perform qarar_governance.recover_stale_notification_outbox();
  return query
  with candidates as (
    select o.id from qarar_governance.notification_outbox o
    where o.status in('pending','failed') and o.attempts<8 and o.available_at<=v_now
      and o.event_type in(
        'meeting.invitation.requested','meeting.reminder.due','meeting.cycle.due_soon','meeting.cycle.overdue',
        'meeting.postponed','meeting.cancelled','meeting.invitation.updated',
        'execution.task.created','execution.task.due_soon','execution.task.overdue',
        'execution.task.submitted','execution.task.returned','execution.task.completed'
      )
    order by o.available_at,o.created_at,o.id for update skip locked limit p_limit
  ),claimed as (
    update qarar_governance.notification_outbox o set
      status='processing',attempts=o.attempts+1,locked_at=v_now,locked_by_worker_id=p_worker_id,
      lock_token=p_lock_token,lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),last_attempt_at=v_now
    from candidates where o.id=candidates.id returning o.*
  )
  select c.id,c.organization_id,c.aggregate_type,c.aggregate_id,c.event_type,c.payload,
         c.deduplication_key,c.attempts,c.lock_token,c.lease_expires_at
  from claimed c order by c.available_at,c.created_at,c.id;
end
$$;

create or replace function qarar_governance.get_notification_dispatch_context(
  p_event_id uuid,p_lock_token uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare c jsonb;code text;s qarar_governance.notification_settings%rowtype;t qarar_governance.notification_template_settings%rowtype;
begin
  c:=qarar_governance.get_notification_dispatch_context_base(p_event_id,p_lock_token);
  code:=case c->>'event_type'
    when 'meeting.invitation.requested' then 'meeting_invitation'
    when 'meeting.reminder.due' then 'meeting_reminder'
    when 'meeting.cycle.due_soon' then 'meeting_cycle_due_soon'
    when 'meeting.cycle.overdue' then 'meeting_cycle_overdue'
    when 'meeting.postponed' then 'meeting_postponed'
    when 'meeting.cancelled' then 'meeting_cancelled'
    when 'meeting.invitation.updated' then 'meeting_invitation_updated'
    when 'execution.task.due_soon' then 'task_due_soon'
    when 'execution.task.overdue' then 'task_overdue'
    when 'execution.task.submitted' then 'task_submitted'
    when 'execution.task.returned' then 'task_returned'
    when 'execution.task.completed' then 'task_completed'
    when 'execution.task.created' then case when c#>>'{payload,recipient_role}'='follower' then 'task_created_follower' else 'task_created_assignee' end
  end;
  select * into s from qarar_governance.notification_settings where organization_id=(c->>'organization_id')::uuid;
  select * into t from qarar_governance.notification_template_settings where organization_id=(c->>'organization_id')::uuid and template_code=code;
  return c||jsonb_build_object('channel_enabled',coalesce(s.whatsapp_enabled,true),'event_enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action);
end
$$;

alter function qarar_governance.admin_get_notification_workspace(integer)
  rename to admin_get_notification_workspace_message_base;
update qarar_architecture.function_registry r
set function_name=p.proname,identity_arguments=pg_get_function_identity_arguments(p.oid)
from pg_proc p where p.oid=r.function_oid and p.proname='admin_get_notification_workspace_message_base';

create function qarar_governance.admin_get_notification_workspace(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare o uuid:=qarar_iam.current_organization_id();base jsonb; templates jsonb; added_templates jsonb; deliveries jsonb;
begin
  if not qarar_iam.is_system_admin() then raise exception using errcode='42501',message='هذه الصفحة متاحة لمسؤول النظام فقط';end if;
  base:=qarar_governance.admin_get_notification_workspace_message_base(p_limit);
  select jsonb_agg(jsonb_build_object(
    'code',v.code,'label',v.label,'description',v.description,
    'enabled',coalesce(t.enabled,true),'custom_intro',t.custom_intro,'custom_action',t.custom_action
  ) order by v.ord) into added_templates
  from (values
    (1,'meeting_postponed','تأجيل أو تعديل موعد اجتماع','إبلاغ المدعوين بالموعد المحدّث.'),
    (2,'meeting_cancelled','إلغاء اجتماع','إبلاغ المدعوين بإلغاء الاجتماع.'),
    (3,'meeting_invitation_updated','تحديث دعوة اجتماع','إبلاغ المدعوين بتغيير جدول الأعمال.')
  ) v(ord,code,label,description)
  left join qarar_governance.notification_template_settings t
    on t.organization_id=o and t.template_code=v.code;
  templates:=coalesce(base->'templates','[]'::jsonb)||coalesce(added_templates,'[]'::jsonb);
  select coalesce(jsonb_agg(
    case item->>'template_code'
      when 'meeting_postponed' then jsonb_set(item,'{template_label}','"تأجيل أو تعديل موعد اجتماع"')
      when 'meeting_cancelled' then jsonb_set(item,'{template_label}','"إلغاء اجتماع"')
      when 'meeting_invitation_updated' then jsonb_set(item,'{template_label}','"تحديث دعوة اجتماع"')
      else item end
  ) order by ordinal),'[]'::jsonb) into deliveries
  from jsonb_array_elements(coalesce(base->'deliveries','[]'::jsonb)) with ordinality source(item,ordinal);
  return base||jsonb_build_object('templates',templates,'deliveries',deliveries);
end
$$;

alter function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) owner to qarar_governance_executor;
alter function qarar_governance.get_notification_dispatch_context(uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.admin_get_notification_workspace(integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer),
  qarar_governance.get_notification_dispatch_context(uuid,uuid),
  qarar_governance.admin_get_notification_workspace(integer)
from public,anon,authenticated,service_role;
grant execute on function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer),
  qarar_governance.get_notification_dispatch_context(uuid,uuid),
  qarar_governance.admin_get_notification_workspace(integer)
to qarar_api_executor;

update qarar_architecture.function_registry r
set function_name=p.proname,identity_arguments=pg_get_function_identity_arguments(p.oid)
from pg_proc p where p.oid=r.function_oid and p.oid in(
  'qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure,
  'qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure,
  'qarar_governance.admin_get_notification_workspace(integer)'::regprocedure
);

notify pgrst,'reload schema';
commit;
