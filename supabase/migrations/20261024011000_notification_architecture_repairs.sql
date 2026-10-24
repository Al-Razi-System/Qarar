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
  ('governance', 'qarar_decisions', 'decisions', 'WhatsApp dispatch context fills a message with its decision')
on conflict do nothing;

commit;
