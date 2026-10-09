begin;
create extension if not exists pgtap;
select plan(12);
select ok(has_function_privilege('authenticated','api_v2.get_governance_bundle_v2(uuid)','EXECUTE'),'authenticated can call safe details wrapper');
select ok(not has_function_privilege('anon','api_v2.get_governance_bundle_v2(uuid)','EXECUTE'),'anonymous cannot call details');
insert into qarar_core.organizations(id,code,name_ar) values
('77000000-0000-0000-0000-000000000001','type-management-ci','اختبار إدارة التصنيفات');
insert into auth.users(id,email) values
('77000000-0000-0000-0000-000000000002','type-management-admin@example.test'),
('77000000-0000-0000-0000-000000000003','type-management-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('77000000-0000-0000-0000-000000000002','77000000-0000-0000-0000-000000000001','type-management-admin@example.test','مسؤول اختبار',true),
('77000000-0000-0000-0000-000000000003','77000000-0000-0000-0000-000000000001','type-management-denied@example.test','دون صلاحية',false);
set local "request.jwt.claims"='{"sub":"77000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,created_by_user_id)
values('77000000-0000-0000-0000-000000000010','77000000-0000-0000-0000-000000000001','academic','أكاديمي','77000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('77000000-0000-0000-0000-000000000011','77000000-0000-0000-0000-000000000001','test-type','خطة الاختبارات','77000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(id,organization_id,topic_type_id,classification_id,version_no,acceptance_finality,rejection_finality,created_by_user_id)
values('77000000-0000-0000-0000-000000000012','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000011','77000000-0000-0000-0000-000000000010',1,'advance','complete','77000000-0000-0000-0000-000000000002');
insert into qarar_governance.governance_bundles_v2(id,organization_id,topic_type_version_id,created_by_user_id)
values('77000000-0000-0000-0000-000000000013','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000012','77000000-0000-0000-0000-000000000002');
set local role qarar_api_executor;
select is(api_v2.list_governance_topic_types_v2()->'data'->>'total','1','organization isolated real list');
select is(api_v2.list_governance_topic_types_v2('اختبارات')->'data'->'items'->0->>'name_ar','خطة الاختبارات','Arabic search');
select is(api_v2.list_governance_topic_types_v2('','effective')->'data'->>'total','0','status filter');
select is(jsonb_array_length(api_v2.list_governance_topic_types_v2('','',2)->'data'->'items'),0,'pagination');
select is(api_v2.list_governance_topic_types_v2('','',0)->>'error_code','MODEL_VALIDATION_FAILED','invalid pagination rejected');
select is(api_v2.list_governance_topic_types_v2()->'data'->'items'->0->>'status','draft','reading never activates');
select is(api_v2.list_governance_topic_types_v2()->'data'->'items'->0->>'can_edit','false','legacy draft is not exposed to incomplete editor');
set local role qarar_governance_executor;
insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind)
values('77000000-0000-0000-0000-000000000012','77000000-0000-0000-0000-000000000001','route');
set local role qarar_api_executor;
select is(api_v2.list_governance_topic_types_v2()->'data'->'items'->0->>'can_edit','true','author can edit new draft');
reset role;
update qarar_iam.users set is_system_admin=true where id='77000000-0000-0000-0000-000000000003';
set local role qarar_api_executor;
set local "request.jwt.claims"='{"sub":"77000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.list_governance_topic_types_v2()->'data'->'items'->0->>'can_edit','false','global admin cannot edit someone else draft');
reset role;
update qarar_iam.users set is_system_admin=false where id='77000000-0000-0000-0000-000000000003';
set local role qarar_api_executor;
set local "request.jwt.claims"='{"sub":"77000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.list_governance_topic_types_v2()->>'error_code','MODEL_PERMISSION_DENIED','denied contextual permission');
select * from finish();
rollback;
