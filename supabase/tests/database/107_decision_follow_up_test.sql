-- Following decisions, managing their tasks and closing them (phase 3b).
-- Impact map: docs/engineering/impact/DECISION_FOLLOW_UP_AR.md
begin;
create extension if not exists pgtap;
select plan(28);

insert into public.organizations(id,code,name_ar) values
('a8000000-0000-0000-0000-000000000001','s107','Follow-up'),
('a8000000-0000-0000-0000-000000000002','s107b','Other Tenant');
insert into auth.users(id,email) values
('a8000000-0000-0000-0000-000000000011','chair@s107.test'),('a8000000-0000-0000-0000-000000000012','rapporteur@s107.test'),('a8000000-0000-0000-0000-000000000013','assignee@s107.test'),('a8000000-0000-0000-0000-000000000014','officer@s107.test'),
('a8000000-0000-0000-0000-000000000016','other@s107b.test'),('a8000000-0000-0000-0000-000000000018','unrelated@s107.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a8000000-0000-0000-0000-000000000011','a8000000-0000-0000-0000-000000000001','chair@s107.test','Council Chair',false),
('a8000000-0000-0000-0000-000000000012','a8000000-0000-0000-0000-000000000001','rapporteur@s107.test','Council Rapporteur',false),
('a8000000-0000-0000-0000-000000000013','a8000000-0000-0000-0000-000000000001','assignee@s107.test','Assignee',false),
('a8000000-0000-0000-0000-000000000014','a8000000-0000-0000-0000-000000000001','officer@s107.test','Governance Officer',false),
('a8000000-0000-0000-0000-000000000016','a8000000-0000-0000-0000-000000000002','other@s107b.test','Other Tenant User',false),
('a8000000-0000-0000-0000-000000000018','a8000000-0000-0000-0000-000000000001','unrelated@s107.test','Unrelated Member',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a8000000-0000-0000-0000-000000000021','a8000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('a8000000-0000-0000-0000-000000000023','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000021','registry','Registry Office',50);
delete from public.roles where organization_id='a8000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a8000000-0000-0000-0000-000000000031','a8000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a8000000-0000-0000-0000-000000000032','a8000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a8000000-0000-0000-0000-000000000033','a8000000-0000-0000-0000-000000000001','s107_member','Member','governance_unit'),
('a8000000-0000-0000-0000-000000000034','a8000000-0000-0000-0000-000000000001','s107_officer','Governance officer','organization');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000034',id from public.permissions
where organization_id='a8000000-0000-0000-0000-000000000001' and code in ('execution.tasks.read','execution.tasks.manage');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a8000000-0000-0000-0000-000000000061','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000011','a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000031'),
('a8000000-0000-0000-0000-000000000062','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000012','a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000032'),
('a8000000-0000-0000-0000-000000000063','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000013','a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000033'),
('a8000000-0000-0000-0000-000000000064','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000014','a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000034'),
('a8000000-0000-0000-0000-000000000068','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000018','a8000000-0000-0000-0000-000000000023','a8000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a8000000-0000-0000-0000-000000000071','a8000000-0000-0000-0000-000000000001','TOP-S107-1','Plan','a8000000-0000-0000-0000-000000000022','a8000000-0000-0000-0000-000000000012','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a8000000-0000-0000-0000-000000000081','a8000000-0000-0000-0000-000000000001','MEET-S107-1','a8000000-0000-0000-0000-000000000022','Council meeting',current_date,'a8000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a8000000-0000-0000-0000-000000000091','a8000000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000081','a8000000-0000-0000-0000-000000000071',1);

create function pg_temp.s107_seed() returns void language sql security definer as
$$ set local session_replication_role=replica;
   insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,requires_approval,issued_by_user_id)
   values('a8000000-0000-0000-0000-0000000000a1','a8000000-0000-0000-0000-000000000001','DECN-S107-1','a8000000-0000-0000-0000-000000000071','a8000000-0000-0000-0000-000000000081','a8000000-0000-0000-0000-000000000091','a8000000-0000-0000-0000-000000000022','Approve the plan as presented.','approved',true,'a8000000-0000-0000-0000-000000000011');
   insert into qarar_execution.action_items(id,organization_id,action_no,decision_id,topic_id,assigned_user_id,follow_up_user_id,title_ar,due_date) values
   ('a8000000-0000-0000-0000-0000000000b1','a8000000-0000-0000-0000-000000000001','TSK-S107-1','a8000000-0000-0000-0000-0000000000a1','a8000000-0000-0000-0000-000000000071','a8000000-0000-0000-0000-000000000013','a8000000-0000-0000-0000-000000000012','Update the study plan',current_date+30),
   ('a8000000-0000-0000-0000-0000000000b2','a8000000-0000-0000-0000-000000000001','TSK-S107-2','a8000000-0000-0000-0000-0000000000a1','a8000000-0000-0000-0000-000000000071','a8000000-0000-0000-0000-000000000013','a8000000-0000-0000-0000-000000000012','Inform the departments',current_date-2);
   set local session_replication_role=origin $$;
create function pg_temp.s107_complete(p_id uuid) returns void language sql security definer as
$$ update qarar_execution.action_items set status='completed', progress_percent=100, completed_at=now() where id=p_id $$;
create function pg_temp.s107_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s107_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_execution.action_items where id=p_id $$;
create function pg_temp.s107_dtoken() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id='a8000000-0000-0000-0000-0000000000a1' $$;
create function pg_temp.s107_task(p_id uuid) returns jsonb language sql security definer as
$$ select to_jsonb(t) from qarar_execution.action_items t where id=p_id $$;
create function pg_temp.s107_audits(p_action text) returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action=p_action and organization_id='a8000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s107_events(p_type text) returns bigint language sql security definer as
$$ select count(*) from qarar_execution.action_item_events where event_type=p_type and organization_id='a8000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s107_history() returns text language sql security definer as
$$ select reason from qarar_decisions.decision_status_history where decision_id='a8000000-0000-0000-0000-0000000000a1' and to_status='closed' $$;
create function pg_temp.s107_board(p_status text) returns jsonb language sql as
$$ select d from jsonb_array_elements(api_v2.list_decision_follow_up_v2(p_status)) d where d->>'id'='a8000000-0000-0000-0000-0000000000a1' $$;

select pg_temp.s107_seed();
select ok(exists(select 1 from qarar_iam.system_permission_catalog() where code='execution.tasks.manage'),'the catalog defines the task management permission');

set local role authenticated;

-- Who sees the board.
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000011');
select is((pg_temp.s107_board('open')->>'open_tasks')::integer,2,'the chair sees the decision with its two open tasks');
select is((pg_temp.s107_board('open')->>'overdue_tasks')::integer,1,'the board counts the overdue task');
select is(pg_temp.s107_board('open')->>'can_close','false','an open decision with open tasks cannot close');
select ok(pg_temp.s107_board('open')->>'close_blocked_reason' is not null,'the board says why it cannot close');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000012');
select ok(pg_temp.s107_board('open') is not null,'the rapporteur follows the council''s decisions');
select is(pg_temp.s107_board('open')->>'can_manage','false','the rapporteur does not manage tasks');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000014');
select ok(pg_temp.s107_board('open') is not null,'a holder of the read permission follows every decision');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000018');
select is(pg_temp.s107_board('all'),null,'an unrelated member sees no decision');
select throws_ok($$ select api_v2.list_decision_tasks_v2('a8000000-0000-0000-0000-0000000000a1') $$,'42501',null,'an unrelated member cannot read the decision''s tasks');

-- Managing a task: the chair or the management permission, with a reason.
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000012');
select throws_ok($$ select api_v2.cancel_task_v2('a8000000-0000-0000-0000-0000000000b2','No longer needed',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b2')) $$,'42501',null,'the rapporteur cannot cancel a task');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000013');
select throws_ok($$ select api_v2.extend_task_due_date_v2('a8000000-0000-0000-0000-0000000000b1',current_date+60,'Need more time',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b1')) $$,'42501',null,'the assignee cannot extend their own task');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.cancel_task_v2('a8000000-0000-0000-0000-0000000000b2','No',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b2')) $$,'22023',null,'a cancellation needs a reason');
select throws_ok($$ select api_v2.extend_task_due_date_v2('a8000000-0000-0000-0000-0000000000b1',current_date-1,'Need more time',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b1')) $$,'22023',null,'a new due date is not in the past');
select throws_ok($$ select api_v2.extend_task_due_date_v2('a8000000-0000-0000-0000-0000000000b1',current_date+60,'Need more time',now()-interval '1 day') $$,'40001',null,'a stale screen cannot extend');
select is(api_v2.extend_task_due_date_v2('a8000000-0000-0000-0000-0000000000b1',current_date+60,'Awaiting the budget',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b1'))->>'due_date',(current_date+60)::text,'the chair extends the due date');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000014');
select is(api_v2.reassign_task_v2('a8000000-0000-0000-0000-0000000000b1',null,'a8000000-0000-0000-0000-000000000023','The registry owns this',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b1'))->>'assigned_unit_id','a8000000-0000-0000-0000-000000000023','a governance officer reassigns the task to a unit');
select is(pg_temp.s107_task('a8000000-0000-0000-0000-0000000000b1')->>'assigned_user_id',null,'the previous assignee is released');

-- Closing the decision only once its tasks are done or cancelled.
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.close_decision_v2('a8000000-0000-0000-0000-0000000000a1','All done',pg_temp.s107_dtoken()) $$,'23514',null,'a decision with open tasks does not close');
select is(api_v2.cancel_task_v2('a8000000-0000-0000-0000-0000000000b2','Superseded by the new plan',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b2'))->>'status','cancelled','the chair cancels a task with a reason');
select throws_ok($$ select api_v2.extend_task_due_date_v2('a8000000-0000-0000-0000-0000000000b2',current_date+5,'Need more time',pg_temp.s107_token('a8000000-0000-0000-0000-0000000000b2')) $$,'23514',null,'a cancelled task is not managed');
select pg_temp.s107_complete('a8000000-0000-0000-0000-0000000000b1');
select is(pg_temp.s107_board('open')->>'can_close','true','a decision whose tasks are all finished can close');
select is(api_v2.close_decision_v2('a8000000-0000-0000-0000-0000000000a1','All assignments finished',pg_temp.s107_dtoken())->>'decision_status','closed','the chair closes the decision');
select is(pg_temp.s107_history(),'All assignments finished','the decision''s history records why it closed');
select ok(pg_temp.s107_board('open') is null and pg_temp.s107_board('closed') is not null,'the board files the decision under closed');

-- Trail, audit and isolation.
select is(pg_temp.s107_events('cancel')+pg_temp.s107_events('extend')+pg_temp.s107_events('reassign'),3::bigint,'every management step is in the task trail');
select is(pg_temp.s107_audits('decisions.close'),1::bigint,'closing is audited');
select pg_temp.s107_as('a8000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.list_decision_tasks_v2('a8000000-0000-0000-0000-0000000000a1') $$,'P0002',null,'another tenant cannot read the decision');

select * from finish();
rollback;
