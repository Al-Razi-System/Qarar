-- An agenda item is checked for eligibility when it is added or when its topic,
-- meeting or exception changes, not on every later update (discussion, vote).
-- Impact map: docs/engineering/impact/AGENDA_ELIGIBILITY_ON_CHANGE_20261107_AR.md
begin;
create extension if not exists pgtap;
select plan(5);

insert into public.organizations(id,code,name_ar) values
('b3000000-0000-0000-0000-000000000001','s147-prod','Decision Edit Production'),
('b3000000-0000-0000-0000-000000000002','s147-foreign','Decision Edit Foreign');
insert into auth.users(id,email) values
('b3000000-0000-0000-0000-000000000011','chair@s147.test'),
('b3000000-0000-0000-0000-000000000012','rapporteur@s147.test'),
('b3000000-0000-0000-0000-000000000013','member@s147.test'),
('b3000000-0000-0000-0000-000000000014','foreign@s147.test'),
('b3000000-0000-0000-0000-000000000015','sysadmin@s147.test'),
('b3000000-0000-0000-0000-000000000016','secretary@s147.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('b3000000-0000-0000-0000-000000000011','b3000000-0000-0000-0000-000000000001','chair@s147.test','Council Chair'),
('b3000000-0000-0000-0000-000000000012','b3000000-0000-0000-0000-000000000001','rapporteur@s147.test','Council Rapporteur'),
('b3000000-0000-0000-0000-000000000013','b3000000-0000-0000-0000-000000000001','member@s147.test','Council Member'),
('b3000000-0000-0000-0000-000000000014','b3000000-0000-0000-0000-000000000002','foreign@s147.test','Foreign'),
('b3000000-0000-0000-0000-000000000016','b3000000-0000-0000-0000-000000000001','secretary@s147.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('b3000000-0000-0000-0000-000000000015','b3000000-0000-0000-0000-000000000001','sysadmin@s147.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('b3000000-0000-0000-0000-000000000021','b3000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('b3000000-0000-0000-0000-000000000022','b3000000-0000-0000-0000-000000000001',
 'b3000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='b3000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='b3000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('b3000000-0000-0000-0000-000000000031','b3000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('b3000000-0000-0000-0000-000000000032','b3000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('b3000000-0000-0000-0000-000000000033','b3000000-0000-0000-0000-000000000001','s147_member','Member','governance_unit'),
('b3000000-0000-0000-0000-000000000034','b3000000-0000-0000-0000-000000000001','s147_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('b3000000-0000-0000-0000-000000000041','b3000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('b3000000-0000-0000-0000-000000000042','b3000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('b3000000-0000-0000-0000-000000000043','b3000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('b3000000-0000-0000-0000-000000000044','b3000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('b3000000-0000-0000-0000-000000000045','b3000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('b3000000-0000-0000-0000-000000000046','b3000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('b3000000-0000-0000-0000-000000000047','b3000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('b3000000-0000-0000-0000-000000000048','b3000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('b3000000-0000-0000-0000-000000000049','b3000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('b3000000-0000-0000-0000-000000000050','b3000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('b3000000-0000-0000-0000-000000000051','b3000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('b3000000-0000-0000-0000-000000000052','b3000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('b3000000-0000-0000-0000-000000000053','b3000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('b3000000-0000-0000-0000-000000000054','b3000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('b3000000-0000-0000-0000-000000000055','b3000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions')
on conflict (organization_id,code) do nothing;
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b3000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('b3000000-0000-0000-0000-000000000031'::uuid),('b3000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='b3000000-0000-0000-0000-000000000001'
  and p.code in ('meetings.manage','attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','attendance.check_in','attendance.verify','attendance.override','attendance.lock','topics.read','agenda.manage','decisions.read');
-- The rapporteur is contextual council leadership without a copied agenda permission.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000032',id
from public.permissions where organization_id='b3000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','topics.read','decisions.read');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select 'b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000033',id
from public.permissions where organization_id='b3000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','decisions.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('b3000000-0000-0000-0000-000000000061','b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000011','b3000000-0000-0000-0000-000000000022','b3000000-0000-0000-0000-000000000031'),
('b3000000-0000-0000-0000-000000000062','b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000012','b3000000-0000-0000-0000-000000000022','b3000000-0000-0000-0000-000000000032'),
('b3000000-0000-0000-0000-000000000063','b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000013','b3000000-0000-0000-0000-000000000022','b3000000-0000-0000-0000-000000000033');
insert into public.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('b3000000-0000-0000-0000-000000000071','b3000000-0000-0000-0000-000000000001','TOP-S87','Decision Topic',
 'b3000000-0000-0000-0000-000000000022','b3000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('b3000000-0000-0000-0000-000000000081','b3000000-0000-0000-0000-000000000001','MTG-S87-1','b3000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'b3000000-0000-0000-0000-000000000011','ready_to_start');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('b3000000-0000-0000-0000-000000000091','b3000000-0000-0000-0000-000000000001',
 'b3000000-0000-0000-0000-000000000081','b3000000-0000-0000-0000-000000000071',1);

create temporary table s147_state(round_id uuid, decision_id uuid, item_updated_at timestamptz, minutes_updated_at timestamptz, draft text);
insert into s147_state default values;
grant select,insert,update,delete on s147_state to authenticated;

-- Reads the decision's current concurrency token as the test owner.
create function pg_temp.s147_decision_token() returns timestamptz language sql security definer as
$$ select updated_at from qarar_decisions.decisions where id=(select decision_id from s147_state) $$;
create function pg_temp.s147_approval(p_user uuid) returns qarar_minutes.minute_approvals language sql security definer as
$$ select a.* from qarar_minutes.minute_approvals a join qarar_minutes.meeting_minutes m on m.id=a.minute_id
   where m.meeting_id='b3000000-0000-0000-0000-000000000081' and a.user_id=p_user $$;

set local role authenticated;
set local "request.jwt.claims"='{"sub":"b3000000-0000-0000-0000-000000000011","role":"authenticated"}';
select api_v1.open_meeting_session('b3000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b3000000-0000-0000-0000-000000000081'));
select api_v1.verify_attendance(ar.id,case when ar.user_id='b3000000-0000-0000-0000-000000000011' then 'present' else 'absent' end,'Verified in the room',ar.updated_at)
from public.attendance_records ar where ar.meeting_id='b3000000-0000-0000-0000-000000000081';
select api_v1.recalculate_meeting_quorum('b3000000-0000-0000-0000-000000000081',true);
select api_v1.lock_attendance_roster('b3000000-0000-0000-0000-000000000081',(select updated_at from public.meetings where id='b3000000-0000-0000-0000-000000000081'));



set local "request.jwt.claims"='{"sub":"b3000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v1.apply_quorum_failure('b3000000-0000-0000-0000-000000000081','continue','المتابعة بقرار رئيس المجلس',(select updated_at from public.meetings where id='b3000000-0000-0000-0000-000000000081'))$$,'the chair continues without the quorum');
reset role;
-- The topic leaves the approved state after it was legitimately placed on the agenda.
update public.topics set status='returned' where id='b3000000-0000-0000-0000-000000000071';
set local role authenticated;
set local "request.jwt.claims"='{"sub":"b3000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v1.update_agenda_discussion('b3000000-0000-0000-0000-000000000091','under_discussion','افتتاح المناقشة وتسجيل الملاحظات',(select updated_at from public.agenda_items where id='b3000000-0000-0000-0000-000000000091'))$$,'discussion still proceeds');
select lives_ok($$select api_v1.update_agenda_discussion('b3000000-0000-0000-0000-000000000091','discussed','ملخص المناقشة النهائي بعد اكتمالها',(select updated_at from public.agenda_items where id='b3000000-0000-0000-0000-000000000091'))$$,'and finishes');
reset role;
select throws_ok($$insert into public.agenda_items(organization_id,meeting_id,topic_id,agenda_order) values('b3000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000081','b3000000-0000-0000-0000-000000000071',2)$$,null,'topic is not eligible for agenda without an exception','a new item for a topic that is not eligible is still refused');
select is((select count(*)::int from public.agenda_items where meeting_id='b3000000-0000-0000-0000-000000000081'),1,'and nothing was added');
select * from finish();
rollback;
