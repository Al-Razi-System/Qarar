-- Safe recipient resolution and terminal skip for the notification dispatcher.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

alter table qarar_governance.notification_deliveries alter column destination drop not null;
alter table qarar_governance.notification_deliveries add constraint notification_delivery_destination_state check (
 (status='skipped' and destination is null) or (status<>'skipped' and destination is not null)
);

create function qarar_governance.get_notification_dispatch_context(p_event_id uuid,p_lock_token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare e qarar_governance.notification_outbox%rowtype; u qarar_iam.users%rowtype; recipient uuid;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 select * into e from qarar_governance.notification_outbox where id=p_event_id;
 if e.id is null or e.status<>'processing' or e.lock_token is distinct from p_lock_token or e.lease_expires_at<=clock_timestamp() then
  raise exception using errcode='40001',message='notification event lease is not current';end if;
 recipient:=nullif(e.payload->>'recipient_user_id','')::uuid;
 select * into u from qarar_iam.users where id=recipient and organization_id=e.organization_id and status='active';
 return jsonb_build_object('event_id',e.id,'organization_id',e.organization_id,'event_type',e.event_type,'payload',e.payload,
  'recipient_user_id',recipient,'recipient_name_ar',u.full_name_ar,'mobile',u.mobile,'recipient_active',u.id is not null);
end $$;

create function qarar_governance.skip_notification_delivery(
 p_event_id uuid,p_lock_token uuid,p_channel text,p_template_code text,p_template_version text,p_reason_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,auth as $$
declare e qarar_governance.notification_outbox%rowtype; d qarar_governance.notification_deliveries%rowtype; recipient uuid; reason text:=left(nullif(btrim(p_reason_code),''),100);
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 select * into d from qarar_governance.notification_deliveries where outbox_event_id=p_event_id and channel=p_channel and template_code=p_template_code and template_version=p_template_version;
 if found then return jsonb_build_object('id',d.id,'status',d.status,'idempotent_replay',true);end if;
 if reason is null or p_channel<>'whatsapp' then raise exception using errcode='22023',message='invalid skipped delivery';end if;
 select * into e from qarar_governance.notification_outbox where id=p_event_id for update;
 if e.id is null or e.status<>'processing' or e.lock_token is distinct from p_lock_token or e.lease_expires_at<=clock_timestamp() then
  raise exception using errcode='40001',message='notification event lease is not current';end if;
 recipient:=nullif(e.payload->>'recipient_user_id','')::uuid;
 if recipient is null or not exists(select 1 from qarar_iam.users where id=recipient and organization_id=e.organization_id) then
  raise exception using errcode='23503',message='notification recipient is not in the event organization';end if;
 insert into qarar_governance.notification_deliveries(organization_id,outbox_event_id,recipient_user_id,channel,template_code,template_version,destination,destination_masked,variables,status,last_error_code)
 values(e.organization_id,e.id,recipient,p_channel,p_template_code,p_template_version,null,'غير متاح',e.payload,'skipped',reason) returning * into d;
 update qarar_governance.notification_outbox set status='processed',processed_at=clock_timestamp(),locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null where id=e.id;
 return jsonb_build_object('id',d.id,'status',d.status,'idempotent_replay',false);
end $$;

create function api_v1.service_get_notification_dispatch_context(uuid,uuid) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.get_notification_dispatch_context($1,$2)$$;
create function api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text) returns jsonb language sql security definer set search_path=pg_catalog as
$$select qarar_governance.skip_notification_delivery($1,$2,$3,$4,$5,$6)$$;

alter function qarar_governance.get_notification_dispatch_context(uuid,uuid) owner to qarar_governance_executor;
alter function qarar_governance.skip_notification_delivery(uuid,uuid,text,text,text,text) owner to qarar_governance_executor;
alter function api_v1.service_get_notification_dispatch_context(uuid,uuid) owner to qarar_api_executor;
alter function api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text) owner to qarar_api_executor;
revoke all on function qarar_governance.get_notification_dispatch_context(uuid,uuid),qarar_governance.skip_notification_delivery(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb),qarar_governance.claim_notification_deliveries(uuid,uuid,text,integer,integer),qarar_governance.complete_notification_delivery(uuid,uuid,text,text),qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer),qarar_governance.get_notification_dispatch_context(uuid,uuid),qarar_governance.skip_notification_delivery(uuid,uuid,text,text,text,text) to qarar_api_executor;
revoke all on function api_v1.service_get_notification_dispatch_context(uuid,uuid),api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function api_v1.service_get_notification_dispatch_context(uuid,uuid),api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text) to service_role;

insert into qarar_architecture.function_registry(function_oid,function_name,identity_arguments,module_code,owning_schema,is_rls_predicate)
select p.oid,p.proname,pg_get_function_identity_arguments(p.oid),'governance','qarar_governance',false from pg_proc p where p.pronamespace='qarar_governance'::regnamespace and p.proname in ('get_notification_dispatch_context','skip_notification_delivery');
insert into qarar_architecture.api_contract_registry(api_version,contract_name,implementation_schema,implementation_name,identity_arguments,module_code,audience) values
('v1','service_get_notification_dispatch_context','qarar_governance','get_notification_dispatch_context','p_event_id uuid, p_lock_token uuid','governance','service_role'),
('v1','service_skip_notification_delivery','qarar_governance','skip_notification_delivery','p_event_id uuid, p_lock_token uuid, p_channel text, p_template_code text, p_template_version text, p_reason_code text','governance','service_role')
on conflict(api_version,contract_name,identity_arguments) do update set implementation_schema=excluded.implementation_schema,implementation_name=excluded.implementation_name,module_code=excluded.module_code,audience=excluded.audience,deprecated_at=null,replacement_contract=null;
update qarar_architecture.api_release_registry r set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
 contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1' join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname and c.identity_arguments=pg_get_function_identity_arguments(p.oid)) where r.api_version='v1';
notify pgrst,'reload schema';
commit;
