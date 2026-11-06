-- A channel worker must not consume generic governance integration events.
-- This dedicated claim contract leases only business events supported by the
-- WhatsApp dispatcher while retaining the same concurrency guarantees.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create function qarar_governance.claim_whatsapp_notification_outbox(
  p_worker_id uuid,p_lock_token uuid,p_limit integer default 25,p_lease_seconds integer default 60
) returns table(
  id uuid,organization_id uuid,aggregate_type text,aggregate_id uuid,event_type text,
  payload jsonb,deduplication_key text,attempts integer,lock_token uuid,lease_expires_at timestamptz
) language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare v_now timestamptz:=clock_timestamp();
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
  if p_worker_id is null or p_lock_token is null then raise exception using errcode='22023',message='worker id and lock token are required';end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='claim limit must be between 1 and 100';end if;
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then raise exception using errcode='22023',message='lease duration must be between 30 and 3600 seconds';end if;
  perform qarar_governance.recover_stale_notification_outbox();
  return query
  with candidates as (
    select o.id from qarar_governance.notification_outbox o
    where o.status in('pending','failed') and o.attempts<8 and o.available_at<=v_now
      and o.event_type in(
        'meeting.invitation.requested','meeting.reminder.due','meeting.cycle.due_soon','meeting.cycle.overdue',
        'execution.task.created','execution.task.due_soon','execution.task.overdue',
        'execution.task.submitted','execution.task.returned','execution.task.completed'
      )
    order by o.available_at,o.created_at,o.id for update skip locked limit p_limit
  ),claimed as (
    update qarar_governance.notification_outbox o set
      status='processing',attempts=o.attempts+1,locked_at=v_now,locked_by_worker_id=p_worker_id,
      lock_token=p_lock_token,lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),last_attempt_at=v_now
    from candidates where o.id=candidates.id
    returning o.*
  )
  select c.id,c.organization_id,c.aggregate_type,c.aggregate_id,c.event_type,c.payload,
         c.deduplication_key,c.attempts,c.lock_token,c.lease_expires_at
  from claimed c order by c.available_at,c.created_at,c.id;
end $$;

create function api_v1.service_claim_whatsapp_notification_outbox(
  p_worker_id uuid,p_lock_token uuid,p_limit integer,p_lease_seconds integer
) returns table(
  id uuid,organization_id uuid,aggregate_type text,aggregate_id uuid,event_type text,
  payload jsonb,deduplication_key text,attempts integer,lock_token uuid,lease_expires_at timestamptz
) language sql security definer set search_path=pg_catalog as
$$select * from qarar_governance.claim_whatsapp_notification_outbox($1,$2,$3,$4)$$;

alter function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) owner to qarar_governance_executor;
alter function api_v1.service_claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) owner to qarar_api_executor;
revoke all on function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function api_v1.service_claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) to qarar_api_executor;
grant execute on function api_v1.service_claim_whatsapp_notification_outbox(uuid,uuid,integer,integer) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false
from pg_proc p where p.oid='qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure;
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values('v1','service_claim_whatsapp_notification_outbox','qarar_governance','claim_whatsapp_notification_outbox','p_worker_id uuid, p_lock_token uuid, p_limit integer, p_lease_seconds integer','governance','service_role');
update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
