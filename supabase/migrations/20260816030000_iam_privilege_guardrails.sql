-- Phase 0 IAM privilege guardrails.
--
-- The existing role-assignment implementation read role_scope but never used it,
-- allowing a unit-scoped role administrator to assign or revoke organization and
-- system roles.  Status and session controls also accepted iam.users.manage from
-- a delegated administrator without protecting system administrators.

do $$
begin
  if to_regprocedure('qarar_iam.admin_assign_role(uuid,uuid,uuid,text,date,date)') is null
     or to_regprocedure('qarar_iam.admin_revoke_membership(uuid,text)') is null
     or to_regprocedure('qarar_iam.admin_update_user_status(uuid,text,text)') is null
     or to_regprocedure('qarar_iam.service_apply_user_status(uuid,uuid,text,text)') is null
     or to_regprocedure('qarar_iam.service_revoke_auth_sessions(uuid,uuid,uuid,text)') is null
  then
    raise exception 'IAM privilege guardrails require the established IAM command surface';
  end if;
end;
$$;

-- This invariant is deliberately enforced at the data boundary as a backstop for
-- every path that removes an active system administrator, including direct DML.
-- The command functions below take the same organization advisory lock before
-- they inspect or change a user.
create or replace function qarar_iam.enforce_active_system_administrator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.is_system_admin
     and old.status = 'active'
  then
    if tg_op = 'DELETE' then
      -- A direct profile deletion is also a removal of the administrator.
      -- Keep this branch separate so DELETE never dereferences NEW.
      null;
    elsif new.organization_id is distinct from old.organization_id then
      -- Moving the profile removes this administrator from the original tenant.
      null;
    elsif new.status = 'active' and new.is_system_admin is true then
      return new;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(old.organization_id::text, 2026081603)
    );

    if not exists (
      select 1
      from qarar_iam.users u
      where u.organization_id = old.organization_id
        and u.id <> old.id
        and u.is_system_admin
        and u.status = 'active'
    ) then
      raise exception 'at least one active system administrator is required'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

alter function qarar_iam.enforce_active_system_administrator()
  owner to qarar_iam_executor;
revoke all on function qarar_iam.enforce_active_system_administrator()
  from public, anon, authenticated, service_role, qarar_api_executor;

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
  and p.proname = 'enforce_active_system_administrator'
  and pg_get_function_identity_arguments(p.oid) = ''
on conflict (function_oid) do update
set function_name = excluded.function_name,
    identity_arguments = excluded.identity_arguments,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema,
    is_rls_predicate = excluded.is_rls_predicate;

drop trigger if exists users_enforce_active_system_administrator on qarar_iam.users;
create trigger users_enforce_active_system_administrator
before update of status, is_system_admin, organization_id or delete on qarar_iam.users
for each row
execute function qarar_iam.enforce_active_system_administrator();

create or replace function qarar_iam.admin_assign_role(
  p_user_id uuid,
  p_role_id uuid,
  p_governance_unit_id uuid,
  p_membership_title text default null,
  p_start_date date default current_date,
  p_end_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_membership_id uuid;
  v_role_scope text;
begin
  if v_org is null then
    raise exception 'current organization is required' using errcode = '42501';
  end if;

  if p_governance_unit_id is null then
    raise exception 'governance unit is required for role assignment' using errcode = '22023';
  end if;

  perform qarar_iam.assert_permission('iam.roles.assign', p_governance_unit_id);

  select r.role_scope
    into v_role_scope
  from qarar_iam.roles r
  where r.id = p_role_id
    and r.organization_id = v_org
    and r.is_active = true;

  if v_role_scope is null then
    raise exception 'active role not found in current organization';
  end if;

  -- Organization and system roles carry authority outside the target unit.  Their
  -- assignment therefore cannot be delegated merely by a unit-scoped permission.
  if v_role_scope in ('organization', 'system')
     and not qarar_iam.is_system_admin()
  then
    raise exception 'only a system administrator may assign organization or system roles'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from qarar_iam.users u
    where u.id = p_user_id
      and u.organization_id = v_org
      and u.status = 'active'
  ) then
    raise exception 'active user not found in current organization';
  end if;

  if not exists (
    select 1
    from qarar_core.governance_units gu
    where gu.id = p_governance_unit_id
      and gu.organization_id = v_org
      and gu.status = 'active'
  ) then
    raise exception 'active governance unit not found in current organization';
  end if;

  insert into qarar_iam.memberships (
    organization_id,
    user_id,
    governance_unit_id,
    role_id,
    membership_title,
    membership_status,
    start_date,
    end_date
  )
  values (
    v_org,
    p_user_id,
    p_governance_unit_id,
    p_role_id,
    nullif(btrim(coalesce(p_membership_title, '')), ''),
    'active',
    coalesce(p_start_date, current_date),
    p_end_date
  )
  returning id into v_membership_id;

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.role.assign',
    'memberships',
    v_membership_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'role_id', p_role_id,
      'governance_unit_id', p_governance_unit_id,
      'role_scope', v_role_scope
    )
  );

  return v_membership_id;
end;
$$;

create or replace function qarar_iam.admin_revoke_membership(
  p_membership_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_unit_id uuid;
  v_role_scope text;
begin
  if v_org is null then
    raise exception 'current organization is required' using errcode = '42501';
  end if;

  select m.governance_unit_id, r.role_scope
    into v_unit_id, v_role_scope
  from qarar_iam.memberships m
  join qarar_iam.roles r
    on r.id = m.role_id
   and r.organization_id = m.organization_id
  where m.id = p_membership_id
    and m.organization_id = v_org;

  if v_unit_id is null then
    raise exception 'membership not found in current organization';
  end if;

  if v_role_scope in ('organization', 'system')
     and not qarar_iam.is_system_admin()
  then
    raise exception 'only a system administrator may revoke organization or system roles'
      using errcode = '42501';
  end if;

  perform qarar_iam.assert_permission('iam.roles.revoke', v_unit_id);

  update qarar_iam.memberships
  set membership_status = 'ended',
      end_date = coalesce(end_date, current_date)
  where id = p_membership_id
    and organization_id = v_org;

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.role.revoke',
    'memberships',
    p_membership_id,
    jsonb_build_object('reason', p_reason, 'role_scope', v_role_scope)
  );
end;
$$;

create or replace function qarar_iam.admin_update_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_target_is_system_admin boolean;
  v_target_status text;
begin
  if v_org is null then
    raise exception 'current organization is required' using errcode = '42501';
  end if;

  perform qarar_iam.assert_permission('iam.users.manage');

  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid user status: %', p_status;
  end if;

  if p_user_id = auth.uid() and p_status <> 'active' then
    raise exception 'administrators cannot deactivate their own active profile';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 2026081603));

  select u.is_system_admin, u.status
    into v_target_is_system_admin, v_target_status
  from qarar_iam.users u
  where u.id = p_user_id
    and u.organization_id = v_org
  for update;

  if not found then
    raise exception 'user not found in current organization';
  end if;

  if v_target_is_system_admin
     and v_target_status = 'active'
     and p_status <> 'active'
  then
    if not qarar_iam.is_system_admin() then
      raise exception 'only a system administrator may deactivate another system administrator'
        using errcode = '42501';
    end if;

    if not exists (
      select 1
      from qarar_iam.users u
      where u.organization_id = v_org
        and u.id <> p_user_id
        and u.is_system_admin
        and u.status = 'active'
    ) then
      raise exception 'at least one active system administrator is required'
        using errcode = '23514';
    end if;
  end if;

  update qarar_iam.users
  set status = p_status
  where id = p_user_id
    and organization_id = v_org;

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.user.status_update',
    'users',
    p_user_id,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
end;
$$;

create or replace function qarar_iam.service_apply_user_status(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid;
  v_target_is_system_admin boolean;
  v_target_status text;
  v_actor_is_system_admin boolean;
  v_sessions_revoked integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid user status';
  end if;

  if not qarar_iam.actor_has_permission(p_actor_user_id, 'iam.users.manage') then
    raise exception 'permission denied: iam.users.manage' using errcode = '42501';
  end if;

  if p_actor_user_id = p_user_id and p_status <> 'active' then
    raise exception 'administrators cannot deactivate their own profile';
  end if;

  select u.organization_id
    into v_org
  from qarar_iam.users u
  where u.id = p_user_id;

  if v_org is null then
    raise exception 'user not found';
  end if;

  if v_org <> (
    select u.organization_id
    from qarar_iam.users u
    where u.id = p_actor_user_id
  ) then
    raise exception 'cross-organization user management is forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 2026081603));

  select u.is_system_admin, u.status
    into v_target_is_system_admin, v_target_status
  from qarar_iam.users u
  where u.id = p_user_id
    and u.organization_id = v_org
  for update;

  if not found then
    raise exception 'user not found';
  end if;

  if v_target_is_system_admin
     and v_target_status = 'active'
     and p_status <> 'active'
  then
    select coalesce(u.is_system_admin, false)
      into v_actor_is_system_admin
    from qarar_iam.users u
    where u.id = p_actor_user_id
      and u.organization_id = v_org
      and u.status = 'active';

    if not coalesce(v_actor_is_system_admin, false) then
      raise exception 'only a system administrator may deactivate another system administrator'
        using errcode = '42501';
    end if;

    if not exists (
      select 1
      from qarar_iam.users u
      where u.organization_id = v_org
        and u.id <> p_user_id
        and u.is_system_admin
        and u.status = 'active'
    ) then
      raise exception 'at least one active system administrator is required'
        using errcode = '23514';
    end if;
  end if;

  update qarar_iam.users
  set status = p_status
  where id = p_user_id
    and organization_id = v_org;

  if p_status <> 'active' then
    delete from auth.sessions
    where user_id = p_user_id;
    get diagnostics v_sessions_revoked = row_count;

    update qarar_iam.user_sessions
    set revoked_at = coalesce(revoked_at, now()),
        revocation_reason = coalesce(p_reason, p_status)
    where user_id = p_user_id
      and revoked_at is null;
  end if;

  insert into qarar_audit.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_org,
    p_actor_user_id,
    'iam.user.status_update',
    'users',
    p_user_id,
    jsonb_build_object(
      'status', p_status,
      'reason', p_reason,
      'auth_sessions_revoked', v_sessions_revoked
    )
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'status', p_status,
    'auth_sessions_revoked', v_sessions_revoked
  );
end;
$$;

create or replace function qarar_iam.service_revoke_auth_sessions(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_auth_session_id uuid default null,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid;
  v_target_is_system_admin boolean;
  v_actor_is_system_admin boolean;
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_actor_user_id <> p_user_id
     and not qarar_iam.actor_has_permission(p_actor_user_id, 'iam.sessions.manage')
     and not qarar_iam.actor_has_permission(p_actor_user_id, 'iam.users.manage')
  then
    raise exception 'permission denied: iam.sessions.manage' using errcode = '42501';
  end if;

  select u.organization_id, u.is_system_admin
    into v_org, v_target_is_system_admin
  from qarar_iam.users u
  where u.id = p_user_id;

  if v_org is null
     or v_org <> (
       select u.organization_id
       from qarar_iam.users u
       where u.id = p_actor_user_id
     )
  then
    raise exception 'user not found in actor organization' using errcode = '42501';
  end if;

  if v_target_is_system_admin and p_actor_user_id <> p_user_id then
    select coalesce(u.is_system_admin, false)
      into v_actor_is_system_admin
    from qarar_iam.users u
    where u.id = p_actor_user_id
      and u.organization_id = v_org
      and u.status = 'active';

    if not coalesce(v_actor_is_system_admin, false) then
      raise exception 'only a system administrator may revoke another system administrator''s sessions'
        using errcode = '42501';
    end if;
  end if;

  delete from auth.sessions
  where user_id = p_user_id
    and (p_auth_session_id is null or id = p_auth_session_id);
  get diagnostics v_count = row_count;

  update qarar_iam.user_sessions
  set revoked_at = coalesce(revoked_at, now()),
      revocation_reason = coalesce(p_reason, 'revoked')
  where user_id = p_user_id
    and (p_auth_session_id is null or auth_session_id = p_auth_session_id)
    and revoked_at is null;

  insert into qarar_audit.audit_logs(
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_org,
    p_actor_user_id,
    'iam.auth_sessions.revoke',
    'users',
    p_user_id,
    jsonb_build_object(
      'auth_session_id', p_auth_session_id,
      'revoked_count', v_count,
      'reason', p_reason
    )
  );

  return v_count;
end;
$$;

comment on function qarar_iam.admin_assign_role(uuid,uuid,uuid,text,date,date) is
  'Phase 0 guardrail: organization and system role assignment requires an active system administrator.';
comment on function qarar_iam.admin_revoke_membership(uuid,text) is
  'Phase 0 guardrail: organization and system role revocation requires an active system administrator.';
comment on function qarar_iam.admin_update_user_status(uuid,text,text) is
  'Phase 0 guardrail: delegated user managers cannot disable system administrators; at least one active system administrator is required.';
comment on function qarar_iam.service_apply_user_status(uuid,uuid,text,text) is
  'Phase 0 guardrail: delegated user managers cannot disable system administrators; at least one active system administrator is required.';
comment on function qarar_iam.service_revoke_auth_sessions(uuid,uuid,uuid,text) is
  'Phase 0 guardrail: delegated user managers cannot revoke a different system administrator session.';

notify pgrst, 'reload schema';
