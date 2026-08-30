begin;

create extension if not exists pgtap;
select plan(20);

insert into qarar_core.organizations(id, code, name_ar)
values ('40000000-0000-0000-0000-000000000001', 'iam_authority_boundary', 'IAM Authority Boundary');

insert into qarar_core.governance_unit_types(id, organization_id, code, name_ar)
values (
  '40000000-0000-0000-0000-000000000011',
  '40000000-0000-0000-0000-000000000001',
  'office',
  'Office'
);

insert into qarar_core.governance_units(id, organization_id, unit_type_id, code, name_ar)
values (
  '40000000-0000-0000-0000-000000000021',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  'authority_hq',
  'Authority HQ'
);

insert into auth.users(id, email)
values
  ('40000000-0000-0000-0000-000000000101', 'system@authority-boundary.test'),
  ('40000000-0000-0000-0000-000000000102', 'manager@authority-boundary.test'),
  ('40000000-0000-0000-0000-000000000103', 'source@authority-boundary.test'),
  ('40000000-0000-0000-0000-000000000104', 'target@authority-boundary.test');

insert into qarar_iam.users(id, organization_id, full_name_ar, email, is_system_admin)
values
  ('40000000-0000-0000-0000-000000000101', '40000000-0000-0000-0000-000000000001', 'System', 'system@authority-boundary.test', true),
  ('40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000001', 'Manager', 'manager@authority-boundary.test', false),
  ('40000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000001', 'Source', 'source@authority-boundary.test', false),
  ('40000000-0000-0000-0000-000000000104', '40000000-0000-0000-0000-000000000001', 'Target', 'target@authority-boundary.test', false);

insert into qarar_iam.roles(id, organization_id, code, name_ar, role_scope)
values
  ('40000000-0000-0000-0000-000000000201', '40000000-0000-0000-0000-000000000001', 'authority_unit_assigner', 'Unit assigner', 'governance_unit'),
  ('40000000-0000-0000-0000-000000000202', '40000000-0000-0000-0000-000000000001', 'authority_org_manager', 'Organization manager', 'organization'),
  ('40000000-0000-0000-0000-000000000203', '40000000-0000-0000-0000-000000000001', 'authority_org_officer', 'Organization officer', 'organization'),
  ('40000000-0000-0000-0000-000000000204', '40000000-0000-0000-0000-000000000001', 'authority_safe_unit', 'Safe unit role', 'governance_unit'),
  ('40000000-0000-0000-0000-000000000205', '40000000-0000-0000-0000-000000000001', 'authority_bad_unit', 'Bad unit role', 'governance_unit');

insert into qarar_iam.permissions(id, organization_id, code, module, action, context_scope, name_ar)
values
  ('40000000-0000-0000-0000-000000000301', '40000000-0000-0000-0000-000000000001', 'iam.roles.assign', 'iam', 'roles.assign', 'governance_unit', 'Assign roles'),
  ('40000000-0000-0000-0000-000000000302', '40000000-0000-0000-0000-000000000001', 'iam.users.invite', 'iam', 'users.invite', 'organization', 'Invite users'),
  ('40000000-0000-0000-0000-000000000303', '40000000-0000-0000-0000-000000000001', 'iam.sso.manage', 'iam', 'sso.manage', 'organization', 'Manage SSO'),
  ('40000000-0000-0000-0000-000000000304', '40000000-0000-0000-0000-000000000001', 'iam.users.manage', 'iam', 'users.manage', 'organization', 'Manage users');

-- Setup happens without a request JWT, just as a migration-owned maintenance
-- operation would.  The rows themselves obey the role/permission scope matrix.
insert into qarar_iam.role_permissions(organization_id, role_id, permission_id)
values
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000201', '40000000-0000-0000-0000-000000000301'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000202', '40000000-0000-0000-0000-000000000302'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000202', '40000000-0000-0000-0000-000000000303'),
  ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000203', '40000000-0000-0000-0000-000000000304');

insert into qarar_iam.memberships(id, organization_id, user_id, governance_unit_id, role_id)
values
  ('40000000-0000-0000-0000-000000000401', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000201'),
  ('40000000-0000-0000-0000-000000000402', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000202'),
  ('40000000-0000-0000-0000-000000000403', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000102', '40000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000203'),
  ('40000000-0000-0000-0000-000000000404', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000103', '40000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000203');

insert into qarar_iam.memberships(
  id,
  organization_id,
  user_id,
  governance_unit_id,
  role_id,
  membership_status,
  start_date,
  end_date
)
values (
  '40000000-0000-0000-0000-000000000405',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000104',
  '40000000-0000-0000-0000-000000000021',
  '40000000-0000-0000-0000-000000000203',
  'active',
  current_date - 1,
  current_date - 1
);

create temporary table iam_authority_state(
  provider_id uuid,
  delegation_id uuid
) on commit drop;
grant select, insert, update, delete on iam_authority_state to authenticated;
grant select on iam_authority_state to qarar_iam_executor;

select ok(
  qarar_iam.role_requires_system_administrator(
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000203'
  ),
  'an organization role is classified as elevated authority'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000102';

reset role;
set local role qarar_iam_executor;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';

-- The migration runner and some trusted integrations use the singular claim
-- setting.  Its mere presence must be treated as a caller context, not as a
-- migration/maintenance bypass.
reset "request.jwt.claims";
set local "request.jwt.claim" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';
select throws_ok(
  $$insert into qarar_iam.memberships(id, organization_id, user_id, governance_unit_id, role_id)
    values (
      '40000000-0000-0000-0000-000000000406',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000104',
      '40000000-0000-0000-0000-000000000021',
      '40000000-0000-0000-0000-000000000203'
    )$$,
  '42501',
  'only a system administrator may grant organization or system authority',
  'a singular request.jwt.claim context cannot bypass elevated membership containment'
);
reset "request.jwt.claim";
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000102';
set local "request.jwt.claim.role" to 'authenticated';
select throws_ok(
  $$insert into qarar_iam.memberships(id, organization_id, user_id, governance_unit_id, role_id)
    values (
      '40000000-0000-0000-0000-000000000407',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000104',
      '40000000-0000-0000-0000-000000000021',
      '40000000-0000-0000-0000-000000000203'
    )$$,
  '42501',
  'only a system administrator may grant organization or system authority',
  'legacy request.jwt.claim.sub and request.jwt.claim.role cannot bypass elevated membership containment'
);
reset "request.jwt.claim.sub";
reset "request.jwt.claim.role";
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000102';

select throws_ok(
  $$insert into qarar_iam.role_permissions(organization_id, role_id, permission_id)
    values (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000205',
      '40000000-0000-0000-0000-000000000304'
    )$$,
  '23514',
  'role scope cannot be lower than an active permission context scope',
  'a governance-unit role cannot acquire organization authority through its permission matrix'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';

select throws_ok(
  $$select api_v1.admin_assign_role(
    '40000000-0000-0000-0000-000000000104',
    '40000000-0000-0000-0000-000000000203',
    '40000000-0000-0000-0000-000000000021',
    null,
    current_date,
    null
  )$$,
  '42501',
  'only a system administrator may assign organization or system roles',
  'a non-system manager cannot assign an organization role'
);

reset role;
set local role qarar_iam_executor;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';

select throws_ok(
  $$insert into qarar_iam.memberships(organization_id, user_id, governance_unit_id, role_id)
    values (
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000104',
      '40000000-0000-0000-0000-000000000021',
      '40000000-0000-0000-0000-000000000203'
    )$$,
  '42501',
  'only a system administrator may grant organization or system authority',
  'direct module-table DML cannot grant elevated authority'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';

select throws_ok(
  $$select api_v1.admin_create_invitation(
    'elevated.invite@authority-boundary.test',
    'Elevated invite',
    '40000000-0000-0000-0000-000000000203',
    '40000000-0000-0000-0000-000000000021',
    now() + interval '1 day'
  )$$,
  '42501',
  'organization or system authority cannot be provisioned through invitations or SSO; assign it after identity activation',
  'invitations cannot carry elevated authority'
);

select lives_ok(
  $$select api_v1.admin_create_invitation(
    'safe.invite@authority-boundary.test',
    'Safe invite',
    '40000000-0000-0000-0000-000000000204',
    '40000000-0000-0000-0000-000000000021',
    now() + interval '1 day'
  )$$,
  'a non-elevated invitation remains available to the organization manager'
);

reset role;
set local role qarar_iam_executor;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000101","email":"system@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000101';
select throws_ok(
  $$update qarar_iam.roles
    set role_scope = 'organization'
    where id = '40000000-0000-0000-0000-000000000204'$$,
  '42501',
  'elevated role cannot retain a pending invitation; remove or reissue the invitation before changing role authority',
  'a system administrator cannot promote a role that is already carried by a pending invitation'
);
reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000102';

insert into iam_authority_state(provider_id)
select api_v1.admin_upsert_sso_provider(
  'Safe provider',
  '40000000-0000-0000-0000-000000000501',
  null,
  null,
  '{}'::jsonb,
  null,
  null,
  'invited_only',
  'draft'
);

select ok(
  (select provider_id is not null from iam_authority_state),
  'a provider with no elevated default role can be configured'
);

select throws_ok(
  $$select api_v1.admin_upsert_sso_group_mapping(
    (select provider_id from iam_authority_state),
    'elevated-group',
    '40000000-0000-0000-0000-000000000203',
    '40000000-0000-0000-0000-000000000021',
    null,
    true
  )$$,
  '42501',
  'organization or system authority cannot be provisioned through invitations or SSO; assign it after identity activation',
  'an SSO group mapping cannot grant elevated authority'
);

select throws_ok(
  $$select api_v1.admin_upsert_sso_provider(
    'Elevated provider',
    '40000000-0000-0000-0000-000000000502',
    null,
    null,
    '{}'::jsonb,
    '40000000-0000-0000-0000-000000000203',
    '40000000-0000-0000-0000-000000000021',
    'jit',
    'draft'
  )$$,
  '42501',
  'organization or system authority cannot be provisioned through invitations or SSO; assign it after identity activation',
  'an SSO JIT default cannot grant elevated authority'
);

select throws_ok(
  $$select api_v1.admin_create_delegation(
    '40000000-0000-0000-0000-000000000404',
    '40000000-0000-0000-0000-000000000104',
    now(),
    now() + interval '1 hour',
    'attempt to delegate another member'
  )$$,
  '42501',
  'only the source member or a system administrator may create a delegation',
  'a unit manager cannot delegate another member''s source membership'
);

select throws_ok(
  $$select api_v1.admin_create_delegation(
    '40000000-0000-0000-0000-000000000403',
    '40000000-0000-0000-0000-000000000104',
    now(),
    now() + interval '1 hour',
    'attempt to delegate own elevated authority'
  )$$,
  '42501',
  'only a system administrator may delegate organization or system authority',
  'a non-system holder cannot delegate elevated authority'
);

set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000101","email":"system@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000101';

update iam_authority_state
set delegation_id = api_v1.admin_create_delegation(
  '40000000-0000-0000-0000-000000000403',
  '40000000-0000-0000-0000-000000000104',
  now(),
  now() + interval '1 hour',
  'approved system delegation'
);

select ok(
  (select delegation_id is not null from iam_authority_state),
  'a system administrator can create an elevated delegation'
);

select is(
  (
    select d.delegated_by_user_id
    from qarar_iam.access_delegations d
    join iam_authority_state s on s.delegation_id = d.id
  ),
  '40000000-0000-0000-0000-000000000101'::uuid,
  'delegation provenance records the actual system actor instead of the source member'
);

reset role;
set local role qarar_iam_executor;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';
set local "request.jwt.claim.sub" to '40000000-0000-0000-0000-000000000102';

select throws_ok(
  $$update qarar_iam.access_delegations
    set source_membership_id = '40000000-0000-0000-0000-000000000401'
    where id = (select delegation_id from iam_authority_state)$$,
  '42501',
  'only a system administrator may revoke organization or system authority',
  'a direct update cannot swap an elevated delegation source for a safe membership'
);

select throws_ok(
  $$update qarar_iam.memberships
    set user_id = '40000000-0000-0000-0000-000000000104'
    where id = '40000000-0000-0000-0000-000000000403'$$,
  '42501',
  'only a system administrator may modify organization or system authority',
  'a direct update cannot transfer an active elevated membership to another user'
);

select throws_ok(
  $$update qarar_iam.memberships
    set end_date = null
    where id = '40000000-0000-0000-0000-000000000405'$$,
  '42501',
  'only a system administrator may modify organization or system authority',
  'a direct update cannot reactivate an expired elevated membership'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"40000000-0000-0000-0000-000000000102","email":"manager@authority-boundary.test"}';

select lives_ok(
  $$select api_v1.admin_assign_role(
    '40000000-0000-0000-0000-000000000104',
    '40000000-0000-0000-0000-000000000204',
    '40000000-0000-0000-0000-000000000021',
    null,
    current_date,
    null
  )$$,
  'unit-scoped role assignment remains available to an authorized non-system manager'
);

reset role;
select * from finish();
rollback;
