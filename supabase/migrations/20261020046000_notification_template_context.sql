-- Enrich delivery variables from authoritative meeting/task records. This also
-- improves historical queued events without rewriting their immutable payload.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create or replace function qarar_governance.get_notification_dispatch_context(p_event_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare
 e qarar_governance.notification_outbox%rowtype;
 u qarar_iam.users%rowtype;
 recipient uuid;
 enriched_payload jsonb;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 select * into e from qarar_governance.notification_outbox where id=p_event_id;
 if e.id is null or e.status<>'processing' or e.lock_token is distinct from p_lock_token or e.lease_expires_at<=clock_timestamp() then
  raise exception using errcode='40001',message='notification event lease is not current';end if;
 recipient:=nullif(e.payload->>'recipient_user_id','')::uuid;
 select * into u from qarar_iam.users where id=recipient and organization_id=e.organization_id and status='active';
 enriched_payload:=e.payload;

 if e.aggregate_type='meeting' then
  select enriched_payload || jsonb_strip_nulls(jsonb_build_object(
    'meeting_no',m.meeting_no,
    'title_ar',m.title_ar,
    'scheduled_date',m.scheduled_date,
    'start_time',m.start_time,
    'end_time',m.end_time,
    'location_type',m.location_type,
    'location_details',m.location_details,
    'planned_window_start',m.planned_window_start,
    'planned_window_end',m.planned_window_end,
    'governance_unit_name_ar',g.name_ar
  )) into enriched_payload
  from qarar_meetings.meetings m
  left join qarar_core.governance_units g on g.id=m.governance_unit_id and g.organization_id=m.organization_id
  where m.id=e.aggregate_id and m.organization_id=e.organization_id;
 elsif e.aggregate_type='action_item' then
  select enriched_payload || jsonb_strip_nulls(jsonb_build_object(
    'action_no',t.action_no,
    'title_ar',t.title_ar,
    'description',t.description,
    'due_date',t.due_date,
    'decision_no',d.decision_no
  )) into enriched_payload
  from qarar_execution.action_items t
  left join qarar_decisions.decisions d on d.id=t.decision_id and d.organization_id=t.organization_id
  where t.id=e.aggregate_id and t.organization_id=e.organization_id;
 end if;

 return jsonb_build_object('event_id',e.id,'organization_id',e.organization_id,'event_type',e.event_type,'payload',coalesce(enriched_payload,e.payload),
  'recipient_user_id',recipient,'recipient_name_ar',u.full_name_ar,'mobile',u.mobile,'recipient_active',u.id is not null);
end $$;

alter function qarar_governance.get_notification_dispatch_context(uuid,uuid) owner to qarar_governance_executor;
revoke all on function qarar_governance.get_notification_dispatch_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.get_notification_dispatch_context(uuid,uuid) to qarar_api_executor;

notify pgrst,'reload schema';
commit;
