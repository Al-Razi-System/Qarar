begin;

create extension if not exists pgtap;
select plan(19);

insert into qarar_core.organizations(id, code, name_ar)
values ('35000000-0000-0000-0000-000000000001', 'iam_guardrails', 'IAM Guardrails');

insert into qarar_core.organizations(id, code, name_ar)
values ('35000000-0000-0000-0000-000000000002', 'iam_guardrails_destination', 'IAM Guardrails Destination');

insert into qarar_core.governance_unit_types(id, organization_id, code, name_ar)
values (
  '35000000-0000-0000-0000-000000000011',
  '35000000-0000-0000-0000-000000000001',
  'office',
  'Office'
);

insert into qarar_core.governance_units(id, organization_id, unit_type_id, code, name_ar)
values (
  '35000000-0000-0000-0000-000000000021',
  '35000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000011',
  'iam_guardrails_hq',
  'IAM Guardrails HQ'
);

insert into auth.users(id, email)
values
  ('35000000-0000-0000-0000-000000000101', 'system-a@iam-guardrails.test'),
  ('35000000-0000-0000-0000-000000000102', 'system-b@iam-guardrails.test'),
  ('35000000-0000-0000-0000-000000000103', 'delegated-manager@iam-guardrails.test'),
  ('35000000-0000-0000-0000-000000000104', 'recipient@iam-guardrails.test');

insert into qarar_iam.users(id, organization_id, full_name_ar, email, is_system_admin)
values
  ('35000000-0000-0000-0000-000000000101', '35000000-0000-0000-0000-000000000001', 'System A', 'system-a@iam-guardrails.test', true),
  ('35000000-0000-0000-0000-000000000102', '35000000-0000-0000-0000-000000000001', 'System B', 'system-b@iam-guardrails.test', true),
  ('35000000-0000-0000-0000-000000000103', '35000000-0000-0000-0000-000000000001', 'Delegated Manager', 'delegated-manager@iam-guardrails.test', false),
  ('35000000-0000-0000-0000-000000000104', '35000000-0000-0000-0000-000000000001', 'Recipient', 'recipient@iam-guardrails.test', false);

insert into qarar_iam.roles(id, organization_id, code, name_ar, role_scope)
values
  ('35000000-0000-0000-0000-000000000201', '35000000-0000-0000-0000-000000000001', 'guardrails_delegated_manager', 'Delegated manager', 'governance_unit'),
  ('35000000-0000-0000-0000-000000000202', '35000000-0000-0000-0000-000000000001', 'guardrails_unit_reviewer', 'Unit reviewer', 'governance_unit'),
  ('35000000-0000-0000-0000-000000000203', '35000000-0000-0000-0000-000000000001', 'guardrails_organization_officer', 'Organization officer', 'organization'),
  ('35000000-0000-0000-0000-000000000204', '35000000-0000-0000-0000-000000000001', 'guardrails_system_officer', 'System officer', 'system'),
  ('35000000-0000-0000-0000-000000000205', '35000000-0000-0000-0000-000000000001', 'guardrails_user_manager', 'User manager', 'organization');

insert into qarar_iam.permissions(id, organization_id, code, module, action, context_scope, name_ar)
values
  ('35000000-0000-0000-0000-000000000301', '35000000-0000-0000-0000-000000000001', 'iam.roles.assign', 'iam', 'roles.assign', 'governance_unit', 'Assign roles'),
  ('35000000-0000-0000-0000-000000000302', '35000000-0000-0000-0000-000000000001', 'iam.roles.revoke', 'iam', 'roles.revoke', 'governance_unit', 'Revoke roles'),
  ('35000000-0000-0000-0000-000000000303', '35000000-0000-0000-0000-000000000001', 'iam.users.manage', 'iam', 'users.manage', 'organization', 'Manage users');

insert into qarar_iam.role_permissions(organization_id, role_id, permission_id)
values
  ('35000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000201', '35000000-0000-0000-0000-000000000301'),
  ('35000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000201', '35000000-0000-0000-0000-000000000302'),
  ('35000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000205', '35000000-0000-0000-0000-000000000303');

insert into qarar_iam.memberships(organization_id, user_id, governance_unit_id, role_id)
values
  (
    '35000000-0000-0000-0000-000000000001',
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000021',
    '35000000-0000-0000-0000-000000000201'
  ),
  (
    '35000000-0000-0000-0000-000000000001',
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000021',
    '35000000-0000-0000-0000-000000000205'
  );

create temporary table iam_guardrails_state(
  organization_membership_id uuid,
  system_membership_id uuid
) on commit drop;
grant select, insert, update, delete on iam_guardrails_state to authenticated;

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"35000000-0000-0000-0000-000000000103","email":"delegated-manager@iam-guardrails.test"}';
set local "request.jwt.claim.sub" to '35000000-0000-0000-0000-000000000103';

select throws_ok(
  $$select api_v1.admin_assign_role(
    '35000000-0000-0000-0000-000000000104',
    '35000000-0000-0000-0000-000000000203',
    '35000000-0000-0000-0000-000000000021',
    null,
    current_date,
    null
  )$$,
  '42501',
  'only a system administrator may assign organization or system roles',
  'a delegated unit manager cannot assign an organization-scoped role'
);

select throws_ok(
  $$select api_v1.admin_assign_role(
    '35000000-0000-0000-0000-000000000104',
    '35000000-0000-0000-0000-000000000204',
    '35000000-0000-0000-0000-000000000021',
    null,
    current_date,
    null
  )$$,
  '42501',
  'only a system administrator may assign organization or system roles',
  'a delegated unit manager cannot assign a system-scoped role'
);

select lives_ok(
  $$select api_v1.admin_assign_role(
    '35000000-0000-0000-0000-000000000104',
    '35000000-0000-0000-0000-000000000202',
    '35000000-0000-0000-0000-000000000021',
    null,
    current_date,
    null
  )$$,
  'a delegated unit manager can still assign a governance-unit role in the authorized unit'
);

set local "request.jwt.claims" to '{"sub":"35000000-0000-0000-0000-000000000101","email":"system-a@iam-guardrails.test"}';
set local "request.jwt.claim.sub" to '35000000-0000-0000-0000-000000000101';

insert into iam_guardrails_state(organization_membership_id)
select api_v1.admin_assign_role(
  '35000000-0000-0000-0000-000000000104',
  '35000000-0000-0000-0000-000000000203',
  '35000000-0000-0000-0000-000000000021',
  null,
  current_date,
  null
);

update iam_guardrails_state
set system_membership_id = api_v1.admin_assign_role(
  '35000000-0000-0000-0000-000000000104',
  '35000000-0000-0000-0000-000000000204',
  '35000000-0000-0000-0000-000000000021',
  null,
  current_date,
  null
);

select ok(
  (select organization_membership_id is not null from iam_guardrails_state),
  'a system administrator can assign an organization-scoped role'
);

select ok(
  (select system_membership_id is not null from iam_guardrails_state),
  'a system administrator can assign a system-scoped role'
);

set local "request.jwt.claims" to '{"sub":"35000000-0000-0000-0000-000000000103","email":"delegated-manager@iam-guardrails.test"}';
set local "request.jwt.claim.sub" to '35000000-0000-0000-0000-000000000103';

select throws_ok(
  $$select api_v1.admin_revoke_membership(
    (select organization_membership_id from iam_guardrails_state),
    'test guardrail'
  )$$,
  '42501',
  'only a system administrator may revoke organization or system roles',
  'a delegated unit manager cannot revoke an organization-scoped membership'
);

select throws_ok(
  $$select api_v1.admin_revoke_membership(
    (select system_membership_id from iam_guardrails_state),
    'test guardrail'
  )$$,
  '42501',
  'only a system administrator may revoke organization or system roles',
  'a delegated unit manager cannot revoke a system-scoped membership'
);

reset role;
-- Exercise the implementation guard as its owning module role. The API
-- executor intentionally has no direct EXECUTE after default-deny containment.
set local role qarar_iam_executor;
set local "request.jwt.claims" to '{"sub":"35000000-0000-0000-0000-000000000103","email":"delegated-manager@iam-guardrails.test"}';
set local "request.jwt.claim.sub" to '35000000-0000-0000-0000-000000000103';

select throws_ok(
  $$select qarar_iam.admin_update_user_status(
    '35000000-0000-0000-0000-000000000102',
    'suspended',
    'test guardrail'
  )$$,
  '42501',
  'only a system administrator may deactivate another system administrator',
  'the internal status command cannot let a delegated manager disable a system administrator'
);

reset role;

insert into auth.sessions(id, user_id, created_at, updated_at)
values (
  '35000000-0000-0000-0000-000000000401',
  '35000000-0000-0000-0000-000000000102',
  now(),
  now()
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select throws_ok(
  $$select api_v1.service_apply_user_status(
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000102',
    'suspended',
    'test guardrail'
  )$$,
  '42501',
  'only a system administrator may deactivate another system administrator',
  'the service status path cannot let a delegated manager disable a system administrator'
);

reset role;

select is(
  (select status from qarar_iam.users where id = '35000000-0000-0000-0000-000000000102'),
  'active',
  'the protected system administrator remains active after rejected status changes'
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select throws_ok(
  $$select api_v1.service_revoke_auth_sessions(
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000102',
    '35000000-0000-0000-0000-000000000401',
    'test guardrail'
  )$$,
  '42501',
  'only a system administrator may revoke another system administrator''s sessions',
  'the session-revocation path cannot let a delegated manager lock out a system administrator'
);

reset role;

select ok(
  exists (
    select 1
    from auth.sessions
    where id = '35000000-0000-0000-0000-000000000401'
      and user_id = '35000000-0000-0000-0000-000000000102'
  ),
  'the protected system administrator auth session remains after the rejected request'
);

set local role service_role;
set local "request.jwt.claims" to '{"role":"service_role"}';

select is(
  api_v1.service_revoke_auth_sessions(
    '35000000-0000-0000-0000-000000000101',
    '35000000-0000-0000-0000-000000000102',
    '35000000-0000-0000-0000-000000000401',
    'approved security response'
  ),
  1,
  'a system administrator can revoke another system administrator session while another active system administrator remains'
);

select is(
  (
    api_v1.service_apply_user_status(
      '35000000-0000-0000-0000-000000000101',
      '35000000-0000-0000-0000-000000000102',
      'suspended',
      'approved security response'
    )->>'status'
  ),
  'suspended',
  'one system administrator can suspend another while another active system administrator remains'
);

reset role;

select throws_ok(
  $$update qarar_iam.users
    set status = 'suspended'
    where id = '35000000-0000-0000-0000-000000000101'$$,
  '23514',
  'at least one active system administrator is required',
  'the data boundary prevents disabling the final active system administrator'
);

select throws_ok(
  $$update qarar_iam.users
    set is_system_admin = false
    where id = '35000000-0000-0000-0000-000000000101'$$,
  '23514',
  'at least one active system administrator is required',
  'the data boundary prevents demoting the final active system administrator'
);

select throws_ok(
  $$delete from qarar_iam.users
    where id = '35000000-0000-0000-0000-000000000101'$$,
  '23514',
  'at least one active system administrator is required',
  'the data boundary prevents deleting the final active system administrator'
);

select throws_ok(
  $$update qarar_iam.users
    set organization_id = '35000000-0000-0000-0000-000000000002'
    where id = '35000000-0000-0000-0000-000000000101'$$,
  '23514',
  'at least one active system administrator is required',
  'the data boundary prevents moving the final active system administrator out of its organization'
);

select ok(
  exists (
    select 1
    from qarar_iam.users
    where id = '35000000-0000-0000-0000-000000000101'
      and is_system_admin
      and status = 'active'
  ),
  'the final system administrator remains active and privileged after rejected changes'
);

select * from finish();
rollback;
