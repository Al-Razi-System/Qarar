-- Phase 0 SSO containment: domain ownership must never be self-attested by a
-- browser/API client.  Domain proof is deliberately fail-closed until a
-- trusted server-side verification workflow is introduced.

-- Every historical verification timestamp was client self-attested, so it is
-- not evidence of ownership. Disable all active domains and erase every old
-- verification timestamp. This intentionally pauses SSO until each domain is
-- re-verified by a future trusted server-side workflow. The update fires
-- audit_sso_domains_changes, preserving before/after values in the audit log.
update qarar_iam.sso_domains
set status = 'disabled',
    verified_at = null
where status = 'active'
   or verified_at is not null;

-- Make the safe state structural, not merely a convention in the RPC.
alter table qarar_iam.sso_domains
  drop constraint if exists sso_domains_active_requires_verification;

alter table qarar_iam.sso_domains
  add constraint sso_domains_active_requires_verification
  check (status <> 'active' or verified_at is not null);

-- Clients must use the reviewed RPC.  Do not leave a direct DML escape hatch
-- that can write verified_at independently of that contract.
revoke insert, update, delete on table public.sso_domains
  from public, anon, authenticated;
revoke insert, update, delete on table qarar_iam.sso_domains
  from public, anon, authenticated;
drop policy if exists "iam admins can manage sso domains" on qarar_iam.sso_domains;

-- Keep the existing public contract signature for compatibility, but reject
-- the legacy self-attested flag.  New domains are intentionally disabled and
-- pending until a future trusted verification service records verified_at.
create or replace function qarar_iam.admin_upsert_sso_domain(
  p_sso_provider_id uuid,
  p_domain text,
  p_verified boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_domain_id uuid;
  v_domain text := lower(btrim(p_domain));
begin
  perform qarar_iam.assert_permission('iam.sso.manage');

  if p_verified is true then
    raise exception 'SSO domain verification must be completed by the trusted verification service'
      using errcode = '42501';
  end if;

  if v_domain is null or v_domain = '' then
    raise exception 'SSO domain is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from qarar_iam.sso_identity_providers
    where id = p_sso_provider_id
      and organization_id = v_org
  ) then
    raise exception 'SSO provider not found in current organization';
  end if;

  insert into qarar_iam.sso_domains (
    organization_id,
    sso_provider_id,
    domain,
    status,
    verified_at
  )
  values (
    v_org,
    p_sso_provider_id,
    v_domain,
    'disabled',
    null
  )
  on conflict (organization_id, domain) do update
  set sso_provider_id = excluded.sso_provider_id,
      status = case
        when qarar_iam.sso_domains.verified_at is null then 'disabled'
        else qarar_iam.sso_domains.status
      end,
      updated_at = now()
  returning id into v_domain_id;

  perform qarar_audit.append_audit_log(
    v_org,
    'iam.sso_domain.upsert',
    'sso_domains',
    v_domain_id,
    jsonb_build_object(
      'domain', v_domain,
      'verification_requested', false,
      'verification_state', 'pending_or_preserved'
    )
  );
  return v_domain_id;
end;
$$;

comment on function qarar_iam.admin_upsert_sso_domain(uuid, text, boolean) is
  'Registers a pending SSO domain. p_verified=true is rejected; trusted server-side domain verification is required before activation.';

-- Defense in depth: login admission explicitly requires evidence of ownership,
-- even though the table constraint also prevents active unverified domains.
create or replace function qarar_iam.register_current_sso_login(
  p_full_name_ar text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_sso_provider_id uuid := qarar_iam.current_sso_provider_id();
  v_provider qarar_iam.sso_identity_providers%rowtype;
  v_domain text;
  v_user_id uuid;
  v_invitation qarar_iam.user_invitations%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'authenticated user is required';
  end if;

  if v_email is null or position('@' in v_email) <= 1 then
    raise exception 'authenticated email claim is required';
  end if;

  if v_sso_provider_id is null then
    raise exception 'sso_provider_id claim is required';
  end if;

  select *
  into v_provider
  from qarar_iam.sso_identity_providers
  where supabase_sso_provider_id = v_sso_provider_id
    and status = 'active';

  if v_provider.id is null then
    raise exception 'active SSO provider is not registered for this project';
  end if;

  v_domain := split_part(v_email, '@', 2);

  if not exists (
    select 1
    from qarar_iam.sso_domains d
    where d.sso_provider_id = v_provider.id
      and d.organization_id = v_provider.organization_id
      and d.domain = v_domain
      and d.status = 'active'
      and d.verified_at is not null
  ) then
    raise exception 'email domain is not verified for this SSO provider'
      using errcode = '42501';
  end if;

  select *
  into v_invitation
  from qarar_iam.user_invitations
  where organization_id = v_provider.organization_id
    and email = v_email
    and invitation_status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_provider.provisioning_mode = 'disabled' then
    raise exception 'SSO provisioning is disabled for this provider';
  elsif v_provider.provisioning_mode = 'invited_only' and v_invitation.id is null then
    raise exception 'SSO user must have a pending invitation';
  end if;

  insert into qarar_iam.users (
    id,
    organization_id,
    full_name_ar,
    email,
    status,
    is_system_admin
  )
  values (
    v_auth_user_id,
    v_provider.organization_id,
    coalesce(nullif(btrim(p_full_name_ar), ''), v_email),
    v_email,
    'active',
    false
  )
  on conflict (id) do update
  set email = excluded.email,
      status = case when qarar_iam.users.status = 'suspended' then qarar_iam.users.status else 'active' end,
      updated_at = now()
  where qarar_iam.users.organization_id = excluded.organization_id
  returning id into v_user_id;

  if v_user_id is null then
    raise exception 'authenticated user already belongs to another organization';
  end if;

  insert into qarar_iam.user_identity_links (
    organization_id,
    user_id,
    provider_id,
    external_subject,
    external_email,
    last_login_at,
    status
  )
  values (
    v_provider.organization_id,
    v_user_id,
    v_provider.id,
    v_auth_user_id::text,
    v_email,
    now(),
    'active'
  )
  on conflict (organization_id, user_id, provider_id) do update
  set external_email = excluded.external_email,
      last_login_at = now(),
      status = 'active';

  if v_invitation.id is not null then
    update qarar_iam.user_invitations
    set invitation_status = 'accepted',
        accepted_by_user_id = v_user_id,
        accepted_at = now()
    where id = v_invitation.id;

    if v_invitation.role_id is not null and v_invitation.governance_unit_id is not null then
      insert into qarar_iam.memberships (
        organization_id,
        user_id,
        governance_unit_id,
        role_id,
        membership_status
      )
      values (
        v_provider.organization_id,
        v_user_id,
        v_invitation.governance_unit_id,
        v_invitation.role_id,
        'active'
      )
      on conflict (organization_id, user_id, governance_unit_id, role_id, start_date) do nothing;
    end if;
  elsif v_provider.provisioning_mode = 'jit'
        and v_provider.default_role_id is not null
        and v_provider.default_governance_unit_id is not null then
    insert into qarar_iam.memberships (
      organization_id,
      user_id,
      governance_unit_id,
      role_id,
      membership_status
    )
    values (
      v_provider.organization_id,
      v_user_id,
      v_provider.default_governance_unit_id,
      v_provider.default_role_id,
      'active'
    )
    on conflict (organization_id, user_id, governance_unit_id, role_id, start_date) do nothing;
  end if;

  perform qarar_audit.append_audit_log(
    v_provider.organization_id,
    'iam.sso.login',
    'users',
    v_user_id,
    jsonb_build_object('sso_provider_id', v_sso_provider_id, 'email', v_email)
  );
  return v_user_id;
end;
$$;

comment on function qarar_iam.register_current_sso_login(text) is
  'Registers a SSO login only after the provider is active and the email domain is active with verified_at set.';

do $$
begin
  if exists (
    select 1
    from qarar_iam.sso_domains
    where status = 'active'
       or verified_at is not null
  ) then
    raise exception 'SSO domain containment failed: active or historically verified domains remain';
  end if;
end;
$$;

notify pgrst, 'reload schema';
