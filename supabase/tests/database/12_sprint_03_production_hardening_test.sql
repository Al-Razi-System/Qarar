begin;
create extension if not exists pgtap;
select plan(44);

insert into public.organizations(id,code,name_ar) values
('44000000-0000-0000-0000-000000000001','s03-prod','Sprint 03 Production'),
('44000000-0000-0000-0000-000000000002','s03-foreign','Sprint 03 Foreign');
insert into auth.users(id,email) values
('44000000-0000-0000-0000-000000000011','manager@s03.test'),
('44000000-0000-0000-0000-000000000012','member1@s03.test'),
('44000000-0000-0000-0000-000000000013','member2@s03.test'),
('44000000-0000-0000-0000-000000000014','foreign@s03.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000001','manager@s03.test','Session Manager'),
('44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000001','member1@s03.test','Member One'),
('44000000-0000-0000-0000-000000000013','44000000-0000-0000-0000-000000000001','member2@s03.test','Member Two'),
('44000000-0000-0000-0000-000000000014','44000000-0000-0000-0000-000000000002','foreign@s03.test','Foreign');
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('44000000-0000-0000-0000-000000000021','44000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000001',
 '44000000-0000-0000-0000-000000000021','main','Main Council',60);
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('44000000-0000-0000-0000-000000000031','44000000-0000-0000-0000-000000000001','s03_manager','Manager','governance_unit'),
('44000000-0000-0000-0000-000000000032','44000000-0000-0000-0000-000000000001','s03_member','Member','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('44000000-0000-0000-0000-000000000041','44000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('44000000-0000-0000-0000-000000000042','44000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('44000000-0000-0000-0000-000000000043','44000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('44000000-0000-0000-0000-000000000044','44000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('44000000-0000-0000-0000-000000000045','44000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('44000000-0000-0000-0000-000000000046','44000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('44000000-0000-0000-0000-000000000047','44000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('44000000-0000-0000-0000-000000000048','44000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('44000000-0000-0000-0000-000000000049','44000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('44000000-0000-0000-0000-000000000050','44000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('44000000-0000-0000-0000-000000000051','44000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('44000000-0000-0000-0000-000000000052','44000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance');
insert into public.role_permissions(organization_id,role_id,permission_id)
select '44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000031',id
from public.permissions where organization_id='44000000-0000-0000-0000-000000000001';
insert into public.role_permissions(organization_id,role_id,permission_id)
select '44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000032',id
from public.permissions where id in(
 '44000000-0000-0000-0000-000000000042','44000000-0000-0000-0000-000000000044',
 '44000000-0000-0000-0000-000000000046','44000000-0000-0000-0000-000000000048',
 '44000000-0000-0000-0000-000000000049');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('44000000-0000-0000-0000-000000000061','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000011','44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000031'),
('44000000-0000-0000-0000-000000000062','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000012','44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000032'),
('44000000-0000-0000-0000-000000000063','44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000013','44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000032');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('44000000-0000-0000-0000-000000000071','44000000-0000-0000-0000-000000000001','TOP-S03','Voting Topic',
 '44000000-0000-0000-0000-000000000022','44000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('44000000-0000-0000-0000-000000000081','44000000-0000-0000-0000-000000000001','MTG-S03-1','44000000-0000-0000-0000-000000000022','Voting Meeting',current_date,'44000000-0000-0000-0000-000000000011','ready_to_start'),
('44000000-0000-0000-0000-000000000082','44000000-0000-0000-0000-000000000001','MTG-S03-2','44000000-0000-0000-0000-000000000022','Failed Quorum Meeting',current_date,'44000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('44000000-0000-0000-0000-000000000091','44000000-0000-0000-0000-000000000001',
 '44000000-0000-0000-0000-000000000081','44000000-0000-0000-0000-000000000071',1);

create temporary table s03_state(round_id uuid,manager_attendance uuid,member1_attendance uuid,
 member2_attendance uuid,meeting_updated_at timestamptz,checkin_token text);
insert into s03_state default values;
grant select,insert,update,delete on s03_state to authenticated;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok(
 $$select public.transition_meeting('44000000-0000-0000-0000-000000000081','in_progress',null,
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000081'))$$,
 'P0001','use open_meeting_session to start the meeting','generic transition cannot bypass session initialization');
select is(public.open_meeting_session('44000000-0000-0000-0000-000000000081',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000081'))->'meeting'->>'status',
 'in_progress','manager opens meeting session');
select is((select count(*) from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000081')::int,3,'opening snapshots all active members');
select is((select count(*) from public.attendance_history where meeting_id='44000000-0000-0000-0000-000000000081')::int,3,'roster initialization appends attendance history');
select is((select quorum_status from public.meetings where id='44000000-0000-0000-0000-000000000081'),'not_met','empty attendance starts below quorum');
update s03_state set checkin_token=public.create_checkin_session(
 '44000000-0000-0000-0000-000000000081',15)->>'token';
select ok(char_length((select checkin_token from s03_state))>=20,'manager creates a short-lived check-in token');
update s03_state set
 manager_attendance=(select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000081' and user_id='44000000-0000-0000-0000-000000000011'),
 member1_attendance=(select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000081' and user_id='44000000-0000-0000-0000-000000000012'),
 member2_attendance=(select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000081' and user_id='44000000-0000-0000-0000-000000000013');

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(public.self_check_in('44000000-0000-0000-0000-000000000081',
 (select checkin_token from s03_state),'Member mobile')->>'verification_status',
 'pending_verification','member self check-in creates an unverified claim');
select throws_ok(
 format('select public.verify_attendance(%L,%L,%L,%L)',(select member1_attendance from s03_state),
 'present','Self approval attempt',(select updated_at from public.attendance_records where id=(select member1_attendance from s03_state))),
 '42501','permission denied: attendance.verify','member cannot verify attendance');
set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000013","role":"authenticated"}';
select is(public.self_check_in('44000000-0000-0000-0000-000000000081',
 (select checkin_token from s03_state),'Second member device')->>'verification_status',
 'pending_verification','second member can submit a separate check-in claim');

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(public.verify_attendance((select manager_attendance from s03_state),'present','Chair manually verified',
 (select updated_at from public.attendance_records where id=(select manager_attendance from s03_state)))->>'attendance_status',
 'present','authorized verifier records manual presence with reason');
select is(public.verify_attendance((select member1_attendance from s03_state),'late','QR claim confirmed',
 (select updated_at from public.attendance_records where id=(select member1_attendance from s03_state)))->>'attendance_status',
 'late','verifier confirms member claim as late');
select is(public.verify_attendance((select member2_attendance from s03_state),'absent','No response',
 (select updated_at from public.attendance_records where id=(select member2_attendance from s03_state)))->>'verification_status',
 'rejected','verifier rejects an unsupported QR claim');
select is(jsonb_array_length(public.get_attendance_history((select member1_attendance from s03_state))),2,
 'attendance history exposes initialization and latest change');
select throws_ok(
 format('select public.verify_attendance(%L,%L,%L,%L)',(select member2_attendance from s03_state),'present','Stale update','2000-01-01T00:00:00Z'),
 '40001','attendance was modified; refresh before verification','stale attendance verification is blocked');
select is((public.recalculate_meeting_quorum('44000000-0000-0000-0000-000000000081',true)->>'quorum_status'),'met','quorum uses attendance roster snapshot');
select is((select present_members from public.quorum_snapshots where meeting_id='44000000-0000-0000-0000-000000000081' order by calculated_at desc,id desc limit 1),2,'quorum snapshot stores present count');
select cmp_ok((select actual_percentage from public.quorum_snapshots where meeting_id='44000000-0000-0000-0000-000000000081' order by calculated_at desc,id desc limit 1),'>=',66.66::numeric,'quorum snapshot stores actual percentage');
select is(public.lock_attendance_roster('44000000-0000-0000-0000-000000000081',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000081'))->>'attendance_locked',
 'true','authorized verifier locks the fully resolved roster');
update s03_state set meeting_updated_at=(select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000081');
update s03_state set round_id=(public.open_voting_round('44000000-0000-0000-0000-000000000091',
 (select meeting_updated_at from s03_state))->>'voting_round_id')::uuid;
select is((select eligible_voter_count from public.voting_rounds where id=(select round_id from s03_state)),2,'voting round snapshots present eligible members');
select is(jsonb_array_length(public.get_my_open_votes('44000000-0000-0000-0000-000000000081')),1,'manager sees eligible open vote');

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(jsonb_array_length(public.get_my_open_votes('44000000-0000-0000-0000-000000000081')),1,'eligible member sees open vote');
select is(public.cast_vote((select round_id from s03_state),'approve','Supports proposal')->>'accepted','true','eligible member casts vote');
select throws_ok(format('select public.cast_vote(%L,%L,null)',(select round_id from s03_state),'reject'),
 '23505','vote already cast for this round','duplicate vote is blocked');
select is(public.get_voting_round_detail((select round_id from s03_state))->>'my_vote','approve','member sees own vote');
select is(public.get_voting_round_detail((select round_id from s03_state))->'votes','null'::jsonb,'member cannot inspect other votes');

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok(format('select public.cast_vote(%L,%L,null)',(select round_id from s03_state),'approve'),
 '42501','current user is not eligible for this voting round','absent member cannot vote');

set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(public.cast_vote((select round_id from s03_state),'reject','Opposes proposal')->>'accepted','true','second eligible member casts vote');
select is(public.close_voting_round((select round_id from s03_state),'Voting completed')->>'result','tied','close freezes calculated result');
select is((select voting_result from public.agenda_items where id='44000000-0000-0000-0000-000000000091'),'tied','agenda stores final result');
select is(jsonb_array_length(public.get_voting_round_detail((select round_id from s03_state))->'votes'),2,'manager sees vote audit details');
select is(jsonb_array_length(public.get_voting_round_detail((select round_id from s03_state))->'eligible_members'),2,
 'manager sees snapshotted electorate and participation');
select throws_ok(format('select public.cast_vote(%L,%L,null)',(select round_id from s03_state),'approve'),
 'P0001','voting round is not open','closed round rejects votes');
update s03_state set round_id=(public.open_voting_round('44000000-0000-0000-0000-000000000091',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000081'))->>'voting_round_id')::uuid;
select is((select round_number from public.voting_rounds where id=(select round_id from s03_state)),2,
 'manager can open a later voting round');
select throws_ok(
 format('select public.override_attendance(%L,%L,%L,%L)',(select member2_attendance from s03_state),
 'excused','Correction attempted during active voting',
 (select updated_at from public.attendance_records where id=(select member2_attendance from s03_state))),
 'P0001','attendance override is blocked while voting is open',
 'attendance override cannot race an open voting round');
select is(public.cancel_voting_round((select round_id from s03_state),'Agenda item requires clarification')->>'status',
 'cancelled','manager cancels an open round with reason');

select is(public.open_meeting_session('44000000-0000-0000-0000-000000000082',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000082'))->'meeting'->>'status',
 'in_progress','second meeting session opens');
select is(public.verify_attendance(
 (select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000011'),
 'present','Only attendee manually verified',
 (select updated_at from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000011')
 )->>'attendance_status','present','failed-quorum meeting records one attendee');
select is(public.verify_attendance(
 (select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000012'),
 'absent','Member did not attend',
 (select updated_at from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000012')
 )->>'attendance_status','absent','failed-quorum roster resolves first absence');
select is(public.verify_attendance(
 (select id from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000013'),
 'excused','Approved absence excuse',
 (select updated_at from public.attendance_records where meeting_id='44000000-0000-0000-0000-000000000082' and user_id='44000000-0000-0000-0000-000000000013')
 )->>'attendance_status','excused','failed-quorum roster resolves excused absence');
select is(public.lock_attendance_roster('44000000-0000-0000-0000-000000000082',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000082'))->>'attendance_locked',
 'true','failed-quorum roster is locked before action');
select is(public.apply_quorum_failure('44000000-0000-0000-0000-000000000082','postpone','Quorum threshold was not reached',
 (select updated_at from public.meetings where id='44000000-0000-0000-0000-000000000082'))->>'status',
 'postponed','failed quorum applies authorized postponement');
select throws_ok(
 $$insert into public.votes(organization_id,meeting_id,topic_id,user_id,membership_id,vote_value)
 values('44000000-0000-0000-0000-000000000001','44000000-0000-0000-0000-000000000081',
 '44000000-0000-0000-0000-000000000071','44000000-0000-0000-0000-000000000011',
 '44000000-0000-0000-0000-000000000061','approve')$$,
 '42501','permission denied for table votes','direct vote insert is revoked');

reset role;
select cmp_ok((select count(*) from public.audit_logs
 where organization_id='44000000-0000-0000-0000-000000000001'
 and action in('meetings.session.open','attendance.checkin_session.create','attendance.self_check_in',
 'attendance.verify','attendance.roster.lock','voting.open','voting.cast',
 'voting.close','voting.cancel','quorum.failure.postpone')), '=',20::bigint,'state changes append expected audit events');

set local role authenticated;
set local "request.jwt.claims"='{"sub":"44000000-0000-0000-0000-000000000014","role":"authenticated"}';
select throws_ok(
 $$select public.get_meeting_session_detail('44000000-0000-0000-0000-000000000081')$$,
 'P0002','meeting not found','foreign tenant cannot discover session');

select * from finish();
rollback;
