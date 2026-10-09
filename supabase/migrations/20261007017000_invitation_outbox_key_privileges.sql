begin;
-- INSERT ... ON CONFLICT needs SELECT on its conflict-key columns. Keep payload,
-- recipient data, delivery state and the remaining outbox columns private.
grant select(organization_id,deduplication_key) on qarar_governance.notification_outbox to qarar_meetings_executor;
commit;
