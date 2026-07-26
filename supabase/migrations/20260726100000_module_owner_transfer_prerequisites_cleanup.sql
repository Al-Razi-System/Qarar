begin;

do $$
declare m record;v_role name;
begin
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
