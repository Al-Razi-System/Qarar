-- Creating a decision may normalize a previously postponed agenda item back
-- to `discussed`. The decision executor already owns the governed function
-- and can read the item, but lacked the narrow column-level UPDATE privilege,
-- causing every decision creation to fail before the status predicate could
-- be evaluated (PostgreSQL checks statement privileges up front).
grant update (agenda_status, updated_at)
  on table qarar_meetings.agenda_items
  to qarar_decisions_executor;

select pg_notify('pgrst', 'reload schema');
