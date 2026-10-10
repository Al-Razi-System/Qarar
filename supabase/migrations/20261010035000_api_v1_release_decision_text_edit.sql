-- Freeze the api_v1 surface after update_meeting_decision_text (20261010020000).
-- Same reviewed-release convention as every contract-adding migration.
begin;

update qarar_architecture.api_release_registry r
set contract_count=(select count(*) from qarar_architecture.api_contract_registry where api_version='v1'),
    contract_hash=(select md5(string_agg(p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||pg_get_function_result(p.oid)||'|'||c.audience,E'\n'
      order by p.proname,pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='api_v1'
      join qarar_architecture.api_contract_registry c on c.api_version='v1' and c.contract_name=p.proname
       and c.identity_arguments=pg_get_function_identity_arguments(p.oid))
where r.api_version='v1';

commit;
