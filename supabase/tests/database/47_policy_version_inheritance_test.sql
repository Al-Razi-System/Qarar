begin;
create extension if not exists pgtap;
select plan(12);

insert into qarar_core.organizations(id,code,name_ar)
values('47000000-0000-0000-0000-000000000001','version-inheritance-ci','منظمة اختبار توريث الإصدارات');
insert into auth.users(id,email)
values('47000000-0000-0000-0000-000000000002','version-inheritance@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin)
values('47000000-0000-0000-0000-000000000002','47000000-0000-0000-0000-000000000001',
  'version-inheritance@example.test','مدير اختبار توريث الإصدارات',true);
set local "request.jwt.claims"='{"sub":"47000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role qarar_governance_executor;
insert into qarar_governance.policies(id,organization_id,code,name_ar,policy_type,created_by_user_id)
values('47000000-0000-0000-0000-000000000003','47000000-0000-0000-0000-000000000001',
  'version-inheritance','لائحة اختبار توريث الإصدار','regulation','47000000-0000-0000-0000-000000000002');
insert into qarar_governance.policy_versions(id,organization_id,policy_id,version_no,version_label,created_by_user_id)
values('47000000-0000-0000-0000-000000000004','47000000-0000-0000-0000-000000000001',
  '47000000-0000-0000-0000-000000000003',1,'1.0','47000000-0000-0000-0000-000000000002');
insert into qarar_governance.policy_items(
  id,organization_id,policy_version_id,parent_item_id,item_code,item_type,title_ar,body_text,sort_order
) values
('47000000-0000-0000-0000-000000000005','47000000-0000-0000-0000-000000000001',
 '47000000-0000-0000-0000-000000000004',null,'chapter-1','chapter','الفصل الأول',null,1),
('47000000-0000-0000-0000-000000000006','47000000-0000-0000-0000-000000000001',
 '47000000-0000-0000-0000-000000000004','47000000-0000-0000-0000-000000000005',
 'article-1','article','المادة الأولى','النص الأصلي',2);
insert into qarar_governance.policy_scope_assignments(
  organization_id,policy_version_id,scope_type,priority,created_by_user_id
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000004',
  'organization',100,'47000000-0000-0000-0000-000000000002');
insert into qarar_governance.policy_rules(
  id,organization_id,policy_item_id,rule_code,name_ar,rule_type,status,created_by_user_id
) values('47000000-0000-0000-0000-000000000007','47000000-0000-0000-0000-000000000001',
  '47000000-0000-0000-0000-000000000006','article-1.rule','قاعدة المادة الأولى','requirement','active',
  '47000000-0000-0000-0000-000000000002');
insert into qarar_governance.rule_conditions(
  organization_id,policy_rule_id,condition_code,field_path,operator,expected_value,sequence_no
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000007',
  'request.ready','request.ready','eq','true',1);
insert into qarar_governance.rule_requirements(
  organization_id,policy_rule_id,requirement_code,name_ar,requirement_type,sequence_no
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000007',
  'supporting.file','المرفق المؤيد','document',1);
insert into qarar_governance.rule_actions(
  organization_id,policy_rule_id,action_code,label_ar,action_type,sequence_no
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000007',
  'approve','اعتماد','approve',1);
insert into qarar_governance.policy_references(
  organization_id,source_policy_item_id,external_reference,reference_type,created_by_user_id
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000006',
  'قرار خارجي 47','based_on','47000000-0000-0000-0000-000000000002');
insert into qarar_governance.policy_attachments(
  organization_id,policy_item_id,file_name,file_url,mime_type,created_by_user_id
) values('47000000-0000-0000-0000-000000000001','47000000-0000-0000-0000-000000000006',
  'evidence.pdf','https://example.test/evidence.pdf','application/pdf','47000000-0000-0000-0000-000000000002');

reset role;
set local role authenticated;

create temporary table inherited_result as
select api_v1.admin_create_policy_version(
  '47000000-0000-0000-0000-000000000003','2.0','نسخة موروثة للاختبار'
) as payload;
reset role;

select is((select payload->>'version_no' from inherited_result),'2','creates the next version number');
select is((select payload->>'source_version_id' from inherited_result),
  '47000000-0000-0000-0000-000000000004','records the source version');
select is((select payload->>'inherited_items' from inherited_result),'2','reports inherited items');
select is((select payload->>'inherited_rules' from inherited_result),'1','reports inherited rules');
select is((select count(*)::text from qarar_governance.policy_items i
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid),'2','copies all items');
select ok((select child.parent_item_id=parent.id from qarar_governance.policy_items child
  join inherited_result r on child.policy_version_id=(r.payload->>'id')::uuid
  join qarar_governance.policy_items parent on parent.policy_version_id=child.policy_version_id
    and parent.item_code='chapter-1'
  where child.item_code='article-1'),'remaps the item hierarchy to new identifiers');
select is((select supersedes_item_id::text from qarar_governance.policy_items i
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid
  where i.item_code='article-1'),'47000000-0000-0000-0000-000000000006','links the copied item to its predecessor');
select is((select count(*)::text from qarar_governance.policy_rules pr
  join qarar_governance.policy_items i on i.id=pr.policy_item_id
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid),'1','copies executable rules');
select is((select count(*)::text from qarar_governance.rule_conditions rc
  join qarar_governance.policy_rules pr on pr.id=rc.policy_rule_id
  join qarar_governance.policy_items i on i.id=pr.policy_item_id
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid),'1','copies nested rule details');
select is((select count(*)::text from qarar_governance.policy_references ref
  join qarar_governance.policy_items i on i.id=ref.source_policy_item_id
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid),'1','copies legal references');
select is((select count(*)::text from qarar_governance.policy_attachments a
  join qarar_governance.policy_items i on i.id=a.policy_item_id
  join inherited_result r on i.policy_version_id=(r.payload->>'id')::uuid),'1','copies item attachment metadata');
update qarar_governance.policy_items set body_text='النص المعدل في الإصدار الجديد'
where policy_version_id=(select (payload->>'id')::uuid from inherited_result) and item_code='article-1';
select is((select body_text from qarar_governance.policy_items
  where id='47000000-0000-0000-0000-000000000006'),'النص الأصلي','keeps the previous version immutable and independent');

select * from finish();
rollback;
