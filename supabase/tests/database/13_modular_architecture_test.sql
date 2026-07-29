begin;
create extension if not exists pgtap;
select plan(14);

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')),
  0,
  'public owns no application base tables');

select is(
  (select count(*)::integer from qarar_architecture.entity_registry),
 68,
  'all application entities are registered');

select is(
  (select count(*)::integer
   from qarar_architecture.entity_registry e
   join qarar_architecture.module_registry m using (module_code)
   join pg_class c on c.relname = e.entity_name and c.relkind in ('r', 'p')
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = m.schema_name),
 68,
  'all registered entities are physically owned by their module');

select is(
  (select count(*)::integer
   from qarar_architecture.entity_registry e
   join qarar_architecture.module_registry m using (module_code)
   left join pg_class c on c.relname = e.entity_name and c.relkind in ('r', 'p')
   left join pg_namespace n on n.oid = c.relnamespace and n.nspname = m.schema_name
   where c.oid is null),
  0,
  'the entity registry has no stale ownership records');

select is(
  (select count(*)::integer
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   left join qarar_architecture.entity_registry e on e.entity_name = c.relname
   left join qarar_architecture.module_registry m
     on m.module_code = e.module_code and m.schema_name = n.nspname
   where n.nspname like 'qarar_%'
     and n.nspname not in ('qarar_architecture', 'qarar_internal')
     and c.relkind in ('r', 'p')
     and m.module_code is null),
  0,
  'module schemas contain no unregistered base tables');

select is(
  (select count(*)::integer
   from qarar_architecture.api_contract_registry
   where api_version = 'v1'),
 118,
  'api_v1 contract count is explicit and reviewed');

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   left join qarar_architecture.api_contract_registry r
     on r.api_version = 'v1'
    and r.contract_name = p.proname
    and r.identity_arguments = pg_get_function_identity_arguments(p.oid)
   where n.nspname = 'api_v1' and r.contract_name is null),
  0,
  'api_v1 exposes no unregistered functions');

select is(
  (select count(*)::integer
   from qarar_architecture.api_contract_registry r
   left join pg_proc p
     on p.proname = r.contract_name
    and pg_get_function_identity_arguments(p.oid) = r.identity_arguments
   left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'api_v1'
   where r.api_version = 'v1' and p.oid is null),
  0,
  'every registered v1 contract has an API wrapper');

select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api_v1'
     and (not p.prosecdef
       or not (
        coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog, public']
        or coalesce(p.proconfig, '{}'::text[]) @> array['search_path=pg_catalog'
       ]))),
  0,
  'all API wrappers use security definer with a controlled search path');

select ok(
  not has_function_privilege('authenticated', 'qarar_topics.create_topic(text,text,uuid,uuid,text,text,text,uuid)', 'EXECUTE'),
  'implementation RPCs are not executable by authenticated clients');

select ok(
  has_function_privilege('authenticated', 'api_v1.create_topic(text,text,uuid,uuid,text,text,text,uuid)', 'EXECUTE'),
  'authenticated clients can execute the versioned topic contract');

select ok(
  not has_function_privilege('anon', 'api_v1.create_topic(text,text,uuid,uuid,text,text,text,uuid)', 'EXECUTE'),
  'anonymous clients cannot execute authenticated contracts');

select ok(
  not has_function_privilege('authenticated', 'api_v1.service_apply_user_status(uuid,uuid,text,text)', 'EXECUTE'),
  'authenticated clients cannot execute service-only contracts');

select is(
  (select count(*)::integer
   from qarar_architecture.entity_registry e
   join qarar_architecture.module_registry m using (module_code)
   join pg_class c on c.relname = e.entity_name
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = m.schema_name
   where not c.relrowsecurity),
  0,
  'RLS remains enabled on every registered module entity');

select * from finish();
rollback;
