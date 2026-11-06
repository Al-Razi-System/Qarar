-- A successful provider receipt supersedes an earlier reconciled failure.
begin;
create or replace function qarar_governance.complete_notification_delivery(p_delivery_id uuid,p_lock_token uuid,p_provider_code text,p_provider_message_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare d qarar_governance.notification_deliveries%rowtype;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 update qarar_governance.notification_deliveries set
  status='accepted',provider_code=left(nullif(btrim(p_provider_code),''),50),provider_message_id=left(nullif(btrim(p_provider_message_id),''),255),
  accepted_at=clock_timestamp(),last_error_code=null,locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,provider_message_id)
 values(d.organization_id,d.id,d.attempts,'accepted',d.provider_code,d.provider_message_id);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id);
end $$;
alter function qarar_governance.complete_notification_delivery(uuid,uuid,text,text) owner to qarar_governance_executor;

-- Idempotent repair: accepted rows already have a provider receipt, so a stale
-- failure code is no longer their current outcome. Attempts retain full history.
update qarar_governance.notification_deliveries
set last_error_code=null,updated_at=clock_timestamp()
where status='accepted' and provider_message_id is not null and last_error_code is not null;
commit;
