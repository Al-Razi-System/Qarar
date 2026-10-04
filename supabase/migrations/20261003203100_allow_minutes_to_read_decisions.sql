-- The generated minutes include the formal decision for every agenda item.
-- The executor already has SELECT on the decisions table, but PostgreSQL also
-- requires USAGE on its schema; without it, generation fails with HTTP 403.
grant usage on schema qarar_decisions to qarar_minutes_executor;

select pg_notify('pgrst', 'reload schema');
