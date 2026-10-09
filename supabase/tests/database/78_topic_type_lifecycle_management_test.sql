begin;
create extension if not exists pgtap;
select plan(24);
insert into qarar_core.organizations(id,code,name_ar) values('78000000-0000-0000-0000-000000000001','type-lifecycle-ci','اختبار دورة التصنيف');
insert into auth.users(id,email) values
('78000000-0000-0000-0000-000000000002','type-author@example.test'),('78000000-0000-0000-0000-000000000003','type-reviewer@example.test'),('78000000-0000-0000-0000-000000000004','type-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
select id,'78000000-0000-0000-0000-000000000001',email,'مستخدم الاختبار',id<>'78000000-0000-0000-0000-000000000004'::uuid from auth.users where id in ('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000003','78000000-0000-0000-0000-000000000004');
set local "request.jwt.claims"='{"sub":"78000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('78000000-0000-0000-0000-000000000020','78000000-0000-0000-0000-000000000001','route','مسار الاختبار','78000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('78000000-0000-0000-0000-000000000021','78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000020',1,'active','valid','78000000-0000-0000-0000-000000000002',now(),'78000000-0000-0000-0000-000000000002');
create temporary table draft as select qarar_governance.save_governance_bundle_draft_v2(null,null,gen_random_uuid(),
'{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"name_ar":"اعتماد البرنامج"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"},"workflow":{"workflow_template_version_id":"78000000-0000-0000-0000-000000000021"},"schedule":{"rule_type":"none"}}') payload;
create temporary table ids as select id bid,topic_type_version_id vid from qarar_governance.governance_bundles_v2 where id=(select (payload->>'bundle_id')::uuid from draft);
grant select on ids to qarar_api_executor;
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{management,actions,submit}','false','missing legal source disables submission');
insert into qarar_governance.legal_authorities_v2(id,organization_id,source_document_name,authority_text,authority_kind,source_fingerprint,review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id)
values('78000000-0000-0000-0000-000000000030','78000000-0000-0000-0000-000000000001','لائحة الاختبار','يختص المجلس باعتماد البرامج الأكاديمية.','jurisdiction',repeat('a',64),'approved',true,'78000000-0000-0000-0000-000000000003',now(),'78000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_authorities_v2(organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id)
select '78000000-0000-0000-0000-000000000001',vid,'78000000-0000-0000-0000-000000000030','jurisdiction','78000000-0000-0000-0000-000000000002' from ids;
insert into qarar_governance.topic_type_authoring_profiles_v2(topic_type_version_id,organization_id,scope_kind,required_attachment_count)
select vid,'78000000-0000-0000-0000-000000000001','route',2 from ids;
select is(qarar_governance.get_governance_bundle_v2((select bid from ids))#>>'{management,actions,submit}','false','new management UI does not require approval submission');
select is(qarar_governance.manage_topic_type_v2((select bid from ids),'submit',1,'78000000-0000-0000-0000-000000000041',null)->>'status','under_review','submission uses audited transition');
set local role qarar_api_executor;
select is(api_v2.manage_topic_type_v2((select bid from ids),'approve',2,gen_random_uuid(),'تمت المراجعة')->>'error_code','MODEL_REVIEW_SEPARATION_REQUIRED','author cannot self approve');
set local "request.jwt.claims"='{"sub":"78000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(api_v2.manage_topic_type_v2((select bid from ids),'approve',2,gen_random_uuid(),'تمت المراجعة')#>>'{data,status}','approved','independent approval');
select is(api_v2.manage_topic_type_v2((select bid from ids),'activate',3,'78000000-0000-0000-0000-000000000042',null)#>>'{data,status}','effective','approved type activates');
select is(api_v2.manage_topic_type_v2((select bid from ids),'activate',3,'78000000-0000-0000-0000-000000000042',null)#>>'{data,idempotent_replay}','true','activation safely replays');
select is(api_v2.manage_topic_type_v2((select bid from ids),'disable',3,gen_random_uuid(),null)->>'error_code','MODEL_VERSION_CONFLICT','stale disable rejected');
select is(api_v2.manage_topic_type_v2((select bid from ids),'disable',4,gen_random_uuid(),null)#>>'{data,is_enabled}','false','disable gates new availability');
select is(api_v2.get_governance_bundle_v2((select bid from ids))#>>'{data,version,status}','effective','disable preserves published version');
select is(api_v2.manage_topic_type_v2((select bid from ids),'enable',5,gen_random_uuid(),null)#>>'{data,is_enabled}','true','reenable availability');
create temporary table edit as select api_v2.manage_topic_type_v2((select bid from ids),'begin_edit',6,'78000000-0000-0000-0000-000000000043',null) payload;
grant select on edit to qarar_governance_executor;
select is((select payload#>>'{data,status}' from edit),'draft','published edit creates a new draft');
select isnt((select (payload#>>'{data,bundle_id}')::uuid from edit),(select bid from ids),'published aggregate identity not reused');
set local role qarar_governance_executor;
select is((select count(*)::integer from qarar_governance.topic_types_v2 where organization_id='78000000-0000-0000-0000-000000000001'),1,'stable type identity is not duplicated');
select is((select status from qarar_governance.topic_type_versions_v2 where id=(select vid from ids)),'effective','old version remains effective while editing');
select is(qarar_governance.get_governance_bundle_v2((select (payload#>>'{data,bundle_id}')::uuid from edit))#>>'{authoring,required_attachment_count}','2','draft inherits requirements');
set local role qarar_api_executor;
select is(api_v2.manage_topic_type_v2((select bid from ids),'begin_edit',6,'78000000-0000-0000-0000-000000000043',null)#>>'{data,idempotent_replay}','true','clone safely replays');
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from edit),'submit',1,gen_random_uuid(),null)#>>'{data,status}','under_review','replacement draft can submit');
set local "request.jwt.claims"='{"sub":"78000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from edit),'approve',2,gen_random_uuid(),'اعتماد التعديل')#>>'{data,status}','approved','replacement receives independent approval');
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from edit),'activate',3,gen_random_uuid(),null)#>>'{data,status}','effective','replacement activates atomically');
set local role qarar_governance_executor;
select is((select count(*)::integer from qarar_governance.topic_type_versions_v2 where organization_id='78000000-0000-0000-0000-000000000001' and status='effective'),1,'exactly one replacement remains effective');
set local role qarar_api_executor;
select is(api_v2.manage_topic_type_v2((select bid from ids),'disable',8,gen_random_uuid(),null)#>>'{data,is_enabled}','false','availability update may target the historical bundle');
select is(api_v2.manage_topic_type_v2((select (payload#>>'{data,bundle_id}')::uuid from edit),'enable',4,gen_random_uuid(),null)->>'error_code','MODEL_VERSION_CONFLICT','old availability command from another version cannot override new disable');
set local "request.jwt.claims"='{"sub":"78000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(api_v2.manage_topic_type_v2((select bid from ids),'disable',7,gen_random_uuid(),null)->>'error_code','MODEL_PERMISSION_DENIED','unauthorized lifecycle rejected');
select * from finish();
rollback;
