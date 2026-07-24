begin;

create extension if not exists pgtap;

select plan(22);

grant all privileges on all tables in schema public to authenticated;
grant usage on schema public to authenticated;
grant all privileges on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into public.organizations (id, code, name_ar)
values ('10101010-1010-1010-1010-101010101010', 'iam_org', 'IAM Org');

insert into public.governance_unit_types (id, organization_id, code, name_ar)
values ('11111111-1111-1111-1111-111111111110', '10101010-1010-1010-1010-101010101010', 'committee', 'Committee');

insert into public.governance_units (id, organization_id, unit_type_id, code, name_ar)
values ('12121212-1212-1212-1212-121212121212', '10101010-1010-1010-1010-101010101010', '11111111-1111-1111-1111-111111111110', 'iam_unit', 'IAM Unit');

insert into auth.users (id, email)
values
  ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'admin@iam.test'),
  ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', 'member@iam.test'),
  ('cccccccc-1111-1111-1111-cccccccccccc', 'sso.user@iam.test'),
  ('dddddddd-1111-1111-1111-dddddddddddd', 'created@iam.test');

insert into public.users (id, organization_id, full_name_ar, email, is_system_admin)
values
  ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', '10101010-1010-1010-1010-101010101010', 'Admin', 'admin@iam.test', false),
  ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', '10101010-1010-1010-1010-101010101010', 'Member', 'member@iam.test', false);

insert into public.roles (id, organization_id, code, name_ar, role_scope)
values
  ('13131313-1313-1313-1313-131313131313', '10101010-1010-1010-1010-101010101010', 'governance_admin', 'Governance Admin', 'organization'),
  ('14141414-1414-1414-1414-141414141414', '10101010-1010-1010-1010-101010101010', 'council_member', 'Council Member', 'governance_unit');

insert into public.memberships (organization_id, user_id, governance_unit_id, role_id)
values
  ('10101010-1010-1010-1010-101010101010', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', '12121212-1212-1212-1212-121212121212', '13131313-1313-1313-1313-131313131313'),
  ('10101010-1010-1010-1010-101010101010', 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', '12121212-1212-1212-1212-121212121212', '14141414-1414-1414-1414-141414141414');

insert into public.permissions (organization_id, code, module, action, context_scope, name_ar)
values
  ('10101010-1010-1010-1010-101010101010', 'iam.users.read', 'iam', 'users.read', 'organization', 'Read users'),
  ('10101010-1010-1010-1010-101010101010', 'iam.users.manage', 'iam', 'users.manage', 'organization', 'Manage users'),
  ('10101010-1010-1010-1010-101010101010', 'iam.users.invite', 'iam', 'users.invite', 'organization', 'Invite users'),
  ('10101010-1010-1010-1010-101010101010', 'iam.roles.read', 'iam', 'roles.read', 'organization', 'Read roles'),
  ('10101010-1010-1010-1010-101010101010', 'iam.roles.manage', 'iam', 'roles.manage', 'organization', 'Manage roles'),
  ('10101010-1010-1010-1010-101010101010', 'iam.roles.assign', 'iam', 'roles.assign', 'governance_unit', 'Assign roles'),
  ('10101010-1010-1010-1010-101010101010', 'iam.roles.revoke', 'iam', 'roles.revoke', 'governance_unit', 'Revoke roles'),
  ('10101010-1010-1010-1010-101010101010', 'iam.permissions.read', 'iam', 'permissions.read', 'organization', 'Read permissions'),
  ('10101010-1010-1010-1010-101010101010', 'iam.permissions.manage', 'iam', 'permissions.manage', 'organization', 'Manage permissions'),
  ('10101010-1010-1010-1010-101010101010', 'iam.sso.read', 'iam', 'sso.read', 'organization', 'Read SSO'),
  ('10101010-1010-1010-1010-101010101010', 'iam.sso.manage', 'iam', 'sso.manage', 'organization', 'Manage SSO');

insert into public.role_permissions (organization_id, role_id, permission_id)
select '10101010-1010-1010-1010-101010101010', '13131313-1313-1313-1313-131313131313', id
from public.permissions
where organization_id = '10101010-1010-1010-1010-101010101010';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa", "email": "admin@iam.test"}';

select ok(
  api_v1.has_permission('iam.users.manage'),
  'governance_admin receives IAM permissions from role_permissions'
);

select ok(
  api_v1.get_current_user_access_context() -> 'permissions' ? 'iam.sso.manage',
  'access context exposes effective permissions to clients'
);

select lives_ok(
  $$ select api_v1.admin_create_user_profile('dddddddd-1111-1111-1111-dddddddddddd', 'created@iam.test', 'Created User') $$,
  'authorized admin can create an application user profile through RPC'
);

select is(
  (select status from public.users where id = 'dddddddd-1111-1111-1111-dddddddddddd'),
  'active',
  'created user profile is active'
);

select ok(
  exists (select 1 from public.audit_logs where action = 'iam.user.create' and entity_id = 'dddddddd-1111-1111-1111-dddddddddddd'),
  'user creation is written to audit logs'
);

select is(
  (api_v1.admin_search_users('created', 'active', null, null, 20, 0) ->> 'total')::int,
  1,
  'admin user search supports query and status filters'
);

select is(
  api_v1.admin_get_user_detail('dddddddd-1111-1111-1111-dddddddddddd') ->> 'email',
  'created@iam.test',
  'admin can load full user detail for the edit screen'
);

select lives_ok(
  $$ select api_v1.admin_update_user_profile('dddddddd-1111-1111-1111-dddddddddddd', 'Updated User', null, 'EMP-9', null, 'Coordinator') $$,
  'admin can update editable user profile fields'
);

select is(
  (select job_title from public.users where id = 'dddddddd-1111-1111-1111-dddddddddddd'),
  'Coordinator',
  'user profile update persists to users table'
);

select lives_ok(
  $$ select api_v1.admin_upsert_permission('topics.review', 'topics', 'review', 'governance_unit', 'Review topics') $$,
  'admin can create a custom permission'
);

select ok(
  api_v1.admin_list_permissions('topics', true) @> '[{"code":"topics.review"}]'::jsonb,
  'permission list supports module filtering'
);

create temporary table iam_test_state(role_id uuid) on commit drop;

insert into iam_test_state(role_id)
select api_v1.admin_upsert_role(null, 'topic_reviewer', 'Topic Reviewer', 'Topic Reviewer', 'Reviews topics', 'governance_unit', true);

select throws_ok(
  $$ select qarar_iam.admin_set_role_permissions((select role_id from iam_test_state), array['topics.review']) $$,
  '42501',
  'permission denied for function admin_set_role_permissions',
  'direct role permission replacement is closed'
);

select ok(
  api_v1.admin_get_role_detail((select role_id from iam_test_state)) -> 'permissions' = '[]'::jsonb,
  'new roles remain unprivileged until the four-eyes workflow approves changes'
);

set local "request.jwt.claims" to '{"sub": "bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb", "email": "member@iam.test"}';

select is(
  api_v1.get_my_account() ->> 'email',
  'member@iam.test',
  'regular user can load their own account'
);

select lives_ok(
  $$ select api_v1.update_my_profile('Member Updated', null, '0500000000', 'Analyst') $$,
  'regular user can update their own profile fields'
);

select is(
  (select mobile from public.users where id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb'),
  '0500000000',
  'self profile update persists to users table'
);

select is(
  api_v1.update_my_preferences('ar-SA', 'Asia/Riyadh', '{"email": true}'::jsonb, '{"density": "compact"}'::jsonb) ->> 'timezone',
  'Asia/Riyadh',
  'regular user can update their own preferences'
);

select ok(
  not api_v1.has_permission('iam.users.manage'),
  'regular member has no IAM management permission'
);

select throws_ok(
  $$ select api_v1.admin_update_user_profile('dddddddd-1111-1111-1111-dddddddddddd', 'Blocked Update', null, null, null, null) $$,
  '42501',
  'permission denied: iam.users.manage',
  'regular member cannot manage users through RPC'
);

set local "request.jwt.claims" to '{"sub": "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa", "email": "admin@iam.test"}';

select lives_ok(
  $$ select api_v1.admin_create_invitation('sso.user@iam.test', 'SSO User', '14141414-1414-1414-1414-141414141414', '12121212-1212-1212-1212-121212121212') $$,
  'authorized admin can create an SSO invitation'
);

select is(
  api_v1.admin_upsert_sso_provider(
    'IAM Test SAML',
    '15151515-1515-1515-1515-151515151515',
    'https://idp.iam.test/metadata',
    'https://idp.iam.test/entity',
    '{}'::jsonb,
    '14141414-1414-1414-1414-141414141414',
    '12121212-1212-1212-1212-121212121212',
    'invited_only',
    'active'
  ) is not null,
  true,
  'authorized admin can register a governed Supabase SSO provider mapping'
);

select api_v1.admin_upsert_sso_domain(
  (select id from public.sso_identity_providers where provider_name = 'IAM Test SAML'),
  'iam.test',
  true
);

set local "request.jwt.claims" to '{"sub": "cccccccc-1111-1111-1111-cccccccccccc", "email": "sso.user@iam.test", "sso_provider_id": "15151515-1515-1515-1515-151515151515"}';

select is(
  api_v1.register_current_sso_login('SSO User'),
  'cccccccc-1111-1111-1111-cccccccccccc'::uuid,
  'invited SSO user is provisioned and linked to the organization'
);

select * from finish();

rollback;
