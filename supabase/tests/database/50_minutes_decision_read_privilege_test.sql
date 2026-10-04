begin;
create extension if not exists pgtap;
select plan(3);

select ok(
  has_schema_privilege('qarar_minutes_executor', 'qarar_decisions', 'USAGE'),
  'minutes executor can resolve the decisions schema'
);
select ok(
  has_table_privilege('qarar_minutes_executor', 'qarar_decisions.decisions', 'SELECT'),
  'minutes executor can include formal decisions in the generated minutes'
);
select ok(
  not has_table_privilege('qarar_minutes_executor', 'qarar_decisions.decisions', 'UPDATE'),
  'minutes executor cannot alter decisions'
);

select * from finish();
rollback;
