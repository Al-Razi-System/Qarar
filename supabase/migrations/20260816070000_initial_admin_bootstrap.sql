-- Controlled first-administrator bootstrap.
--
-- Phase 0 deliberately removed client access to bootstrap_current_user_profile.
-- This replacement is a one-time, service-only operation for an organization
-- with no application profiles.  It never creates an Auth identity, accepts no
-- caller-selected privilege flag, and records the approved bootstrap lifecycle.

-- The IAM executor already owns the reviewed IAM command surface.  Give it
-- only the Auth identity lookup needed by this command; audit writes continue
-- through the existing allowlisted qarar_audit.append_audit_log routine.
grant usage on schema auth to qarar_iam_executor;
grant select on table auth.users to qarar_iam_executor;

create or replace function qarar_iam.service_bootstrap_organization_admin(
  p_auth_user_id uuid,
  p_organization_code text,
  p_email text,
  p_full_name_ar text,
  p_full_name_en text,
  p_employee_no text,
  p_mobile text,
  p_job_title text,
  p_approval_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, qarar_core, qarar_iam, qarar_audit
as $$
declare
  v_organization qarar_core.organizations%rowtype;
  v_auth_user auth.users%rowtype;
  v_organization_code text := btrim(coalesce(p_organization_code, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_full_name_ar text := btrim(coalesce(p_full_name_ar, ''));
  v_full_name_en text := nullif(btrim(coalesce(p_full_name_en, '')), '');
  v_employee_no text := nullif(btrim(coalesce(p_employee_no, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  v_job_title text := nullif(btrim(coalesce(p_job_title, '')), '');
  v_approval_reference text := btrim(coalesce(p_approval_reference, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  if p_auth_user_id is null then
    raise exception 'Auth user id is required' using errcode = '22023';
  end if;

  if char_length(v_organization_code) < 1 or char_length(v_organization_code) > 64 then
    raise exception 'organization code must be between 1 and 64 characters' using errcode = '22023';
  end if;

  if char_length(v_email) < 3
     or char_length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'a valid email address is required' using errcode = '22023';
  end if;

  if char_length(v_full_name_ar) < 2 or char_length(v_full_name_ar) > 200 then
    raise exception 'Arabic full name must be between 2 and 200 characters' using errcode = '22023';
  end if;

  if (v_full_name_en is not null and char_length(v_full_name_en) > 200)
     or (v_employee_no is not null and char_length(v_employee_no) > 64)
     or (v_mobile is not null and char_length(v_mobile) > 32)
     or (v_job_title is not null and char_length(v_job_title) > 200) then
    raise exception 'optional profile field exceeds its allowed length' using errcode = '22023';
  end if;

  -- Approval references are ticket-like values, not free text.  They make the
  -- external approval traceable without putting any secret in the request.
  if char_length(v_approval_reference) < 8
     or char_length(v_approval_reference) > 128
     or v_approval_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$' then
    raise exception 'approval reference must be 8-128 ticket-safe characters' using errcode = '22023';
  end if;

  -- Serialize bootstrap attempts for this organization before reading its
  -- state. The advisory lock is sufficient and avoids granting the IAM
  -- executor UPDATE on the core organizations table merely for FOR UPDATE.
  perform pg_advisory_xact_lock(
    hashtextextended('qarar.bootstrap.organization.admin:' || v_organization_code, 0)
  );

  select *
    into v_organization
  from qarar_core.organizations
  where code = v_organization_code
    and status = 'active';

  if not found then
    raise exception 'active organization not found for bootstrap' using errcode = 'P0002';
  end if;

  select *
    into v_auth_user
  from auth.users
  where id = p_auth_user_id;

  if not found then
    raise exception 'Auth user not found for bootstrap' using errcode = 'P0002';
  end if;

  if v_auth_user.email is null or lower(btrim(v_auth_user.email)) <> v_email then
    raise exception 'Auth user email does not match approved bootstrap email' using errcode = '22023';
  end if;

  if coalesce(
       nullif(to_jsonb(v_auth_user) ->> 'email_confirmed_at', '')::timestamptz,
       nullif(to_jsonb(v_auth_user) ->> 'confirmed_at', '')::timestamptz
     ) is null then
    raise exception 'Auth user email must be confirmed before bootstrap' using errcode = '42501';
  end if;

  if nullif(to_jsonb(v_auth_user) ->> 'banned_until', '')::timestamptz > clock_timestamp() then
    raise exception 'Auth user is currently banned' using errcode = '42501';
  end if;

  if exists (
    select 1
    from qarar_iam.users
    where id = p_auth_user_id
  ) then
    raise exception 'Auth user already has an application profile' using errcode = '23505';
  end if;

  if exists (
    select 1
    from qarar_iam.users
    where organization_id = v_organization.id
  ) then
    raise exception 'organization bootstrap is already completed' using errcode = '23505';
  end if;

  -- Deliberately write the request audit event before the privileged insert,
  -- then a completion event afterwards.  Both remain atomically consistent
  -- with the profile creation; failed transactions leave no misleading success.
  perform qarar_audit.append_audit_log(
    v_organization.id,
    'iam.bootstrap.admin.requested',
    'users',
    p_auth_user_id,
    jsonb_build_object(
      'approval_reference', v_approval_reference,
      'organization_code', v_organization.code,
      'workflow', 'controlled_server_bootstrap'
    )
  );

  insert into qarar_iam.users(
    id,
    organization_id,
    employee_no,
    full_name_ar,
    full_name_en,
    email,
    mobile,
    job_title,
    status,
    is_system_admin
  ) values (
    p_auth_user_id,
    v_organization.id,
    v_employee_no,
    v_full_name_ar,
    v_full_name_en,
    v_email,
    v_mobile,
    v_job_title,
    'active',
    true
  );

  perform qarar_audit.append_audit_log(
    v_organization.id,
    'iam.bootstrap.admin.completed',
    'users',
    p_auth_user_id,
    jsonb_build_object(
      'approval_reference', v_approval_reference,
      'organization_code', v_organization.code,
      'workflow', 'controlled_server_bootstrap',
      'is_system_admin', true
    )
  );

  return jsonb_build_object(
    'user_id', p_auth_user_id,
    'organization_id', v_organization.id,
    'organization_code', v_organization.code,
    'is_system_admin', true,
    'approval_reference', v_approval_reference
  );
end;
$$;

alter function qarar_iam.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) owner to qarar_iam_executor;
revoke all on function qarar_iam.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant usage on schema qarar_iam to qarar_api_executor;
grant execute on function qarar_iam.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) to qarar_api_executor;

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
  and p.proname = 'service_bootstrap_organization_admin'
  and pg_get_function_identity_arguments(p.oid) =
    'p_auth_user_id uuid, p_organization_code text, p_email text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text, p_approval_reference text'
on conflict (function_oid) do update
set function_name = excluded.function_name,
    identity_arguments = excluded.identity_arguments,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema,
    is_rls_predicate = excluded.is_rls_predicate;

create or replace function api_v1.service_bootstrap_organization_admin(
  p_auth_user_id uuid,
  p_organization_code text,
  p_email text,
  p_full_name_ar text,
  p_full_name_en text,
  p_employee_no text,
  p_mobile text,
  p_job_title text,
  p_approval_reference text
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select qarar_iam.service_bootstrap_organization_admin(
    $1, $2, $3, $4, $5, $6, $7, $8, $9
  );
$$;

alter function api_v1.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) owner to qarar_api_executor;
revoke all on function api_v1.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function api_v1.service_bootstrap_organization_admin(
  uuid, text, text, text, text, text, text, text, text
) to service_role;

insert into qarar_architecture.api_contract_registry(
  api_version,
  contract_name,
  implementation_schema,
  implementation_name,
  identity_arguments,
  module_code,
  audience
) values (
  'v1',
  'service_bootstrap_organization_admin',
  'qarar_iam',
  'service_bootstrap_organization_admin',
  'p_auth_user_id uuid, p_organization_code text, p_email text, p_full_name_ar text, p_full_name_en text, p_employee_no text, p_mobile text, p_job_title text, p_approval_reference text',
  'iam',
  'service_role'
)
on conflict (api_version, contract_name, identity_arguments) do update
set implementation_schema = excluded.implementation_schema,
    implementation_name = excluded.implementation_name,
    module_code = excluded.module_code,
    audience = excluded.audience,
    deprecated_at = null,
    replacement_contract = null;

update qarar_architecture.api_release_registry
set contract_count = (
      select count(*)::integer
      from qarar_architecture.api_contract_registry
      where api_version = 'v1'
    ),
    contract_hash = (
      select md5(string_agg(
        p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' ||
        pg_get_function_result(p.oid) || '|' || r.audience,
        E'\n'
        order by p.proname, pg_get_function_identity_arguments(p.oid)
      ))
      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
       and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry r
        on r.api_version = 'v1'
       and r.contract_name = p.proname
       and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ),
    released_at = '2026-08-16 00:00:00+00',
    notes = 'Phase 0 controlled bootstrap: initial system-administrator provisioning is service-only, Auth-identity verified, approval-bound, and limited to an empty active organization.'
where api_version = 'v1';

do $$
declare
  v_registry_audience text;
  v_owner name;
begin
  select r.audience, pg_get_userbyid(p.proowner)::name
    into v_registry_audience, v_owner
  from qarar_architecture.api_contract_registry r
  join pg_proc p
    on p.proname = r.contract_name
   and pg_get_function_identity_arguments(p.oid) = r.identity_arguments
  join pg_namespace n
    on n.oid = p.pronamespace
   and n.nspname = 'api_v1'
  where r.api_version = 'v1'
    and r.contract_name = 'service_bootstrap_organization_admin';

  if v_registry_audience <> 'service_role'
     or v_owner <> 'qarar_api_executor'
     or has_function_privilege('anon', 'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'api_v1.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('service_role', 'qarar_iam.service_bootstrap_organization_admin(uuid,text,text,text,text,text,text,text,text)', 'execute')
  then
    raise exception 'controlled initial-admin bootstrap API boundary is not secure';
  end if;
end;
$$;

notify pgrst, 'reload schema';
