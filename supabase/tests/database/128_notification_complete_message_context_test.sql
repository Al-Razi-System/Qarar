-- Messages receive complete authoritative context without vote data.
-- Impact map: docs/engineering/impact/WHATSAPP_MESSAGE_CONTENT_20261027_AR.md
begin;
create extension if not exists pgtap;
select plan(11);

select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context_base(uuid,uuid)'::regprocedure),'agenda_titles','meeting agenda titles are enriched');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context_base(uuid,uuid)'::regprocedure),'return_reason','task return reason is enriched');
select matches((select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context_base(uuid,uuid)'::regprocedure),'requires_evidence','task evidence requirement is enriched');
select ok(position('qarar_voting' in (select prosrc from pg_proc where oid='qarar_governance.get_notification_dispatch_context_base(uuid,uuid)'::regprocedure))=0,'dispatch context does not read voting data');

insert into public.organizations(id,code,name_ar) values
('bc000000-0000-0000-0000-000000000001','s128','Complete notification context');
insert into auth.users(id,email) values
('bc000000-0000-0000-0000-000000000011','issuer@s128.test'),
('bc000000-0000-0000-0000-000000000012','assignee@s128.test'),
('bc000000-0000-0000-0000-000000000013','follower@s128.test');
insert into public.users(id,organization_id,email,full_name_ar,mobile) values
('bc000000-0000-0000-0000-000000000011','bc000000-0000-0000-0000-000000000001','issuer@s128.test','مصدر القرار','+967770000011'),
('bc000000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000001','assignee@s128.test','المكلّف الفعلي','+967770000012'),
('bc000000-0000-0000-0000-000000000013','bc000000-0000-0000-0000-000000000001','follower@s128.test','المتابع الفعلي','+967770000013');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('bc000000-0000-0000-0000-000000000021','bc000000-0000-0000-0000-000000000001','s128_council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('bc000000-0000-0000-0000-000000000022','bc000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000021','s128_unit','مجلس السياق');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('bc000000-0000-0000-0000-000000000031','bc000000-0000-0000-0000-000000000001','TOP-S128-1','البند الأول','bc000000-0000-0000-0000-000000000022','bc000000-0000-0000-0000-000000000011','approved'),
('bc000000-0000-0000-0000-000000000032','bc000000-0000-0000-0000-000000000001','TOP-S128-2','البند الثاني','bc000000-0000-0000-0000-000000000022','bc000000-0000-0000-0000-000000000011','approved');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,start_time,end_time,status,created_by_user_id,schedule_date_confirmed) values
('bc000000-0000-0000-0000-000000000041','bc000000-0000-0000-0000-000000000001','MTG-S128','bc000000-0000-0000-0000-000000000022','اجتماع مصدر التكليف','2026-10-27','10:00','11:00','scheduled','bc000000-0000-0000-0000-000000000011',true);
insert into qarar_meetings.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('bc000000-0000-0000-0000-000000000051','bc000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000041','bc000000-0000-0000-0000-000000000031',1),
('bc000000-0000-0000-0000-000000000052','bc000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000041','bc000000-0000-0000-0000-000000000032',2);
insert into public.decisions(id,organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,issued_by_user_id) values
('bc000000-0000-0000-0000-000000000061','bc000000-0000-0000-0000-000000000001','DEC-S128','bc000000-0000-0000-0000-000000000031','bc000000-0000-0000-0000-000000000041','bc000000-0000-0000-0000-000000000051','bc000000-0000-0000-0000-000000000022','قرار الاختبار','approved','bc000000-0000-0000-0000-000000000011');
insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar,description,due_date,requires_evidence) values
('bc000000-0000-0000-0000-000000000071','bc000000-0000-0000-0000-000000000001','TSK-S128','bc000000-0000-0000-0000-000000000061','bc000000-0000-0000-0000-000000000031','bc000000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000013','مهمة كاملة','نفذ كل تفاصيل المهمة.',current_date+3,true);
insert into qarar_execution.action_item_events(organization_id,action_item_id,event_type,progress_percent,note,actor_user_id) values
('bc000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000071','return',40,'أكمل المرفق الناقص.','bc000000-0000-0000-0000-000000000013');

insert into qarar_governance.notification_outbox(id,organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key,status,attempts,locked_at,locked_by_worker_id,lock_token,lease_expires_at,last_attempt_at) values
('bc000000-0000-0000-0000-000000000081','bc000000-0000-0000-0000-000000000001','meeting','bc000000-0000-0000-0000-000000000041','meeting.invitation.requested','{"recipient_user_id":"bc000000-0000-0000-0000-000000000012"}','s128-meeting','processing',1,clock_timestamp(),'bc000000-0000-0000-0000-000000000091','bc000000-0000-0000-0000-000000000092',clock_timestamp()+interval '5 minutes',clock_timestamp()),
('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000001','action_item','bc000000-0000-0000-0000-000000000071','execution.task.returned','{"recipient_user_id":"bc000000-0000-0000-0000-000000000012","recipient_role":"assignee"}','s128-task','processing',1,clock_timestamp(),'bc000000-0000-0000-0000-000000000091','bc000000-0000-0000-0000-000000000093',clock_timestamp()+interval '5 minutes',clock_timestamp());

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000081','bc000000-0000-0000-0000-000000000092')#>>'{payload,agenda_titles,0}','البند الأول','invitation contains first agenda title in order');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000081','bc000000-0000-0000-0000-000000000092')#>>'{payload,agenda_titles,1}','البند الثاني','invitation contains second agenda title in order');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000093')#>>'{payload,meeting_no}','MTG-S128','task contains source meeting reference');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000093')#>>'{payload,follow_up_user_name_ar}','المتابع الفعلي','task contains follower name');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000093')#>>'{payload,assigned_user_name_ar}','المكلّف الفعلي','follower context contains assignee name');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000093')#>>'{payload,return_reason}','أكمل المرفق الناقص.','returned task contains latest authoritative reason');
select is(api_v1.service_get_notification_dispatch_context('bc000000-0000-0000-0000-000000000082','bc000000-0000-0000-0000-000000000093')#>>'{payload,requires_evidence}','true','task contains evidence requirement');

select * from finish();
rollback;
