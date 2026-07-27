begin;

update qarar_architecture.api_release_registry
set contract_count=99,
    contract_hash='7d690c5640263da52ad61f9bbb347df1',
    released_at='2026-07-26 00:00:00+00',
    notes='Sprint 3.5 adds 21 reviewed governance, regulation, workflow, and exception contracts.'
where api_version='v1';

do $$
declare v_count integer;v_hash text;
begin
  select count(*),md5(string_agg(
    p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
    pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
    order by p.proname,pg_get_function_identity_arguments(p.oid)
  )) into v_count,v_hash
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry r
    on r.api_version='v1' and r.contract_name=p.proname
    and r.identity_arguments=pg_get_function_identity_arguments(p.oid);
  if v_count<>99 or v_hash<>'7d690c5640263da52ad61f9bbb347df1' then
    raise exception 'api_v1 Sprint 3.5 release mismatch: count %, hash %',v_count,v_hash;
  end if;
end;
$$;

commit;
