begin;
create extension if not exists pgtap;
select plan(17);

select has_function('api_v1','admin_search_council_types',
  array['text','boolean','integer','integer'],
  'council type search is exposed through api_v1');
select has_function('api_v1','admin_create_council_type',
  array['text','text','text','text'],
  'council type creation is exposed through api_v1');
select has_function('api_v1','admin_update_council_type',
  array['uuid','text','text','text','timestamp with time zone'],
  'council type update is exposed through api_v1');
select has_function('api_v1','admin_deactivate_council_type',
  array['uuid','timestamp with time zone'],
  'council type deactivation is exposed through api_v1');

select is(
  (select count(*)::integer
   from qarar_architecture.api_contract_registry
   where api_version='v1'
     and contract_name like 'admin_%council_type%'),
  4,
  'all council type contracts are registered'
);
select ok(
  has_function_privilege(
    'authenticated',
    'api_v1.admin_create_council_type(text,text,text,text)',
    'execute'
  ),
  'authenticated clients execute only the versioned creation contract'
);
select ok(
  not has_function_privilege(
    'anon',
    'api_v1.admin_create_council_type(text,text,text,text)',
    'execute'
  ),
  'anonymous clients cannot create council types'
);

insert into qarar_core.organizations(id,code,name_ar)
values('54000000-0000-0000-0000-000000000001','council-types-a','Council Types A');
insert into qarar_core.organizations(id,code,name_ar)
values('54000000-0000-0000-0000-000000000002','council-types-b','Council Types B');
insert into auth.users(id,email)
values('54000000-0000-0000-0000-000000000011','council-types-admin@test.local');
insert into qarar_iam.users(
  id,organization_id,email,full_name_ar,is_system_admin
) values(
  '54000000-0000-0000-0000-000000000011',
  '54000000-0000-0000-0000-000000000001',
  'council-types-admin@test.local','Council Types Admin',true
);
select set_config(
  'request.jwt.claim.sub',
  '54000000-0000-0000-0000-000000000011',
  true
);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select api_v1.admin_create_council_type(
    'technical_council','المجلس التقني','Technical Council','نوع تجريبي'
  )$$,
  'an authorized administrator creates a tenant council type'
);
select ok(
  (select is_council_type and is_active and not is_system
   from qarar_core.governance_unit_types
   where organization_id='54000000-0000-0000-0000-000000000001'
     and code='technical_council'),
  'created type is active, council-compatible, and non-system'
);
select is(
  (select count(*)::integer from qarar_audit.audit_logs
   where organization_id='54000000-0000-0000-0000-000000000001'
     and action='council.type.created'),
  1,
  'creation emits one atomic audit event'
);

select lives_ok(
  $$select api_v1.admin_update_council_type(
    (select id from qarar_core.governance_unit_types
      where organization_id='54000000-0000-0000-0000-000000000001'
        and code='technical_council'),
    'المجلس التقني المحدث','Updated Technical Council','وصف محدث',
    (select updated_at from qarar_core.governance_unit_types
      where organization_id='54000000-0000-0000-0000-000000000001'
        and code='technical_council')
  )$$,
  'type updates honor the current optimistic-concurrency token'
);
select throws_ok(
  $$select api_v1.admin_update_council_type(
    (select id from qarar_core.governance_unit_types
      where organization_id='54000000-0000-0000-0000-000000000001'
        and code='technical_council'),
    'قديم','Stale','Stale','2000-01-01'::timestamptz
  )$$,
  '40001', null,
  'stale updates are rejected'
);

insert into qarar_core.governance_unit_types(
  id,organization_id,code,name_ar,is_council_type,is_system
) values(
  '54000000-0000-0000-0000-000000000021',
  '54000000-0000-0000-0000-000000000001',
  'system_council','System Council',true,true
);
select throws_ok(
  $$select api_v1.admin_deactivate_council_type(
    '54000000-0000-0000-0000-000000000021',
    (select updated_at from qarar_core.governance_unit_types
     where id='54000000-0000-0000-0000-000000000021')
  )$$,
  '42501', null,
  'system council types cannot be deactivated'
);

insert into qarar_core.governance_unit_types(
  id,organization_id,code,name_ar,is_council_type
) values(
  '54000000-0000-0000-0000-000000000022',
  '54000000-0000-0000-0000-000000000001',
  'used_council','Used Council',true
);
insert into qarar_core.governance_units(
  organization_id,unit_type_id,code,name_ar
) values(
  '54000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000022',
  'used-unit','Used Unit'
);
select throws_ok(
  $$select api_v1.admin_deactivate_council_type(
    '54000000-0000-0000-0000-000000000022',
    (select updated_at from qarar_core.governance_unit_types
     where id='54000000-0000-0000-0000-000000000022')
  )$$,
  '23503', null,
  'a council type referenced by a council cannot be deactivated'
);

insert into qarar_core.governance_unit_types(
  organization_id,code,name_ar,is_council_type
) values(
  '54000000-0000-0000-0000-000000000002',
  'other_tenant_council','Other Tenant Council',true
);
select is(
  (api_v1.admin_search_council_types(null,null,100,0)->>'total')::integer,
  3,
  'search is tenant-isolated and includes only council-compatible types'
);

select lives_ok(
  $$select api_v1.admin_deactivate_council_type(
    (select id from qarar_core.governance_unit_types
      where organization_id='54000000-0000-0000-0000-000000000001'
        and code='technical_council'),
    (select updated_at from qarar_core.governance_unit_types
      where organization_id='54000000-0000-0000-0000-000000000001'
        and code='technical_council')
  )$$,
  'an unused custom council type can be deactivated'
);
select is(
  (select count(*)::integer from qarar_audit.audit_logs
   where organization_id='54000000-0000-0000-0000-000000000001'
     and action in(
       'council.type.created',
       'council.type.updated',
       'council.type.deactivated'
     )),
  3,
  'successful council type mutations emit the required audit events'
);

select * from finish();
rollback;
