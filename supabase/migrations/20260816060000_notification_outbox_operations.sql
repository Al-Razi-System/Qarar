-- Production notification-outbox operations.
create schema if not exists qarar_internal;
revoke all on schema qarar_internal from public,anon,authenticated,service_role;
--
-- Delivery is deliberately at-least-once: a transport can time out after the
-- remote system accepts an event. Every consumer must therefore deduplicate on
-- the immutable event id and deduplication_key sent by the dispatcher.

-- Older deployments had producers but no consumer. A legacy processing row
-- cannot be proven leased, so return it to the retry state rather than silently
-- losing it before enforcing the new lease invariant.
alter table qarar_governance.notification_outbox
  add column if not exists lock_token uuid,
  add column if not exists locked_by_worker_id uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists dead_lettered_at timestamptz;

update qarar_governance.notification_outbox
set status = 'failed',
    available_at = clock_timestamp(),
    locked_at = null,
    lock_token = null,
    locked_by_worker_id = null,
    lease_expires_at = null,
    last_error = coalesce(nullif(last_error, ''), 'legacy processing lease was not recoverable')
where status = 'processing'
  and (
    lock_token is null
    or locked_by_worker_id is null
    or lease_expires_at is null
  );

update qarar_governance.notification_outbox
set locked_at = null,
    lock_token = null,
    locked_by_worker_id = null,
    lease_expires_at = null
where status <> 'processing'
  and (
    locked_at is not null
    or lock_token is not null
    or locked_by_worker_id is not null
    or lease_expires_at is not null
  );

update qarar_governance.notification_outbox
set dead_lettered_at = coalesce(dead_lettered_at, processed_at, created_at, clock_timestamp())
where status = 'dead_letter'
  and dead_lettered_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'qarar_governance.notification_outbox'::regclass
      and conname = 'notification_outbox_processing_lease_check'
  ) then
    alter table qarar_governance.notification_outbox
      add constraint notification_outbox_processing_lease_check
      check (
        (status = 'processing'
          and locked_at is not null
          and lock_token is not null
          and locked_by_worker_id is not null
          and lease_expires_at is not null
          and lease_expires_at > locked_at)
        or
        (status <> 'processing'
          and locked_at is null
          and lock_token is null
          and locked_by_worker_id is null
          and lease_expires_at is null)
      );
  end if;
end;
$$;

create index if not exists notification_outbox_lease_recovery_idx
  on qarar_governance.notification_outbox(lease_expires_at)
  where status = 'processing';

create or replace function qarar_governance.recover_stale_notification_outbox()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_retried integer := 0;
  v_dead_lettered integer := 0;
begin
  -- A worker increments attempts when it takes a lease. If it dies after the
  -- claim, recovering the expired lease preserves that attempt in the audit
  -- trail and prevents an infinite poison-message loop.
  with recovered as (
    update qarar_governance.notification_outbox
    set status = case when attempts >= 8 then 'dead_letter' else 'failed' end,
        available_at = case
          when attempts >= 8 then available_at
          else clock_timestamp()
        end,
        locked_at = null,
        lock_token = null,
        locked_by_worker_id = null,
        lease_expires_at = null,
        dead_lettered_at = case
          when attempts >= 8 then clock_timestamp()
          else dead_lettered_at
        end,
        last_error = coalesce(nullif(last_error, ''), 'notification delivery lease expired')
    where status = 'processing'
      and lease_expires_at <= clock_timestamp()
    returning status
  )
  select count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'dead_letter')
    into v_retried, v_dead_lettered
  from recovered;

  with exhausted as (
    update qarar_governance.notification_outbox
    set status = 'dead_letter',
        locked_at = null,
        lock_token = null,
        locked_by_worker_id = null,
        lease_expires_at = null,
        dead_lettered_at = coalesce(dead_lettered_at, clock_timestamp()),
        last_error = coalesce(nullif(last_error, ''), 'notification retry budget exhausted')
    where status in ('pending', 'failed')
      and attempts >= 8
    returning id
  )
  select v_dead_lettered + count(*)
    into v_dead_lettered
  from exhausted;

  return jsonb_build_object(
    'retried', v_retried,
    'dead_lettered', v_dead_lettered,
    'checked_at', clock_timestamp()
  );
end;
$$;

create or replace function qarar_governance.claim_notification_outbox(
  p_worker_id uuid,
  p_lock_token uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 600
)
returns table(
  id uuid,
  organization_id uuid,
  aggregate_type text,
  aggregate_id uuid,
  event_type text,
  payload jsonb,
  deduplication_key text,
  attempts integer,
  lock_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_governance
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_worker_id is null or p_lock_token is null then
    raise exception using errcode = '22023', message = 'worker id and lock token are required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'claim limit must be between 1 and 100';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception using errcode = '22023', message = 'lease duration must be between 30 and 3600 seconds';
  end if;

  perform qarar_governance.recover_stale_notification_outbox();

  return query
  with candidates as (
    select outbox.id
    from qarar_governance.notification_outbox outbox
    where outbox.status in ('pending', 'failed')
      and outbox.attempts < 8
      and outbox.available_at <= v_now
    order by outbox.available_at, outbox.created_at, outbox.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update qarar_governance.notification_outbox outbox
    set status = 'processing',
        attempts = outbox.attempts + 1,
        locked_at = v_now,
        locked_by_worker_id = p_worker_id,
        lock_token = p_lock_token,
        lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        last_attempt_at = v_now
    from candidates
    where outbox.id = candidates.id
    returning outbox.id,
      outbox.organization_id,
      outbox.aggregate_type,
      outbox.aggregate_id,
      outbox.event_type,
      outbox.payload,
      outbox.deduplication_key,
      outbox.attempts,
      outbox.lock_token,
      outbox.lease_expires_at,
      outbox.available_at,
      outbox.created_at
  )
  select claimed.id,
    claimed.organization_id,
    claimed.aggregate_type,
    claimed.aggregate_id,
    claimed.event_type,
    claimed.payload,
    claimed.deduplication_key,
    claimed.attempts,
    claimed.lock_token,
    claimed.lease_expires_at
  from claimed
  order by claimed.available_at, claimed.created_at, claimed.id;
end;
$$;

create or replace function qarar_governance.acknowledge_notification_outbox(
  p_event_id uuid,
  p_lock_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_governance
as $$
declare
  v_processed_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_event_id is null or p_lock_token is null then
    raise exception using errcode = '22023', message = 'event id and lock token are required';
  end if;

  update qarar_governance.notification_outbox
  set status = 'processed',
      processed_at = clock_timestamp(),
      locked_at = null,
      lock_token = null,
      locked_by_worker_id = null,
      lease_expires_at = null
  where id = p_event_id
    and status = 'processing'
    and lock_token = p_lock_token
    and lease_expires_at > clock_timestamp()
  returning processed_at into v_processed_at;

  return jsonb_build_object(
    'acknowledged', v_processed_at is not null,
    'processed_at', v_processed_at
  );
end;
$$;

create or replace function qarar_governance.fail_notification_outbox(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_governance
as $$
declare
  v_result qarar_governance.notification_outbox%rowtype;
  v_error text := left(nullif(btrim(coalesce(p_error, '')), ''), 1000);
  v_delay_seconds integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service role required';
  end if;
  if p_event_id is null or p_lock_token is null then
    raise exception using errcode = '22023', message = 'event id and lock token are required';
  end if;
  if v_error is null then
    raise exception using errcode = '22023', message = 'a bounded failure reason is required';
  end if;

  update qarar_governance.notification_outbox
  set status = case when attempts >= 8 then 'dead_letter' else 'failed' end,
      available_at = case
        when attempts >= 8 then available_at
        else clock_timestamp() + make_interval(
          secs => least(3600, (30 * power(2::numeric, greatest(attempts - 1, 0)))::integer)
        )
      end,
      locked_at = null,
      lock_token = null,
      locked_by_worker_id = null,
      lease_expires_at = null,
      dead_lettered_at = case
        when attempts >= 8 then clock_timestamp()
        else dead_lettered_at
      end,
      last_error = v_error
  where id = p_event_id
    and status = 'processing'
    and lock_token = p_lock_token
    and lease_expires_at > clock_timestamp()
  returning * into v_result;

  if v_result.id is null then
    return jsonb_build_object('accepted', false, 'reason', 'lease_not_current');
  end if;

  v_delay_seconds := case
    when v_result.status = 'dead_letter' then null
    else greatest(0, extract(epoch from v_result.available_at - clock_timestamp())::integer)
  end;
  return jsonb_build_object(
    'accepted', true,
    'status', v_result.status,
    'attempts', v_result.attempts,
    'available_at', v_result.available_at,
    'retry_after_seconds', v_delay_seconds
  );
end;
$$;

-- Requeueing a dead letter is a deliberate maintenance operation, not a worker
-- capability. It is intentionally absent from api_v1 and requires direct
-- database-operator access with an incident reference in p_reason.
create or replace function qarar_governance.requeue_notification_outbox(
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_result qarar_governance.notification_outbox%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_event_id is null or char_length(coalesce(v_reason, '')) < 10 then
    raise exception using errcode = '22023', message = 'event id and an incident reference of at least 10 characters are required';
  end if;

  update qarar_governance.notification_outbox
  set status = 'pending',
      attempts = 0,
      available_at = clock_timestamp(),
      locked_at = null,
      lock_token = null,
      locked_by_worker_id = null,
      lease_expires_at = null,
      dead_lettered_at = null,
      last_error = 'manual requeue: ' || left(v_reason, 900)
  where id = p_event_id
    and status = 'dead_letter'
  returning * into v_result;

  if v_result.id is null then
    raise exception using errcode = 'P0002', message = 'dead-letter notification event not found';
  end if;
  return jsonb_build_object('id', v_result.id, 'status', v_result.status, 'attempts', v_result.attempts);
end;
$$;

-- This reconciliation function intentionally returns a failure payload instead
-- of aborting a developer migration when pg_cron is absent. Production
-- preflight treats a missing/mismatched job as a release blocker.
create or replace function qarar_internal.reconcile_qarar_cron_jobs()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_error text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return jsonb_build_object('ready', false, 'reason', 'pg_cron_not_available');
  end if;

  begin
    create extension if not exists pg_cron;
    if to_regclass('cron.job') is null then
      return jsonb_build_object('ready', false, 'reason', 'cron_job_catalog_not_available');
    end if;

    perform cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'qarar-expire-access-delegations',
      'qarar-expire-governance-exceptions',
      'qarar-recover-notification-outbox'
    );

    perform cron.schedule(
      'qarar-expire-access-delegations',
      '* * * * *',
      'select qarar_iam.expire_access_delegations()'
    );
    perform cron.schedule(
      'qarar-expire-governance-exceptions',
      '* * * * *',
      'select qarar_governance.expire_governance_exceptions()'
    );
    perform cron.schedule(
      'qarar-recover-notification-outbox',
      '*/5 * * * *',
      'select qarar_governance.recover_stale_notification_outbox()'
    );
  exception when others then
    get stacked diagnostics v_error = message_text;
    return jsonb_build_object('ready', false, 'reason', 'cron_reconciliation_failed', 'error', v_error);
  end;

  return jsonb_build_object(
    'ready', true,
    'jobs', jsonb_build_array(
      'qarar-expire-access-delegations',
      'qarar-expire-governance-exceptions',
      'qarar-recover-notification-outbox'
    )
  );
end;
$$;

alter function qarar_governance.recover_stale_notification_outbox()
  owner to qarar_governance_executor;
alter function qarar_governance.claim_notification_outbox(uuid, uuid, integer, integer)
  owner to qarar_governance_executor;
alter function qarar_governance.acknowledge_notification_outbox(uuid, uuid)
  owner to qarar_governance_executor;
alter function qarar_governance.fail_notification_outbox(uuid, uuid, text)
  owner to qarar_governance_executor;
alter function qarar_governance.requeue_notification_outbox(uuid, text)
  owner to qarar_governance_executor;
alter function qarar_internal.reconcile_qarar_cron_jobs()
  owner to supabase_admin;

revoke all on function qarar_governance.recover_stale_notification_outbox()
  from public, anon, authenticated, service_role;
revoke all on function qarar_governance.claim_notification_outbox(uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function qarar_governance.acknowledge_notification_outbox(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function qarar_governance.fail_notification_outbox(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function qarar_governance.requeue_notification_outbox(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function qarar_internal.reconcile_qarar_cron_jobs()
  from public, anon, authenticated, service_role;

grant execute on function qarar_governance.claim_notification_outbox(uuid, uuid, integer, integer)
  to qarar_api_executor;
grant execute on function qarar_governance.acknowledge_notification_outbox(uuid, uuid)
  to qarar_api_executor;
grant execute on function qarar_governance.fail_notification_outbox(uuid, uuid, text)
  to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  'governance',
  'qarar_governance',
  false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance'
  and p.proname in (
    'recover_stale_notification_outbox',
    'claim_notification_outbox',
    'acknowledge_notification_outbox',
    'fail_notification_outbox',
    'requeue_notification_outbox'
  )
on conflict(function_oid) do update
set function_name = excluded.function_name,
    identity_arguments = excluded.identity_arguments,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema,
    is_rls_predicate = excluded.is_rls_predicate;

create or replace function api_v1.service_claim_notification_outbox(
  p_worker_id uuid,
  p_lock_token uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 600
)
returns table(
  id uuid,
  organization_id uuid,
  aggregate_type text,
  aggregate_id uuid,
  event_type text,
  payload jsonb,
  deduplication_key text,
  attempts integer,
  lock_token uuid,
  lease_expires_at timestamptz
)
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select *
  from qarar_governance.claim_notification_outbox($1, $2, $3, $4)
$$;

create or replace function api_v1.service_acknowledge_notification_outbox(
  p_event_id uuid,
  p_lock_token uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select qarar_governance.acknowledge_notification_outbox($1, $2)
$$;

create or replace function api_v1.service_fail_notification_outbox(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select qarar_governance.fail_notification_outbox($1, $2, $3)
$$;

alter function api_v1.service_claim_notification_outbox(uuid, uuid, integer, integer)
  owner to qarar_api_executor;
alter function api_v1.service_acknowledge_notification_outbox(uuid, uuid)
  owner to qarar_api_executor;
alter function api_v1.service_fail_notification_outbox(uuid, uuid, text)
  owner to qarar_api_executor;

revoke all on function api_v1.service_claim_notification_outbox(uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function api_v1.service_acknowledge_notification_outbox(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function api_v1.service_fail_notification_outbox(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.service_claim_notification_outbox(uuid, uuid, integer, integer)
  to service_role;
grant execute on function api_v1.service_acknowledge_notification_outbox(uuid, uuid)
  to service_role;
grant execute on function api_v1.service_fail_notification_outbox(uuid, uuid, text)
  to service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,
  contract_name,
  implementation_schema,
  implementation_name,
  identity_arguments,
  module_code,
  audience
)
values
  (
    'v1',
    'service_claim_notification_outbox',
    'qarar_governance',
    'claim_notification_outbox',
    'p_worker_id uuid, p_lock_token uuid, p_limit integer, p_lease_seconds integer',
    'governance',
    'service_role'
  ),
  (
    'v1',
    'service_acknowledge_notification_outbox',
    'qarar_governance',
    'acknowledge_notification_outbox',
    'p_event_id uuid, p_lock_token uuid',
    'governance',
    'service_role'
  ),
  (
    'v1',
    'service_fail_notification_outbox',
    'qarar_governance',
    'fail_notification_outbox',
    'p_event_id uuid, p_lock_token uuid, p_error text',
    'governance',
    'service_role'
  )
on conflict(api_version, contract_name, identity_arguments) do update
set implementation_schema = excluded.implementation_schema,
    implementation_name = excluded.implementation_name,
    module_code = excluded.module_code,
    audience = excluded.audience,
    deprecated_at = null,
    replacement_contract = null;

update qarar_architecture.api_release_registry
set contract_count = (
      select count(*)::integer
      from qarar_architecture.api_contract_registry
      where api_version = 'v1'
    ),
    contract_hash = (
      select md5(string_agg(
        p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' ||
        pg_get_function_result(p.oid) || '|' || r.audience,
        E'\n'
        order by p.proname, pg_get_function_identity_arguments(p.oid)
      ))
      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
       and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry r
        on r.api_version = 'v1'
       and r.contract_name = p.proname
       and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ),
    released_at = clock_timestamp(),
    notes = 'Notification outbox operational state machine and service-only dispatcher contracts added.'
where api_version = 'v1';

do $$
declare
  v_cron_result jsonb;
begin
  select qarar_internal.reconcile_qarar_cron_jobs() into v_cron_result;
  if not coalesce((v_cron_result ->> 'ready')::boolean, false) then
    raise notice 'Qarar cron reconciliation deferred to production preflight: %', v_cron_result;
  end if;
end;
$$;

notify pgrst, 'reload schema';
