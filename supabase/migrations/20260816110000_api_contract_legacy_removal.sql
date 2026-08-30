-- Retire the five automatic-routing facades superseded by the explicit
-- regulation-selection workflow.  They must not remain discoverable through
-- PostgREST merely because their historical implementation functions still
-- exist for migration compatibility.

do $$
declare
  v_legacy_contracts name[] := array[
    'resolve_topic_governance',
    'create_topic_with_workflow',
    'complete_topic_workflow_step',
    'return_topic_workflow_step',
    'reject_topic_workflow_step'
  ]::name[];
  v_wrapper record;
begin
  -- Drop every api_v1 overload for these retired names.  The registry does
  -- not own the function object, so removing its row alone would leave an
  -- unreviewed RPC exposed by the schema.
  for v_wrapper in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api_v1'
      and p.proname = any(v_legacy_contracts)
  loop
    execute format('drop function %s', v_wrapper.signature);
  end loop;

  delete from qarar_architecture.api_contract_registry
  where api_version = 'v1'
    and contract_name = any(v_legacy_contracts);
end;
$$;

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
    released_at = clock_timestamp(),
    notes = 'Retired legacy automatic-routing facades; the explicit governance and topic workflow contracts are authoritative.'
where api_version = 'v1';

do $$
declare
  v_legacy_contracts name[] := array[
    'resolve_topic_governance',
    'create_topic_with_workflow',
    'complete_topic_workflow_step',
    'return_topic_workflow_step',
    'reject_topic_workflow_step'
  ]::name[];
  v_required_current_contracts name[] := array[
    'admin_create_governance_unit',
    'admin_list_governance_unit_types',
    'admin_list_governance_units',
    'admin_update_governance_unit',
    'admin_list_governance_exceptions',
    'admin_list_workflow_templates',
    'create_topic_exception_request',
    'get_topic_governance_summary',
    'admin_create_topic_category',
    'admin_list_topic_categories',
    'admin_update_topic_category'
  ]::name[];
  v_registry_count integer;
  v_release_count integer;
  v_legacy_registry_count integer;
  v_legacy_wrapper_count integer;
  v_required_current_count integer;
begin
  select count(*)::integer
    into v_registry_count
  from qarar_architecture.api_contract_registry
  where api_version = 'v1';

  select count(*)::integer
    into v_release_count
  from qarar_architecture.api_release_registry
  where api_version = 'v1'
    and contract_count = 193;

  select count(*)::integer
    into v_legacy_registry_count
  from qarar_architecture.api_contract_registry
  where api_version = 'v1'
    and contract_name = any(v_legacy_contracts);

  select count(*)::integer
    into v_legacy_wrapper_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api_v1'
    and p.proname = any(v_legacy_contracts);

  select count(*)::integer
    into v_required_current_count
  from qarar_architecture.api_contract_registry
  where api_version = 'v1'
    and contract_name = any(v_required_current_contracts);

  if v_registry_count <> 193
     or v_release_count <> 1
     or v_legacy_registry_count <> 0
     or v_legacy_wrapper_count <> 0
     or v_required_current_count <> cardinality(v_required_current_contracts) then
    raise exception using
      errcode = '23514',
      message = format(
        'api_v1 legacy retirement invariant failed: registry=%s release=%s legacy_registry=%s legacy_wrappers=%s required_current=%s',
        v_registry_count,
        v_release_count,
        v_legacy_registry_count,
        v_legacy_wrapper_count,
        v_required_current_count
      );
  end if;
end;
$$;

notify pgrst, 'reload schema';
