begin;

create table qarar_governance.regulation_match_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid,
  governance_unit_id uuid not null,
  topic_category_id uuid,
  evaluated_at timestamptz not null default now(),
  effective_on date not null,
  outcome text not null,
  selected_policy_id uuid,
  selected_policy_version_id uuid,
  selected_policy_item_id uuid,
  selected_scope_assignment_id uuid,
  selected_workflow_template_version_id uuid,
  specificity_score integer,
  candidate_count integer not null default 0,
  explanation jsonb not null,
  candidates jsonb not null default '[]'::jsonb,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id, organization_id),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (governance_unit_id, organization_id) references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (topic_category_id, organization_id) references qarar_topics.topic_categories(id, organization_id) on delete restrict,
  foreign key (selected_policy_id, organization_id) references qarar_governance.policies(id, organization_id) on delete restrict,
  foreign key (selected_policy_version_id, organization_id) references qarar_governance.policy_versions(id, organization_id) on delete restrict,
  foreign key (selected_policy_item_id, organization_id) references qarar_governance.policy_items(id, organization_id) on delete restrict,
  foreign key (selected_scope_assignment_id, organization_id) references qarar_governance.policy_scope_assignments(id, organization_id) on delete restrict,
  foreign key (selected_workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (created_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (outcome in (
    'resolved','manual_review_required','policy_not_implemented','policy_partially_ready',
    'no_applicable_policy','multiple_policy_conflict','custom_route_required',
    'exception_approval_required','blocked'
  )),
  check (candidate_count >= 0),
  check (jsonb_typeof(explanation)='object'),
  check (jsonb_typeof(candidates)='array'),
  check (
    outcome <> 'resolved'
    or (selected_policy_id is not null and selected_policy_version_id is not null
      and selected_policy_item_id is not null and selected_scope_assignment_id is not null
      and selected_workflow_template_version_id is not null)
  )
);

create table qarar_governance.topic_governance_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  governance_source text not null,
  routing_status text not null,
  routing_decision_id uuid not null,
  policy_id uuid,
  policy_version_id uuid,
  policy_item_id uuid,
  policy_scope_assignment_id uuid,
  workflow_template_version_id uuid,
  snapshot jsonb not null,
  mapped_by_user_id uuid not null,
  mapped_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique(id, organization_id),
  unique(topic_id) deferrable initially immediate,
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (routing_decision_id, organization_id) references qarar_governance.regulation_match_decisions(id, organization_id) on delete restrict,
  foreign key (policy_id, organization_id) references qarar_governance.policies(id, organization_id) on delete restrict,
  foreign key (policy_version_id, organization_id) references qarar_governance.policy_versions(id, organization_id) on delete restrict,
  foreign key (policy_item_id, organization_id) references qarar_governance.policy_items(id, organization_id) on delete restrict,
  foreign key (policy_scope_assignment_id, organization_id) references qarar_governance.policy_scope_assignments(id, organization_id) on delete restrict,
  foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (mapped_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (governance_source in ('regulated','custom','exception')),
  check (routing_status in (
    'routing_pending','routing_resolved','routing_conflict','routing_blocked',
    'routing_exception_pending','routing_ready'
  )),
  check (jsonb_typeof(snapshot)='object')
);

create table qarar_governance.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  topic_governance_mapping_id uuid not null,
  workflow_template_version_id uuid not null,
  status text not null default 'active',
  current_step_id uuid,
  started_by_user_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(topic_id),
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (topic_governance_mapping_id, organization_id)
    references qarar_governance.topic_governance_mappings(id, organization_id) on delete restrict,
  foreign key (workflow_template_version_id, organization_id)
    references qarar_governance.workflow_template_versions(id, organization_id) on delete restrict,
  foreign key (started_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (status in ('active','completed','rejected','cancelled','blocked')),
  check (jsonb_typeof(snapshot)='object')
);

create table qarar_governance.workflow_instance_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_instance_id uuid not null,
  template_step_id uuid not null,
  sequence_no integer not null,
  status text not null default 'pending',
  assigned_unit_id uuid,
  required_permission_code text,
  opened_at timestamptz,
  acted_by_user_id uuid,
  acted_at timestamptz,
  outcome_code text,
  comment text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(workflow_instance_id, template_step_id),
  foreign key (workflow_instance_id, organization_id)
    references qarar_governance.workflow_instances(id, organization_id) on delete restrict,
  foreign key (template_step_id, organization_id)
    references qarar_governance.workflow_template_steps(id, organization_id) on delete restrict,
  foreign key (assigned_unit_id, organization_id) references qarar_core.governance_units(id, organization_id) on delete restrict,
  foreign key (organization_id, required_permission_code) references qarar_iam.permissions(organization_id, code) on delete restrict,
  foreign key (acted_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (sequence_no > 0),
  check (status in ('pending','active','completed','returned','rejected','cancelled','skipped')),
  check (outcome_code is null or outcome_code in (
    'approved','rejected','returned','tie','no_vote','cancelled','completed'
  )),
  check (jsonb_typeof(snapshot)='object')
);

alter table qarar_governance.workflow_instances
  add constraint workflow_instances_current_step_tenant_fk
  foreign key (current_step_id, organization_id)
  references qarar_governance.workflow_instance_steps(id, organization_id)
  deferrable initially deferred;

create table qarar_governance.governance_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid not null,
  requested_source text not null,
  requested_route jsonb not null,
  reason text not null,
  status text not null default 'pending',
  requested_by_user_id uuid not null,
  requested_at timestamptz not null default now(),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_comment text,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (requested_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (reviewed_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (requested_source in ('custom','exception')),
  check (status in ('pending','approved','rejected','expired','revoked')),
  check (char_length(btrim(reason)) between 10 and 4000),
  check (jsonb_typeof(requested_route)='object'),
  check (reviewed_by_user_id is null or reviewed_by_user_id<>requested_by_user_id),
  check (status='pending' or (reviewed_by_user_id is not null and reviewed_at is not null)),
  check (valid_until is null or valid_until>requested_at)
);

create table qarar_governance.governance_compliance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid,
  workflow_instance_id uuid,
  event_type text not null,
  severity text not null,
  result text not null,
  details jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(id, organization_id),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (workflow_instance_id, organization_id)
    references qarar_governance.workflow_instances(id, organization_id) on delete restrict,
  foreign key (actor_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (severity in ('info','warning','critical')),
  check (result in ('allowed','denied','pending','resolved')),
  check (jsonb_typeof(details)='object')
);

create table qarar_governance.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null,
  deduplication_key text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(id, organization_id),
  unique(organization_id, deduplication_key),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  check (status in ('pending','processing','processed','failed','dead_letter')),
  check (attempts>=0),
  check (jsonb_typeof(payload)='object')
);

create index notification_outbox_dispatch_idx
on qarar_governance.notification_outbox(available_at,created_at)
where status in ('pending','failed');

create table qarar_governance.governance_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  topic_id uuid,
  compliance_event_id uuid,
  alert_type text not null,
  severity text not null,
  title_ar text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  assigned_to_user_id uuid,
  acknowledged_by_user_id uuid,
  acknowledged_at timestamptz,
  resolved_by_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id),
  foreign key (organization_id) references qarar_core.organizations(id) on delete restrict,
  foreign key (topic_id, organization_id) references qarar_topics.topics(id, organization_id) on delete restrict,
  foreign key (compliance_event_id, organization_id)
    references qarar_governance.governance_compliance_events(id, organization_id) on delete restrict,
  foreign key (assigned_to_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (acknowledged_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  foreign key (resolved_by_user_id, organization_id) references qarar_iam.users(id, organization_id) on delete restrict,
  check (severity in ('info','warning','critical')),
  check (status in ('open','acknowledged','resolved','dismissed')),
  check (jsonb_typeof(details)='object')
);

alter table qarar_topics.topics
  add column governance_source text,
  add column policy_id uuid,
  add column policy_version_id uuid,
  add column policy_item_id uuid,
  add column policy_scope_assignment_id uuid,
  add column workflow_template_version_id uuid,
  add column workflow_instance_id uuid,
  add column current_workflow_step_id uuid,
  add column routing_status text not null default 'routing_pending',
  add column routing_decision_id uuid,
  add constraint topics_governance_source_check
    check (governance_source is null or governance_source in ('regulated','custom','exception')),
  add constraint topics_routing_status_check
    check (routing_status in (
      'routing_pending','routing_resolved','routing_conflict','routing_blocked',
      'routing_exception_pending','routing_ready'
    )),
  add constraint topics_policy_tenant_fk foreign key(policy_id,organization_id)
    references qarar_governance.policies(id,organization_id) on delete restrict,
  add constraint topics_policy_version_tenant_fk foreign key(policy_version_id,organization_id)
    references qarar_governance.policy_versions(id,organization_id) on delete restrict,
  add constraint topics_policy_item_tenant_fk foreign key(policy_item_id,organization_id)
    references qarar_governance.policy_items(id,organization_id) on delete restrict,
  add constraint topics_scope_tenant_fk foreign key(policy_scope_assignment_id,organization_id)
    references qarar_governance.policy_scope_assignments(id,organization_id) on delete restrict,
  add constraint topics_workflow_template_tenant_fk foreign key(workflow_template_version_id,organization_id)
    references qarar_governance.workflow_template_versions(id,organization_id) on delete restrict,
  add constraint topics_workflow_instance_tenant_fk foreign key(workflow_instance_id,organization_id)
    references qarar_governance.workflow_instances(id,organization_id) deferrable initially deferred,
  add constraint topics_current_workflow_step_tenant_fk foreign key(current_workflow_step_id,organization_id)
    references qarar_governance.workflow_instance_steps(id,organization_id) deferrable initially deferred,
  add constraint topics_routing_decision_tenant_fk foreign key(routing_decision_id,organization_id)
    references qarar_governance.regulation_match_decisions(id,organization_id) on delete restrict;

do $$
declare current_entity_name text;
begin
  foreach current_entity_name in array array[
    'regulation_match_decisions','topic_governance_mappings','workflow_instances',
    'workflow_instance_steps','governance_exceptions','governance_compliance_events',
    'notification_outbox','governance_alerts'
  ] loop
    insert into qarar_architecture.entity_registry(entity_name,module_code,legacy_public_view)
    values(current_entity_name,'governance',false)
    on conflict(entity_name) do update set module_code=excluded.module_code,legacy_public_view=false;
    execute format('alter table qarar_governance.%I enable row level security',current_entity_name);
    execute format('revoke all on qarar_governance.%I from public,anon,authenticated,service_role',current_entity_name);
    execute format('alter table qarar_governance.%I owner to qarar_governance_executor',current_entity_name);
  end loop;
end;
$$;

grant select,insert,update,delete on all tables in schema qarar_governance to qarar_governance_executor;

do $$
declare current_table text;
begin
  foreach current_table in array array[
    'workflow_instances','workflow_instance_steps','governance_exceptions','governance_alerts'
  ] loop
    execute format(
      'create trigger %I_updated_at before update on qarar_governance.%I
       for each row execute function qarar_core.set_updated_at()',
      current_table,current_table
    );
  end loop;
end;
$$;

comment on table qarar_governance.regulation_match_decisions is
'Append-only explainable decisions recording every candidate and deterministic selection outcome.';
comment on table qarar_governance.notification_outbox is
'Transactional outbox; producers insert in the same transaction as governed state changes.';

commit;
