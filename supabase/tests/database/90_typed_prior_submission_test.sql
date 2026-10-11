begin;
create extension if not exists pgtap;
select plan(14);

insert into qarar_core.organizations(id,code,name_ar)
values('90000000-0000-0000-0000-000000000001','typed-submission-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('90000000-0000-0000-0000-000000000002','typed-submission@example.test'),
('90000000-0000-0000-0000-000000000003','typed-submission-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','typed-submission@example.test','قارئ نموذج الحوكمة',true),
('90000000-0000-0000-0000-000000000003','90000000-0000-0000-0000-000000000001','typed-submission-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into auth.users(id,email) values('90000000-0000-0000-0000-000000000004','typed-scoped-submitter@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('90000000-0000-0000-0000-000000000004','90000000-0000-0000-0000-000000000001','typed-scoped-submitter@example.test','مقدم موضوع بلا عضوية',false);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('90000000-0000-0000-0000-000000000010','90000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('90000000-0000-0000-0000-000000000013','90000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('90000000-0000-0000-0000-000000000011','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','90000000-0000-0000-0000-000000000010'),
('90000000-0000-0000-0000-000000000012','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','90000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('90000000-0000-0000-0000-000000000020','90000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('90000000-0000-0000-0000-000000000021','90000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','90000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('90000000-0000-0000-0000-000000000022','90000000-0000-0000-0000-000000000001',
 '90000000-0000-0000-0000-000000000021','90000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'90000000-0000-0000-0000-000000000002',clock_timestamp(),
 '90000000-0000-0000-0000-000000000002',clock_timestamp(),'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('90000000-0000-0000-0000-000000000030','90000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','90000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('90000000-0000-0000-0000-000000000031','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'voting','review','90000000-0000-0000-0000-000000000011',true,false,array['approved']::text[]);
insert into qarar_governance.workflow_template_steps(organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes)
values('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000031','next_council','المجلس التالي',2,'voting','final_approve','90000000-0000-0000-0000-000000000012',false,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='90000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='90000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000022','90000000-0000-0000-0000-000000000031','effective',true,current_date,'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('90000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'90000000-0000-0000-0000-000000000002',clock_timestamp(),'90000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000022',id,'jurisdiction','90000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='90000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('90000000-0000-0000-0000-000000000040','90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000022',
 'effective',true,5,'90000000-0000-0000-0000-000000000002',clock_timestamp(),'90000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','90000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'90000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('90000000-0000-0000-0000-000000000040') payload;

insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
values('90000000-0000-0000-0000-000000000022','90000000-0000-0000-0000-000000000001','route',2);

reset role;
select is(qarar_governance.prepare_typed_topic_v2('90000000-0000-0000-0000-000000000022','90000000-0000-0000-0000-000000000011')->>'can_resume','true','authorized requester can resume typed route');
create temporary table input as select jsonb_build_object('title','عنوان استكمال المسار','description','وصف استكمال مسار سابق موثق','versionId','90000000-0000-0000-0000-000000000022','unitId','90000000-0000-0000-0000-000000000011','evidence',jsonb_build_array(jsonb_build_object('template_step_id',id,'meeting_date',current_date::text,'decision_type','approved','decision_text','اعتماد القرار','bypass_reason','تم انعقاد الاجتماع قبل دخول النظام'))) payload from qarar_governance.workflow_template_steps where workflow_template_version_id='90000000-0000-0000-0000-000000000031' and is_initial;
grant select on input to qarar_api_executor;
set local role qarar_api_executor;
select is(api_v2.prepare_typed_submission_v2('90000000-0000-0000-0000-000000000050',(select payload from input))->>'ok','true','prepare prior route with fixed classification');
reset role;
insert into storage.objects(bucket_id,name,metadata) values
('qarar-evidence','topic-preparations/90000000-0000-0000-0000-000000000050/90000000-0000-0000-0000-000000000051.png','{"size":100,"mimetype":"image/png"}'),
('qarar-evidence','topic-preparations/90000000-0000-0000-0000-000000000050/90000000-0000-0000-0000-000000000052.png','{"size":100,"mimetype":"image/png"}');
set local role qarar_api_executor;
select is(api_v2.register_typed_submission_file_v2('90000000-0000-0000-0000-000000000050','90000000-0000-0000-0000-000000000051','proof.png','topic-preparations/90000000-0000-0000-0000-000000000050/90000000-0000-0000-0000-000000000051.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=90000000-0000-0000-0000-000000000050&fileId=90000000-0000-0000-0000-000000000051',0)->>'ok','true','register proof for completed prefix step');
select is(api_v2.register_typed_submission_file_v2('90000000-0000-0000-0000-000000000050','90000000-0000-0000-0000-000000000052','other.png','topic-preparations/90000000-0000-0000-0000-000000000050/90000000-0000-0000-0000-000000000052.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=90000000-0000-0000-0000-000000000050&fileId=90000000-0000-0000-0000-000000000052',null)->>'ok','true','register remaining classification file');
create temporary table submitted as select api_v2.submit_typed_submission_v2('90000000-0000-0000-0000-000000000050') payload;
select is((select payload->>'ok' from submitted),'true','submit typed prior request atomically');
select is((select payload#>>'{data,prior_route_status}' from submitted),'submitted','evidence awaits independent review');
reset role;
select is((select count(*)::integer from qarar_governance.workflow_instance_steps where organization_id='90000000-0000-0000-0000-000000000001' and status='active'),0,'no stages active before evidence approved');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id) values('90000000-0000-0000-0000-000000000060','90000000-0000-0000-0000-000000000001','MTG-TEST-90','90000000-0000-0000-0000-000000000011','اجتماع الأدلة المعلقة',current_date,'90000000-0000-0000-0000-000000000002');
select is(api_v1.search_eligible_agenda_topics('90000000-0000-0000-0000-000000000060')->>'total','0','pending prior route is absent from eligible agenda');
select throws_ok(format('select api_v1.add_agenda_item(%L,%L,false,null)','90000000-0000-0000-0000-000000000060',(select payload#>>'{data,topic_id}' from submitted)),'P0001','topic is not eligible for agenda','cannot add pending evidence request manually');
select throws_ok(format('select api_v1.review_topic_prior_route_request(%L,''approve'',''اعتماد المحضر السابق'')',(select payload#>>'{data,request_id}' from submitted)),'42501','لا يجوز لمقدم الطلب اعتماد أدلته بنفسه','cannot approve own evidence');
set local "request.jwt.claims"='{"sub":"90000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(format('select api_v1.review_topic_prior_route_request(%L,''approve'',''اعتماد المحضر السابق'')',(select payload#>>'{data,request_id}' from submitted)),'independent reviewer approves evidence');
select is((select current_unit_id from qarar_topics.topics where organization_id='90000000-0000-0000-0000-000000000001'),'90000000-0000-0000-0000-000000000012'::uuid,'resumed topic assigned to next council not original source');
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id) values('90000000-0000-0000-0000-000000000061','90000000-0000-0000-0000-000000000001','MTG-NEXT-90','90000000-0000-0000-0000-000000000012','اجتماع المرحلة التالية',current_date,'90000000-0000-0000-0000-000000000003');
select is(api_v1.search_eligible_agenda_topics('90000000-0000-0000-0000-000000000061')->>'total','1','approved evidence enables next council agenda');
select lives_ok(format('select api_v1.add_agenda_item(%L,%L,false,null)','90000000-0000-0000-0000-000000000061',(select payload#>>'{data,topic_id}' from submitted)),'resumed typed topic enters next council meeting without external decision');
select * from finish();
rollback;
