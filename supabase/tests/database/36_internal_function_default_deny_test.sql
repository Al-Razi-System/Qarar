begin;

create extension if not exists pgtap;
select plan(5);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname like 'qarar\_%' escape '\'
      and p.prokind in ('f', 'p')
      and has_function_privilege('anon', p.oid, 'execute')
  ),
  0,
  'anon cannot execute any internal module routine'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join qarar_architecture.function_registry r on r.function_oid = p.oid
    where n.nspname like 'qarar\_%' escape '\'
      and p.prokind in ('f', 'p')
      and has_function_privilege('authenticated', p.oid, 'execute')
      and coalesce(r.is_rls_predicate, false) is false
  ),
  0,
  'authenticated can execute only registered RLS predicates internally'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join qarar_architecture.function_registry r on r.function_oid = p.oid
    where n.nspname like 'qarar\_%' escape '\'
      and p.prokind in ('f', 'p')
      and has_function_privilege('service_role', p.oid, 'execute')
      and coalesce(r.is_rls_predicate, false) is false
  ),
  0,
  'service_role reaches internal commands only through api_v1 contracts'
);

select is(
  (
    select count(*)::integer
    from qarar_architecture.function_registry r
    join pg_proc p on p.oid = r.function_oid
    where r.is_rls_predicate
      and not has_function_privilege('authenticated', p.oid, 'execute')
  ),
  0,
  'each registered RLS predicate remains executable by authenticated'
);

select is(
  (
    select count(*)::integer
    from pg_namespace n
    where n.nspname like 'qarar\_%' escape '\'
      and has_schema_privilege('anon', n.oid, 'usage')
  ),
  0,
  'anon has no usage privilege on internal module schemas'
);

select * from finish();
rollback;
