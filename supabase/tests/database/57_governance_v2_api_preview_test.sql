begin;
create extension if not exists pgtap;
select plan(14);

insert into qarar_core.organizations(id,code,name_ar)
values('57000000-0000-0000-0000-000000000001','governance-v2-api-ci','منظمة اختبار API الحوكمة');
insert into auth.users(id,email) values
('57000000-0000-0000-0000-000000000002','governance-v2-api-admin@example.test'),
('57000000-0000-0000-0000-000000000003','governance-v2-api-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('57000000-0000-0000-0000-000000000002','57000000-0000-0000-0000-000000000001','governance-v2-api-admin@example.test','مسؤول اختبار API',true),
('57000000-0000-0000-0000-000000000003','57000000-0000-0000-0000-000000000001','governance-v2-api-denied@example.test','مستخدم دون صلاحية',false);

-- The management release exposes the permission-checked details wrapper only.
select ok(has_schema_privilege('authenticated','api_v2','usage'),'authenticated can use the published V2 schema');
select ok(has_function_privilege('authenticated','api_v2.get_governance_bundle_v2(uuid)','execute'),'authenticated can execute permission-checked details API');
select ok(not has_function_privilege('service_role','api_v2.get_governance_bundle_v2(uuid)','execute'),'service role cannot bypass preview boundary');

set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role qarar_api_executor;
create temporary table denied as select api_v2.get_governance_bundle_v2('57000000-0000-0000-0000-000000000099') payload;
select is((select payload->>'ok' from denied),'false','denied request returns failure envelope');
select is((select payload->>'error_code' from denied),'MODEL_PERMISSION_DENIED','permission denial has stable code');
select is((select payload->>'message_ar' from denied),'لا تملك الصلاحية المطلوبة لهذه العملية في هذا النطاق.','permission denial has safe Arabic copy');
select matches((select payload->>'trace_id' from denied),'^[0-9a-f-]{36}$','failure carries trace id');

set local "request.jwt.claims"='{"sub":"57000000-0000-0000-0000-000000000002","role":"authenticated"}';
create temporary table missing as select api_v2.get_governance_bundle_v2('57000000-0000-0000-0000-000000000099') payload;
select is((select payload->>'error_code' from missing),'MODEL_BUNDLE_NOT_FOUND','missing bundle has stable not-found code');
select is((select payload->>'message_ar' from missing),'تعذر العثور على حزمة الحوكمة المطلوبة.','raw database error is replaced');

create temporary table invalid as select api_v2.save_governance_bundle_draft_v2(
 null,null,'57000000-0000-0000-0000-000000000010','{}'::jsonb) payload;
select is((select payload->>'error_code' from invalid),'MODEL_VALIDATION_FAILED','invalid payload has validation code');
select isnt((select payload->>'message_ar' from invalid),'بيانات التصنيف ونوع الموضوع والإصدار مطلوبة','internal validation message is not leaked');

create temporary table created as select api_v2.save_governance_bundle_draft_v2(
 null,null,'57000000-0000-0000-0000-000000000011',
 '{"classification":{"code":"institutional","name_ar":"مؤسسي"},"topic_type":{"code":"institutional.plan","name_ar":"اعتماد خطة مؤسسية"},"version":{"is_governed":true,"acceptance_finality":"complete","rejection_finality":"complete"}}'::jsonb
) payload;
select is((select payload->>'ok' from created),'true','valid command succeeds through API envelope');
select matches((select payload->>'trace_id' from created),'^[0-9a-f-]{36}$','success carries trace id');

create temporary table read_created as select api_v2.get_governance_bundle_v2(
 (select (payload#>>'{data,bundle_id}')::uuid from created)) payload;
select is((select payload#>>'{data,bundle,status}' from read_created),'draft','created bundle can be read through envelope');
select * from finish();
rollback;
