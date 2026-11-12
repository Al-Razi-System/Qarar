begin;
create extension if not exists pgtap;
select plan(18);

-- Tree: University > College A > Dept A1. Councils: board (University), college council (College A), department council (Dept A1).
insert into qarar_core.organizations(id,code,name_ar) values('58000000-0000-0000-0000-000000000001','vi158','تجاوزات');
insert into auth.users(id,email) select ('58000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@vi158.test' from generate_series(1,6) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin,mobile) values
('58000000-0000-0000-0000-000000000101','58000000-0000-0000-0000-000000000001','u1@vi158.test','طارق',false,'+967770000101'),
('58000000-0000-0000-0000-000000000102','58000000-0000-0000-0000-000000000001','u2@vi158.test','العميد',false,'+967770000102'),
('58000000-0000-0000-0000-000000000103','58000000-0000-0000-0000-000000000001','u3@vi158.test','رئيس القسم',false,'+967770000103'),
('58000000-0000-0000-0000-000000000104','58000000-0000-0000-0000-000000000001','u4@vi158.test','مقرر القسم',false,'+967770000104'),
('58000000-0000-0000-0000-000000000105','58000000-0000-0000-0000-000000000001','u5@vi158.test','لا علاقة له',false,null),
('58000000-0000-0000-0000-000000000106','58000000-0000-0000-0000-000000000001','u6@vi158.test','مسؤول الحوكمة',true,null);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('58000000-0000-0000-0000-000000000201','58000000-0000-0000-0000-000000000001','o158','وحدة',false),
('58000000-0000-0000-0000-000000000202','58000000-0000-0000-0000-000000000001','c158','مجلس',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level) values
('58000000-0000-0000-0000-000000000301','58000000-0000-0000-0000-000000000001','u158','مجلس جامعة','university'),
('58000000-0000-0000-0000-000000000302','58000000-0000-0000-0000-000000000001','f158','مجلس كلية','faculty'),
('58000000-0000-0000-0000-000000000303','58000000-0000-0000-0000-000000000001','d158','مجلس قسم','department');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,parent_unit_id,code,name_ar,status) values
('58000000-0000-0000-0000-000000000401','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000201',null,'un','الجامعة','active'),
('58000000-0000-0000-0000-000000000402','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000201','58000000-0000-0000-0000-000000000401','ca','كلية أ','active'),
('58000000-0000-0000-0000-000000000403','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000201','58000000-0000-0000-0000-000000000402','da','قسم أ1','active');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,scope_unit_id,governance_class_id,code,name_ar,status) values
('58000000-0000-0000-0000-000000000501','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000202','58000000-0000-0000-0000-000000000401','58000000-0000-0000-0000-000000000301','board','مجلس الأمناء','active'),
('58000000-0000-0000-0000-000000000502','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000202','58000000-0000-0000-0000-000000000402','58000000-0000-0000-0000-000000000302','fca','مجلس كلية أ','active'),
('58000000-0000-0000-0000-000000000503','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000202','58000000-0000-0000-0000-000000000403','58000000-0000-0000-0000-000000000303','dka','مجلس قسم أ1','active');
delete from qarar_iam.roles where organization_id='58000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values
('58000000-0000-0000-0000-000000000601','58000000-0000-0000-0000-000000000001','council_chair','رئيس','governance_unit'),
('58000000-0000-0000-0000-000000000602','58000000-0000-0000-0000-000000000001','council_rapporteur','مقرر','governance_unit');
insert into qarar_iam.memberships(organization_id,user_id,governance_unit_id,role_id,start_date) values
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000101','58000000-0000-0000-0000-000000000501','58000000-0000-0000-0000-000000000601',current_date-60),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000102','58000000-0000-0000-0000-000000000502','58000000-0000-0000-0000-000000000601',current_date-60),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000103','58000000-0000-0000-0000-000000000503','58000000-0000-0000-0000-000000000601',current_date-60),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000104','58000000-0000-0000-0000-000000000503','58000000-0000-0000-0000-000000000602',current_date-60);
-- Tariq follows everything under the university; each dean follows their college's department councils.
insert into qarar_iam.oversight_assignments(organization_id,holder_kind,holder_council_id,holder_role_code,target_mode,root_unit_id,request_id) values
('58000000-0000-0000-0000-000000000001','council_position','58000000-0000-0000-0000-000000000501','council_chair','subtree','58000000-0000-0000-0000-000000000401',gen_random_uuid());
insert into qarar_iam.oversight_assignments(organization_id,holder_kind,holder_role_code,holder_class_id,target_mode,target_class_ids,request_id) values
('58000000-0000-0000-0000-000000000001','position_rule','council_chair','58000000-0000-0000-0000-000000000302','subtree',array['58000000-0000-0000-0000-000000000303'::uuid],gen_random_uuid());

-- Five late things in the department council.
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status,schedule_date_confirmed,planned_window_start,planned_window_end) values
('58000000-0000-0000-0000-000000000701','58000000-0000-0000-0000-000000000001','M1','58000000-0000-0000-0000-000000000503','اجتماع أكتوبر',current_date-10,'58000000-0000-0000-0000-000000000106','draft',false,current_date-20,current_date-2);
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('58000000-0000-0000-0000-000000000702','58000000-0000-0000-0000-000000000001','M2','58000000-0000-0000-0000-000000000503','اجتماع بانتظار المحضر',current_date-12,'58000000-0000-0000-0000-000000000106','waiting_for_minutes'),
('58000000-0000-0000-0000-000000000704','58000000-0000-0000-0000-000000000001','M4','58000000-0000-0000-0000-000000000503','محضر قديم جدا',current_date-40,'58000000-0000-0000-0000-000000000106','waiting_for_approval');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status,quorum_status,quorum_continuation) values
('58000000-0000-0000-0000-000000000703','58000000-0000-0000-0000-000000000001','M3','58000000-0000-0000-0000-000000000503','اجتماع بنصاب ناقص',current_date,'58000000-0000-0000-0000-000000000106','in_progress','not_met',jsonb_build_object('reason','أهمية البنود العاجلة','authorized_by','58000000-0000-0000-0000-000000000103','authorized_at',now(),'quorum',jsonb_build_object('quorum_status','not_met')));
insert into qarar_meetings.meeting_status_history(organization_id,meeting_id,from_status,to_status,changed_at) values
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000702','in_progress','waiting_for_minutes',now()-interval '10 days'),
('58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000704','waiting_for_minutes','waiting_for_approval',now()-interval '30 days');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,current_unit_id) values
('58000000-0000-0000-0000-000000000801','58000000-0000-0000-0000-000000000001','T-1','خطة القسم','58000000-0000-0000-0000-000000000103','58000000-0000-0000-0000-000000000503');
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,governance_unit_id,decision_text,decision_status,issued_by_user_id) values
('58000000-0000-0000-0000-000000000802','58000000-0000-0000-0000-000000000001','D-1','58000000-0000-0000-0000-000000000801','58000000-0000-0000-0000-000000000503','اعتماد الخطة','approved','58000000-0000-0000-0000-000000000103');
insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,title_ar,status,due_date,assigned_user_id) values
('58000000-0000-0000-0000-000000000803','58000000-0000-0000-0000-000000000001','A-1','58000000-0000-0000-0000-000000000802','58000000-0000-0000-0000-000000000801','رفع الخطة','new',current_date-3,'58000000-0000-0000-0000-000000000104');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id) values('58000000-0000-0000-0000-000000000901','58000000-0000-0000-0000-000000000001','r158','مسار','58000000-0000-0000-0000-000000000106');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,created_by_user_id,activated_by_user_id,activated_at) values
('58000000-0000-0000-0000-000000000902','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000901',1,'draft','valid','58000000-0000-0000-0000-000000000106',null,null);
insert into qarar_governance.workflow_template_steps(id,organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes) values
('58000000-0000-0000-0000-000000000903','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000902','dept','مناقشة القسم',1,'approval','final_approve','58000000-0000-0000-0000-000000000503',true,true,array['approved','rejected']);
update qarar_governance.workflow_template_versions set status='active',activated_by_user_id='58000000-0000-0000-0000-000000000106',activated_at=now() where id='58000000-0000-0000-0000-000000000902';
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,submitted_by_user_id,current_unit_id) values
('58000000-0000-0000-0000-000000000904','58000000-0000-0000-0000-000000000001','T-2','موضوع عالق','58000000-0000-0000-0000-000000000103','58000000-0000-0000-0000-000000000503');
-- A stalled route step only; its regulation-match origin is irrelevant here, so foreign-key triggers are paused for these three rows.
set local session_replication_role = replica;
insert into qarar_governance.topic_governance_mappings(id,organization_id,topic_id,governance_source,routing_status,routing_decision_id,workflow_template_version_id,snapshot,mapped_by_user_id) values
('58000000-0000-0000-0000-000000000905','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000904','regulated','routing_ready',gen_random_uuid(),'58000000-0000-0000-0000-000000000902','{}','58000000-0000-0000-0000-000000000106');
insert into qarar_governance.workflow_instances(id,organization_id,topic_id,topic_governance_mapping_id,workflow_template_version_id,status,started_by_user_id,snapshot) values
('58000000-0000-0000-0000-000000000906','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000904','58000000-0000-0000-0000-000000000905','58000000-0000-0000-0000-000000000902','active','58000000-0000-0000-0000-000000000106','{}');
insert into qarar_governance.workflow_instance_steps(id,organization_id,workflow_instance_id,template_step_id,sequence_no,status,assigned_unit_id,opened_at,snapshot) values
('58000000-0000-0000-0000-000000000907','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000906','58000000-0000-0000-0000-000000000903',1,'active','58000000-0000-0000-0000-000000000503',now()-interval '32 days','{}');

set local session_replication_role = origin;

create function pg_temp.open_rules() returns text language sql as $$
  select coalesce(string_agg(rule_code||':'||subject_label, ',' order by rule_code, subject_label), '')
  from qarar_governance.oversight_violations where organization_id='58000000-0000-0000-0000-000000000001' and status='open' $$;
create function pg_temp.inbox(p_user uuid, p_category text) returns integer language sql as $$
  select count(*)::int from qarar_governance.user_notifications where user_id=p_user and category=p_category $$;
create function pg_temp.whatsapp(p_user uuid, p_event text) returns integer language sql as $$
  select count(*)::int from qarar_governance.notification_outbox where organization_id='58000000-0000-0000-0000-000000000001'
    and event_type=p_event and payload->>'recipient_user_id'=p_user::text $$;

-- First run: every late thing becomes one open violation.
select qarar_governance.run_oversight_cycle(now());
select is(pg_temp.open_rules(),
  'meeting_cycle_missed:اجتماع أكتوبر,minutes_pending:اجتماع بانتظار المحضر,minutes_pending:محضر قديم جدا,quorum_continuation:اجتماع بنصاب ناقص,task_overdue:A-1 رفع الخطة,topic_stalled:T-2 موضوع عالق',
  'each rule detects its late item in the department council');
select qarar_governance.run_oversight_cycle(now());
select is((select count(*)::int from qarar_governance.oversight_violations where organization_id='58000000-0000-0000-0000-000000000001'),6,'a second run creates no duplicate');

-- Level 0: the council's chair and rapporteur.
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000103','violation'),6,'the department chair sees every violation of their council in the bell');
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000104','violation'),6,'and so does its rapporteur');
select is(pg_temp.whatsapp('58000000-0000-0000-0000-000000000103','oversight.violation.detected'),3,
  'WhatsApp goes to the chair only for rules without an existing alert, and not for an old backlog item');
-- Quorum continuation reaches the nearest follower at once.
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000102','escalation'),1,'the dean is told at once that the department met without quorum');
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000101','escalation'),0,'the board chair is not, yet');

-- Three days later, unresolved items escalate to the dean; topic_stalled waits for its own 7 days.
select qarar_governance.run_oversight_cycle(now()+interval '3 days 1 hour');
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000102','escalation'),5,'after the escalation period, the dean receives the unresolved items');
select is(pg_temp.whatsapp('58000000-0000-0000-0000-000000000102','oversight.violation.escalated'),5,'by WhatsApp too');
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000101','escalation'),1,'the next level only gets what has already passed the dean: the quorum item');

-- Fixing the cause closes the violation; it then stops escalating.
update qarar_execution.action_items set status='completed' where id='58000000-0000-0000-0000-000000000803';
select qarar_governance.run_oversight_cycle(now()+interval '3 days 2 hours');
select is((select status from qarar_governance.oversight_violations where rule_code='task_overdue' and organization_id='58000000-0000-0000-0000-000000000001'),'resolved','a completed task closes its violation');

-- Scope: each sees only councils they lead or follow.
set local "request.jwt.claims"='{"sub":"58000000-0000-0000-0000-000000000102","role":"authenticated"}';
set local role authenticated;
select is((select (api_v2.get_my_oversight_violations_v2('open',null,null)->>'total')::int),5,'the dean sees the open violations of the departments they follow');
select is((select api_v2.get_my_oversight_violations_v2('open',null,null)->'items'->0->>'council_name_ar'),'مجلس قسم أ1','named by council');
reset role;
set local "request.jwt.claims"='{"sub":"58000000-0000-0000-0000-000000000105","role":"authenticated"}';
set local role authenticated;
select is((select (api_v2.get_my_oversight_violations_v2('open',null,null)->>'total')::int),0,'someone who neither leads nor follows sees nothing');
select throws_ok($$select api_v2.admin_save_oversight_rules_v2('[{"rule_code":"topic_stalled","enabled":true,"threshold_days":10,"escalation_days":2}]')$$,'42501',null,'and cannot change the rules');
reset role;

-- The bell.
set local "request.jwt.claims"='{"sub":"58000000-0000-0000-0000-000000000103","role":"authenticated"}';
set local role authenticated;
select is((select (api_v2.get_my_notifications_v2(20,null)->>'unread_count')::int),6,'the chair has six unread notifications');
select is((select api_v2.mark_my_notifications_read_v2(null)),0,'marking all read leaves none unread');
reset role;
-- An existing alert placed in the outbox also appears in the recipient's bell.
insert into qarar_governance.notification_outbox(organization_id,aggregate_type,aggregate_id,event_type,payload,deduplication_key) values
('58000000-0000-0000-0000-000000000001','meeting','58000000-0000-0000-0000-000000000701','meeting.reminder.due',
 '{"meeting_id":"58000000-0000-0000-0000-000000000701","title_ar":"اجتماع أكتوبر","recipient_user_id":"58000000-0000-0000-0000-000000000104"}','t158:reminder');
select is(pg_temp.inbox('58000000-0000-0000-0000-000000000104','meeting'),1,'existing meeting alerts reach the bell as well');

select * from finish();
rollback;
