-- PB-054: Initial Supabase core schema, tenant isolation, RLS, and audit baseline.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text,
  sector text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  default_language text not null default 'ar' check (default_language in ('ar', 'en')),
  timezone text not null default 'Asia/Riyadh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_no text,
  full_name_ar text not null,
  full_name_en text,
  email text not null,
  mobile text,
  job_title text,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended')),
  is_system_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email),
  unique (organization_id, employee_no)
);

create table public.governance_unit_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.governance_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_unit_id uuid references public.governance_units(id) on delete restrict,
  unit_type_id uuid not null references public.governance_unit_types(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  level_no integer not null default 1 check (level_no > 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  role_scope text not null check (role_scope in ('system', 'organization', 'governance_unit', 'execution')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  governance_unit_id uuid not null references public.governance_units(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  membership_title text,
  membership_status text not null default 'active' check (membership_status in ('active', 'inactive', 'ended')),
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (organization_id, user_id, governance_unit_id, role_id, start_date)
);

create table public.topic_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  topic_no text not null,
  title_ar text not null,
  title_en text,
  description text,
  category_id uuid references public.topic_categories(id) on delete restrict,
  current_unit_id uuid references public.governance_units(id) on delete restrict,
  submitted_by_user_id uuid not null references public.users(id) on delete restrict,
  source_type text not null default 'new' check (source_type in ('new', 'from_lower_unit', 'from_upper_unit', 'from_peer_unit', 'from_admin_entity')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'under_review', 'approved', 'listed', 'in_process', 'postponed', 'closed')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, topic_no)
);

create table public.topic_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  topic_id uuid not null references public.topics(id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  change_reason text
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  result text not null default 'success' check (result in ('success', 'failure', 'denied')),
  previous_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_users_organization_id on public.users(organization_id);
create index idx_governance_units_organization_id on public.governance_units(organization_id);
create index idx_memberships_user_unit on public.memberships(user_id, governance_unit_id);
create index idx_topics_organization_status on public.topics(organization_id, status);
create index idx_topics_current_unit_id on public.topics(current_unit_id);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_logs_organization_time on public.audit_logs(organization_id, occurred_at desc);

create trigger set_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger set_users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger set_governance_unit_types_updated_at before update on public.governance_unit_types for each row execute function public.set_updated_at();
create trigger set_governance_units_updated_at before update on public.governance_units for each row execute function public.set_updated_at();
create trigger set_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger set_memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger set_topic_categories_updated_at before update on public.topic_categories for each row execute function public.set_updated_at();
create trigger set_topics_updated_at before update on public.topics for each row execute function public.set_updated_at();

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.users
  where id = auth.uid()
    and status = 'active'
  limit 1;
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_system_admin
    from public.users
    where id = auth.uid()
      and status = 'active'
    limit 1
  ), false);
$$;

create or replace function public.has_role_code(role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.organization_id = public.current_organization_id()
      and m.membership_status = 'active'
      and r.is_active = true
      and r.code = any(role_codes)
      and (m.end_date is null or m.end_date >= current_date)
  ), false);
$$;

create or replace function public.has_active_membership(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.governance_unit_id = target_unit_id
      and m.organization_id = public.current_organization_id()
      and m.membership_status = 'active'
      and (m.end_date is null or m.end_date >= current_date)
  ), false);
$$;

create or replace function public.has_unit_role_code(target_unit_id uuid, role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.user_id = auth.uid()
      and m.governance_unit_id = target_unit_id
      and m.organization_id = public.current_organization_id()
      and m.membership_status = 'active'
      and r.is_active = true
      and r.code = any(role_codes)
      and (m.end_date is null or m.end_date >= current_date)
  ), false);
$$;

grant usage on schema public to authenticated;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.has_role_code(text[]) to authenticated;
grant execute on function public.has_active_membership(uuid) to authenticated;
grant execute on function public.has_unit_role_code(uuid, text[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.governance_unit_types enable row level security;
alter table public.governance_units enable row level security;
alter table public.roles enable row level security;
alter table public.memberships enable row level security;
alter table public.topic_categories enable row level security;
alter table public.topics enable row level security;
alter table public.topic_status_history enable row level security;
alter table public.audit_logs enable row level security;

create policy "organization members can view their organization"
on public.organizations for select
to authenticated
using (id = public.current_organization_id() or public.is_system_admin());

create policy "users can view scoped user records"
on public.users for select
to authenticated
using (
  id = auth.uid()
  or organization_id = public.current_organization_id()
     and (public.is_system_admin() or public.has_role_code(array['governance_admin', 'internal_auditor']))
);

create policy "admins can manage users in their organization"
on public.users for update
to authenticated
using (organization_id = public.current_organization_id() and public.is_system_admin())
with check (organization_id = public.current_organization_id() and public.is_system_admin());

create policy "reference data is visible inside organization"
on public.governance_unit_types for select
to authenticated
using (organization_id = public.current_organization_id());

create policy "admins can insert governance unit types"
on public.governance_unit_types for insert
to authenticated
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "admins can update governance unit types"
on public.governance_unit_types for update
to authenticated
using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])))
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "governance units are visible inside organization"
on public.governance_units for select
to authenticated
using (organization_id = public.current_organization_id());

create policy "admins can insert governance units"
on public.governance_units for insert
to authenticated
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "admins can update governance units"
on public.governance_units for update
to authenticated
using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])))
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "roles are visible inside organization"
on public.roles for select
to authenticated
using (organization_id = public.current_organization_id());

create policy "admins can insert roles"
on public.roles for insert
to authenticated
with check (organization_id = public.current_organization_id() and public.is_system_admin());

create policy "admins can update roles"
on public.roles for update
to authenticated
using (organization_id = public.current_organization_id() and public.is_system_admin())
with check (organization_id = public.current_organization_id() and public.is_system_admin());

create policy "memberships are visible to scoped users"
on public.memberships for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    user_id = auth.uid()
    or public.is_system_admin()
    or public.has_role_code(array['governance_admin', 'internal_auditor'])
    or public.has_active_membership(governance_unit_id)
  )
);

create policy "admins can insert memberships"
on public.memberships for insert
to authenticated
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "admins can update memberships"
on public.memberships for update
to authenticated
using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])))
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "topic categories are visible inside organization"
on public.topic_categories for select
to authenticated
using (organization_id = public.current_organization_id());

create policy "admins can insert topic categories"
on public.topic_categories for insert
to authenticated
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "admins can update topic categories"
on public.topic_categories for update
to authenticated
using (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])))
with check (organization_id = public.current_organization_id() and (public.is_system_admin() or public.has_role_code(array['governance_admin'])));

create policy "topics are visible to submitters, unit members, and governance roles"
on public.topics for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    submitted_by_user_id = auth.uid()
    or public.is_system_admin()
    or public.has_role_code(array['governance_admin', 'internal_auditor'])
    or (current_unit_id is not null and public.has_active_membership(current_unit_id))
  )
);

create policy "authenticated users can submit topics in their organization"
on public.topics for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and submitted_by_user_id = auth.uid()
);

create policy "review roles can update scoped topics"
on public.topics for update
to authenticated
using (
  organization_id = public.current_organization_id()
  and (
    public.is_system_admin()
    or public.has_role_code(array['governance_admin'])
    or (current_unit_id is not null and public.has_unit_role_code(current_unit_id, array['council_chair', 'council_rapporteur']))
  )
)
with check (organization_id = public.current_organization_id());

create policy "topic history follows topic visibility"
on public.topic_status_history for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and exists (
    select 1 from public.topics t
    where t.id = topic_id
  )
);

create policy "review roles can insert topic history"
on public.topic_status_history for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and changed_by_user_id = auth.uid()
);

create policy "audit logs are visible only to audit roles"
on public.audit_logs for select
to authenticated
using (
  organization_id = public.current_organization_id()
  and (public.is_system_admin() or public.has_role_code(array['governance_admin', 'internal_auditor']))
);

create policy "authenticated users can append audit logs for their organization"
on public.audit_logs for insert
to authenticated
with check (
  organization_id = public.current_organization_id()
  and actor_user_id = auth.uid()
);

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'qarar-evidence',
      'qarar-evidence',
      false,
      26214400,
      array['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    )
    on conflict (id) do nothing;
  end if;
end $$;
