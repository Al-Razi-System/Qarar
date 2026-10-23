-- Task recipients and due-date reminders are domain events, not provider calls.
-- Impact map: docs/engineering/impact/WHATSAPP_NOTIFICATIONS_AR.md
begin;
create extension if not exists pgtap;
select plan(9);

insert into public.organizations(id,code,name_ar) values
('b2000000-0000-0000-0000-000000000001','s112','Task notifications');
insert into auth.users(id,email) values
('b2000000-0000-0000-0000-000000000011','issuer@s112.test'),
('b2000000-0000-0000-0000-000000000012','assignee@s112.test'),
('b2000000-0000-0000-0000-000000000013','follower@s112.test');
insert into public.users(id,organization_id,email,full_name_ar,mobile) values
('b2000000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000001','issuer@s112.test','المصدر','+967770000011'),
('b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000001','assignee@s112.test','المكلف','+967770000012'),
('b2000000-0000-0000-0000-000000000013','b2000000-0000-0000-0000-000000000001','follower@s112.test','المتابع','+967770000013');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('b2000000-0000-0000-0000-000000000021','b2000000-0000-0000-0000-000000000001','s112_council','مجلس');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar) values
('b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000021','s112_unit','مجلس الاختبار');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000001','TOP-S112','موضوع','b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000011','approved');
insert into public.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,decision_status,issued_by_user_id) values
('b2000000-0000-0000-0000-000000000041','b2000000-0000-0000-0000-000000000001','DEC-S112','b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000022','قرار','approved','b2000000-0000-0000-0000-000000000011');

select has_function('qarar_execution','generate_action_item_notification_events',array['date','integer'],'idempotent reminder producer exists');

insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar,due_date) values
('b2000000-0000-0000-0000-000000000051','b2000000-0000-0000-0000-000000000001','TSK-S112-1','b2000000-0000-0000-0000-000000000041','b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000013','مهمة قريبة',current_date+2),
('b2000000-0000-0000-0000-000000000052','b2000000-0000-0000-0000-000000000001','TSK-S112-2','b2000000-0000-0000-0000-000000000041','b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000012','مهمة لنفس الشخص',current_date-1),
('b2000000-0000-0000-0000-000000000053','b2000000-0000-0000-0000-000000000001','TSK-S112-3','b2000000-0000-0000-0000-000000000041','b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000013','مهمة مكتملة',current_date-1);
update qarar_execution.action_items set status='completed',progress_percent=100,completed_at=now() where id='b2000000-0000-0000-0000-000000000053';

select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000051' and event_type='execution.task.created'),2,'creation notifies assignee and distinct follower');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000052' and event_type='execution.task.created'),1,'same assignee and follower receives one creation event');
select is((select payload->>'recipient_role' from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000051' and payload->>'recipient_user_id'='b2000000-0000-0000-0000-000000000013'),'follower','recipient role is explicit in payload');

select is(qarar_execution.generate_action_item_notification_events(current_date,3),3,'scheduler creates due-soon and overdue events for open-task recipients');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000051' and event_type='execution.task.due_soon'),2,'due-soon reaches assignee and follower');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000052' and event_type='execution.task.overdue'),1,'overdue deduplicates the same recipient');
select is((select count(*)::integer from qarar_governance.notification_outbox where aggregate_id='b2000000-0000-0000-0000-000000000053' and event_type in ('execution.task.due_soon','execution.task.overdue')),0,'completed task produces no reminder');
select is(qarar_execution.generate_action_item_notification_events(current_date,3),0,'repeated scheduler run produces no duplicates');

select * from finish();
rollback;
