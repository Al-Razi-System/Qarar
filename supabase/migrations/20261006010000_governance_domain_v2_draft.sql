begin;

-- Governance v2 configuration foundation only.
-- This migration is deliberately additive: it exposes no API, activates no record,
-- and does not read, rewrite, or migrate legacy/source data.

create table qarar_governance.reference_counters_v2 (
  organization_id uuid not null,
  entity_prefix text not null,
  reference_year integer not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (organization_id, entity_prefix, reference_year),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  check (entity_prefix ~ '^[A-Z]{3}$'),
  check (reference_year between 2000 and 9999),
  check (last_value >= 0)
);

alter table qarar_governance.reference_counters_v2 enable row level security;
alter table qarar_governance.reference_counters_v2 force row level security;

create or replace function qarar_governance.next_v2_reference(p_entity_prefix text)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, qarar_governance
as $$
declare
  v_organization_id uuid := qarar_iam.current_organization_id();
  v_year integer := extract(year from clock_timestamp())::integer;
  v_value bigint;
begin
  if p_entity_prefix !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023', message='بادئة المرجع غير صالحة';
  end if;

  insert into qarar_governance.reference_counters_v2(
    organization_id, entity_prefix, reference_year, last_value
  ) values (v_organization_id, p_entity_prefix, v_year, 1)
  on conflict (organization_id, entity_prefix, reference_year)
  do update set last_value=qarar_governance.reference_counters_v2.last_value+1,
                updated_at=clock_timestamp()
  returning last_value into v_value;

  return format('%s-%s-%s', p_entity_prefix, v_year, lpad(v_value::text, 6, '0'));
end;
$$;

create table qarar_governance.topic_classifications_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('TCL'),
  parent_id uuid,
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  effective_from date,
  effective_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (organization_id, code),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (parent_id, organization_id)
    references qarar_governance.topic_classifications_v2(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_]*$'),
  check (char_length(btrim(name_ar)) between 2 and 200),
  check (status in ('draft', 'under_review', 'approved', 'effective', 'retired')),
  check (status <> 'effective' or activation_allowed),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from)),
  check (parent_id is null or parent_id <> id)
);

create table qarar_governance.topic_types_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('TYP'),
  code text not null,
  name_ar text not null,
  name_en text,
  description text,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (organization_id, code),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (code ~ '^[a-z][a-z0-9_.-]*$'),
  check (char_length(btrim(name_ar)) between 3 and 300)
);

create table qarar_governance.topic_type_versions_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('TVR'),
  topic_type_id uuid not null,
  classification_id uuid not null,
  version_no integer not null,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  is_governed boolean not null default true,
  acceptance_finality text not null,
  rejection_finality text not null,
  effective_from date,
  effective_to date,
  approved_by_user_id uuid,
  approved_at timestamptz,
  activated_by_user_id uuid,
  activated_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (topic_type_id, version_no),
  foreign key (topic_type_id, organization_id)
    references qarar_governance.topic_types_v2(id, organization_id) on delete restrict,
  foreign key (classification_id, organization_id)
    references qarar_governance.topic_classifications_v2(id, organization_id) on delete restrict,
  foreign key (approved_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (activated_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (version_no > 0),
  check (status in ('draft', 'under_review', 'approved', 'effective', 'retired')),
  check (acceptance_finality in ('advance', 'complete', 'return_previous', 'refer_lower', 'conditional')),
  check (rejection_finality in ('complete', 'return_previous', 'refer_lower', 'conditional')),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from)),
  check (status <> 'effective' or (
    activation_allowed and effective_from is not null and approved_by_user_id is not null
    and activated_by_user_id is not null and activated_at is not null
  ))
);

create unique index topic_type_versions_v2_one_effective_uidx
on qarar_governance.topic_type_versions_v2(topic_type_id)
where status = 'effective';

create table qarar_governance.legal_authorities_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('AUT'),
  external_source_id text,
  source_document_name text not null,
  source_document_version text,
  article_number text,
  clause_number text,
  authority_text text not null,
  authority_kind text not null,
  source_fingerprint text not null,
  review_status text not null default 'draft',
  activation_allowed boolean not null default false,
  effective_from date,
  effective_to date,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (organization_id, source_fingerprint),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (reviewed_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (char_length(btrim(source_document_name)) >= 3),
  check (char_length(btrim(authority_text)) >= 10),
  check (authority_kind in ('jurisdiction', 'document', 'timing', 'transition', 'finality', 'objection', 'instruction')),
  check (review_status in ('draft', 'under_review', 'approved', 'rejected', 'retired')),
  check (review_status <> 'approved' or (activation_allowed and reviewed_by_user_id is not null and reviewed_at is not null)),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from))
);

create table qarar_governance.topic_type_authorities_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_type_version_id uuid not null,
  legal_authority_id uuid not null,
  authority_role text not null,
  requirement_level text not null default 'legal',
  priority integer not null default 0,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (topic_type_version_id, legal_authority_id, authority_role),
  foreign key (topic_type_version_id, organization_id)
    references qarar_governance.topic_type_versions_v2(id, organization_id) on delete restrict,
  foreign key (legal_authority_id, organization_id)
    references qarar_governance.legal_authorities_v2(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (authority_role in ('jurisdiction', 'required_document', 'timing', 'step_transition', 'finality', 'objection', 'guidance')),
  check (requirement_level in ('legal', 'institutional', 'advisory'))
);

create table qarar_governance.topic_type_workflow_bindings_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_type_version_id uuid not null,
  workflow_template_version_id uuid not null,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  priority integer not null default 0,
  valid_from date,
  valid_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (topic_type_version_id, workflow_template_version_id),
  foreign key (topic_type_version_id, organization_id)
    references qarar_governance.topic_type_versions_v2(id, organization_id) on delete restrict,
  foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (status in ('draft', 'validated', 'effective', 'retired')),
  check (status <> 'effective' or activation_allowed),
  check (valid_to is null or (valid_from is not null and valid_to >= valid_from))
);

create unique index topic_type_workflow_bindings_v2_one_effective_uidx
on qarar_governance.topic_type_workflow_bindings_v2(topic_type_version_id)
where status = 'effective';

create table qarar_governance.topic_schedule_policies_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('TSP'),
  topic_type_version_id uuid not null,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  rule_type text not null default 'none',
  rule_config jsonb not null default '{}'::jsonb,
  available_from_offset interval,
  target_offset interval,
  postpone_until_offset interval,
  maximum_postponements integer not null default 0,
  effective_from date,
  effective_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  unique (topic_type_version_id),
  foreign key (topic_type_version_id, organization_id)
    references qarar_governance.topic_type_versions_v2(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (status in ('draft', 'validated', 'effective', 'retired')),
  check (status <> 'effective' or activation_allowed),
  check (rule_type in ('none', 'fixed_date', 'monthly_week', 'seasonal', 'bounded_recurrence')),
  check (jsonb_typeof(rule_config) = 'object'),
  check (maximum_postponements >= 0),
  check (postpone_until_offset is null or target_offset is not null),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from))
);

create table qarar_governance.meeting_policies_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('MPL'),
  governance_class_id uuid,
  meeting_kind text not null,
  name_ar text not null,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  recurrence_rule_type text not null default 'custom_rrule',
  recurrence_config jsonb not null default '{}'::jsonb,
  quorum_config jsonb not null default '{}'::jsonb,
  voting_config jsonb not null default '{}'::jsonb,
  minutes_config jsonb not null default '{}'::jsonb,
  attachment_visibility_default text not null default 'restricted',
  effective_from date,
  effective_to date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, organization_id),
  unique (organization_id, reference_number),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (governance_class_id, organization_id)
    references qarar_governance.governance_unit_classes(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id)
    references qarar_iam.users(id, organization_id) on delete restrict,
  check (char_length(btrim(name_ar)) between 3 and 300),
  check (meeting_kind in ('governed', 'custom')),
  check ((meeting_kind = 'governed' and governance_class_id is not null)
    or (meeting_kind = 'custom' and governance_class_id is null)),
  check (status in ('draft', 'validated', 'effective', 'retired')),
  check (status <> 'effective' or activation_allowed),
  check (recurrence_rule_type in ('weekly', 'monthly_week', 'fixed_dates', 'custom_rrule')),
  check (jsonb_typeof(recurrence_config) = 'object'),
  check (jsonb_typeof(quorum_config) = 'object'),
  check (jsonb_typeof(voting_config) = 'object'),
  check (jsonb_typeof(minutes_config) = 'object'),
  check (attachment_visibility_default in ('restricted', 'members', 'attendees')),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from))
);

alter table qarar_governance.topic_classifications_v2 enable row level security;
alter table qarar_governance.topic_classifications_v2 force row level security;
alter table qarar_governance.topic_types_v2 enable row level security;
alter table qarar_governance.topic_types_v2 force row level security;
alter table qarar_governance.topic_type_versions_v2 enable row level security;
alter table qarar_governance.topic_type_versions_v2 force row level security;
alter table qarar_governance.legal_authorities_v2 enable row level security;
alter table qarar_governance.legal_authorities_v2 force row level security;
alter table qarar_governance.topic_type_authorities_v2 enable row level security;
alter table qarar_governance.topic_type_authorities_v2 force row level security;
alter table qarar_governance.topic_type_workflow_bindings_v2 enable row level security;
alter table qarar_governance.topic_type_workflow_bindings_v2 force row level security;
alter table qarar_governance.topic_schedule_policies_v2 enable row level security;
alter table qarar_governance.topic_schedule_policies_v2 force row level security;
alter table qarar_governance.meeting_policies_v2 enable row level security;
alter table qarar_governance.meeting_policies_v2 force row level security;

revoke all on table
  qarar_governance.reference_counters_v2,
  qarar_governance.topic_classifications_v2,
  qarar_governance.topic_types_v2,
  qarar_governance.topic_type_versions_v2,
  qarar_governance.legal_authorities_v2,
  qarar_governance.topic_type_authorities_v2,
  qarar_governance.topic_type_workflow_bindings_v2,
  qarar_governance.topic_schedule_policies_v2,
  qarar_governance.meeting_policies_v2
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  qarar_governance.reference_counters_v2,
  qarar_governance.topic_classifications_v2,
  qarar_governance.topic_types_v2,
  qarar_governance.topic_type_versions_v2,
  qarar_governance.legal_authorities_v2,
  qarar_governance.topic_type_authorities_v2,
  qarar_governance.topic_type_workflow_bindings_v2,
  qarar_governance.topic_schedule_policies_v2,
  qarar_governance.meeting_policies_v2
to qarar_governance_executor;

alter function qarar_governance.next_v2_reference(text) owner to qarar_governance_executor;
revoke all on function qarar_governance.next_v2_reference(text)
from public, anon, authenticated, service_role;
grant execute on function qarar_governance.next_v2_reference(text)
to qarar_governance_executor;

commit;
