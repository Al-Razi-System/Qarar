begin;
create extension if not exists pgtap;
select plan(9);

insert into qarar_core.organizations(id,code,name_ar) values('59000000-0000-0000-0000-000000000001','wa159','واتساب');
insert into auth.users(id,email) select ('59000000-0000-0000-0000-0000000001'||lpad(n::text,2,'0'))::uuid,'u'||n||'@wa159.test' from generate_series(1,3) n;
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin,mobile) values
('59000000-0000-0000-0000-000000000101','59000000-0000-0000-0000-000000000001','u1@wa159.test','طارق',false,'+967770000201'),
('59000000-0000-0000-0000-000000000102','59000000-0000-0000-0000-000000000001','u2@wa159.test','لا يتابع',false,'+967770000202'),
('59000000-0000-0000-0000-000000000103','59000000-0000-0000-0000-000000000001','u3@wa159.test','مسؤول النظام',true,null);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
('59000000-0000-0000-0000-000000000201','59000000-0000-0000-0000-000000000001','o159','وحدة',false),
('59000000-0000-0000-0000-000000000202','59000000-0000-0000-0000-000000000001','c159','مجلس',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('59000000-0000-0000-0000-000000000401','59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000201','un','الجامعة','active');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,scope_unit_id,code,name_ar,status) values
('59000000-0000-0000-0000-000000000501','59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000202','59000000-0000-0000-0000-000000000401','c1','مجلس أول','active'),
('59000000-0000-0000-0000-000000000502','59000000-0000-0000-0000-000000000001','59000000-0000-0000-0000-000000000202','59000000-0000-0000-0000-000000000401','c2','مجلس ثانٍ','active');
insert into qarar_iam.oversight_assignments(organization_id,holder_kind,holder_user_id,target_mode,root_unit_id,request_id) values
('59000000-0000-0000-0000-000000000001','user','59000000-0000-0000-0000-000000000101','subtree','59000000-0000-0000-0000-000000000401',gen_random_uuid());
insert into qarar_governance.oversight_violations(organization_id,rule_code,council_id,subject_type,subject_id,subject_label,subject_link,due_since,detected_at) values
('59000000-0000-0000-0000-000000000001','topic_stalled','59000000-0000-0000-0000-000000000501','topic',gen_random_uuid(),'T-9 خطة قديمة','/admin/topics/x',now()-interval '60 days',now()),
('59000000-0000-0000-0000-000000000001','topic_stalled','59000000-0000-0000-0000-000000000502','topic',gen_random_uuid(),'T-10 خطة','/admin/topics/y',now()-interval '5 days',now()),
('59000000-0000-0000-0000-000000000001','task_overdue','59000000-0000-0000-0000-000000000502','action_item',gen_random_uuid(),'A-1 رفع','/admin/tasks?task=z',now()-interval '2 days',now());

-- Templates: present in the settings page, off until the administrator turns them on.
set local "request.jwt.claims"='{"sub":"59000000-0000-0000-0000-000000000103","role":"authenticated"}';
set local role authenticated;
create temporary table settings_page as select api_v1.admin_get_notification_workspace() w;
reset role;
select is((select string_agg(t->>'code'||'='||(t->>'enabled'), ',' order by t->>'code') from settings_page, jsonb_array_elements(w->'templates') t where t->>'code' like 'oversight_%'),
  'oversight_digest=false,oversight_escalation=false,oversight_violation=false','the three oversight messages appear in settings, disabled by default');
select is(qarar_governance.notification_template_code('oversight.violation.escalated','{}'),'oversight_escalation','escalations map to their template');
select is(qarar_governance.notification_template_enabled('59000000-0000-0000-0000-000000000001','oversight_escalation'),false,'and are not sent until enabled');
select is(qarar_governance.notification_template_enabled('59000000-0000-0000-0000-000000000001','task_overdue'),true,'existing messages keep their enabled default');
insert into qarar_governance.notification_template_settings(organization_id,template_code,enabled) values('59000000-0000-0000-0000-000000000001','oversight_escalation',true);
select is(qarar_governance.notification_template_enabled('59000000-0000-0000-0000-000000000001','oversight_escalation'),true,'the administrator can turn them on');

-- The daily digest: one per follower with open items, none for others, once a day.
select qarar_governance.generate_oversight_digests(now());
select qarar_governance.generate_oversight_digests(now());
select is((select count(*)::int from qarar_governance.notification_outbox where event_type='oversight.digest' and organization_id='59000000-0000-0000-0000-000000000001'),1,'one digest per follower per day');
select is((select payload->>'total_open'||'|'||(payload->>'council_count')||'|'||(payload->'oldest'->0->>'subject_label') from qarar_governance.notification_outbox where event_type='oversight.digest' and payload->>'recipient_user_id'='59000000-0000-0000-0000-000000000101'),
  '3|2|T-9 خطة قديمة','it counts open items and councils, oldest first');
select is((select count(*)::int from qarar_governance.notification_outbox where event_type='oversight.digest' and payload->>'recipient_user_id'='59000000-0000-0000-0000-000000000102'),0,'someone who follows nothing gets no digest');
select is((select count(*)::int from qarar_governance.user_notifications where user_id='59000000-0000-0000-0000-000000000101' and category='digest'),1,'the digest is in the bell too');

select * from finish();
rollback;
