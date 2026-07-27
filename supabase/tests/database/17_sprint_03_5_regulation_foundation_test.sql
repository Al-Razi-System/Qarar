begin;
create extension if not exists pgtap;
select plan(19);

select has_schema('qarar_governance', 'regulation engine owns an internal module schema');
select is(
  (select count(*)::integer
   from qarar_architecture.entity_registry
   where module_code = 'governance'
     and entity_name = any(array[
       'governance_unit_classes','policies','policy_versions','policy_items',
       'policy_item_roles','policy_scope_assignments','policy_item_scope_overrides'
     ])),
  7,
  'PB-060 registers all seven regulation foundation entities'
);
select ok(
  exists(select 1 from pg_roles where rolname = 'qarar_governance_executor'
    and rolcanlogin = false and rolbypassrls),
  'governance executor is isolated as NOLOGIN BYPASSRLS'
);
select is(
  (select count(*)::integer
   from qarar_architecture.entity_registry e
   join qarar_architecture.module_registry m using(module_code)
   join pg_class c on c.relname=e.entity_name
   join pg_namespace n on n.oid=c.relnamespace and n.nspname=m.schema_name
   where e.module_code='governance'
     and e.entity_name = any(array[
       'governance_unit_classes','policies','policy_versions','policy_items',
       'policy_item_roles','policy_scope_assignments','policy_item_scope_overrides'
     ])
     and c.relrowsecurity),
  7,
  'RLS is enabled on every regulation entity'
);
select ok(
  not has_table_privilege('authenticated','qarar_governance.policies','select'),
  'authenticated clients cannot bypass api_v1 to read policies'
);
select ok(
  not has_table_privilege('authenticated','qarar_governance.policies','insert'),
  'authenticated clients cannot directly create policies'
);

insert into qarar_core.organizations(id,code,name_ar) values
('50000000-0000-0000-0000-000000000001','reg-a','Regulation Tenant A'),
('50000000-0000-0000-0000-000000000002','reg-b','Regulation Tenant B');
insert into auth.users(id,email) values
('50000000-0000-0000-0000-000000000011','admin-a@reg.test'),
('50000000-0000-0000-0000-000000000012','admin-b@reg.test');
insert into qarar_iam.users(id,organization_id,email,full_name_ar,is_system_admin) values
('50000000-0000-0000-0000-000000000011','50000000-0000-0000-0000-000000000001','admin-a@reg.test','Admin A',true),
('50000000-0000-0000-0000-000000000012','50000000-0000-0000-0000-000000000002','admin-b@reg.test','Admin B',true);
insert into qarar_core.governance_unit_types(id,organization_id,code,name_ar) values
('50000000-0000-0000-0000-000000000021','50000000-0000-0000-0000-000000000001','council','Council A'),
('50000000-0000-0000-0000-000000000022','50000000-0000-0000-0000-000000000002','council','Council B');
insert into qarar_governance.governance_unit_classes(
 id,organization_id,code,name_ar,governance_level
) values
('50000000-0000-0000-0000-000000000031','50000000-0000-0000-0000-000000000001','department_council','Department Council','department'),
('50000000-0000-0000-0000-000000000032','50000000-0000-0000-0000-000000000002','department_council','Department Council','department');
insert into qarar_core.governance_units(
 id,organization_id,unit_type_id,governance_class_id,code,name_ar
) values
('50000000-0000-0000-0000-000000000041','50000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000021','50000000-0000-0000-0000-000000000031','cs-council','CS Council'),
('50000000-0000-0000-0000-000000000042','50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000022','50000000-0000-0000-0000-000000000032','foreign-council','Foreign Council');

insert into qarar_governance.policies(
 id,organization_id,code,name_ar,created_by_user_id
) values (
 '50000000-0000-0000-0000-000000000051','50000000-0000-0000-0000-000000000001',
 'department-policy','Department Policy','50000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.policy_versions(
 id,organization_id,policy_id,version_no,legal_status,automation_status,
 effective_from,readiness_percent,approved_by_user_id,created_by_user_id
) values (
 '50000000-0000-0000-0000-000000000061','50000000-0000-0000-0000-000000000001',
 '50000000-0000-0000-0000-000000000051',1,'draft','ready',
 current_date,100,'50000000-0000-0000-0000-000000000011','50000000-0000-0000-0000-000000000011'
);
insert into qarar_governance.policy_items(
 id,organization_id,policy_version_id,item_code,title_ar,sort_order
) values (
 '50000000-0000-0000-0000-000000000071','50000000-0000-0000-0000-000000000001',
 '50000000-0000-0000-0000-000000000061','1.1','Department approval',1
);
insert into qarar_governance.policy_scope_assignments(
 id,organization_id,policy_version_id,scope_type,governance_class_id,
 priority,created_by_user_id
) values (
 '50000000-0000-0000-0000-000000000081','50000000-0000-0000-0000-000000000001',
 '50000000-0000-0000-0000-000000000061','governance_class',
 '50000000-0000-0000-0000-000000000031',50,'50000000-0000-0000-0000-000000000011'
);

select lives_ok(
  $$insert into qarar_governance.policy_item_scope_overrides(
    organization_id,policy_item_id,scope_assignment_id,governance_unit_id,
    is_included,reason,created_by_user_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000071',
    '50000000-0000-0000-0000-000000000081',
    '50000000-0000-0000-0000-000000000041',
    false,'Explicit council exclusion',
    '50000000-0000-0000-0000-000000000011'
  )$$,
  'a unit can be explicitly excluded from a broad policy scope'
);
select throws_ok(
  $$insert into qarar_governance.policy_scope_assignments(
    organization_id,policy_version_id,scope_type,governance_unit_id,
    priority,created_by_user_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000061',
    'governance_unit','50000000-0000-0000-0000-000000000042',100,
    '50000000-0000-0000-0000-000000000011'
  )$$,
  '23503',
  null,
  'cross-tenant policy scope is rejected'
);
select throws_ok(
  $$insert into qarar_governance.policy_scope_assignments(
    organization_id,policy_version_id,scope_type,governance_unit_id,
    priority,created_by_user_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000061',
    'organization','50000000-0000-0000-0000-000000000041',0,
    '50000000-0000-0000-0000-000000000011'
  )$$,
  '23514',
  null,
  'scope discriminator rejects incompatible target fields'
);
update qarar_governance.policy_versions
set legal_status='effective'
where id='50000000-0000-0000-0000-000000000061';
select throws_ok(
  $$insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,legal_status,automation_status,
    effective_from,effective_to,readiness_percent,approved_by_user_id,created_by_user_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000051',2,'effective','ready',
    current_date,current_date+10,100,
    '50000000-0000-0000-0000-000000000011',
    '50000000-0000-0000-0000-000000000011'
  )$$,
  '23P01',
  null,
  'overlapping effective versions are rejected'
);
select throws_ok(
  $$insert into qarar_governance.policy_versions(
    organization_id,policy_id,version_no,legal_status,automation_status,
    effective_from,readiness_percent,approved_by_user_id,created_by_user_id
  ) values (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000051',3,'effective','ready',
    current_date+20,90,
    '50000000-0000-0000-0000-000000000011',
    '50000000-0000-0000-0000-000000000011'
  )$$,
  '23514',
  null,
  'ready automation requires one hundred percent readiness'
);
select ok(
  has_table_privilege(
    'qarar_governance_executor',
    'qarar_core.governance_units',
    'select'
  ),
  'governance executor receives reviewed unit read dependency'
);
select ok(
  not has_table_privilege(
    'qarar_governance_executor',
    'qarar_meetings.meetings',
    'select'
  ),
  'governance executor has no undeclared meeting dependency'
);
select is(
  (select count(*)::integer
   from qarar_architecture.module_table_read_allowlist
   where source_module='governance'),
  7,
  'governance cross-module reads are explicitly allowlisted'
);
set local role qarar_iam_executor;
select is(
  (select count(distinct code)::integer
   from qarar_iam.permissions
   where module='governance'),
  8,
  'migration seeds the complete governance permission vocabulary'
);
reset role;
select is(
  (select governance_level
   from qarar_governance.governance_unit_classes
   where id='50000000-0000-0000-0000-000000000031'),
  'department',
  'governance class stores a precise council level'
);
select is(
  (select governance_class_id
   from qarar_core.governance_units
   where id='50000000-0000-0000-0000-000000000041'),
  '50000000-0000-0000-0000-000000000031'::uuid,
  'governance unit is classified for inherited policy scope'
);
select is(
  (select legal_status || ':' || automation_status
   from qarar_governance.policy_versions
   where id='50000000-0000-0000-0000-000000000061'),
  'effective:ready',
  'legal and technical states remain independent'
);
select is(
  (select count(*)::integer
   from qarar_governance.policy_items
   where policy_version_id='50000000-0000-0000-0000-000000000061'),
  1,
  'policy version supports auditable hierarchical items'
);

select * from finish();
rollback;
