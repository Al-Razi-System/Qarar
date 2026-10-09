begin;
create extension if not exists pgtap;
select plan(17);
insert into qarar_core.organizations(id,code,name_ar) values('80000000-0000-0000-0000-000000000001','type-direct-ci','اختبار دورة التصنيف');
insert into auth.users(id,email) values
('80000000-0000-0000-0000-000000000002','type-author@example.test'),('80000000-0000-0000-0000-000000000003','type-reviewer@example.test'),('80000000-0000-0000-0000-000000000004','type-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
select id,'80000000-0000-0000-0000-000000000001',email,'مستخدم الاختبار',id<>'80000000-0000-0000-0000-000000000004'::uuid from auth.users where id in ('80000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000004');
set local "request.jwt.claims"='{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('80000000-0000-0000-0000-000000000020','80000000-0000-0000-0000-000000000001','route','مسار الاختبار','80000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('80000000-0000-0000-0000-000000000021','80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000020',1,'active','valid','80000000-0000-0000-0000-000000000002',now(),'80000000-0000-0000-0000-000000000002');
create temporary table draft as select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),
'{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"name_ar":"اعتماد البرنامج"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"},"workflow":{"workflow_template_version_id":"80000000-0000-0000-0000-000000000021"},"schedule":{"rule_type":"none"}}') payload;
create temporary table ids as select id bid,topic_type_version_id vid from qarar_governance.governance_bundles_v2 where id=(select (payload->>'bundle_id')::uuid from draft);
grant select on ids to qarar_api_executor;
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{management,actions,submit}','false','missing legal source disables submission');
insert into qarar_governance.legal_authorities_v2(id,organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('80000000-0000-0000-0000-000000000030','80000000-0000-0000-0000-000000000001','لائحة الاختبار','يختص المجلس باعتماد البرامج الأكاديمية.','jurisdiction',repeat('a',64),'approved',true,'80000000-0000-0000-0000-000000000003',now(),'80000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '80000000-0000-0000-0000-000000000001',vid,'80000000-0000-0000-0000-000000000030','jurisdiction','80000000-0000-0000-0000-000000000002' from ids;
insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
select vid,'80000000-0000-0000-0000-000000000001','route',1 from ids;
select is(qarar_governance.save_governance_bundle_draft_v2((select bid from ids),1,gen_random_uuid(),
 '{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"name_ar":"اعتماد البرنامج"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"},"workflow":{"workflow_template_version_id":"80000000-0000-0000-0000-000000000021"},"schedule":{"rule_type":"none","rule_config":{}},"authoring":{"scope_kind":"route","scope_ids":[],"source_item_ids":[],"required_attachment_count":2,"submission_mode":"manual"}}')#>>'{authoring,required_attachment_count}','2','saving changes attachments from one to two');
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{authoring,required_attachment_count}','2','reopening reads the persisted count');
delete from qarar_governance.topic_type_authorities_v2 where topic_type_version_id=(select vid from ids);
select throws_ok('select qarar_governance.manage_topic_type_v2((select bid from ids),''activate'',2,gen_random_uuid(),null)','23514','أكمل متطلبات التصنيف قبل تنشيطه','direct publication cannot bypass the missing legal source');
select is((select status from qarar_governance.governance_bundles_v2 where id=(select bid from ids)),'draft','failed activation leaves the draft unchanged');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '80000000-0000-0000-0000-000000000001',vid,'80000000-0000-0000-0000-000000000030','jurisdiction','80000000-0000-0000-0000-000000000002' from ids;
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{management,actions,submit}','false','approval submission is absent');
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{management,actions,activate}','true','author can activate valid draft');
select is(qarar_governance.manage_topic_type_v2((select bid from ids),'activate',2,'80000000-0000-0000-0000-000000000042',null)->>'status','effective','author publishes without another account');
select is((select reviewed_by_user_id from qarar_governance.governance_bundles_v2 where id=(select bid from ids)),null::uuid,'no fabricated independent reviewer');
select is((select publication_mode from qarar_governance.topic_type_versions_v2 where id=(select vid from ids)),'direct','explicit direct evidence');
select is(qarar_governance.manage_topic_type_v2((select bid from ids),'activate',2,'80000000-0000-0000-0000-000000000042',null)->>'idempotent_replay','true','direct activation safely replays');
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{authoring,required_attachment_count}','2','publication preserves the required attachment count');
create temporary table replacement as select qarar_governance.manage_topic_type_v2((select bid from ids),'begin_edit',3,gen_random_uuid(),null) payload;
select is(qarar_governance.manage_topic_type_v2((select (payload->>'bundle_id')::uuid from replacement),'activate',1,gen_random_uuid(),null)->>'status','effective','same author directly activates a replacement');
select is((select status from qarar_governance.topic_type_versions_v2 where id=(select vid from ids)),'retired','replacement retires the previous version atomically');
select is((select count(*)::integer from qarar_governance.topic_type_versions_v2 where organization_id='80000000-0000-0000-0000-000000000001' and status='effective'),1,'one published version remains');
set local role qarar_api_executor;
select is(api_v2.manage_topic_type_v2((select bid from ids),'disable',1,gen_random_uuid(),null)->>'error_code','MODEL_VERSION_CONFLICT','stale disable fails');
set local "request.jwt.claims"='{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.manage_topic_type_v2((select bid from ids),'activate',2,gen_random_uuid(),null)->>'error_code','MODEL_PERMISSION_DENIED','unprivileged actor cannot publish');
select * from finish();
rollback;

