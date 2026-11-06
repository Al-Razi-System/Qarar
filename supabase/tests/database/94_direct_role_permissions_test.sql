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
values('93000000-0000-0000-0000-000000000020','93000000-0000-0000-0000-000000000001','fixture_scope','جهة اختبار',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('93000000-0000-0000-0000-000000000021','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_a','الجهة الأولى','active'),
('93000000-0000-0000-0000-000000000022','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000020','unit_b','الجهة الثانية','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope)
values('93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000001','fixture_matrix','دور الاختبار','organization');
insert into qarar_iam.memberships(id,organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
values('93000000-0000-0000-0000-000000000031','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000030','93000000-0000-0000-0000-000000000021','active',current_date);


select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);
select lives_ok($call$select api_v2.set_role_permissions_direct_v2(
'93000000-0000-0000-0000-000000000030',array['meetings.read'],array[]::text[],
'93000000-0000-0000-0000-000000000099',null)$call$,'system administrator saves directly without approval');
select is((select count(*)::integer from qarar_iam.iam_change_requests where organization_id='93000000-0000-0000-0000-000000000001'),0,'direct save creates no approval request');
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id='93000000-0000-0000-0000-000000000001' and action='iam.role_permissions.direct_save'),1,'one actor-bound audit event');
select lives_ok($call$select api_v2.set_role_permissions_direct_v2(
'93000000-0000-0000-0000-000000000030',array['meetings.read'],array[]::text[],
'93000000-0000-0000-0000-000000000099',null)$call$,'identical request replay returns receipt');
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id='93000000-0000-0000-0000-000000000001' and action='iam.role_permissions.direct_save'),1,'replay has no duplicate audit');
select throws_ok($call$select api_v2.set_role_permissions_direct_v2(
'93000000-0000-0000-0000-000000000030',array['topics.read'],array[]::text[],
'93000000-0000-0000-0000-000000000099',null)$call$,'40001','استُخدم طلب الحفظ لبيانات أخرى؛ أعد تحميل الدور','changed replay denied');
select throws_ok($call$select api_v2.set_role_permissions_direct_v2(
'93000000-0000-0000-0000-000000000030',array['topics.read'],array[]::text[],
gen_random_uuid(),null)$call$,'40001','تغيّرت صلاحيات الدور في صفحة أخرى؛ أعد تحميله قبل الحفظ','stale tab cannot overwrite another save');
select throws_ok($call$select api_v2.set_role_permissions_direct_v2(
'93000000-0000-0000-0000-000000000030',array['not.real'],array['meetings.read'],
gen_random_uuid(),null)$call$,'22023','إحدى الصلاحيات غير متاحة؛ أعد تحميل الدليل','unknown permission denied');
select api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000030',array[]::text[],array['meetings.read'],gen_random_uuid(),null);

create function pg_temp.test_direct_matrix() returns setof text language plpgsql as $$
declare p record; req uuid; member_id uuid:='93000000-0000-0000-0000-000000000012'; unit_id uuid:='93000000-0000-0000-0000-000000000021';
begin
 for p in select * from qarar_iam.system_permission_catalog() order by code loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated','aal','aal2')::text,true);
  return next ok(not qarar_iam.has_permission(p.code,unit_id),p.code||': denied before direct grant');
  perform set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);
  req:=gen_random_uuid();
  perform api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000030',array[p.code],array[]::text[],req,null);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated','aal','aal2')::text,true);
  return next ok(qarar_iam.has_permission(p.code,unit_id),p.code||': granted immediately');
  return next ok(qarar_iam.actor_has_permission(member_id,p.code,unit_id),p.code||': actor grant agrees');
  return next throws_ok(format('select api_v2.set_role_permissions_direct_v2(%L::uuid,array[]::text[],array[%L],gen_random_uuid(),null)','93000000-0000-0000-0000-000000000030',p.code),'42501','حفظ الصلاحيات مباشرة متاح لمسؤول النظام فقط',p.code||': ordinary actor cannot save directly');
  perform set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);
  perform api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000030',array[]::text[],array[p.code],gen_random_uuid(),null);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated','aal','aal2')::text,true);
  return next ok(not qarar_iam.has_permission(p.code,unit_id),p.code||': revoked immediately');
  return next ok(not qarar_iam.actor_has_permission(member_id,p.code,unit_id),p.code||': actor revocation agrees');
 end loop;
end $$;
select * from pg_temp.test_direct_matrix();
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);
select qarar_iam.admin_request_role_permissions_change('93000000-0000-0000-0000-000000000030',array['topics.read'],'طلب سابق معلق');
select api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000030',array['meetings.read'],array[]::text[],gen_random_uuid(),null);
select is((select count(*)::integer from qarar_iam.iam_change_requests where target_role_id='93000000-0000-0000-0000-000000000030' and status='pending'),0,'direct save supersedes pending legacy request');
select is((select count(*)::integer from qarar_iam.iam_change_requests where target_role_id='93000000-0000-0000-0000-000000000030' and status='rejected'),1,'legacy request retained with superseded rejection');
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal1"}',true);
select throws_ok($call$select api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000030',array[]::text[],array['meetings.read'],gen_random_uuid(),null)$call$,'42501','أكمل التحقق الإضافي قبل تغيير الصلاحيات','direct HTTP RPC requires MFA');
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000010","role":"authenticated","aal":"aal2"}',true);
select throws_ok($call$select api_v2.set_role_permissions_direct_v2('93000000-0000-0000-0000-000000000070',array[]::text[],array[]::text[],gen_random_uuid(),null)$call$,'P0002','الدور غير موجود في مؤسستك','unknown role denied');
select ok(not has_table_privilege('authenticated','qarar_iam.role_permission_save_receipts_v2','select'),'receipts not exposed as tables');
select * from finish();
rollback;
