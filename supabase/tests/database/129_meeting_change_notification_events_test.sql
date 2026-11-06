-- Sent invitations produce one provider-neutral update per original invitee.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;
create extension if not exists pgtap;
select plan(8);

select has_trigger('qarar_meetings','meetings','meeting_record_change_notification_events','meeting schedule/cancellation trigger exists');
select has_trigger('qarar_meetings','agenda_items','meeting_agenda_change_notification_events','agenda update trigger exists');
select matches((select prosrc from pg_proc where oid='qarar_governance.claim_whatsapp_notification_outbox(uuid,uuid,integer,integer)'::regprocedure),'meeting\.invitation\.updated','WhatsApp worker can claim invitation updates');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context(uuid,uuid)'::regprocedure),'meeting_cancelled','cancellation template policy is resolved');

insert into public.organizations(id,code,name_ar) values
('bd000000-0000-0000-0000-000000000001','s129','Meeting change notifications');
insert into auth.users(id,email) values
('bd000000-0000-0000-0000-000000000011','issuer@s129.test'),
('bd000000-0000-0000-0000-000000000012','member@s129.test');
insert into public.users(id,organization_id,email,full_name_ar,mobile) values
('bd000000-0000-0000-0000-000000000011','bd000000-0000-0000-0000-000000000001','issuer@s129.test','منشئ الاجتماع','+967770000011'),
('bd000000-0000-0000-0000-000000000012','bd000000-0000-0000-0000-000000000001','member@s129.test','العضو المدعو','+967770000012');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('bd000000-0000-0000-0000-000000000021','bd000000-0000-0000-0000-000000000001','s129_council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('bd000000-0000-0000-0000-000000000022','bd000000-0000-0000-0000-000000000001','bd000000-0000-0000-0000-000000000021','s129_unit','مجلس التغيير');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('bd000000-0000-0000-0000-000000000031','bd000000-0000-0000-0000-000000000001','TOP-S129-1','البند الأول','bd000000-0000-0000-0000-000000000022','bd000000-0000-0000-0000-000000000011','approved'),
('bd000000-0000-0000-0000-000000000032','bd000000-0000-0000-0000-000000000001','TOP-S129-2','البند الثاني','bd000000-0000-0000-0000-000000000022','bd000000-0000-0000-0000-000000000011','approved');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,start_time,end_time,status,created_by_user_id,schedule_date_confirmed) values
('bd000000-0000-0000-0000-000000000041','bd000000-0000-0000-0000-000000000001','MTG-S129','bd000000-0000-0000-0000-000000000022','اجتماع قابل للتحديث','2026-11-01','10:00','11:00','scheduled','bd000000-0000-0000-0000-000000000011',true);
insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key) values
('bd000000-0000-0000-0000-000000000001','meeting','bd000000-0000-0000-0000-000000000041','meeting.invitation.requested','{"recipient_user_id":"bd000000-0000-0000-0000-000000000012"}','s129-invitation');

insert into qarar_meetings.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('bd000000-0000-0000-0000-000000000051','bd000000-0000-0000-0000-000000000001','bd000000-0000-0000-0000-000000000041','bd000000-0000-0000-0000-000000000031',1),
('bd000000-0000-0000-0000-000000000052','bd000000-0000-0000-0000-000000000001','bd000000-0000-0000-0000-000000000041','bd000000-0000-0000-0000-000000000032',2);
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='bd000000-0000-0000-0000-000000000041' and event_type='meeting.invitation.updated'),1,'one transaction with two agenda rows creates one update per invitee');

update qarar_meetings.meetings set scheduled_date='2026-11-03',start_time='12:00' where id='bd000000-0000-0000-0000-000000000041';
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='bd000000-0000-0000-0000-000000000041' and event_type='meeting.postponed'),1,'schedule change notifies the original invitee once');

update qarar_meetings.meetings set status='cancelled' where id='bd000000-0000-0000-0000-000000000041';
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='bd000000-0000-0000-0000-000000000041' and event_type='meeting.cancelled'),1,'cancellation notifies the original invitee once');
select is((select count(*)::integer from qarar_governance.notification_outbox where organization_id='bd000000-0000-0000-0000-000000000001' and event_type like 'minutes.%'),0,'meeting changes still emit no minutes approval notification');

select * from finish();
rollback;
