-- Restore the tenant channel/template policy layer around the existing enriched
-- notification context. The shared development database had the settings tables
-- but its public resolver had drifted back to the base implementation.
-- Impact map: docs/engineering/impact/NOTIFICATION_DISPATCH_POLICY_CONTEXT_20261026_AR.md
begin;

create or replace function qarar_governance.get_notification_dispatch_context(
  p_event_id uuid,
  p_lock_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  c jsonb;
  code text;
  s qarar_governance.notification_settings%rowtype;
  t qarar_governance.notification_template_settings%rowtype;
begin
  c := qarar_governance.get_notification_dispatch_context_base(p_event_id, p_lock_token);
  code := case c->>'event_type'
    when 'meeting.invitation.requested' then 'meeting_invitation'
    when 'meeting.reminder.due' then 'meeting_reminder'
    when 'meeting.cycle.due_soon' then 'meeting_cycle_due_soon'
    when 'meeting.cycle.overdue' then 'meeting_cycle_overdue'
    when 'execution.task.due_soon' then 'task_due_soon'
    when 'execution.task.overdue' then 'task_overdue'
    when 'execution.task.submitted' then 'task_submitted'
    when 'execution.task.returned' then 'task_returned'
    when 'execution.task.completed' then 'task_completed'
    when 'execution.task.created' then
      case when c#>>'{payload,recipient_role}' = 'follower'
        then 'task_created_follower'
        else 'task_created_assignee'
      end
  end;

  select * into s
  from qarar_governance.notification_settings
  where organization_id = (c->>'organization_id')::uuid;

  select * into t
  from qarar_governance.notification_template_settings
  where organization_id = (c->>'organization_id')::uuid
    and template_code = code;

  return c || jsonb_build_object(
    'channel_enabled', coalesce(s.whatsapp_enabled, true),
    'event_enabled', coalesce(t.enabled, true),
    'custom_intro', t.custom_intro,
    'custom_action', t.custom_action
  );
end
$$;

alter function qarar_governance.get_notification_dispatch_context(uuid, uuid)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_notification_dispatch_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_notification_dispatch_context(uuid, uuid)
  to qarar_api_executor;

update qarar_architecture.function_registry
set function_name = 'get_notification_dispatch_context',
    identity_arguments = 'p_event_id uuid, p_lock_token uuid',
    module_code = 'governance',
    owning_schema = 'qarar_governance',
    is_rls_predicate = false
where function_oid = 'qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure;

notify pgrst, 'reload schema';
commit;
