-- The council's chair and rapporteur may edit a decision's text until the minutes are approved.
-- A system administrator or an administrator holding every council permission may not.
-- The minutes cannot leave for approval without the current text of every decision.
-- Decision of the product owner, 2026-10-10 (docs/design/HANDOFF_AR.md).
-- Impact map: docs/engineering/impact/DECISION_TEXT_EDIT_AR.md
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.organizations(id,code,name_ar) values
('b4000000-0000-0000-0000-000000000001','s150-prod','Decision Edit Production'),
('b4000000-0000-0000-0000-000000000002','s150-foreign','Decision Edit Foreign');
insert into auth.users(id,email) values
('b4000000-0000-0000-0000-000000000011','chair@s150.test'),
('b4000000-0000-0000-0000-000000000012','rapporteur@s150.test'),
('b4000000-0000-0000-0000-000000000013','member@s150.test'),
('b4000000-0000-0000-0000-000000000014','foreign@s150.test'),
('b4000000-0000-0000-0000-000000000015','sysadmin@s150.test'),
('b4000000-0000-0000-0000-000000000016','secretary@s150.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('b4000000-0000-0000-0000-000000000011','b4000000-0000-0000-0000-000000000001','chair@s150.test','Council Chair'),
('b4000000-0000-0000-0000-000000000012','b4000000-0000-0000-0000-000000000001','rapporteur@s150.test','Council Rapporteur'),
('b4000000-0000-0000-0000-000000000013','b4000000-0000-0000-0000-000000000001','member@s150.test','Council Member'),
('b4000000-0000-0000-0000-000000000014','b4000000-0000-0000-0000-000000000002','foreign@s150.test','Foreign'),
('b4000000-0000-0000-0000-000000000016','b4000000-0000-0000-0000-000000000001','secretary@s150.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('b4000000-0000-0000-0000-000000000015','b4000000-0000-0000-0000-000000000001','sysadmin@s150.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('b4000000-0000-0000-0000-000000000021','b4000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('b4000000-0000-0000-0000-000000000022','b4000000-0000-0000-0000-000000000001',
 'b4000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='b4000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='b4000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('b4000000-0000-0000-0000-000000000031','b4000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('b4000000-0000-0000-0000-000000000032','b4000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('b4000000-0000-0000-0000-000000000033','b4000000-0000-0000-0000-000000000001','s150_member','Member','governance_unit'),
('b4000000-0000-0000-0000-000000000034','b4000000-0000-0000-0000-000000000001','s150_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('b4000000-0000-0000-0000-000000000041','b4000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('b4000000-0000-0000-0000-000000000042','b4000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('b4000000-0000-0000-0000-000000000043','b4000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('b4000000-0000-0000-0000-000000000044','b4000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('b4000000-0000-0000-0000-000000000045','b4000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('b4000000-0000-0000-0000-000000000046','b4000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('b4000000-0000-0000-0000-000000000047','b4000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('b4000000-0000-0000-0000-000000000048','b4000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('b4000000-0000-0000-0000-000000000049','b4000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('b4000000-0000-0000-0000-000000000050','b4000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('b4000000-0000-0000-0000-000000000051','b4000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('b4000000-0000-0000-0000-000000000052','b4000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('b4000000-0000-0000-0000-000000000053','b4000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('b4000000-0000-0000-0000-000000000054','b4000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('b4000000-0000-0000-0000-000000000055','b4000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions')
on conflict (organization_id,code) do nothing;
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b4000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('b4000000-0000-0000-0000-000000000031'::uuid),('b4000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='b4000000-0000-0000-0000-000000000001'
  and p.code in ('meetings.manage','attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','attendance.check_in','attendance.verify','attendance.override','attendance.lock','topics.read','agenda.manage','decisions.read');
-- The rapporteur is contextual council leadership without a copied agenda permission.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000032',id
from public.permissions where organization_id='b4000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','topics.read','decisions.read');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000033',id
from public.permissions where organization_id='b4000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','decisions.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('b4000000-0000-0000-0000-000000000061','b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000011','b4000000-0000-0000-0000-000000000022','b4000000-0000-0000-0000-000000000031'),
('b4000000-0000-0000-0000-000000000062','b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000012','b4000000-0000-0000-0000-000000000022','b4000000-0000-0000-0000-000000000032'),
('b4000000-0000-0000-0000-000000000063','b4000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000013','b4000000-0000-0000-0000-000000000022','b4000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('b4000000-0000-0000-0000-000000000071','b4000000-0000-0000-0000-000000000001','TOP-S87','Decision Topic',
 'b4000000-0000-0000-0000-000000000022','b4000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('b4000000-0000-0000-0000-000000000081','b4000000-0000-0000-0000-000000000001','MTG-S87-1','b4000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'b4000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('b4000000-0000-0000-0000-000000000091','b4000000-0000-0000-0000-000000000001',
 'b4000000-0000-0000-0000-000000000081','b4000000-0000-0000-0000-000000000071',1);

create temporary table s150_state(round_id uuid, decision_id uuid, item_updated_at timestamptz, minutes_updated_at timestamptz, draft text);
insert into s150_state default values;
grant select,insert,update,delete on s150_state to authenticated;

-- Reads the decision's current concurrency token as the test owner.
create function pg_temp.s150_decision_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id=(select decision_id from s150_state) $$;
create function pg_temp.s150_approval(p_user uuid) returns qarar_minutes.minute_approvals language sql security definer as
$$ select a.* from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id
   where m.meeting_id='b4000000-0000-0000-0000-000000000081' and a.user_id=p_user $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('b4000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance(ar.id,case when ar.user_id='b4000000-0000-0000-0000-000000000011' then 'present' else 'absent' end,'Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='b4000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('b4000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('b4000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'));

select is(api_v1.get_meeting_session_detail('b4000000-0000-0000-0000-000000000081')->'quorum'->>'quorum_status','not_met','fixture is below quorum');
select throws_ok($$select api_v1.update_agenda_discussion('b4000000-0000-0000-0000-000000000091','under_discussion',null,(select updated_at from public.agenda_items where id='b4000000-0000-0000-0000-000000000091'))$$,'23514',null,'discussion waits for explicit chair choice');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','استكمال الاختبار بقرار الرئيس',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'))$$,'42501',null,'rapporteur cannot authorize continuation');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000015","role":"authenticated"}';
select throws_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','استكمال الاختبار بقرار الرئيس',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'))$$,'42501',null,'system administrator is not a council chair');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000014","role":"authenticated"}';
select throws_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','foreign test',now())$$,'P0002',null,'foreign tenant cannot find meeting');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','stale test',now()-interval '1 day')$$,'40001',null,'stale continuation cannot overwrite meeting');
select lives_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','استكمال الاختبار بقرار الرئيس',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'))$$,'chair explicitly continues without fabricating quorum');
select is(api_v1.get_meeting_session_detail('b4000000-0000-0000-0000-000000000081')->'quorum'->>'quorum_status','not_met','quorum remains not met');
select is(api_v1.get_meeting_session_detail('b4000000-0000-0000-0000-000000000081')->'meeting'->'quorum_continuation'->>'reason','استكمال الاختبار بقرار الرئيس','meeting exposes audited reason');
select throws_ok($$select api_v1.apply_quorum_failure('b4000000-0000-0000-0000-000000000081','continue','استكمال الاختبار بقرار الرئيس',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'))$$,'23514',null,'continuation cannot be silently replaced');
select lives_ok($$select api_v1.update_agenda_discussion('b4000000-0000-0000-0000-000000000091','under_discussion','افتتاح المناقشة وتسجيل الملاحظات',(select updated_at from public.agenda_items where id='b4000000-0000-0000-0000-000000000091'))$$,'discussion now allowed');
select lives_ok($$select api_v1.update_agenda_discussion('b4000000-0000-0000-0000-000000000091','discussed','ملخص المناقشة النهائي بعد اكتمالها',(select updated_at from public.agenda_items where id='b4000000-0000-0000-0000-000000000091'))$$,'discussion ends before vote');
update s150_state set item_updated_at=(select updated_at from public.agenda_items where id='b4000000-0000-0000-0000-000000000091');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000012","role":"authenticated"}';
select lives_ok($$select api_v1.update_agenda_discussion('b4000000-0000-0000-0000-000000000091','discussed','ملخص المقرر السياقي دون صلاحية إدارية منسوخة',(select item_updated_at from s150_state))$$,'contextual rapporteur saves the summary');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok($$select api_v1.update_agenda_discussion('b4000000-0000-0000-0000-000000000091','discussed','محاولة عضو غير مخول',(select updated_at from public.agenda_items where id='b4000000-0000-0000-0000-000000000091'))$$,'42501',null,'ordinary member cannot save the summary');
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$update s150_state set round_id=(api_v1.open_voting_round('b4000000-0000-0000-0000-000000000091',(select updated_at from public.meetings where id='b4000000-0000-0000-0000-000000000081'))->>'voting_round_id')::uuid$$,'vote opens with recorded exception');
select lives_ok($$select api_v1.cast_vote((select round_id from s150_state),'approve',null)$$,'only eligible present member votes');
select lives_ok($$select api_v1.close_voting_round((select round_id from s150_state),'اكتمل تصويت الحاضرين')$$,'vote closes normally');
select lives_ok($$update s150_state set decision_id=(api_v1.create_decision_from_voting_round((select round_id from s150_state),'اعتماد المقترح بعد مناقشة الحاضرين.',true)->>'id')::uuid$$,'decision created normally');

select lives_ok($$select api_v2.propose_meeting_assignment_batch_v2('b4000000-0000-0000-0000-000000000091','إبلاغ الجهات بالقرار',null,'[{"kind":"user","id":"b4000000-0000-0000-0000-000000000013"}]'::jsonb,null,null,false,'b4000000-0000-0000-0000-0000000000a1')$$,'a batch without a follow-up is accepted');
reset role;
select is((select follow_up_user_id from qarar_meetings.meeting_assignment_batches where client_request_id='b4000000-0000-0000-0000-0000000000a1'),'b4000000-0000-0000-0000-000000000011','and the council chair follows it');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"b4000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v2.propose_meeting_assignment_batch_v2('b4000000-0000-0000-0000-000000000091','إبلاغ الجهات بالقرار',null,'[{"kind":"user","id":"b4000000-0000-0000-0000-000000000013"}]'::jsonb,null,null,false,'b4000000-0000-0000-0000-0000000000a1')$$,'repeating the same request is a safe replay');
select lives_ok($$select api_v2.propose_meeting_assignment_batch_v2('b4000000-0000-0000-0000-000000000091','متابعة بشخص محدد',null,'[{"kind":"user","id":"b4000000-0000-0000-0000-000000000013"}]'::jsonb,null,'b4000000-0000-0000-0000-000000000013',false,'b4000000-0000-0000-0000-0000000000a2')$$,'an explicit follow-up is still honoured');
reset role;
select is((select follow_up_user_id from qarar_meetings.meeting_assignment_batches where client_request_id='b4000000-0000-0000-0000-0000000000a2'),'b4000000-0000-0000-0000-000000000013','and kept');
select * from finish();
rollback;
