begin;
create extension if not exists pgtap;
select plan(12);

select has_function('api_v2','list_meetings_calendar_v2',array['date','date','uuid[]'],'calendar has one authorized range contract');
select has_function('api_v2','save_council_meeting_plan_v2',array['uuid','jsonb','uuid'],'council plans have an idempotent save contract');
select has_function('qarar_meetings','materialize_council_meeting_plan_v2',array['uuid'],'plan materialization is a reusable atomic operation');
select has_trigger('qarar_meetings','council_meeting_plans_v2','council_plan_materialize_cycle','saving a plan materializes its complete cycle');
select has_index('qarar_meetings','meetings','meeting_plan_occurrence_unique','plan occurrences remain unique on retries');
select has_function('qarar_meetings','council_plan_materialization_horizon_v2',array['date','date','date'],'open-ended plans expose a deterministic rolling horizon');
select is(qarar_meetings.council_plan_materialization_horizon_v2('2026-01-01',null,'2027-06-01'),'2028-05-31'::date,'an open-ended plan keeps one year materialized ahead');
select is(qarar_meetings.council_plan_materialization_horizon_v2('2026-01-01','2026-09-30','2027-06-01'),'2026-09-30'::date,'a bounded plan never extends beyond its configured end');
select has_function('qarar_meetings','extend_open_ended_council_meeting_plans_v2',array[]::text[],'all open-ended plan recurrences have one internal extension operation');
select is(has_function_privilege('authenticated','qarar_meetings.extend_open_ended_council_meeting_plans_v2()','execute'),false,'authenticated users cannot invoke the internal extension worker');
select is(has_function_privilege('authenticated','qarar_meetings.materialize_council_meeting_plan_v2(uuid)','execute'),false,'authenticated users cannot bypass the public plan-save contract');
create temporary table rolling_cron_expectation(ok boolean not null) on commit drop;
do $$
begin
  if to_regclass('cron.job') is null then
    insert into rolling_cron_expectation values(true);
  else
    execute $sql$insert into rolling_cron_expectation
      select exists(
        select 1 from cron.job
        where jobname='qarar-extend-open-ended-council-plans'
          and schedule='25 0 * * *'
          and command='select qarar_meetings.extend_open_ended_council_meeting_plans_v2()'
      )$sql$;
  end if;
end;
$$;
select ok((select ok from rolling_cron_expectation),'the rolling extension is scheduled daily when pg_cron is available');

select * from finish();
rollback;
