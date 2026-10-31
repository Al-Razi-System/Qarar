-- Architecture repairs after the notification and topic-journey migrations
-- (2026-10-20..22). They were merged while docker-smoke could not start (the
-- image registry quota), so the database gate never ran on them; it now fails
-- in DB13, DB14, DB17, DB20, DB28, DB36 and DB42.
-- Impact map: docs/engineering/impact/NOTIFICATION_REMINDER_DAYS_ACCESS_20261024_AR.md
begin;

-- 1. Security: the topic journey's implementation kept PostgreSQL's default
--    EXECUTE for PUBLIC, so anonymous and signed-in callers could run it
--    directly and skip api_v1.get_topic_activity_timeline. Only the API
--    contract may call it.
revoke all on function qarar_topics.get_topic_activity_timeline(uuid) from public, anon, authenticated, service_role;
grant execute on function qarar_topics.get_topic_activity_timeline(uuid) to qarar_api_executor;

-- 2. The api_v1 notification service contracts were also entered in the
--    module implementation registry under "governance", while they are owned
--    by qarar_api_executor. They stay in api_contract_registry, where API
--    contracts belong.
delete from qarar_architecture.function_registry
where owning_schema = 'api_v1'
  and function_name in (
    'service_claim_notification_deliveries', 'service_complete_notification_delivery',
    'service_fail_notification_delivery', 'service_get_notification_dispatch_context',
    'service_mark_notification_delivery_ambiguous', 'service_materialize_notification_delivery',
    'service_skip_notification_delivery');

-- 3. The dispatch context reads meetings, tasks and decisions to fill each
--    message (granted in 20261021007000). Declare that dependency.
insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('governance', 'qarar_meetings', 'meetings', 'WhatsApp dispatch context fills a message with its meeting'),
  ('governance', 'qarar_execution', 'action_items', 'WhatsApp dispatch context fills a message with its task'),
  ('governance', 'qarar_decisions', 'decisions', 'WhatsApp dispatch context fills a message with its decision'),
  -- The topic journey and meeting history read the approved minutes and the
  -- topic's audit events (20261022010000); topics already holds both reads.
  ('topics', 'qarar_minutes', 'meeting_minutes', 'Topic journey and meeting history show the approved minutes'),
  ('topics', 'qarar_audit', 'audit_logs', 'Topic journey lists the topic''s audit events')
on conflict do nothing;

-- Meeting search is scoped to the councils the viewer may see (20261021005000).
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('meetings', 'qarar_iam', 'current_meeting_access_units', '', 'Meeting search is scoped to the councils the viewer may see')
on conflict do nothing;

-- 4. Every API contract implementation states its own guard. The workspace
--    delegated it to the delivery-reason function (20261021010000); the same
--    check now also opens the workspace itself.
do $$
declare d text;
begin
  select pg_get_functiondef('qarar_governance.admin_get_notification_workspace(integer)'::regprocedure) into d;
  d := replace(d, E'begin\n  base:=qarar_governance.admin_get_notification_workspace_delivery_reason_base(p_limit);',
    E'begin\n  if not qarar_iam.is_system_admin() then raise exception using errcode=''42501'',message=''هذه الصفحة متاحة لمسؤول النظام فقط'';end if;\n  base:=qarar_governance.admin_get_notification_workspace_delivery_reason_base(p_limit);');
  if position('is_system_admin' in d) = 0 then raise exception 'notification workspace shape changed'; end if;
  execute d;
end $$;

commit;
