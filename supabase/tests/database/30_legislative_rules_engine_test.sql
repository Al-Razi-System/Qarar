begin;
create extension if not exists pgtap;
select plan(12);

insert into qarar_core.organizations(id,code,name_ar)
values('30000000-0000-0000-0000-000000000001','legislative-ci','منظمة اختبار المحرك التشريعي');
insert into auth.users(id,email)
values('30000000-0000-0000-0000-000000000002','legislative-ci@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
values('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',
  'legislative-ci@example.test','مدير اختبار المحرك التشريعي',true);

insert into qarar_governance.policies(
  id,organization_id,code,name_ar,policy_type,created_by_user_id
) values(
  '30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001',
  'ci-regulation','لائحة اختبار التكامل','regulation','30000000-0000-0000-0000-000000000002'
);
insert into qarar_governance.policy_versions(
  id,organization_id,policy_id,version_no,version_label,created_by_user_id
) values
('30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000003',1,'1.0','30000000-0000-0000-0000-000000000002'),
('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000003',2,'2.0','30000000-0000-0000-0000-000000000002');
insert into qarar_governance.policy_items(
  id,organization_id,policy_version_id,item_code,item_type,title_ar,body_text,sort_order
) values
('30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000004','article-1','article','المادة الأولى','النص القديم',1),
('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000005','article-1','article','المادة الأولى','النص الجديد',1);
insert into qarar_governance.policy_items(
  id,organization_id,policy_version_id,item_code,item_type,title_ar,sort_order
) values('30000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000005','chapter-1','chapter','الفصل الأول',2);
insert into qarar_governance.policy_scope_assignments(
  organization_id,policy_version_id,scope_type,priority,created_by_user_id
) values(
  '30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005',
  'organization',100,'30000000-0000-0000-0000-000000000002'
);

set local role authenticated;
set local "request.jwt.claims"='{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}';

select lives_ok(
  $$select api_v1.admin_update_policy_version_legal_metadata(
    '30000000-0000-0000-0000-000000000005','مجلس الجامعة','رئيس الجامعة','42',
    date '2026-08-06','تحديث الحوكمة','30000000-0000-0000-0000-000000000004','sha256:test'
  )$$,
  'legal metadata is saved through the public API contract'
);

select lives_ok(
  $$select api_v1.admin_update_policy_item_legal_text(
    '30000000-0000-0000-0000-000000000007','النص الرسمي الجديد','شرح المادة',1,2,
    'المادة الأولى','active','تعديل للاختبار',true,'30000000-0000-0000-0000-000000000006'
  )$$,
  'official and interpreted text is saved'
);

select lives_ok(
  $$select api_v1.admin_move_policy_item(
    '30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008',3
  )$$,
  'article can be moved below a chapter through the public API'
);
select is(
  api_v1.admin_get_policy_legislative_model('30000000-0000-0000-0000-000000000005')->'items'->1->>'parent_item_id',
  '30000000-0000-0000-0000-000000000008',
  'legislative model preserves the document hierarchy'
);

select lives_ok(
  $$select api_v1.admin_save_policy_rule(
    '30000000-0000-0000-0000-000000000007',
    '{"code":"article-1.eligibility","name_ar":"قاعدة أهلية المادة الأولى","rule_type":"eligibility","status":"active","priority":100,"conditions":[{"code":"request.complete","field_path":"request.is_complete","operator":"eq","expected_value":true,"failure_action":"return_for_completion","failure_message_ar":"يجب استكمال الطلب"}],"requirements":[{"code":"supporting.document","name_ar":"المستند المؤيد","requirement_type":"document","is_mandatory":true,"timing":"before_submission","validation_spec":{"extensions":["pdf"]}}],"actions":[{"code":"approve","label_ar":"اعتماد","action_type":"approve","is_terminal":true,"requires_reason":false,"result_payload":{"status":"approved"}}]}'::jsonb
  )$$,
  'nested executable rule is saved atomically'
);

select is(
  jsonb_array_length(api_v1.admin_get_policy_legislative_model(
    '30000000-0000-0000-0000-000000000005'
  )->'items'->1->'rules'->0->'conditions'),
  1,
  'rule conditions are persisted'
);
select is(
  jsonb_array_length(api_v1.admin_get_policy_legislative_model(
    '30000000-0000-0000-0000-000000000005'
  )->'items'->1->'rules'->0->'requirements'),
  1,
  'rule requirements are persisted'
);
select is(
  jsonb_array_length(api_v1.admin_get_policy_legislative_model(
    '30000000-0000-0000-0000-000000000005'
  )->'items'->1->'rules'->0->'actions'),
  1,
  'rule actions are persisted'
);

select lives_ok(
  $$select api_v1.admin_save_policy_reference(
    null,'30000000-0000-0000-0000-000000000007',null,null,null,
    'قرار مجلس الجامعة رقم 42','based_on','سند إصدار اللائحة','مرجع خارجي موثق'
  )$$,
  'external legal reference is saved'
);

select ok(
  (api_v1.admin_validate_policy_version_readiness('30000000-0000-0000-0000-000000000005')->>'ready')::boolean,
  'complete legislative version passes readiness validation'
);
select is(
  jsonb_array_length(api_v1.admin_compare_policy_versions(
    '30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000005'
  )->'modified'),
  1,
  'version comparison reports the modified article'
);
select lives_ok(
  $$select api_v1.admin_submit_policy_for_review(
    '30000000-0000-0000-0000-000000000005'
  )$$,
  'readiness guard permits a complete version to enter review'
);

select * from finish();
rollback;
