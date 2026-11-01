-- Idempotent repair for deliveries queued for retry by the old policy even
-- though OpenWA had returned an explicit terminal client rejection.
begin;

with repaired as (
 update qarar_governance.notification_deliveries d
 set status='failed',updated_at=clock_timestamp()
 where d.status='retry_wait'
   and d.last_error_code ~ '^OPENWA_HTTP_4[0-9][0-9]$'
   and d.last_error_code not in ('OPENWA_HTTP_408','OPENWA_HTTP_425','OPENWA_HTTP_429')
 returning d.id
)
select count(*) as repaired_delivery_count from repaired;

commit;
