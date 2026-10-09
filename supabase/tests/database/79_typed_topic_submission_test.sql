begin;
create extension if not exists pgtap;
select plan(32);

insert into qarar_core.organizations(id,code,name_ar)
values('79000000-0000-0000-0000-000000000001','typed-submission-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('79000000-0000-0000-0000-000000000002','typed-submission@example.test'),
('79000000-0000-0000-0000-000000000003','typed-submission-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('79000000-0000-0000-0000-000000000002','79000000-0000-0000-0000-000000000001','typed-submission@example.test','قارئ نموذج الحوكمة',true),
('79000000-0000-0000-0000-000000000003','79000000-0000-0000-0000-000000000001','typed-submission-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into auth.users(id,email) values('79000000-0000-0000-0000-000000000004','typed-scoped-submitter@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values('79000000-0000-0000-0000-000000000004','79000000-0000-0000-0000-000000000001','typed-scoped-submitter@example.test','مقدم موضوع بلا عضوية',false);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('79000000-0000-0000-0000-000000000010','79000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('79000000-0000-0000-0000-000000000013','79000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('79000000-0000-0000-0000-000000000011','79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','79000000-0000-0000-0000-000000000010'),
('79000000-0000-0000-0000-000000000012','79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','79000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('79000000-0000-0000-0000-000000000020','79000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('79000000-0000-0000-0000-000000000021','79000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','79000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000001',
 '79000000-0000-0000-0000-000000000021','79000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'79000000-0000-0000-0000-000000000002',clock_timestamp(),
 '79000000-0000-0000-0000-000000000002',clock_timestamp(),'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('79000000-0000-0000-0000-000000000030','79000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','79000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('79000000-0000-0000-0000-000000000031','79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','79000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='79000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='79000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000031','effective',true,current_date,'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('79000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'79000000-0000-0000-0000-000000000002',clock_timestamp(),'79000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000022',id,'jurisdiction','79000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='79000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('79000000-0000-0000-0000-000000000040','79000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000022',
 'effective',true,5,'79000000-0000-0000-0000-000000000002',clock_timestamp(),'79000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','79000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'79000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('79000000-0000-0000-0000-000000000040') payload;

insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
values('79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000001','route',2);
set local role qarar_api_executor;
select lives_ok($$select api_v2.save_user_submission_scope_v2('79000000-0000-0000-0000-000000000004',0,null,'[{"kind":"council","target_id":"79000000-0000-0000-0000-000000000011","include_descendants":false}]',gen_random_uuid())$$,'assign real non-admin scoped submitter');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(jsonb_array_length(api_v2.list_effective_topic_types_v2('79000000-0000-0000-0000-000000000011') ->'data'),1,'ordinary submitter sees classification for allowed council');
select is(api_v2.list_effective_topic_types_v2('79000000-0000-0000-0000-000000000012')->>'error_code','MODEL_PERMISSION_DENIED','ordinary submitter cannot enumerate classifications outside scope');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select api_v2.set_user_submission_enabled_v2('79000000-0000-0000-0000-000000000004',1,false,gen_random_uuid())$$,'disable before submission');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.prepare_typed_topic_v2('79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011')->>'error_code','MODEL_PERMISSION_DENIED','disabled submitter cannot prepare classified topic');
reset role;
select is(jsonb_array_length(qarar_topics.get_topic_form_options()->'governance_units'),0,'disabled scoped submitter has no selectable councils');
set local role qarar_api_executor;
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select api_v2.set_user_submission_enabled_v2('79000000-0000-0000-0000-000000000004',2,true,gen_random_uuid())$$,'reenable before real submission');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.prepare_typed_topic_v2('79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011')->>'ok','true','published scoped type can prepare');
create temporary table created as select api_v2.create_topic_from_type_v2('عنوان الموضوع التجريبي','وصف الموضوع التجريبي الكامل','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011','79000000-0000-0000-0000-000000000050') payload;
grant select on created to qarar_topics_executor,qarar_governance_executor;
select is((select payload->>'ok' from created),'true','typed submission succeeds');
select is(api_v2.create_topic_from_type_v2('عنوان الموضوع التجريبي','وصف الموضوع التجريبي الكامل','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011','79000000-0000-0000-0000-000000000050')#>>'{data,idempotent_replay}','true','submission replays once');
select is(api_v2.create_topic_from_type_v2('عنوان موضوع آخر','وصف الموضوع التجريبي الكامل','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011','79000000-0000-0000-0000-000000000050')->>'error_code','MODEL_VERSION_CONFLICT','request reuse with different input conflicts');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_topics_executor;
select is((select topic_type_version_id from qarar_topics.topics where id=(select (payload#>>'{data,topic_id}')::uuid from created)),'79000000-0000-0000-0000-000000000022'::uuid,'topic binds to immutable version');
select is(qarar_topics.get_topic_requirements_status((select (payload#>>'{data,topic_id}')::uuid from created))->>'ready_for_review','false','attachments required before review');
select throws_ok($$update qarar_topics.topics set topic_type_version_id=null,typed_creation_request=null where id=(select (payload#>>'{data,topic_id}')::uuid from created)$$,'23514','لا يمكن تغيير تصنيف موضوع سابق أو لقطة إنشائه','cannot unbind existing topic');
set local role qarar_governance_executor;
select is((select count(*)::integer from qarar_governance.workflow_instances where topic_id=(select (payload#>>'{data,topic_id}')::uuid from created)),1,'one executable instance');
select is(qarar_governance.list_governance_topic_types_v2()#>>'{items,0,submitted_topic_count}','1','list counts explicitly submitted topic');
select is(qarar_governance.get_governance_bundle_v2('79000000-0000-0000-0000-000000000040')->>'submitted_topic_count','1','detail counts submitted topic');
set local role qarar_api_executor;
select is(api_v2.manage_topic_type_v2('79000000-0000-0000-0000-000000000040','disable',5,gen_random_uuid(),null)#>>'{data,is_enabled}','false','disable gates future submission');
select is(api_v2.create_topic_from_type_v2('عنوان موضوع جديد','وصف الموضوع التجريبي الكامل','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011',gen_random_uuid())->>'ok','false','disabled type rejects new topics');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.create_topic_from_type_v2('عنوان الموضوع التجريبي','وصف الموضوع التجريبي الكامل','79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011','79000000-0000-0000-0000-000000000050')#>>'{data,idempotent_replay}','true','disabled type still replays completed request');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_topics_executor;
select is((select count(*)::integer from qarar_topics.topics where organization_id='79000000-0000-0000-0000-000000000001'),1,'disable does not delete or duplicate existing topic');
select throws_ok($$select qarar_topics.assert_topic_requirements_ready((select (payload#>>'{data,topic_id}')::uuid from created),'before_review')$$,'23514','لا يمكن متابعة الإجراء قبل استكمال المتطلبات الإلزامية: مرفقات التصنيف: 0 من 2','adjacent review refuses missing evidence');
insert into qarar_topics.topic_attachments(organization_id,topic_id,file_name,file_url,mime_type,file_size_bytes,uploaded_by_user_id)
select '79000000-0000-0000-0000-000000000001',(payload#>>'{data,topic_id}')::uuid,'evidence-'||n,'https://example.test/evidence-'||n,'application/pdf',100,'79000000-0000-0000-0000-000000000002' from created cross join generate_series(1,2) n;
select is(qarar_topics.get_topic_requirements_status((select (payload#>>'{data,topic_id}')::uuid from created))->>'ready_for_review','true','uploaded evidence completes next-stage requirements');
set local role qarar_api_executor;
create temporary table replacement as select api_v2.manage_topic_type_v2('79000000-0000-0000-0000-000000000040','begin_edit',6,gen_random_uuid(),null) payload;
grant select on replacement to qarar_governance_executor;
select is((select payload#>>'{data,status}' from replacement),'draft','published disabled type can be edited without changing old topics');
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from replacement),'submit',1,gen_random_uuid(),null)#>>'{data,status}','under_review','replacement submitted');
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from replacement),'approve',2,gen_random_uuid(),'مراجعة مستقلة')#>>'{data,status}','approved','replacement approved by another actor');
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from replacement),'activate',3,gen_random_uuid(),null)#>>'{data,status}','effective','replacement publishes');
set local role qarar_governance_executor;
select is(qarar_governance.list_governance_topic_types_v2()#>>'{items,0,submitted_topic_count}','1','count spans historical versions of one identity');
select is(qarar_governance.get_governance_bundle_v2((select (payload#>>'{data,bundle_id}')::uuid from replacement))#>>'{management,is_enabled}','false','replacement does not silently reenable disabled type');
select is((select status from qarar_governance.workflow_instances where topic_id=(select (payload#>>'{data,topic_id}')::uuid from created)),'active','replacement leaves existing execution active');
set local role qarar_topics_executor;
select is((select topic_type_version_id from qarar_topics.topics where id=(select (payload#>>'{data,topic_id}')::uuid from created)),'79000000-0000-0000-0000-000000000022'::uuid,'replacement never rebinds old topic');
set local role qarar_api_executor;
set local "request.jwt.claims"='{"sub":"79000000-0000-0000-0000-000000000099","role":"authenticated"}';
select is(api_v2.prepare_typed_topic_v2('79000000-0000-0000-0000-000000000022','79000000-0000-0000-0000-000000000011')->>'error_code','MODEL_PERMISSION_DENIED','unregistered actor cannot submit a classified topic');
select * from finish();
rollback;

