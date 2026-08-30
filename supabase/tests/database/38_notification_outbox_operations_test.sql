begin;

create extension if not exists pgtap;
select plan(21);

insert into qarar_core.organizations(id, code, name_ar)
values ('f8000000-0000-0000-0000-000000000001', 'outbox-ops', 'Outbox operations tenant');

insert into qarar_governance.notification_outbox(
  id, organization_id, aggregate_type, aggregate_id, event_type, payload,
  deduplication_key, status, attempts
) values
  (
    'f8000000-0000-0000-0000-000000000011',
    'f8000000-0000-0000-0000-000000000001',
    'topic',
    'f8000000-0000-0000-0000-000000000021',
    'governance.workflow.started',
    '{"topic_id":"f8000000-0000-0000-0000-000000000021"}',
    'outbox-ops-claim-ack',
    'pending',
    0
  ),
  (
    'f8000000-0000-0000-0000-000000000012',
    'f8000000-0000-0000-0000-000000000001',
    'meeting',
    'f8000000-0000-0000-0000-000000000022',
    'meeting.invitation.requested',
    '{"meeting_id":"f8000000-0000-0000-0000-000000000022"}',
    'outbox-ops-failure',
    'pending',
    0
  ),
  (
    'f8000000-0000-0000-0000-000000000013',
    'f8000000-0000-0000-0000-000000000001',
    'topic',
    'f8000000-0000-0000-0000-000000000023',
    'governance.workflow.step_acted',
    '{"topic_id":"f8000000-0000-0000-0000-000000000023"}',
    'outbox-ops-dead-letter',
    'pending',
    7
  );

select has_function(
  'api_v1',
  'service_claim_notification_outbox',
  array['uuid', 'uuid', 'integer', 'integer'],
  'service-only outbox claim facade exists'
);
select ok(
  has_function_privilege('service_role', 'api_v1.service_claim_notification_outbox(uuid,uuid,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'api_v1.service_claim_notification_outbox(uuid,uuid,integer,integer)', 'execute'),
  'only service role can claim notification outbox events'
);
select ok(
  has_function_privilege('service_role', 'api_v1.service_acknowledge_notification_outbox(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'api_v1.service_acknowledge_notification_outbox(uuid,uuid)', 'execute'),
  'only service role can acknowledge notification outbox events'
);
select ok(
  has_function_privilege('service_role', 'api_v1.service_fail_notification_outbox(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'api_v1.service_fail_notification_outbox(uuid,uuid,text)', 'execute'),
  'only service role can fail notification outbox events'
);
select ok(
  not has_function_privilege('service_role', 'qarar_governance.claim_notification_outbox(uuid,uuid,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'qarar_governance.fail_notification_outbox(uuid,uuid,text)', 'execute'),
  'implementation routines remain private behind api_v1'
);

create function pg_temp.outbox_state(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select to_jsonb(o)
  from qarar_governance.notification_outbox o
  where o.id = p_id
$$;

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select is(
  (
    select id
    from api_v1.service_claim_notification_outbox(
      'f8000000-0000-0000-0000-000000000101',
      'f8000000-0000-0000-0000-000000000201',
      1,
      60
    )
  ),
  'f8000000-0000-0000-0000-000000000011'::uuid,
  'claim selects the oldest available event'
);
select is(
  pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'status',
  'processing',
  'claim moves the event into processing'
);
select is(
  (pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'attempts')::integer,
  1,
  'claim increments delivery attempts exactly once'
);
select ok(
  (pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'lease_expires_at')::timestamptz
    > (pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'locked_at')::timestamptz
  and pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'lock_token' is not null
  and pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'locked_by_worker_id' is not null,
  'claim writes an opaque finite lease'
);
select is(
  (api_v1.service_acknowledge_notification_outbox(
    'f8000000-0000-0000-0000-000000000011',
    'f8000000-0000-0000-0000-000000000299'
  )->>'acknowledged')::boolean,
  false,
  'a mismatched lease token cannot acknowledge delivery'
);
select is(
  (api_v1.service_acknowledge_notification_outbox(
    'f8000000-0000-0000-0000-000000000011',
    'f8000000-0000-0000-0000-000000000201'
  )->>'acknowledged')::boolean,
  true,
  'the worker that owns the current lease can acknowledge delivery'
);
select ok(
  pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'status' = 'processed'
  and pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'processed_at' is not null
  and pg_temp.outbox_state('f8000000-0000-0000-0000-000000000011')->>'lock_token' is null,
  'acknowledged event is terminal and releases its lease'
);

select is(
  (
    select id
    from api_v1.service_claim_notification_outbox(
      'f8000000-0000-0000-0000-000000000102',
      'f8000000-0000-0000-0000-000000000202',
      1,
      60
    )
  ),
  'f8000000-0000-0000-0000-000000000012'::uuid,
  'next claim advances to the next due event'
);
select is(
  api_v1.service_fail_notification_outbox(
    'f8000000-0000-0000-0000-000000000012',
    'f8000000-0000-0000-0000-000000000202',
    'webhook_http_503'
  )->>'status',
  'failed',
  'failed delivery becomes retryable before retry budget exhaustion'
);
select ok(
  (pg_temp.outbox_state('f8000000-0000-0000-0000-000000000012')->>'attempts')::integer = 1
  and (pg_temp.outbox_state('f8000000-0000-0000-0000-000000000012')->>'available_at')::timestamptz > clock_timestamp() + interval '20 seconds',
  'failed delivery receives exponential retry delay'
);

select is(
  (
    select id
    from api_v1.service_claim_notification_outbox(
      'f8000000-0000-0000-0000-000000000103',
      'f8000000-0000-0000-0000-000000000203',
      1,
      60
    )
  ),
  'f8000000-0000-0000-0000-000000000013'::uuid,
  'event at the final retry budget can still be leased once'
);
select is(
  api_v1.service_fail_notification_outbox(
    'f8000000-0000-0000-0000-000000000013',
    'f8000000-0000-0000-0000-000000000203',
    'permanent_receiver_rejection'
  )->>'status',
  'dead_letter',
  'eighth failed claim becomes dead letter'
);

reset role;

select is(
  qarar_governance.requeue_notification_outbox(
    'f8000000-0000-0000-0000-000000000013',
    'INC-1001 receiver policy corrected and replay approved'
  )->>'status',
  'pending',
  'only the direct maintenance path can intentionally requeue a dead letter'
);
select ok(
  (select attempts = 0 and last_error like 'manual requeue:%'
   from qarar_governance.notification_outbox
   where id = 'f8000000-0000-0000-0000-000000000013'),
  'manual requeue resets retry state and preserves its incident reason'
);

insert into qarar_governance.notification_outbox(
  id, organization_id, aggregate_type, aggregate_id, event_type, payload, deduplication_key,
  status, attempts, locked_at, locked_by_worker_id, lock_token, lease_expires_at
) values (
  'f8000000-0000-0000-0000-000000000014',
  'f8000000-0000-0000-0000-000000000001',
  'topic',
  'f8000000-0000-0000-0000-000000000024',
  'governance.workflow.started',
  '{"topic_id":"f8000000-0000-0000-0000-000000000024"}',
  'outbox-ops-stale-lease',
  'processing',
  1,
  clock_timestamp() - interval '20 minutes',
  'f8000000-0000-0000-0000-000000000104',
  'f8000000-0000-0000-0000-000000000204',
  clock_timestamp() - interval '10 minutes'
);

select is(
  (qarar_governance.recover_stale_notification_outbox()->>'retried')::integer,
  1,
  'lease recovery returns abandoned work to retryable state'
);
select ok(
  (select status = 'failed' and lock_token is null and available_at <= clock_timestamp()
   from qarar_governance.notification_outbox
   where id = 'f8000000-0000-0000-0000-000000000014'),
  'lease recovery clears stale ownership without dropping the event'
);

select * from finish();
rollback;
