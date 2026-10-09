begin;
create extension if not exists pgtap;
select plan(8);
insert into qarar_core.organizations(id,code,name_ar) values ('64000000-0000-0000-0000-000000000001','routing-ci','اختبار التبعية');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values
 ('64000000-0000-0000-0000-000000000002','64000000-0000-0000-0000-000000000001','unit','وحدة',false),
 ('64000000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000001','council','مجلس',true);
insert into qarar_governance.governance_unit_classes(id,organization_id,code,name_ar,governance_level) values
 ('64000000-0000-0000-0000-000000000004','64000000-0000-0000-0000-000000000001','faculty','كلية','faculty'),
 ('64000000-0000-0000-0000-000000000005','64000000-0000-0000-0000-000000000001','university','جامعة','university');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no) values
 ('64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','faculty_a','كلية أ','active',1),
 ('64000000-0000-0000-0000-000000000011','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','faculty_b','كلية ب','active',1);
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,parent_unit_id) values
 ('64000000-0000-0000-0000-000000000012','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000002','department','قسم','active',2,'64000000-0000-0000-0000-000000000010');
insert into qarar_core.governance_units(id,organization_id,unit_type_id,code,name_ar,status,level_no,scope_unit_id,governance_class_id) values
 ('64000000-0000-0000-0000-000000000020','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','origin','مجلس القسم','active',1,'64000000-0000-0000-0000-000000000012',null),
 ('64000000-0000-0000-0000-000000000021','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','council_a','مجلس كلية أ','active',1,'64000000-0000-0000-0000-000000000010','64000000-0000-0000-0000-000000000004'),
 ('64000000-0000-0000-0000-000000000022','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','council_b','مجلس كلية ب','active',1,'64000000-0000-0000-0000-000000000011','64000000-0000-0000-0000-000000000004'),
 ('64000000-0000-0000-0000-000000000023','64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003','university','مجلس الجامعة','active',1,null,'64000000-0000-0000-0000-000000000005');

insert into qarar_core.governance_units(organization_id,unit_type_id,code,name_ar,status)
 select '64000000-0000-0000-0000-000000000001','64000000-0000-0000-0000-000000000003',
 'cnl_2026_'||lpad((1000+n)::text,6,'0'),'مجلس اختبار العدد '||n,'inactive' from generate_series(1,110)n;
insert into qarar_core.organizations(id,code,name_ar) values('64000000-0000-0000-0000-000000000099','tree-other','منظمة أخرى');
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar,is_council_type) values('64000000-0000-0000-0000-000000000098','64000000-0000-0000-0000-000000000099','unit','وحدة',false);
insert into qarar_core.governance_units(organization_id,unit_type_id,code,name_ar) values('64000000-0000-0000-0000-000000000099','64000000-0000-0000-0000-000000000098','secret','وحدة خارجية');
insert into auth.users(id,email) values
('64000000-0000-0000-0000-000000000030','tree-admin@example.test'),
('64000000-0000-0000-0000-000000000031','tree-denied@example.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('64000000-0000-0000-0000-000000000030','64000000-0000-0000-0000-000000000001','tree-admin@example.test','مسؤول اختبار',true),
('64000000-0000-0000-0000-000000000031','64000000-0000-0000-0000-000000000001','tree-denied@example.test','غير مخول',false);
select set_config('request.jwt.claims','{"sub":"64000000-0000-0000-0000-000000000030","role":"authenticated"}',true);
create temporary table hierarchy as select api_v2.admin_get_council_organizational_tree_v2() payload;
select is((select jsonb_array_length(payload->'units') from hierarchy),3,'empty units remain visible in the read model');
select is((select jsonb_array_length(payload->'councils') from hierarchy),114,'all councils beyond the first 100 are returned');
select is((select item->>'parent_unit_id' from hierarchy,jsonb_array_elements(payload->'units') item where item->>'id'='64000000-0000-0000-0000-000000000012'),'64000000-0000-0000-0000-000000000010','unit parent is authoritative');
select is((select item->>'scope_unit_id' from hierarchy,jsonb_array_elements(payload->'councils') item where item->>'id'='64000000-0000-0000-0000-000000000020'),'64000000-0000-0000-0000-000000000012','council attaches to its organizational unit');
update qarar_core.governance_units set status='archived',archived_at=clock_timestamp() where id='64000000-0000-0000-0000-000000000011';
select is(jsonb_array_length(api_v2.admin_get_council_organizational_tree_v2()->'units'),3,'archived scopes are preserved for historical councils');
select ok(not has_function_privilege('authenticated','qarar_core.admin_get_council_organizational_tree_v2()','execute'),'private read implementation cannot be invoked directly');
select set_config('request.jwt.claims','{"sub":"64000000-0000-0000-0000-000000000031","role":"authenticated"}',true);
select throws_ok($$select api_v2.admin_get_council_organizational_tree_v2()$$,'42501',null,'unprivileged member is denied');
select set_config('request.jwt.claims','{"sub":"64000000-0000-0000-0000-000000000030","role":"authenticated"}',true);
select is(jsonb_array_length(api_v2.admin_get_council_organizational_tree_v2()->'units'),3,'foreign organization rows are never included');
select * from finish();
rollback;
