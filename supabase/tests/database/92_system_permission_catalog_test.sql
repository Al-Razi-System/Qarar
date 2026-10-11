begin;
create extension if not exists pgtap;
select plan(16);
insert into qarar_core.organizations(id,code,name_ar) values
('92000000-0000-0000-0000-000000000001','permission-catalog-test','اختبار دليل الصلاحيات'),
('92000000-0000-0000-0000-000000000002','permission-catalog-other','مؤسسة اختبار أخرى');
select is((select count(*)::integer from qarar_iam.permissions where organization_id='92000000-0000-0000-0000-000000000001'),61,'new organization receives complete catalog');
select is((select count(*)::integer from qarar_iam.role_permissions where organization_id='92000000-0000-0000-0000-000000000001'),0,'catalog does not grant roles');
select is((select count(*)::integer from qarar_iam.system_permission_catalog()),61,'catalog has unique reviewed definitions');
select is((select count(distinct code)::integer from qarar_iam.system_permission_catalog()),61,'catalog codes unique');
select ok(not exists(
  select 1 from pg_proc p cross join lateral regexp_matches(p.prosrc,
    $pattern$(?:assert_permission|has_permission|actor_has_permission)[(][^;]*?'([a-z][a-z0-9_]+[.][a-z0-9_.]+)'$pattern$,'g') matched
  where p.pronamespace in (select oid from pg_namespace where nspname like 'qarar_%')
    and not exists(select 1 from qarar_iam.system_permission_catalog() c where c.code=matched[1])
),'every currently installed literal permission gate is registered');
select is(qarar_iam.sync_system_permission_catalog('92000000-0000-0000-0000-000000000001'),0,'second synchronization is idempotent');
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id='92000000-0000-0000-0000-000000000001' and action='iam.permission_catalog.provision'),1,'idempotent synchronization does not repeat audit');
update qarar_iam.permissions set is_active=false,name_ar='تعريف مخصص محفوظ' where organization_id='92000000-0000-0000-0000-000000000001' and code='topics.read';
create temporary table preserved_permission as select id from qarar_iam.permissions where organization_id='92000000-0000-0000-0000-000000000001' and code='topics.read';
select is(qarar_iam.sync_system_permission_catalog('92000000-0000-0000-0000-000000000001'),0,'disabled definitions not replaced');
select ok(exists(select 1 from qarar_iam.permissions where id=(select id from preserved_permission) and name_ar='تعريف مخصص محفوظ' and not is_active),'existing identity label and state preserved');
select ok(not has_function_privilege('authenticated','qarar_iam.sync_system_permission_catalog(uuid)','execute') and not has_function_privilege('service_role','qarar_iam.sync_system_permission_catalog(uuid)','execute') and not has_function_privilege('anon','qarar_iam.system_permission_catalog()','execute'),'maintenance is not an end user API');
select ok(exists(select 1 from qarar_iam.permissions where organization_id='92000000-0000-0000-0000-000000000002' and code='topics.read' and is_active),'other tenant unchanged');
insert into auth.users(id,email) values('92000000-0000-0000-0000-000000000003','catalog-user@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,status) values('92000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','catalog-user@example.test','مستخدم اختبار الصلاحية','active');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('92000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','fixture_scope','جهة اختبار',false);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status) values
('92000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000004','unit_a','الجهة الأولى','active'),
('92000000-0000-0000-0000-000000000006','92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000004','unit_b','الجهة الثانية','active');
insert into qarar_iam.roles(id,organization_id,code,name_ar,role_scope) values('92000000-0000-0000-0000-000000000007','92000000-0000-0000-0000-000000000001','fixture_reader','قارئ اختبار','governance_unit');
insert into qarar_iam.role_permissions(organization_id,role_id,permission_id)
select '92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000007',id from qarar_iam.permissions where organization_id='92000000-0000-0000-0000-000000000001' and code='meetings.read';
insert into qarar_iam.memberships(organization_id,user_id,role_id,governance_unit_id,membership_status,start_date)
values('92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000007','92000000-0000-0000-0000-000000000005','active',current_date);
set local "request.jwt.claims"='{"sub":"92000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}';
select ok(qarar_iam.has_permission('meetings.read','92000000-0000-0000-0000-000000000005'),'assigned context allowed');
select ok(not qarar_iam.has_permission('meetings.read','92000000-0000-0000-0000-000000000006'),'other context denied');
select ok(not qarar_iam.has_permission('meetings.read',null),'global scope not implied');
select ok(not qarar_iam.has_permission('iam.users.manage',null),'catalog alone grants no administration');
select ok(not qarar_iam.has_permission('voting.cast','92000000-0000-0000-0000-000000000005'),'unselected catalog permission denied');
select * from finish();
rollback;
