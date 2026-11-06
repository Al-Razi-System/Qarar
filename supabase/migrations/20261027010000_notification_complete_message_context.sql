-- Complete, tenant-scoped message context for meeting invitations and tasks.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;

grant select on qarar_meetings.meetings, qarar_meetings.agenda_items,
  qarar_topics.topics, qarar_decisions.decisions,
  qarar_execution.action_items, qarar_execution.action_item_events,
  qarar_iam.users, qarar_core.governance_units
to qarar_governance_executor;

create or replace function qarar_governance.get_notification_dispatch_context_base(
  p_event_id uuid,
  p_lock_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  e qarar_governance.notification_outbox%rowtype;
  u qarar_iam.users%rowtype;
  recipient uuid;
  enriched_payload jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;

  select * into e
  from qarar_governance.notification_outbox
  where id = p_event_id;

  if e.id is null or e.status <> 'processing'
     or e.lock_token is distinct from p_lock_token
     or e.lease_expires_at <= clock_timestamp() then
    raise exception using errcode = '40001', message = 'notification event lease is not current';
  end if;

  recipient := nullif(e.payload->>'recipient_user_id', '')::uuid;
  select * into u
  from qarar_iam.users
  where id = recipient
    and organization_id = e.organization_id
    and status = 'active';
  enriched_payload := e.payload;

  if e.aggregate_type = 'meeting' then
    select enriched_payload || jsonb_strip_nulls(jsonb_build_object(
      'meeting_id', m.id,
      'meeting_no', m.meeting_no,
      'title_ar', m.title_ar,
      'scheduled_date', m.scheduled_date,
      'start_time', m.start_time,
      'end_time', m.end_time,
      'location_type', m.location_type,
      'location_details', m.location_details,
      'planned_window_start', m.planned_window_start,
      'planned_window_end', m.planned_window_end,
      'governance_unit_name_ar', g.name_ar,
      'agenda_titles', coalesce((
        select jsonb_agg(t.title_ar order by ai.agenda_order, ai.id)
        from qarar_meetings.agenda_items ai
        join qarar_topics.topics t
          on t.id = ai.topic_id and t.organization_id = ai.organization_id
        where ai.meeting_id = m.id and ai.organization_id = m.organization_id
      ), '[]'::jsonb)
    )) into enriched_payload
    from qarar_meetings.meetings m
    left join qarar_core.governance_units g
      on g.id = m.governance_unit_id and g.organization_id = m.organization_id
    where m.id = e.aggregate_id and m.organization_id = e.organization_id;

  elsif e.aggregate_type = 'action_item' then
    select enriched_payload || jsonb_strip_nulls(jsonb_build_object(
      'action_item_id', t.id,
      'action_no', t.action_no,
      'title_ar', t.title_ar,
      'description', t.description,
      'due_date', t.due_date,
      'remaining_days', case when t.due_date is not null
        then t.due_date - (clock_timestamp() at time zone 'Asia/Riyadh')::date end,
      'requires_evidence', t.requires_evidence,
      'decision_no', d.decision_no,
      'meeting_id', m.id,
      'meeting_no', m.meeting_no,
      'meeting_title_ar', m.title_ar,
      'meeting_date', m.scheduled_date,
      'governance_unit_name_ar', g.name_ar,
      'assigned_user_name_ar', assignee.full_name_ar,
      'assigned_unit_name_ar', assigned_unit.name_ar,
      'follow_up_user_name_ar', follower.full_name_ar,
      'return_reason', returned.note
    )) into enriched_payload
    from qarar_execution.action_items t
    left join qarar_decisions.decisions d
      on d.id = t.decision_id and d.organization_id = t.organization_id
    left join qarar_meetings.meetings m
      on m.id = d.meeting_id and m.organization_id = d.organization_id
    left join qarar_core.governance_units g
      on g.id = d.governance_unit_id and g.organization_id = d.organization_id
    left join qarar_iam.users assignee
      on assignee.id = t.assigned_user_id and assignee.organization_id = t.organization_id
    left join qarar_core.governance_units assigned_unit
      on assigned_unit.id = t.assigned_unit_id and assigned_unit.organization_id = t.organization_id
    left join qarar_iam.users follower
      on follower.id = t.follow_up_user_id and follower.organization_id = t.organization_id
    left join lateral (
      select event.note
      from qarar_execution.action_item_events event
      where event.action_item_id = t.id
        and event.organization_id = t.organization_id
        and event.event_type = 'return'
      order by event.created_at desc, event.id desc
      limit 1
    ) returned on true
    where t.id = e.aggregate_id and t.organization_id = e.organization_id;
  end if;

  return jsonb_build_object(
    'event_id', e.id,
    'organization_id', e.organization_id,
    'event_type', e.event_type,
    'payload', coalesce(enriched_payload, e.payload),
    'recipient_user_id', recipient,
    'recipient_name_ar', u.full_name_ar,
    'mobile', u.mobile,
    'recipient_active', u.id is not null
  );
end
$$;

alter function qarar_governance.get_notification_dispatch_context_base(uuid, uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_notification_dispatch_context_base(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_notification_dispatch_context_base(uuid, uuid)
  to qarar_governance_executor;

update qarar_architecture.function_registry
set function_name = 'get_notification_dispatch_context_base',
    identity_arguments = 'p_event_id uuid, p_lock_token uuid',
    module_code = 'governance',
    owning_schema = 'qarar_governance',
    is_rls_predicate = false
where function_oid = 'qarar_governance.get_notification_dispatch_context_base(uuid,uuid)'::regprocedure;

notify pgrst, 'reload schema';
commit;
