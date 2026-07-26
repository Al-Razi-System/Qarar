begin;

grant usage on schema auth to qarar_governance_executor;
grant execute on function auth.uid() to qarar_governance_executor;
grant execute on function auth.role() to qarar_governance_executor;

commit;
