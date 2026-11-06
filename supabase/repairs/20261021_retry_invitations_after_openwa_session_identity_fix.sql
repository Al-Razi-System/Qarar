-- Idempotent, scoped repair for the three meeting invitations rejected before
-- sending because the worker addressed the OpenWA session by name, not UUID.
-- Do not broaden this repair: explicit HTTP 400 makes these rows safe to retry,
-- while timeouts and other ambiguous outcomes must remain quarantined.
begin;

with repaired as (
  update qarar_governance.notification_deliveries d
  set status = 'retry_wait',
      available_at = clock_timestamp(),
      locked_at = null,
      locked_by_worker_id = null,
      lock_token = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  from qarar_governance.notification_outbox o
  where o.id = d.outbox_event_id
    and o.aggregate_type = 'meeting'
    and o.aggregate_id = '7f71b3dd-d05c-4083-8452-b288aab0adb5'::uuid
    and o.event_type = 'meeting.invitation.requested'
    and d.channel = 'whatsapp'
    and d.status = 'failed'
    and d.last_error_code = 'OPENWA_HTTP_400'
    and d.provider_message_id is null
  returning d.id
)
select count(*) as repaired_delivery_count from repaired;

commit;
