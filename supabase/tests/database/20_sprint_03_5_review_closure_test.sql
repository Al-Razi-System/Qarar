begin;
create extension if not exists pgtap;
select plan(16);

select ok(qarar_governance.conditions_match('{"priority":"urgent"}','{"priority":"urgent"}'),
 'matching condition object is executed');
select ok(not qarar_governance.conditions_match('{"priority":"urgent"}','{"priority":"low"}'),
 'mismatched condition object is rejected');
select ok(qarar_governance.conditions_match(
 '{"all":[{"priority":"urgent"},{"any":[{"source_type":"new"},{"source_type":"upper"}]}]}',
 '{"priority":"urgent","source_type":"new"}'),'nested all/any conditions are executed');

select has_column('qarar_governance','workflow_instance_steps','action_idempotency_key',
 'workflow actions persist an idempotency key');
select has_column('qarar_governance','workflow_instance_steps','action_version',
 'workflow actions persist an optimistic version');
select has_index('qarar_governance','workflow_instance_steps','workflow_step_action_idempotency_uidx',
 'workflow action idempotency is unique per instance');

select has_trigger('qarar_voting','voting_rounds','voting_round_advance_workflow',
 'closed voting rounds advance governed workflows');
select function_returns('qarar_governance','act_topic_workflow_step',
 array['uuid','text','text','uuid','integer'],'jsonb',
 'concurrent workflow action contract exists');

select throws_ok(
 $$select qarar_governance.complete_topic_workflow_step(gen_random_uuid(),'approved',null)$$,
 '42501',null,'legacy unsafe workflow command is closed');

select is((select contract_count from qarar_architecture.api_release_registry where api_version='v1'),
 116,'api_v1 release count includes review closure contracts');
select is((select count(*)::integer from qarar_architecture.api_contract_registry
 where api_version='v1' and contract_name in(
 'admin_list_governance_unit_classes','admin_create_governance_unit_class',
 'admin_update_governance_unit_class','admin_assign_governance_unit_class',
 'request_custom_workflow','approve_custom_workflow','act_topic_workflow_step')),
 7,'all review closure contracts are registered');

select ok(position('7000000' in pg_get_functiondef(
 'qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)'::regprocedure))>0,
 'positive council override has explicit highest specificity tier');
select ok(position('6000000' in pg_get_functiondef(
 'qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)'::regprocedure))>0,
 'council scope specificity dominates configured priority');
select ok(position('conditions_match(pi.match_criteria' in pg_get_functiondef(
 'qarar_governance.resolve_topic_governance(uuid,uuid,date,uuid)'::regprocedure))>0,
 'policy item match criteria is executed by the matcher');
select ok(position('governance_source=''custom''' in pg_get_functiondef(
 'qarar_topics.create_topic_with_workflow(text,text,uuid,uuid,text,text,text,uuid)'::regprocedure))>0,
 'custom and fallback routing persists a custom source');
select ok(position('governance_source into source' in pg_get_functiondef(
 'qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure))>0,
 'workflow actions preserve the existing governance source');

select * from finish();
rollback;
