begin;
create extension if not exists pgtap;
select plan(19);

insert into qarar_core.organizations(id,code,name_ar)
values('52000000-0000-0000-0000-000000000001','governance-v2-draft-ci','منظمة اختبار مسودة الحوكمة');
insert into auth.users(id,email)
values('52000000-0000-0000-0000-000000000002','governance-v2-draft@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
values('52000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001',
  'governance-v2-draft@example.test','مدير اختبار مسودة الحوكمة',true);

set local "request.jwt.claims"='{"sub":"52000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;

insert into qarar_governance.workflow_templates(id,organization_id,code,name_ar,status,created_by_user_id)
values('52000000-0000-0000-0000-000000000020','52000000-0000-0000-0000-000000000001','academic.route','المسار الأكاديمي','active','52000000-0000-0000-0000-000000000002');
insert into qarar_governance.workflow_template_versions(id,organization_id,workflow_template_id,version_no,status,validation_status,activated_by_user_id,activated_at,created_by_user_id)
values('52000000-0000-0000-0000-000000000021','52000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000020',1,'active','valid','52000000-0000-0000-0000-000000000002',clock_timestamp(),'52000000-0000-0000-0000-000000000002');

create temporary table first_save as
select qarar_governance.save_governance_bundle_draft_v2(
  null,null,'52000000-0000-0000-0000-000000000010',
  '{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"code":"academic.program","name_ar":"استحداث برنامج أكاديمي"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"},"workflow":{"workflow_template_version_id":"52000000-0000-0000-0000-000000000021"},"schedule":{"rule_type":"monthly_week","rule_config":{"week":1},"maximum_postponements":1}}'::jsonb
) payload;

select is((select payload->>'status' from first_save),'draft','creates an inactive draft');
select matches((select payload#>>'{reference_numbers,bundle}' from first_save),'^GVB-','generates the bundle reference');
select is((select payload->>'lock_version' from first_save),'1','new draft starts at lock version one');
select is((select payload#>>'{validation_summary,is_complete}' from first_save),'false','new partial draft is not falsely complete');
select is((select count(*)::integer from qarar_governance.governance_bundle_command_receipts_v2 where organization_id='52000000-0000-0000-0000-000000000001'),1,'stores one durable command receipt');
select is((select count(*)::integer from qarar_governance.topic_type_workflow_bindings_v2 where organization_id='52000000-0000-0000-0000-000000000001'),1,'route binding is saved atomically');
select is((select rule_type from qarar_governance.topic_schedule_policies_v2 where organization_id='52000000-0000-0000-0000-000000000001'),'monthly_week','schedule policy is saved atomically');
reset role;
select is((select count(*)::integer from qarar_audit.audit_logs where organization_id='52000000-0000-0000-0000-000000000001' and action='governance.model.draft.saved'),1,'appends one audit event');
set local role qarar_governance_executor;

create temporary table replay_save as
select qarar_governance.save_governance_bundle_draft_v2(
  null,null,'52000000-0000-0000-0000-000000000010',
  '{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"code":"academic.program","name_ar":"استحداث برنامج أكاديمي"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"},"workflow":{"workflow_template_version_id":"52000000-0000-0000-0000-000000000021"},"schedule":{"rule_type":"monthly_week","rule_config":{"week":1},"maximum_postponements":1}}'::jsonb
) payload;
select is((select payload->>'idempotent_replay' from replay_save),'true','same request replays its stored response');
select is((select count(*)::integer from qarar_governance.governance_bundles_v2 where organization_id='52000000-0000-0000-0000-000000000001'),1,'replay creates no duplicate bundle');
select throws_ok(
  $$select qarar_governance.save_governance_bundle_draft_v2(
    null,null,'52000000-0000-0000-0000-000000000010',
    '{"classification":{"code":"different","name_ar":"تصنيف مختلف"},"topic_type":{"code":"different.topic","name_ar":"موضوع مختلف تماماً"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"}}'::jsonb)$$,
  '40001','استُخدم مفتاح التكرار نفسه لطلب مختلف',
  'reusing an idempotency key for different content is rejected'
);
select throws_ok(
  $$select qarar_governance.save_governance_bundle_draft_v2(
    null,null,'52000000-0000-0000-0000-000000000013',
    '{"status":"approved","classification":{"code":"forbidden","name_ar":"تصنيف ممنوع"},"topic_type":{"code":"forbidden.topic","name_ar":"موضوع بحالة مرسلة"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"}}'::jsonb)$$,
  '22023','لا ترسل المعرفات أو الحالة أو التفعيل؛ ينشئها النظام تلقائياً',
  'server-owned lifecycle fields are rejected'
);

create temporary table updated_save as
select qarar_governance.save_governance_bundle_draft_v2(
  (select (payload->>'bundle_id')::uuid from first_save),1,'52000000-0000-0000-0000-000000000011',
  '{"classification":{"code":"quality","name_ar":"الجودة"},"topic_type":{"code":"academic.program","name_ar":"استحداث برنامج أكاديمي"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"}}'::jsonb
) payload;
select is((select payload->>'lock_version' from updated_save),'2','update advances the conflict version');
select is((select name_ar from qarar_governance.topic_classifications_v2 where organization_id='52000000-0000-0000-0000-000000000001' and code='academic'),'أكاديمي','does not rename a shared classification from a topic draft');
select is((select c.code from qarar_governance.topic_type_versions_v2 v join qarar_governance.topic_classifications_v2 c on c.id=v.classification_id where v.id=(select topic_type_version_id from qarar_governance.governance_bundles_v2 where id=(select (payload->>'bundle_id')::uuid from first_save))),'quality','draft can switch classification without mutating the old taxonomy record');

select qarar_governance.save_governance_bundle_draft_v2(
  null,null,'52000000-0000-0000-0000-000000000014',
  '{"classification":{"code":"academic","name_ar":"أكاديمي"},"topic_type":{"code":"academic.plan","name_ar":"اعتماد خطة أكاديمية"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"}}'::jsonb
);
select is((select count(*)::integer from qarar_governance.topic_classifications_v2 where organization_id='52000000-0000-0000-0000-000000000001'),2,'a second topic reuses the shared classification without creating a duplicate');
select is((select count(*)::integer from qarar_governance.governance_bundles_v2 where organization_id='52000000-0000-0000-0000-000000000001'),2,'a second topic creates its own bundle');

select throws_ok(
  $$select qarar_governance.save_governance_bundle_draft_v2(
    (select (payload->>'bundle_id')::uuid from first_save),1,'52000000-0000-0000-0000-000000000012',
    '{"classification":{"code":"academic","name_ar":"تعديل متعارض"},"topic_type":{"code":"academic.program","name_ar":"استحداث برنامج أكاديمي"},"version":{"is_governed":true,"acceptance_finality":"advance","rejection_finality":"complete"}}'::jsonb)$$,
  '40001','تم تعديل الحزمة في جلسة أخرى؛ حدّث البيانات ثم أعد المحاولة',
  'stale update is rejected with safe Arabic conflict copy'
);

reset role;
select ok(
  not has_function_privilege('authenticated','qarar_governance.save_governance_bundle_draft_v2(uuid,integer,uuid,jsonb)','execute'),
  'authenticated cannot call the internal command directly'
);

select * from finish();
rollback;
