begin;
create extension if not exists pgtap;
select plan(3);

insert into qarar_core.organizations(id,code,name_ar)
values('91000000-0000-0000-0000-000000000001','typed-submission-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('91000000-0000-0000-0000-000000000002','typed-submission@example.test'),
('91000000-0000-0000-0000-000000000003','typed-submission-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('91000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000001','typed-submission@example.test','قارئ نموذج الحوكمة',true),
('91000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000001','typed-submission-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into auth.users(id,email) values('91000000-0000-0000-0000-000000000004','typed-scoped-submitter@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('91000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000001','typed-scoped-submitter@example.test','مقدم موضوع بلا عضوية',false);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('91000000-0000-0000-0000-000000000010','91000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('91000000-0000-0000-0000-000000000013','91000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('91000000-0000-0000-0000-000000000011','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','91000000-0000-0000-0000-000000000010'),
('91000000-0000-0000-0000-000000000012','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','91000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('91000000-0000-0000-0000-000000000020','91000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('91000000-0000-0000-0000-000000000021','91000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','91000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('91000000-0000-0000-0000-000000000022','91000000-0000-0000-0000-000000000001',
 '91000000-0000-0000-0000-000000000021','91000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'91000000-0000-0000-0000-000000000002',clock_timestamp(),
 '91000000-0000-0000-0000-000000000002',clock_timestamp(),'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('91000000-0000-0000-0000-000000000030','91000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','91000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('91000000-0000-0000-0000-000000000031','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','91000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='91000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='91000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000022','91000000-0000-0000-0000-000000000031','effective',true,current_date,'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('91000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'91000000-0000-0000-0000-000000000002',clock_timestamp(),'91000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000022',id,'jurisdiction','91000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='91000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('91000000-0000-0000-0000-000000000040','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000022',
 'effective',true,5,'91000000-0000-0000-0000-000000000002',clock_timestamp(),'91000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','91000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'91000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('91000000-0000-0000-0000-000000000040') payload;

insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
values('91000000-0000-0000-0000-000000000022','91000000-0000-0000-0000-000000000001','route',2);

reset role;
create temporary table topic as select (qarar_topics.create_topic_from_type_v2('موضوع قرار الاجتماع','وصف موضوع قرار الاجتماع الكامل','91000000-0000-0000-0000-000000000022','91000000-0000-0000-0000-000000000011',gen_random_uuid())->>'topic_id')::uuid id;
select throws_ok($$select api_v1.review_topic((select id from topic),'approve',null,null)$$,'23514','قرار القبول أو الرفض يُسجل أثناء مناقشة الموضوع داخل الاجتماع','public topic approval cannot bypass meeting');
select throws_ok($$select api_v1.review_topic((select id from topic),'reject','سبب الرفض',null)$$,'23514','قرار القبول أو الرفض يُسجل أثناء مناقشة الموضوع داخل الاجتماع','public topic rejection cannot bypass meeting');
select throws_ok($$select api_v1.refer_topic((select id from topic),gen_random_uuid(),'سبب الإحالة',null)$$,'23514','إحالة الموضوع تُسجل أثناء مناقشته داخل الاجتماع','public topic referral cannot bypass meeting');
select * from finish();
rollback;
