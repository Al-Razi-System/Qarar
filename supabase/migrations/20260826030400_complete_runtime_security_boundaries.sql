begin;

-- The snapshot recovery initially kept this implementation in public.  Public
-- is reserved for compatibility views: implementations must live with their
-- owning module and be governed by the same registry as every other command.
alter function public.get_topic_categories_for_unit(uuid, date)
  set schema qarar_topics;
alter function qarar_topics.get_topic_categories_for_unit(uuid, date)
  owner to qarar_topics_executor;
revoke all on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.get_topic_categories_for_unit(uuid, date)
  to qarar_api_executor, qarar_topics_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid),
       'topics', 'qarar_topics', false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_topics'
  and p.proname = 'get_topic_categories_for_unit'
  and pg_get_function_identity_arguments(p.oid) =
      'p_governance_unit_id uuid, p_effective_on date'
on conflict (function_oid) do update
set function_name = excluded.function_name,
    identity_arguments = excluded.identity_arguments,
    module_code = excluded.module_code,
    owning_schema = excluded.owning_schema,
    is_rls_predicate = excluded.is_rls_predicate;

update qarar_architecture.api_contract_registry
set implementation_schema = 'qarar_topics',
    implementation_name = 'get_topic_categories_for_unit',
    module_code = 'topics'
where api_version = 'v1'
  and contract_name = 'get_topic_categories_for_unit'
  and identity_arguments = 'p_governance_unit_id uuid, p_effective_on date';

create or replace function api_v1.get_topic_categories_for_unit(
  p_governance_unit_id uuid,
  p_effective_on date default null::date
) returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select qarar_topics.get_topic_categories_for_unit($1, $2)
$function$;

alter function api_v1.get_topic_categories_for_unit(uuid, date)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_categories_for_unit(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function api_v1.get_topic_categories_for_unit(uuid, date)
  to authenticated, service_role;

-- Complete the reviewed dependency ledger for functions restored from the
-- final local database and for the live-meeting authorization guard.
insert into qarar_architecture.module_table_read_allowlist(
  source_module, target_schema, table_name, rationale
) values
  ('meetings', 'qarar_iam', 'memberships', 'Resolve meeting-member roles'),
  ('meetings', 'qarar_iam', 'roles', 'Resolve meeting-member role codes'),
  ('meetings', 'qarar_minutes', 'meeting_minutes', 'Render minutes lifecycle in meeting detail'),
  ('minutes', 'qarar_iam', 'users', 'Render verified attendees in generated minutes'),
  ('minutes', 'qarar_meetings', 'agenda_items', 'Render agenda discussion in generated minutes'),
  ('minutes', 'qarar_topics', 'topics', 'Render agenda topic titles in generated minutes'),
  ('voting', 'qarar_iam', 'roles', 'Resolve council-chair tie-break authority'),
  ('topics', 'qarar_governance', 'governance_unit_classes', 'Resolve unit governance level for category eligibility'),
  ('topics', 'qarar_governance', 'policies', 'Resolve active policies for category eligibility'),
  ('topics', 'qarar_governance', 'policy_versions', 'Resolve effective policy versions for category eligibility'),
  ('topics', 'qarar_governance', 'policy_items', 'Resolve executable category policy items'),
  ('topics', 'qarar_governance', 'policy_scope_assignments', 'Resolve policy scope for category eligibility'),
  ('topics', 'qarar_governance', 'policy_item_scope_overrides', 'Apply category policy scope overrides')
on conflict do nothing;

insert into qarar_architecture.module_function_execute_allowlist(
  source_module, target_schema, function_name, identity_arguments, rationale
) values
  ('attendance', 'qarar_iam', 'has_permission',
   'permission_code text, target_unit_id uuid', 'Authorize governed meeting managers'),
  ('minutes', 'qarar_audit', 'append_audit_log',
   'p_organization_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb',
   'Record generated minutes audit events'),
  ('minutes', 'qarar_iam', 'current_organization_id', '', 'Resolve minutes tenant'),
  ('minutes', 'qarar_iam', 'is_system_admin', '', 'Resolve minutes administrator scope'),
  ('topics', 'qarar_iam', 'has_unit_role_code',
   'target_unit_id uuid, role_codes text[]', 'Resolve topic workflow unit roles')
on conflict do nothing;

grant usage on schema qarar_iam, qarar_minutes, qarar_meetings, qarar_topics,
  qarar_governance, qarar_audit to qarar_meetings_executor, qarar_minutes_executor,
  qarar_voting_executor, qarar_topics_executor, qarar_attendance_executor;

grant select on qarar_iam.memberships, qarar_iam.roles, qarar_minutes.meeting_minutes
  to qarar_meetings_executor;
grant select on qarar_iam.users, qarar_meetings.agenda_items, qarar_topics.topics
  to qarar_minutes_executor;
grant select on qarar_iam.roles to qarar_voting_executor;
grant select on qarar_governance.governance_unit_classes, qarar_governance.policies,
  qarar_governance.policy_versions, qarar_governance.policy_items,
  qarar_governance.policy_scope_assignments, qarar_governance.policy_item_scope_overrides
  to qarar_topics_executor;

grant execute on function qarar_iam.has_permission(text, uuid)
  to qarar_attendance_executor;
grant execute on function qarar_audit.append_audit_log(uuid, text, text, uuid, jsonb),
  qarar_iam.current_organization_id(), qarar_iam.is_system_admin()
  to qarar_minutes_executor;
grant execute on function qarar_iam.has_unit_role_code(uuid, text[])
  to qarar_topics_executor;

-- Re-freeze the release record from the registered API surface.  The wrappers
-- retain their signatures, while the registry now records all 204 contracts.
update qarar_architecture.api_release_registry release
set contract_count = (
      select count(*) from qarar_architecture.api_contract_registry
      where api_version = release.api_version
    ),
    contract_hash = (
      select md5(string_agg(
        p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' ||
        pg_get_function_result(p.oid) || '|' || registry.audience,
        E'\n' order by p.proname, pg_get_function_identity_arguments(p.oid)
      ))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'api_v1'
      join qarar_architecture.api_contract_registry registry
        on registry.api_version = release.api_version
       and registry.contract_name = p.proname
       and registry.identity_arguments = pg_get_function_identity_arguments(p.oid)
    ),
    released_at = clock_timestamp(),
    notes = 'Recovered API contracts are module-owned and all runtime dependencies are explicitly reviewed.'
where release.api_version = 'v1';

notify pgrst, 'reload schema';
commit;
