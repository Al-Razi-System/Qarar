-- Read-only preflight for 20260816080000_iam_authority_provenance_boundary.sql.
--
-- Run this against a database that has completed the preceding Phase 0 IAM
-- migrations, before applying 20260816080000. It intentionally makes no
-- configuration changes. A ready database returns only the summary row with
-- {"blocking_rows": 0, "ready": true}.

begin read only;
set local transaction isolation level repeatable read;

with elevated_roles as (
  select
    r.organization_id,
    r.id as role_id,
    r.code as role_code,
    r.role_scope,
    array_remove(array[
      case when r.role_scope in ('organization', 'system') then 'declared_role_scope' end,
      case when exists (
        select 1
        from qarar_iam.role_permissions rp
        join qarar_iam.permissions p
          on p.id = rp.permission_id
         and p.organization_id = rp.organization_id
         and p.is_active = true
        where rp.organization_id = r.organization_id
          and rp.role_id = r.id
          and rp.is_active = true
          and p.context_scope in ('organization', 'system')
      ) then 'active_permission_scope' end
    ], null::text) as elevation_reasons
  from qarar_iam.roles r
  where r.role_scope in ('organization', 'system')
     or exists (
       select 1
       from qarar_iam.role_permissions rp
       join qarar_iam.permissions p
         on p.id = rp.permission_id
        and p.organization_id = rp.organization_id
        and p.is_active = true
       where rp.organization_id = r.organization_id
         and rp.role_id = r.id
         and rp.is_active = true
         and p.context_scope in ('organization', 'system')
     )
), findings as (
  select
    'role_permission_scope_mismatch'::text as finding,
    rp.organization_id,
    jsonb_build_object(
      'role_permission_id', rp.id,
      'role_id', r.id,
      'role_code', r.code,
      'role_scope', r.role_scope,
      'permission_id', p.id,
      'permission_code', p.code,
      'permission_context_scope', p.context_scope
    ) as detail
  from qarar_iam.role_permissions rp
  join qarar_iam.roles r
    on r.id = rp.role_id
   and r.organization_id = rp.organization_id
  join qarar_iam.permissions p
    on p.id = rp.permission_id
   and p.organization_id = rp.organization_id
  where rp.is_active
    and p.is_active
    and (
      (p.context_scope = 'system' and r.role_scope <> 'system')
      or (
        p.context_scope = 'organization'
        and r.role_scope not in ('organization', 'system')
      )
    )

  union all

  select
    'pending_elevated_invitation',
    i.organization_id,
    jsonb_build_object(
      'invitation_id', i.id,
      'email', i.email,
      'role_id', er.role_id,
      'role_code', er.role_code,
      'role_scope', er.role_scope,
      'elevation_reasons', er.elevation_reasons,
      'governance_unit_id', i.governance_unit_id,
      'expires_at', i.expires_at
    )
  from qarar_iam.user_invitations i
  join elevated_roles er
    on er.organization_id = i.organization_id
   and er.role_id = i.role_id
  where i.invitation_status = 'pending'

  union all

  select
    'elevated_sso_default_role',
    provider.organization_id,
    jsonb_build_object(
      'provider_id', provider.id,
      'provider_name', provider.provider_name,
      'provider_status', provider.status,
      'provisioning_mode', provider.provisioning_mode,
      'role_id', er.role_id,
      'role_code', er.role_code,
      'role_scope', er.role_scope,
      'elevation_reasons', er.elevation_reasons
    )
  from qarar_iam.sso_identity_providers provider
  join elevated_roles er
    on er.organization_id = provider.organization_id
   and er.role_id = provider.default_role_id

  union all

  select
    'active_elevated_sso_group_mapping',
    mapping.organization_id,
    jsonb_build_object(
      'mapping_id', mapping.id,
      'provider_id', mapping.provider_id,
      'external_group', mapping.external_group,
      'role_id', er.role_id,
      'role_code', er.role_code,
      'role_scope', er.role_scope,
      'elevation_reasons', er.elevation_reasons,
      'governance_unit_id', mapping.governance_unit_id
    )
  from qarar_iam.sso_group_role_mappings mapping
  join elevated_roles er
    on er.organization_id = mapping.organization_id
   and er.role_id = mapping.role_id
  where mapping.is_active

  union all

  select
    'delegation_source_organization_mismatch',
    delegation.organization_id,
    jsonb_build_object(
      'delegation_id', delegation.id,
      'delegation_organization_id', delegation.organization_id,
      'source_membership_id', source_membership.id,
      'source_membership_organization_id', source_membership.organization_id,
      'delegated_by_user_id', delegation.delegated_by_user_id,
      'delegated_to_user_id', delegation.delegated_to_user_id,
      'status', delegation.status
    )
  from qarar_iam.access_delegations delegation
  join qarar_iam.memberships source_membership
    on source_membership.id = delegation.source_membership_id
  where source_membership.organization_id <> delegation.organization_id

  union all

  select
    'active_elevated_delegation',
    delegation.organization_id,
    jsonb_build_object(
      'delegation_id', delegation.id,
      'source_membership_id', delegation.source_membership_id,
      'source_user_id', source_membership.user_id,
      'delegated_by_user_id', delegation.delegated_by_user_id,
      'delegated_to_user_id', delegation.delegated_to_user_id,
      'role_id', er.role_id,
      'role_code', er.role_code,
      'role_scope', er.role_scope,
      'elevation_reasons', er.elevation_reasons,
      'starts_at', delegation.starts_at,
      'ends_at', delegation.ends_at
    )
  from qarar_iam.access_delegations delegation
  join qarar_iam.memberships source_membership
    on source_membership.id = delegation.source_membership_id
   and source_membership.organization_id = delegation.organization_id
  join elevated_roles er
    on er.organization_id = delegation.organization_id
   and er.role_id = source_membership.role_id
  where delegation.status = 'active'
)
select
  'summary'::text as finding,
  null::uuid as organization_id,
  jsonb_build_object(
    'blocking_rows', count(*),
    'ready', count(*) = 0
  ) as detail
from findings

union all

select finding, organization_id, detail
from findings
order by finding, organization_id nulls first;

rollback;
