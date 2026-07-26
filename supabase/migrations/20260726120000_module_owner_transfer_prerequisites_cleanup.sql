begin;

do $$
declare
  m record;
  f record;
  dependency record;
  v_role name;
  v_target_role name;
  v_module_roles name[];
begin
  select array_agg(format('qarar_%s_executor',module_code)::name)
  into v_module_roles
  from qarar_architecture.module_registry
  where module_code not in ('api','architecture');

  for f in
    select r.owning_schema,r.function_name,r.identity_arguments,r.module_code
    from qarar_architecture.function_registry r
    order by r.module_code,r.function_name,r.identity_arguments
  loop
    v_role:=format('qarar_%s_executor',f.module_code);
    execute format('set local role %I',v_role);
    execute format(
      'revoke execute on function %I.%I(%s) from public',
      f.owning_schema,f.function_name,f.identity_arguments
    );
    foreach v_target_role in array v_module_roles
    loop
      if v_target_role<>v_role then
        execute format(
          'revoke execute on function %I.%I(%s) from %I',
          f.owning_schema,f.function_name,f.identity_arguments,v_target_role
        );
      end if;
    end loop;
    reset role;
  end loop;

  for dependency in
    select a.source_module,a.target_schema,a.function_name,a.identity_arguments,
      r.module_code as target_module
    from qarar_architecture.module_function_execute_allowlist a
    join qarar_architecture.function_registry r
      on r.owning_schema=a.target_schema
     and r.function_name=a.function_name
     and r.identity_arguments=a.identity_arguments
  loop
    execute format('set local role %I',format('qarar_%s_executor',dependency.target_module));
    execute format(
      'grant execute on function %I.%I(%s) to %I',
      dependency.target_schema,dependency.function_name,
      dependency.identity_arguments,
      format('qarar_%s_executor',dependency.source_module)
    );
    reset role;
  end loop;

  for m in select module_code,schema_name from qarar_architecture.module_registry
    where module_code<>'architecture'
  loop
    v_role:=format('qarar_%s_executor',m.module_code);
    execute format('revoke create on schema %I from %I',m.schema_name,v_role);
    execute format('grant usage on schema %I to %I',m.schema_name,v_role);
  end loop;
end;
$$;

commit;
