-- Complete authorization-engine matrix, not proof of every protected business operation.
-- Everything, including approvals and provisioned fixtures, rolls back.
begin;
create extension if not exists pgtap;
select no_plan();
insert into qarar_core.organizations(id,code,name_ar) values
('93000000-0000-0000-0000-000000000001','permission-matrix-test','اختبار المنح والسحب');
insert into auth.users(id,email) values
('93000000-0000-0000-0000-000000000010','permission-requester@example.test'),
('93000000-0000-0000-0000-000000000011','permission-approver@example.test'),
('93000000-0000-0000-0000-000000000012','permission-member@example.test'),
('93000000-0000-0000-0000-000000000013','permission-unassigned@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,status,is_system_admin)
select id,'93000000-0000-0000-0000-000000000001',email,'مستخدم اختبار','active',
id in ('93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011')
from auth.users where id in (
'93000000-0000-0000-0000-000000000010','93000000-0000-0000-0000-000000000011',
'93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000013');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('93000000-0000-0000-0000-000000000020','93000000-0000-0000-0000-000000000001','fixture_scope','جهة اختبار',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('93000000-0000-0000-0000-000000000021','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_a','الجهة الأولى','active'),
('93000000-0000-0000-0000-000000000022','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_b','الجهة الثانية','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)
values('93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000001','fixture_matrix','دور الاختبار','organization');
insert into qarar_iam.memberships(id,organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
values('93000000-0000-0000-0000-000000000031','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000021','active',current_date);


select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);

insert into qarar_meetings.meeting_types(id,organization_id,code,name_ar) values
('93000000-0000-0000-0000-000000000080','93000000-0000-0000-0000-000000000001','fixture_regular','اجتماع دوري');
create function pg_temp.save_plan(first_day text, expected timestamptz) returns jsonb language sql as $$
 select api_v2.admin_update_council_v2('93000000-0000-0000-0000-000000000021',
 '{"name_ar":"المجلس المعدّل","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}'::jsonb,expected,
 jsonb_build_object('meeting_type_id','93000000-0000-0000-0000-000000000080','recurrence','monthly','first_meeting_date',first_day));
$$;
select lives_ok($call$select pg_temp.save_plan('2026-11-01',(select updated_at from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000021'))$call$,'existing council gets plan and first draft atomically');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id='93000000-0000-0000-0000-000000000021'),1,'one draft only');
select is((select status from qarar_meetings.meetings where governance_unit_id='93000000-0000-0000-0000-000000000021'),'draft','meeting does not convene automatically');
select is(api_v2.admin_get_council_detail_v2('93000000-0000-0000-0000-000000000021')->'meeting_plan'->>'recurrence','monthly','detail returns saved plan');
select throws_ok($call$select pg_temp.save_plan('2026-11-01',(select updated_at from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000021'))$call$,'40001','للمجلس خطة اجتماعات محفوظة؛ حدّث بياناته قبل الحفظ','repeat cannot create another draft');
select throws_ok($call$select api_v2.admin_update_council_v2('93000000-0000-0000-0000-000000000022',
 '{"name_ar":"لا يحفظ","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}',
 (select updated_at from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000022'),
 '{"meeting_type_id":"93000000-0000-0000-0000-000000000080","recurrence":"monthly"}')$call$,
 '22023','أكمل إعدادات خطة الاجتماعات بقيم صحيحة','missing date rejects whole save');
select is((select name_ar from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000022'),'الجهة الثانية','failed plan leaves metadata intact');
select is((select count(*)::integer from qarar_meetings.council_meeting_plans_v2 where governance_unit_id='93000000-0000-0000-0000-000000000022'),0,'failed plan creates no record');
select throws_ok($call$select api_v2.admin_update_council_v2('93000000-0000-0000-0000-000000000022',
 '{"name_ar":"نسخة قديمة","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}',
 '2000-01-01T00:00:00Z',null)$call$,'40001','تم تعديل المجلس؛ حدّث البيانات','stale metadata cannot overwrite');
select lives_ok($call$select api_v2.admin_update_council_v2('93000000-0000-0000-0000-000000000021',
 '{"name_ar":"المجلس بعد التعديل","unit_type_id":"93000000-0000-0000-0000-000000000020","minimum_active_members":3,"allow_dual_leadership":false}',
 (select updated_at from qarar_core.governance_units where id='93000000-0000-0000-0000-000000000021'),null)$call$,'metadata edit preserves existing plan');
select is((select count(*)::integer from qarar_meetings.meetings where governance_unit_id='93000000-0000-0000-0000-000000000021'),1,'metadata edit does not regenerate draft');
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000013","role":"authenticated","aal":"aal2"}',true);
select throws_ok($call$select pg_temp.save_plan('2026-11-01',now())$call$,'42501',null,'unassigned actor cannot save');
select throws_ok($call$select api_v2.admin_get_council_detail_v2('93000000-0000-0000-0000-000000000021')$call$,'42501',null,'unassigned actor cannot read plan');
select * from finish();
rollback;
