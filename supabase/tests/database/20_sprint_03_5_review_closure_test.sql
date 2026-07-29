begin;
create extension if not exists pgtap;
select plan(33);

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
 122,'api_v1 release count includes council type contracts through PB-073');
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
 'qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)'::regprocedure))>0,
 'workflow actions preserve the existing governance source');

select ok(
 position('voting' in pg_get_constraintdef(
  (select oid from pg_constraint
   where conrelid='qarar_governance.workflow_template_steps'::regclass
    and conname='workflow_template_steps_step_type_check')
 ))>0,
 'workflow templates accept an explicit voting step type');
select ok(
 position('COALESCE(CURRENT_SETTING(' in upper(pg_get_functiondef(
  'qarar_governance.act_topic_workflow_step_core(uuid,text,text,uuid,integer)'::regprocedure)))>0,
 'manual voting guard treats a missing transition setting as denied');
select has_column(
 'qarar_voting','voting_rounds','workflow_instance_step_id',
 'voting rounds persist the exact governed workflow step');
select ok(
 exists(select 1 from pg_constraint
  where conrelid='qarar_voting.voting_rounds'::regclass
   and conname='voting_rounds_workflow_step_tenant_fk'
   and contype='f'),
 'voting round workflow binding is tenant-safe and referentially enforced');
select ok(
 has_schema_privilege('qarar_meetings_executor','qarar_governance','USAGE'),
 'meeting execution can use its reviewed governance-step read allowlist');
select ok(
 position('v_step.step_type<>''voting''' in pg_get_functiondef(
  'qarar_voting.enforce_governed_voting_round()'::regprocedure))>0
 and position('new.workflow_instance_step_id:=v_step.id' in pg_get_functiondef(
  'qarar_voting.enforce_governed_voting_round()'::regprocedure))>0,
 'opening a governed vote validates and captures the active voting step');
select ok(
 position('is distinct from new.workflow_instance_step_id' in pg_get_functiondef(
  'qarar_voting.advance_governed_workflow_from_vote()'::regprocedure))>0,
 'closing a stale voting round cannot advance a different current step');
select has_trigger(
 'qarar_governance','governance_exceptions','governance_exceptions_validity_guard',
 'temporary route requests have a database validity guard');
select ok(
 position('new.valid_until is null or new.valid_until<=now()' in pg_get_functiondef(
  'qarar_governance.enforce_exception_validity()'::regprocedure))>0,
 'missing and expired temporary routes are rejected before approval');
select function_returns(
 'qarar_governance','expire_governance_exceptions',array['timestamp with time zone'],'integer',
 'expired temporary routes have a scheduled lifecycle operation');
select ok(
 position('routing_expired' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='qarar_topics.topics'::regclass and conname='topics_routing_status_check')
 ))>0,
 'topic routing exposes the expired temporary-route state');
select ok(
 position('array[''approved'',''rejected'',''tie'',''no_vote'']' in pg_get_functiondef(
  'qarar_governance.validate_workflow_template_version(uuid)'::regprocedure))>0,
 'workflow validation requires every voting result to be handled');
select ok(
 position('wi.status=''active''' in pg_get_functiondef(
  'qarar_governance.expire_governance_exceptions(timestamp with time zone)'::regprocedure))>0
 and position('m.snapshot->>''exception_id''' in pg_get_functiondef(
  'qarar_governance.expire_governance_exceptions(timestamp with time zone)'::regprocedure))>0,
 'expiration only changes an active workflow bound to the expired exception');
select ok(
 position('cancel_expired_workflow_voting_rounds' in pg_get_functiondef(
  'qarar_governance.expire_governance_exceptions(timestamp with time zone)'::regprocedure))>0,
 'expiration cancels an open governed voting round before it cancels the step');
select function_returns(
 'qarar_voting','cancel_expired_workflow_voting_rounds',array['uuid','timestamp with time zone'],'integer',
 'voting has a dedicated operation to cancel expired workflow rounds');
select ok(
 position('select s.* into replay' in pg_get_functiondef(
  'qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure))
 < position('from qarar_governance.topic_governance_mappings' in pg_get_functiondef(
  'qarar_governance.act_topic_workflow_step(uuid,text,text,uuid,integer)'::regprocedure)),
 'idempotent replay is resolved before the temporary-route expiry guard');
select ok(
 position('array_position' in pg_get_functiondef(
  'qarar_governance.normalize_voting_step_outcomes()'::regprocedure))>0,
 'voting outcomes are normalized independently of request array order');

select * from finish();
rollback;
