begin;
create extension if not exists pgtap;
select plan(5);

select has_function('api_v2','list_meetings_calendar_v2',array['date','date','uuid[]'],'calendar has one authorized range contract');
select has_function('api_v2','save_council_meeting_plan_v2',array['uuid','jsonb','uuid'],'council plans have an idempotent save contract');
select has_function('qarar_meetings','materialize_council_meeting_plan_v2',array['uuid'],'plan materialization is a reusable atomic operation');
select has_trigger('qarar_meetings','council_meeting_plans_v2','council_plan_materialize_cycle','saving a plan materializes its complete cycle');
select has_index('qarar_meetings','meetings','meeting_plan_occurrence_unique','plan occurrences remain unique on retries');

select * from finish();
rollback;
