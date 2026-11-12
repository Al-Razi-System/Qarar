-- service_record_api_outcome_v2 is the first api_v2 contract for the service role, which so far had no
-- USAGE on api_v2. Granting USAGE alone would make four api_v2 functions that carry a stray service_role
-- EXECUTE grant callable by the service key. Effective access is kept exactly as before: the service
-- role can now execute only api_v2 contracts registered with audience service_role.
begin;

do $boundary$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace='api_v2'::regnamespace
      and has_function_privilege('service_role', p.oid, 'execute')
      and not exists (select 1 from qarar_architecture.api_contract_registry r
        where r.api_version='v2' and r.audience='service_role' and r.contract_name=p.proname
          and r.identity_arguments=pg_get_function_identity_arguments(p.oid))
  loop
    execute format('revoke execute on function %s from service_role', f);
  end loop;
end
$boundary$;

grant usage on schema api_v2 to service_role;

commit;
