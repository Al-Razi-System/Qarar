begin;

create extension if not exists pgtap;
select plan(10);

insert into qarar_core.organizations(id, code, name_ar)
values (
  '41000000-0000-0000-0000-000000000001',
  'iam_service_claims',
  'IAM Service Claims'
);

insert into auth.users(id, email)
values (
  '41000000-0000-0000-0000-000000000101',
  'actor@iam-service-claims.test'
), (
  '41000000-0000-0000-0000-000000000102',
  'outer-system@iam-service-claims.test'
), (
  '41000000-0000-0000-0000-000000000103',
  'target@iam-service-claims.test'
);

insert into qarar_iam.users(id, organization_id, full_name_ar, email, is_system_admin)
values (
  '41000000-0000-0000-0000-000000000101',
  '41000000-0000-0000-0000-000000000001',
  'Service actor',
  'actor@iam-service-claims.test',
  false
), (
  '41000000-0000-0000-0000-000000000102',
  '41000000-0000-0000-0000-000000000001',
  'Outer system identity',
  'outer-system@iam-service-claims.test',
  true
);

insert into qarar_core.governance_unit_types(id, organization_id, code, name_ar)
values (
  '41000000-0000-0000-0000-000000000011',
  '41000000-0000-0000-0000-000000000001',
  'office',
  'Office'
);

insert into qarar_core.governance_units(id, organization_id, unit_type_id, code, name_ar)
values (
  '41000000-0000-0000-0000-000000000021',
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000011',
  'service_claims_hq',
  'Service Claims HQ'
);

insert into qarar_iam.roles(id, organization_id, code, name_ar, role_scope)
values
  (
    '41000000-0000-0000-0000-000000000201',
    '41000000-0000-0000-0000-000000000001',
    'service_claims_manager',
    'Service claims manager',
    'organization'
  ),
  (
    '41000000-0000-0000-0000-000000000202',
    '41000000-0000-0000-0000-000000000001',
    'service_claims_elevated',
    'Service claims elevated',
    'organization'
  );

insert into qarar_iam.permissions(id, organization_id, code, module, action, context_scope, name_ar)
values
  (
    '41000000-0000-0000-0000-000000000301',
    '41000000-0000-0000-0000-000000000001',
    'iam.users.manage',
    'iam',
    'users.manage',
    'organization',
    'Manage users'
  ),
  (
    '41000000-0000-0000-0000-000000000302',
    '41000000-0000-0000-0000-000000000001',
    'iam.roles.assign',
    'iam',
    'roles.assign',
    'governance_unit',
    'Assign roles'
  );

insert into qarar_iam.role_permissions(organization_id, role_id, permission_id)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000201',
    '41000000-0000-0000-0000-000000000301'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000201',
    '41000000-0000-0000-0000-000000000302'
  );

insert into qarar_iam.memberships(organization_id, user_id, governance_unit_id, role_id)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000101',
    '41000000-0000-0000-0000-000000000021',
    '41000000-0000-0000-0000-000000000201'
  ),
  (
    '41000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000102',
    '41000000-0000-0000-0000-000000000021',
    '41000000-0000-0000-0000-000000000201'
  );

-- Deliberately make every outer representation a system administrator service
-- identity. The wrapper must use the explicit non-system actor only for its
-- nested command and restore these values before returning to the request.
set local "request.jwt.claim" to '{"sub":"41000000-0000-0000-0000-000000000102","role":"service_role"}';
set local "request.jwt.claims" to '{"sub":"41000000-0000-0000-0000-000000000102","role":"service_role"}';
set local "request.jwt.claim.sub" to '41000000-0000-0000-0000-000000000102';
set local "request.jwt.claim.role" to 'service_role';
set local role service_role;

select lives_ok(
  $$select api_v1.service_consume_iam_rate_limit(
    '41000000-0000-0000-0000-000000000101',
    'iam.service_claim_normalization',
    10,
    3600
  )$$,
  'the service wrapper accepts a service caller with mixed claim layouts'
);

select throws_ok(
  $$select api_v1.service_finalize_invited_user(
    '41000000-0000-0000-0000-000000000101',
    '41000000-0000-0000-0000-000000000103',
    'target@iam-service-claims.test',
    'Target user',
    null,
    null,
    null,
    '41000000-0000-0000-0000-000000000202',
    '41000000-0000-0000-0000-000000000021',
    null
  )$$,
  '42501',
  'only a system administrator may assign organization or system roles',
  'service finalization applies the non-system actor guard instead of outer service claims'
);

reset role;

select is(
  (
    select actor_user_id
    from qarar_iam.iam_operation_rate_limits
    where operation = 'iam.service_claim_normalization'
  ),
  '41000000-0000-0000-0000-000000000101'::uuid,
  'the nested rate-limit command sees the explicit authenticated actor'
);

select is(
  current_setting('request.jwt.claim', true),
  '{"sub":"41000000-0000-0000-0000-000000000102","role":"service_role"}',
  'the singular JSON claim is restored after the service call'
);

select is(
  current_setting('request.jwt.claims', true),
  '{"sub":"41000000-0000-0000-0000-000000000102","role":"service_role"}',
  'the plural JSON claims are restored after the service call'
);

select is(
  current_setting('request.jwt.claim.sub', true),
  '41000000-0000-0000-0000-000000000102',
  'the legacy JWT subject is restored after the service call'
);

select is(
  current_setting('request.jwt.claim.role', true),
  'service_role',
  'the legacy JWT role is restored after the service call'
);

select is(
  (
    select count(*)::integer
    from (values
      (to_regprocedure('qarar_iam.service_consume_iam_rate_limit(uuid,text,integer,integer)')),
      (to_regprocedure('qarar_iam.service_finalize_invited_user(uuid,uuid,text,text,text,text,text,uuid,uuid,text)'))
    ) as wrappers(function_oid)
    where pg_get_functiondef(function_oid) like '%set_config(''request.jwt.claim'', v_actor_claims, true)%'
      and pg_get_functiondef(function_oid) like '%set_config(''request.jwt.claims'', v_actor_claims, true)%'
      and pg_get_functiondef(function_oid) like '%set_config(''request.jwt.claim.sub'', p_actor_user_id::text, true)%'
      and pg_get_functiondef(function_oid) like '%set_config(''request.jwt.claim.role'', ''authenticated'', true)%'
  ),
  2,
  'both service wrappers normalize every supported JWT claim representation'
);

reset "request.jwt.claim";
reset "request.jwt.claim.sub";
reset "request.jwt.claim.role";
set local "request.jwt.claims" to '{"sub":"41000000-0000-0000-0000-000000000101","role":"authenticated"}';
set local role qarar_audit_executor;

select lives_ok(
  $$select qarar_audit.append_audit_log(
    '41000000-0000-0000-0000-000000000001',
    'iam.service_claim_normalization.audit',
    'service_claims',
    '41000000-0000-0000-0000-000000000101',
    '{}'::jsonb
  )$$,
  'the audit implementation accepts a JSON-only actor context'
);

reset role;

select is(
  (
    select actor_user_id
    from qarar_audit.audit_logs
    where action = 'iam.service_claim_normalization.audit'
  ),
  '41000000-0000-0000-0000-000000000101'::uuid,
  'the audit record retains the actor from JSON-only claims'
);

select * from finish();
rollback;
