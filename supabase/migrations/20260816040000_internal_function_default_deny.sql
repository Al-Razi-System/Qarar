-- Phase 0 runtime containment: internal module routines are never a client API.
--
-- A later convenience grant reopened EXECUTE on several qarar_* routines after
-- the modular runtime boundary had made them default-deny.  The api_v1 facade
-- and constrained executor roles are the only supported command path.

do $$
declare
  v_schema record;
  v_predicate record;
  v_exposed_count integer;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'qarar_architecture'
      and c.relname = 'function_registry'
  ) then
    raise exception 'internal routine containment requires qarar_architecture.function_registry';
  end if;

  -- Remove both direct grants and PUBLIC's implicit EXECUTE from every internal
  -- schema.  Executor-to-executor grants are deliberately not touched here.
  for v_schema in
    select n.nspname
    from pg_namespace n
    where n.nspname like 'qarar\_%' escape '\'
  loop
    execute format('revoke usage on schema %I from public, anon', v_schema.nspname);
    execute format(
      'revoke all on all functions in schema %I from public, anon, authenticated, service_role',
      v_schema.nspname
    );
    -- Future routines created by the migration owner must not inherit PUBLIC
    -- EXECUTE. CI verifies the effective catalog privileges as a backstop.
    execute format(
      'alter default privileges in schema %I revoke execute on functions from public',
      v_schema.nspname
    );
  end loop;

  -- RLS predicates are the narrow, reviewed exception: policies evaluate them
  -- in the caller context, so application roles need EXECUTE on these routines.
  for v_predicate in
    select r.owning_schema, r.function_name, r.identity_arguments
    from qarar_architecture.function_registry r
    join pg_proc p on p.oid = r.function_oid
    join pg_namespace n on n.oid = p.pronamespace
    where r.is_rls_predicate
      and n.nspname = r.owning_schema
  loop
    execute format('grant usage on schema %I to authenticated, service_role', v_predicate.owning_schema);
    execute format(
      'grant execute on function %I.%I(%s) to authenticated, service_role',
      v_predicate.owning_schema,
      v_predicate.function_name,
      v_predicate.identity_arguments
    );
  end loop;

  select count(*)
    into v_exposed_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join qarar_architecture.function_registry r on r.function_oid = p.oid
  where n.nspname like 'qarar\_%' escape '\'
    and p.prokind in ('f', 'p')
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or (
        (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute'))
        and coalesce(r.is_rls_predicate, false) is false
      )
    );

  if v_exposed_count <> 0 then
    raise exception 'internal routine containment failed: % client-executable routines remain', v_exposed_count;
  end if;
end;
$$;

notify pgrst, 'reload schema';
