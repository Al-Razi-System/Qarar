begin;

create extension if not exists pgtap;
select plan(6);

insert into qarar_core.organizations(id, code, name_ar)
values ('37000000-0000-0000-0000-000000000001', 'scope_guard', 'Scope guard');

insert into qarar_core.governance_unit_types(id, organization_id, code, name_ar)
values (
  '37000000-0000-0000-0000-000000000011',
  '37000000-0000-0000-0000-000000000001',
  'office',
  'Office'
);

insert into qarar_core.governance_units(id, organization_id, unit_type_id, code, name_ar)
values (
  '37000000-0000-0000-0000-000000000021',
  '37000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000011',
  'scope_guard_unit',
  'Scope guard unit'
);

insert into auth.users(id, email)
values ('37000000-0000-0000-0000-000000000101', 'scope-user@qarar.test');

insert into qarar_iam.users(id, organization_id, full_name_ar, email)
values (
  '37000000-0000-0000-0000-000000000101',
  '37000000-0000-0000-0000-000000000001',
  'Scope User',
  'scope-user@qarar.test'
);

insert into qarar_iam.roles(id, organization_id, code, name_ar, role_scope)
values
  (
    '37000000-0000-0000-0000-000000000201',
    '37000000-0000-0000-0000-000000000001',
    'scope_guard_unit_role',
    'Scope guard unit role',
    'governance_unit'
  ),
  (
    '37000000-0000-0000-0000-000000000202',
    '37000000-0000-0000-0000-000000000001',
    'scope_guard_organization_role',
    'Scope guard organization role',
    'organization'
  );

insert into qarar_iam.permissions(id, organization_id, code, module, action, context_scope, name_ar)
values
  ('37000000-0000-0000-0000-000000000301', '37000000-0000-0000-0000-000000000001', 'scope_guard.unit', 'scope_guard', 'unit', 'governance_unit', 'Unit permission'),
  ('37000000-0000-0000-0000-000000000302', '37000000-0000-0000-0000-000000000001', 'scope_guard.organization', 'scope_guard', 'organization', 'organization', 'Organization permission');

insert into qarar_iam.role_permissions(organization_id, role_id, permission_id)
values
  ('37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000201', '37000000-0000-0000-0000-000000000301'),
  ('37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000202', '37000000-0000-0000-0000-000000000302');

insert into qarar_iam.memberships(organization_id, user_id, governance_unit_id, role_id)
values
  (
    '37000000-0000-0000-0000-000000000001',
    '37000000-0000-0000-0000-000000000101',
    '37000000-0000-0000-0000-000000000021',
    '37000000-0000-0000-0000-000000000201'
  ),
  (
    '37000000-0000-0000-0000-000000000001',
    '37000000-0000-0000-0000-000000000101',
    '37000000-0000-0000-0000-000000000021',
    '37000000-0000-0000-0000-000000000202'
  );

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"37000000-0000-0000-0000-000000000101","email":"scope-user@qarar.test"}';
set local "request.jwt.claim.sub" to '37000000-0000-0000-0000-000000000101';

select is(
  api_v1.has_permission('scope_guard.unit', null),
  false,
  'a governance-unit permission fails closed when no target unit is supplied'
);

select is(
  api_v1.has_permission('scope_guard.unit', '37000000-0000-0000-0000-000000000021'),
  true,
  'a governance-unit permission succeeds only for its exact target'
);

select is(
  api_v1.has_permission('scope_guard.organization', null),
  true,
  'an organization-scoped permission remains valid without a target unit'
);

reset role;

select is(
  qarar_iam.actor_has_permission(
    '37000000-0000-0000-0000-000000000101',
    'scope_guard.unit',
    null
  ),
  false,
  'the service-side actor predicate also fails closed for a missing unit'
);

select is(
  qarar_iam.actor_has_permission(
    '37000000-0000-0000-0000-000000000101',
    'scope_guard.unit',
    '37000000-0000-0000-0000-000000000021'
  ),
  true,
  'the service-side actor predicate accepts the assigned unit'
);

select is(
  qarar_iam.actor_has_permission(
    '37000000-0000-0000-0000-000000000101',
    'scope_guard.organization',
    null
  ),
  true,
  'the service-side actor predicate preserves organization permissions'
);

select * from finish();
rollback;
