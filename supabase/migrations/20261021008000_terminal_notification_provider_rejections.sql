-- Explicit 4xx responses (other than retryable timeout/rate-limit statuses)
-- mean the provider rejected the request before accepting a message. Retrying
-- those rows cannot succeed without correcting data or credentials.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;

create or replace function qarar_governance.fail_notification_delivery(
 p_delivery_id uuid,p_lock_token uuid,p_error_code text,p_provider_code text,p_http_status integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,auth,qarar_governance as $$
declare
 d qarar_governance.notification_deliveries%rowtype;
 v_error text:=left(nullif(btrim(p_error_code),''),100);
 v_terminal boolean:=p_http_status between 400 and 499 and p_http_status not in (408,425,429);
begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='service role required';end if;
 if v_error is null then raise exception using errcode='22023',message='bounded error code required';end if;
 update qarar_governance.notification_deliveries set
  status=case when v_terminal then 'failed' when attempts>=8 then 'dead_letter' else 'retry_wait' end,
  available_at=case when v_terminal or attempts>=8 then available_at else clock_timestamp()+make_interval(secs=>least(3600,30*power(2,greatest(attempts-1,0))::integer)) end,
  provider_code=left(nullif(btrim(p_provider_code),''),50),last_error_code=v_error,
  locked_at=null,locked_by_worker_id=null,lock_token=null,lease_expires_at=null,updated_at=clock_timestamp()
 where id=p_delivery_id and status='processing' and lock_token=p_lock_token and lease_expires_at>clock_timestamp() returning * into d;
 if d.id is null then return jsonb_build_object('accepted',false,'reason','lease_not_current');end if;
 insert into qarar_governance.notification_delivery_attempts(organization_id,delivery_id,attempt_no,outcome,provider_code,error_code,http_status)
 values(d.organization_id,d.id,d.attempts,case when d.status='retry_wait' then 'retry' when d.status='dead_letter' then 'dead_letter' else 'failed' end,d.provider_code,v_error,p_http_status);
 return jsonb_build_object('accepted',true,'status',d.status,'id',d.id,'retryable',not v_terminal and d.status='retry_wait');
end $$;

alter function qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer) owner to qarar_governance_executor;
revoke all on function qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function qarar_governance.fail_notification_delivery(uuid,uuid,text,text,integer) to qarar_api_executor;

commit;
