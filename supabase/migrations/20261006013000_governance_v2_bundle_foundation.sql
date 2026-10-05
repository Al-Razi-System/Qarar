begin;

-- Aggregate root for future V2 authoring commands. This foundation deliberately
-- blocks activation and exposes no API until transition commands are reviewed.
create table qarar_governance.governance_bundles_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference_number text not null default qarar_governance.next_v2_reference('GVB'),
  topic_type_version_id uuid not null,
  status text not null default 'draft',
  activation_allowed boolean not null default false,
  lock_version integer not null default 1,
  submitted_by_user_id uuid,
  submitted_at timestamptz,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_comment text,
  activated_by_user_id uuid,
  activated_at timestamptz,
  effective_from date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id,organization_id),
  unique (organization_id,reference_number),
  unique (topic_type_version_id),
  foreign key (organization_id)
    references qarar_core.organizations(id) on delete restrict,
  foreign key (topic_type_version_id,organization_id)
    references qarar_governance.topic_type_versions_v2(id,organization_id) on delete restrict,
  foreign key (submitted_by_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key (reviewed_by_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key (activated_by_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  foreign key (created_by_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  check (status in ('draft','under_review','changes_requested','approved','effective','retired')),
  check (lock_version>0),
  check (activation_allowed=false),
  check (activated_by_user_id is null and activated_at is null and effective_from is null),
  constraint governance_bundles_v2_activation_blocked check (status<>'effective'),
  check (reviewed_by_user_id is distinct from created_by_user_id),
  check ((status in ('draft','changes_requested') and activated_by_user_id is null and activated_at is null)
      or status in ('under_review','approved','retired')),
  check ((status in ('approved','retired'))=(reviewed_by_user_id is not null and reviewed_at is not null)),
  check ((submitted_by_user_id is null and submitted_at is null)
      or (submitted_by_user_id is not null and submitted_at is not null))
);

create table qarar_governance.governance_bundle_reviews_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bundle_id uuid not null,
  action text not null,
  comment text,
  bundle_lock_version integer not null,
  actor_user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id,organization_id),
  foreign key (bundle_id,organization_id)
    references qarar_governance.governance_bundles_v2(id,organization_id) on delete restrict,
  foreign key (actor_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  check (action in ('submitted','changes_requested','approved','retired')),
  check (bundle_lock_version>0),
  check (action<>'changes_requested' or char_length(btrim(coalesce(comment,'')))>=3)
);

create table qarar_governance.governance_bundle_command_receipts_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  bundle_id uuid,
  actor_user_id uuid not null,
  command_name text not null,
  client_request_id uuid not null,
  request_fingerprint text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (id,organization_id),
  unique(organization_id,actor_user_id,command_name,client_request_id),
  foreign key (organization_id)
    references qarar_core.organizations(id) on delete restrict,
  foreign key (bundle_id,organization_id)
    references qarar_governance.governance_bundles_v2(id,organization_id) on delete restrict,
  foreign key (actor_user_id,organization_id)
    references qarar_iam.users(id,organization_id) on delete restrict,
  check (command_name in (
    'save_governance_bundle_draft_v2','submit_governance_bundle_v2',
    'approve_governance_bundle_v2','activate_governance_bundle_v2'
  )),
  check (request_fingerprint~'^[0-9a-f]{64}$'),
  check (jsonb_typeof(response_payload)='object')
);

insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
values
  ('governance_bundles_v2','governance',false),
  ('governance_bundle_reviews_v2','governance',false),
  ('governance_bundle_command_receipts_v2','governance',false)
on conflict (entity_name) do update
set module_code=excluded.module_code,
    legacy_public_view=excluded.legacy_public_view;

alter table qarar_governance.governance_bundles_v2 enable row level security;
alter table qarar_governance.governance_bundles_v2 force row level security;
alter table qarar_governance.governance_bundle_reviews_v2 enable row level security;
alter table qarar_governance.governance_bundle_reviews_v2 force row level security;
alter table qarar_governance.governance_bundle_command_receipts_v2 enable row level security;
alter table qarar_governance.governance_bundle_command_receipts_v2 force row level security;

revoke all on table
  qarar_governance.governance_bundles_v2,
  qarar_governance.governance_bundle_reviews_v2,
  qarar_governance.governance_bundle_command_receipts_v2
from public,anon,authenticated,service_role;

grant select,insert,update on table
  qarar_governance.governance_bundles_v2
to qarar_governance_executor;

grant select,insert on table
  qarar_governance.governance_bundle_reviews_v2,
  qarar_governance.governance_bundle_command_receipts_v2
to qarar_governance_executor;

commit;
