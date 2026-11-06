-- The notification enrichment function runs as qarar_governance_executor and
-- must be able to read the authoritative meeting and task records it enriches.
begin;
create extension if not exists pgtap;
select plan(7);

select ok(has_schema_privilege('qarar_governance_executor','qarar_meetings','usage'),'notification executor can resolve meeting records');
select ok(has_table_privilege('qarar_governance_executor','qarar_meetings.meetings','select'),'notification executor can read meetings');
select ok(has_schema_privilege('qarar_governance_executor','qarar_execution','usage'),'notification executor can resolve task records');
select ok(has_table_privilege('qarar_governance_executor','qarar_execution.action_items','select'),'notification executor can read tasks');
select ok(has_schema_privilege('qarar_governance_executor','qarar_decisions','usage'),'notification executor can resolve decision records');
select ok(has_table_privilege('qarar_governance_executor','qarar_decisions.decisions','select'),'notification executor can read decision references');
select ok(has_table_privilege('qarar_governance_executor','qarar_iam.users','select'),'notification executor can resolve recipients');

select * from finish();
rollback;
