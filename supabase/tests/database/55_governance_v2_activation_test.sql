begin;
create extension if not exists pgtap;
select plan(17);

insert into qarar_core.organizations(id,code,name_ar)
values('55000000-0000-0000-0000-000000000001','governance-v2-activate-ci','منظمة اختبار تفعيل الحوكمة');
insert into auth.users(id,email) values
('55000000-0000-0000-0000-000000000002','governance-v2-activation-author@example.test'),
('55000000-0000-0000-0000-000000000003','governance-v2-activation-reviewer@example.test'),
('55000000-0000-0000-0000-000000000004','governance-v2-activation-operator@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('55000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000001','governance-v2-activation-author@example.test','معد نموذج التفعيل',true),
('55000000-0000-0000-0000-000000000003','55000000-0000-0000-0000-000000000001','governance-v2-activation-reviewer@example.test','مراجع نموذج التفعيل',true),
('55000000-0000-0000-0000-000000000004','55000000-0000-0000-0000-000000000001','governance-v2-activation-operator@example.test','مسؤول تفعيل النموذج',true);

set local "request.jwt.claims"='{"sub":"55000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
create temporary table draft as select qarar_governance.save_governance_bundle_draft_v2(
 null,null,'55000000-0000-0000-0000-000000000010',
 '{"classification":{"code":"student","name_ar":"الشؤون الطلابية"},"topic_type":{"code":"student.results","name_ar":"اعتماد نتائج الطلاب"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"return_previous"}}'::jsonb
) payload;
select throws_ok(
 $$select qarar_governance.activate_governance_bundle_v2(
   (select (payload->>'bundle_id')::uuid from draft),1,current_date,'55000000-0000-0000-0000-000000000011')$$,
 '55000','الحزمة غير معتمدة ولا يمكن تفعيلها','draft bundle cannot be activated'
);

insert into qarar_governance.legal_authorities_v2(
 organization_id,source_document_name,article_number,authority_text,authority_kind,source_fingerprint,
 review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id
) values(
 '55000000-0000-0000-0000-000000000001','لائحة شؤون الطلاب','21','يختص المجلس بمراجعة واعتماد نتائج الطلاب النهائية.',
 'jurisdiction',repeat('c',64),'approved',true,'55000000-0000-0000-0000-000000000003',clock_timestamp(),
 '55000000-0000-0000-0000-000000000002'
);
insert into qarar_governance.topic_type_authorities_v2(
 organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id
) select b.organization_id,b.topic_type_version_id,l.id,'jurisdiction','55000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b join qarar_governance.legal_authorities_v2 l on l.organization_id=b.organization_id
where b.organization_id='55000000-0000-0000-0000-000000000001';
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('55000000-0000-0000-0000-000000000020','55000000-0000-0000-0000-000000000001','student_results','مسار اعتماد النتائج','55000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id
) values('55000000-0000-0000-0000-000000000021','55000000-0000-0000-0000-000000000001',
 '55000000-0000-0000-0000-000000000020',1,'active','valid','55000000-0000-0000-0000-000000000004',clock_timestamp(),
 '55000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_workflow_bindings_v2(
 organization_id,topic_type_version_id,workflow_template_version_id,status,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'55000000-0000-0000-0000-000000000021','validated','55000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b where b.organization_id='55000000-0000-0000-0000-000000000001';
insert into qarar_governance.topic_schedule_policies_v2(
 organization_id,topic_type_version_id,status,rule_type,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'validated','seasonal','55000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b where b.organization_id='55000000-0000-0000-0000-000000000001';
update qarar_governance.topic_classifications_v2 set status='approved' where organization_id='55000000-0000-0000-0000-000000000001';
update qarar_governance.topic_type_versions_v2 set status='approved',
 approved_by_user_id='55000000-0000-0000-0000-000000000003',approved_at=clock_timestamp() where organization_id='55000000-0000-0000-0000-000000000001';
update qarar_governance.governance_bundles_v2 set status='approved',lock_version=4,
 submitted_by_user_id='55000000-0000-0000-0000-000000000002',submitted_at=clock_timestamp(),
 reviewed_by_user_id='55000000-0000-0000-0000-000000000003',reviewed_at=clock_timestamp(),review_comment='مراجعة مستقلة مكتملة' where organization_id='55000000-0000-0000-0000-000000000001';

set local "request.jwt.claims"='{"sub":"55000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
 $$select qarar_governance.activate_governance_bundle_v2(
   (select (payload->>'bundle_id')::uuid from draft),3,current_date,'55000000-0000-0000-0000-000000000012')$$,
 '40001','تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة','stale activation is rejected'
);
create temporary table activated as select qarar_governance.activate_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),4,current_date,'55000000-0000-0000-0000-000000000013') payload;
select is((select payload->>'status' from activated),'effective','approved bundle becomes effective');
select is((select payload->>'lock_version' from activated),'5','activation advances conflict version');
select is((select status from qarar_governance.governance_bundles_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'effective','bundle state is effective');
select ok((select activation_allowed from qarar_governance.governance_bundles_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'bundle activation flag is enabled');
select is((select status from qarar_governance.topic_classifications_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'effective','classification becomes effective');
select is((select status from qarar_governance.topic_type_versions_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'effective','topic type version becomes effective');
select ok((select activated_by_user_id='55000000-0000-0000-0000-000000000004' from qarar_governance.topic_type_versions_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'activation actor is preserved');
select is((select status from qarar_governance.topic_type_workflow_bindings_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'effective','workflow binding becomes effective');
select is((select valid_from from qarar_governance.topic_type_workflow_bindings_v2 where organization_id='55000000-0000-0000-0000-000000000001'),current_date,'workflow effective date is preserved');
select is((select status from qarar_governance.topic_schedule_policies_v2 where organization_id='55000000-0000-0000-0000-000000000001'),'effective','schedule policy becomes effective');
select is((select effective_from from qarar_governance.topic_schedule_policies_v2 where organization_id='55000000-0000-0000-0000-000000000001'),current_date,'schedule effective date is preserved');
select is((select count(*)::integer from qarar_governance.governance_bundle_reviews_v2 where action='activated' and organization_id='55000000-0000-0000-0000-000000000001'),1,'activation is appended to review history');
create temporary table replay as select qarar_governance.activate_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),4,current_date,'55000000-0000-0000-0000-000000000013') payload;
select is((select payload->>'idempotent_replay' from replay),'true','activation safely replays');
reset role;
select is((select count(*)::integer from qarar_audit.audit_logs where action='governance.model.activated' and organization_id='55000000-0000-0000-0000-000000000001'),1,'activation appends one audit event');
select ok(not has_function_privilege('authenticated','qarar_governance.activate_governance_bundle_v2(uuid,integer,date,uuid)','execute'),'activation remains internal');
select * from finish();
rollback;
