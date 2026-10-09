begin;
-- Internal contextual helper, not an authenticated RLS entry point.
-- Keep it private; only constrained IAM functions may call it.
update qarar_architecture.function_registry
set is_rls_predicate=false
where function_oid='qarar_iam.actor_can_submit_scoped_v2(uuid,uuid)'::regprocedure
  and module_code='iam' and owning_schema='qarar_iam';
commit;
