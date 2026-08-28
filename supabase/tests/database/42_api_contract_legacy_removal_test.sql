begin;

create extension if not exists pgtap;
select plan(5);

select is(
  (
    select count(*)::integer
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
  ),
  200,
  'the reviewed api_v1 registry contains 200 contracts after governed offboarding'
);

select is(
  (
    select contract_count
    from qarar_architecture.api_release_registry
    where api_version = 'v1'
  ),
  200,
  'the api_v1 release metadata matches the reviewed registry count'
);

select ok(
  not exists (
    select 1
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name in (
        'resolve_topic_governance',
        'create_topic_with_workflow',
        'complete_topic_workflow_step',
        'return_topic_workflow_step',
        'reject_topic_workflow_step'
      )
  ),
  'retired automatic-routing facades are absent from the contract registry'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api_v1'
      and p.proname in (
        'resolve_topic_governance',
        'create_topic_with_workflow',
        'complete_topic_workflow_step',
        'return_topic_workflow_step',
        'reject_topic_workflow_step'
      )
  ),
  'retired automatic-routing facades have no api_v1 overloads'
);

select is(
  (
    select count(*)::integer
    from qarar_architecture.api_contract_registry
    where api_version = 'v1'
      and contract_name in (
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
      )
  ),
  11,
  'all dashboard-consumed governance administration contracts are registered'
);

select * from finish();
rollback;
