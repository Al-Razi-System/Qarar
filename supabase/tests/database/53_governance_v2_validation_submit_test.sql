begin;
create extension if not exists pgtap;
select plan(15);

insert into qarar_core.organizations(id,code,name_ar)
values('53000000-0000-0000-0000-000000000001','governance-v2-submit-ci','منظمة اختبار إرسال الحوكمة');
insert into auth.users(id,email) values
('53000000-0000-0000-0000-000000000002','governance-v2-author@example.test'),
('53000000-0000-0000-0000-000000000003','governance-v2-reviewer@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('53000000-0000-0000-0000-000000000002','53000000-0000-0000-0000-000000000001','governance-v2-author@example.test','معد حزمة الحوكمة',true),
('53000000-0000-0000-0000-000000000003','53000000-0000-0000-0000-000000000001','governance-v2-reviewer@example.test','مراجع حزمة الحوكمة',true);

set local "request.jwt.claims"='{"sub":"53000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
create temporary table draft as select qarar_governance.save_governance_bundle_draft_v2(
 null,null,'53000000-0000-0000-0000-000000000010',
 '{"classification":{"code":"quality","name_ar":"الجودة المؤسسية"},"topic_type":{"code":"quality.audit","name_ar":"مراجعة الجودة المؤسسية"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"}}'::jsonb
) payload;

create temporary table incomplete_validation as
select qarar_governance.validate_governance_bundle_v2((select (payload->>'bundle_id')::uuid from draft)) payload;
select is((select payload->>'is_valid' from incomplete_validation),'false','incomplete draft fails validation');
select is((select jsonb_array_length(payload->'blocking_issues') from incomplete_validation),3,'all three missing dependency classes are reported');
select throws_ok(
 $$select qarar_governance.submit_governance_bundle_v2(
   (select (payload->>'bundle_id')::uuid from draft),1,'53000000-0000-0000-0000-000000000011')$$,
 '23514','أكمل متطلبات الحزمة الموضحة قبل إرسالها للمراجعة',
 'incomplete bundle cannot be submitted'
);
select is((select status from qarar_governance.governance_bundles_v2),'draft','failed submission leaves bundle unchanged');

insert into qarar_governance.legal_authorities_v2(
 organization_id,source_document_name,article_number,authority_text,authority_kind,source_fingerprint,
 review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id
) values(
 '53000000-0000-0000-0000-000000000001','لائحة الجودة','12','يختص المجلس بمراجعة واعتماد تقارير الجودة المؤسسية.',
 'jurisdiction',repeat('a',64),'approved',true,'53000000-0000-0000-0000-000000000003',clock_timestamp(),
 '53000000-0000-0000-0000-000000000002'
);
insert into qarar_governance.topic_type_authorities_v2(
 organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id
) select b.organization_id,b.topic_type_version_id,l.id,'jurisdiction','53000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b cross join qarar_governance.legal_authorities_v2 l;

insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('53000000-0000-0000-0000-000000000020','53000000-0000-0000-0000-000000000001','quality_audit','مسار مراجعة الجودة','53000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id
) values('53000000-0000-0000-0000-000000000021','53000000-0000-0000-0000-000000000001',
 '53000000-0000-0000-0000-000000000020',1,'active','valid','53000000-0000-0000-0000-000000000003',clock_timestamp(),
 '53000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_workflow_bindings_v2(
 organization_id,topic_type_version_id,workflow_template_version_id,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'53000000-0000-0000-0000-000000000021',
 '53000000-0000-0000-0000-000000000002' from qarar_governance.governance_bundles_v2 b;
insert into qarar_governance.topic_schedule_policies_v2(
 organization_id,topic_type_version_id,rule_type,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'none','53000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b;

create temporary table complete_validation as
select qarar_governance.validate_governance_bundle_v2((select (payload->>'bundle_id')::uuid from draft)) payload;
select is((select payload->>'is_valid' from complete_validation),'true','complete draft passes validation');
select is((select jsonb_array_length(payload->'blocking_issues') from complete_validation),0,'complete draft has no blockers');

create temporary table submitted as select qarar_governance.submit_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),1,'53000000-0000-0000-0000-000000000012') payload;
select is((select payload->>'status' from submitted),'under_review','valid draft moves to review');
select is((select payload->>'lock_version' from submitted),'2','submission advances conflict version');
select is((select status from qarar_governance.topic_type_versions_v2),'under_review','topic type version moves with bundle');
select is((select status from qarar_governance.topic_type_workflow_bindings_v2),'validated','workflow binding is frozen as validated');
select is((select status from qarar_governance.topic_schedule_policies_v2),'validated','schedule policy is frozen as validated');
select is((select count(*)::integer from qarar_governance.governance_bundle_reviews_v2 where action='submitted'),1,'submission history is appended');

create temporary table replay as select qarar_governance.submit_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),1,'53000000-0000-0000-0000-000000000012') payload;
select is((select payload->>'idempotent_replay' from replay),'true','submission safely replays');

reset role;
select is((select count(*)::integer from qarar_audit.audit_logs where action='governance.model.submitted'),1,'submission appends one audit event');
select ok(not has_function_privilege('authenticated','qarar_governance.submit_governance_bundle_v2(uuid,integer,uuid)','execute'),'submission remains internal');

select * from finish();
rollback;
