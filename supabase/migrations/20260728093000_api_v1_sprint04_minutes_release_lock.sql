begin;

update qarar_architecture.api_release_registry
set contract_count=119,
    contract_hash='fd28c50b5f92faf4d5f85fa4d74a6b06',
    released_at='2026-07-28 00:00:00+00',
    notes='Sprint 4 PB-022 adds governed minute draft read, create, and optimistic-concurrency update contracts.'
where api_version='v1';

do $$
declare c integer; h text;
begin
 select count(*),md5(string_agg(
   p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
   pg_get_function_result(p.oid)||'|'||r.audience,E'\n'
   order by p.proname,pg_get_function_identity_arguments(p.oid)
 )) into c,h
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
 join qarar_architecture.api_contract_registry r on r.api_version='v1'
  and r.contract_name=p.proname and r.identity_arguments=pg_get_function_identity_arguments(p.oid);
 if c<>119 or h<>'fd28c50b5f92faf4d5f85fa4d74a6b06' then
  raise exception 'api_v1 Sprint 4 minutes release mismatch: count %, hash %',c,h;
 end if;
end;
$$;

commit;
