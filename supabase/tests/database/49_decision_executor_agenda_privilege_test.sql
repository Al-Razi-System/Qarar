begin;
create extension if not exists pgtap;
select plan(3);

select ok(
  has_column_privilege('qarar_decisions_executor', 'qarar_meetings.agenda_items', 'agenda_status', 'UPDATE'),
  'decision executor can normalize the governed agenda status'
);
select ok(
  has_column_privilege('qarar_decisions_executor', 'qarar_meetings.agenda_items', 'updated_at', 'UPDATE'),
  'decision executor can stamp the normalized agenda item'
);
select ok(
  not has_table_privilege('qarar_decisions_executor', 'qarar_meetings.agenda_items', 'DELETE'),
  'decision executor does not receive destructive agenda privileges'
);

select * from finish();
rollback;
