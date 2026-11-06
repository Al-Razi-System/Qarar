-- Dispatcher resolves only the event recipient and terminally skips bad destinations.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;
create extension if not exists pgtap;
select plan(7);
insert into qarar_core.organizations(id,code,name_ar) values('b3000000-0000-0000-0000-000000000001','s113','Dispatch context');
insert into auth.users(id,email) values('b3000000-0000-0000-0000-000000000011','recipient@s113.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,mobile) values('b3000000-0000-0000-0000-000000000011','b3000000-0000-0000-0000-000000000001','recipient@s113.test','المستلم',null);
insert into qarar_governance.notification_outbox(id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status,attempts,locked_at,locked_by_worker_id,lock_token,lease_expires_at,last_attempt_at)
values('b3000000-0000-0000-0000-000000000021','b3000000-0000-0000-0000-000000000001','action_item','b3000000-0000-0000-0000-000000000031','execution.task.created','{"recipient_user_id":"b3000000-0000-0000-0000-000000000011","recipient_role":"assignee","action_no":"TSK-1","title_ar":"اختبار"}','s113','processing',1,now(),'b3000000-0000-0000-0000-000000000041','b3000000-0000-0000-0000-000000000051',now()+interval '5 minutes',now());
select has_function('api_v1','service_get_notification_dispatch_context',array['uuid','uuid'],'service-only recipient resolver exists');
select has_function('api_v1','service_skip_notification_delivery',array['uuid','uuid','text','text','text','text'],'terminal skip facade exists');
select ok(has_function_privilege('service_role','api_v1.service_get_notification_dispatch_context(uuid,uuid)','execute') and not has_function_privilege('authenticated','api_v1.service_get_notification_dispatch_context(uuid,uuid)','execute'),'browser cannot resolve notification phone numbers');
create function pg_temp.s113_state() returns jsonb language sql security definer set search_path=pg_catalog as $$select jsonb_build_object('event',(select status from qarar_governance.notification_outbox where id='b3000000-0000-0000-0000-000000000021'),'delivery',(select status from qarar_governance.notification_deliveries where outbox_event_id='b3000000-0000-0000-0000-000000000021'),'reason',(select last_error_code from qarar_governance.notification_deliveries where outbox_event_id='b3000000-0000-0000-0000-000000000021'))$$;
set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is(api_v1.service_get_notification_dispatch_context('b3000000-0000-0000-0000-000000000021','b3000000-0000-0000-0000-000000000051')->>'recipient_name_ar','المستلم','resolver returns only the leased event recipient');
select is(api_v1.service_skip_notification_delivery('b3000000-0000-0000-0000-000000000021','b3000000-0000-0000-0000-000000000051','whatsapp','task_created_assignee','v1','DESTINATION_MISSING')->>'status','skipped','missing destination becomes a terminal skip');
select is(pg_temp.s113_state()->>'event','processed','skipping acknowledges the source event');
select is(pg_temp.s113_state()->>'reason','DESTINATION_MISSING','skip reason remains operationally visible');
select * from finish();
rollback;
