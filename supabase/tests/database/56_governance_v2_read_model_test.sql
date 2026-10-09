begin;
create extension if not exists pgtap;
select plan(29);

insert into qarar_core.organizations(id,code,name_ar)
values('56000000-0000-0000-0000-000000000001','governance-v2-read-ci','منظمة اختبار قراءة الحوكمة');
insert into auth.users(id,email) values
('56000000-0000-0000-0000-000000000002','governance-v2-read@example.test'),
('56000000-0000-0000-0000-000000000003','governance-v2-read-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('56000000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000001','governance-v2-read@example.test','قارئ نموذج الحوكمة',true),
('56000000-0000-0000-0000-000000000003','56000000-0000-0000-0000-000000000001','governance-v2-read-reviewer@example.test','مراجع نموذج الحوكمة',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level)
values('56000000-0000-0000-0000-000000000010','56000000-0000-0000-0000-000000000001','department','مجلس القسم','department');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type)
values('56000000-0000-0000-0000-000000000013','56000000-0000-0000-0000-000000000001','department','قسم',true);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,governance_class_id) values
('56000000-0000-0000-0000-000000000011','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000013','ai_dept','قسم الذكاء الاصطناعي','active','56000000-0000-0000-0000-000000000010'),
('56000000-0000-0000-0000-000000000012','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000013','cs_dept','قسم علوم الحاسوب','active','56000000-0000-0000-0000-000000000010');

set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.topic_classifications_v2(id,organization_id,code,name_ar,status,activation_allowed,effective_from,created_by_user_id)
values('56000000-0000-0000-0000-000000000020','56000000-0000-0000-0000-000000000001','academic','أكاديمي','effective',true,current_date,'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_types_v2(id,organization_id,code,name_ar,created_by_user_id)
values('56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000001','academic.program','اعتماد برنامج أكاديمي','56000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_versions_v2(
 id,organization_id,topic_type_id,classification_id,version_no,status,activation_allowed,is_governed,
 acceptance_finality,rejection_finality,effective_from,approved_by_user_id,approved_at,activated_by_user_id,activated_at,created_by_user_id
) values('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000001',
 '56000000-0000-0000-0000-000000000021','56000000-0000-0000-0000-000000000020',1,'effective',true,true,
 'advance','complete',current_date,'56000000-0000-0000-0000-000000000002',clock_timestamp(),
 '56000000-0000-0000-0000-000000000002',clock_timestamp(),'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('56000000-0000-0000-0000-000000000030','56000000-0000-0000-0000-000000000001','academic_program_read','مسار البرنامج الأكاديمي','56000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('56000000-0000-0000-0000-000000000031','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000030',1,'draft','pending',null,null,'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_unit_id,is_initial,is_terminal,allowed_outcomes
) values('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000031','department_review','مراجعة مجلس القسم',1,'review','review','56000000-0000-0000-0000-000000000011',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='56000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='56000000-0000-0000-0000-000000000031';
insert into qarar_governance.topic_type_workflow_bindings_v2(organization_id,topic_type_version_id,workflow_template_version_id,status,activation_allowed,valid_from,created_by_user_id)
values('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000031','effective',true,current_date,'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_schedule_policies_v2(organization_id,topic_type_version_id,status,activation_allowed,rule_type,effective_from,created_by_user_id)
values('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000022','effective',true,'none',current_date,'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.legal_authorities_v2(organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('56000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','يختص مجلس القسم بمراجعة البرامج الأكاديمية.','jurisdiction',repeat('d',64),'approved',true,'56000000-0000-0000-0000-000000000002',clock_timestamp(),'56000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000022',id,'jurisdiction','56000000-0000-0000-0000-000000000002' from qarar_governance.legal_authorities_v2
where organization_id='56000000-0000-0000-0000-000000000001';
insert into qarar_governance.governance_bundles_v2(
 id,organization_id,topic_type_version_id,status,activation_allowed,lock_version,submitted_by_user_id,submitted_at,
 reviewed_by_user_id,reviewed_at,review_comment,activated_by_user_id,activated_at,effective_from,created_by_user_id
) values('56000000-0000-0000-0000-000000000040','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000022',
 'effective',true,5,'56000000-0000-0000-0000-000000000002',clock_timestamp(),'56000000-0000-0000-0000-000000000003',clock_timestamp(),
 'اعتماد اختباري','56000000-0000-0000-0000-000000000002',clock_timestamp(),current_date,'56000000-0000-0000-0000-000000000002');

create temporary table bundle_read as select qarar_governance.get_governance_bundle_v2('56000000-0000-0000-0000-000000000040') payload;
select is((select payload#>>'{bundle,status}' from bundle_read),'effective','bundle details return lifecycle state');
select is((select payload#>>'{topic_type,name_ar}' from bundle_read),'اعتماد برنامج أكاديمي','bundle details return topic type');
select is((select jsonb_array_length(payload->'authorities') from bundle_read),1,'bundle details return legal evidence');

create temporary table available as select qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000011',current_date) payload;
select is((select jsonb_array_length(payload) from available),1,'eligible origin sees effective topic type');
select is((select payload->0->>'topic_type_code' from available),'academic.program','effective type identity is returned');
create temporary table unavailable as select qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000012',current_date) payload;
select is((select jsonb_array_length(payload) from unavailable),0,'unrelated origin cannot discover topic type');

create temporary table preview as select qarar_governance.preview_topic_route_v2(
 '56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000011',current_date) payload;
select is((select jsonb_array_length(payload->'steps') from preview),1,'preview returns route steps');
select is((select payload#>>'{steps,0,resolved_governance_unit_id}' from preview),'56000000-0000-0000-0000-000000000011','preview resolves contextual council');
select is((select jsonb_array_length(payload->'authorities') from preview),1,'preview returns approved authority');
select is((select payload#>>'{schedule,rule_type}' from preview),'none','preview returns scheduling rule');
select throws_ok(
 $$select qarar_governance.preview_topic_route_v2('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000012',current_date)$$,
 '42501','نوع الموضوع غير متاح لوحدة الإنشاء المحددة','route preview rejects unrelated origin'
);
-- A class-based first stage permits either department before explicit origin
-- restriction. The profile must narrow discovery AND direct preview.
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('56000000-0000-0000-0000-000000000033','56000000-0000-0000-0000-000000000001','class_based_read','مسار مستويات المجالس','56000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,created_by_user_id)
values('56000000-0000-0000-0000-000000000032','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000033',1,'draft','pending','56000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_steps(
 organization_id,workflow_template_version_id,step_code,name_ar,sequence_no,step_type,responsibility,governance_class_id,is_initial,is_terminal,allowed_outcomes
) values('56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000032','department_review','مراجعة مجلس القسم',1,'review','review','56000000-0000-0000-0000-000000000010',true,true,array['approved']::text[]);
update qarar_governance.workflow_template_versions set status='active',validation_status='valid',
 activated_by_user_id='56000000-0000-0000-0000-000000000002',activated_at=clock_timestamp()
where id='56000000-0000-0000-0000-000000000032';
update qarar_governance.topic_type_workflow_bindings_v2 set workflow_template_version_id='56000000-0000-0000-0000-000000000032'
where topic_type_version_id='56000000-0000-0000-0000-000000000022';
select is(jsonb_array_length(qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000012',current_date)),1,'legacy class-based route accepts another matching origin');
insert into qarar_governance.topic_type_authoring_profiles_v2 values('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000001','councils',2,'manual');
insert into qarar_governance.topic_type_origin_scopes_v2 values('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000011',null);
select is(jsonb_array_length(qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000012',current_date)),0,'explicit council restriction narrows otherwise matching route');
select is(jsonb_array_length(qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000011',current_date)),1,'selected council still discovers the classification');
select throws_ok($$select qarar_governance.preview_topic_route_v2('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000012',current_date)$$,'42501',null,'direct route preview cannot bypass origin scope');
update qarar_governance.topic_type_authoring_profiles_v2 set scope_kind='classes' where topic_type_version_id='56000000-0000-0000-0000-000000000022';
delete from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id='56000000-0000-0000-0000-000000000022';
insert into qarar_governance.topic_type_origin_scopes_v2 values('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000001',null,'56000000-0000-0000-0000-000000000010');
select is(jsonb_array_length(qarar_governance.list_effective_topic_types_v2('56000000-0000-0000-0000-000000000012',current_date)),1,'class scope allows matching council class');
select is(qarar_governance.preview_topic_route_v2('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000012',current_date)#>>'{authoring,required_attachment_count}','2','presenter preview carries attachment requirement');
update qarar_governance.topic_type_authoring_profiles_v2 set submission_mode='automatic_agenda',scope_kind='councils' where topic_type_version_id='56000000-0000-0000-0000-000000000022';
delete from qarar_governance.topic_type_origin_scopes_v2 where topic_type_version_id='56000000-0000-0000-0000-000000000022';
insert into qarar_governance.topic_type_origin_scopes_v2 values('56000000-0000-0000-0000-000000000022','56000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000011',null);
update qarar_governance.topic_schedule_policies_v2 set rule_type='monthly_week',rule_config='{"week":1,"starts_on":"2026-01-01","ends_on":"2026-12-31"}' where topic_type_version_id='56000000-0000-0000-0000-000000000022';
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04')),1,'scheduled effective type is automatically proposed inside its window');
select is(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04')->0->>'required_attachment_count','2','proposal carries attachment requirement');
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-12')),0,'outside weekly window there is no proposal');
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000012','2026-11-04')),0,'another council cannot receive restricted proposal');
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2027-11-04')),0,'expired recurrence creates no proposal');
select is(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04'),qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04'),'refresh returns stable nonduplicated suggestions');
reset role;
insert into qarar_meetings.meetings(id,organization_id,meeting_no,governance_unit_id,title_ar,scheduled_date,created_by_user_id)
values('56000000-0000-0000-0000-000000000050','56000000-0000-0000-0000-000000000001','MTG-READ-CI','56000000-0000-0000-0000-000000000011','تحضير جدول الأعمال','2026-11-04','56000000-0000-0000-0000-000000000002');
select is(jsonb_array_length(api_v1.get_meeting_detail('56000000-0000-0000-0000-000000000050')->'scheduled_suggestions'),1,'existing meeting detail exposes scheduled proposals');
select is(jsonb_array_length(api_v1.get_meeting_detail('56000000-0000-0000-0000-000000000050')->'agenda_items'),0,'suggestions do not silently become approved agenda items');
set local role qarar_governance_executor;
update qarar_governance.topic_type_authoring_profiles_v2 set submission_mode='manual' where topic_type_version_id='56000000-0000-0000-0000-000000000022';
select is(jsonb_array_length(qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04')),0,'scheduled manual type is not automatically proposed');
reset role;
update qarar_iam.users set is_system_admin=false where id='56000000-0000-0000-0000-000000000003';
set local "request.jwt.claims"='{"sub":"56000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select qarar_governance.scheduled_agenda_suggestions_v2('56000000-0000-0000-0000-000000000011','2026-11-04')$$,'42501',null,'non agenda manager cannot discover automatic proposals');
select throws_ok($$select api_v1.get_meeting_detail('56000000-0000-0000-0000-000000000050')$$,'42501',null,'existing meeting detail still denies unrelated reader');
reset role;
select ok(not has_function_privilege('authenticated','qarar_governance.preview_topic_route_v2(uuid,uuid,date)','execute'),'read model remains internal');
select * from finish();
rollback;
