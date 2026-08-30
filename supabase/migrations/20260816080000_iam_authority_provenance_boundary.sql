-- Phase 0 IAM authority provenance boundary.
--
-- Role scope alone is not sufficient to classify authority: a governance-unit
-- role can accidentally acquire an organization or system scoped permission.
-- This migration makes the *effective* authority of a role the data-boundary
-- invariant, then applies it to every membership issuance path (assignment,
-- invitation, delegation, SSO defaults, group mappings, and direct DML).
--
-- Automated SSO and invitation provisioning are deliberately limited to
-- non-elevated roles.  A system administrator must assign organization/system
-- authority after the identity is active and verified.

do $$
begin
  if to_regprocedure(
    'qarar_iam.admin_create_delegation(uuid,uuid,timestamp with time zone,timestamp with time zone,text)'
  ) is null
     or to_regprocedure('qarar_iam.admin_revoke_delegation(uuid,text)') is null
  then
    raise exception 'IAM authority provenance requires the established delegation command surface';
  end if;
end;
$$;

-- A migration or a tightly controlled internal operation has no request JWT.
-- Every browser/Edge request has one, so absence is safe only for database-side
-- maintenance.  Service wrappers that intentionally impersonate an actor set
-- an authenticated JWT before they invoke the underlying command and therefore
-- remain subject to the actor checks below.
create or replace function qarar_iam.is_system_authority_context()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(qarar_iam.is_system_admin(), false)
      or coalesce(auth.role() = 'service_role', false)
      or (
        nullif(current_setting('request.jwt.claim', true), '') is null
        and nullif(current_setting('request.jwt.claims', true), '') is null
        and nullif(current_setting('request.jwt.claim.sub', true), '') is null
        and nullif(current_setting('request.jwt.claim.role', true), '') is null
      )
$$;

-- Every authority-bearing mutation in one organization takes this transaction
-- advisory lock before it classifies roles or provisioning sources.  This
-- closes the READ COMMITTED race where one transaction links a safe role to an
-- invitation/SSO/delegation while another transaction promotes that same role.
-- Two-organization moves are ordered deterministically to avoid deadlocks.
create or replace function qarar_iam.lock_iam_authority_boundary(
  p_first_organization_id uuid,
  p_second_organization_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_first uuid;
  v_second uuid;
begin
  if p_first_organization_id is null and p_second_organization_id is null then
    return;
  end if;

  if p_first_organization_id is null then
    v_first := p_second_organization_id;
  elsif p_second_organization_id is null
     or p_first_organization_id::text <= p_second_organization_id::text
  then
    v_first := p_first_organization_id;
    v_second := p_second_organization_id;
  else
    v_first := p_second_organization_id;
    v_second := p_first_organization_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('iam-authority:' || v_first::text, 2026081608)
  );

  if v_second is not null and v_second is distinct from v_first then
    perform pg_advisory_xact_lock(
      hashtextextended('iam-authority:' || v_second::text, 2026081608)
    );
  end if;
end;
$$;

-- A role is elevated when its declared scope is organization/system, or when
-- any active permission attached to it operates at either of those scopes.
create or replace function qarar_iam.role_requires_system_administrator(
  p_organization_id uuid,
  p_role_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from qarar_iam.roles r
    where r.id = p_role_id
      and r.organization_id = p_organization_id
      and (
        r.role_scope in ('organization', 'system')
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
      )
  )
$$;

create or replace function qarar_iam.assert_role_grant_authority(
  p_organization_id uuid,
  p_role_id uuid,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_role_id is not null
     and qarar_iam.role_requires_system_administrator(p_organization_id, p_role_id)
     and not qarar_iam.is_system_authority_context()
  then
    raise exception 'only a system administrator may % organization or system authority',
      coalesce(nullif(btrim(p_operation), ''), 'modify')
      using errcode = '42501';
  end if;
end;
$$;

create or replace function qarar_iam.assert_role_is_not_automatically_provisionable(
  p_organization_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_role_id is not null
     and qarar_iam.role_requires_system_administrator(p_organization_id, p_role_id)
  then
    raise exception 'organization or system authority cannot be provisioned through invitations or SSO; assign it after identity activation'
      using errcode = '42501';
  end if;
end;
$$;

-- A role that is currently safe can be linked to a pending invitation, an SSO
-- default/group mapping, or a bounded delegation.  Do not allow a later role
-- scope promotion to turn one of those existing automated paths into elevated
-- authority.  Elevated delegations are allowed only when created explicitly by
-- a system administrator through the delegation command.
create or replace function qarar_iam.assert_elevated_role_has_no_automatic_provisioning(
  p_organization_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from qarar_iam.user_invitations i
    where i.organization_id = p_organization_id
      and i.role_id = p_role_id
      and i.invitation_status = 'pending'
  ) then
    raise exception 'elevated role cannot retain a pending invitation; remove or reissue the invitation before changing role authority'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from qarar_iam.sso_identity_providers p
    where p.organization_id = p_organization_id
      and p.default_role_id = p_role_id
  ) then
    raise exception 'elevated role cannot retain an SSO default; remove it before changing role authority'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from qarar_iam.sso_group_role_mappings m
    where m.organization_id = p_organization_id
      and m.role_id = p_role_id
      and m.is_active
  ) then
    raise exception 'elevated role cannot retain an active SSO group mapping; disable it before changing role authority'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from qarar_iam.access_delegations d
    join qarar_iam.memberships m
      on m.id = d.source_membership_id
     and m.organization_id = d.organization_id
    where d.organization_id = p_organization_id
      and m.role_id = p_role_id
      and d.status = 'active'
  ) then
    raise exception 'elevated role cannot retain an active delegation; revoke it before changing role authority'
      using errcode = '42501';
  end if;
end;
$$;

-- A role's declared scope must be able to contain each active permission.  This
-- prevents a governance-unit/execution role from masquerading as a local role
-- while its permissions in fact apply to the whole organization or system.
create or replace function qarar_iam.enforce_role_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_is_elevated boolean := false;
  v_new_is_elevated boolean := false;
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    if old.role_scope in ('organization', 'system')
       and not qarar_iam.is_system_authority_context()
    then
      raise exception 'only a system administrator may modify organization or system roles'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if (
    new.role_scope in ('organization', 'system')
    or (tg_op = 'UPDATE' and old.role_scope in ('organization', 'system'))
  )
  and not qarar_iam.is_system_authority_context()
  then
    raise exception 'only a system administrator may modify organization or system roles'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from qarar_iam.role_permissions rp
    join qarar_iam.permissions p
      on p.id = rp.permission_id
     and p.organization_id = rp.organization_id
     and p.is_active = true
    where rp.organization_id = new.organization_id
      and rp.role_id = new.id
      and rp.is_active = true
      and (
        (p.context_scope = 'system' and new.role_scope <> 'system')
        or (
          p.context_scope = 'organization'
          and new.role_scope not in ('organization', 'system')
        )
      )
  ) then
    raise exception 'role scope cannot be lower than an active permission context scope'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    -- BEFORE UPDATE still sees the old stored role, so this call accurately
    -- classifies the pre-change authority while the expression below classifies
    -- the requested role scope.
    v_old_is_elevated := qarar_iam.role_requires_system_administrator(
      old.organization_id,
      old.id
    );
    v_new_is_elevated := new.role_scope in ('organization', 'system')
      or exists (
        select 1
        from qarar_iam.role_permissions rp
        join qarar_iam.permissions p
          on p.id = rp.permission_id
         and p.organization_id = rp.organization_id
         and p.is_active = true
        where rp.organization_id = new.organization_id
          and rp.role_id = new.id
          and rp.is_active = true
          and p.context_scope in ('organization', 'system')
      );

    if not v_old_is_elevated and v_new_is_elevated then
      perform qarar_iam.assert_elevated_role_has_no_automatic_provisioning(
        new.organization_id,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_role_permission_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_role_scope text;
  v_new_context_scope text;
  v_old_context_scope text;
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    select p.context_scope
      into v_old_context_scope
    from qarar_iam.permissions p
    where p.id = old.permission_id
      and p.organization_id = old.organization_id;

    if old.is_active
       and v_old_context_scope in ('organization', 'system')
       and not qarar_iam.is_system_authority_context()
    then
      raise exception 'only a system administrator may modify organization or system authority'
        using errcode = '42501';
    end if;
    return old;
  end if;

  select r.role_scope, p.context_scope
    into v_role_scope, v_new_context_scope
  from qarar_iam.roles r
  join qarar_iam.permissions p
    on p.id = new.permission_id
   and p.organization_id = new.organization_id
  where r.id = new.role_id
    and r.organization_id = new.organization_id;

  if v_role_scope is null or v_new_context_scope is null then
    raise exception 'role permission must belong to a role and permission in the same organization'
      using errcode = '23503';
  end if;

  if new.is_active
     and (
       (v_new_context_scope = 'system' and v_role_scope <> 'system')
       or (
         v_new_context_scope = 'organization'
         and v_role_scope not in ('organization', 'system')
       )
     )
  then
    raise exception 'role scope cannot be lower than an active permission context scope'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    select p.context_scope
      into v_old_context_scope
    from qarar_iam.permissions p
    where p.id = old.permission_id
      and p.organization_id = old.organization_id;
  end if;

  if (
    (new.is_active and v_new_context_scope in ('organization', 'system'))
    or (tg_op = 'UPDATE' and old.is_active and v_old_context_scope in ('organization', 'system'))
  )
  and not qarar_iam.is_system_authority_context()
  then
    raise exception 'only a system administrator may modify organization or system authority'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_permission_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_old_context_scope text;
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    if old.context_scope in ('organization', 'system')
       and not qarar_iam.is_system_authority_context()
    then
      raise exception 'only a system administrator may modify organization or system authority'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    v_old_context_scope := old.context_scope;
  end if;

  if (
    new.context_scope in ('organization', 'system')
    or v_old_context_scope in ('organization', 'system')
  )
  and not qarar_iam.is_system_authority_context()
  then
    raise exception 'only a system administrator may modify organization or system authority'
      using errcode = '42501';
  end if;

  if new.context_scope in ('organization', 'system')
     and exists (
       select 1
       from qarar_iam.role_permissions rp
       join qarar_iam.roles r
         on r.id = rp.role_id
        and r.organization_id = rp.organization_id
       where rp.organization_id = new.organization_id
         and rp.permission_id = new.id
         and rp.is_active = true
         and (
           (new.context_scope = 'system' and r.role_scope <> 'system')
           or (
             new.context_scope = 'organization'
             and r.role_scope not in ('organization', 'system')
           )
         )
     )
  then
    raise exception 'permission context would exceed an active role scope'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_membership_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    if old.membership_status = 'active' then
      perform qarar_iam.assert_role_grant_authority(
        old.organization_id,
        old.role_id,
        'revoke'
      );
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.membership_status = 'active' then
      perform qarar_iam.assert_role_grant_authority(
        new.organization_id,
        new.role_id,
        'grant'
      );
    end if;
    return new;
  end if;

  -- An active elevated membership must not be edited by a unit administrator.
  -- In particular, changing its user, unit, start/end dates, or role can move
  -- or reactivate authority without going through the assignment command.
  -- Applying the guard to every update of an active membership is deliberately
  -- conservative and avoids missing a future authority-bearing column.
  if old.membership_status = 'active' then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.role_id,
      'modify'
    );
  end if;

  if new.membership_status = 'active' then
    perform qarar_iam.assert_role_grant_authority(
      new.organization_id,
      new.role_id,
      case when old.membership_status = 'active' then 'modify' else 'grant' end
    );
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_invitation_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.role_id,
      'revoke'
    );
    return old;
  end if;

  if new.role_id is not null
     and new.invitation_status = 'pending'
  then
    perform qarar_iam.assert_role_is_not_automatically_provisionable(
      new.organization_id,
      new.role_id
    );
  end if;

  if tg_op = 'UPDATE'
     and old.role_id is not null
     and old.invitation_status = 'pending'
     and (
       new.invitation_status <> 'pending'
       or new.role_id is distinct from old.role_id
       or new.organization_id is distinct from old.organization_id
     )
  then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.role_id,
      'revoke'
    );
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_sso_provider_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.default_role_id,
      'revoke'
    );
    return old;
  end if;

  perform qarar_iam.assert_role_is_not_automatically_provisionable(
    new.organization_id,
    new.default_role_id
  );

  if tg_op = 'UPDATE'
     and old.default_role_id is not null
     and (
       new.default_role_id is distinct from old.default_role_id
       or new.organization_id is distinct from old.organization_id
     )
  then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.default_role_id,
      'revoke'
    );
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_sso_group_mapping_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op = 'DELETE' then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.role_id,
      'revoke'
    );
    return old;
  end if;

  if new.is_active then
    perform qarar_iam.assert_role_is_not_automatically_provisionable(
      new.organization_id,
      new.role_id
    );
  end if;

  if tg_op = 'UPDATE'
     and old.is_active
     and (
       not new.is_active
       or new.role_id is distinct from old.role_id
       or new.organization_id is distinct from old.organization_id
     )
  then
    perform qarar_iam.assert_role_grant_authority(
      old.organization_id,
      old.role_id,
      'revoke'
    );
  end if;

  return new;
end;
$$;

create or replace function qarar_iam.enforce_delegation_authority_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_new_source_user_id uuid;
  v_new_source_role_id uuid;
  v_new_source_organization_id uuid;
  v_old_source_role_id uuid;
  v_old_source_organization_id uuid;
begin
  if tg_op = 'DELETE' then
    perform qarar_iam.lock_iam_authority_boundary(old.organization_id);
  elsif tg_op = 'UPDATE' then
    perform qarar_iam.lock_iam_authority_boundary(
      old.organization_id,
      new.organization_id
    );
  else
    perform qarar_iam.lock_iam_authority_boundary(new.organization_id);
  end if;

  if tg_op <> 'DELETE' then
    select m.user_id, m.role_id, m.organization_id
      into v_new_source_user_id, v_new_source_role_id, v_new_source_organization_id
    from qarar_iam.memberships m
    where m.id = new.source_membership_id;

    if v_new_source_role_id is null then
      raise exception 'delegation source membership not found'
        using errcode = '23503';
    end if;

    if v_new_source_organization_id is distinct from new.organization_id then
      raise exception 'delegation source membership must belong to the delegation organization'
        using errcode = '23503';
    end if;

    if new.status = 'active' then
      if not qarar_iam.is_system_authority_context()
         and v_new_source_user_id is distinct from auth.uid()
      then
        raise exception 'only the source member or a system administrator may create a delegation'
          using errcode = '42501';
      end if;

      perform qarar_iam.assert_role_grant_authority(
        v_new_source_organization_id,
        v_new_source_role_id,
        'delegate'
      );
    end if;
  end if;

  if tg_op <> 'INSERT' then
    select m.role_id, m.organization_id
      into v_old_source_role_id, v_old_source_organization_id
    from qarar_iam.memberships m
    where m.id = old.source_membership_id;

    if v_old_source_role_id is null then
      raise exception 'delegation source membership not found'
        using errcode = '23503';
    end if;

    if v_old_source_organization_id is distinct from old.organization_id then
      raise exception 'delegation source membership must belong to the delegation organization'
        using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then
    perform qarar_iam.assert_role_grant_authority(
      v_old_source_organization_id,
      v_old_source_role_id,
      'revoke'
    );
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.status = 'active'
     and (
       new.status <> 'active'
       or new.source_membership_id is distinct from old.source_membership_id
       or new.organization_id is distinct from old.organization_id
     )
  then
    perform qarar_iam.assert_role_grant_authority(
      v_old_source_organization_id,
      v_old_source_role_id,
      'revoke'
    );
  end if;

  return new;
end;
$$;

-- Reject unsafe historical configuration instead of silently changing who can
-- administer the platform.  Operators must review/reissue these records through
-- a system administrator before this containment migration is applied.
--
-- The migration runner uses one transaction.  Hold locks through the preflight
-- and trigger installation so a concurrent write cannot create an unsafe row in
-- the interval between the inspection and the data-boundary enforcement.
lock table
  qarar_iam.roles,
  qarar_iam.permissions,
  qarar_iam.role_permissions,
  qarar_iam.memberships,
  qarar_iam.user_invitations,
  qarar_iam.sso_identity_providers,
  qarar_iam.sso_group_role_mappings,
  qarar_iam.access_delegations
in share row exclusive mode;

do $$
begin
  if exists (
    select 1
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
  ) then
    raise exception 'IAM authority containment blocked: an active permission exceeds its role scope; correct the role matrix first';
  end if;

  if exists (
    select 1
    from qarar_iam.user_invitations i
    where i.invitation_status = 'pending'
      and qarar_iam.role_requires_system_administrator(i.organization_id, i.role_id)
  ) then
    raise exception 'IAM authority containment blocked: pending elevated invitations must be replaced with roleless invitations';
  end if;

  if exists (
    select 1
    from qarar_iam.sso_identity_providers p
    where qarar_iam.role_requires_system_administrator(p.organization_id, p.default_role_id)
  ) then
    raise exception 'IAM authority containment blocked: SSO providers cannot retain organization or system default roles';
  end if;

  if exists (
    select 1
    from qarar_iam.sso_group_role_mappings m
    where m.is_active
      and qarar_iam.role_requires_system_administrator(m.organization_id, m.role_id)
  ) then
    raise exception 'IAM authority containment blocked: active SSO group mappings cannot grant organization or system authority';
  end if;

  if exists (
    select 1
    from qarar_iam.access_delegations d
    join qarar_iam.memberships m
      on m.id = d.source_membership_id
     and m.organization_id = d.organization_id
    where d.status = 'active'
      and qarar_iam.role_requires_system_administrator(d.organization_id, m.role_id)
  ) then
    raise exception 'IAM authority containment blocked: active elevated delegations must be revoked and recreated by a system administrator';
  end if;

  if exists (
    select 1
    from qarar_iam.access_delegations d
    join qarar_iam.memberships m
      on m.id = d.source_membership_id
    where m.organization_id <> d.organization_id
  ) then
    raise exception 'IAM authority containment blocked: delegation source memberships must belong to the delegation organization';
  end if;
end;
$$;

drop trigger if exists enforce_iam_role_authority_boundary on qarar_iam.roles;
create trigger enforce_iam_role_authority_boundary
before insert or update or delete on qarar_iam.roles
for each row execute function qarar_iam.enforce_role_authority_boundary();

drop trigger if exists enforce_iam_role_permission_authority_boundary on qarar_iam.role_permissions;
create trigger enforce_iam_role_permission_authority_boundary
before insert or update or delete on qarar_iam.role_permissions
for each row execute function qarar_iam.enforce_role_permission_authority_boundary();

drop trigger if exists enforce_iam_permission_authority_boundary on qarar_iam.permissions;
create trigger enforce_iam_permission_authority_boundary
before insert or update or delete on qarar_iam.permissions
for each row execute function qarar_iam.enforce_permission_authority_boundary();

drop trigger if exists enforce_iam_membership_authority_boundary on qarar_iam.memberships;
create trigger enforce_iam_membership_authority_boundary
before insert or update or delete on qarar_iam.memberships
for each row execute function qarar_iam.enforce_membership_authority_boundary();

drop trigger if exists enforce_iam_invitation_authority_boundary on qarar_iam.user_invitations;
create trigger enforce_iam_invitation_authority_boundary
before insert or update or delete on qarar_iam.user_invitations
for each row execute function qarar_iam.enforce_invitation_authority_boundary();

drop trigger if exists enforce_iam_sso_provider_authority_boundary on qarar_iam.sso_identity_providers;
create trigger enforce_iam_sso_provider_authority_boundary
before insert or update or delete on qarar_iam.sso_identity_providers
for each row execute function qarar_iam.enforce_sso_provider_authority_boundary();

drop trigger if exists enforce_iam_sso_group_mapping_authority_boundary on qarar_iam.sso_group_role_mappings;
create trigger enforce_iam_sso_group_mapping_authority_boundary
before insert or update or delete on qarar_iam.sso_group_role_mappings
for each row execute function qarar_iam.enforce_sso_group_mapping_authority_boundary();

drop trigger if exists enforce_iam_delegation_authority_boundary on qarar_iam.access_delegations;
create trigger enforce_iam_delegation_authority_boundary
before insert or update or delete on qarar_iam.access_delegations
for each row execute function qarar_iam.enforce_delegation_authority_boundary();

-- Preserve the public command signature, but bind the delegation to its real
-- actor.  Previously any user with a unit assignment permission could delegate
-- somebody else's source membership and the audit field recorded the source
-- owner rather than the caller.
create or replace function qarar_iam.admin_create_delegation(
  p_source_membership_id uuid,
  p_delegated_to_user_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_source qarar_iam.memberships%rowtype;
  v_delegation_id uuid;
begin
  if v_org is null then
    raise exception 'current organization is required' using errcode = '42501';
  end if;

  select m.*
    into v_source
  from qarar_iam.memberships m
  join qarar_iam.roles r
    on r.id = m.role_id
   and r.organization_id = m.organization_id
   and r.is_active = true
  where m.id = p_source_membership_id
    and m.organization_id = v_org
    and m.membership_status = 'active'
    and m.start_date <= current_date
    and (m.end_date is null or m.end_date >= current_date)
  for update;

  if v_source.id is null then
    raise exception 'active source membership not found';
  end if;

  if not qarar_iam.is_system_authority_context()
     and v_source.user_id is distinct from auth.uid()
  then
    raise exception 'only the source member or a system administrator may create a delegation'
      using errcode = '42501';
  end if;

  perform qarar_iam.assert_permission('iam.roles.assign', v_source.governance_unit_id);
  perform qarar_iam.assert_role_grant_authority(v_org, v_source.role_id, 'delegate');

  if not exists (
    select 1
    from qarar_iam.users u
    where u.id = p_delegated_to_user_id
      and u.organization_id = v_org
      and u.status = 'active'
  ) then
    raise exception 'active delegated user not found in current organization'
      using errcode = '42501';
  end if;

  if p_starts_at is null
     or p_ends_at is null
     or p_ends_at <= p_starts_at
     or p_ends_at > now() + interval '90 days'
  then
    raise exception 'delegation must end after it starts and within 90 days';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_source.id::text, 0));

  if exists (
    select 1
    from qarar_iam.access_delegations d
    where d.organization_id = v_org
      and d.source_membership_id = v_source.id
      and d.delegated_to_user_id = p_delegated_to_user_id
      and d.status = 'active'
      and d.starts_at < p_ends_at
      and d.ends_at > p_starts_at
  ) then
    raise exception 'an overlapping active delegation already exists';
  end if;

  insert into qarar_iam.access_delegations(
    organization_id,
    delegated_by_user_id,
    delegated_to_user_id,
    source_membership_id,
    starts_at,
    ends_at,
    reason
  )
  values (
    v_org,
    auth.uid(),
    p_delegated_to_user_id,
    v_source.id,
    p_starts_at,
    p_ends_at,
    nullif(btrim(coalesce(p_reason, '')), '')
  )
  returning id into v_delegation_id;

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.delegation.create',
    'access_delegations',
    v_delegation_id,
    jsonb_build_object(
      'source_membership_id', v_source.id,
      'source_user_id', v_source.user_id,
      'delegated_to_user_id', p_delegated_to_user_id,
      'actor_user_id', auth.uid(),
      'role_id', v_source.role_id
    )
  );

  return v_delegation_id;
end;
$$;

create or replace function qarar_iam.admin_revoke_delegation(
  p_delegation_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_source_membership_id uuid;
  v_source_role_id uuid;
  v_source_unit_id uuid;
begin
  if v_org is null then
    raise exception 'current organization is required' using errcode = '42501';
  end if;

  select d.source_membership_id, m.role_id, m.governance_unit_id
    into v_source_membership_id, v_source_role_id, v_source_unit_id
  from qarar_iam.access_delegations d
  join qarar_iam.memberships m
    on m.id = d.source_membership_id
   and m.organization_id = d.organization_id
  where d.id = p_delegation_id
    and d.organization_id = v_org
    and d.status = 'active'
  for update of d;

  if v_source_membership_id is null then
    raise exception 'active delegation not found';
  end if;

  perform qarar_iam.assert_role_grant_authority(v_org, v_source_role_id, 'revoke');
  perform qarar_iam.assert_permission('iam.roles.revoke', v_source_unit_id);

  update qarar_iam.access_delegations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_user_id = auth.uid(),
      reason = coalesce(reason, '') || E'\nRevoked: ' || coalesce(nullif(btrim(p_reason), ''), '')
  where id = p_delegation_id
    and organization_id = v_org
    and status = 'active';

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.delegation.revoke',
    'access_delegations',
    p_delegation_id,
    jsonb_build_object(
      'source_membership_id', v_source_membership_id,
      'source_role_id', v_source_role_id,
      'reason', nullif(btrim(p_reason), '')
    )
  );
end;
$$;

-- New internals are default-deny even if a future migration changes PostgreSQL
-- default privileges.  Existing command grants are preserved by CREATE OR
-- REPLACE, so only the newly introduced private routines are revoked here.
alter function qarar_iam.is_system_authority_context() owner to qarar_iam_executor;
alter function qarar_iam.lock_iam_authority_boundary(uuid, uuid) owner to qarar_iam_executor;
alter function qarar_iam.role_requires_system_administrator(uuid, uuid) owner to qarar_iam_executor;
alter function qarar_iam.assert_role_grant_authority(uuid, uuid, text) owner to qarar_iam_executor;
alter function qarar_iam.assert_role_is_not_automatically_provisionable(uuid, uuid) owner to qarar_iam_executor;
alter function qarar_iam.assert_elevated_role_has_no_automatic_provisioning(uuid, uuid) owner to qarar_iam_executor;
alter function qarar_iam.enforce_role_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_role_permission_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_permission_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_membership_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_invitation_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_sso_provider_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_sso_group_mapping_authority_boundary() owner to qarar_iam_executor;
alter function qarar_iam.enforce_delegation_authority_boundary() owner to qarar_iam_executor;

revoke all on function qarar_iam.is_system_authority_context() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.lock_iam_authority_boundary(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.role_requires_system_administrator(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.assert_role_grant_authority(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.assert_role_is_not_automatically_provisionable(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.assert_elevated_role_has_no_automatic_provisioning(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_role_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_role_permission_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_permission_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_membership_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_invitation_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_sso_provider_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_sso_group_mapping_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.enforce_delegation_authority_boundary() from public, anon, authenticated, service_role;
revoke all on function qarar_iam.admin_create_delegation(uuid, uuid, timestamp with time zone, timestamp with time zone, text) from public, anon, authenticated, service_role;
revoke all on function qarar_iam.admin_revoke_delegation(uuid, text) from public, anon, authenticated, service_role;

insert into qarar_architecture.function_registry(
  function_oid,
  function_name,
  identity_arguments,
  module_code,
  owning_schema,
  is_rls_predicate
)
select
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  'iam',
  'qarar_iam',
  false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_iam'
  and p.proname = any(array[
    'is_system_authority_context',
    'lock_iam_authority_boundary',
    'role_requires_system_administrator',
    'assert_role_grant_authority',
    'assert_role_is_not_automatically_provisionable',
    'assert_elevated_role_has_no_automatic_provisioning',
    'enforce_role_authority_boundary',
    'enforce_role_permission_authority_boundary',
    'enforce_permission_authority_boundary',
    'enforce_membership_authority_boundary',
    'enforce_invitation_authority_boundary',
    'enforce_sso_provider_authority_boundary',
    'enforce_sso_group_mapping_authority_boundary',
    'enforce_delegation_authority_boundary',
    'admin_create_delegation',
    'admin_revoke_delegation'
  ]::name[])
on conflict (function_oid) do update
set function_name = excluded.function_name,
    identity_arguments = excluded.identity_arguments,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema,
    is_rls_predicate = excluded.is_rls_predicate;

comment on function qarar_iam.role_requires_system_administrator(uuid, uuid) is
  'Returns true when a role has organization/system scope or an active organization/system permission.';
comment on function qarar_iam.admin_create_delegation(uuid, uuid, timestamp with time zone, timestamp with time zone, text) is
  'Phase 0 authority boundary: only the source member or a system administrator may delegate; elevated authority is system-admin-only and audit records the actual actor.';
comment on function qarar_iam.admin_revoke_delegation(uuid, text) is
  'Phase 0 authority boundary: revocation of elevated delegated authority is system-admin-only.';

do $$
declare
  v_unsafe_functions integer;
begin
  select count(*)
    into v_unsafe_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'qarar_iam'
    and p.proname = any(array[
      'is_system_authority_context',
      'lock_iam_authority_boundary',
      'role_requires_system_administrator',
      'assert_role_grant_authority',
      'assert_role_is_not_automatically_provisionable',
      'assert_elevated_role_has_no_automatic_provisioning',
      'enforce_role_authority_boundary',
      'enforce_role_permission_authority_boundary',
      'enforce_permission_authority_boundary',
      'enforce_membership_authority_boundary',
      'enforce_invitation_authority_boundary',
      'enforce_sso_provider_authority_boundary',
      'enforce_sso_group_mapping_authority_boundary',
      'enforce_delegation_authority_boundary',
      'admin_create_delegation',
      'admin_revoke_delegation'
    ]::name[])
    and (
      pg_get_userbyid(p.proowner) <> 'qarar_iam_executor'
      or has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('service_role', p.oid, 'execute')
    );

  if v_unsafe_functions <> 0 then
    raise exception 'IAM authority containment failed: % private routines are not default-deny', v_unsafe_functions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
