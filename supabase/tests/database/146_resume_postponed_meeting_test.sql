-- A meeting postponed for a failed quorum can be resumed, with a reason, from the
-- step before the postponement; only the chair or a meetings manager may do it.
-- Impact map: docs/engineering/impact/RESUME_POSTPONED_MEETING_20261107_AR.md
begin;
create extension if not exists pgtap;
select plan(16);

insert into public.organizations(id,code,name_ar) values
('b2000000-0000-0000-0000-000000000001','s146-prod','Decision Edit Production'),
('b2000000-0000-0000-0000-000000000002','s146-foreign','Decision Edit Foreign');
insert into auth.users(id,email) values
('b2000000-0000-0000-0000-000000000011','chair@s146.test'),
('b2000000-0000-0000-0000-000000000012','rapporteur@s146.test'),
('b2000000-0000-0000-0000-000000000013','member@s146.test'),
('b2000000-0000-0000-0000-000000000014','foreign@s146.test'),
('b2000000-0000-0000-0000-000000000015','sysadmin@s146.test'),
('b2000000-0000-0000-0000-000000000016','secretary@s146.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('b2000000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000001','chair@s146.test','Council Chair'),
('b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000001','rapporteur@s146.test','Council Rapporteur'),
('b2000000-0000-0000-0000-000000000013','b2000000-0000-0000-0000-000000000001','member@s146.test','Council Member'),
('b2000000-0000-0000-0000-000000000014','b2000000-0000-0000-0000-000000000002','foreign@s146.test','Foreign'),
('b2000000-0000-0000-0000-000000000016','b2000000-0000-0000-0000-000000000001','secretary@s146.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('b2000000-0000-0000-0000-000000000015','b2000000-0000-0000-0000-000000000001','sysadmin@s146.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('b2000000-0000-0000-0000-000000000021','b2000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000001',
 'b2000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='b2000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='b2000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('b2000000-0000-0000-0000-000000000031','b2000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('b2000000-0000-0000-0000-000000000032','b2000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('b2000000-0000-0000-0000-000000000033','b2000000-0000-0000-0000-000000000001','s146_member','Member','governance_unit'),
('b2000000-0000-0000-0000-000000000034','b2000000-0000-0000-0000-000000000001','s146_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('b2000000-0000-0000-0000-000000000041','b2000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('b2000000-0000-0000-0000-000000000042','b2000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('b2000000-0000-0000-0000-000000000043','b2000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('b2000000-0000-0000-0000-000000000044','b2000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('b2000000-0000-0000-0000-000000000045','b2000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('b2000000-0000-0000-0000-000000000046','b2000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('b2000000-0000-0000-0000-000000000047','b2000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('b2000000-0000-0000-0000-000000000048','b2000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('b2000000-0000-0000-0000-000000000049','b2000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('b2000000-0000-0000-0000-000000000050','b2000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('b2000000-0000-0000-0000-000000000051','b2000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('b2000000-0000-0000-0000-000000000052','b2000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('b2000000-0000-0000-0000-000000000053','b2000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('b2000000-0000-0000-0000-000000000054','b2000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('b2000000-0000-0000-0000-000000000055','b2000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions')
on conflict (organization_id,code) do nothing;
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b2000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('b2000000-0000-0000-0000-000000000031'::uuid),('b2000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='b2000000-0000-0000-0000-000000000001'
  and p.code in ('meetings.manage','attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','attendance.check_in','attendance.verify','attendance.override','attendance.lock','topics.read','agenda.manage','decisions.read');
-- The rapporteur is contextual council leadership without a copied agenda permission.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000032',id
from public.permissions where organization_id='b2000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','topics.read','decisions.read');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000033',id
from public.permissions where organization_id='b2000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','decisions.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('b2000000-0000-0000-0000-000000000061','b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000031'),
('b2000000-0000-0000-0000-000000000062','b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000012','b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000032'),
('b2000000-0000-0000-0000-000000000063','b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000013','b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('b2000000-0000-0000-0000-000000000071','b2000000-0000-0000-0000-000000000001','TOP-S87','Decision Topic',
 'b2000000-0000-0000-0000-000000000022','b2000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('b2000000-0000-0000-0000-000000000081','b2000000-0000-0000-0000-000000000001','MTG-S87-1','b2000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'b2000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('b2000000-0000-0000-0000-000000000091','b2000000-0000-0000-0000-000000000001',
 'b2000000-0000-0000-0000-000000000081','b2000000-0000-0000-0000-000000000071',1);

create temporary table s146_state(round_id uuid, decision_id uuid, item_updated_at timestamptz, minutes_updated_at timestamptz, draft text);
insert into s146_state default values;
grant select,insert,update,delete on s146_state to authenticated;

-- Reads the decision's current concurrency token as the test owner.
create function pg_temp.s146_decision_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id=(select decision_id from s146_state) $$;
create function pg_temp.s146_approval(p_user uuid) returns qarar_minutes.minute_approvals language sql security definer as
$$ select a.* from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id
   where m.meeting_id='b2000000-0000-0000-0000-000000000081' and a.user_id=p_user $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('b2000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance(ar.id,case when ar.user_id='b2000000-0000-0000-0000-000000000011' then 'present' else 'absent' end,'Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='b2000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('b2000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('b2000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'));


set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v1.apply_quorum_failure('b2000000-0000-0000-0000-000000000081','postpone','المواضيع مهمة ولا يمكن تأجيلها',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'the chair postpones the meeting');
select is((select status from public.meetings where id='b2000000-0000-0000-0000-000000000081'),'postponed','the meeting is postponed');
select is(api_v1.get_meeting_detail('b2000000-0000-0000-0000-000000000081')->'capabilities'->>'can_resume_postponed','true','the chair is offered the resumption');
reset role;
select throws_ok($$update public.meetings set status='in_progress' where id='b2000000-0000-0000-0000-000000000081'$$,null,null,'a plain update cannot take a postponed meeting back to in progress');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','x',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'22023',null,'a reason of five characters is required');
select throws_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','تم التأجيل بالخطأ',now()-interval '1 day')$$,'40001',null,'a stale page cannot resume the meeting');
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000013","role":"authenticated"}';
select throws_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','محاولة عضو غير مخول',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'42501',null,'an ordinary member cannot resume it');
select throws_ok($$select api_v1.get_meeting_detail('b2000000-0000-0000-0000-000000000081')$$,'42501',null,'and cannot even read the detail that would offer the action');
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000014","role":"authenticated"}';
select throws_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','مستخدم من مؤسسة أخرى',now())$$,'P0002',null,'another organisation cannot find the meeting');
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','تم التأجيل بالخطأ والمتابعة مطلوبة',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'the chair resumes the meeting');
select is((select status from public.meetings where id='b2000000-0000-0000-0000-000000000081'),'in_progress','the meeting is in progress again');
select is((select count(*)::int from public.meeting_status_history where meeting_id='b2000000-0000-0000-0000-000000000081' and from_status='postponed' and to_status='in_progress' and change_reason='تم التأجيل بالخطأ والمتابعة مطلوبة'),1,'the step and its reason are recorded');
reset role;
select is((select count(*)::int from qarar_audit.audit_logs where entity_id='b2000000-0000-0000-0000-000000000081' and action='meeting.postponed.resumed'),1,'the audit trail records it');
set local role authenticated;
set local "request.jwt.claims"='{"sub":"b2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(api_v1.get_meeting_session_detail('b2000000-0000-0000-0000-000000000081')->'quorum'->>'quorum_status','not_met','the quorum decision is pending again');
select throws_ok($$select api_v2.resume_postponed_meeting_v2('b2000000-0000-0000-0000-000000000081','استكمال مرة ثانية',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'55000',null,'a meeting that is not postponed cannot be resumed');
select lives_ok($$select api_v1.apply_quorum_failure('b2000000-0000-0000-0000-000000000081','continue','المتابعة بنصاب غير مكتمل بقرار الرئيس',(select updated_at from public.meetings where id='b2000000-0000-0000-0000-000000000081'))$$,'the chair can now continue without the quorum');
select * from finish();
rollback;
