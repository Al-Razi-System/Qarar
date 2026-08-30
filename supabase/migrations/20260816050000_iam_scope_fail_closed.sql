-- Phase 0 IAM scope containment.
--
-- A null target unit must never widen a governance-unit permission into a
-- tenant-wide permission.  Organization, system, and self permissions are
-- explicitly non-unit-scoped; every other context requires an exact target.

create or replace function qarar_iam.has_permission(
  permission_code text,
  target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(qarar_iam.is_system_admin(), false)
    or coalesce(exists(
      select 1
      from qarar_iam.memberships m
      join qarar_iam.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
       and r.is_active
      join qarar_iam.role_permissions rp
        on rp.role_id = r.id
       and rp.organization_id = m.organization_id
       and rp.is_active
      join qarar_iam.permissions p
        on p.id = rp.permission_id
       and p.organization_id = m.organization_id
       and p.is_active
      where m.organization_id = qarar_iam.current_organization_id()
        and m.membership_status = 'active'
        and m.start_date <= current_date
        and (m.end_date is null or m.end_date >= current_date)
        and p.code = permission_code
        and (
          m.user_id = auth.uid()
          or exists(
            select 1
            from qarar_iam.access_delegations d
            where d.source_membership_id = m.id
              and d.organization_id = m.organization_id
              and d.delegated_to_user_id = auth.uid()
              and d.status = 'active'
              and now() between d.starts_at and d.ends_at
          )
        )
        and (
          p.context_scope in ('system', 'organization', 'self')
          or (
            target_unit_id is not null
            and m.governance_unit_id = target_unit_id
          )
        )
    ), false);
$$;

create or replace function qarar_iam.actor_has_permission(
  p_actor_user_id uuid,
  p_permission_code text,
  p_target_unit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select u.is_system_admin
    from qarar_iam.users u
    where u.id = p_actor_user_id
      and u.status = 'active'
  ), false) or coalesce(exists (
    select 1
    from qarar_iam.memberships m
    join qarar_iam.roles r
      on r.id = m.role_id
     and r.organization_id = m.organization_id
     and r.is_active
    join qarar_iam.role_permissions rp
      on rp.role_id = r.id
     and rp.organization_id = r.organization_id
     and rp.is_active
    join qarar_iam.permissions p
      on p.id = rp.permission_id
     and p.organization_id = rp.organization_id
     and p.is_active
    join qarar_iam.users u
      on u.id = m.user_id
     and u.organization_id = m.organization_id
     and u.status = 'active'
    where m.user_id = p_actor_user_id
      and m.membership_status = 'active'
      and m.start_date <= current_date
      and (m.end_date is null or m.end_date >= current_date)
      and p.code = p_permission_code
      and (
        p.context_scope in ('system', 'organization', 'self')
        or (
          p_target_unit_id is not null
          and m.governance_unit_id = p_target_unit_id
        )
      )
  ), false);
$$;

comment on function qarar_iam.has_permission(text, uuid) is
  'Returns a permission only at the requested unit. NULL never widens governance-unit or execution-scoped access.';
comment on function qarar_iam.actor_has_permission(uuid, text, uuid) is
  'Server-side actor permission check. NULL never widens governance-unit or execution-scoped access.';

do $$
begin
  if to_regprocedure('qarar_iam.has_permission(text,uuid)') is null
     or to_regprocedure('qarar_iam.actor_has_permission(uuid,text,uuid)') is null
  then
    raise exception 'IAM scope containment requires both permission predicates';
  end if;
end;
$$;

notify pgrst, 'reload schema';
