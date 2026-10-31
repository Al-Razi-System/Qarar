-- A provider result may arrive after lease time. It is safe to record while the
-- row is still processing under the same token; recovery changes status/token.
begin;

create or replace function qarar_governance.complete_notification_delivery(p_delivery_id uuid,p_lock_token uuid,p_provider_code text,p_provider_message_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare d qarar_governance.notification_deliveries%rowtype;
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 update qarar_governance.notification_deliveries set status='accepted',provider_code=left(nullif(btrim(p_provider_code),''),50),provider_message_id=left(nullif(btrim(p_provider_message_id),''),255),
  accepted_at=clock_timestamp(),locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,provider_message_id)
 values(d.organization_id,d.id,d.attempts,'accepted',d.provider_code,d.provider_message_id);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id);
end $$;

create or replace function qarar_governance.mark_notification_delivery_ambiguous(p_delivery_id uuid,p_lock_token uuid,p_error_code text,p_provider_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare d qarar_governance.notification_deliveries%rowtype; code text:=left(nullif(btrim(p_error_code),''),100);
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 if code is null then raise exception using errcode='22023',message='bounded error code required';end if;
 update qarar_governance.notification_deliveries set status='failed',provider_code=left(nullif(btrim(p_provider_code),''),50),last_error_code=code||'_AMBIGUOUS',locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,error_code)
 values(d.organization_id,d.id,d.attempts,'failed',d.provider_code,d.last_error_code);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id,'ambiguous',true);
end $$;

alter function qarar_governance.complete_notification_delivery(uuid,uuid,text,text) owner to qarar_governance_executor;
alter function qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) owner to qarar_governance_executor;
revoke all on function qarar_governance.complete_notification_delivery(uuid,uuid,text,text),qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.complete_notification_delivery(uuid,uuid,text,text),qarar_governance.mark_notification_delivery_ambiguous(uuid,uuid,text,text) to qarar_api_executor;

commit;
