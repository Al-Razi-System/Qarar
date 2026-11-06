-- Manual reconciliation after the OpenWA LID/session fix.
-- These exact deliveries were quarantined as ambiguous by Qarar, then matched
-- in OpenWA's durable message log: each had provider_message_id/waMessageId
-- NULL and was blocked in recipient resolution before sendMessage. Requeue only
-- these rows; no generic ambiguous delivery is safe to retry automatically.
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
  where d.id = any (array[
      '0ca3138d-4614-406e-a4a8-a05a4a361ee2'::uuid,
      '759ce98c-87eb-4cad-a52a-1a6e21ee8f89'::uuid,
      'f2240ea1-ad85-47d5-87e4-ec9d5cd7a69a'::uuid
    ])
    and d.status = 'failed'
    and d.last_error_code = 'OPENWA_TIMEOUT_AMBIGUOUS'
    and d.provider_message_id is null
  returning d.id
)
select count(*) as reconciled_delivery_count from repaired;

commit;
