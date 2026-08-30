begin;

create extension if not exists pgtap;
select plan(11);

insert into public.organizations (id, code, name_ar)
values ('34343434-0000-0000-0000-000000000000', 'sso_verify', 'SSO verification test');

insert into auth.users (id, email)
values
  ('34343434-0000-0000-0000-000000000001', 'admin@sso-verify.test'),
  ('34343434-0000-0000-0000-000000000002', 'member@sso-verify.test');

insert into public.users (id, organization_id, full_name_ar, email, is_system_admin)
values (
  '34343434-0000-0000-0000-000000000001',
  '34343434-0000-0000-0000-000000000000',
  'SSO Admin',
  'admin@sso-verify.test',
  true
);

insert into public.sso_identity_providers (
  id,
  organization_id,
  provider_type,
  provider_name,
  supabase_sso_provider_id,
  provisioning_mode,
  status
)
values (
  '34343434-0000-0000-0000-000000000003',
  '34343434-0000-0000-0000-000000000000',
  'saml',
  'SSO Verification Provider',
  '34343434-0000-0000-0000-000000000004',
  'jit',
  'active'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"34343434-0000-0000-0000-000000000001","email":"admin@sso-verify.test"}';
set local "request.jwt.claim.sub" to '34343434-0000-0000-0000-000000000001';
set local "request.jwt.claim.role" to 'authenticated';

select throws_ok(
  $$ select api_v1.admin_upsert_sso_domain(
    '34343434-0000-0000-0000-000000000003',
    'sso-verify.test',
    true
  ) $$,
  '42501',
  'SSO domain verification must be completed by the trusted verification service',
  'an IAM client cannot self-attest SSO domain verification'
);

select lives_ok(
  $$ select api_v1.admin_upsert_sso_domain(
    '34343434-0000-0000-0000-000000000003',
    'sso-verify.test',
    false
  ) $$,
  'an IAM client can register an SSO domain only as pending'
);

reset role;

select is(
  (select verified_at is null from public.sso_domains where domain = 'sso-verify.test'),
  true,
  'a client-registered SSO domain has no verification timestamp'
);

select is(
  (select status from public.sso_domains where domain = 'sso-verify.test'),
  'disabled',
  'a client-registered SSO domain remains disabled pending verification'
);

select ok(
  not has_table_privilege('authenticated', 'public.sso_domains', 'INSERT'),
  'authenticated clients cannot insert directly through the legacy SSO-domain view'
);

select ok(
  not has_table_privilege('authenticated', 'public.sso_domains', 'UPDATE'),
  'authenticated clients cannot set verified_at through the legacy SSO-domain view'
);

select ok(
  not has_table_privilege('authenticated', 'qarar_iam.sso_domains', 'UPDATE'),
  'authenticated clients cannot set verified_at on the physical SSO-domain table'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"34343434-0000-0000-0000-000000000002","email":"member@sso-verify.test","sso_provider_id":"34343434-0000-0000-0000-000000000004"}';
set local "request.jwt.claim.sub" to '34343434-0000-0000-0000-000000000002';
set local "request.jwt.claim.role" to 'authenticated';

select throws_ok(
  $$ select api_v1.register_current_sso_login('Unverified SSO member') $$,
  '42501',
  'email domain is not verified for this SSO provider',
  'SSO login rejects a matching but unverified email domain'
);

reset role;
set local "request.jwt.claims" to '{}';
set local "request.jwt.claim.sub" to '';
set local "request.jwt.claim.role" to '';

select throws_like(
  $$ update qarar_iam.sso_domains
     set status = 'active'
   where domain = 'sso-verify.test' $$,
  '%sso_domains_active_requires_verification%',
  'the database constraint rejects activation without verified_at'
);

update qarar_iam.sso_domains
set verified_at = now(),
    status = 'active'
where domain = 'sso-verify.test';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"34343434-0000-0000-0000-000000000002","email":"member@sso-verify.test","sso_provider_id":"34343434-0000-0000-0000-000000000004"}';
set local "request.jwt.claim.sub" to '34343434-0000-0000-0000-000000000002';
set local "request.jwt.claim.role" to 'authenticated';

select is(
  api_v1.register_current_sso_login('Verified SSO member'),
  '34343434-0000-0000-0000-000000000002'::uuid,
  'SSO login succeeds after trusted verification marks the domain active'
);

reset role;

select ok(
  exists (
    select 1
    from public.audit_logs
    where organization_id = '34343434-0000-0000-0000-000000000000'
      and action = 'sso_domains.insert'
      and metadata -> 'new' ->> 'status' = 'disabled'
  ),
  'pending domain registration is written to the audit trail'
);

select * from finish();
rollback;
