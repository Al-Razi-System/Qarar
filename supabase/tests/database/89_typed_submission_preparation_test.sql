begin;
create extension if not exists pgtap;
select plan(33);

insert into qarar_core.organizations(id,code,name_ar)
values('89000000-0000-0000-0000-000000000001','typed-submission-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('89000000-0000-0000-0000-000000000002','typed-submission@example.test'),
('89000000-0000-0000-0000-000000000003','typed-submission-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('89000000-0000-0000-0000-000000000002','89000000-0000-0000-0000-000000000001','typed-submission@example.test','قارئ نموذج الحوكمة',true),
('89000000-0000-0000-0000-000000000003','89000000-0000-0000-0000-000000000001','typed-submission-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into auth.users(id,email) values('89000000-0000-0000-0000-000000000004','typed-scoped-submitter@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('89000000-0000-0000-0000-000000000004','89000000-0000-0000-0000-000000000001','typed-scoped-submitter@example.test','مقدم موضوع بلا عضوية',false);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('89000000-0000-0000-0000-000000000010','89000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('89000000-0000-0000-0000-000000000013','89000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('89000000-0000-0000-0000-000000000011','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','89000000-0000-0000-0000-000000000010'),
('89000000-0000-0000-0000-000000000012','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','89000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('89000000-0000-0000-0000-000000000020','89000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('89000000-0000-0000-0000-000000000021','89000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','89000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000001',
 '89000000-0000-0000-0000-000000000021','89000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'89000000-0000-0000-0000-000000000002',clock_timestamp(),
 '89000000-0000-0000-0000-000000000002',clock_timestamp(),'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('89000000-0000-0000-0000-000000000030','89000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','89000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('89000000-0000-0000-0000-000000000031','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','89000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='89000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='89000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000031','effective',true,current_date,'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('89000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'89000000-0000-0000-0000-000000000002',clock_timestamp(),'89000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000022',id,'jurisdiction','89000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='89000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('89000000-0000-0000-0000-000000000040','89000000-0000-0000-0000-000000000001','89000000-0000-0000-0000-000000000022',
 'effective',true,5,'89000000-0000-0000-0000-000000000002',clock_timestamp(),'89000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','89000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'89000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('89000000-0000-0000-0000-000000000040') payload;

insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
values('89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000001','route',2);

reset role;
set local role qarar_api_executor;
select is(api_v2.create_topic_from_type_v2('عنوان اختبار المرفقات','وصف اختبار المرفقات قبل التقديم','89000000-0000-0000-0000-000000000022','89000000-0000-0000-0000-000000000011',gen_random_uuid())->>'ok','false','legacy public command cannot bypass pre-submission requirements');
create temporary table prepared as select api_v2.prepare_typed_submission_v2('89000000-0000-0000-0000-000000000050','{"title":"عنوان اختبار المرفقات","description":"وصف اختبار المرفقات قبل التقديم","versionId":"89000000-0000-0000-0000-000000000022","unitId":"89000000-0000-0000-0000-000000000011","evidence":[]}') payload;
select is((select payload->>'ok' from prepared),'true','prepare without submitting');
reset role;
select is((select count(*)::integer from qarar_topics.topics where organization_id='89000000-0000-0000-0000-000000000001'),0,'preparation is not a topic or counted submission');
set local role qarar_api_executor;
select is(api_v2.submit_typed_submission_v2('89000000-0000-0000-0000-000000000050')->>'ok','false','missing required files blocks final submission');
select is(api_v2.register_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000051','proof.png','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000051.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=89000000-0000-0000-0000-000000000050&fileId=89000000-0000-0000-0000-000000000051',null)->>'ok','false','fake storage object cannot fulfill required files');
reset role;
insert into storage.objects(bucket_id,name,metadata) values
('qarar-evidence','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000051.png','{"size":100,"mimetype":"image/png"}'),
('qarar-evidence','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000052.png','{"size":100,"mimetype":"image/png"}');
set local role qarar_api_executor;
select is(api_v2.register_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000051','proof.png','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000051.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=89000000-0000-0000-0000-000000000050&fileId=89000000-0000-0000-0000-000000000051',null)->>'ok','true','first real storage object registered');
select is(api_v2.register_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000052','proof2.png','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000052.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=89000000-0000-0000-0000-000000000050&fileId=89000000-0000-0000-0000-000000000052',null)->>'ok','true','second real storage object registered');
select is(api_v2.register_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000052','proof2.png','topic-preparations/89000000-0000-0000-0000-000000000050/89000000-0000-0000-0000-000000000052.png','image/png',100,'https://example.test/api/admin/typed-topics/files?submissionId=89000000-0000-0000-0000-000000000050&fileId=89000000-0000-0000-0000-000000000052',null)#>>'{data,idempotent_replay}','true','upload retry does not duplicate');
set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.get_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000051')->>'error_code','MODEL_PERMISSION_DENIED','another user cannot read unsubmitted files');
select is(api_v2.submit_typed_submission_v2('89000000-0000-0000-0000-000000000050')->>'error_code','MODEL_PERMISSION_DENIED','another user cannot submit preparation');
set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000002","role":"authenticated"}';
create temporary table submitted as select api_v2.submit_typed_submission_v2('89000000-0000-0000-0000-000000000050') payload;
select is((select payload->>'ok' from submitted),'true','final submission with verified files is atomic');
reset role;
select is((select count(*)::integer from qarar_topics.topics where organization_id='89000000-0000-0000-0000-000000000001'),1,'only final submission creates topic');
select is((select count(*)::integer from qarar_topics.topic_attachments where organization_id='89000000-0000-0000-0000-000000000001'),2,'files linked before topic visible');
set local role qarar_api_executor;
select is(api_v2.submit_typed_submission_v2('89000000-0000-0000-0000-000000000050')#>>'{data,idempotent_replay}','true','unknown final response replays safely');
select is(api_v2.prepare_typed_submission_v2('89000000-0000-0000-0000-000000000050','{"title":"عنوان مختلف للاختبار","description":"وصف اختبار المرفقات قبل التقديم","versionId":"89000000-0000-0000-0000-000000000022","unitId":"89000000-0000-0000-0000-000000000011","evidence":[]}')->>'error_code','MODEL_VERSION_CONFLICT','immutable input conflicts');
select is(api_v2.get_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000051')->>'ok','true','submitted file remains accessible to owner');
reset role;
select is(qarar_topics.get_topic_requirements_status((select (payload#>>'{data,topic_id}')::uuid from submitted))->>'ready_for_review','true','next review stage sees fulfilled requirements');
set local role qarar_api_executor;
set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.get_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000051')->>'ok','true','authorized reviewer can download submitted files');
select is(api_v2.get_typed_submission_file_v2('89000000-0000-0000-0000-000000000050','89000000-0000-0000-0000-000000000099')->>'ok','false','unknown file denied');
reset role;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id) values('89000000-0000-0000-0000-000000000060','89000000-0000-0000-0000-000000000001','MTG-TEST-89','89000000-0000-0000-0000-000000000011','اجتماع مناقشة الموضوع المصنف',current_date,'89000000-0000-0000-0000-000000000002');
select is(api_v1.search_eligible_agenda_topics('89000000-0000-0000-0000-000000000060')->>'total','1','submitted typed topic visible in agenda search without prior approval');
select is(api_v1.get_meeting_detail('89000000-0000-0000-0000-000000000060')#>>'{submitted_suggestions,total}','1','meeting detail automatically exposes submitted proposals');
select is((select count(*)::integer from qarar_meetings.agenda_items where meeting_id='89000000-0000-0000-0000-000000000060'),0,'reading proposals does not insert or approve agenda items');
select throws_ok(format('select api_v1.act_topic_workflow_step(%L,''approved'',null,gen_random_uuid(),1)',(select payload#>>'{data,topic_id}' from submitted)),'55000','تُتخذ قرارات الموضوع المصنف داخل الاجتماع، وليس من صفحة الموضوع','public workflow command cannot approve a classified council review');
create temporary table saved_files as select * from qarar_topics.topic_attachments where organization_id='89000000-0000-0000-0000-000000000001';
delete from qarar_topics.topic_attachments where organization_id='89000000-0000-0000-0000-000000000001';
select is(api_v1.search_eligible_agenda_topics('89000000-0000-0000-0000-000000000060')->>'total','0','incomplete old or damaged typed topic is not suggested');
select throws_ok(format('select api_v1.add_agenda_item(%L,%L,false,null)','89000000-0000-0000-0000-000000000060',(select payload#>>'{data,topic_id}' from submitted)),'23514',null,'missing required files cannot be manually admitted');
insert into qarar_topics.topic_attachments select * from saved_files;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id) values('89000000-0000-0000-0000-000000000061','89000000-0000-0000-0000-000000000001','MTG-TEST-89-OTHER','89000000-0000-0000-0000-000000000012','اجتماع مجلس آخر',current_date,'89000000-0000-0000-0000-000000000002');
select is(api_v1.get_meeting_detail('89000000-0000-0000-0000-000000000061')#>>'{submitted_suggestions,total}','0','other council does not receive the first council proposal');
set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(format('select api_v1.get_topic_detail(%L)',(select payload#>>'{data,topic_id}' from submitted)),'42501',null,'unrelated user cannot read frozen authority data');
select throws_ok('select api_v1.search_eligible_agenda_topics(''89000000-0000-0000-0000-000000000060'')','42501',null,'submitter without agenda context cannot list proposals');
set local "request.jwt.claims"='{"sub":"89000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok(format('select api_v1.add_agenda_item(%L,%L,false,null)','89000000-0000-0000-0000-000000000060',(select payload#>>'{data,topic_id}' from submitted)),'add prepared typed topic to agenda without outside-meeting decision');
select is((select count(*)::integer from qarar_meetings.agenda_items where meeting_id='89000000-0000-0000-0000-000000000060'),1,'meeting agenda receives the submitted topic');
select is(jsonb_array_length(api_v1.list_meeting_topic_attachments('89000000-0000-0000-0000-000000000060')),2,'meeting discussion receives pre-submission files');
select is(api_v1.get_meeting_detail('89000000-0000-0000-0000-000000000060')#>>'{submitted_suggestions,total}','0','inserted topic no longer offered as a duplicate proposal');
select is((select status from qarar_topics.topics where organization_id='89000000-0000-0000-0000-000000000001'),'new','reading and insertion do not approve the topic');
select * from finish();
rollback;
