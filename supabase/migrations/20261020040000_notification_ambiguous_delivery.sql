-- Quarantine ambiguous provider outcomes so a message accepted before an HTTP
-- timeout is not sent again automatically.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create function qarar_governance.mark_notification_delivery_ambiguous(
  p_delivery_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_provider_code text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,auth,qarar_governance
as $$
declare
  d qarar_governance.notification_deliveries%rowtype;
  v_error text:=left(nullif(btrim(p_error_code),''),80);
begin
  if auth.role()<>'service_role' then
    raise exception using errcode='42501',message='service role required';
  end if;
  if v_error is null then
    raise exception using errcode='22023',message='bounded error code required';
  end if;

  update qarar_governance.notification_deliveries
     set status='failed',
         provider_code=left(nullif(btrim(p_provider_code),''),50),
         last_error_code=left(v_error||'_AMBIGUOUS',100),
         locked_at=null,
         locked_by_worker_id=null,
         lock_token=null,
         lease_expires_at=null,
         updated_at=clock_timestamp()
   where id=p_delivery_id
     and status='processing'
     and lock_token=p_lock_token
     and lease_expires_at>clock_timestamp()
  returning * into d;

  if d.id is null then
    return jsonb_build_object('accepted',false,'reason','lease_not_current');
  end if;

  insert into qarar_governance.notification_delivery_attempts(
    organization_id,delivery_id,attempt_no,outcome,provider_code,error_code
  ) values (
    d.organization_id,d.id,d.attempts,'failed',d.provider_code,d.last_error_code
  );
  return jsonb_build_object('accepted',true,'status',d.status,'id',d.id,'ambiguous',true);
end $$;

create function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text)
returns jsonb
language sql
security definer
set search_path=pg_catalog
as $$select qarar_governance.mark_notification_delivery_ambiguous($1,$2,$3,$4)$$;

alter function qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) owner to qarar_governance_executor;
alter function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) owner to qarar_api_executor;
revoke all on function qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) to qarar_api_executor;
grant execute on function api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance',n.nspname,false
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('qarar_governance','api_v1')
  and p.proname in ('mark_notification_delivery_ambiguous','service_mark_notification_delivery_ambiguous')
on conflict(function_oid) do update set function_name=excluded.function_name,identity_arguments=excluded.identity_arguments,module_code=excluded.module_code,owning_schema=excluded.owning_schema,is_rls_predicate=false;

-- Reconcile the four delivery contracts as well. Early development databases
-- received their functions during isolated testing before their migration
-- ledger/registry row was present; this upsert is harmless on fresh databases.
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience)
values
 ('v1','service_materialize_notification_delivery','qarar_governance','materialize_notification_delivery','p_event_id uuid, p_lock_token uuid, p_channel text, p_template_code text, p_template_version text, p_destination text, p_variables jsonb','governance','service_role'),
 ('v1','service_claim_notification_deliveries','qarar_governance','claim_notification_deliveries','p_worker_id uuid, p_lock_token uuid, p_channel text, p_limit integer, p_lease_seconds integer','governance','service_role'),
 ('v1','service_complete_notification_delivery','qarar_governance','complete_notification_delivery','p_delivery_id uuid, p_lock_token uuid, p_provider_code text, p_provider_message_id text','governance','service_role'),
 ('v1','service_fail_notification_delivery','qarar_governance','fail_notification_delivery','p_delivery_id uuid, p_lock_token uuid, p_error_code text, p_provider_code text, p_http_status integer','governance','service_role'),
 ('v1','service_mark_notification_delivery_ambiguous','qarar_governance','mark_notification_delivery_ambiguous','p_delivery_id uuid, p_lock_token uuid, p_error_code text, p_provider_code text','governance','service_role')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;

update qarar_architecture.api_release_registry r set
 contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

notify pgrst,'reload schema';
commit;
