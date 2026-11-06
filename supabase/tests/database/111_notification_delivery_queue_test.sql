-- Provider-neutral notification delivery queue. The domain outbox is fanned
-- out atomically before any external provider is contacted.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;
create extension if not exists pgtap;
select plan(16);

insert into qarar_core.organizations(id,code,name_ar)
values ('b1000000-0000-0000-0000-000000000001','s111','Notification delivery');
insert into auth.users(id,email) values
('b1000000-0000-0000-0000-000000000011','recipient@s111.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,mobile)
values ('b1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000001','recipient@s111.test','المستلم','+967771234567');
insert into qarar_governance.notification_outbox(
 id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status,attempts,
 locked_at,locked_by_worker_id,lock_token,lease_expires_at,last_attempt_at
) values (
 'b1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000001','meeting',
 'b1000000-0000-0000-0000-000000000031','meeting.invitation.requested',
 '{"recipient_user_id":"b1000000-0000-0000-0000-000000000011","meeting_id":"b1000000-0000-0000-0000-000000000031"}',
 's111-invite','processing',1,clock_timestamp(),'b1000000-0000-0000-0000-000000000041',
 'b1000000-0000-0000-0000-000000000051',clock_timestamp()+interval '5 minutes',clock_timestamp()
);

select has_table('qarar_governance','notification_deliveries','provider-neutral delivery queue exists');
select has_table('qarar_governance','notification_delivery_attempts','append-only delivery attempts exist');
select has_function('api_v1','service_materialize_notification_delivery',array['uuid','uuid','text','text','text','text','jsonb'],'atomic fan-out facade exists');
select has_function('api_v1','service_claim_notification_deliveries',array['uuid','uuid','text','integer','integer'],'delivery claim facade exists');
select has_function('api_v1','service_complete_notification_delivery',array['uuid','uuid','text','text'],'delivery completion facade exists');
select has_function('api_v1','service_fail_notification_delivery',array['uuid','uuid','text','text','integer'],'delivery failure facade exists');
select ok(
 has_function_privilege('service_role','api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb)','execute')
 and not has_function_privilege('authenticated','api_v1.service_materialize_notification_delivery(uuid,uuid,text,text,text,text,jsonb)','execute'),
 'only the service role can materialize delivery work');

create function pg_temp.s111_outbox_status() returns text language sql security definer set search_path=pg_catalog as
$$select status from qarar_governance.notification_outbox where id='b1000000-0000-0000-0000-000000000021'$$;
create function pg_temp.s111_delivery() returns jsonb language sql security definer set search_path=pg_catalog as
$$select to_jsonb(d) from qarar_governance.notification_deliveries d where outbox_event_id='b1000000-0000-0000-0000-000000000021'$$;
create function pg_temp.s111_delivery_count() returns integer language sql security definer set search_path=pg_catalog as
$$select count(*)::integer from qarar_governance.notification_deliveries where outbox_event_id='b1000000-0000-0000-0000-000000000021'$$;
create function pg_temp.s111_attempt_count() returns integer language sql security definer set search_path=pg_catalog as
$$select count(*)::integer from qarar_governance.notification_delivery_attempts where delivery_id=(select id from qarar_governance.notification_deliveries where outbox_event_id='b1000000-0000-0000-0000-000000000021')$$;

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';
select is(
 api_v1.service_materialize_notification_delivery(
  'b1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000051',
  'whatsapp','meeting_invitation','v1','+967771234567','{"meeting_title":"اجتماع الاختبار"}'
 )->>'status','queued','fan-out creates a queued delivery');
select is(pg_temp.s111_outbox_status(),'processed','fan-out acknowledges the source event atomically');
select is(pg_temp.s111_delivery_count(),1,'one event produces one idempotent channel delivery');
select is(
 api_v1.service_materialize_notification_delivery(
  'b1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000051',
  'whatsapp','meeting_invitation','v1','+967771234567','{"meeting_title":"اجتماع الاختبار"}'
 )->>'status','queued','replayed fan-out returns the existing delivery');
select is(pg_temp.s111_delivery_count(),1,'replay does not duplicate delivery');

select is((select status from api_v1.service_claim_notification_deliveries(
 'b1000000-0000-0000-0000-000000000041','b1000000-0000-0000-0000-000000000052','whatsapp',1,60)),'processing','channel worker claims queued delivery');
select is(api_v1.service_complete_notification_delivery(
 (pg_temp.s111_delivery()->>'id')::uuid,
 'b1000000-0000-0000-0000-000000000052','openwa','msg-111')->>'status','accepted','provider acceptance is recorded');
select is(pg_temp.s111_attempt_count(),1,'successful attempt is append-only');
select is(pg_temp.s111_delivery()->>'destination_masked','+967******567','only a masked destination is retained for operations');

select * from finish();
rollback;
