begin;

create extension if not exists pgtap;
select plan(20);

select ok(
  not has_function_privilege(
    'anon',
    'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot call the initial-administrator bootstrap API'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot call the initial-administrator bootstrap API'
);

select ok(
  has_function_privilege(
    'service_role',
    'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'only the controlled service caller can reach the bootstrap API facade'
);

select ok(
  not has_function_privilege(
    'service_role',
    'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service role cannot bypass the reviewed API facade to call the internal routine directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute the internal bootstrap routine directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot execute the internal bootstrap routine directly'
);

select ok(
  has_function_privilege(
    'qarar_api_executor',
    'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'the API executor has the narrow internal implementation grant'
);

select is(
  (
    select audience
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name = 'service_bootstrap_organization_admin'
  ),
  'service_role',
  'bootstrap contract registry audience is service_role'
);

select is(
  (
    select pg_get_userbyid(p.proowner)::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'qarar_iam'
      and p.proname = 'service_bootstrap_organization_admin'
  ),
  'qarar_iam_executor',
  'the internal bootstrap routine uses the constrained IAM executor'
);

select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef(
    'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)'::regprocedure
  )) > 0,
  'the internal bootstrap routine serializes competing requests per organization'
);

insert into qarar_core.organizations(id, code, name_ar, status)
values
  ('39000000-0000-4000-8000-000000000001', 'bootstrap_test', 'Bootstrap Test', 'active'),
  ('39000000-0000-4000-8000-000000000002', 'bootstrap_unconfirmed', 'Bootstrap Unconfirmed', 'active'),
  ('39000000-0000-4000-8000-000000000003', 'bootstrap_mismatch', 'Bootstrap Mismatch', 'active'),
  ('39000000-0000-4000-8000-000000000004', 'bootstrap_existing_profile', 'Bootstrap Existing Profile', 'active'),
  ('39000000-0000-4000-8000-000000000005', 'bootstrap_inactive', 'Bootstrap Inactive', 'inactive');

insert into auth.users(id, email)
values
  ('39000000-0000-4000-8000-000000000101', 'first-admin@bootstrap.test'),
  ('39000000-0000-4000-8000-000000000102', 'second-admin@bootstrap.test'),
  ('39000000-0000-4000-8000-000000000103', 'unconfirmed@bootstrap.test'),
  ('39000000-0000-4000-8000-000000000104', 'actual@bootstrap.test'),
  ('39000000-0000-4000-8000-000000000105', 'existing-profile@bootstrap.test'),
  ('39000000-0000-4000-8000-000000000106', 'inactive-org@bootstrap.test');

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email_confirmed_at') then
    execute $q$update auth.users set email_confirmed_at=clock_timestamp()
      where id in ('39000000-0000-4000-8000-000000000101','39000000-0000-4000-8000-000000000102','39000000-0000-4000-8000-000000000104','39000000-0000-4000-8000-000000000105','39000000-0000-4000-8000-000000000106')$q$;
  else
    update auth.users set confirmed_at=clock_timestamp()
      where id in ('39000000-0000-4000-8000-000000000101','39000000-0000-4000-8000-000000000102','39000000-0000-4000-8000-000000000104','39000000-0000-4000-8000-000000000105','39000000-0000-4000-8000-000000000106');
  end if;
end $$;

insert into qarar_iam.users(id, organization_id, full_name_ar, email)
values (
  '39000000-0000-4000-8000-000000000105',
  '39000000-0000-4000-8000-000000000004',
  'Existing Profile',
  'existing-profile@bootstrap.test'
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select lives_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000101',
    'bootstrap_test',
    'FIRST-ADMIN@BOOTSTRAP.TEST',
    'المدير الأول',
    'First Administrator',
    'EMP-001',
    '+966500000000',
    'Platform Administrator',
    'CHG-20260816-001'
  )$$,
  'a confirmed matching Auth user can bootstrap the only profile in an active organization'
);

reset role;

select ok(
  exists (
    select 1
    from qarar_iam.users
    where id = '39000000-0000-4000-8000-000000000101'
      and organization_id = '39000000-0000-4000-8000-000000000001'
      and status = 'active'
      and is_system_admin
  ),
  'the successful bootstrap creates one active system administrator in the requested organization'
);

select is(
  (
    select count(*)::integer
    from qarar_iam.users
    where organization_id = '39000000-0000-4000-8000-000000000001'
  ),
  1,
  'the bootstrap organization contains exactly one profile after the first operation'
);

select ok(
  exists (
    select 1
    from qarar_audit.audit_logs
    where organization_id = '39000000-0000-4000-8000-000000000001'
      and action = 'iam.bootstrap.admin.requested'
      and entity_id = '39000000-0000-4000-8000-000000000101'
      and metadata ->> 'approval_reference' = 'CHG-20260816-001'
  ),
  'the bootstrap request has an approval-bound audit event before privilege creation'
);

select ok(
  exists (
    select 1
    from qarar_audit.audit_logs
    where organization_id = '39000000-0000-4000-8000-000000000001'
      and action = 'iam.bootstrap.admin.completed'
      and entity_id = '39000000-0000-4000-8000-000000000101'
      and metadata ->> 'approval_reference' = 'CHG-20260816-001'
      and metadata ->> 'is_system_admin' = 'true'
  ),
  'the successful bootstrap has a separate completion audit event'
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select throws_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000102',
    'bootstrap_test',
    'second-admin@bootstrap.test',
    'مدير ثان',
    null, null, null, null,
    'CHG-20260816-002'
  )$$,
  '23505',
  'organization bootstrap is already completed',
  'a second profile cannot use the bootstrap path after any profile exists in the organization'
);

select throws_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000103',
    'bootstrap_unconfirmed',
    'unconfirmed@bootstrap.test',
    'مدير غير مؤكد',
    null, null, null, null,
    'CHG-20260816-003'
  )$$,
  '42501',
  'Auth user email must be confirmed before bootstrap',
  'an unconfirmed Auth identity cannot receive the initial administrator privilege'
);

select throws_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000104',
    'bootstrap_mismatch',
    'wrong@bootstrap.test',
    'مدير بريد خاطئ',
    null, null, null, null,
    'CHG-20260816-004'
  )$$,
  '22023',
  'Auth user email does not match approved bootstrap email',
  'the requested email must exactly match the pre-provisioned Auth identity'
);

select throws_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000105',
    'bootstrap_existing_profile',
    'existing-profile@bootstrap.test',
    'مدير له ملف',
    null, null, null, null,
    'CHG-20260816-005'
  )$$,
  '23505',
  'Auth user already has an application profile',
  'an Auth identity with a profile in any organization cannot be rebound through bootstrap'
);

select throws_ok(
  $$select api_v1.service_bootstrap_organization_admin(
    '39000000-0000-4000-8000-000000000106',
    'bootstrap_inactive',
    'inactive-org@bootstrap.test',
    'مدير مؤسسة غير نشطة',
    null, null, null, null,
    'CHG-20260816-006'
  )$$,
  'P0002',
  'active organization not found for bootstrap',
  'the bootstrap path fails closed for an inactive organization'
);

reset role;

select * from finish();
rollback;
