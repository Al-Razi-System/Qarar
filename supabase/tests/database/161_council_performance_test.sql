begin;
create extension if not exists pgtap;
select plan(22);

-- "Today" as the contracts see it, and the academic year that contains it.
create temporary table clock as
select d t, make_date(extract(year from d)::integer - case when extract(month from d) < 9 then 1 else 0 end, 9, 1) y
from (select (now() at time zone 'Asia/Riyadh')::date d) x;
grant all on clock to public;

insert into qarar_core.organizations(id,code,name_ar) values('61000000-0000-0000-0000-000000000001','pf161','الأداء');
insert into auth.users(id,email) select ('61000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@pf161.test' from generate_series(1,3) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('61000000-0000-0000-0000-000000000101','61000000-0000-0000-0000-000000000001','u1@pf161.test','أمل',false),
('61000000-0000-0000-0000-000000000102','61000000-0000-0000-0000-000000000001','u2@pf161.test','وليد',false),
('61000000-0000-0000-0000-000000000103','61000000-0000-0000-0000-000000000001','u3@pf161.test','مسؤول النظام',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('61000000-0000-0000-0000-000000000201','61000000-0000-0000-0000-000000000001','o161','وحدة',false),
('61000000-0000-0000-0000-000000000202','61000000-0000-0000-0000-000000000001','c161','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('61000000-0000-0000-0000-000000000401','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000201','root','الجامعة','active');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,scope_unit_id,code,name_ar,status) values
('61000000-0000-0000-0000-000000000501','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000202','61000000-0000-0000-0000-000000000401','a','مجلس الكلية','active'),
('61000000-0000-0000-0000-000000000502','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000202','61000000-0000-0000-0000-000000000401','b','مجلس القسم','active'),
('61000000-0000-0000-0000-000000000503','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000202','61000000-0000-0000-0000-000000000401','c','مجلس خامل','inactive'),
('61000000-0000-0000-0000-000000000504','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000202','61000000-0000-0000-0000-000000000401','e','مجلس اللجنة','active');
delete from qarar_iam.roles where organization_id='61000000-0000-0000-0000-000000000001' and code in ('council_member','council_chair');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('61000000-0000-0000-0000-000000000601','61000000-0000-0000-0000-000000000001','council_member','عضو','governance_unit'),
('61000000-0000-0000-0000-000000000602','61000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date) values
('61000000-0000-0000-0000-000000000701','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000101','61000000-0000-0000-0000-000000000501','61000000-0000-0000-0000-000000000602',current_date-90),
('61000000-0000-0000-0000-000000000702','61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000102','61000000-0000-0000-0000-000000000501','61000000-0000-0000-0000-000000000601',current_date-90);
insert into qarar_iam.oversight_assignments(organization_id,holder_kind,holder_user_id,target_mode,root_unit_id,request_id) values
('61000000-0000-0000-0000-000000000001','user','61000000-0000-0000-0000-000000000101','subtree','61000000-0000-0000-0000-000000000401',gen_random_uuid());

-- The records the contracts read. Guard triggers are paused: this test reads these rows, it does not create them.
set local session_replication_role = replica;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,planned_date,planned_window_start,planned_window_end,academic_year_start,session_sequence_no,created_by_user_id,status)
select ('61000000-0000-0000-0000-0000000009'||lpad(n::text,2,'0'))::uuid,'61000000-0000-0000-0000-000000000001','P-'||n,council::uuid,title,
  c.t+sched, c.t+due-6, c.t+due-6, c.t+due, c.y, n, '61000000-0000-0000-0000-000000000103', status
from clock c, (values
  (1,'61000000-0000-0000-0000-000000000501','في موعدها',-41,-40,'closed'),
  (2,'61000000-0000-0000-0000-000000000501','متأخرة',-24,-30,'closed'),
  (3,'61000000-0000-0000-0000-000000000501','لم تنعقد',-20,-20,'not_held'),
  (4,'61000000-0000-0000-0000-000000000501','مضى موعدها',-4,-4,'scheduled'),
  (5,'61000000-0000-0000-0000-000000000501','ملغاة',-10,-10,'cancelled'),
  (6,'61000000-0000-0000-0000-000000000501','قادمة',20,20,'draft'),
  (7,'61000000-0000-0000-0000-000000000502','جلسة القسم',-15,-12,'closed'),
  (8,'61000000-0000-0000-0000-000000000504','جلسة اللجنة',-3,-3,'scheduled')
) v(n,council,title,sched,due,status);
insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_by_user_id,changed_at)
select '61000000-0000-0000-0000-000000000001',('61000000-0000-0000-0000-0000000009'||lpad(n::text,2,'0'))::uuid,'ready_to_start','in_progress',
  '61000000-0000-0000-0000-000000000103', ((c.t+held)::timestamp + interval '12 hours') at time zone 'Asia/Riyadh'
from clock c, (values (1,-41),(2,-24),(7,-15)) v(n,held);
insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status)
select '61000000-0000-0000-0000-000000000001',('61000000-0000-0000-0000-0000000009'||lpad(n::text,2,'0'))::uuid,
  '61000000-0000-0000-0000-000000000101','61000000-0000-0000-0000-000000000701',s
from (values (1,'present'),(2,'present')) v(n,s);
insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status)
select '61000000-0000-0000-0000-000000000001',('61000000-0000-0000-0000-0000000009'||lpad(n::text,2,'0'))::uuid,
  '61000000-0000-0000-0000-000000000102','61000000-0000-0000-0000-000000000702',s
from (values (1,'late'),(2,'absent')) v(n,s);
insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status)
select '61000000-0000-0000-0000-000000000001',('61000000-0000-0000-0000-0000000009'||lpad(n::text,2,'0'))::uuid,
  '61000000-0000-0000-0000-000000000103','61000000-0000-0000-0000-000000000702',s
from (values (1,'absent'),(2,'pending')) v(n,s);
insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,status,approved_at)
select '61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000901','approved',
  ((c.t-38)::timestamp + interval '12 hours') at time zone 'Asia/Riyadh' from clock c;
insert into qarar_minutes.meeting_minutes(organization_id,meeting_id,status,approved_at)
select '61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000907','approved',
  ((c.t-14)::timestamp + interval '12 hours') at time zone 'Asia/Riyadh' from clock c;
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,status,current_unit_id) values
('61000000-0000-0000-0000-000000000801','61000000-0000-0000-0000-000000000001','T-1','خطة الكلية','61000000-0000-0000-0000-000000000102','listed','61000000-0000-0000-0000-000000000501');
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,governance_unit_id,decision_text,decision_status,issued_by_user_id,issued_at) values
('61000000-0000-0000-0000-000000000941','61000000-0000-0000-0000-000000000001','D-1','61000000-0000-0000-0000-000000000801','61000000-0000-0000-0000-000000000901','61000000-0000-0000-0000-000000000501','اعتماد','approved','61000000-0000-0000-0000-000000000103',now());
insert into qarar_execution.action_items(organization_id,action_no,decision_id,topic_id,title_ar,status,due_date,assigned_user_id)
select '61000000-0000-0000-0000-000000000001',no,'61000000-0000-0000-0000-000000000941','61000000-0000-0000-0000-000000000801',title,status,c.t+due,'61000000-0000-0000-0000-000000000101'
from clock c, (values ('A-1','منجزة','completed',-9),('A-2','متأخرة','new',-2),('A-3','جارية','in_progress',5),('A-4','ملغاة','cancelled',-1)) v(no,title,status,due);
insert into qarar_governance.oversight_violations(organization_id,rule_code,council_id,subject_type,subject_id,subject_label,subject_link,due_since,detected_at) values
('61000000-0000-0000-0000-000000000001','task_overdue','61000000-0000-0000-0000-000000000501','action_item',gen_random_uuid(),'A-2 متأخرة','/admin/tasks',now()-interval '2 days',now());
set local session_replication_role = origin;

create temporary table seen(who text primary key, overview jsonb, council jsonb);
grant all on seen to public;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"61000000-0000-0000-0000-000000000101","role":"authenticated"}';
insert into seen select 'amal', api_v2.get_my_oversight_overview_v2((select y from clock)),
  api_v2.get_council_performance_v2('61000000-0000-0000-0000-000000000501', (select y from clock));
set local "request.jwt.claims"='{"sub":"61000000-0000-0000-0000-000000000102","role":"authenticated"}';
insert into seen select 'walid', api_v2.get_my_oversight_overview_v2((select y from clock)), null;
reset role;

create temporary view a as select c from seen, jsonb_array_elements(overview->'councils') c where who='amal' and c->>'name_ar'='مجلس الكلية';

select is((select overview->'summary' from seen where who='amal'),
  '{"total":4,"regular":1,"attention":1,"stalled":1,"inactive":1}'::jsonb, 'the overview counts each council once, by state');
select is((select jsonb_agg(c->>'state') from seen, jsonb_array_elements(overview->'councils') c where who='amal'),
  '["stalled","attention","regular","inactive"]'::jsonb, 'councils needing attention come first, inactive ones last');
select is((select c->'sessions' from a),
  '{"on_time":1,"late":1,"missed":1,"overdue":1,"upcoming":1,"cancelled":1,"due":4}'::jsonb, 'every session lands in exactly one outcome');
select is((select jsonb_agg(m->>'outcome') from a, jsonb_array_elements(c->'marks') m),
  '["on_time","late","missed","overdue"]'::jsonb, 'the rhythm lists due sessions in order, without cancelled or upcoming ones');
select is((select (c->'marks'->1->>'late_days')::int from a), 6, 'a late session carries how many days it was late');
select is((select (c->'marks'->3->>'late_days')::int from a), 4, 'a session not yet held counts the days since its due day');
select is((select c->>'state' from a), 'stalled', 'two due sessions in a row not held make the council stalled');
select is((select c->'attendance' from a), '{"present":3,"recorded":5}'::jsonb, 'late arrivals count as present and pending records are not counted');
select is((select c->'minutes' from a), '{"avg_days":3.0,"pending":1}'::jsonb, 'minutes: days from the session to approval, and held sessions still without approved minutes');
select is((select c->'tasks' from a), '{"total":3,"done":1,"overdue":1}'::jsonb, 'tasks come through the council''s decisions, cancelled ones excluded');
select is((select c->'violations' from a), '{"open":1,"escalated":0}'::jsonb, 'open violations are counted with those escalated');
select is((select (c->>'next_due')::date from a), (select t+20 from clock), 'the next due session is shown');
select ok((select (c->>'leads')::boolean and (c->>'follows')::boolean from a), 'the row says whether I lead and whether I follow the council');
select is((select c->>'state' from seen, jsonb_array_elements(overview->'councils') c where who='amal' and c->>'name_ar'='مجلس اللجنة'),
  'attention', 'one session past its due day needs attention without being stalled');
select is((select c->>'state' from seen, jsonb_array_elements(overview->'councils') c where who='amal' and c->>'name_ar'='مجلس خامل'),
  'inactive', 'a council that is not active is never reported as stalled');

select is((select jsonb_build_object('chair', council->'council'->>'chair_name_ar', 'members', (council->'council'->>'member_count')::int) from seen where who='amal'),
  '{"chair":"أمل","members":2}'::jsonb, 'the council page names the chair and counts active members');
select is((select jsonb_array_length(council->'sessions') from seen where who='amal'), 6, 'the council page lists every session of the year');
select is((select jsonb_build_object('held', (s->>'held_on')::date, 'present', (s->>'present')::int, 'recorded', (s->>'recorded')::int, 'minutes', s->'minutes_approved_on')
    from seen, jsonb_array_elements(council->'sessions') s where who='amal' and s->>'title_ar'='متأخرة'),
  (select jsonb_build_object('held', t-24, 'present', 1, 'recorded', 2, 'minutes', null) from clock), 'each session shows when it was held, who attended and its minutes');
select is((select jsonb_array_length(council->'violations') from seen where who='amal'), 1, 'the council page lists what needs follow-up now');

select is((select (overview->'summary'->>'total')::int from seen where who='walid'), 0, 'a plain member follows nothing and sees no council');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"61000000-0000-0000-0000-000000000102","role":"authenticated"}';
select throws_ok($$select api_v2.get_council_performance_v2('61000000-0000-0000-0000-000000000501')$$, '42501', null,
  'a council outside what I lead or follow is refused');
reset role;
select ok(not has_function_privilege('anon','api_v2.get_my_oversight_overview_v2(date)','execute')
  and not has_function_privilege('anon','api_v2.get_council_performance_v2(uuid,date)','execute')
  and not has_function_privilege('authenticated','qarar_governance.oversight_council_rows_v2(uuid,uuid[],date)','execute'),
  'only signed-in users reach the contracts, and only through api_v2');

select * from finish();
rollback;
