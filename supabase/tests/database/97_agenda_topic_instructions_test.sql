begin;
-- Committed fixture for decision_minutes_lock.sh: a meeting in minutes preparation
-- with one decision and a generated draft. Throwaway databases only.
\set ON_ERROR_STOP 1
insert into public.organizations(id,code,name_ar) values
('97000000-0000-0000-0000-000000000001','s97-prod','Lock Race Production'),
('97000000-0000-0000-0000-000000000002','s97-foreign','Lock Race Foreign');
insert into auth.users(id,email) values
('97000000-0000-0000-0000-000000000011','chair@s97.test'),
('97000000-0000-0000-0000-000000000012','rapporteur@s97.test'),
('97000000-0000-0000-0000-000000000013','member@s97.test'),
('97000000-0000-0000-0000-000000000014','foreign@s97.test'),
('97000000-0000-0000-0000-000000000015','sysadmin@s97.test'),
('97000000-0000-0000-0000-000000000016','secretary@s97.test');
insert into public.users(id,organization_id,email,full_name_ar) values
('97000000-0000-0000-0000-000000000011','97000000-0000-0000-0000-000000000001','chair@s97.test','Council Chair'),
('97000000-0000-0000-0000-000000000012','97000000-0000-0000-0000-000000000001','rapporteur@s97.test','Council Rapporteur'),
('97000000-0000-0000-0000-000000000013','97000000-0000-0000-0000-000000000001','member@s97.test','Council Member'),
('97000000-0000-0000-0000-000000000014','97000000-0000-0000-0000-000000000002','foreign@s97.test','Foreign'),
('97000000-0000-0000-0000-000000000016','97000000-0000-0000-0000-000000000001','secretary@s97.test','Council Secretary');
insert into public.users(id,organization_id,email,full_name_ar,is_system_admin) values
('97000000-0000-0000-0000-000000000015','97000000-0000-0000-0000-000000000001','sysadmin@s97.test','System Admin',true);
insert into public.governance_unit_types(id,organization_id,code,name_ar) values
('97000000-0000-0000-0000-000000000021','97000000-0000-0000-0000-000000000001','council','Council');
insert into public.governance_units(id,organization_id,unit_type_id,code,name_ar,quorum_percentage) values
('97000000-0000-0000-0000-000000000022','97000000-0000-0000-0000-000000000001',
 '97000000-0000-0000-0000-000000000021','main','Main Council',60);
update qarar_core.governance_units set minute_approval_rule='all_present_members'
where id='97000000-0000-0000-0000-000000000022';
-- Organizations are seeded with empty council leadership roles; use fixed ids instead.
delete from public.roles where organization_id='97000000-0000-0000-0000-000000000001' and code in ('council_chair','council_rapporteur');
insert into public.roles(id,organization_id,code,name_ar,role_scope) values
('97000000-0000-0000-0000-000000000031','97000000-0000-0000-0000-000000000001','council_chair','Chair','governance_unit'),
('97000000-0000-0000-0000-000000000032','97000000-0000-0000-0000-000000000001','council_rapporteur','Rapporteur','governance_unit'),
('97000000-0000-0000-0000-000000000033','97000000-0000-0000-0000-000000000001','s97_member','Member','governance_unit'),
('97000000-0000-0000-0000-000000000034','97000000-0000-0000-0000-000000000001','s97_secretary','Secretary','governance_unit');
insert into public.permissions(id,organization_id,code,module,action,context_scope,name_ar) values
('97000000-0000-0000-0000-000000000041','97000000-0000-0000-0000-000000000001','meetings.manage','meetings','manage','governance_unit','Manage meeting'),
('97000000-0000-0000-0000-000000000042','97000000-0000-0000-0000-000000000001','attendance.read','attendance','read','governance_unit','Read attendance'),
('97000000-0000-0000-0000-000000000043','97000000-0000-0000-0000-000000000001','attendance.manage','attendance','manage','governance_unit','Manage attendance'),
('97000000-0000-0000-0000-000000000044','97000000-0000-0000-0000-000000000001','quorum.read','quorum','read','governance_unit','Read quorum'),
('97000000-0000-0000-0000-000000000045','97000000-0000-0000-0000-000000000001','quorum.manage','quorum','manage','governance_unit','Manage quorum'),
('97000000-0000-0000-0000-000000000046','97000000-0000-0000-0000-000000000001','voting.read','voting','read','governance_unit','Read voting'),
('97000000-0000-0000-0000-000000000047','97000000-0000-0000-0000-000000000001','voting.manage','voting','manage','governance_unit','Manage voting'),
('97000000-0000-0000-0000-000000000048','97000000-0000-0000-0000-000000000001','voting.cast','voting','cast','governance_unit','Cast vote'),
('97000000-0000-0000-0000-000000000049','97000000-0000-0000-0000-000000000001','attendance.check_in','attendance','check_in','governance_unit','Self check-in'),
('97000000-0000-0000-0000-000000000050','97000000-0000-0000-0000-000000000001','attendance.verify','attendance','verify','governance_unit','Verify attendance'),
('97000000-0000-0000-0000-000000000051','97000000-0000-0000-0000-000000000001','attendance.override','attendance','override','governance_unit','Override attendance'),
('97000000-0000-0000-0000-000000000052','97000000-0000-0000-0000-000000000001','attendance.lock','attendance','lock','governance_unit','Lock attendance'),
('97000000-0000-0000-0000-000000000053','97000000-0000-0000-0000-000000000001','topics.read','topics','read','governance_unit','Read governed topics'),
('97000000-0000-0000-0000-000000000054','97000000-0000-0000-0000-000000000001','agenda.manage','agenda','manage','governance_unit','Manage agenda'),
('97000000-0000-0000-0000-000000000055','97000000-0000-0000-0000-000000000001','decisions.read','decisions','read','governance_unit','Read decisions')
on conflict (organization_id,code) do nothing;
-- The chair, and an administrative secretary who is not council leadership,
-- hold every permission of the council.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '97000000-0000-0000-0000-000000000001',role_id,p.id
from public.permissions p
cross join (values ('97000000-0000-0000-0000-000000000031'::uuid),('97000000-0000-0000-0000-000000000034'::uuid)) r(role_id)
where p.organization_id='97000000-0000-0000-0000-000000000001'
  and p.code in ('meetings.manage','attendance.read','attendance.manage','quorum.read','quorum.manage','voting.read','voting.manage','voting.cast','attendance.check_in','attendance.verify','attendance.override','attendance.lock','topics.read','agenda.manage','decisions.read');
-- The rapporteur manages the agenda but not the meeting.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000032',id
from public.permissions where organization_id='97000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','topics.read','agenda.manage','decisions.read');
-- A member reads decisions and votes, nothing more.
insert into public.role_permissions(organization_id,role_id,permission_id)
select '97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000033',id
from public.permissions where organization_id='97000000-0000-0000-0000-000000000001' and code in ('attendance.read','quorum.read','voting.read','voting.cast','attendance.check_in','decisions.read');
insert into public.memberships(id,organization_id,user_id,governance_unit_id,role_id) values
('97000000-0000-0000-0000-000000000061','97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000011','97000000-0000-0000-0000-000000000022','97000000-0000-0000-0000-000000000031'),
('97000000-0000-0000-0000-000000000062','97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000012','97000000-0000-0000-0000-000000000022','97000000-0000-0000-0000-000000000032'),
('97000000-0000-0000-0000-000000000063','97000000-0000-0000-0000-000000000001','97000000-0000-0000-0000-000000000013','97000000-0000-0000-0000-000000000022','97000000-0000-0000-0000-000000000033');
insert into qarar_topics.topics(id,organization_id,topic_no,title_ar,current_unit_id,submitted_by_user_id,status) values
('97000000-0000-0000-0000-000000000071','97000000-0000-0000-0000-000000000001','TOP-S89','Decision Topic',
 '97000000-0000-0000-0000-000000000022','97000000-0000-0000-0000-000000000011','approved');
insert into public.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id,status) values
('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000001','MTG-S89-1','97000000-0000-0000-0000-000000000022','Decision Meeting',current_date,'97000000-0000-0000-0000-000000000011','draft');
insert into public.agenda_items(id,organization_id,meeting_id,topic_id,agenda_order) values
('97000000-0000-0000-0000-000000000091','97000000-0000-0000-0000-000000000001',
 '97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071',1);


create extension if not exists pgtap;
select plan(11);
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id) select p.organization_id,'97000000-0000-0000-0000-000000000031',p.id from qarar_iam.permissions p where p.organization_id='97000000-0000-0000-0000-000000000001' and p.code='meetings.read' on conflict do nothing;
create function pg_temp.token() returns timestamptz language sql security definer as $$select updated_at from qarar_meetings.agenda_items where id='97000000-0000-0000-0000-000000000091'$$;
set local role authenticated;
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','تعليمات خاصة لهذا الموضوع',pg_temp.token())$$,'chair saves per-topic instructions');
select is(api_v1.get_meeting_detail('97000000-0000-0000-0000-000000000081')#>>'{agenda_items,0,discussion_instructions}','تعليمات خاصة لهذا الموضوع','following stage reads the override');
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','قديم','2000-01-01'::timestamptz)$$,'40001',null,'stale token rejected');
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000012","role":"authenticated"}';
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','مقرر',pg_temp.token())$$,'42501',null,'rapporteur cannot customize');
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000015","role":"authenticated"}';
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','مدير',pg_temp.token())$$,'42501',null,'system administrator alone cannot customize');
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000014","role":"authenticated"}';
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','خارجي',pg_temp.token())$$,'P0002',null,'foreign organization denied');
reset role;
select is((select typed_creation_request from qarar_topics.topics where id='97000000-0000-0000-0000-000000000071'),null::jsonb,'legacy topic classification snapshot is unchanged');
delete from qarar_meetings.agenda_items where id='97000000-0000-0000-0000-000000000091';
set local role authenticated;
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000011","role":"authenticated"}';
select lives_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','نص عند الإدراج',null)$$,'insertion and customization are atomic');
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','نص مكرر',null)$$,'40001',null,'duplicate insertion cannot overwrite saved instructions');
select is(api_v1.get_meeting_detail('97000000-0000-0000-0000-000000000081')#>>'{agenda_items,0,discussion_instructions}','نص عند الإدراج','inserted instructions reach meeting detail');
reset role;
update qarar_meetings.meetings set status='scheduled' where id='97000000-0000-0000-0000-000000000081';
update qarar_meetings.meetings set status='ready_to_start' where id='97000000-0000-0000-0000-000000000081';
set local role authenticated;
set local "request.jwt.claims"='{"sub":"97000000-0000-0000-0000-000000000011","role":"authenticated"}';
select throws_ok($$select api_v1.save_agenda_topic_instructions('97000000-0000-0000-0000-000000000081','97000000-0000-0000-0000-000000000071','مقفل',null)$$,'55000',null,'locked preparation rejects customization');
select * from finish();
rollback;

