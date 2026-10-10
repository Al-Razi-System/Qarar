-- Members who are voting in an open round see who has voted, never how.
-- Decision of the product owner, 2026-10-10 (docs/design/HANDOFF_AR.md).
begin;
create extension if not exists pgtap;
select plan(14);

insert into public.organizations(id,code,name_ar) values
('86000000-0000-0000-0000-000000000001','s86-prod','Sprint 03 Production'),
('86000000-0000-0000-0000-000000000002','s86-foreign','Sprint 03 Foreign');
insert into auth.users(id,email) values
('86000000-0000-0000-0000-000000000011','manager@s86.test'),
('86000000-0000-0000-0000-000000000012','member1@s86.test'),
('86000000-0000-0000-0000-000000000013','member2@s86.test'),
('86000000-0000-0000-0000-000000000014','foreign@s86.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('86000000-0000-0000-0000-000000000011','86000000-0000-0000-0000-000000000001','manager@s86.test','Session Manager'),
('86000000-0000-0000-0000-000000000012','86000000-0000-0000-0000-000000000001','member1@s86.test','Member One'),
('86000000-0000-0000-0000-000000000013','86000000-0000-0000-0000-000000000001','member2@s86.test','Member Two'),
('86000000-0000-0000-0000-000000000014','86000000-0000-0000-0000-000000000002','foreign@s86.test','Foreign');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('86000000-0000-0000-0000-000000000021','86000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('86000000-0000-0000-0000-000000000022','86000000-0000-0000-0000-000000000001',
 '86000000-0000-0000-0000-000000000021','main','Main Council',60);
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('86000000-0000-0000-0000-000000000031','86000000-0000-0000-0000-000000000001','s86_manager','Manager','governance_unit'),
('86000000-0000-0000-0000-000000000032','86000000-0000-0000-0000-000000000001','s86_member','Member','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('86000000-0000-0000-0000-000000000041','86000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('86000000-0000-0000-0000-000000000042','86000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('86000000-0000-0000-0000-000000000043','86000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('86000000-0000-0000-0000-000000000044','86000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('86000000-0000-0000-0000-000000000045','86000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('86000000-0000-0000-0000-000000000046','86000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('86000000-0000-0000-0000-000000000047','86000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('86000000-0000-0000-0000-000000000048','86000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('86000000-0000-0000-0000-000000000049','86000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('86000000-0000-0000-0000-000000000050','86000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('86000000-0000-0000-0000-000000000051','86000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('86000000-0000-0000-0000-000000000052','86000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('86000000-0000-0000-0000-000000000053','86000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics');
insert into public.role_permissions(organization_id,role_id,permission_id)
select '86000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000031',id
from public.permissions
where organization_id='86000000-0000-0000-0000-000000000001'
  and left(id::text,8)='86000000';
insert into public.role_permissions(organization_id,role_id,permission_id)
select '86000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000032',id
from public.permissions where id in(
 '86000000-0000-0000-0000-000000000042','86000000-0000-0000-0000-000000000044',
 '86000000-0000-0000-0000-000000000046','86000000-0000-0000-0000-000000000048',
 '86000000-0000-0000-0000-000000000049');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('86000000-0000-0000-0000-000000000061','86000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000011','86000000-0000-0000-0000-000000000022','86000000-0000-0000-0000-000000000031'),
('86000000-0000-0000-0000-000000000062','86000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000012','86000000-0000-0000-0000-000000000022','86000000-0000-0000-0000-000000000032'),
('86000000-0000-0000-0000-000000000063','86000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000013','86000000-0000-0000-0000-000000000022','86000000-0000-0000-0000-000000000032');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('86000000-0000-0000-0000-000000000071','86000000-0000-0000-0000-000000000001','TOP-S86','Voting Topic',
 '86000000-0000-0000-0000-000000000022','86000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('86000000-0000-0000-0000-000000000081','86000000-0000-0000-0000-000000000001','MTG-S86-1','86000000-0000-0000-0000-000000000022','Voting Meeting',current_date,'86000000-0000-0000-0000-000000000011','ready_to_start'),
('86000000-0000-0000-0000-000000000082','86000000-0000-0000-0000-000000000001','MTG-S86-2','86000000-0000-0000-0000-000000000022','Failed Quorum Meeting',current_date,'86000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('86000000-0000-0000-0000-000000000091','86000000-0000-0000-0000-000000000001',
 '86000000-0000-0000-0000-000000000081','86000000-0000-0000-0000-000000000071',1);


create temporary table s86_state(round_id uuid);
insert into s86_state default values;
grant select,insert,update,delete on s86_state to authenticated;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('86000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='86000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance((select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000011'),'present','Chair verified in the room',(select updated_at from public.attendance_records where id=(select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000011')));
select api_v1.verify_attendance((select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000012'),'present','Member verified in the room',(select updated_at from public.attendance_records where id=(select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000012')));
select api_v1.verify_attendance((select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000013'),'absent','Did not attend',(select updated_at from public.attendance_records where id=(select id from public.attendance_records where meeting_id='86000000-0000-0000-0000-000000000081' and user_id='86000000-0000-0000-0000-000000000013')));
select api_v1.recalculate_meeting_quorum('86000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('86000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='86000000-0000-0000-0000-000000000081'));
update s86_state set round_id=(api_v1.open_voting_round('86000000-0000-0000-0000-000000000091',
 (select updated_at from public.meetings where id='86000000-0000-0000-0000-000000000081'))->>'voting_round_id')::uuid;

-- Preceding stage: the eligible member votes.
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(api_v1.cast_vote((select round_id from s86_state),'approve','Supports proposal')->>'accepted','true','eligible member casts a vote');

-- Changed stage: the same member reads the open round.
select is(jsonb_array_length(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'participation'),2,'eligible member sees every eligible voter of the open round');
select is((api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->>'votes_cast_count')::int,1,'eligible member sees how many have voted');
select is((select count(*)::int from jsonb_array_elements(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'participation') person where (person->>'has_voted')::boolean),1,'eligible member sees who has voted');
select is((select array_agg(distinct key order by key) from jsonb_array_elements(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'participation') person, jsonb_object_keys(person) key),
 array['full_name_ar','has_voted','user_id'],'participation carries a name and a yes/no only, never a vote');
select is(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'approve_count','null'::jsonb,'option totals stay hidden from a member while the round is open');
select ok(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')::text not like '%Supports proposal%','vote notes are not exposed in the rounds list');

-- Denied role: a council member with voting.read who is not eligible in this round.
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000013","role":"authenticated"}';
select is(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'participation','[]'::jsonb,'a member who is not eligible in the round sees no participation');
select is(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'votes_cast_count','null'::jsonb,'a member who is not eligible in the round sees no count');

-- Denied role: another organization.
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000014","role":"authenticated"}';
select is(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081'),'[]'::jsonb,'another organization sees no rounds');

-- Allowed role unchanged: the voting manager.
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(jsonb_array_length(api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->'participation'),2,'voting manager still sees participation');
select is(api_v1.cast_vote((select round_id from s86_state),'approve',null)->>'accepted','true','second eligible member casts a vote');

-- Following stage: closing still works and freezes the result.
select is(api_v1.close_voting_round((select round_id from s86_state),'Voting completed')->>'result','approved','round closes after full participation');
set local "request.jwt.claims"='{"sub":"86000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is((api_v1.list_meeting_voting_rounds('86000000-0000-0000-0000-000000000081')->0->>'approve_count')::int,2,'member sees the frozen totals after the round closes');

select * from finish();
rollback;
