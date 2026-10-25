-- The meeting and task reminder generators have read each organization's
-- reminder days from qarar_governance.notification_settings since
-- 20261021002000, but their owners (qarar_meetings_executor and
-- qarar_execution_executor) were never allowed to read that table, so every
-- run fails with "permission denied for table notification_settings" (DB112,
-- DB115) and no reminder is generated. The governance module now answers with
-- a function, instead of granting a cross-module table read.
-- Impact map: docs/engineering/impact/NOTIFICATION_REMINDER_DAYS_ACCESS_20261024_AR.md
begin;

create function qarar_governance.organization_reminder_days(p_organization_id uuid, p_kind text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case p_kind when 'meeting' then s.meeting_reminder_days when 'task' then s.task_due_soon_days end
    from qarar_governance.notification_settings s
    where s.organization_id = p_organization_id
  ), p_default)
$$;
alter function qarar_governance.organization_reminder_days(uuid, text, integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.organization_reminder_days(uuid, text, integer) from public, anon, authenticated, service_role;
grant usage on schema qarar_governance to qarar_meetings_executor, qarar_execution_executor;
grant execute on function qarar_governance.organization_reminder_days(uuid, text, integer) to qarar_meetings_executor, qarar_execution_executor;

do $$
declare d text;
begin
  select pg_get_functiondef('qarar_meetings.generate_meeting_notification_events(date,integer)'::regprocedure) into d;
  d := replace(d, 'coalesce((select s.meeting_reminder_days from qarar_governance.notification_settings s where s.organization_id=m.organization_id),p_reminder_days)',
                  'qarar_governance.organization_reminder_days(m.organization_id,''meeting'',p_reminder_days)');
  if position('notification_settings' in d) > 0 or position('organization_reminder_days' in d) = 0 then
    raise exception 'meeting reminder generator shape changed';
  end if;
  execute d;

  select pg_get_functiondef('qarar_execution.generate_action_item_notification_events(date,integer)'::regprocedure) into d;
  d := replace(d, 'coalesce((select s.task_due_soon_days from qarar_governance.notification_settings s where s.organization_id=t.organization_id),p_due_soon_days)',
                  'qarar_governance.organization_reminder_days(t.organization_id,''task'',p_due_soon_days)');
  if position('notification_settings' in d) > 0 or position('organization_reminder_days' in d) = 0 then
    raise exception 'task reminder generator shape changed';
  end if;
  execute d;
end $$;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', 'qarar_governance', false
from pg_proc p
where p.oid = 'qarar_governance.organization_reminder_days(uuid,text,integer)'::regprocedure
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('meetings', 'qarar_governance', 'organization_reminder_days', 'p_organization_id uuid, p_kind text, p_default integer', 'Meeting reminders follow the organization''s reminder days'),
  ('execution', 'qarar_governance', 'organization_reminder_days', 'p_organization_id uuid, p_kind text, p_default integer', 'Task due-soon reminders follow the organization''s reminder days')
on conflict do nothing;

commit;
