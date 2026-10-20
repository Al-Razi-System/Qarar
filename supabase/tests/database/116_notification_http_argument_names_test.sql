-- PostgREST resolves RPC JSON keys by input argument names.
begin;
create extension if not exists pgtap;
select plan(7);

select is((select proargnames[1:7] from pg_proc where oid='api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb)'::regprocedure),array['p_event_id','p_lock_token','p_channel','p_template_code','p_template_version','p_destination','p_variables'],'materialize wrapper exposes named HTTP arguments');
select is((select proargnames[1:5] from pg_proc where oid='api_v1.service_claim_notification_deliveries(uuid,uuid,text,integer,integer)'::regprocedure),array['p_worker_id','p_lock_token','p_channel','p_limit','p_lease_seconds'],'delivery claim wrapper exposes named HTTP arguments');
select is((select proargnames[1:4] from pg_proc where oid='api_v1.service_complete_notification_delivery(uuid,uuid,text,text)'::regprocedure),array['p_delivery_id','p_lock_token','p_provider_code','p_provider_message_id'],'completion wrapper exposes named HTTP arguments');
select is((select proargnames[1:5] from pg_proc where oid='api_v1.service_fail_notification_delivery(uuid,uuid,text,text,integer)'::regprocedure),array['p_delivery_id','p_lock_token','p_error_code','p_provider_code','p_http_status'],'failure wrapper exposes named HTTP arguments');
select is((select proargnames[1:2] from pg_proc where oid='api_v1.service_get_notification_dispatch_context(uuid,uuid)'::regprocedure),array['p_event_id','p_lock_token'],'dispatch context wrapper exposes named HTTP arguments');
select is((select proargnames[1:6] from pg_proc where oid='api_v1.service_skip_notification_delivery(uuid,uuid,text,text,text,text)'::regprocedure),array['p_event_id','p_lock_token','p_channel','p_template_code','p_template_version','p_reason_code'],'skip wrapper exposes named HTTP arguments');
select is((select proargnames[1:4] from pg_proc where oid='api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text)'::regprocedure),array['p_delivery_id','p_lock_token','p_error_code','p_provider_code'],'ambiguous wrapper exposes named HTTP arguments');

select * from finish();
rollback;
