begin;

update qarar_architecture.api_release_registry
set contract_count=116,
    contract_hash='9cbf2a73798acecd932171af9cd85911',
    released_at='2026-07-26 00:00:00+00',
    notes='Sprint 3.5 review closure adds governed classification, custom routing, and concurrent workflow action contracts.'
where api_version='v1';

do $$
declare c integer;h text;
begin
 select count(*),md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||
  pg_get_function_result(p.oid)||'|'||r.audience,E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)))
 into c,h from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
 join qarar_architecture.api_contract_registry r on r.api_version='v1' and r.contract_name=p.proname
  and r.identity_arguments=pg_get_function_identity_arguments(p.oid);
 if c<>116 or h<>'9cbf2a73798acecd932171af9cd85911' then
  raise exception 'api_v1 Sprint 3.5 review release mismatch: count %, hash %',c,h;
 end if;
end $$;

commit;
