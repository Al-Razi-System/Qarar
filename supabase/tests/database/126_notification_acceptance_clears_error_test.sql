begin;
create extension if not exists pgtap;
select plan(2);
insert into qarar_core.organizations(id,code,name_ar) values('b9000000-0000-0000-0000-000000000001','s126','Accepted delivery cleanup');
insert into auth.users(id,email) values('b9000000-0000-0000-0000-000000000011','recipient@s126.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,mobile) values('b9000000-0000-0000-0000-000000000011','b9000000-0000-0000-0000-000000000001','recipient@s126.test','مستلم الاختبار','+967771234567');
insert into qarar_governance.notification_outbox(id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status)
values('b9000000-0000-0000-0000-000000000021','b9000000-0000-0000-0000-000000000001','meeting','b9000000-0000-0000-0000-000000000031','meeting.invitation.requested','{}','s126','processed');
insert into qarar_governance.notification_deliveries(id,organization_id,outbox_event_id,recipient_user_id,channel,template_code,template_version,destination,destination_masked,status,attempts,last_error_code,locked_at,locked_by_worker_id,lock_token,lease_expires_at)
values('b9000000-0000-0000-0000-000000000061','b9000000-0000-0000-0000-000000000001','b9000000-0000-0000-0000-000000000021','b9000000-0000-0000-0000-000000000011','whatsapp','meeting_invitation','v1','+967771234567','+967******567','processing',2,'OPENWA_TIMEOUT_AMBIGUOUS',clock_timestamp(),'b9000000-0000-0000-0000-000000000041','b9000000-0000-0000-0000-000000000051',clock_timestamp()+interval '5 minutes');
set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is(api_v1.service_complete_notification_delivery('b9000000-0000-0000-0000-000000000061','b9000000-0000-0000-0000-000000000051','openwa','receipt-126')->>'status','accepted','provider receipt accepts reconciled delivery');
reset role;
select is((select last_error_code from qarar_governance.notification_deliveries where id='b9000000-0000-0000-0000-000000000061'),null,'accepted delivery no longer exposes a stale failure');
select * from finish();
rollback;
