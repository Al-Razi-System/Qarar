-- Executing and verifying assignments (owner decisions 2026-10-16, phase 3a):
-- the assignee or the unit's executor works the task and submits it; the
-- follow-up person, the issuing chair or a governance officer verifies it.
-- Impact map: docs/engineering/impact/EXECUTION_TASKS_AR.md
begin;
create extension if not exists pgtap;
select plan(33);

insert into public.organizations(id,code,name_ar) values
('a7000000-0000-0000-0000-000000000001','s106','Execution'),
('a7000000-0000-0000-0000-000000000002','s106b','Other Tenant');
insert into auth.users(id,email) values
('a7000000-0000-0000-0000-000000000011','chair@s106.test'),('a7000000-0000-0000-0000-000000000012','follow@s106.test'),('a7000000-0000-0000-0000-000000000013','member@s106.test'),('a7000000-0000-0000-0000-000000000014','officer@s106.test'),
('a7000000-0000-0000-0000-000000000015','admin@s106.test'),('a7000000-0000-0000-0000-000000000016','other@s106b.test'),('a7000000-0000-0000-0000-000000000017','unitexec@s106.test'),('a7000000-0000-0000-0000-000000000018','unitmember@s106.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000001','chair@s106.test','Council Chair',false),
('a7000000-0000-0000-0000-000000000012','a7000000-0000-0000-0000-000000000001','follow@s106.test','Follow-up Person',false),
('a7000000-0000-0000-0000-000000000013','a7000000-0000-0000-0000-000000000001','member@s106.test','Assignee',false),
('a7000000-0000-0000-0000-000000000014','a7000000-0000-0000-0000-000000000001','officer@s106.test','Governance Officer',false),
('a7000000-0000-0000-0000-000000000015','a7000000-0000-0000-0000-000000000001','admin@s106.test','System Admin',true),
('a7000000-0000-0000-0000-000000000016','a7000000-0000-0000-0000-000000000002','other@s106b.test','Other Tenant User',false),
('a7000000-0000-0000-0000-000000000017','a7000000-0000-0000-0000-000000000001','unitexec@s106.test','Unit Executor',false),
('a7000000-0000-0000-0000-000000000018','a7000000-0000-0000-0000-000000000001','unitmember@s106.test','Unit Member',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a7000000-0000-0000-0000-000000000021','a7000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('a7000000-0000-0000-0000-000000000023','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000021','registry','Registry Office',50);
delete from public.roles where organization_id='a7000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a7000000-0000-0000-0000-000000000031','a7000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a7000000-0000-0000-0000-000000000033','a7000000-0000-0000-0000-000000000001','s106_member','Member','governance_unit'),
('a7000000-0000-0000-0000-000000000034','a7000000-0000-0000-0000-000000000001','s106_officer','Governance officer','organization'),
('a7000000-0000-0000-0000-000000000035','a7000000-0000-0000-0000-000000000001','s106_unit_exec','Unit executor','organization');
-- The new permissions are provisioned with the organization, granted to nobody.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000034',id from public.permissions
where organization_id='a7000000-0000-0000-0000-000000000001' and code in ('execution.tasks.verify','execution.tasks.read');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000035',id from public.permissions
where organization_id='a7000000-0000-0000-0000-000000000001' and code in ('execution.unit_tasks.execute','execution.tasks.verify');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a7000000-0000-0000-0000-000000000061','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000031'),
('a7000000-0000-0000-0000-000000000062','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000012','a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000033'),
('a7000000-0000-0000-0000-000000000063','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000013','a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000033'),
('a7000000-0000-0000-0000-000000000064','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000014','a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000034'),
('a7000000-0000-0000-0000-000000000067','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000017','a7000000-0000-0000-0000-000000000023','a7000000-0000-0000-0000-000000000035'),
('a7000000-0000-0000-0000-000000000068','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000018','a7000000-0000-0000-0000-000000000023','a7000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a7000000-0000-0000-0000-000000000071','a7000000-0000-0000-0000-000000000001','TOP-S106-1','Plan','a7000000-0000-0000-0000-000000000022','a7000000-0000-0000-0000-000000000012','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a7000000-0000-0000-0000-000000000081','a7000000-0000-0000-0000-000000000001','MEET-S106-1','a7000000-0000-0000-0000-000000000022','Council meeting',current_date,'a7000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a7000000-0000-0000-0000-000000000091','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000081','a7000000-0000-0000-0000-000000000071',1);

create function pg_temp.s106_seed() returns void language sql security definer as
$$ set local session_replication_role=replica;
   insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,requires_approval,issued_by_user_id)
   values('a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000001','DECN-S106-1','a7000000-0000-0000-0000-000000000071','a7000000-0000-0000-0000-000000000081','a7000000-0000-0000-0000-000000000091','a7000000-0000-0000-0000-000000000022','Approve the plan as presented.','approved',true,'a7000000-0000-0000-0000-000000000011');
   insert into qarar_meetings.meeting_assignments(id,organization_id,meeting_id,agenda_item_id,decision_id,title_ar,assigned_user_id,status,proposed_by_user_id,issued_by_user_id,issued_at,follow_up_user_id,requires_evidence)
   values('a7000000-0000-0000-0000-0000000000c1','a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000081','a7000000-0000-0000-0000-000000000091','a7000000-0000-0000-0000-0000000000a1','Update the study plan','a7000000-0000-0000-0000-000000000013','active','a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000011',now(),'a7000000-0000-0000-0000-000000000012',true);
   insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar,due_date,meeting_assignment_id,requires_evidence) values
   ('a7000000-0000-0000-0000-0000000000b1','a7000000-0000-0000-0000-000000000001','TSK-S106-1','a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000071','a7000000-0000-0000-0000-000000000013','a7000000-0000-0000-0000-000000000012','Update the study plan',current_date+30,'a7000000-0000-0000-0000-0000000000c1',true),
   ('a7000000-0000-0000-0000-0000000000b3','a7000000-0000-0000-0000-000000000001','TSK-S106-3','a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000071','a7000000-0000-0000-0000-000000000013','a7000000-0000-0000-0000-000000000012','Overdue report',current_date-1,null,false);
   insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_unit_id,follow_up_user_id,title_ar,due_date,requires_evidence) values
   ('a7000000-0000-0000-0000-0000000000b2','a7000000-0000-0000-0000-000000000001','TSK-S106-2','a7000000-0000-0000-0000-0000000000a1','a7000000-0000-0000-0000-000000000071','a7000000-0000-0000-0000-000000000023','a7000000-0000-0000-0000-000000000012','Inform the departments',current_date+10,false);
   update qarar_meetings.meeting_assignments set action_item_id='a7000000-0000-0000-0000-0000000000b1' where id='a7000000-0000-0000-0000-0000000000c1';
   insert into storage.objects(bucket_id,name,metadata) values
   ('qarar-evidence','tasks/a7000000-0000-0000-0000-0000000000b1/evidence.pdf','{"size":2048,"mimetype":"application/pdf"}');
   set local session_replication_role=origin $$;
create function pg_temp.s106_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s106_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_execution.action_items where id=p_id $$;
create function pg_temp.s106_task(p_id uuid) returns jsonb language sql security definer as
$$ select to_jsonb(t) from qarar_execution.action_items t where id=p_id $$;
create function pg_temp.s106_audits(p_action text) returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action=p_action and organization_id='a7000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s106_events(p_id uuid) returns bigint language sql security definer as
$$ select count(*) from qarar_execution.action_item_events where action_item_id=p_id $$;
create function pg_temp.s106_list(p_list text) returns jsonb language sql as
$$ select coalesce(jsonb_agg(t->>'id'),'[]'::jsonb) from jsonb_array_elements(api_v2.list_my_tasks_v2()->p_list) t $$;

select pg_temp.s106_seed();

select is((select count(*)::integer from qarar_iam.system_permission_catalog() where code in ('execution.tasks.read','execution.tasks.verify','execution.unit_tasks.execute')),3,'the catalog defines the three execution permissions');
select is((select count(*)::integer from public.permissions where organization_id='a7000000-0000-0000-0000-000000000001' and code in ('execution.tasks.read','execution.tasks.verify','execution.unit_tasks.execute')),3,'every organization is provisioned with them');

set local role authenticated;

-- The assignee starts, reports progress, attaches evidence and submits.
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000013');
select ok(pg_temp.s106_list('to_execute') ? 'a7000000-0000-0000-0000-0000000000b1','the assignee finds the task to execute');
select ok((select (t->>'is_overdue')::boolean from jsonb_array_elements(api_v2.list_my_tasks_v2()->'to_execute') t where t->>'id'='a7000000-0000-0000-0000-0000000000b3'),'a task past its due date is overdue');
select is(api_v2.get_task_v2('a7000000-0000-0000-0000-0000000000b1')->'viewer'->>'can_start','true','the assignee may start the task');
select throws_ok($$ select api_v2.start_task_v2('a7000000-0000-0000-0000-0000000000b1',now()-interval '1 day') $$,'40001',null,'a stale screen cannot start the task');
select is(api_v2.start_task_v2('a7000000-0000-0000-0000-0000000000b1',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'status','in_progress','the assignee starts the task');
select throws_ok($$ select api_v2.update_task_progress_v2('a7000000-0000-0000-0000-0000000000b1',150,null,pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1')) $$,'22023',null,'progress stays within 0 to 99 before completion');
select is((api_v2.update_task_progress_v2('a7000000-0000-0000-0000-0000000000b1',40,'Draft ready',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'progress_percent')::integer,40,'the assignee reports progress');
select throws_ok($$ select api_v2.submit_task_completion_v2('a7000000-0000-0000-0000-0000000000b1','Done',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1')) $$,'23514',null,'a task that requires evidence is not submitted without it');
select throws_ok($$ select api_v2.add_task_evidence_v2('a7000000-0000-0000-0000-0000000000b1','missing.pdf','tasks/a7000000-0000-0000-0000-0000000000b1/missing.pdf','application/pdf',2048,null) $$,'23514',null,'evidence must exist in the private store');
select throws_ok($$ select api_v2.add_task_evidence_v2('a7000000-0000-0000-0000-0000000000b1','evidence.pdf','tasks/a7000000-0000-0000-0000-0000000000b2/evidence.pdf','application/pdf',2048,null) $$,'22023',null,'evidence belongs under its own task''s path');
select ok(api_v2.add_task_evidence_v2('a7000000-0000-0000-0000-0000000000b1','evidence.pdf','tasks/a7000000-0000-0000-0000-0000000000b1/evidence.pdf','application/pdf',2048,'Signed plan') ? 'id','the assignee attaches evidence');
select is(api_v2.submit_task_completion_v2('a7000000-0000-0000-0000-0000000000b1','Done',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'status','submitted','the assignee submits the task for verification');
select throws_ok($$ select api_v2.remove_task_evidence_v2((api_v2.get_task_v2('a7000000-0000-0000-0000-0000000000b1')->'evidence'->0->>'id')::uuid) $$,'23514',null,'evidence is frozen once submitted');

-- Verifiers: the follow-up person, the issuing chair, a governance officer.
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000018');
select throws_ok($$ select api_v2.get_task_v2('a7000000-0000-0000-0000-0000000000b1') $$,'42501',null,'an unrelated member cannot read the task');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000012');
select ok(pg_temp.s106_list('to_verify') ? 'a7000000-0000-0000-0000-0000000000b1','the follow-up person finds the task to verify');
select throws_ok($$ select api_v2.return_task_v2('a7000000-0000-0000-0000-0000000000b1','No',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1')) $$,'22023',null,'a return needs a reason');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000011');
select is(api_v2.return_task_v2('a7000000-0000-0000-0000-0000000000b1','Attach the signed version',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'status','in_progress','the issuing chair returns the task');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000013');
select is(api_v2.submit_task_completion_v2('a7000000-0000-0000-0000-0000000000b1','Signed version attached',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'status','submitted','the assignee submits again');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000014');
select is(api_v2.verify_task_completion_v2('a7000000-0000-0000-0000-0000000000b1','Verified',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1'))->>'status','completed','a governance officer verifies the completion');
select is((pg_temp.s106_task('a7000000-0000-0000-0000-0000000000b1')->>'progress_percent')::integer,100,'a completed task is at 100 percent');
select ok(pg_temp.s106_task('a7000000-0000-0000-0000-0000000000b1')->>'completed_at' is not null,'the completion time is recorded');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000013');
select throws_ok($$ select api_v2.start_task_v2('a7000000-0000-0000-0000-0000000000b1',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b1')) $$,'23514',null,'a completed task takes no further step');

-- A unit's task: only holders of the unit permission execute it; nobody verifies their own submission.
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000018');
select throws_ok($$ select api_v2.start_task_v2('a7000000-0000-0000-0000-0000000000b2',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b2')) $$,'42501',null,'a unit member without the permission cannot execute the unit''s task');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000017');
select ok(pg_temp.s106_list('to_execute') ? 'a7000000-0000-0000-0000-0000000000b2','the unit executor finds the unit''s task');
select is(api_v2.submit_task_completion_v2('a7000000-0000-0000-0000-0000000000b2','Departments informed',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b2'))->>'status','submitted','a task without required evidence is submitted directly');
select throws_ok($$ select api_v2.verify_task_completion_v2('a7000000-0000-0000-0000-0000000000b2','ok',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b2')) $$,'42501',null,'nobody verifies their own submission');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000012');
select is(api_v2.verify_task_completion_v2('a7000000-0000-0000-0000-0000000000b2','Confirmed',pg_temp.s106_token('a7000000-0000-0000-0000-0000000000b2'))->>'status','completed','the follow-up person verifies it');
select is(jsonb_array_length(pg_temp.s106_list('following')),3,'the follow-up person follows all three tasks');

-- Trail, audit and isolation.
select ok(pg_temp.s106_events('a7000000-0000-0000-0000-0000000000b1')>=7,'every step of the task is recorded');
select is(pg_temp.s106_audits('execution.task.verify'),2::bigint,'every verification is audited');
select pg_temp.s106_as('a7000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.get_task_v2('a7000000-0000-0000-0000-0000000000b1') $$,'P0002',null,'another tenant cannot read the task');

select * from finish();
rollback;
