-- Meeting reminders and task transitions emit provider-neutral, idempotent events.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;
create extension if not exists pgtap;
select plan(14);

select has_function('qarar_meetings','generate_meeting_notification_events',array['date','integer'],'meeting reminder producer exists');
select has_function('qarar_execution','enqueue_action_item_transition_notifications',array[]::text[],'task transition producer exists');

insert into public.organizations(id,code,name_ar) values
('b5000000-0000-0000-0000-000000000001','s115','Meeting notifications');
insert into auth.users(id,email) values
('b5000000-0000-0000-0000-000000000011','creator@s115.test'),
('b5000000-0000-0000-0000-000000000012','chair@s115.test'),
('b5000000-0000-0000-0000-000000000013','rapporteur@s115.test'),
('b5000000-0000-0000-0000-000000000014','member@s115.test');
insert into public.users(id,organization_id,email,full_name_ar,mobile) values
('b5000000-0000-0000-0000-000000000011','b5000000-0000-0000-0000-000000000001','creator@s115.test','المنشئ','+967770000011'),
('b5000000-0000-0000-0000-000000000012','b5000000-0000-0000-0000-000000000001','chair@s115.test','الرئيس','+967770000012'),
('b5000000-0000-0000-0000-000000000013','b5000000-0000-0000-0000-000000000001','rapporteur@s115.test','المقرر','+967770000013'),
('b5000000-0000-0000-0000-000000000014','b5000000-0000-0000-0000-000000000001','member@s115.test','العضو','+967770000014');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('b5000000-0000-0000-0000-000000000021','b5000000-0000-0000-0000-000000000001','s115_council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('b5000000-0000-0000-0000-000000000022','b5000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000021','s115_unit','مجلس الاختبار');
insert into public.roles(organization_id,code,name_ar,role_scope)
values('b5000000-0000-0000-0000-000000000001','council_member','عضو','governance_unit')
on conflict(organization_id,code) do nothing;
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date)
select membership_id,'b5000000-0000-0000-0000-000000000001',user_id,'b5000000-0000-0000-0000-000000000022',r.id,current_date-10
from (values
 ('b5000000-0000-0000-0000-000000000041'::uuid,'b5000000-0000-0000-0000-000000000012'::uuid,'council_chair'),
 ('b5000000-0000-0000-0000-000000000042'::uuid,'b5000000-0000-0000-0000-000000000013'::uuid,'council_rapporteur'),
 ('b5000000-0000-0000-0000-000000000043'::uuid,'b5000000-0000-0000-0000-000000000014'::uuid,'council_member')
) v(membership_id,user_id,role_code)
join public.roles r on r.organization_id='b5000000-0000-0000-0000-000000000001' and r.code=v.role_code;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,start_time,end_time,status,created_by_user_id,planned_window_start,planned_window_end,schedule_date_confirmed) values
('b5000000-0000-0000-0000-000000000051','b5000000-0000-0000-0000-000000000001','MEET-S115-1','b5000000-0000-0000-0000-000000000022','اجتماع قريب',current_date+1,'10:00','11:00','scheduled','b5000000-0000-0000-0000-000000000011',current_date,current_date+2,true),
('b5000000-0000-0000-0000-000000000052','b5000000-0000-0000-0000-000000000001','MEET-S115-2','b5000000-0000-0000-0000-000000000022','دورة قاربت الانتهاء',current_date+2,null,null,'draft','b5000000-0000-0000-0000-000000000011',current_date-3,current_date+1,false),
('b5000000-0000-0000-0000-000000000053','b5000000-0000-0000-0000-000000000001','MEET-S115-3','b5000000-0000-0000-0000-000000000022','دورة منتهية',current_date-2,null,null,'draft','b5000000-0000-0000-0000-000000000011',current_date-6,current_date-1,false);

select cmp_ok(qarar_meetings.generate_meeting_notification_events(current_date,2),'>=',7,'scheduler creates at least the fixture events while shared development records may also be due');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000051' and event_type='meeting.reminder.due'),3,'meeting reminder reaches all active members');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000052' and event_type='meeting.cycle.due_soon'),2,'cycle due-soon reaches chair and rapporteur only');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000053' and event_type='meeting.cycle.overdue'),2,'overdue cycle reaches chair and rapporteur only');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id in('b5000000-0000-0000-0000-000000000052','b5000000-0000-0000-0000-000000000053') and event_type like 'meeting.cycle.%' and payload->>'recipient_user_id'='b5000000-0000-0000-0000-000000000014'),0,'ordinary members do not receive council-cycle administration alerts');
select is(qarar_meetings.generate_meeting_notification_events(current_date,2),0,'meeting scheduler is idempotent');
select is((select count(*)::integer from qarar_governance.notification_outbox where event_type like 'minutes.%' and organization_id='b5000000-0000-0000-0000-000000000001'),0,'minutes approval never emits WhatsApp events');

insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('b5000000-0000-0000-0000-000000000061','b5000000-0000-0000-0000-000000000001','TOP-S115','موضوع','b5000000-0000-0000-0000-000000000022','b5000000-0000-0000-0000-000000000011','approved');
insert into public.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,decision_status,issued_by_user_id) values
('b5000000-0000-0000-0000-000000000062','b5000000-0000-0000-0000-000000000001','DEC-S115','b5000000-0000-0000-0000-000000000061','b5000000-0000-0000-0000-000000000022','قرار','approved','b5000000-0000-0000-0000-000000000011');
insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar) values
('b5000000-0000-0000-0000-000000000071','b5000000-0000-0000-0000-000000000001','TSK-S115','b5000000-0000-0000-0000-000000000062','b5000000-0000-0000-0000-000000000061','b5000000-0000-0000-0000-000000000014','b5000000-0000-0000-0000-000000000013','مهمة انتقالات');
update qarar_execution.action_items set status='submitted' where id='b5000000-0000-0000-0000-000000000071';
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000071' and event_type='execution.task.submitted'),1,'submission notifies follower');
update qarar_execution.action_items set status='in_progress' where id='b5000000-0000-0000-0000-000000000071';
select is((select payload->>'recipient_user_id' from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000071' and event_type='execution.task.returned'),'b5000000-0000-0000-0000-000000000014','return notifies assignee');
update qarar_execution.action_items set status='submitted' where id='b5000000-0000-0000-0000-000000000071';
update qarar_execution.action_items set status='completed',progress_percent=100 where id='b5000000-0000-0000-0000-000000000071';
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000071' and event_type='execution.task.completed'),2,'verified completion notifies assignee and follower');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000071' and event_type='execution.task.returned'),1,'normal status changes do not duplicate return event');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b5000000-0000-0000-0000-000000000071' and event_type like 'execution.task.%'),7,'task lifecycle events remain deduplicated per recipient and transition');

select * from finish();
rollback;
