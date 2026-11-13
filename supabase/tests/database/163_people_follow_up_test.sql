begin;
create extension if not exists pgtap;
select plan(9);

create temporary table clock as
select d t, make_date(extract(year from d)::integer - case when extract(month from d) < 9 then 1 else 0 end, 9, 1) y
from (select (now() at time zone 'Asia/Riyadh')::date d) x;
grant all on clock to public;

insert into qarar_core.organizations(id,code,name_ar) values('63000000-0000-0000-0000-000000000001','pp163','الأعضاء');
insert into auth.users(id,email) select ('63000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@pp163.test' from generate_series(1,4) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('63000000-0000-0000-0000-000000000101','63000000-0000-0000-0000-000000000001','u1@pp163.test','أمل',false),
('63000000-0000-0000-0000-000000000102','63000000-0000-0000-0000-000000000001','u2@pp163.test','وليد',false),
('63000000-0000-0000-0000-000000000103','63000000-0000-0000-0000-000000000001','u3@pp163.test','سارة',false),
('63000000-0000-0000-0000-000000000104','63000000-0000-0000-0000-000000000001','u4@pp163.test','خارج النطاق',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('63000000-0000-0000-0000-000000000202','63000000-0000-0000-0000-000000000001','c163','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('63000000-0000-0000-0000-000000000501','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000202','a','مجلس الكلية','active'),
('63000000-0000-0000-0000-000000000502','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000202','b','مجلس القسم','active');
delete from qarar_iam.roles where organization_id='63000000-0000-0000-0000-000000000001' and code in ('council_member','council_chair');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('63000000-0000-0000-0000-000000000601','63000000-0000-0000-0000-000000000001','council_member','عضو','governance_unit'),
('63000000-0000-0000-0000-000000000602','63000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date) values
('63000000-0000-0000-0000-000000000701','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000101','63000000-0000-0000-0000-000000000501','63000000-0000-0000-0000-000000000602',current_date-90),
('63000000-0000-0000-0000-000000000702','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000101','63000000-0000-0000-0000-000000000501','63000000-0000-0000-0000-000000000601',current_date-90),
('63000000-0000-0000-0000-000000000703','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000102','63000000-0000-0000-0000-000000000501','63000000-0000-0000-0000-000000000601',current_date-90),
('63000000-0000-0000-0000-000000000704','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000103','63000000-0000-0000-0000-000000000501','63000000-0000-0000-0000-000000000601',current_date-90),
('63000000-0000-0000-0000-000000000705','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000104','63000000-0000-0000-0000-000000000502','63000000-0000-0000-0000-000000000601',current_date-90);

-- Guard triggers are paused: this test reads these rows, it does not create them.
set local session_replication_role = replica;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,academic_year_start,session_sequence_no,created_by_user_id,status)
select ('63000000-0000-0000-0000-00000000090'||n)::uuid,'63000000-0000-0000-0000-000000000001','P-'||n,'63000000-0000-0000-0000-000000000501','جلسة '||n,c.t-n,c.y,n,'63000000-0000-0000-0000-000000000101',st
from clock c, (values (1,'closed'),(2,'closed'),(3,'scheduled')) v(n,st);
insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status)
select '63000000-0000-0000-0000-000000000001',('63000000-0000-0000-0000-00000000090'||n)::uuid,('63000000-0000-0000-0000-00000000010'||usr)::uuid,'63000000-0000-0000-0000-000000000703',s
from (values (1,1,'present'),(2,1,'present'),(1,2,'absent'),(2,2,'absent'),(1,3,'present'),(3,3,'present')) v(n,usr,s);
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,status,current_unit_id) values
('63000000-0000-0000-0000-000000000801','63000000-0000-0000-0000-000000000001','T-1','موضوع','63000000-0000-0000-0000-000000000103','listed','63000000-0000-0000-0000-000000000501');
insert into qarar_meetings.agenda_items(id,organization_id,meeting_id,agenda_order,topic_id) values
('63000000-0000-0000-0000-000000000911','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000901',1,'63000000-0000-0000-0000-000000000801');
insert into qarar_voting.voting_rounds(id,organization_id,meeting_id,agenda_item_id,round_number,status,eligible_voter_count,opened_by_user_id,opened_at) values
('63000000-0000-0000-0000-000000000921','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000901','63000000-0000-0000-0000-000000000911',1,'closed',3,'63000000-0000-0000-0000-000000000101',now());
insert into qarar_voting.voting_eligible_members(organization_id,voting_round_id,user_id,membership_id)
select '63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000921',('63000000-0000-0000-0000-00000000010'||n)::uuid,'63000000-0000-0000-0000-000000000703' from generate_series(1,3) n;
insert into qarar_voting.votes(organization_id,meeting_id,topic_id,user_id,membership_id,vote_value,voting_round_id) values
('63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000901','63000000-0000-0000-0000-000000000801','63000000-0000-0000-0000-000000000101','63000000-0000-0000-0000-000000000701','reject','63000000-0000-0000-0000-000000000921');
insert into qarar_minutes.meeting_minutes(id,organization_id,meeting_id,status) values
('63000000-0000-0000-0000-000000000931','63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000901','ready_for_approval');
insert into qarar_minutes.minute_approvals(organization_id,minute_id,user_id,membership_id,approval_status) values
('63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000931','63000000-0000-0000-0000-000000000101','63000000-0000-0000-0000-000000000701','approved'),
('63000000-0000-0000-0000-000000000001','63000000-0000-0000-0000-000000000931','63000000-0000-0000-0000-000000000103','63000000-0000-0000-0000-000000000704','pending');
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,governance_unit_id,decision_text,decision_status,issued_by_user_id,issued_at) values
('63000000-0000-0000-0000-000000000941','63000000-0000-0000-0000-000000000001','D-1','63000000-0000-0000-0000-000000000801','63000000-0000-0000-0000-000000000901','63000000-0000-0000-0000-000000000501','اعتماد','approved','63000000-0000-0000-0000-000000000101',now());
insert into qarar_execution.action_items(organization_id,action_no,decision_id,topic_id,title_ar,status,due_date,assigned_user_id) values
('63000000-0000-0000-0000-000000000001','A-1','63000000-0000-0000-0000-000000000941','63000000-0000-0000-0000-000000000801','منجزة','completed',current_date,'63000000-0000-0000-0000-000000000101'),
('63000000-0000-0000-0000-000000000001','A-2','63000000-0000-0000-0000-000000000941','63000000-0000-0000-0000-000000000801','متأخرة','new',current_date-3,'63000000-0000-0000-0000-000000000101');
set local session_replication_role = origin;

create temporary table seen(who text primary key, f jsonb);
grant all on seen to public;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"63000000-0000-0000-0000-000000000101","role":"authenticated"}';
insert into seen select 'amal', api_v2.get_my_people_follow_up_v2((select y from clock));
set local "request.jwt.claims"='{"sub":"63000000-0000-0000-0000-000000000102","role":"authenticated"}';
insert into seen select 'walid', api_v2.get_my_people_follow_up_v2((select y from clock));
reset role;
create temporary view pp as select p from seen, jsonb_array_elements(f->'people') p where who='amal';

select is((select jsonb_agg(p->>'full_name_ar') from pp), '["أمل","سارة","وليد"]'::jsonb, 'members of my councils are listed once each, those needing attention first; other councils'' members are not shown');
select is((select p->'councils' from pp where p->>'full_name_ar'='أمل'),
  '[{"id":"63000000-0000-0000-0000-000000000501","name_ar":"مجلس الكلية","role_code":"council_chair","role_name_ar":"رئيس"}]'::jsonb, 'two roles in one council show as the higher one');
select is((select p - 'councils' - 'user_id' - 'full_name_ar' from pp where p->>'full_name_ar'='أمل'),
  '{"state":"attention","attendance":{"present":2,"recorded":2},"votes":{"eligible":1,"voted":1},"minutes":{"total":1,"signed":1,"pending":0},"tasks":{"total":2,"done":1,"overdue":1},"topics_submitted":0}'::jsonb,
  'a member''s attendance, voting, signatures and tasks; a late task needs attention');
select is((select jsonb_build_object('state', p->>'state', 'minutes', p->'minutes', 'att', p->'attendance', 'topics', p->'topics_submitted') from pp where p->>'full_name_ar'='سارة'),
  '{"state":"attention","minutes":{"total":1,"signed":0,"pending":1},"att":{"present":1,"recorded":1},"topics":1}'::jsonb, 'a pending signature needs attention; attendance counts held sessions only');
select is((select jsonb_build_object('state', p->>'state', 'att', p->'attendance', 'votes', p->'votes') from pp where p->>'full_name_ar'='وليد'),
  '{"state":"attention","att":{"present":0,"recorded":2},"votes":{"eligible":1,"voted":0}}'::jsonb, 'missing most sessions needs attention; a vote not cast is counted without revealing any vote');
select ok((select f::text !~ 'reject|approve|vote_value' from seen where who='amal'), 'the direction of a vote never leaves the database');
select is((select f->'summary' from seen where who='amal'),
  '{"total":3,"attention":3,"regular":0,"no_activity":0,"present":3,"recorded":5,"voted":1,"eligible":3,"pending_signatures":1,"tasks":2,"tasks_done":1,"tasks_overdue":1}'::jsonb, 'the summary adds the members up');
select is((select (f->'summary'->>'total')::int from seen where who='walid'), 0, 'a plain member follows no one');
select ok(not has_function_privilege('anon','api_v2.get_my_people_follow_up_v2(date)','execute')
  and not has_function_privilege('authenticated','qarar_voting.member_votes_v2(uuid,uuid[])','execute'), 'only signed-in users reach it, and only through api_v2');

select * from finish();
rollback;
