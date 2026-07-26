begin;

do $$
declare m record;r record;v_role text;
begin
  for r in select unnest(array[
    'qarar_api_executor','qarar_core_executor','qarar_iam_executor',
    'qarar_topics_executor','qarar_meetings_executor','qarar_attendance_executor',
    'qarar_voting_executor','qarar_minutes_executor','qarar_decisions_executor',
    'qarar_execution_executor','qarar_audit_executor','qarar_governance_executor'
  ]) role_name
  loop
    if not exists(select 1 from pg_roles where rolname=r.role_name) then
      execute format('create role %I nologin noinherit',r.role_name);
    end if;
    if r.role_name <> 'qarar_api_executor' then
      execute format('alter role %I bypassrls',r.role_name);
    end if;
    execute format('grant %I to %I',r.role_name,current_user);
  end loop;

  for m in select module_code,schema_name from qarar_architecture.module_registry
    where module_code<>'architecture'
  loop
    v_role:=format('qarar_%s_executor',m.module_code);
    execute format('grant usage,create on schema %I to %I',m.schema_name,v_role);
    execute format('grant %I to %I',v_role,current_user);
  end loop;
end;
$$;

commit;
