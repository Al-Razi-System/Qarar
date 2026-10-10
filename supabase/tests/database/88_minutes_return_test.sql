-- Returning the minutes from approval to draft works and reopens the decision text.
-- Impact map: docs/engineering/impact/MINUTES_RETURN_FIX_AR.md
begin;
create extension if not exists pgtap;
select plan(17);

insert into public.organizations(id,code,name_ar) values
('88000000-0000-0000-0000-000000000001','s88-prod','Minutes Return Production'),
('88000000-0000-0000-0000-000000000002','s88-foreign','Minutes Return Foreign');
insert into auth.users(id,email) values
('88000000-0000-0000-0000-000000000011','chair@s88.test'),
('88000000-0000-0000-0000-000000000012','rapporteur@s88.test'),
('88000000-0000-0000-0000-000000000013','member@s88.test'),
('88000000-0000-0000-0000-000000000014','foreign@s88.test'),
('88000000-0000-0000-0000-000000000015','sysadmin@s88.test'),
('88000000-0000-0000-0000-000000000016','secretary@s88.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('88000000-0000-0000-0000-000000000011','88000000-0000-0000-0000-000000000001','chair@s88.test','Council Chair'),
('88000000-0000-0000-0000-000000000012','88000000-0000-0000-0000-000000000001','rapporteur@s88.test','Council Rapporteur'),
('88000000-0000-0000-0000-000000000013','88000000-0000-0000-0000-000000000001','member@s88.test','Council Member'),
('88000000-0000-0000-0000-000000000014','88000000-0000-0000-0000-000000000002','foreign@s88.test','Foreign'),
('88000000-0000-0000-0000-000000000016','88000000-0000-0000-0000-000000000001','secretary@s88.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('88000000-0000-0000-0000-000000000015','88000000-0000-0000-0000-000000000001','sysadmin@s88.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('88000000-0000-0000-0000-000000000021','88000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000001',
 '88000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='88000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='88000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('88000000-0000-0000-0000-000000000031','88000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('88000000-0000-0000-0000-000000000032','88000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('88000000-0000-0000-0000-000000000033','88000000-0000-0000-0000-000000000001','s88_member','Member','governance_unit'),
('88000000-0000-0000-0000-000000000034','88000000-0000-0000-0000-000000000001','s88_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('88000000-0000-0000-0000-000000000041','88000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('88000000-0000-0000-0000-000000000042','88000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('88000000-0000-0000-0000-000000000043','88000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('88000000-0000-0000-0000-000000000044','88000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('88000000-0000-0000-0000-000000000045','88000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('88000000-0000-0000-0000-000000000046','88000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('88000000-0000-0000-0000-000000000047','88000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('88000000-0000-0000-0000-000000000048','88000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('88000000-0000-0000-0000-000000000049','88000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('88000000-0000-0000-0000-000000000050','88000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('88000000-0000-0000-0000-000000000051','88000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('88000000-0000-0000-0000-000000000052','88000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('88000000-0000-0000-0000-000000000053','88000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('88000000-0000-0000-0000-000000000054','88000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('88000000-0000-0000-0000-000000000055','88000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions');
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '88000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('88000000-0000-0000-0000-000000000031'::uuid),('88000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='88000000-0000-0000-0000-000000000001'
  and left(p.id::text,8)='88000000';
-- The rapporteur manages the agenda but not the meeting.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000032',id
from public.permissions where id in(
 '88000000-0000-0000-0000-000000000042','88000000-0000-0000-0000-000000000044',
 '88000000-0000-0000-0000-000000000046','88000000-0000-0000-0000-000000000048',
 '88000000-0000-0000-0000-000000000049','88000000-0000-0000-0000-000000000053',
 '88000000-0000-0000-0000-000000000054','88000000-0000-0000-0000-000000000055');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000033',id
from public.permissions where id in(
 '88000000-0000-0000-0000-000000000042','88000000-0000-0000-0000-000000000044',
 '88000000-0000-0000-0000-000000000046','88000000-0000-0000-0000-000000000048',
 '88000000-0000-0000-0000-000000000049','88000000-0000-0000-0000-000000000055');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('88000000-0000-0000-0000-000000000061','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000011','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000031'),
('88000000-0000-0000-0000-000000000062','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000012','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000032'),
('88000000-0000-0000-0000-000000000063','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000013','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('88000000-0000-0000-0000-000000000071','88000000-0000-0000-0000-000000000001','TOP-S88','Decision Topic',
 '88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('88000000-0000-0000-0000-000000000081','88000000-0000-0000-0000-000000000001','MTG-S88-1','88000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'88000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('88000000-0000-0000-0000-000000000091','88000000-0000-0000-0000-000000000001',
 '88000000-0000-0000-0000-000000000081','88000000-0000-0000-0000-000000000071',1);

create temporary table s88_state(round_id uuid, decision_id uuid, minutes_updated_at timestamptz, draft text);
insert into s88_state default values;
grant select,insert,update,delete on s88_state to authenticated;

-- Reads the decision's current concurrency token as the test owner.
create function pg_temp.s88_decision_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id=(select decision_id from s88_state) $$;
create function pg_temp.s88_approval(p_user uuid) returns qarar_minutes.minute_approvals language sql security definer as
$$ select a.* from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id
   where m.meeting_id='88000000-0000-0000-0000-000000000081' and a.user_id=p_user $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('88000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='88000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance(ar.id,'present','Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='88000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('88000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('88000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='88000000-0000-0000-0000-000000000081'));
update s88_state set round_id=(api_v1.open_voting_round('88000000-0000-0000-0000-000000000091',
 (select updated_at from public.meetings where id='88000000-0000-0000-0000-000000000081'))->>'voting_round_id')::uuid;
select api_v1.cast_vote((select round_id from s88_state),'approve',null);
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.cast_vote((select round_id from s88_state),'approve',null);
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000013","role":"authenticated"}';
select api_v1.cast_vote((select round_id from s88_state),'approve',null);
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.close_voting_round((select round_id from s88_state),'Voting completed');

-- Preceding stage: the rapporteur drafts the decision from the approved round.
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000012","role":"authenticated"}';
update s88_state set decision_id=(api_v1.create_decision_from_voting_round((select round_id from s88_state),
 'Approve the proposal as submitted.',true)->>'id')::uuid;
select isnt((select decision_id from s88_state),null,'preceding stage: the rapporteur drafts the decision');

-- The session ends and the minutes leave for approval. The round is aligned to
-- the transaction clock so the "summary after the vote" guard sees the real order.
reset role;
update qarar_voting.voting_rounds set closed_at=now() where id=(select round_id from s88_state);
set local role authenticated;
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.update_agenda_discussion('88000000-0000-0000-0000-000000000091','discussed','Discussed and approved by vote.',
 (select updated_at from public.agenda_items where id='88000000-0000-0000-0000-000000000091'));
select api_v1.complete_meeting_session('88000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='88000000-0000-0000-0000-000000000081'));
update s88_state set (minutes_updated_at,draft)=(select (g->>'updated_at')::timestamptz, g->>'content_draft' from (select api_v1.generate_meeting_minutes_draft('88000000-0000-0000-0000-000000000081') g) x);
select is(api_v1.submit_meeting_minutes('88000000-0000-0000-0000-000000000081',(select draft from s88_state),(select minutes_updated_at from s88_state))->>'status',
 'ready_for_approval','preceding stage: the minutes are out for approval');
select is((pg_temp.s88_approval('88000000-0000-0000-0000-000000000011')).approval_status,'pending','the chair is asked to approve');

-- Denied: a reason under five characters, and someone who is not an approver.
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok($$select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).id,'return','No',(pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).updated_at)$$,
 '22023',null,'a return needs a reason of at least five characters');
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000016","role":"authenticated"}';
select throws_ok($$select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).id,'return','Not my approval to return.',(pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).updated_at)$$,
 '42501',null,'someone who is not the approver cannot return the minutes');

-- Changed stage: a member returns the minutes.
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000013","role":"authenticated"}';
select lives_ok($$select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).id,'return','The decision wording needs a correction.',(pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).updated_at)$$,
 'an approver returns the minutes with a reason');
reset role;
select is((select status from qarar_meetings.meetings where id='88000000-0000-0000-0000-000000000081'),'waiting_for_minutes','the meeting is back in minutes preparation');
select is((select status from qarar_minutes.meeting_minutes where meeting_id='88000000-0000-0000-0000-000000000081'),'draft','the minutes are a draft again');
select is((select count(*)::int from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id where m.meeting_id='88000000-0000-0000-0000-000000000081'),0,'the pending approvals are withdrawn');
select is((select change_reason from qarar_meetings.meeting_status_history where meeting_id='88000000-0000-0000-0000-000000000081' and from_status='waiting_for_approval' and to_status='waiting_for_minutes'),
 'The decision wording needs a correction.','the status history keeps the approver''s reason');
update s88_state set minutes_updated_at=(select updated_at from qarar_minutes.meeting_minutes where meeting_id='88000000-0000-0000-0000-000000000081');

-- Following stage: the rapporteur corrects the decision, the minutes are regenerated and approved.
set local role authenticated;
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is((api_v1.list_meeting_decisions('88000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,true,'the returned minutes reopen the decision text for the rapporteur');
select is(api_v1.update_meeting_decision_text((select decision_id from s88_state),'Approve the proposal with the wording the members asked for.',pg_temp.s88_decision_token())->>'changed','true','the rapporteur corrects the decision text');
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok($$select api_v1.submit_meeting_minutes('88000000-0000-0000-0000-000000000081',(select draft from s88_state),(select minutes_updated_at from s88_state))$$,
 '23514',null,'the returned draft with the old decision text cannot be resubmitted');
update s88_state set (minutes_updated_at,draft)=(select (g->>'updated_at')::timestamptz, g->>'content_draft' from (select api_v1.generate_meeting_minutes_draft('88000000-0000-0000-0000-000000000081') g) x);
select is(api_v1.submit_meeting_minutes('88000000-0000-0000-0000-000000000081',(select draft from s88_state),(select minutes_updated_at from s88_state))->>'status',
 'ready_for_approval','the regenerated minutes are submitted again');
select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000011')).id,'approve',null,(pg_temp.s88_approval('88000000-0000-0000-0000-000000000011')).updated_at);
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000012')).id,'approve',null,(pg_temp.s88_approval('88000000-0000-0000-0000-000000000012')).updated_at);
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000013","role":"authenticated"}';
select api_v1.respond_meeting_minutes_approval((pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).id,'approve',null,(pg_temp.s88_approval('88000000-0000-0000-0000-000000000013')).updated_at);
reset role;
select is((select status from qarar_meetings.meetings where id='88000000-0000-0000-0000-000000000081'),'closed','full approval closes the meeting');
select ok((select content_final from qarar_minutes.meeting_minutes where meeting_id='88000000-0000-0000-0000-000000000081') like '%Approve the proposal with the wording the members asked for.%',
 'the certified minutes carry the corrected decision text');

-- The guard still refuses other backward moves.
select throws_ok($$update qarar_meetings.meetings set status='in_progress' where id='88000000-0000-0000-0000-000000000081'$$,
 null,null,'a closed meeting cannot move back to the session');

select * from finish();
rollback;
