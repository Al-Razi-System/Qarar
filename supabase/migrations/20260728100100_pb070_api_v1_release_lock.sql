begin;

update qarar_architecture.api_release_registry
set contract_count=126,
    contract_hash='cbfbfab98b1acaeb6d3954de7799274e',
    released_at='2026-07-28 00:00:00+00',
    notes='PB-070 adds eligible-regulation discovery and explicit selected-regulation topic creation contracts.'
where api_version='v1';

do $$
declare v_count integer; v_hash text;
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
  if v_count<>126 or v_hash<>'cbfbfab98b1acaeb6d3954de7799274e' then
    raise exception 'api_v1 PB-070 release mismatch: count %, hash %',v_count,v_hash;
  end if;
end;
$$;

commit;
