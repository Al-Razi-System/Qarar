begin;
create extension if not exists pgtap;
select plan(8);

insert into qarar_core.organizations(id,code,name_ar)
values('57000000-0000-0000-0000-000000000001','periodic-versions-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('57000000-0000-0000-0000-000000000002','periodic-versions@example.test'),
('57000000-0000-0000-0000-000000000003','periodic-versions-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('57000000-0000-0000-0000-000000000002','57000000-0000-0000-0000-000000000001','periodic-versions@example.test','قارئ نموذج الحوكمة',true),
('57000000-0000-0000-0000-000000000003','57000000-0000-0000-0000-000000000001','periodic-versions-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('57000000-0000-0000-0000-000000000010','57000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('57000000-0000-0000-0000-000000000013','57000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('57000000-0000-0000-0000-000000000011','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','57000000-0000-0000-0000-000000000010'),
('57000000-0000-0000-0000-000000000012','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','57000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('57000000-0000-0000-0000-000000000020','57000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('57000000-0000-0000-0000-000000000021','57000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('57000000-0000-0000-0000-000000000022','57000000-0000-0000-0000-000000000001',
 '57000000-0000-0000-0000-000000000021','57000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'57000000-0000-0000-0000-000000000002',clock_timestamp(),
 '57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('57000000-0000-0000-0000-000000000030','57000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','57000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('57000000-0000-0000-0000-000000000031','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','57000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='57000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='57000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000022','57000000-0000-0000-0000-000000000031','effective',true,current_date,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('57000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000022',id,'jurisdiction','57000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='57000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('57000000-0000-0000-0000-000000000040','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000022',
 'effective',true,5,'57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','57000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'57000000-0000-0000-0000-000000000002');


-- Version 1 owes a monthly periodic topic to its council.
insert into qarar_governance.topic_type_authoring_profiles_v2 values('57000000-0000-0000-0000-000000000022','57000000-0000-0000-0000-000000000001','route',0,'automatic_agenda');
update qarar_governance.topic_schedule_policies_v2 set rule_type='monthly_week',
  rule_config='{"week":1,"starts_on":"2026-01-01","ends_on":"2030-12-31"}' where topic_type_version_id='57000000-0000-0000-0000-000000000022';
create temporary table owed as select count(*)::int n from qarar_governance.topic_schedule_occurrences_v2 where governance_unit_id='57000000-0000-0000-0000-000000000011';
create temporary table proposed as select qarar_governance.scheduled_agenda_suggestions_v2('57000000-0000-0000-0000-000000000011',current_date+120) payload;
select cmp_ok((select n from owed),'>',1,'version 1 owes several periods to the council');
select is((select jsonb_array_length(payload) from proposed),(select count(*)::int from qarar_governance.topic_schedule_occurrences_v2 where governance_unit_id='57000000-0000-0000-0000-000000000011' and available_from<=current_date+120),'every period that has begun is proposed');

-- Version 2 takes effect and version 1 retires.
update qarar_governance.topic_type_versions_v2 set status='retired' where id='57000000-0000-0000-0000-000000000022';
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('57000000-0000-0000-0000-000000000023','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000021','57000000-0000-0000-0000-000000000020',2,'effective',true,true,'advance','complete',current_date,'57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000023','57000000-0000-0000-0000-000000000031','effective',true,current_date,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000023',id,'jurisdiction','57000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2 where organization_id='57000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('57000000-0000-0000-0000-000000000041','57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000023','effective',true,5,'57000000-0000-0000-0000-000000000002',clock_timestamp(),'57000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','57000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'57000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authoring_profiles_v2 values('57000000-0000-0000-0000-000000000023','57000000-0000-0000-0000-000000000001','route',0,'automatic_agenda');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,rule_config,effective_from,created_by_user_id)
values('57000000-0000-0000-0000-000000000001','57000000-0000-0000-0000-000000000023','effective',true,'monthly_week','{"week":1,"starts_on":"2026-01-01","ends_on":"2030-12-31"}',current_date,'57000000-0000-0000-0000-000000000002');

select is((select count(*)::int from qarar_governance.topic_schedule_occurrences_v2 where governance_unit_id='57000000-0000-0000-0000-000000000011'),(select n from owed),'the new version does not repeat a period that is already owed');
select is((select count(*)::int from qarar_governance.topic_schedule_occurrences_v2 where governance_unit_id='57000000-0000-0000-0000-000000000011' and topic_type_id='57000000-0000-0000-0000-000000000021'),(select n from owed),'every obligation belongs to the classification');
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('57000000-0000-0000-0000-000000000011',current_date+120)),(select jsonb_array_length(payload) from proposed),'the obligations of the retired version are still proposed');
select is(qarar_governance.scheduled_agenda_suggestions_v2('57000000-0000-0000-0000-000000000011',current_date+120)->0->>'topic_type_version_id','57000000-0000-0000-0000-000000000023','and are completed with the version now in effect');

-- Discussing a topic of the new version settles the oldest obligation owed by the old one.
reset role;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id)
values('57000000-0000-0000-0000-000000000050','57000000-0000-0000-0000-000000000001','MTG-VER-CI','57000000-0000-0000-0000-000000000011','اجتماع دورة قديمة',current_date+120,'57000000-0000-0000-0000-000000000002');
create temporary table version_topic as select (qarar_topics.create_topic_from_type_v2('موضوع بنسخة جديدة','وصف موضوع بنسخة جديدة كامل','57000000-0000-0000-0000-000000000023','57000000-0000-0000-0000-000000000011',gen_random_uuid())->>'topic_id')::uuid id;
create temporary table version_item as select (api_v1.add_agenda_item('57000000-0000-0000-0000-000000000050',(select id from version_topic),false,null)->>'id')::uuid id;
select is((select schedule_policy_id from qarar_governance.topic_schedule_occurrences_v2 where agenda_item_id=(select id from version_item)),
  (select p.id from qarar_governance.topic_schedule_policies_v2 p where p.topic_type_version_id='57000000-0000-0000-0000-000000000022'),
  'it settles the obligation the retired version created');
select is((select status from qarar_governance.topic_schedule_occurrences_v2 where agenda_item_id=(select id from version_item)),'scheduled','and the obligation is now scheduled');

select * from finish();
rollback;
