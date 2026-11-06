-- An ambiguous provider timeout may already have delivered the message and must
-- never enter automatic retry. Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;
create extension if not exists pgtap;
select plan(8);

insert into qarar_core.organizations(id,code,name_ar)
values ('b4000000-0000-0000-0000-000000000001','s114','Ambiguous delivery');
insert into auth.users(id,email) values
('b4000000-0000-0000-0000-000000000011','recipient@s114.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,mobile)
values ('b4000000-0000-0000-0000-000000000011','b4000000-0000-0000-0000-000000000001','recipient@s114.test','المستلم','+967771234567');
insert into qarar_governance.notification_outbox(id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status)
values ('b4000000-0000-0000-0000-000000000021','b4000000-0000-0000-0000-000000000001','action_item','b4000000-0000-0000-0000-000000000031','execution.task.created','{"recipient_user_id":"b4000000-0000-0000-0000-000000000011"}','s114','processed');
insert into qarar_governance.notification_deliveries(id,organization_id,outbox_event_id,recipient_user_id,channel,template_code,template_version,destination,destination_masked,status,attempts,locked_at,locked_by_worker_id,lock_token,lease_expires_at)
values ('b4000000-0000-0000-0000-000000000061','b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000021','b4000000-0000-0000-0000-000000000011','whatsapp','task_created_assignee','v1','+967771234567','+967******567','processing',1,clock_timestamp(),'b4000000-0000-0000-0000-000000000041','b4000000-0000-0000-0000-000000000051',clock_timestamp()+interval '5 minutes');

select has_function('api_v1','service_mark_notification_delivery_ambiguous',array['uuid','uuid','text','text'],'ambiguous delivery facade exists');
select ok(has_function_privilege('service_role','api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text)','execute'),'service role may quarantine an ambiguous delivery');
select ok(not has_function_privilege('authenticated','api_v1.service_mark_notification_delivery_ambiguous(uuid,uuid,text,text)','execute'),'browser roles cannot quarantine deliveries');

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is(api_v1.service_mark_notification_delivery_ambiguous('b4000000-0000-0000-0000-000000000061','b4000000-0000-0000-0000-000000000051','OPENWA_TIMEOUT','openwa')->>'status','failed','ambiguous result becomes terminal failed');
reset role;

select is((select status from qarar_governance.notification_deliveries where id='b4000000-0000-0000-0000-000000000061'),'failed','delivery is terminal');
select is((select last_error_code from qarar_governance.notification_deliveries where id='b4000000-0000-0000-0000-000000000061'),'OPENWA_TIMEOUT_AMBIGUOUS','operator can distinguish an uncertain outcome');
select is((select outcome from qarar_governance.notification_delivery_attempts where delivery_id='b4000000-0000-0000-0000-000000000061'),'failed','attempt audit is terminal rather than retry');

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is((select count(*)::integer from api_v1.service_claim_notification_deliveries('b4000000-0000-0000-0000-000000000041','b4000000-0000-0000-0000-000000000052','whatsapp',10,60)),0,'ambiguous delivery is never reclaimed automatically');

select * from finish();
rollback;
