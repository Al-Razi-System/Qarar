-- API wrappers were created with positional arguments, while the initial
-- registry rows copied the implementation argument names. Reconcile the
-- registry identity to the actual public wrapper signature.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

delete from qarar_architecture.api_contract_registry
where api_version='v1'
  and contract_name in (
    'service_materialize_notification_delivery',
    'service_claim_notification_deliveries',
    'service_complete_notification_delivery',
    'service_fail_notification_delivery',
    'service_get_notification_dispatch_context',
    'service_skip_notification_delivery',
    'service_mark_notification_delivery_ambiguous'
  );

insert into qarar_architecture.api_contract_registry(
  api_version,contract_name,implementation_schema,implementation_name,
  identity_arguments,module_code,audience
) values
 ('v1','service_materialize_notification_delivery','qarar_governance','materialize_notification_delivery','uuid, uuid, text, text, text, text, jsonb','governance','service_role'),
 ('v1','service_claim_notification_deliveries','qarar_governance','claim_notification_deliveries','uuid, uuid, text, integer, integer','governance','service_role'),
 ('v1','service_complete_notification_delivery','qarar_governance','complete_notification_delivery','uuid, uuid, text, text','governance','service_role'),
 ('v1','service_fail_notification_delivery','qarar_governance','fail_notification_delivery','uuid, uuid, text, text, integer','governance','service_role'),
 ('v1','service_get_notification_dispatch_context','qarar_governance','get_notification_dispatch_context','uuid, uuid','governance','service_role'),
 ('v1','service_skip_notification_delivery','qarar_governance','skip_notification_delivery','uuid, uuid, text, text, text, text','governance','service_role'),
 ('v1','service_mark_notification_delivery_ambiguous','qarar_governance','mark_notification_delivery_ambiguous','uuid, uuid, text, text','governance','service_role');

update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
