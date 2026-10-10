-- Committed fixture for decision_minutes_lock.sh: a meeting in minutes preparation
-- with one decision and a generated draft. Throwaway databases only.
\set ON_ERROR_STOP 1
insert into public.organizations(id,code,name_ar) values
('89000000-0000-0000-0000-000000000001','s89-prod','Lock Race Production'),
('89000000-0000-0000-0000-000000000002','s89-foreign','Lock Race Foreign');
insert into auth.users(id,email) values
('89000000-0000-0000-0000-000000000011','chair@s89.test'),
('89000000-0000-0000-0000-000000000012','rapporteur@s89.test'),
('89000000-0000-0000-0000-000000000013','member@s89.test'),
('89000000-0000-0000-0000-000000000014','foreign@s89.test'),
('89000000-0000-0000-0000-000000000015','sysadmin@s89.test'),
('89000000-0000-0000-0000-000000000016','secretary@s89.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('89000000-0000-0000-0000-000000000011','89000000-0000-0000-0000-000000000001','chair@s89.test','Council Chair'),
('89000000-0000-0000-0000-000000000012','89000000-0000-0000-0000-000000000001','rapporteur@s89.test','Council Rapporteur'),
('89000000-0000-0000-0000-000000000013','89000000-0000-0000-0000-000000000001','member@s89.test','Council Member'),
('89000000-0000-0000-0000-000000000014','89000000-0000-0000-0000-000000000002','foreign@s89.test','Foreign'),
('89000000-0000-0000-0000-000000000016','89000000-0000-0000-0000-000000000001','secretary@s89.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('89000000-0000-0000-0000-000000000015','89000000-0000-0000-0000-000000000001','sysadmin@s89.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('89000000-0000-0000-0000-000000000021','89000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000001',
 '89000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='89000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='89000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('89000000-0000-0000-0000-000000000031','89000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('89000000-0000-0000-0000-000000000032','89000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('89000000-0000-0000-0000-000000000033','89000000-0000-0000-0000-000000000001','s89_member','Member','governance_unit'),
('89000000-0000-0000-0000-000000000034','89000000-0000-0000-0000-000000000001','s89_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('89000000-0000-0000-0000-000000000041','89000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('89000000-0000-0000-0000-000000000042','89000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('89000000-0000-0000-0000-000000000043','89000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('89000000-0000-0000-0000-000000000044','89000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('89000000-0000-0000-0000-000000000045','89000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('89000000-0000-0000-0000-000000000046','89000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('89000000-0000-0000-0000-000000000047','89000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('89000000-0000-0000-0000-000000000048','89000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('89000000-0000-0000-0000-000000000049','89000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('89000000-0000-0000-0000-000000000051','89000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('89000000-0000-0000-0000-000000000052','89000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('89000000-0000-0000-0000-000000000053','89000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('89000000-0000-0000-0000-000000000054','89000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('89000000-0000-0000-0000-000000000055','89000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions');
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '89000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('89000000-0000-0000-0000-000000000031'::uuid),('89000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='89000000-0000-0000-0000-000000000001'
  and left(p.id::text,8)='89000000';
-- The rapporteur manages the agenda but not the meeting.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000032',id
from public.permissions where id in(
 '89000000-0000-0000-0000-000000000042','89000000-0000-0000-0000-000000000044',
 '89000000-0000-0000-0000-000000000046','89000000-0000-0000-0000-000000000048',
 '89000000-0000-0000-0000-000000000049','89000000-0000-0000-0000-000000000053',
 '89000000-0000-0000-0000-000000000054','89000000-0000-0000-0000-000000000055');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000033',id
from public.permissions where id in(
 '89000000-0000-0000-0000-000000000042','89000000-0000-0000-0000-000000000044',
 '89000000-0000-0000-0000-000000000046','89000000-0000-0000-0000-000000000048',
 '89000000-0000-0000-0000-000000000049','89000000-0000-0000-0000-000000000055');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('89000000-0000-0000-0000-000000000061','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000011','89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000031'),
('89000000-0000-0000-0000-000000000062','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000012','89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000032'),
('89000000-0000-0000-0000-000000000063','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000013','89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('89000000-0000-0000-0000-000000000071','89000000-0000-0000-0000-000000000001','TOP-S89','Decision Topic',
 '89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('89000000-0000-0000-0000-000000000081','89000000-0000-0000-0000-000000000001','MTG-S89-1','89000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'89000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('89000000-0000-0000-0000-000000000091','89000000-0000-0000-0000-000000000001',
 '89000000-0000-0000-0000-000000000081','89000000-0000-0000-0000-000000000071',1);


-- Run the meeting up to minutes preparation, statement by statement, as each actor.
set role authenticated;
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('89000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='89000000-0000-0000-0000-000000000081')) \g /dev/null
select api_v1.verify_attendance(ar.id,'present','Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='89000000-0000-0000-0000-000000000081' \g /dev/null
select api_v1.recalculate_meeting_quorum('89000000-0000-0000-0000-000000000081',true) \g /dev/null
select api_v1.lock_attendance_roster('89000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='89000000-0000-0000-0000-000000000081')) \g /dev/null
select (api_v1.open_voting_round('89000000-0000-0000-0000-000000000091',
 (select updated_at from public.meetings where id='89000000-0000-0000-0000-000000000081'))->>'voting_round_id') as round_id \gset
select api_v1.cast_vote(:'round_id','approve',null) \g /dev/null
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.cast_vote(:'round_id','approve',null) \g /dev/null
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000013","role":"authenticated"}';
select api_v1.cast_vote(:'round_id','approve',null) \g /dev/null
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.close_voting_round(:'round_id','Voting completed') \g /dev/null
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.create_decision_from_voting_round(:'round_id','Approve the proposal as submitted.',true) \g /dev/null
set request.jwt.claims='{"sub":"89000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.update_agenda_discussion('89000000-0000-0000-0000-000000000091','discussed','Discussed and approved by vote.',
 (select updated_at from public.agenda_items where id='89000000-0000-0000-0000-000000000091')) \g /dev/null
select api_v1.complete_meeting_session('89000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='89000000-0000-0000-0000-000000000081')) \g /dev/null
select api_v1.generate_meeting_minutes_draft('89000000-0000-0000-0000-000000000081') \g /dev/null
reset role;
