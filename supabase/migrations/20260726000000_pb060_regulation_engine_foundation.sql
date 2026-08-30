begin;

create schema if not exists qarar_governance;
revoke all on schema qarar_governance from public, anon, authenticated, service_role;

insert into qarar_architecture.module_registry(
  module_code, schema_name, description, is_exposed
) values (
  'governance',
  'qarar_governance',
  'Regulations, policy versions, governed scope, and workflow routing',
  false
)
on conflict (module_code) do update
set schema_name = excluded.schema_name,
    description = excluded.description,
    is_exposed = excluded.is_exposed;

do $$
begin
  if not exists(select 1 from pg_roles where rolname = 'qarar_governance_executor') then
    raise exception
      'Required role qarar_governance_executor is missing. Apply module owner prerequisites first.';
  end if;
end;
$$;

grant usage, create on schema qarar_governance to qarar_governance_executor;

create table qarar_governance.governance_unit_classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name_ar text not null,
  name_en text,
  governance_level text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(organization_id, code),
  foreign key (organization_id)
    references qarar_core.organizations(id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_]*$'),
  check (governance_level in (
    'department', 'faculty', 'university', 'committee', 'executive', 'other'
  )),
  check (char_length(btrim(name_ar)) between 2 and 200)
);

alter table qarar_core.governance_units
  add column if not exists governance_class_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'governance_units_class_tenant_fk'
      and conrelid = 'qarar_core.governance_units'::regclass
  ) then
    alter table qarar_core.governance_units
      add constraint governance_units_class_tenant_fk
      foreign key (governance_class_id, organization_id)
      references qarar_governance.governance_unit_classes(id, organization_id)
      on delete restrict;
  end if;
end;
$$;

create table qarar_governance.policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name_ar text not null,
  name_en text,
  policy_type text not null default 'regulation',
  description text,
  owner_user_id uuid,
  status text not null default 'active',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(organization_id, code),
  foreign key (organization_id)
    references qarar_core.organizations(id) on delete restrict,
  foreign key (owner_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_.-]*$'),
  check (policy_type in ('regulation', 'policy', 'procedure', 'framework')),
  check (status in ('active', 'inactive', 'archived')),
  check (char_length(btrim(name_ar)) between 3 and 300)
);

create table qarar_governance.policy_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_id uuid not null,
  version_no integer not null,
  version_label text,
  legal_status text not null default 'draft',
  automation_status text not null default 'not_configured',
  effective_from date,
  effective_to date,
  readiness_percent integer not null default 0,
  change_summary text,
  submitted_by_user_id uuid,
  submitted_at timestamptz,
  approved_by_user_id uuid,
  approved_at timestamptz,
  activated_by_user_id uuid,
  activated_at timestamptz,
  suspended_by_user_id uuid,
  suspended_at timestamptz,
  suspension_reason text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(policy_id, version_no),
  foreign key (policy_id, organization_id)
    references qarar_governance.policies(id, organization_id) on delete restrict,
  foreign key (submitted_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (approved_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (activated_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (suspended_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (version_no > 0),
  check (legal_status in (
    'draft', 'under_review', 'approved', 'effective',
    'suspended', 'expired', 'archived'
  )),
  check (automation_status in (
    'not_configured', 'mapping_in_progress', 'validation_pending',
    'partially_ready', 'ready', 'blocked'
  )),
  check (readiness_percent between 0 and 100),
  check (effective_to is null or effective_from is not null),
  check (effective_to is null or effective_to >= effective_from),
  check (legal_status <> 'effective' or (
    effective_from is not null and approved_by_user_id is not null
  )),
  check (automation_status <> 'ready' or readiness_percent = 100)
);

create extension if not exists btree_gist with schema extensions;

alter table qarar_governance.policy_versions
  add constraint policy_versions_no_effective_overlap
  exclude using gist (
    policy_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
  where (legal_status = 'effective');

create table qarar_governance.policy_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid not null,
  parent_item_id uuid,
  item_code text not null,
  item_type text not null default 'article',
  title_ar text not null,
  title_en text,
  body_text text,
  sort_order integer not null,
  governance_mode text not null default 'regulation_required',
  topic_category_id uuid,
  match_criteria jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(policy_version_id, item_code),
  unique(policy_version_id, sort_order),
  foreign key (policy_version_id, organization_id)
    references qarar_governance.policy_versions(id, organization_id) on delete restrict,
  foreign key (parent_item_id, organization_id)
    references qarar_governance.policy_items(id, organization_id) on delete restrict,
  foreign key (topic_category_id, organization_id)
    references qarar_topics.topic_categories(id, organization_id) on delete restrict,
  check (item_code ~ '^[A-Za-z0-9_.-]+$'),
  check (item_type in ('chapter', 'section', 'article', 'clause', 'procedure')),
  check (sort_order > 0),
  check (governance_mode in (
    'regulation_required', 'regulated_fallback_allowed', 'custom_route_allowed'
  )),
  check (char_length(btrim(title_ar)) between 2 and 500),
  check (jsonb_typeof(match_criteria) = 'object'),
  check (parent_item_id is null or parent_item_id <> id)
);

create table qarar_governance.policy_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_version_id uuid not null,
  scope_type text not null,
  governance_unit_type_id uuid,
  governance_class_id uuid,
  governance_level text,
  governance_unit_id uuid,
  include_descendants boolean not null default false,
  priority integer not null default 0,
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  foreign key (policy_version_id, organization_id)
    references qarar_governance.policy_versions(id, organization_id) on delete restrict,
  foreign key (governance_unit_type_id, organization_id)
    references qarar_core.governance_unit_types(id, organization_id) on delete restrict,
  foreign key (governance_class_id, organization_id)
    references qarar_governance.governance_unit_classes(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (scope_type in (
    'organization', 'governance_unit_type', 'governance_level',
    'governance_class', 'governance_unit', 'unit_subtree'
  )),
  check (governance_level is null or governance_level in (
    'department', 'faculty', 'university', 'committee', 'executive', 'other'
  )),
  check (valid_to is null or valid_from is not null),
  check (valid_to is null or valid_to >= valid_from),
  check (
    (scope_type = 'organization'
      and governance_unit_type_id is null and governance_class_id is null
      and governance_level is null and governance_unit_id is null)
    or (scope_type = 'governance_unit_type'
      and governance_unit_type_id is not null and governance_class_id is null
      and governance_level is null and governance_unit_id is null)
    or (scope_type = 'governance_level'
      and governance_unit_type_id is null and governance_class_id is null
      and governance_level is not null and governance_unit_id is null)
    or (scope_type = 'governance_class'
      and governance_unit_type_id is null and governance_class_id is not null
      and governance_level is null and governance_unit_id is null)
    or (scope_type in ('governance_unit', 'unit_subtree')
      and governance_unit_type_id is null and governance_class_id is null
      and governance_level is null and governance_unit_id is not null)
  ),
  check (scope_type = 'unit_subtree' or not include_descendants)
);

create unique index policy_scope_assignment_identity_uidx
on qarar_governance.policy_scope_assignments (
  policy_version_id,
  scope_type,
  coalesce(governance_unit_type_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(governance_class_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(governance_level, ''),
  coalesce(governance_unit_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(valid_from, '-infinity'::date)
) where is_active;

create table qarar_governance.policy_item_scope_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_item_id uuid not null,
  scope_assignment_id uuid not null,
  governance_unit_id uuid not null,
  is_included boolean not null,
  priority integer not null default 0,
  reason text not null,
  valid_from date,
  valid_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(policy_item_id, scope_assignment_id, governance_unit_id, valid_from),
  foreign key (policy_item_id, organization_id)
    references qarar_governance.policy_items(id, organization_id) on delete restrict,
  foreign key (scope_assignment_id, organization_id)
    references qarar_governance.policy_scope_assignments(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (char_length(btrim(reason)) between 5 and 2000),
  check (valid_to is null or valid_from is not null),
  check (valid_to is null or valid_to >= valid_from)
);

create table qarar_governance.policy_item_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  policy_item_id uuid not null,
  sequence_no integer not null,
  responsibility text not null,
  governance_unit_id uuid,
  governance_class_id uuid,
  required_permission_code text,
  is_required boolean not null default true,
  entry_conditions jsonb not null default '{}'::jsonb,
  exit_conditions jsonb not null default '{}'::jsonb,
  outcome_transition_map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(policy_item_id, sequence_no),
  foreign key (policy_item_id, organization_id)
    references qarar_governance.policy_items(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id)
    references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (governance_class_id, organization_id)
    references qarar_governance.governance_unit_classes(id, organization_id) on delete restrict,
  foreign key (organization_id, required_permission_code)
    references qarar_iam.permissions(organization_id, code) on delete restrict,
  check (sequence_no > 0),
  check (responsibility in (
    'present', 'review', 'discuss', 'recommend', 'initial_approve',
    'final_approve', 'execute', 'follow_up'
  )),
  check (governance_unit_id is not null or governance_class_id is not null),
  check (not (governance_unit_id is not null and governance_class_id is not null)),
  check (jsonb_typeof(entry_conditions) = 'object'),
  check (jsonb_typeof(exit_conditions) = 'object'),
  check (jsonb_typeof(outcome_transition_map) = 'object')
);

do $$
declare current_entity_name text;
begin
  foreach current_entity_name in array array[
    'governance_unit_classes',
    'policies',
    'policy_versions',
    'policy_items',
    'policy_item_roles',
    'policy_scope_assignments',
    'policy_item_scope_overrides'
  ]
  loop
    insert into qarar_architecture.entity_registry(
      entity_name, module_code, legacy_public_view
    ) values (current_entity_name, 'governance', false)
    on conflict (entity_name) do update
    set module_code = excluded.module_code,
        legacy_public_view = excluded.legacy_public_view;

    execute format('alter table qarar_governance.%I enable row level security', current_entity_name);
    execute format('revoke all on qarar_governance.%I from public,anon,authenticated,service_role', current_entity_name);
    execute format('alter table qarar_governance.%I owner to qarar_governance_executor', current_entity_name);
  end loop;
end;
$$;

grant usage on schema qarar_governance to qarar_governance_executor;
grant select, insert, update, delete on all tables in schema qarar_governance
  to qarar_governance_executor;

insert into qarar_architecture.module_table_read_allowlist(
  source_module, target_schema, table_name, rationale
) values
  ('governance', 'qarar_core', 'organizations', 'Validate tenant ownership'),
  ('governance', 'qarar_core', 'governance_unit_types', 'Resolve unit-type policy scopes'),
  ('governance', 'qarar_core', 'governance_units', 'Resolve unit, subtree, and inherited scopes'),
  ('governance', 'qarar_iam', 'users', 'Validate policy actors and owners'),
  ('governance', 'qarar_iam', 'permissions', 'Validate workflow responsibility permissions'),
  ('governance', 'qarar_topics', 'topic_categories', 'Match policy items to topic categories')
on conflict do nothing;

do $$
declare dependency record;
begin
  for dependency in
    select *
    from qarar_architecture.module_table_read_allowlist
    where source_module = 'governance'
  loop
    execute format(
      'grant usage on schema %I to qarar_governance_executor',
      dependency.target_schema
    );
    execute format(
      'grant select on table %I.%I to qarar_governance_executor',
      dependency.target_schema,
      dependency.table_name
    );
  end loop;
end;
$$;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values (
  'governance',
  'qarar_core',
  'set_updated_at',
  '',
  'Maintain timestamps on regulation entities'
)
on conflict do nothing;

grant execute on function qarar_core.set_updated_at()
  to qarar_governance_executor;

create trigger set_governance_unit_classes_updated_at
before update on qarar_governance.governance_unit_classes
for each row execute function qarar_core.set_updated_at();
create trigger set_policies_updated_at
before update on qarar_governance.policies
for each row execute function qarar_core.set_updated_at();
create trigger set_policy_versions_updated_at
before update on qarar_governance.policy_versions
for each row execute function qarar_core.set_updated_at();
create trigger set_policy_items_updated_at
before update on qarar_governance.policy_items
for each row execute function qarar_core.set_updated_at();
create trigger set_policy_scope_assignments_updated_at
before update on qarar_governance.policy_scope_assignments
for each row execute function qarar_core.set_updated_at();
create trigger set_policy_item_scope_overrides_updated_at
before update on qarar_governance.policy_item_scope_overrides
for each row execute function qarar_core.set_updated_at();
create trigger set_policy_item_roles_updated_at
before update on qarar_governance.policy_item_roles
for each row execute function qarar_core.set_updated_at();

insert into qarar_iam.permissions(
  organization_id, code, module, action, context_scope,
  name_ar, name_en, description, is_system_permission, is_active
)
select
  o.id,
  permission.code,
  'governance',
  permission.action,
  permission.context_scope,
  permission.name_ar,
  permission.name_en,
  permission.description,
  true,
  true
from qarar_core.organizations o
cross join (values
  ('governance.policies.read', 'read', 'organization', 'عرض اللوائح', 'Read regulations', 'View regulations, versions, items, and scopes'),
  ('governance.policies.manage', 'manage', 'organization', 'إدارة اللوائح', 'Manage regulations', 'Create and edit regulation drafts and mappings'),
  ('governance.policies.approve', 'approve', 'organization', 'اعتماد اللوائح', 'Approve regulations', 'Review, approve, activate, suspend, and archive versions'),
  ('governance.workflows.manage', 'manage', 'organization', 'إدارة المسارات الحوكمية', 'Manage governed workflows', 'Configure governed workflow templates and transitions'),
  ('governance.exceptions.request', 'request', 'governance_unit', 'طلب استثناء لائحي', 'Request regulation exception', 'Request a governed temporary or exceptional route'),
  ('governance.exceptions.approve', 'approve', 'organization', 'اعتماد الاستثناءات اللائحية', 'Approve regulation exceptions', 'Independently approve or reject governed exceptions'),
  ('governance.compliance.read', 'read', 'organization', 'عرض الامتثال اللائحي', 'Read regulation compliance', 'View regulation traceability and coverage reporting'),
  ('governance.alerts.manage', 'manage', 'organization', 'إدارة تنبيهات الحوكمة', 'Manage governance alerts', 'Review and resolve governance coverage and routing alerts')
) as permission(code, action, context_scope, name_ar, name_en, description)
on conflict (organization_id, code) do nothing;

comment on schema qarar_governance is
'Internal regulation engine and governed-routing module. Frontends use api_v1 only.';
comment on table qarar_governance.policy_versions is
'Immutable-after-activation legal and automation state for one policy version.';
comment on table qarar_governance.policy_scope_assignments is
'Prioritized dynamic policy coverage over organization, type, level, class, unit, or subtree.';
comment on table qarar_governance.policy_item_scope_overrides is
'Explicit unit-level inclusion or exclusion from a policy item scope.';

commit;
