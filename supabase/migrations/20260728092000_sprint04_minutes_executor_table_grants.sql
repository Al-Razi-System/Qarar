begin;

-- Runtime-security bootstrap grants apply only to tables present at that time.
-- Give the minutes module executor ownership-level DML for its two new internal
-- append-only stores; no client role receives these privileges.
grant select,insert,update,delete on qarar_minutes.minute_revisions,
  qarar_minutes.minute_status_history to qarar_minutes_executor;

commit;
