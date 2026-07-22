-- Production-grade IAM, RBAC, audit, and SSO governance layer.
-- Supabase Auth remains the identity provider. This migration governs
-- application authorization and organization-level SSO mappings.

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  module text not null,
  action text not null,
  context_scope text not null check (context_scope in ('system', 'organization', 'governance_unit', 'execution', 'self')),
  name_ar text not null,
  name_en text,
  description text,
  is_system_permission boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, code),
  check (code = lower(code)),
  check (code ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$')
);

alter table public.permissions drop constraint if exists permissions_code_check;
alter table public.permissions drop constraint if exists permissions_code_check1;
alter table public.permissions drop constraint if exists permissions_code_lower_check;
alter table public.permissions drop constraint if exists permissions_code_format_check;
alter table public.permissions add constraint permissions_code_lower_check check (code = lower(code));
alter table public.permissions add constraint permissions_code_format_check check (code ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$');

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  permission_id uuid not null references public.permissions(id) on delete restrict,
  granted_by_user_id uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, role_id, permission_id),
  foreign key (role_id, organization_id) references public.roles(id, organization_id),
  foreign key (permission_id, organization_id) references public.permissions(id, organization_id),
  foreign key (granted_by_user_id, organization_id) references public.users(id, organization_id)
);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  full_name_ar text,
  role_id uuid references public.roles(id) on delete restrict,
  governance_unit_id uuid references public.governance_units(id) on delete restrict,
  invitation_status text not null default 'pending' check (invitation_status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by_user_id uuid not null references public.users(id) on delete restrict,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  token_hash text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (role_id, organization_id) references public.roles(id, organization_id),
  foreign key (governance_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (invited_by_user_id, organization_id) references public.users(id, organization_id),
  foreign key (accepted_by_user_id, organization_id) references public.users(id, organization_id),
  check (email = lower(email)),
  check (position('@' in email) > 1),
  check (expires_at > created_at)
);

create unique index if not exists uq_pending_user_invitation_email
  on public.user_invitations (organization_id, email)
  where invitation_status = 'pending';

create table if not exists public.sso_identity_providers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_type text not null check (provider_type in ('saml')),
  provider_name text not null,
  supabase_sso_provider_id uuid,
  entity_id text,
  metadata_url text,
  attribute_mapping jsonb not null default '{}'::jsonb,
  default_role_id uuid references public.roles(id) on delete restrict,
  default_governance_unit_id uuid references public.governance_units(id) on delete restrict,
  provisioning_mode text not null default 'invited_only' check (provisioning_mode in ('disabled', 'invited_only', 'jit')),
  status text not null default 'draft' check (status in ('draft', 'active', 'disabled', 'archived')),
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, provider_name),
  unique (supabase_sso_provider_id),
  foreign key (default_role_id, organization_id) references public.roles(id, organization_id),
  foreign key (default_governance_unit_id, organization_id) references public.governance_units(id, organization_id),
  foreign key (created_by_user_id, organization_id) references public.users(id, organization_id),
  check (metadata_url is null or metadata_url ~* '^https://')
);

create table if not exists public.sso_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sso_provider_id uuid not null references public.sso_identity_providers(id) on delete restrict,
  domain text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, domain),
  foreign key (sso_provider_id, organization_id) references public.sso_identity_providers(id, organization_id),
  check (domain = lower(domain)),
  check (domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$')
);

alter table public.sso_domains drop constraint if exists sso_domains_domain_check;
alter table public.sso_domains drop constraint if exists sso_domains_domain_check1;
alter table public.sso_domains drop constraint if exists sso_domains_domain_lower_check;
alter table public.sso_domains drop constraint if exists sso_domains_domain_format_check;
alter table public.sso_domains add constraint sso_domains_domain_lower_check check (domain = lower(domain));
alter table public.sso_domains add constraint sso_domains_domain_format_check check (domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$');

create table if not exists public.user_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  provider_id uuid not null references public.sso_identity_providers(id) on delete restrict,
  external_subject text not null,
  external_email text,
  last_login_at timestamptz,
  linked_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'disabled')),
  unique (id, organization_id),
  unique (provider_id, external_subject),
  unique (organization_id, user_id, provider_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  foreign key (provider_id, organization_id) references public.sso_identity_providers(id, organization_id),
  check (external_email is null or external_email = lower(external_email))
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  locale text not null default 'ar-SA',
  timezone text not null default 'Asia/Riyadh',
  notification_settings jsonb not null default '{}'::jsonb,
  ui_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, user_id),
  foreign key (user_id, organization_id) references public.users(id, organization_id),
  check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

drop trigger if exists set_permissions_updated_at on public.permissions;
drop trigger if exists set_role_permissions_updated_at on public.role_permissions;
drop trigger if exists set_user_invitations_updated_at on public.user_invitations;
drop trigger if exists set_sso_identity_providers_updated_at on public.sso_identity_providers;
drop trigger if exists set_sso_domains_updated_at on public.sso_domains;
drop trigger if exists set_user_preferences_updated_at on public.user_preferences;

create trigger set_permissions_updated_at before update on public.permissions for each row execute function public.set_updated_at();
create trigger set_role_permissions_updated_at before update on public.role_permissions for each row execute function public.set_updated_at();
create trigger set_user_invitations_updated_at before update on public.user_invitations for each row execute function public.set_updated_at();
create trigger set_sso_identity_providers_updated_at before update on public.sso_identity_providers for each row execute function public.set_updated_at();
create trigger set_sso_domains_updated_at before update on public.sso_domains for each row execute function public.set_updated_at();
create trigger set_user_preferences_updated_at before update on public.user_preferences for each row execute function public.set_updated_at();

create or replace function public.jwt_claim_text(claim_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() ->> claim_name, '');
$$;

create or replace function public.current_sso_provider_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_provider text := public.jwt_claim_text('sso_provider_id');
begin
  if v_provider is null then
    return null;
  end if;

  return v_provider::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.has_permission(permission_code text, target_unit_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_system_admin(), false)
    or coalesce(exists (
      select 1
      from public.memberships m
      join public.roles r
        on r.id = m.role_id
       and r.organization_id = m.organization_id
      join public.role_permissions rp
        on rp.role_id = r.id
       and rp.organization_id = m.organization_id
       and rp.is_active = true
      join public.permissions p
        on p.id = rp.permission_id
       and p.organization_id = m.organization_id
       and p.is_active = true
      where m.user_id = auth.uid()
        and m.organization_id = public.current_organization_id()
        and m.membership_status = 'active'
        and r.is_active = true
        and p.code = permission_code
        and (m.end_date is null or m.end_date >= current_date)
        and (
          p.context_scope in ('system', 'organization', 'self')
          or target_unit_id is null
          or m.governance_unit_id = target_unit_id
        )
    ), false);
$$;

create or replace function public.assert_permission(permission_code text, target_unit_id uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(permission_code, target_unit_id) then
    raise exception 'permission denied: %', permission_code using errcode = '42501';
  end if;
end;
$$;

create or replace function public.append_audit_log(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_entity_id uuid;
  v_action text;
  v_metadata jsonb;
begin
  v_org := coalesce(NEW.organization_id, OLD.organization_id);
  v_entity_id := coalesce(NEW.id, OLD.id);
  v_action := lower(TG_TABLE_NAME || '.' || TG_OP);

  v_metadata := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'old', case
      when TG_OP in ('UPDATE', 'DELETE') and TG_TABLE_NAME = 'user_invitations' then to_jsonb(OLD) - 'token_hash'
      when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD)
      else null
    end,
    'new', case
      when TG_OP in ('INSERT', 'UPDATE') and TG_TABLE_NAME = 'user_invitations' then to_jsonb(NEW) - 'token_hash'
      when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW)
      else null
    end
  );

  perform public.append_audit_log(v_org, v_action, TG_TABLE_NAME, v_entity_id, v_metadata);

  return coalesce(NEW, OLD);
end;
$$;

drop policy if exists "authenticated users can append audit logs for their organization" on public.audit_logs;
revoke all on public.audit_logs from authenticated;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_invitations enable row level security;
alter table public.sso_identity_providers enable row level security;
alter table public.sso_domains enable row level security;
alter table public.user_identity_links enable row level security;
alter table public.user_preferences enable row level security;

grant select, insert, update, delete on public.permissions to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_invitations to authenticated;
grant select, insert, update, delete on public.sso_identity_providers to authenticated;
grant select, insert, update, delete on public.sso_domains to authenticated;
grant select, insert, update, delete on public.user_identity_links to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "permissions are visible to authorized users" on public.permissions;
drop policy if exists "iam admins can manage permissions" on public.permissions;
drop policy if exists "role permissions are visible to authorized users" on public.role_permissions;
drop policy if exists "iam admins can manage role permissions" on public.role_permissions;
drop policy if exists "invitations are visible to iam admins" on public.user_invitations;
drop policy if exists "iam admins can manage invitations" on public.user_invitations;
drop policy if exists "sso configuration is visible to iam admins" on public.sso_identity_providers;
drop policy if exists "iam admins can manage sso providers" on public.sso_identity_providers;
drop policy if exists "sso domains are visible to iam admins" on public.sso_domains;
drop policy if exists "iam admins can manage sso domains" on public.sso_domains;
drop policy if exists "users can view their identity links" on public.user_identity_links;
drop policy if exists "iam admins can manage identity links" on public.user_identity_links;
drop policy if exists "users can manage own preferences" on public.user_preferences;
drop policy if exists "iam admins can view user preferences" on public.user_preferences;

create policy "permissions are visible to authorized users"
on public.permissions for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    public.is_system_admin()
    or public.has_role_code(array['governance_admin', 'internal_auditor'])
    or public.has_permission('iam.permissions.read')
  )
);

create policy "iam admins can manage permissions"
on public.permissions for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.permissions.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.permissions.manage'));

create policy "role permissions are visible to authorized users"
on public.role_permissions for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    public.is_system_admin()
    or public.has_role_code(array['governance_admin', 'internal_auditor'])
    or public.has_permission('iam.roles.read')
  )
);

create policy "iam admins can manage role permissions"
on public.role_permissions for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.roles.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.roles.manage'));

create policy "invitations are visible to iam admins"
on public.user_invitations for select
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.users.read'));

create policy "iam admins can manage invitations"
on public.user_invitations for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.users.invite'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.users.invite'));

create policy "sso configuration is visible to iam admins"
on public.sso_identity_providers for select
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.read'));

create policy "iam admins can manage sso providers"
on public.sso_identity_providers for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'));

create policy "sso domains are visible to iam admins"
on public.sso_domains for select
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.read'));

create policy "iam admins can manage sso domains"
on public.sso_domains for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'));

create policy "users can view their identity links"
on public.user_identity_links for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (user_id = auth.uid() or public.has_permission('iam.users.read') or public.has_permission('iam.sso.read'))
);

create policy "iam admins can manage identity links"
on public.user_identity_links for all
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'))
with check (organization_id = public.current_organization_id() and public.has_permission('iam.sso.manage'));

create policy "users can manage own preferences"
on public.user_preferences for all
to authenticated
using (organization_id = public.current_organization_id() and user_id = auth.uid())
with check (organization_id = public.current_organization_id() and user_id = auth.uid());

create policy "iam admins can view user preferences"
on public.user_preferences for select
to authenticated
using (organization_id = public.current_organization_id() and public.has_permission('iam.users.read'));

drop trigger if exists audit_users_changes on public.users;
drop trigger if exists audit_roles_changes on public.roles;
drop trigger if exists audit_memberships_changes on public.memberships;
drop trigger if exists audit_permissions_changes on public.permissions;
drop trigger if exists audit_role_permissions_changes on public.role_permissions;
drop trigger if exists audit_user_invitations_changes on public.user_invitations;
drop trigger if exists audit_sso_identity_providers_changes on public.sso_identity_providers;
drop trigger if exists audit_sso_domains_changes on public.sso_domains;
drop trigger if exists audit_user_identity_links_changes on public.user_identity_links;
drop trigger if exists audit_user_preferences_changes on public.user_preferences;

create trigger audit_users_changes after insert or update or delete on public.users for each row execute function public.audit_row_change();
create trigger audit_roles_changes after insert or update or delete on public.roles for each row execute function public.audit_row_change();
create trigger audit_memberships_changes after insert or update or delete on public.memberships for each row execute function public.audit_row_change();
create trigger audit_permissions_changes after insert or update or delete on public.permissions for each row execute function public.audit_row_change();
create trigger audit_role_permissions_changes after insert or update or delete on public.role_permissions for each row execute function public.audit_row_change();
create trigger audit_user_invitations_changes after insert or update or delete on public.user_invitations for each row execute function public.audit_row_change();
create trigger audit_sso_identity_providers_changes after insert or update or delete on public.sso_identity_providers for each row execute function public.audit_row_change();
create trigger audit_sso_domains_changes after insert or update or delete on public.sso_domains for each row execute function public.audit_row_change();
create trigger audit_user_identity_links_changes after insert or update or delete on public.user_identity_links for each row execute function public.audit_row_change();
create trigger audit_user_preferences_changes after insert or update or delete on public.user_preferences for each row execute function public.audit_row_change();

create or replace function public.get_current_user_access_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'organization_id', u.organization_id,
    'organization_code', o.code,
    'is_system_admin', u.is_system_admin,
    'sso_provider_id', public.current_sso_provider_id(),
    'roles', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'role_id', r.id,
        'code', r.code,
        'scope', r.role_scope,
        'governance_unit_id', m.governance_unit_id
      ))
      from public.memberships m
      join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(distinct p.code order by p.code)
      from public.memberships m
      join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
      join public.role_permissions rp on rp.role_id = r.id and rp.organization_id = m.organization_id and rp.is_active = true
      join public.permissions p on p.id = rp.permission_id and p.organization_id = m.organization_id and p.is_active = true
      where m.user_id = u.id
        and m.organization_id = u.organization_id
        and m.membership_status = 'active'
        and r.is_active = true
        and (m.end_date is null or m.end_date >= current_date)
    ), '[]'::jsonb)
  )
  from public.users u
  join public.organizations o on o.id = u.organization_id
  where u.id = auth.uid()
    and u.status = 'active';
$$;

create or replace function public.admin_create_user_profile(
  p_auth_user_id uuid,
  p_email text,
  p_full_name_ar text,
  p_employee_no text default null,
  p_mobile text default null,
  p_job_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_email text := lower(btrim(p_email));
begin
  perform public.assert_permission('iam.users.manage');

  if p_auth_user_id is null then
    raise exception 'auth user id is required';
  end if;

  if v_org is null then
    raise exception 'current organization is required';
  end if;

  if v_email is null or position('@' in v_email) <= 1 then
    raise exception 'valid email is required';
  end if;

  if p_full_name_ar is null or btrim(p_full_name_ar) = '' then
    raise exception 'Arabic full name is required';
  end if;

  insert into public.users (
    id,
    organization_id,
    employee_no,
    full_name_ar,
    email,
    mobile,
    job_title,
    status,
    is_system_admin
  )
  values (
    p_auth_user_id,
    v_org,
    nullif(btrim(coalesce(p_employee_no, '')), ''),
    btrim(p_full_name_ar),
    v_email,
    nullif(btrim(coalesce(p_mobile, '')), ''),
    nullif(btrim(coalesce(p_job_title, '')), ''),
    'active',
    false
  );

  perform public.append_audit_log(v_org, 'iam.user.create', 'users', p_auth_user_id, jsonb_build_object('email', v_email));
  return p_auth_user_id;
end;
$$;

create or replace function public.admin_update_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  perform public.assert_permission('iam.users.manage');

  if p_status not in ('active', 'inactive', 'suspended') then
    raise exception 'invalid user status: %', p_status;
  end if;

  if p_user_id = auth.uid() and p_status != 'active' then
    raise exception 'administrators cannot deactivate their own active profile';
  end if;

  update public.users
  set status = p_status
  where id = p_user_id
    and organization_id = v_org;

  if not found then
    raise exception 'user not found in current organization';
  end if;

  perform public.append_audit_log(v_org, 'iam.user.status_update', 'users', p_user_id, jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.admin_assign_role(
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
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_membership_id uuid;
  v_role_scope text;
begin
  perform public.assert_permission('iam.roles.assign', p_governance_unit_id);

  if v_org is null then
    raise exception 'current organization is required';
  end if;

  select role_scope
  into v_role_scope
  from public.roles
  where id = p_role_id
    and organization_id = v_org
    and is_active = true;

  if v_role_scope is null then
    raise exception 'active role not found in current organization';
  end if;

  if not exists (select 1 from public.users where id = p_user_id and organization_id = v_org and status = 'active') then
    raise exception 'active user not found in current organization';
  end if;

  if not exists (select 1 from public.governance_units where id = p_governance_unit_id and organization_id = v_org and status = 'active') then
    raise exception 'active governance unit not found in current organization';
  end if;

  insert into public.memberships (
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

  perform public.append_audit_log(v_org, 'iam.role.assign', 'memberships', v_membership_id, jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id, 'governance_unit_id', p_governance_unit_id));
  return v_membership_id;
end;
$$;

create or replace function public.admin_revoke_membership(
  p_membership_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_unit_id uuid;
begin
  select governance_unit_id
  into v_unit_id
  from public.memberships
  where id = p_membership_id
    and organization_id = v_org;

  if v_unit_id is null then
    raise exception 'membership not found in current organization';
  end if;

  perform public.assert_permission('iam.roles.revoke', v_unit_id);

  update public.memberships
  set membership_status = 'ended',
      end_date = coalesce(end_date, current_date)
  where id = p_membership_id
    and organization_id = v_org;

  perform public.append_audit_log(v_org, 'iam.role.revoke', 'memberships', p_membership_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_create_invitation(
  p_email text,
  p_full_name_ar text,
  p_role_id uuid,
  p_governance_unit_id uuid,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_invitation_id uuid;
  v_email text := lower(btrim(p_email));
begin
  perform public.assert_permission('iam.users.invite', p_governance_unit_id);

  if v_email is null or position('@' in v_email) <= 1 then
    raise exception 'valid email is required';
  end if;

  if p_role_id is not null and not exists (select 1 from public.roles where id = p_role_id and organization_id = v_org and is_active = true) then
    raise exception 'active role not found in current organization';
  end if;

  if p_governance_unit_id is not null and not exists (select 1 from public.governance_units where id = p_governance_unit_id and organization_id = v_org and status = 'active') then
    raise exception 'active governance unit not found in current organization';
  end if;

  insert into public.user_invitations (
    organization_id,
    email,
    full_name_ar,
    role_id,
    governance_unit_id,
    invited_by_user_id,
    expires_at
  )
  values (
    v_org,
    v_email,
    nullif(btrim(coalesce(p_full_name_ar, '')), ''),
    p_role_id,
    p_governance_unit_id,
    auth.uid(),
    coalesce(p_expires_at, now() + interval '7 days')
  )
  returning id into v_invitation_id;

  perform public.append_audit_log(v_org, 'iam.invitation.create', 'user_invitations', v_invitation_id, jsonb_build_object('email', v_email, 'role_id', p_role_id));
  return v_invitation_id;
end;
$$;

create or replace function public.admin_revoke_invitation(
  p_invitation_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  perform public.assert_permission('iam.users.invite');

  update public.user_invitations
  set invitation_status = 'revoked',
      revoked_at = now()
  where id = p_invitation_id
    and organization_id = v_org
    and invitation_status = 'pending';

  if not found then
    raise exception 'pending invitation not found in current organization';
  end if;

  perform public.append_audit_log(v_org, 'iam.invitation.revoke', 'user_invitations', p_invitation_id, jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_upsert_sso_provider(
  p_provider_name text,
  p_supabase_sso_provider_id uuid,
  p_metadata_url text,
  p_entity_id text default null,
  p_attribute_mapping jsonb default '{}'::jsonb,
  p_default_role_id uuid default null,
  p_default_governance_unit_id uuid default null,
  p_provisioning_mode text default 'invited_only',
  p_status text default 'draft'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_provider_id uuid;
begin
  perform public.assert_permission('iam.sso.manage');

  if p_provider_name is null or btrim(p_provider_name) = '' then
    raise exception 'provider name is required';
  end if;

  if p_metadata_url is not null and p_metadata_url !~* '^https://' then
    raise exception 'metadata URL must use https';
  end if;

  insert into public.sso_identity_providers (
    organization_id,
    provider_type,
    provider_name,
    supabase_sso_provider_id,
    entity_id,
    metadata_url,
    attribute_mapping,
    default_role_id,
    default_governance_unit_id,
    provisioning_mode,
    status,
    created_by_user_id
  )
  values (
    v_org,
    'saml',
    btrim(p_provider_name),
    p_supabase_sso_provider_id,
    nullif(btrim(coalesce(p_entity_id, '')), ''),
    nullif(btrim(coalesce(p_metadata_url, '')), ''),
    coalesce(p_attribute_mapping, '{}'::jsonb),
    p_default_role_id,
    p_default_governance_unit_id,
    coalesce(p_provisioning_mode, 'invited_only'),
    coalesce(p_status, 'draft'),
    auth.uid()
  )
  on conflict (organization_id, provider_name) do update
  set supabase_sso_provider_id = excluded.supabase_sso_provider_id,
      entity_id = excluded.entity_id,
      metadata_url = excluded.metadata_url,
      attribute_mapping = excluded.attribute_mapping,
      default_role_id = excluded.default_role_id,
      default_governance_unit_id = excluded.default_governance_unit_id,
      provisioning_mode = excluded.provisioning_mode,
      status = excluded.status,
      updated_at = now()
  returning id into v_provider_id;

  perform public.append_audit_log(v_org, 'iam.sso_provider.upsert', 'sso_identity_providers', v_provider_id, jsonb_build_object('provider_name', p_provider_name, 'status', p_status));
  return v_provider_id;
end;
$$;

create or replace function public.admin_upsert_sso_domain(
  p_sso_provider_id uuid,
  p_domain text,
  p_verified boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_domain_id uuid;
  v_domain text := lower(btrim(p_domain));
begin
  perform public.assert_permission('iam.sso.manage');

  if not exists (select 1 from public.sso_identity_providers where id = p_sso_provider_id and organization_id = v_org) then
    raise exception 'SSO provider not found in current organization';
  end if;

  insert into public.sso_domains (
    organization_id,
    sso_provider_id,
    domain,
    verified_at
  )
  values (
    v_org,
    p_sso_provider_id,
    v_domain,
    case when p_verified then now() else null end
  )
  on conflict (organization_id, domain) do update
  set sso_provider_id = excluded.sso_provider_id,
      verified_at = coalesce(excluded.verified_at, public.sso_domains.verified_at),
      status = 'active',
      updated_at = now()
  returning id into v_domain_id;

  perform public.append_audit_log(v_org, 'iam.sso_domain.upsert', 'sso_domains', v_domain_id, jsonb_build_object('domain', v_domain));
  return v_domain_id;
end;
$$;

create or replace function public.register_current_sso_login(
  p_full_name_ar text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_sso_provider_id uuid := public.current_sso_provider_id();
  v_provider public.sso_identity_providers%rowtype;
  v_domain text;
  v_user_id uuid;
  v_invitation public.user_invitations%rowtype;
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
  from public.sso_identity_providers
  where supabase_sso_provider_id = v_sso_provider_id
    and status = 'active';

  if v_provider.id is null then
    raise exception 'active SSO provider is not registered for this project';
  end if;

  v_domain := split_part(v_email, '@', 2);

  if not exists (
    select 1
    from public.sso_domains d
    where d.sso_provider_id = v_provider.id
      and d.organization_id = v_provider.organization_id
      and d.domain = v_domain
      and d.status = 'active'
  ) then
    raise exception 'email domain is not allowed for this SSO provider';
  end if;

  select *
  into v_invitation
  from public.user_invitations
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

  insert into public.users (
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
      status = case when public.users.status = 'suspended' then public.users.status else 'active' end,
      updated_at = now()
  where public.users.organization_id = excluded.organization_id
  returning id into v_user_id;

  if v_user_id is null then
    raise exception 'authenticated user already belongs to another organization';
  end if;

  insert into public.user_identity_links (
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
    update public.user_invitations
    set invitation_status = 'accepted',
        accepted_by_user_id = v_user_id,
        accepted_at = now()
    where id = v_invitation.id;

    if v_invitation.role_id is not null and v_invitation.governance_unit_id is not null then
      insert into public.memberships (
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
    insert into public.memberships (
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

  perform public.append_audit_log(v_provider.organization_id, 'iam.sso.login', 'users', v_user_id, jsonb_build_object('sso_provider_id', v_sso_provider_id, 'email', v_email));
  return v_user_id;
end;
$$;

create or replace function public.admin_search_users(
  p_query text default null,
  p_status text default null,
  p_role_id uuid default null,
  p_governance_unit_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.assert_permission('iam.users.read');

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name_ar', u.full_name_ar,
        'employee_no', u.employee_no,
        'mobile', u.mobile,
        'job_title', u.job_title,
        'status', u.status,
        'is_system_admin', u.is_system_admin,
        'created_at', u.created_at,
        'roles', coalesce((
          select jsonb_agg(jsonb_build_object(
            'membership_id', m.id,
            'role_id', r.id,
            'role_code', r.code,
            'role_name_ar', r.name_ar,
            'governance_unit_id', gu.id,
            'governance_unit_name_ar', gu.name_ar,
            'membership_status', m.membership_status
          ) order by r.code)
          from public.memberships m
          join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
          join public.governance_units gu on gu.id = m.governance_unit_id and gu.organization_id = m.organization_id
          where m.user_id = u.id
            and m.organization_id = u.organization_id
            and m.membership_status = 'active'
        ), '[]'::jsonb)
      )
      order by u.created_at desc
    ), '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'total', (
      select count(*)
      from public.users u2
      where u2.organization_id = v_org
        and (p_status is null or u2.status = p_status)
        and (
          p_query is null
          or u2.email ilike '%' || p_query || '%'
          or u2.full_name_ar ilike '%' || p_query || '%'
          or u2.employee_no ilike '%' || p_query || '%'
        )
        and (
          p_role_id is null
          or exists (
            select 1 from public.memberships m2
            where m2.user_id = u2.id
              and m2.organization_id = u2.organization_id
              and m2.role_id = p_role_id
              and m2.membership_status = 'active'
          )
        )
        and (
          p_governance_unit_id is null
          or exists (
            select 1 from public.memberships m3
            where m3.user_id = u2.id
              and m3.organization_id = u2.organization_id
              and m3.governance_unit_id = p_governance_unit_id
              and m3.membership_status = 'active'
          )
        )
    )
  )
  into v_result
  from (
    select *
    from public.users u
    where u.organization_id = v_org
      and (p_status is null or u.status = p_status)
      and (
        p_query is null
        or u.email ilike '%' || p_query || '%'
        or u.full_name_ar ilike '%' || p_query || '%'
        or u.employee_no ilike '%' || p_query || '%'
      )
      and (
        p_role_id is null
        or exists (
          select 1 from public.memberships m
          where m.user_id = u.id
            and m.organization_id = u.organization_id
            and m.role_id = p_role_id
            and m.membership_status = 'active'
        )
      )
      and (
        p_governance_unit_id is null
        or exists (
          select 1 from public.memberships m
          where m.user_id = u.id
            and m.organization_id = u.organization_id
            and m.governance_unit_id = p_governance_unit_id
            and m.membership_status = 'active'
        )
      )
    order by u.created_at desc
    limit v_limit offset v_offset
  ) u;

  return coalesce(v_result, jsonb_build_object('items', '[]'::jsonb, 'limit', v_limit, 'offset', v_offset, 'total', 0));
end;
$$;

create or replace function public.get_my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authenticated user is required';
  end if;

  select jsonb_build_object(
    'id', u.id,
    'organization_id', u.organization_id,
    'email', u.email,
    'full_name_ar', u.full_name_ar,
    'full_name_en', u.full_name_en,
    'employee_no', u.employee_no,
    'mobile', u.mobile,
    'job_title', u.job_title,
    'status', u.status,
    'is_system_admin', u.is_system_admin,
    'preferences', coalesce((
      select jsonb_build_object(
        'locale', up.locale,
        'timezone', up.timezone,
        'notification_settings', up.notification_settings,
        'ui_settings', up.ui_settings
      )
      from public.user_preferences up
      where up.user_id = u.id
        and up.organization_id = u.organization_id
    ), jsonb_build_object(
      'locale', 'ar-SA',
      'timezone', 'Asia/Riyadh',
      'notification_settings', '{}'::jsonb,
      'ui_settings', '{}'::jsonb
    )),
    'access', public.get_current_user_access_context()
  )
  into v_result
  from public.users u
  where u.id = auth.uid()
    and u.organization_id = v_org
    and u.status = 'active';

  if v_result is null then
    raise exception 'active account profile not found';
  end if;

  return v_result;
end;
$$;

create or replace function public.update_my_profile(
  p_full_name_ar text default null,
  p_full_name_en text default null,
  p_mobile text default null,
  p_job_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  if auth.uid() is null then
    raise exception 'authenticated user is required';
  end if;

  update public.users
  set full_name_ar = coalesce(nullif(btrim(p_full_name_ar), ''), full_name_ar),
      full_name_en = nullif(btrim(coalesce(p_full_name_en, full_name_en, '')), ''),
      mobile = nullif(btrim(coalesce(p_mobile, mobile, '')), ''),
      job_title = nullif(btrim(coalesce(p_job_title, job_title, '')), '')
  where id = auth.uid()
    and organization_id = v_org
    and status = 'active';

  if not found then
    raise exception 'active account profile not found';
  end if;

  perform public.append_audit_log(v_org, 'iam.self.profile_update', 'users', auth.uid(), '{}'::jsonb);
  return public.get_my_account();
end;
$$;

create or replace function public.update_my_preferences(
  p_locale text default null,
  p_timezone text default null,
  p_notification_settings jsonb default null,
  p_ui_settings jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authenticated user is required';
  end if;

  if not exists (select 1 from public.users where id = v_user_id and organization_id = v_org and status = 'active') then
    raise exception 'active account profile not found';
  end if;

  insert into public.user_preferences (
    organization_id,
    user_id,
    locale,
    timezone,
    notification_settings,
    ui_settings
  )
  values (
    v_org,
    v_user_id,
    coalesce(nullif(btrim(p_locale), ''), 'ar-SA'),
    coalesce(nullif(btrim(p_timezone), ''), 'Asia/Riyadh'),
    coalesce(p_notification_settings, '{}'::jsonb),
    coalesce(p_ui_settings, '{}'::jsonb)
  )
  on conflict (organization_id, user_id) do update
  set locale = coalesce(nullif(btrim(p_locale), ''), public.user_preferences.locale),
      timezone = coalesce(nullif(btrim(p_timezone), ''), public.user_preferences.timezone),
      notification_settings = coalesce(p_notification_settings, public.user_preferences.notification_settings),
      ui_settings = coalesce(p_ui_settings, public.user_preferences.ui_settings),
      updated_at = now();

  perform public.append_audit_log(v_org, 'iam.self.preferences_update', 'user_preferences', v_user_id, jsonb_build_object('locale', p_locale, 'timezone', p_timezone));
  return public.get_my_account() -> 'preferences';
end;
$$;

create or replace function public.admin_get_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_result jsonb;
begin
  perform public.assert_permission('iam.users.read');

  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'full_name_ar', u.full_name_ar,
    'full_name_en', u.full_name_en,
    'employee_no', u.employee_no,
    'mobile', u.mobile,
    'job_title', u.job_title,
    'status', u.status,
    'is_system_admin', u.is_system_admin,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', m.id,
        'role_id', r.id,
        'role_code', r.code,
        'role_name_ar', r.name_ar,
        'governance_unit_id', gu.id,
        'governance_unit_name_ar', gu.name_ar,
        'membership_status', m.membership_status,
        'start_date', m.start_date,
        'end_date', m.end_date
      ) order by m.created_at desc)
      from public.memberships m
      join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
      join public.governance_units gu on gu.id = m.governance_unit_id and gu.organization_id = m.organization_id
      where m.user_id = u.id and m.organization_id = u.organization_id
    ), '[]'::jsonb),
    'identity_links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id', il.provider_id,
        'provider_name', sp.provider_name,
        'external_email', il.external_email,
        'last_login_at', il.last_login_at,
        'status', il.status
      ) order by il.linked_at desc)
      from public.user_identity_links il
      join public.sso_identity_providers sp on sp.id = il.provider_id and sp.organization_id = il.organization_id
      where il.user_id = u.id and il.organization_id = u.organization_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.users u
  where u.id = p_user_id
    and u.organization_id = v_org;

  if v_result is null then
    raise exception 'user not found in current organization';
  end if;

  return v_result;
end;
$$;

create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_full_name_ar text default null,
  p_full_name_en text default null,
  p_employee_no text default null,
  p_mobile text default null,
  p_job_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  perform public.assert_permission('iam.users.manage');

  update public.users
  set full_name_ar = coalesce(nullif(btrim(p_full_name_ar), ''), full_name_ar),
      full_name_en = nullif(btrim(coalesce(p_full_name_en, full_name_en, '')), ''),
      employee_no = nullif(btrim(coalesce(p_employee_no, employee_no, '')), ''),
      mobile = nullif(btrim(coalesce(p_mobile, mobile, '')), ''),
      job_title = nullif(btrim(coalesce(p_job_title, job_title, '')), '')
  where id = p_user_id
    and organization_id = v_org;

  if not found then
    raise exception 'user not found in current organization';
  end if;

  perform public.append_audit_log(v_org, 'iam.user.profile_update', 'users', p_user_id, '{}'::jsonb);
  return p_user_id;
end;
$$;

create or replace function public.admin_list_permissions(
  p_module text default null,
  p_active_only boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_permission('iam.permissions.read');

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'code', p.code,
      'module', p.module,
      'action', p.action,
      'context_scope', p.context_scope,
      'name_ar', p.name_ar,
      'name_en', p.name_en,
      'is_system_permission', p.is_system_permission,
      'is_active', p.is_active
    ) order by p.module, p.code)
    from public.permissions p
    where p.organization_id = public.current_organization_id()
      and (p_module is null or p.module = p_module)
      and (not coalesce(p_active_only, true) or p.is_active)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_upsert_permission(
  p_code text,
  p_module text,
  p_action text,
  p_context_scope text,
  p_name_ar text,
  p_name_en text default null,
  p_description text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_permission_id uuid;
  v_code text := lower(btrim(p_code));
begin
  perform public.assert_permission('iam.permissions.manage');

  if v_code !~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$' then
    raise exception 'invalid permission code format';
  end if;

  insert into public.permissions (
    organization_id,
    code,
    module,
    action,
    context_scope,
    name_ar,
    name_en,
    description,
    is_system_permission,
    is_active
  )
  values (
    v_org,
    v_code,
    lower(btrim(p_module)),
    lower(btrim(p_action)),
    p_context_scope,
    btrim(p_name_ar),
    nullif(btrim(coalesce(p_name_en, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    false,
    coalesce(p_is_active, true)
  )
  on conflict (organization_id, code) do update
  set module = excluded.module,
      action = excluded.action,
      context_scope = excluded.context_scope,
      name_ar = excluded.name_ar,
      name_en = excluded.name_en,
      description = excluded.description,
      is_active = excluded.is_active,
      updated_at = now()
  where public.permissions.is_system_permission = false
  returning id into v_permission_id;

  if v_permission_id is null then
    raise exception 'system permissions cannot be overwritten through this RPC';
  end if;

  perform public.append_audit_log(v_org, 'iam.permission.upsert', 'permissions', v_permission_id, jsonb_build_object('code', v_code));
  return v_permission_id;
end;
$$;

create or replace function public.admin_list_roles(
  p_query text default null,
  p_scope text default null,
  p_active_only boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_permission('iam.roles.read');

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'name_ar', r.name_ar,
      'name_en', r.name_en,
      'role_scope', r.role_scope,
      'is_active', r.is_active,
      'permission_count', (
        select count(*)
        from public.role_permissions rp
        join public.permissions p on p.id = rp.permission_id and p.organization_id = rp.organization_id
        where rp.role_id = r.id
          and rp.organization_id = r.organization_id
          and rp.is_active
          and p.is_active
      )
    ) order by r.code)
    from public.roles r
    where r.organization_id = public.current_organization_id()
      and (p_scope is null or r.role_scope = p_scope)
      and (not coalesce(p_active_only, true) or r.is_active)
      and (
        p_query is null
        or r.code ilike '%' || p_query || '%'
        or r.name_ar ilike '%' || p_query || '%'
        or r.name_en ilike '%' || p_query || '%'
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_get_role_detail(p_role_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.assert_permission('iam.roles.read');

  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'name_ar', r.name_ar,
    'name_en', r.name_en,
    'description', r.description,
    'role_scope', r.role_scope,
    'is_active', r.is_active,
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'module', p.module,
        'action', p.action,
        'context_scope', p.context_scope,
        'name_ar', p.name_ar
      ) order by p.code)
      from public.role_permissions rp
      join public.permissions p on p.id = rp.permission_id and p.organization_id = rp.organization_id
      where rp.role_id = r.id
        and rp.organization_id = r.organization_id
        and rp.is_active
        and p.is_active
    ), '[]'::jsonb)
  )
  into v_result
  from public.roles r
  where r.id = p_role_id
    and r.organization_id = public.current_organization_id();

  if v_result is null then
    raise exception 'role not found in current organization';
  end if;

  return v_result;
end;
$$;

create or replace function public.admin_upsert_role(
  p_role_id uuid default null,
  p_code text default null,
  p_name_ar text default null,
  p_name_en text default null,
  p_description text default null,
  p_role_scope text default 'organization',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_role_id uuid;
  v_code text := lower(btrim(p_code));
begin
  perform public.assert_permission('iam.roles.manage');

  if p_role_id is null and (v_code is null or v_code !~ '^[a-z0-9_]+$') then
    raise exception 'valid role code is required';
  end if;

  if p_name_ar is null or btrim(p_name_ar) = '' then
    raise exception 'Arabic role name is required';
  end if;

  if p_role_id is null then
    insert into public.roles (
      organization_id,
      code,
      name_ar,
      name_en,
      description,
      role_scope,
      is_active
    )
    values (
      v_org,
      v_code,
      btrim(p_name_ar),
      nullif(btrim(coalesce(p_name_en, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      coalesce(p_role_scope, 'organization'),
      coalesce(p_is_active, true)
    )
    returning id into v_role_id;
  else
    update public.roles
    set name_ar = btrim(p_name_ar),
        name_en = nullif(btrim(coalesce(p_name_en, '')), ''),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        role_scope = coalesce(p_role_scope, role_scope),
        is_active = coalesce(p_is_active, is_active)
    where id = p_role_id
      and organization_id = v_org
    returning id into v_role_id;

    if v_role_id is null then
      raise exception 'role not found in current organization';
    end if;
  end if;

  perform public.append_audit_log(v_org, 'iam.role.upsert', 'roles', v_role_id, jsonb_build_object('code', v_code));
  return v_role_id;
end;
$$;

create or replace function public.admin_set_role_permissions(
  p_role_id uuid,
  p_permission_codes text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_count integer;
begin
  perform public.assert_permission('iam.roles.manage');

  if not exists (select 1 from public.roles where id = p_role_id and organization_id = v_org) then
    raise exception 'role not found in current organization';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_permission_codes, array[]::text[])) as requested(code)
    left join public.permissions p on p.organization_id = v_org and p.code = requested.code and p.is_active
    where p.id is null
  ) then
    raise exception 'one or more permission codes are invalid';
  end if;

  update public.role_permissions
  set is_active = false
  where organization_id = v_org
    and role_id = p_role_id;

  insert into public.role_permissions (organization_id, role_id, permission_id, granted_by_user_id, is_active)
  select v_org, p_role_id, p.id, auth.uid(), true
  from public.permissions p
  where p.organization_id = v_org
    and p.code = any(coalesce(p_permission_codes, array[]::text[]))
  on conflict (organization_id, role_id, permission_id) do update
  set is_active = true,
      granted_by_user_id = auth.uid(),
      granted_at = now(),
      updated_at = now();

  get diagnostics v_count = row_count;

  perform public.append_audit_log(v_org, 'iam.role.permissions_set', 'roles', p_role_id, jsonb_build_object('permission_codes', coalesce(p_permission_codes, array[]::text[])));
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.admin_deactivate_role(
  p_role_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  perform public.assert_permission('iam.roles.manage');

  update public.roles
  set is_active = false
  where id = p_role_id
    and organization_id = v_org;

  if not found then
    raise exception 'role not found in current organization';
  end if;

  update public.memberships
  set membership_status = 'ended',
      end_date = coalesce(end_date, current_date)
  where role_id = p_role_id
    and organization_id = v_org
    and membership_status = 'active';

  perform public.append_audit_log(v_org, 'iam.role.deactivate', 'roles', p_role_id, jsonb_build_object('reason', p_reason));
end;
$$;

insert into public.permissions (organization_id, code, module, action, context_scope, name_ar, name_en, is_system_permission)
select o.id, p.code, p.module, p.action, p.context_scope, p.name_ar, p.name_en, true
from public.organizations o
cross join (values
  ('iam.users.read', 'iam', 'users.read', 'organization', 'قراءة المستخدمين', 'Read users'),
  ('iam.users.manage', 'iam', 'users.manage', 'organization', 'إدارة المستخدمين', 'Manage users'),
  ('iam.users.invite', 'iam', 'users.invite', 'organization', 'دعوة المستخدمين', 'Invite users'),
  ('iam.roles.read', 'iam', 'roles.read', 'organization', 'قراءة الأدوار والصلاحيات', 'Read roles and permissions'),
  ('iam.roles.manage', 'iam', 'roles.manage', 'organization', 'إدارة الأدوار والصلاحيات', 'Manage roles and permissions'),
  ('iam.roles.assign', 'iam', 'roles.assign', 'governance_unit', 'إسناد الأدوار', 'Assign roles'),
  ('iam.roles.revoke', 'iam', 'roles.revoke', 'governance_unit', 'سحب الأدوار', 'Revoke roles'),
  ('iam.permissions.read', 'iam', 'permissions.read', 'organization', 'قراءة مصفوفة الصلاحيات', 'Read permission matrix'),
  ('iam.permissions.manage', 'iam', 'permissions.manage', 'organization', 'إدارة مصفوفة الصلاحيات', 'Manage permission matrix'),
  ('iam.sso.read', 'iam', 'sso.read', 'organization', 'قراءة إعدادات الدخول الموحد', 'Read SSO configuration'),
  ('iam.sso.manage', 'iam', 'sso.manage', 'organization', 'إدارة الدخول الموحد', 'Manage SSO'),
  ('audit.logs.read', 'audit', 'logs.read', 'organization', 'قراءة الأثر التدقيقي', 'Read audit logs')
) as p(code, module, action, context_scope, name_ar, name_en)
on conflict (organization_id, code) do update
set module = excluded.module,
    action = excluded.action,
    context_scope = excluded.context_scope,
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    is_system_permission = true,
    is_active = true,
    updated_at = now();

insert into public.role_permissions (organization_id, role_id, permission_id)
select r.organization_id, r.id, p.id
from public.roles r
join public.permissions p on p.organization_id = r.organization_id
where r.code = 'governance_admin'
  and p.code in (
    'iam.users.read',
    'iam.users.manage',
    'iam.users.invite',
    'iam.roles.read',
    'iam.roles.manage',
    'iam.roles.assign',
    'iam.roles.revoke',
    'iam.permissions.read',
    'iam.permissions.manage',
    'iam.sso.read',
    'iam.sso.manage',
    'audit.logs.read'
  )
on conflict (organization_id, role_id, permission_id) do update set is_active = true, updated_at = now();

insert into public.role_permissions (organization_id, role_id, permission_id)
select r.organization_id, r.id, p.id
from public.roles r
join public.permissions p on p.organization_id = r.organization_id
where r.code = 'internal_auditor'
  and p.code in ('iam.users.read', 'iam.roles.read', 'iam.permissions.read', 'iam.sso.read', 'audit.logs.read')
on conflict (organization_id, role_id, permission_id) do update set is_active = true, updated_at = now();

grant execute on function public.jwt_claim_text(text) to authenticated;
grant execute on function public.current_sso_provider_id() to authenticated;
grant execute on function public.has_permission(text, uuid) to authenticated;
grant execute on function public.assert_permission(text, uuid) to authenticated;
revoke all on function public.append_audit_log(uuid, text, text, uuid, jsonb) from public;
revoke all on function public.append_audit_log(uuid, text, text, uuid, jsonb) from authenticated;
grant execute on function public.get_current_user_access_context() to authenticated;
grant execute on function public.admin_create_user_profile(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_user_status(uuid, text, text) to authenticated;
grant execute on function public.admin_assign_role(uuid, uuid, uuid, text, date, date) to authenticated;
grant execute on function public.admin_revoke_membership(uuid, text) to authenticated;
grant execute on function public.admin_create_invitation(text, text, uuid, uuid, timestamptz) to authenticated;
grant execute on function public.admin_revoke_invitation(uuid, text) to authenticated;
grant execute on function public.admin_upsert_sso_provider(text, uuid, text, text, jsonb, uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_upsert_sso_domain(uuid, text, boolean) to authenticated;
grant execute on function public.register_current_sso_login(text) to authenticated;
grant execute on function public.admin_search_users(text, text, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.get_my_account() to authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
grant execute on function public.update_my_preferences(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
grant execute on function public.admin_update_user_profile(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_list_permissions(text, boolean) to authenticated;
grant execute on function public.admin_upsert_permission(text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_list_roles(text, text, boolean) to authenticated;
grant execute on function public.admin_get_role_detail(uuid) to authenticated;
grant execute on function public.admin_upsert_role(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.admin_deactivate_role(uuid, text) to authenticated;
