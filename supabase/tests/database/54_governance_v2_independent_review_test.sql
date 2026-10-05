begin;
create extension if not exists pgtap;
select plan(17);

insert into qarar_core.organizations(id,code,name_ar)
values('54000000-0000-0000-0000-000000000001','governance-v2-review-ci','منظمة اختبار مراجعة الحوكمة');
insert into auth.users(id,email) values
('54000000-0000-0000-0000-000000000002','governance-v2-author-review@example.test'),
('54000000-0000-0000-0000-000000000003','governance-v2-reviewer-approve@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('54000000-0000-0000-0000-000000000002','54000000-0000-0000-0000-000000000001','governance-v2-author-review@example.test','معد حزمة المراجعة',true),
('54000000-0000-0000-0000-000000000003','54000000-0000-0000-0000-000000000001','governance-v2-reviewer-approve@example.test','مراجع مستقل',true);

set local "request.jwt.claims"='{"sub":"54000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
create temporary table draft as select qarar_governance.save_governance_bundle_draft_v2(
 null,null,'54000000-0000-0000-0000-000000000010',
 '{"classification":{"code":"academic","name_ar":"الشؤون الأكاديمية"},"topic_type":{"code":"academic.program","name_ar":"اعتماد برنامج أكاديمي"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"}}'::jsonb
) payload;

insert into qarar_governance.legal_authorities_v2(
 organization_id,source_document_name,article_number,authority_text,authority_kind,source_fingerprint,
 review_status,activation_allowed,reviewed_by_user_id,reviewed_at,created_by_user_id
) values(
 '54000000-0000-0000-0000-000000000001','اللائحة الأكاديمية','14','يختص المجلس بمراجعة واعتماد البرامج الأكاديمية.',
 'jurisdiction',repeat('b',64),'approved',true,'54000000-0000-0000-0000-000000000003',clock_timestamp(),
 '54000000-0000-0000-0000-000000000002'
);
insert into qarar_governance.topic_type_authorities_v2(
 organization_id,topic_type_version_id,legal_authority_id,authority_role,created_by_user_id
) select b.organization_id,b.topic_type_version_id,l.id,'jurisdiction','54000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b cross join qarar_governance.legal_authorities_v2 l;
insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,created_by_user_id)
values('54000000-0000-0000-0000-000000000020','54000000-0000-0000-0000-000000000001','academic_program','مسار البرنامج الأكاديمي','54000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(
 id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id
) values('54000000-0000-0000-0000-000000000021','54000000-0000-0000-0000-000000000001',
 '54000000-0000-0000-0000-000000000020',1,'active','valid','54000000-0000-0000-0000-000000000003',clock_timestamp(),
 '54000000-0000-0000-0000-000000000002');
insert into qarar_governance.topic_type_workflow_bindings_v2(
 organization_id,topic_type_version_id,workflow_template_version_id,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'54000000-0000-0000-0000-000000000021','54000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b;
insert into qarar_governance.topic_schedule_policies_v2(
 organization_id,topic_type_version_id,rule_type,created_by_user_id
) select b.organization_id,b.topic_type_version_id,'none','54000000-0000-0000-0000-000000000002'
from qarar_governance.governance_bundles_v2 b;
select qarar_governance.submit_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),1,'54000000-0000-0000-0000-000000000011');

select throws_ok(
 $$select qarar_governance.approve_governance_bundle_v2(
   (select (payload->>'bundle_id')::uuid from draft),2,'اعتماد المعد لحزمته','54000000-0000-0000-0000-000000000012')$$,
 '42501','لا يجوز لمعد الحزمة مراجعتها أو اعتمادها بنفسه','the bundle author cannot self approve'
);
select is((select status from qarar_governance.governance_bundles_v2),'under_review','rejected self approval leaves state unchanged');

set local "request.jwt.claims"='{"sub":"54000000-0000-0000-0000-000000000003","role":"authenticated"}';
create temporary table changes as select qarar_governance.request_governance_bundle_changes_v2(
 (select (payload->>'bundle_id')::uuid from draft),2,'يلزم استكمال وصف التصنيف','54000000-0000-0000-0000-000000000013') payload;
select is((select payload->>'status' from changes),'changes_requested','independent reviewer can request changes');
select is((select payload->>'lock_version' from changes),'3','change request advances conflict version');
select is((select status from qarar_governance.topic_classifications_v2),'draft','classification returns to draft');
select is((select status from qarar_governance.topic_type_versions_v2),'draft','topic type version returns to draft');
select is((select status from qarar_governance.topic_type_workflow_bindings_v2),'draft','workflow binding returns to draft');
select is((select status from qarar_governance.topic_schedule_policies_v2),'draft','schedule policy returns to draft');
select is((select count(*)::integer from qarar_governance.governance_bundle_reviews_v2 where action='changes_requested'),1,'change request is appended to review history');
create temporary table changes_replay as select qarar_governance.request_governance_bundle_changes_v2(
 (select (payload->>'bundle_id')::uuid from draft),2,'يلزم استكمال وصف التصنيف','54000000-0000-0000-0000-000000000013') payload;
select is((select payload->>'idempotent_replay' from changes_replay),'true','change request safely replays');

update qarar_governance.topic_classifications_v2 set status='under_review';
update qarar_governance.topic_type_versions_v2 set status='under_review';
update qarar_governance.topic_type_workflow_bindings_v2 set status='validated';
update qarar_governance.topic_schedule_policies_v2 set status='validated';
update qarar_governance.governance_bundles_v2 set status='under_review',lock_version=4,
 submitted_by_user_id='54000000-0000-0000-0000-000000000002',submitted_at=clock_timestamp();

create temporary table approved as select qarar_governance.approve_governance_bundle_v2(
 (select (payload->>'bundle_id')::uuid from draft),4,'تمت المراجعة المستقلة والاعتماد','54000000-0000-0000-0000-000000000014') payload;
select is((select payload->>'status' from approved),'approved','independent reviewer approves complete bundle');
select is((select payload->>'lock_version' from approved),'5','approval advances conflict version');
select is((select status from qarar_governance.topic_classifications_v2),'approved','classification is approved with bundle');
select is((select status from qarar_governance.topic_type_versions_v2),'approved','topic type version is approved with bundle');
select is((select count(*)::integer from qarar_governance.governance_bundle_reviews_v2 where action='approved'),1,'approval is appended to review history');

reset role;
select is((select count(*)::integer from qarar_audit.audit_logs where action in('governance.model.changes_requested','governance.model.approved')),2,'review decisions append traceable audit events');
select ok(not has_function_privilege('authenticated','qarar_governance.approve_governance_bundle_v2(uuid,integer,text,uuid)','execute'),'approval remains internal');
select * from finish();
rollback;
