begin;
create extension if not exists pgtap;
select plan(8);

select has_trigger('qarar_meetings','meetings','enforce_ready_meeting_integrity',
  'meeting readiness is enforced in the database');
select has_trigger('qarar_meetings','meetings','enforce_decision_before_session_completion',
  'approved vote decision integrity is enforced in the database');
select ok(not has_function_privilege('authenticated','qarar_meetings.enforce_ready_meeting_integrity()','EXECUTE'),
  'readiness trigger function is hidden from authenticated');
select ok(not has_function_privilege('anon','qarar_meetings.enforce_decision_before_session_completion()','EXECUTE'),
  'decision trigger function is hidden from anon');
select ok(has_table_privilege('qarar_topics_executor','storage.objects','SELECT'),
  'topics executor can validate private storage object provenance');
select ok(not has_table_privilege('authenticated','storage.objects','SELECT'),
  'authenticated cannot enumerate storage metadata directly');
select ok(exists(select 1 from qarar_architecture.module_table_read_allowlist
  where source_module='topics' and target_schema='storage' and table_name='objects'),
  'storage provenance dependency is declared');
select is((select count(*)::int from qarar_architecture.api_contract_registry),204,
  'integrity closure adds no client API surface');

select * from finish();
rollback;
