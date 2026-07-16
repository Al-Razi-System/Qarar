begin;

create extension if not exists pgtap;

select plan(5);

-- Grant privileges to authenticated role so tests can run
grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;

-- Setup mock data
-- Org X
insert into public.organizations (id, code, name_ar, name_en) values ('33333333-3333-3333-3333-333333333333', 'org_x', 'Org X', 'Org X');

-- System Admin (Admin X)
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'adminx@orgx.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Admin X', 'adminx@orgx.com', true);

-- Regular User (User X)
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'userx@orgx.com');
insert into public.users (id, organization_id, full_name_ar, email, is_system_admin) values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'User X', 'userx@orgx.com', false);

-- Role Setup
insert into public.roles (id, organization_id, code, name_ar, role_scope) values ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 'council_member', 'Council Member', 'governance_unit');

-- Governance Unit
insert into public.governance_unit_types (id, organization_id, code, name_ar) values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'committee', 'Committee');
insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar) values ('88888888-8888-8888-8888-888888888888', '33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'U-01', 'Unit 1');

-- Membership for User X as council_member
insert into public.memberships (organization_id, user_id, governance_unit_id, role_id) values ('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666');

-- Switch to Regular User X
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "55555555-5555-5555-5555-555555555555"}';

-- Test 1: RBAC `is_system_admin()` correctly returns false for regular user
select ok(
  not public.is_system_admin(),
  'Regular user should not be identified as system admin'
);

-- Test 2: RBAC `has_role_code()` returns true for assigned membership
select ok(
  public.has_role_code(array['council_member']),
  'User X should have council_member role from active membership'
);

-- Test 3: Users RLS - regular users can only see themselves
select is_empty(
  $$ select * from public.users where id = '44444444-4444-4444-4444-444444444444' $$,
  'Regular user should NOT be able to see Admin X due to Users RLS'
);

-- Test 4: Governance Units RLS - regular users cannot insert units
select throws_ok(
  $$ insert into public.governance_units (organization_id, unit_type_id, code, name_ar) values ('33333333-3333-3333-3333-333333333333', '77777777-7777-7777-7777-777777777777', 'U-02', 'Unit 2') $$,
  'new row violates row-level security policy for table "governance_units"',
  'Regular user should NOT be able to create a governance unit'
);

-- Switch to Admin X
set local "request.jwt.claims" to '{"sub": "44444444-4444-4444-4444-444444444444"}';

-- Test 5: Users RLS - Admin X can see all users in org
select results_eq(
  $$ select id from public.users where organization_id = '33333333-3333-3333-3333-333333333333' order by id $$,
  $$ values ('44444444-4444-4444-4444-444444444444'::uuid), ('55555555-5555-5555-5555-555555555555'::uuid) $$,
  'Admin X should be able to see all users in the organization'
);

select * from finish();

rollback;
