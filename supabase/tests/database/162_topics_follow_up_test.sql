begin;
create extension if not exists pgtap;
select plan(10);

create temporary table clock as
select d t, make_date(extract(year from d - 20)::integer - case when extract(month from d - 20) < 9 then 1 else 0 end, 9, 1) y
from (select (now() at time zone 'Asia/Riyadh')::date d) x;
grant all on clock to public;
create function pg_temp.noon(d date) returns timestamptz language sql as $$ select (d::timestamp + interval '12 hours') at time zone 'Asia/Riyadh' $$;

insert into qarar_core.organizations(id,code,name_ar) values('62000000-0000-0000-0000-000000000001','tf162','الموضوعات');
insert into auth.users(id,email) select ('62000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@tf162.test' from generate_series(1,2) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('62000000-0000-0000-0000-000000000101','62000000-0000-0000-0000-000000000001','u1@tf162.test','أمل',false),
('62000000-0000-0000-0000-000000000102','62000000-0000-0000-0000-000000000001','u2@tf162.test','وليد',false);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('62000000-0000-0000-0000-000000000202','62000000-0000-0000-0000-000000000001','c162','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('62000000-0000-0000-0000-000000000501','62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000202','a','مجلس الكلية','active'),
('62000000-0000-0000-0000-000000000502','62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000202','b','مجلس القسم','active');
delete from qarar_iam.roles where organization_id='62000000-0000-0000-0000-000000000001' and code='council_chair';
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('62000000-0000-0000-0000-000000000602','62000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit');
insert into qarar_iam.memberships(id,organization_id,user_id,governance_unit_id,role_id,start_date) values
('62000000-0000-0000-0000-000000000701','62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000101','62000000-0000-0000-0000-000000000501','62000000-0000-0000-0000-000000000602',current_date-90);

-- Guard triggers are paused: this test reads these rows, it does not create them.
set local session_replication_role = replica;
insert into qarar_topics.topic_categories(id,organization_id,code,name_ar) values
('62000000-0000-0000-0000-000000000301','62000000-0000-0000-0000-000000000001','bud','اعتماد الميزانية');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,status,current_unit_id,governance_source,category_id,workflow_instance_id,created_at,updated_at)
select id::uuid,'62000000-0000-0000-0000-000000000001',no,title,'62000000-0000-0000-0000-000000000102',status,unit::uuid,src,cat::uuid,inst::uuid,pg_temp.noon(c.t-age),pg_temp.noon(c.t-upd)
from clock c, (values
  ('62000000-0000-0000-0000-000000000801','T-1','ميزانية الكلية','in_process','62000000-0000-0000-0000-000000000502','regulated','62000000-0000-0000-0000-000000000301','62000000-0000-0000-0000-000000000401',30,10),
  ('62000000-0000-0000-0000-000000000802','T-2','طلب أُعيد','returned','62000000-0000-0000-0000-000000000501','custom',null,null,8,3),
  ('62000000-0000-0000-0000-000000000803','T-3','موضوع محسوم','approved','62000000-0000-0000-0000-000000000501',null,null,null,20,5),
  ('62000000-0000-0000-0000-000000000804','T-4','خارج نطاقي','new','62000000-0000-0000-0000-000000000502','regulated',null,null,4,4)
) v(id,no,title,status,unit,src,cat,inst,age,upd);
insert into qarar_governance.workflow_instances(id,organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,status,started_by_user_id,started_at,snapshot) values
('62000000-0000-0000-0000-000000000401','62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000801',gen_random_uuid(),gen_random_uuid(),'active','62000000-0000-0000-0000-000000000102',now(),'{}');
insert into qarar_governance.workflow_instance_steps(organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,opened_at,snapshot)
select '62000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000401',gen_random_uuid(),n,st,unit::uuid,pg_temp.noon(c.t-opened),'{}'
from clock c, (values (1,'completed','62000000-0000-0000-0000-000000000502',30),(2,'active','62000000-0000-0000-0000-000000000501',10),(3,'pending','62000000-0000-0000-0000-000000000502',0)) v(n,st,unit,opened);
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,decision_status,outcome_kind,issued_by_user_id,issued_at)
select '62000000-0000-0000-0000-000000000941','62000000-0000-0000-0000-000000000001','D-1','62000000-0000-0000-0000-000000000803','62000000-0000-0000-0000-000000000501','اعتماد','approved','approval','62000000-0000-0000-0000-000000000101',pg_temp.noon(c.t-5) from clock c;
insert into qarar_execution.action_items(organization_id,action_no,decision_id,topic_id,title_ar,status,due_date,assigned_user_id) values
('62000000-0000-0000-0000-000000000001','A-1','62000000-0000-0000-0000-000000000941','62000000-0000-0000-0000-000000000803','منجزة','completed',current_date,'62000000-0000-0000-0000-000000000101'),
('62000000-0000-0000-0000-000000000001','A-2','62000000-0000-0000-0000-000000000941','62000000-0000-0000-0000-000000000803','جارية','in_progress',current_date+5,'62000000-0000-0000-0000-000000000101'),
('62000000-0000-0000-0000-000000000001','A-3','62000000-0000-0000-0000-000000000941','62000000-0000-0000-0000-000000000803','ملغاة','cancelled',current_date,'62000000-0000-0000-0000-000000000101');
insert into qarar_governance.oversight_violations(organization_id,rule_code,council_id,subject_type,subject_id,subject_label,subject_link,due_since,detected_at) values
('62000000-0000-0000-0000-000000000001','topic_stalled','62000000-0000-0000-0000-000000000501','topic','62000000-0000-0000-0000-000000000801','T-1','/admin/topics',now(),now());
set local session_replication_role = origin;

create temporary table seen(who text primary key, f jsonb);
grant all on seen to public;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"62000000-0000-0000-0000-000000000101","role":"authenticated"}';
insert into seen select 'amal', api_v2.get_my_topics_follow_up_v2((select y from clock));
set local "request.jwt.claims"='{"sub":"62000000-0000-0000-0000-000000000102","role":"authenticated"}';
insert into seen select 'walid', api_v2.get_my_topics_follow_up_v2((select y from clock));
reset role;
create temporary view tp as select t from seen, jsonb_array_elements(f->'topics') t where who='amal';

select is((select f->'summary' from seen where who='amal'),
  '{"total":3,"in_progress":0,"stalled":1,"returned":1,"finished":1,"ungoverned":2,"avg_days_to_finish":15.0,"avg_waiting_days":6.5}'::jsonb,
  'the summary counts each topic once by where it stands, with how long finishing and waiting take');
select is((select jsonb_agg(t->>'topic_no') from tp), '["T-1","T-2","T-3"]'::jsonb, 'stalled topics come first, finished ones last, and topics outside my councils are not shown');
select is((select jsonb_build_object('at', t->>'at_council_name_ar', 'wait', (t->>'waiting_days')::int, 'done', (t->>'steps_done')::int, 'of', (t->>'steps_total')::int, 'cat', t->>'category_name_ar')
    from tp where t->>'topic_no'='T-1'),
  '{"at":"مجلس الكلية","wait":10,"done":1,"of":3,"cat":"اعتماد الميزانية"}'::jsonb,
  'a routed topic stands at the council of its active step, waiting since that step opened, with its progress along the route');
select is((select jsonb_build_object('state', t->>'state', 'src', t->>'governance_source', 'wait', (t->>'waiting_days')::int) from tp where t->>'topic_no'='T-2'),
  '{"state":"returned","src":"custom","wait":3}'::jsonb, 'a topic without a route waits since it last changed, at its current council');
select is((select jsonb_build_object('state', t->>'state', 'age', (t->>'age_days')::int, 'decision', t->>'decision_no', 'outcome', t->>'outcome_kind',
    'tasks', (t->>'tasks')::int, 'done', (t->>'tasks_done')::int, 'at', t->'at_council_name_ar', 'src', t->>'governance_source') from tp where t->>'topic_no'='T-3'),
  '{"state":"finished","age":15,"decision":"D-1","outcome":"approval","tasks":2,"done":1,"at":null,"src":"legacy"}'::jsonb,
  'a finished topic shows the days it took, what was decided and how much of it was executed');
select is((select f->'by_council' from seen where who='amal'),
  '[{"id":"62000000-0000-0000-0000-000000000501","name_ar":"مجلس الكلية","open":2,"stalled":1,"longest_wait":10}]'::jsonb, 'open topics are grouped by the council they stand at');
select is((select f->'by_category'->0 from seen where who='amal'),
  '{"name_ar":"بلا تصنيف","total":2,"finished":1,"avg_days_to_finish":15.0}'::jsonb, 'topics are grouped by category, uncategorised ones together');
select is((select (f->'summary'->>'total')::int from seen where who='walid'), 0, 'someone who leads and follows nothing sees no topic, even ones they submitted');
select is((select jsonb_array_length(api_v2.get_my_topics_follow_up_v2(((select y from clock) + interval '5 years')::date)->'topics') from seen where who='walid'), 0, 'the contract answers for a year without topics');
select ok(not has_function_privilege('anon','api_v2.get_my_topics_follow_up_v2(date)','execute')
  and not has_function_privilege('authenticated','qarar_governance.get_my_topics_follow_up_v2(date)','execute'), 'only signed-in users reach it, and only through api_v2');

select * from finish();
rollback;
