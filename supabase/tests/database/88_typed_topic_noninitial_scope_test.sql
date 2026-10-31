begin;
create extension if not exists pgtap;
select plan(5);

insert into qarar_core.organizations(id,code,name_ar)
values('88000000-0000-0000-0000-000000000001','typed-submission-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('88000000-0000-0000-0000-000000000002','typed-submission@example.test'),
('88000000-0000-0000-0000-000000000003','typed-submission-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('88000000-0000-0000-0000-000000000002','88000000-0000-0000-0000-000000000001','typed-submission@example.test','قارئ نموذج الحوكمة',true),
('88000000-0000-0000-0000-000000000003','88000000-0000-0000-0000-000000000001','typed-submission-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into auth.users(id,email) values('88000000-0000-0000-0000-000000000004','typed-scoped-submitter@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('88000000-0000-0000-0000-000000000004','88000000-0000-0000-0000-000000000001','typed-scoped-submitter@example.test','مقدم موضوع بلا عضوية',false);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('88000000-0000-0000-0000-000000000010','88000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('88000000-0000-0000-0000-000000000013','88000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('88000000-0000-0000-0000-000000000011','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','88000000-0000-0000-0000-000000000010'),
('88000000-0000-0000-0000-000000000012','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','88000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('88000000-0000-0000-0000-000000000020','88000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('88000000-0000-0000-0000-000000000021','88000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','88000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000001',
 '88000000-0000-0000-0000-000000000021','88000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'88000000-0000-0000-0000-000000000002',clock_timestamp(),
 '88000000-0000-0000-0000-000000000002',clock_timestamp(),'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('88000000-0000-0000-0000-000000000030','88000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','88000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('88000000-0000-0000-0000-000000000031','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','88000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='88000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='88000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000031','effective',true,current_date,'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('88000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'88000000-0000-0000-0000-000000000002',clock_timestamp(),'88000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022',id,'jurisdiction','88000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='88000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('88000000-0000-0000-0000-000000000040','88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022',
 'effective',true,5,'88000000-0000-0000-0000-000000000002',clock_timestamp(),'88000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','88000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'88000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('88000000-0000-0000-0000-000000000040') payload;

insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
values('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000001','route',2);

reset role;
update qarar_governance.topic_type_authoring_profiles_v2 set scope_kind='councils' where topic_type_version_id='88000000-0000-0000-0000-000000000022';
insert into qarar_governance.topic_type_origin_scopes_v2(organization_id,topic_type_version_id,council_id)
values('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000011'),
('88000000-0000-0000-0000-000000000001','88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000012');
set local role qarar_api_executor;
select is(jsonb_array_length(api_v2.list_effective_topic_types_v2('88000000-0000-0000-0000-000000000012')->'data'),1,'explicit scope council need not be first route step');
select is(api_v2.prepare_typed_topic_v2('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000012')->>'ok','true','non-initial allowed council prepares complete route');
select is(api_v2.prepare_typed_topic_v2('88000000-0000-0000-0000-000000000022','88000000-0000-0000-0000-000000000012')#>>'{data,steps,0,resolved_governance_unit_id}','88000000-0000-0000-0000-000000000011','preview still starts at first council');
select lives_ok($$select api_v2.save_user_submission_scope_v2('88000000-0000-0000-0000-000000000004',0,null,'[{"kind":"council","target_id":"88000000-0000-0000-0000-000000000012","include_descendants":false}]',gen_random_uuid())$$,'assign scoped non-admin');
set local "request.jwt.claims"='{"sub":"88000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.list_effective_topic_types_v2('88000000-0000-0000-0000-000000000011')->>'error_code','MODEL_PERMISSION_DENIED','classification scope does not grant user permission');
select * from finish();
rollback;
