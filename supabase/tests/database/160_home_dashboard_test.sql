begin;
create extension if not exists pgtap;
select plan(14);

insert into qarar_core.organizations(id,code,name_ar) values('60000000-0000-0000-0000-000000000001','hm160','الرئيسية');
insert into auth.users(id,email) select ('60000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@hm160.test' from generate_series(1,3) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('60000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000001','u1@hm160.test','أمل',false),
('60000000-0000-0000-0000-000000000102','60000000-0000-0000-0000-000000000001','u2@hm160.test','وليد',false),
('60000000-0000-0000-0000-000000000103','60000000-0000-0000-0000-000000000001','u3@hm160.test','مسؤول النظام',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('60000000-0000-0000-0000-000000000201','60000000-0000-0000-0000-000000000001','o160','وحدة',false),
('60000000-0000-0000-0000-000000000202','60000000-0000-0000-0000-000000000001','c160','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('60000000-0000-0000-0000-000000000401','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000201','root','الجامعة','active');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,scope_unit_id,code,name_ar,status) values
('60000000-0000-0000-0000-000000000501','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000202','60000000-0000-0000-0000-000000000401','c','مجلس الكلية','active'),
('60000000-0000-0000-0000-000000000502','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000202','60000000-0000-0000-0000-000000000401','c2','مجلس القسم','active');
delete from qarar_iam.roles where organization_id='60000000-0000-0000-0000-000000000001' and code in ('council_member','council_chair');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('60000000-0000-0000-0000-000000000601','60000000-0000-0000-0000-000000000001','council_member','عضو','governance_unit'),
('60000000-0000-0000-0000-000000000602','60000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date) values
('60000000-0000-0000-0000-000000000701','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000501','60000000-0000-0000-0000-000000000601',current_date-30),
('60000000-0000-0000-0000-000000000702','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000502','60000000-0000-0000-0000-000000000602',current_date-30),
('60000000-0000-0000-0000-000000000703','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000102','60000000-0000-0000-0000-000000000501','60000000-0000-0000-0000-000000000601',current_date-30);
insert into qarar_iam.oversight_assignments(organization_id,holder_kind,holder_user_id,target_mode,root_unit_id,request_id) values
('60000000-0000-0000-0000-000000000001','user','60000000-0000-0000-0000-000000000101','subtree','60000000-0000-0000-0000-000000000401',gen_random_uuid());

-- The records each card counts. Guard triggers are paused for these rows: this test reads them, it does not create them.
set local session_replication_role = replica;
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,status,current_unit_id) values
('60000000-0000-0000-0000-000000000801','60000000-0000-0000-0000-000000000001','T-1','خطة الكلية','60000000-0000-0000-0000-000000000102','listed','60000000-0000-0000-0000-000000000501'),
('60000000-0000-0000-0000-000000000802','60000000-0000-0000-0000-000000000001','T-2','طلب أُعيد','60000000-0000-0000-0000-000000000101','returned',null),
('60000000-0000-0000-0000-000000000803','60000000-0000-0000-0000-000000000001','T-3','موضوع للمراجعة','60000000-0000-0000-0000-000000000102','under_review','60000000-0000-0000-0000-000000000502'),
('60000000-0000-0000-0000-000000000804','60000000-0000-0000-0000-000000000001','T-4','بند ثانٍ','60000000-0000-0000-0000-000000000102','listed','60000000-0000-0000-0000-000000000501');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('60000000-0000-0000-0000-000000000901','60000000-0000-0000-0000-000000000001','M-1','60000000-0000-0000-0000-000000000501','الاجتماع القادم',current_date+3,'60000000-0000-0000-0000-000000000103','scheduled'),
('60000000-0000-0000-0000-000000000902','60000000-0000-0000-0000-000000000001','M-2','60000000-0000-0000-0000-000000000501','الجلسة الجارية',current_date,'60000000-0000-0000-0000-000000000103','in_progress'),
('60000000-0000-0000-0000-000000000903','60000000-0000-0000-0000-000000000001','M-3','60000000-0000-0000-0000-000000000501','اجتماع بانتظار المصادقة',current_date-5,'60000000-0000-0000-0000-000000000103','waiting_for_approval'),
('60000000-0000-0000-0000-000000000904','60000000-0000-0000-0000-000000000001','M-4','60000000-0000-0000-0000-000000000501','اجتماع بعيد',current_date+60,'60000000-0000-0000-0000-000000000103','scheduled'),
('60000000-0000-0000-0000-000000000905','60000000-0000-0000-0000-000000000001','M-5','60000000-0000-0000-0000-000000000501','جلسة جارية ثانية',current_date,'60000000-0000-0000-0000-000000000103','in_progress');
insert into qarar_meetings.agenda_items(id,organization_id,meeting_id,agenda_order,topic_id) values
('60000000-0000-0000-0000-000000000911','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000902',1,'60000000-0000-0000-0000-000000000801'),
('60000000-0000-0000-0000-000000000912','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000905',1,'60000000-0000-0000-0000-000000000804');
insert into qarar_voting.voting_rounds(id,organization_id,meeting_id,agenda_item_id,round_number,status,eligible_voter_count,opened_by_user_id,opened_at) values
('60000000-0000-0000-0000-000000000921','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000902','60000000-0000-0000-0000-000000000911',1,'open',2,'60000000-0000-0000-0000-000000000103',now()),
('60000000-0000-0000-0000-000000000922','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000905','60000000-0000-0000-0000-000000000912',1,'open',2,'60000000-0000-0000-0000-000000000103',now());
insert into qarar_voting.votes(organization_id,meeting_id,topic_id,user_id,membership_id,vote_value,voting_round_id) values
('60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000905','60000000-0000-0000-0000-000000000804','60000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000701','approve','60000000-0000-0000-0000-000000000922');
insert into qarar_minutes.meeting_minutes(id,organization_id,meeting_id,status) values
('60000000-0000-0000-0000-000000000931','60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000903','ready_for_approval');
insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id,approval_status) values
('60000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000931','60000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000701','pending');
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,decision_status,issued_by_user_id,issued_at) values
('60000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000001','D-1','60000000-0000-0000-0000-000000000801','60000000-0000-0000-0000-000000000501','اعتماد','approved','60000000-0000-0000-0000-000000000103',now());
insert into qarar_execution.action_items(organization_id,action_no,decision_id,topic_id,title_ar,status,due_date,assigned_user_id,follow_up_user_id) values
('60000000-0000-0000-0000-000000000001','A-1','60000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000801','مهمة متأخرة','new',current_date-2,'60000000-0000-0000-0000-000000000101',null),
('60000000-0000-0000-0000-000000000001','A-2','60000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000801','مهمة جارية','in_progress',current_date+5,'60000000-0000-0000-0000-000000000101',null),
('60000000-0000-0000-0000-000000000001','A-3','60000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000801','بانتظار تحققي','submitted',current_date+1,'60000000-0000-0000-0000-000000000102','60000000-0000-0000-0000-000000000101'),
('60000000-0000-0000-0000-000000000001','A-4','60000000-0000-0000-0000-000000000941','60000000-0000-0000-0000-000000000801','مهمة منجزة','completed',current_date-9,'60000000-0000-0000-0000-000000000101',null);
insert into qarar_governance.oversight_violations(organization_id,rule_code,council_id,subject_type,subject_id,subject_label,subject_link,due_since,detected_at) values
('60000000-0000-0000-0000-000000000001','task_overdue','60000000-0000-0000-0000-000000000501','action_item',gen_random_uuid(),'A-1 مهمة متأخرة','/admin/tasks',now()-interval '2 days',now());
set local session_replication_role = origin;

create temporary table home(who text primary key, h jsonb);
grant all on home to public;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"60000000-0000-0000-0000-000000000101","role":"authenticated"}';
insert into home select 'amal', api_v2.get_my_home_v2();
set local "request.jwt.claims"='{"sub":"60000000-0000-0000-0000-000000000102","role":"authenticated"}';
insert into home select 'walid', api_v2.get_my_home_v2();
set local "request.jwt.claims"='{"sub":"60000000-0000-0000-0000-000000000103","role":"authenticated"}';
insert into home select 'admin', api_v2.get_my_home_v2();
reset role;

select is((select (h#>>'{meetings,count}')::int from home where who='amal'),3,'upcoming and live meetings of my councils, not one two months away');
select is((select h#>>'{meetings,items,0,status}' from home where who='amal'),'in_progress','live sessions come first');
select is((select (h#>>'{votes,count}')::int from home where who='amal'),1,'an open vote I have already cast is not waiting for me');
select is((select (h#>>'{votes,count}')::int from home where who='walid'),2,'another member still has both');
select is((select (h#>>'{signatures,count}')::int from home where who='amal'),1,'minutes waiting for my signature');
select is((select (h#>>'{tasks,open}')::int||'/'||(h#>>'{tasks,overdue}') from home where who='amal'),'2/1','my open tasks, one of them overdue; a completed one is not counted');
select is((select (h#>>'{tasks,to_verify}')::int from home where who='amal'),1,'a task submitted to me for verification');
select is((select (h#>>'{tasks,open}')::int from home where who='walid'),0,'a submitted task is not the assignee''s pending action');
select is((select (h#>>'{topics,returned}')::int||'/'||(h#>>'{topics,to_review}') from home where who='amal'),'1/1','a topic returned to me, and one waiting for review in a council I chair');
select is((select (h#>>'{leadership,councils}')::int from home where who='amal'),1,'the councils I lead');
select is((select (h#>>'{oversight,open}')::int||'/'||(h#>>'{oversight,councils}') from home where who='amal'),'1/2','open violations in the councils I follow');
select is((select h->'oversight' from home where who='walid'),'null'::jsonb,'no follow-up card for someone who follows nothing');
select is((select h->'organization' from home where who='amal'),'null'::jsonb,'organisation indicators are for administrators only');
select is((select (h#>>'{organization,overdue_tasks}')::int||'/'||(h#>>'{organization,open_violations}') from home where who='admin'),'1/1','and show the organisation''s overdue tasks and open violations');

select * from finish();
rollback;
