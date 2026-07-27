begin;

update qarar_architecture.api_release_registry
set contract_count=109,
    contract_hash='edb084ec103f3f44473a2e2255c31977',
    released_at='2026-07-26 00:00:00+00',
    notes='Sprint 3.5 exposes 31 governance contracts including complete admin query and draft maintenance operations.'
where api_version='v1';

do $$
declare v_count integer;v_hash text;
begin
  select count(*),md5(string_agg(
    p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
    pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
    order by p.proname,pg_get_function_identity_arguments(p.oid)
  )) into v_count,v_hash
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
  join qarar_architecture.api_contract_registry r
    on r.api_version='v1' and r.contract_name=p.proname
    and r.identity_arguments=pg_get_function_identity_arguments(p.oid);
  if v_count<>109 or v_hash<>'edb084ec103f3f44473a2e2255c31977' then
    raise exception 'api_v1 governance admin release mismatch: count %, hash %',v_count,v_hash;
  end if;
end;
$$;

commit;
