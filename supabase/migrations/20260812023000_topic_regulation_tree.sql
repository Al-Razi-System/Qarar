begin;

-- User-facing hierarchy for regulation selection.  It intentionally exposes
-- only versions that already have at least one eligible match for the topic.
create or replace function qarar_governance.get_topic_regulation_tree(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text default 'medium',
  p_source_type text default 'new',
  p_effective_on date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog, qarar_governance
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_tree jsonb;
begin
  if v_org is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'An active account is required';
  end if;
  perform qarar_iam.assert_permission('topics.create', p_governance_unit_id);

  with eligible as materialized (
    select *
    from qarar_governance.eligible_topic_regulation_options(
      p_governance_unit_id, p_topic_category_id, p_priority, p_source_type, p_effective_on
    )
  ), versions as (
    select distinct on (policy_id, policy_version_id)
      policy_id, policy_version_id, policy_code, policy_name_ar, policy_name_en, version_no, version_label
    from eligible
    order by policy_id, policy_version_id, score desc
  ), node_selections as (
    select policy_version_id, policy_item_id,
      jsonb_agg(jsonb_build_object(
        'policy_id', policy_id,
        'policy_version_id', policy_version_id,
        'policy_item_id', policy_item_id,
        'scope_assignment_id', scope_assignment_id,
        'routing_outcome', routing_outcome,
        'can_start_workflow', routing_outcome = 'resolved',
        'score', score
      ) order by (routing_outcome = 'resolved') desc, score desc) as selections
    from eligible
    group by policy_version_id, policy_item_id
  ), trees as (
    select v.policy_id, v.policy_version_id, v.policy_code, v.policy_name_ar, v.policy_name_en,
      v.version_no, v.version_label,
      jsonb_agg(jsonb_build_object(
        'id', i.id,
        'parent_id', i.parent_item_id,
        'code', i.item_code,
        'title_ar', i.title_ar,
        'title_en', i.title_en,
        'item_type', i.item_type,
        'sort_order', i.sort_order,
        'is_selectable', coalesce(jsonb_array_length(ns.selections), 0) > 0,
        'selections', coalesce(ns.selections, '[]'::jsonb)
      ) order by i.sort_order) as nodes
    from versions v
    join qarar_governance.policy_items i
      on i.policy_version_id = v.policy_version_id
     and i.organization_id = v_org
     and i.is_active
    left join node_selections ns
      on ns.policy_version_id = i.policy_version_id
     and ns.policy_item_id = i.id
    group by v.policy_id, v.policy_version_id, v.policy_code, v.policy_name_ar, v.policy_name_en,
      v.version_no, v.version_label
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy', jsonb_build_object('id', policy_id, 'code', policy_code, 'name_ar', policy_name_ar, 'name_en', policy_name_en),
    'version', jsonb_build_object('id', policy_version_id, 'number', version_no, 'label', version_label),
    'nodes', nodes
  ) order by policy_name_ar, version_no desc), '[]'::jsonb)
  into v_tree
  from trees;

  return jsonb_build_object('items', v_tree, 'total', jsonb_array_length(v_tree));
end;
$$;

alter function qarar_governance.get_topic_regulation_tree(uuid, uuid, text, text, date)
  owner to qarar_governance_executor;
revoke all on function qarar_governance.get_topic_regulation_tree(uuid, uuid, text, text, date)
  from public, anon, authenticated, service_role;
grant execute on function qarar_governance.get_topic_regulation_tree(uuid, uuid, text, text, date)
  to qarar_api_executor;

insert into qarar_architecture.function_registry(
  function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate
)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'governance', n.nspname, false
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'qarar_governance' and p.proname = 'get_topic_regulation_tree'
on conflict (function_oid) do update set
  function_name = excluded.function_name,
  identity_arguments = excluded.identity_arguments,
  module_code = excluded.module_code,
  owning_schema = excluded.owning_schema,
  is_rls_predicate = false;

insert into qarar_architecture.api_contract_registry(
  api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience
) values (
  'v1', 'get_topic_regulation_tree', 'qarar_governance', 'get_topic_regulation_tree',
  'p_governance_unit_id uuid, p_topic_category_id uuid, p_priority text, p_source_type text, p_effective_on date',
  'governance', 'authenticated'
) on conflict (api_version, contract_name, identity_arguments) do update set
  implementation_schema = excluded.implementation_schema,
  implementation_name = excluded.implementation_name,
  module_code = excluded.module_code,
  audience = excluded.audience;

create or replace function api_v1.get_topic_regulation_tree(
  p_governance_unit_id uuid,
  p_topic_category_id uuid,
  p_priority text,
  p_source_type text,
  p_effective_on date
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select qarar_governance.get_topic_regulation_tree($1, $2, $3, $4, $5)
$$;

alter function api_v1.get_topic_regulation_tree(uuid, uuid, text, text, date)
  owner to qarar_api_executor;
revoke all on function api_v1.get_topic_regulation_tree(uuid, uuid, text, text, date)
  from public, anon;
grant execute on function api_v1.get_topic_regulation_tree(uuid, uuid, text, text, date)
  to authenticated, service_role;

commit;
