begin;
create extension if not exists pgtap;
select plan(7);

insert into qarar_core.organizations(id,code,name_ar)
values('58000000-0000-0000-0000-000000000001','governance-v2-options-ci','منظمة اختبار خيارات الإعداد');
insert into auth.users(id,email) values
('58000000-0000-0000-0000-000000000002','governance-v2-options-admin@example.test'),
('58000000-0000-0000-0000-000000000003','governance-v2-options-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('58000000-0000-0000-0000-000000000002','58000000-0000-0000-0000-000000000001','governance-v2-options-admin@example.test','مسؤول خيارات الإعداد',true),
('58000000-0000-0000-0000-000000000003','58000000-0000-0000-0000-000000000001','governance-v2-options-denied@example.test','مستخدم دون صلاحية',false);

set local "request.jwt.claims"='{"sub":"58000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,created_by_user_id) values
('58000000-0000-0000-0000-000000000010','58000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,'58000000-0000-0000-0000-000000000002'),
('58000000-0000-0000-0000-000000000011','58000000-0000-0000-0000-000000000001','retired','قديم','retired',false,'58000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,status,created_by_user_id)
values('58000000-0000-0000-0000-000000000020','58000000-0000-0000-0000-000000000001','academic.route','المسار الأكاديمي','active','58000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('58000000-0000-0000-0000-000000000021','58000000-0000-0000-0000-000000000001','58000000-0000-0000-0000-000000000020',1,'active','valid','58000000-0000-0000-0000-000000000002',clock_timestamp(),'58000000-0000-0000-0000-000000000002');

create temporary table options as select qarar_governance.get_governance_authoring_options_v2() payload;
select is((select jsonb_array_length(payload->'classifications') from options),1,'retired classifications are hidden');
select is((select payload#>>'{classifications,0,code}' from options),'academic','classification has stable code');
select is((select jsonb_array_length(payload->'workflow_versions') from options),1,'only active valid routes are returned');
select is((select payload#>>'{workflow_versions,0,name_ar}' from options),'المسار الأكاديمي','route has Arabic display name');

set local role qarar_api_executor;
create temporary table envelope as select api_v2.get_governance_authoring_options_v2() payload;
select is((select payload->>'ok' from envelope),'true','API envelope succeeds');
select matches((select payload->>'trace_id' from envelope),'^[0-9a-f-]{36}$','success includes trace id');

set local "request.jwt.claims"='{"sub":"58000000-0000-0000-0000-000000000003","role":"authenticated"}';
create temporary table denied as select api_v2.get_governance_authoring_options_v2() payload;
select is((select payload->>'error_code' from denied),'MODEL_PERMISSION_DENIED','unauthorized author is denied safely');
select * from finish();
rollback;
