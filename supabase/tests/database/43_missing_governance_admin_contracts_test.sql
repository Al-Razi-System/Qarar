begin;
create extension if not exists pgtap;
select plan(12);

select is(
  (select count(*)::integer from qarar_architecture.api_contract_registry
   where api_version='v1' and contract_name=any(array[
     'admin_create_governance_unit','admin_list_governance_unit_types',
     'admin_list_governance_units','admin_update_governance_unit',
     'admin_list_governance_exceptions','admin_list_workflow_templates',
     'create_topic_exception_request','get_topic_governance_summary',
     'admin_create_topic_category','admin_list_topic_categories',
     'admin_update_topic_category'])),
  11,'all eleven missing governance contracts are registered');

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='api_v1' and p.proname=any(array[
     'admin_create_governance_unit','admin_list_governance_unit_types',
     'admin_list_governance_units','admin_update_governance_unit',
     'admin_list_governance_exceptions','admin_list_workflow_templates',
     'create_topic_exception_request','get_topic_governance_summary',
     'admin_create_topic_category','admin_list_topic_categories',
     'admin_update_topic_category'])),
  11,'all eleven api_v1 facades exist');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.proname=any(array[
    'admin_create_governance_unit','admin_list_governance_unit_types',
    'admin_list_governance_units','admin_update_governance_unit',
    'admin_list_governance_exceptions','admin_list_workflow_templates',
    'create_topic_exception_request','get_topic_governance_summary',
    'admin_create_topic_category','admin_list_topic_categories',
    'admin_update_topic_category'])
    and pg_get_userbyid(p.proowner)<>'qarar_api_executor'
),'facades are owned by the API executor');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='api_v1' and p.proname=any(array[
    'admin_create_governance_unit','admin_list_governance_unit_types',
    'admin_list_governance_units','admin_update_governance_unit',
    'admin_list_governance_exceptions','admin_list_workflow_templates',
    'create_topic_exception_request','get_topic_governance_summary',
    'admin_create_topic_category','admin_list_topic_categories',
    'admin_update_topic_category']) and has_function_privilege('anon',p.oid,'execute')
),'anonymous cannot execute restored facades');

select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('qarar_core','qarar_topics','qarar_governance')
    and p.proname=any(array[
      'admin_create_governance_unit','admin_list_governance_unit_types',
      'admin_list_governance_units','admin_update_governance_unit',
      'admin_list_governance_exceptions','admin_list_workflow_templates',
      'create_topic_exception_request','get_topic_governance_summary',
      'admin_create_topic_category','admin_list_topic_categories',
      'admin_update_topic_category'])
    and (has_function_privilege('anon',p.oid,'execute') or
         has_function_privilege('authenticated',p.oid,'execute') or
         has_function_privilege('service_role',p.oid,'execute'))
),'implementation functions deny every direct client role');

select ok(has_function_privilege('authenticated','api_v1.admin_list_governance_units(text,text,uuid,uuid,uuid,integer,integer)','execute'),'authenticated may list units through api_v1');
select ok(has_function_privilege('authenticated','api_v1.admin_create_governance_unit(text,text,text,uuid,uuid,uuid,integer)','execute'),'authenticated may create units through api_v1');
select ok(has_function_privilege('authenticated','api_v1.admin_list_topic_categories(text,boolean,integer,integer)','execute'),'authenticated may list categories through api_v1');
select ok(has_function_privilege('authenticated','api_v1.admin_update_topic_category(uuid,text,text,text,boolean,timestamptz)','execute'),'authenticated may update categories through api_v1');
select ok(has_function_privilege('authenticated','api_v1.admin_list_workflow_templates()','execute'),'authenticated may list workflow templates through api_v1');
select ok(has_function_privilege('authenticated','api_v1.create_topic_exception_request(text,text,uuid,uuid,uuid,text,timestamptz,text,text,text,uuid)','execute'),'authenticated may create an atomic exception request through api_v1');
select ok(exists(select 1 from qarar_architecture.module_function_execute_allowlist where source_module='governance' and target_schema='qarar_topics' and function_name='create_topic_with_workflow'),'cross-module topic creation is explicitly allowlisted');

select * from finish();
rollback;
