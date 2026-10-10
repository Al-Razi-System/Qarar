-- The council's chair and rapporteur may edit a decision's text until the minutes are approved.
-- A system administrator or an administrator holding every council permission may not.
-- The minutes cannot leave for approval without the current text of every decision.
-- Decision of the product owner, 2026-10-10 (docs/design/HANDOFF_AR.md).
-- Impact map: docs/engineering/impact/DECISION_TEXT_EDIT_AR.md
begin;
create extension if not exists pgtap;
select plan(38);

insert into public.organizations(id,code,name_ar) values
('87000000-0000-0000-0000-000000000001','s87-prod','Decision Edit Production'),
('87000000-0000-0000-0000-000000000002','s87-foreign','Decision Edit Foreign');
insert into auth.users(id,email) values
('87000000-0000-0000-0000-000000000011','chair@s87.test'),
('87000000-0000-0000-0000-000000000012','rapporteur@s87.test'),
('87000000-0000-0000-0000-000000000013','member@s87.test'),
('87000000-0000-0000-0000-000000000014','foreign@s87.test'),
('87000000-0000-0000-0000-000000000015','sysadmin@s87.test'),
('87000000-0000-0000-0000-000000000016','secretary@s87.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('87000000-0000-0000-0000-000000000011','87000000-0000-0000-0000-000000000001','chair@s87.test','Council Chair'),
('87000000-0000-0000-0000-000000000012','87000000-0000-0000-0000-000000000001','rapporteur@s87.test','Council Rapporteur'),
('87000000-0000-0000-0000-000000000013','87000000-0000-0000-0000-000000000001','member@s87.test','Council Member'),
('87000000-0000-0000-0000-000000000014','87000000-0000-0000-0000-000000000002','foreign@s87.test','Foreign'),
('87000000-0000-0000-0000-000000000016','87000000-0000-0000-0000-000000000001','secretary@s87.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('87000000-0000-0000-0000-000000000015','87000000-0000-0000-0000-000000000001','sysadmin@s87.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('87000000-0000-0000-0000-000000000021','87000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000001',
 '87000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='87000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='87000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('87000000-0000-0000-0000-000000000031','87000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('87000000-0000-0000-0000-000000000032','87000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('87000000-0000-0000-0000-000000000033','87000000-0000-0000-0000-000000000001','s87_member','Member','governance_unit'),
('87000000-0000-0000-0000-000000000034','87000000-0000-0000-0000-000000000001','s87_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('87000000-0000-0000-0000-000000000041','87000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('87000000-0000-0000-0000-000000000042','87000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('87000000-0000-0000-0000-000000000043','87000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('87000000-0000-0000-0000-000000000044','87000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('87000000-0000-0000-0000-000000000045','87000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('87000000-0000-0000-0000-000000000046','87000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('87000000-0000-0000-0000-000000000047','87000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('87000000-0000-0000-0000-000000000048','87000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('87000000-0000-0000-0000-000000000049','87000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('87000000-0000-0000-0000-000000000050','87000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('87000000-0000-0000-0000-000000000051','87000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('87000000-0000-0000-0000-000000000052','87000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('87000000-0000-0000-0000-000000000053','87000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('87000000-0000-0000-0000-000000000054','87000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('87000000-0000-0000-0000-000000000055','87000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions');
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '87000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('87000000-0000-0000-0000-000000000031'::uuid),('87000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='87000000-0000-0000-0000-000000000001'
  and left(p.id::text,8)='87000000';
-- The rapporteur manages the agenda but not the meeting.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000032',id
from public.permissions where id in(
 '87000000-0000-0000-0000-000000000042','87000000-0000-0000-0000-000000000044',
 '87000000-0000-0000-0000-000000000046','87000000-0000-0000-0000-000000000048',
 '87000000-0000-0000-0000-000000000049','87000000-0000-0000-0000-000000000053',
 '87000000-0000-0000-0000-000000000054','87000000-0000-0000-0000-000000000055');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000033',id
from public.permissions where id in(
 '87000000-0000-0000-0000-000000000042','87000000-0000-0000-0000-000000000044',
 '87000000-0000-0000-0000-000000000046','87000000-0000-0000-0000-000000000048',
 '87000000-0000-0000-0000-000000000049','87000000-0000-0000-0000-000000000055');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('87000000-0000-0000-0000-000000000061','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000011','87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000031'),
('87000000-0000-0000-0000-000000000062','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000012','87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000032'),
('87000000-0000-0000-0000-000000000063','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000013','87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('87000000-0000-0000-0000-000000000071','87000000-0000-0000-0000-000000000001','TOP-S87','Decision Topic',
 '87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('87000000-0000-0000-0000-000000000081','87000000-0000-0000-0000-000000000001','MTG-S87-1','87000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'87000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('87000000-0000-0000-0000-000000000091','87000000-0000-0000-0000-000000000001',
 '87000000-0000-0000-0000-000000000081','87000000-0000-0000-0000-000000000071',1);

create temporary table s87_state(round_id uuid, decision_id uuid, minutes_updated_at timestamptz, draft text);
insert into s87_state default values;
grant select,insert,update,delete on s87_state to authenticated;

-- Reads the decision's current concurrency token as the test owner.
create function pg_temp.s87_decision_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id=(select decision_id from s87_state) $$;
create function pg_temp.s87_approval(p_user uuid) returns qarar_minutes.minute_approvals language sql security definer as
$$ select a.* from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id
   where m.meeting_id='87000000-0000-0000-0000-000000000081' and a.user_id=p_user $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('87000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='87000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance(ar.id,'present','Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='87000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('87000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('87000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='87000000-0000-0000-0000-000000000081'));
update s87_state set round_id=(api_v1.open_voting_round('87000000-0000-0000-0000-000000000091',
 (select updated_at from public.meetings where id='87000000-0000-0000-0000-000000000081'))->>'voting_round_id')::uuid;
select api_v1.cast_vote((select round_id from s87_state),'approve',null);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.cast_vote((select round_id from s87_state),'approve',null);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000013","role":"authenticated"}';
select api_v1.cast_vote((select round_id from s87_state),'approve',null);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.close_voting_round((select round_id from s87_state),'Voting completed');

-- Preceding stage: the rapporteur drafts the decision from the approved round.
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000012","role":"authenticated"}';
update s87_state set decision_id=(api_v1.create_decision_from_voting_round((select round_id from s87_state),
 'Approve the proposal as submitted.',true)->>'id')::uuid;
select isnt((select decision_id from s87_state),null,'rapporteur drafts the decision');

-- Changed stage during the session: the list says who may edit.
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,true,'rapporteur sees the decision as editable');
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'updated_at')::timestamptz,pg_temp.s87_decision_token(),'the list carries the concurrency token');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,true,'chair sees the decision as editable');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000013","role":"authenticated"}';
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,false,'member does not see the decision as editable');

-- The secretary joins after the roster is locked, so attendance and votes are unchanged.
reset role;
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('87000000-0000-0000-0000-000000000064','87000000-0000-0000-0000-000000000001','87000000-0000-0000-0000-000000000016','87000000-0000-0000-0000-000000000022','87000000-0000-0000-0000-000000000034');
set local role authenticated;

-- Denied: administration without council leadership.
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000015","role":"authenticated"}';
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,false,'a system administrator does not see the decision as editable');
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'System admin wording of the decision.',pg_temp.s87_decision_token())$$,
 '42501',null,'a system administrator cannot edit the decision');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000016","role":"authenticated"}';
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,false,'a secretary with every council permission does not see the decision as editable');
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Secretary wording of the decision.',pg_temp.s87_decision_token())$$,
 '42501',null,'a secretary with meetings.manage and agenda.manage but no leadership role cannot edit');

-- Denied: a member, another organization, a short text, a stale token.
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Member wording of the decision.',pg_temp.s87_decision_token())$$,
 '42501',null,'a member cannot edit the decision');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000014","role":"authenticated"}';
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Foreign wording of the decision.',pg_temp.s87_decision_token())$$,
 'P0002',null,'another organization cannot find the decision');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Too short',pg_temp.s87_decision_token())$$,
 '22023',null,'a text under ten characters is rejected');
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Stale wording of the decision.',pg_temp.s87_decision_token()-interval '1 second')$$,
 '40001',null,'a stale token is rejected so one editor cannot overwrite the other');

-- Allowed: the rapporteur edits, then the chair edits with the new token.
select is(api_v1.update_meeting_decision_text((select decision_id from s87_state),'Approve the proposal with the amended budget.',pg_temp.s87_decision_token())->>'changed','true','rapporteur edits the decision text');
select is(api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'decision_text','Approve the proposal with the amended budget.','the edited text is what the room reads');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(api_v1.update_meeting_decision_text((select decision_id from s87_state),'  Approve the proposal with the amended budget and timeline.  ',pg_temp.s87_decision_token())->>'decision_text','Approve the proposal with the amended budget and timeline.','chair edits the decision text, trimmed');
select is(api_v1.update_meeting_decision_text((select decision_id from s87_state),'Approve the proposal with the amended budget and timeline.',pg_temp.s87_decision_token())->>'changed','false','the same text writes nothing');
select is(api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'decision_status','ready_for_approval','editing the text keeps the decision status');
reset role;
select is((select count(*)::int from qarar_audit.audit_logs where action='decision.text_update' and entity_id=(select decision_id from s87_state)),2,'each change is audited once');
select is((select array_agg(metadata->>'previous_text' order by metadata->>'previous_text') from qarar_audit.audit_logs where action='decision.text_update' and entity_id=(select decision_id from s87_state)),
 array['Approve the proposal as submitted.','Approve the proposal with the amended budget.'],'the audit keeps the previous text of each change');

-- Following stage: the session ends and the minutes draft is generated.
-- The whole test is one transaction, so the summary's updated_at (now()) would
-- precede the round's closed_at (clock time). Align the round to the
-- transaction clock so the "summary after the vote" guard sees the real order.
update qarar_voting.voting_rounds set closed_at=now() where id=(select round_id from s87_state);
set local role authenticated;
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.update_agenda_discussion('87000000-0000-0000-0000-000000000091','discussed','Discussed and approved by vote.',
 (select updated_at from public.agenda_items where id='87000000-0000-0000-0000-000000000091'));
select api_v1.complete_meeting_session('87000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='87000000-0000-0000-0000-000000000081'));
update s87_state set (minutes_updated_at,draft)=(select (g->>'updated_at')::timestamptz, g->>'content_draft' from (select api_v1.generate_meeting_minutes_draft('87000000-0000-0000-0000-000000000081') g) x);
select ok((select draft from s87_state) like '%Approve the proposal with the amended budget and timeline.%','the generated draft carries the decision text');
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000012","role":"authenticated"}';
select is(api_v1.update_meeting_decision_text((select decision_id from s87_state),'Approve the proposal; the rapporteur corrected the wording.',pg_temp.s87_decision_token())->>'meeting_status','waiting_for_minutes','editing while the minutes are prepared is allowed');
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,true,'still editable while the minutes are prepared');
select ok(exists(select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid() and granted
 and ((classid::bigint<<32)|objid::bigint)=hashtextextended('meeting-minutes-sync:87000000-0000-0000-0000-000000000081',0)),
 'editing takes the per-meeting lock that minutes submission also takes');
select ok(pg_get_functiondef('qarar_minutes.submit_meeting_minutes'::regproc) like '%pg_advisory_xact_lock(hashtextextended(''meeting-minutes-sync:''%',
 'minutes submission takes the same per-meeting lock');

-- The minutes cannot leave with the old text.
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is((select d->>'decision_text' from jsonb_array_elements(api_v1.get_meeting_minutes('87000000-0000-0000-0000-000000000081')->'decisions') d),
 'Approve the proposal; the rapporteur corrected the wording.','the minutes read carries the current decision text');
select throws_ok($$select api_v1.submit_meeting_minutes('87000000-0000-0000-0000-000000000081',(select draft from s87_state),(select minutes_updated_at from s87_state))$$,
 '23514',null,'a draft generated before the edit cannot be submitted');
select is((select status from public.meetings where id='87000000-0000-0000-0000-000000000081'),'waiting_for_minutes','the rejected submission leaves the meeting in minutes preparation');

-- Regenerating picks up the current text and the minutes can leave.
update s87_state set (minutes_updated_at,draft)=(select (g->>'updated_at')::timestamptz, g->>'content_draft' from (select api_v1.generate_meeting_minutes_draft('87000000-0000-0000-0000-000000000081') g) x);
select is(api_v1.submit_meeting_minutes('87000000-0000-0000-0000-000000000081',(select draft from s87_state),(select minutes_updated_at from s87_state))->>'status',
 'ready_for_approval','the regenerated draft carries the current text and is submitted');

-- Minutes out for approval: the text is frozen.
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Wording after the minutes were sent.',pg_temp.s87_decision_token())$$,
 '23514',null,'the text cannot change while the minutes are out for approval');
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,false,'not editable while the minutes are out for approval');

-- The attendees approve the minutes: the text is final.
-- Returning the minutes (respond 'return') reopens the text; that path is covered
-- by 88_minutes_return_test.sql.
select api_v1.respond_meeting_minutes_approval((pg_temp.s87_approval('87000000-0000-0000-0000-000000000011')).id,'approve',null,(pg_temp.s87_approval('87000000-0000-0000-0000-000000000011')).updated_at);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000012","role":"authenticated"}';
select api_v1.respond_meeting_minutes_approval((pg_temp.s87_approval('87000000-0000-0000-0000-000000000012')).id,'approve',null,(pg_temp.s87_approval('87000000-0000-0000-0000-000000000012')).updated_at);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000013","role":"authenticated"}';
select api_v1.respond_meeting_minutes_approval((pg_temp.s87_approval('87000000-0000-0000-0000-000000000013')).id,'approve',null,(pg_temp.s87_approval('87000000-0000-0000-0000-000000000013')).updated_at);
set local "request.jwt.claims"='{"sub":"87000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is((select status from public.meetings where id='87000000-0000-0000-0000-000000000081'),'closed','approving the minutes closes the meeting');
select throws_ok($$select api_v1.update_meeting_decision_text((select decision_id from s87_state),'Wording after the minutes were approved.',pg_temp.s87_decision_token())$$,
 '23514',null,'the text is final once the minutes are approved');
select is((api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'can_edit_text')::boolean,false,'not editable once the minutes are approved');
select is(api_v1.list_meeting_decisions('87000000-0000-0000-0000-000000000081')->0->>'decision_text','Approve the proposal; the rapporteur corrected the wording.','the approved minutes keep the last agreed text');
reset role;
select ok((select content_final from qarar_minutes.meeting_minutes where meeting_id='87000000-0000-0000-0000-000000000081') like '%Approve the proposal; the rapporteur corrected the wording.%',
 'the certified minutes carry the final decision text');

-- Contract surface.
select ok(has_function_privilege('authenticated','api_v1.update_meeting_decision_text(uuid,text,timestamptz)','EXECUTE'),'authenticated can call the edit contract');
select ok(not has_function_privilege('authenticated','qarar_decisions.update_meeting_decision_text(uuid,text,timestamptz)','EXECUTE'),'clients cannot bypass the edit facade');

select * from finish();
rollback;
