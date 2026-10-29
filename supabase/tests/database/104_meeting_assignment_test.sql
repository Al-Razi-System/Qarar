-- Assignments from the live room (owner review 2026-10-15, batch 5b): the
-- chair issues an execution task during the session, before the decision is
-- approved; the rapporteur proposes one for the chair to confirm.
-- Impact map: docs/engineering/impact/MEETING_ASSIGNMENT_AR.md
begin;
create extension if not exists pgtap;
select plan(47);

insert into public.organizations(id,code,name_ar) values
('a5000000-0000-0000-0000-000000000001','s104','Assignment'),
('a5000000-0000-0000-0000-000000000002','s104b','Other Tenant');
insert into auth.users(id,email) values
('a5000000-0000-0000-0000-000000000011','chair@s104.test'),
('a5000000-0000-0000-0000-000000000012','rapporteur@s104.test'),
('a5000000-0000-0000-0000-000000000013','member@s104.test'),
('a5000000-0000-0000-0000-000000000014','planner@s104.test'),
('a5000000-0000-0000-0000-000000000015','admin@s104.test'),
('a5000000-0000-0000-0000-000000000016','other@s104b.test');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('a5000000-0000-0000-0000-000000000011','a5000000-0000-0000-0000-000000000001','chair@s104.test','Council Chair',false),
('a5000000-0000-0000-0000-000000000012','a5000000-0000-0000-0000-000000000001','rapporteur@s104.test','Council Rapporteur',false),
('a5000000-0000-0000-0000-000000000013','a5000000-0000-0000-0000-000000000001','member@s104.test','Council Member',false),
('a5000000-0000-0000-0000-000000000014','a5000000-0000-0000-0000-000000000001','planner@s104.test','University Planner',false),
('a5000000-0000-0000-0000-000000000015','a5000000-0000-0000-0000-000000000001','admin@s104.test','System Admin',true),
('a5000000-0000-0000-0000-000000000016','a5000000-0000-0000-0000-000000000002','other@s104b.test','Other Tenant User',false);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('a5000000-0000-0000-0000-000000000021','a5000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000021','faculty','Faculty Council',50),
('a5000000-0000-0000-0000-000000000023','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000021','registry','Registry Office',50);
delete from public.roles where organization_id='a5000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('a5000000-0000-0000-0000-000000000031','a5000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('a5000000-0000-0000-0000-000000000032','a5000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('a5000000-0000-0000-0000-000000000033','a5000000-0000-0000-0000-000000000001','s104_member','Member','governance_unit');
insert into public.permissions(organization_id,code,module,action,context_scope,name_ar)
select 'a5000000-0000-0000-0000-000000000001',v.code,split_part(v.code,'.',1),split_part(v.code,'.',2),'governance_unit',v.code
from (values ('meetings.manage'),('agenda.manage'),('attendance.read'),('attendance.manage'),('attendance.verify'),('attendance.lock'),('quorum.read'),('quorum.manage')) v(code)
on conflict (organization_id,code) do nothing;
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='a5000000-0000-0000-0000-000000000001'
 and code in ('meetings.manage','agenda.manage','attendance.read','attendance.manage','attendance.verify','attendance.lock','quorum.read','quorum.manage');
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'a5000000-0000-0000-0000-000000000001',r.role_id,p.id
from public.permissions p
cross join (values ('a5000000-0000-0000-0000-000000000032'::uuid),('a5000000-0000-0000-0000-000000000033'::uuid)) r(role_id)
where p.organization_id='a5000000-0000-0000-0000-000000000001' and p.code in ('attendance.read','quorum.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('a5000000-0000-0000-0000-000000000061','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000011','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000031'),
('a5000000-0000-0000-0000-000000000062','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000012','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000032'),
('a5000000-0000-0000-0000-000000000063','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000013','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('a5000000-0000-0000-0000-000000000071','a5000000-0000-0000-0000-000000000001','TOP-S102-1','Plan','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000012','approved'),
('a5000000-0000-0000-0000-000000000072','a5000000-0000-0000-0000-000000000001','TOP-S102-2','Budget','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000012','approved'),
('a5000000-0000-0000-0000-000000000073','a5000000-0000-0000-0000-000000000001','TOP-S102-3','Next meeting topic','a5000000-0000-0000-0000-000000000022','a5000000-0000-0000-0000-000000000012','approved');
-- M1 runs now; M2 has not started.
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000001','MTG-S102-1','a5000000-0000-0000-0000-000000000022','Live meeting',current_date,'a5000000-0000-0000-0000-000000000011','ready_to_start'),
('a5000000-0000-0000-0000-000000000082','a5000000-0000-0000-0000-000000000001','MTG-S102-2','a5000000-0000-0000-0000-000000000022','Next meeting',current_date+7,'a5000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('a5000000-0000-0000-0000-000000000091','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000071',1),
('a5000000-0000-0000-0000-000000000092','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000072',2),
('a5000000-0000-0000-0000-000000000093','a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000082','a5000000-0000-0000-0000-000000000073',1);

create function pg_temp.s104_as(p_user text) returns void language sql as
$$ select set_config('request.jwt.claims',json_build_object('sub',p_user,'role','authenticated')::text,true)::text; select null::void $$;
create function pg_temp.s104_meeting_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.meetings where id='a5000000-0000-0000-0000-000000000081' $$;
create function pg_temp.s104_item_token(p_id uuid) returns timestamptz language sql security definer as
$$ select updated_at from qarar_meetings.agenda_items where id=p_id $$;
-- Item 1 has the decision the rapporteur drafted in the room; item 2 has none.
insert into qarar_decisions.decisions(id,organization_id,decision_no,topic_id,meeting_id,agenda_item_id,governance_unit_id,decision_text,decision_status,requires_approval,issued_by_user_id) values
('a5000000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-000000000001','DEC-S104-1','a5000000-0000-0000-0000-000000000071','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000091','a5000000-0000-0000-0000-000000000022','Approve the plan as presented.','ready_for_approval',true,'a5000000-0000-0000-0000-000000000012');
-- The roster the meeting will run with (the attendance triggers resolve the chair's tenant).
create function pg_temp.s104_seat_roster() returns void language sql security definer as
$$ insert into qarar_attendance.attendance_records(organization_id,meeting_id,user_id,membership_id,attendance_status) values
('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000011','a5000000-0000-0000-0000-000000000061','present'),
('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000012','a5000000-0000-0000-0000-000000000062','present'),
('a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000081','a5000000-0000-0000-0000-000000000013','a5000000-0000-0000-0000-000000000063','present') $$;
create function pg_temp.s104_audits(p_action text) returns bigint language sql security definer as
$$ select count(*) from qarar_audit.audit_logs where action=p_action and organization_id='a5000000-0000-0000-0000-000000000001' $$;
create function pg_temp.s104_task(p_assignment uuid) returns jsonb language sql security definer as
$$ select coalesce((select to_jsonb(t) from qarar_execution.action_items t where meeting_assignment_id=p_assignment),'{}'::jsonb) $$;
create function pg_temp.s104_assignment(p_id uuid) returns jsonb language sql as
$$ select a from jsonb_array_elements(api_v2.list_meeting_assignments_v2('a5000000-0000-0000-0000-000000000081')->'assignments') a where a->>'id'=p_id::text $$;
create function pg_temp.s104_decision_status() returns text language sql security definer as
$$ select decision_status from qarar_decisions.decisions where id='a5000000-0000-0000-0000-0000000000a1' $$;
-- A task written straight into execution, outside the room.
create function pg_temp.s104_raw_task(p_assignment uuid) returns void language sql security definer as
$$ insert into qarar_execution.action_items(organization_id,action_no,decision_id,topic_id,assigned_unit_id,title_ar,meeting_assignment_id)
   values('a5000000-0000-0000-0000-000000000001','TSK-RAW-'||gen_random_uuid(),'a5000000-0000-0000-0000-0000000000a1','a5000000-0000-0000-0000-000000000071','a5000000-0000-0000-0000-000000000023','Raw task',p_assignment) $$;
create function pg_temp.s104_reject_decision() returns void language sql security definer as
$$ update qarar_decisions.decisions set decision_status='rejected' where id='a5000000-0000-0000-0000-0000000000a1' $$;
create function pg_temp.s104_close_meeting() returns void language sql security definer as
$$ set local session_replication_role=replica;
   update qarar_meetings.meetings set status='closed' where id='a5000000-0000-0000-0000-000000000081';
   set local session_replication_role=origin $$;
create function pg_temp.s104_add_responsible() returns void language sql security definer as
$$ insert into qarar_core.organizational_unit_responsibles(
     organization_id,governance_unit_id,user_id,reason,created_by_user_id
   ) values(
     'a5000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000023',
     'a5000000-0000-0000-0000-000000000014','Explicit test responsibility',
     'a5000000-0000-0000-0000-000000000011'
   ) $$;
create function pg_temp.s104_batch_assignment_count(p_batch uuid) returns bigint language sql security definer as
$$ select count(*) from qarar_meetings.meeting_assignments where assignment_batch_id=p_batch $$;
create function pg_temp.s104_batch_task_count(p_batch uuid) returns bigint language sql security definer as
$$ select count(*) from qarar_execution.action_items a join qarar_meetings.meeting_assignments ma on ma.id=a.meeting_assignment_id where ma.assignment_batch_id=p_batch $$;
create function pg_temp.s104_batch_field(p_batch uuid,p_field text) returns text language sql security definer as
$$ select case p_field when 'target_count' then target_count::text when 'status' then status end from qarar_meetings.meeting_assignment_batches where id=p_batch $$;

select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
select pg_temp.s104_seat_roster();
set local role authenticated;

select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'23514',null,'no assignment before the session opens');
select api_v1.open_meeting_session('a5000000-0000-0000-0000-000000000081',pg_temp.s104_meeting_token());

-- Preconditions and validation.
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000092','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'23514',null,'an item without a decision takes no assignment');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'22023',null,'an assignment needs a title of five characters or more');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,null,null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'22023',null,'an assignment needs a person or a unit');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date-1,'a5000000-0000-0000-0000-000000000012',false) $$,'22023',null,'an assignment is not due in the past');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000016',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'22023',null,'another tenant''s user cannot be assigned');

-- Authority.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000013');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'42501',null,'a member cannot assign');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000015');
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'42501',null,'a system administrator cannot assign');

-- The chair issues: the task executes at once, before the decision is approved.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
create temp table s104_ids(name text primary key, id uuid);
grant select, insert on s104_ids to authenticated;
insert into s104_ids select 'chair', (api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan','Within the semester','a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false)->>'id')::uuid;
select is(pg_temp.s104_assignment((select id from s104_ids where name='chair'))->>'status','active','the chair''s assignment is issued at once');
select is(pg_temp.s104_task((select id from s104_ids where name='chair'))->>'status','new','it is an execution task at once');
select ok(pg_temp.s104_task((select id from s104_ids where name='chair'))->>'action_no' ~ '^TSK-[0-9]{4}-[0-9]{6}$','the task gets a TSK reference from the database');
select is(pg_temp.s104_decision_status(),'ready_for_approval','the decision itself is still awaiting approval');
select is(pg_temp.s104_audits('meetings.assignment.issue'),1::bigint,'issuing is audited');

-- The rapporteur proposes; only the chair confirms.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000012');
insert into s104_ids select 'proposal', (api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Inform the departments',null,null,'a5000000-0000-0000-0000-000000000023',null,'a5000000-0000-0000-0000-000000000012',false)->>'id')::uuid;
select is(pg_temp.s104_assignment((select id from s104_ids where name='proposal'))->>'status','proposed','the rapporteur''s assignment is a proposal');
select is(pg_temp.s104_task((select id from s104_ids where name='proposal'))->>'id',null,'a proposal is not executed');
select throws_ok($$ select api_v2.confirm_meeting_assignment_v2((select id from s104_ids where name='proposal'),0) $$,'42501',null,'the rapporteur cannot confirm');
select throws_ok($$ select api_v2.withdraw_meeting_assignment_v2((select id from s104_ids where name='chair'),1) $$,'42501',null,'the rapporteur cannot withdraw an issued assignment');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.confirm_meeting_assignment_v2((select id from s104_ids where name='proposal'),5) $$,'40001',null,'a stale screen cannot confirm');
select is(api_v2.confirm_meeting_assignment_v2((select id from s104_ids where name='proposal'),0)->>'status','active','the chair confirms the proposal');
select is(pg_temp.s104_task((select id from s104_ids where name='proposal'))->>'assigned_unit_id','a5000000-0000-0000-0000-000000000023','the confirmed proposal executes, assigned to the unit');
select throws_ok($$ select api_v2.confirm_meeting_assignment_v2((select id from s104_ids where name='proposal'),1) $$,'23514',null,'an issued assignment is not confirmed twice');

-- Withdrawing: the proposer before confirmation, the chair before work starts.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000012');
insert into s104_ids select 'withdrawn', (api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Draft a timetable',null,'a5000000-0000-0000-0000-000000000012',null,null,'a5000000-0000-0000-0000-000000000012',false)->>'id')::uuid;
select is(api_v2.withdraw_meeting_assignment_v2((select id from s104_ids where name='withdrawn'),0)->>'status','withdrawn','the rapporteur withdraws their own proposal');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
select is(api_v2.withdraw_meeting_assignment_v2((select id from s104_ids where name='proposal'),1)->>'status','withdrawn','the chair withdraws an issued assignment');
select is(pg_temp.s104_task((select id from s104_ids where name='proposal'))->>'status','cancelled','withdrawing cancels its task');

-- The old rule still holds for every other path.
select throws_ok($$ select pg_temp.s104_raw_task(null) $$,'23514',null,'a task without an assignment still waits for an approved decision');
select throws_ok($$ select pg_temp.s104_raw_task((select id from s104_ids where name='withdrawn')) $$,'23514',null,'a task cannot claim an assignment the chair did not issue');

-- Who reads what.
select is(jsonb_array_length(api_v2.list_meeting_assignments_v2('a5000000-0000-0000-0000-000000000081')->'options'->'users'),3,'the chair chooses among the meeting''s roster');
select is(api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','Planner',20)->'users'->0->>'id','a5000000-0000-0000-0000-000000000014','chair finds an active university user outside the council');
select is(jsonb_array_length(api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','p',20)->'users'),0,'one letter does not enumerate the university directory');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000012');
select is(api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','planner@s104',20)->'users'->0->>'name_ar','University Planner','rapporteur searches by email without IAM administration permission');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000013');
select throws_ok($$ select api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','Planner',20) $$,'42501',null,'member cannot search the university directory from assignments');
select is(pg_temp.s104_assignment((select id from s104_ids where name='chair'))->>'assigned_user_name_ar','Council Member','a member reads the assignments');
select is(api_v2.list_meeting_assignments_v2('a5000000-0000-0000-0000-000000000081')->'options','null'::jsonb,'a member is offered no choices');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000016');
select throws_ok($$ select api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','Planner',20) $$,'P0002',null,'another tenant cannot search this meeting assignment directory');
select throws_ok($$ select api_v2.list_meeting_assignments_v2('a5000000-0000-0000-0000-000000000081') $$,'P0002',null,'another tenant cannot read the assignments');

-- One logical assignment may target several people or units atomically.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
select pg_temp.s104_add_responsible();
select is(
  api_v2.preview_meeting_assignment_targets_v2(
    'a5000000-0000-0000-0000-000000000091',
    '[{"kind":"unit","id":"a5000000-0000-0000-0000-000000000023"}]'::jsonb
  )->'targets'->0->>'resolved_user_id',
  'a5000000-0000-0000-0000-000000000014','an explicit unit responsible is resolved before issue'
);
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000013');
select throws_ok($$ select api_v2.preview_meeting_assignment_targets_v2(
  'a5000000-0000-0000-0000-000000000091','[{"kind":"user","id":"a5000000-0000-0000-0000-000000000013"}]'::jsonb
) $$,'42501',null,'a member cannot preview assignment targets');
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
insert into s104_ids select 'batch',(
  api_v2.propose_meeting_assignment_batch_v2(
    'a5000000-0000-0000-0000-000000000091','Prepare two reports',null,
    '[{"kind":"user","id":"a5000000-0000-0000-0000-000000000013"},{"kind":"unit","id":"a5000000-0000-0000-0000-000000000023"}]'::jsonb,
    current_date+20,'a5000000-0000-0000-0000-000000000012',true,
    'a5000000-0000-0000-0000-0000000000f1'
  )->>'id')::uuid;
select is(pg_temp.s104_batch_field((select id from s104_ids where name='batch'),'target_count'),'2','a batch records both resolved targets');
select is(pg_temp.s104_batch_field((select id from s104_ids where name='batch'),'status'),'active','the chair issues the whole batch immediately');
select is(pg_temp.s104_batch_assignment_count((select id from s104_ids where name='batch')),2::bigint,'each target receives one compatible meeting assignment');
select is(pg_temp.s104_batch_task_count((select id from s104_ids where name='batch')),2::bigint,'each target receives one independent execution task');
select is((api_v2.propose_meeting_assignment_batch_v2(
  'a5000000-0000-0000-0000-000000000091','Prepare two reports',null,
  '[{"kind":"user","id":"a5000000-0000-0000-0000-000000000013"},{"kind":"unit","id":"a5000000-0000-0000-0000-000000000023"}]'::jsonb,
  current_date+20,'a5000000-0000-0000-0000-000000000012',true,
  'a5000000-0000-0000-0000-0000000000f1'
)->>'id')::uuid,(select id from s104_ids where name='batch'),'retrying the same client request does not duplicate the batch');
select is(pg_temp.s104_batch_task_count((select id from s104_ids where name='batch')),2::bigint,'an idempotent retry does not duplicate tasks');
select throws_ok($$ select api_v2.propose_meeting_assignment_batch_v2(
  'a5000000-0000-0000-0000-000000000091','Blocked atomic batch',null,
  '[{"kind":"user","id":"a5000000-0000-0000-0000-000000000013"},{"kind":"unit","id":"a5000000-0000-0000-0000-000000000022"}]'::jsonb,
  current_date+20,'a5000000-0000-0000-0000-000000000012',false,
  'a5000000-0000-0000-0000-0000000000f2'
) $$,'23514',null,'one unresolved unit blocks the whole batch before any task is issued');

-- Rejecting the decision later cancels the tasks the session issued.
select pg_temp.s104_as('a5000000-0000-0000-0000-000000000011');
select throws_ok($$ select api_v2.search_meeting_assignment_options_v2('a5000000-0000-0000-0000-000000000081','Planner',21) $$,'22023',null,'search limit is bounded');
select pg_temp.s104_reject_decision();
select is(pg_temp.s104_task((select id from s104_ids where name='chair'))->>'status','cancelled','a rejected decision cancels the session''s tasks');

select pg_temp.s104_close_meeting();
select throws_ok($$ select api_v2.propose_meeting_assignment_v2('a5000000-0000-0000-0000-000000000091','Update the study plan',null,'a5000000-0000-0000-0000-000000000013',null,current_date+30,'a5000000-0000-0000-0000-000000000012',false) $$,'23514',null,'no assignment after the session');

select * from finish();
rollback;
