begin;
create extension if not exists pgtap;
select plan(7);

select has_function(
  'api_v1',
  'search_meetings',
  array['text','text','uuid','date','date','integer','integer'],
  'meeting search keeps its public V1 signature'
);
select matches(
  (select prosrc from pg_proc where oid='qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)'::regprocedure),
  'authorized_units',
  'meeting search materializes the actor authorized unit scope once'
);
select ok(
  position(
    'qarar_iam.has_permission(''meetings.read'',m.governance_unit_id)'
    in (select prosrc from pg_proc where oid='qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)'::regprocedure)
  ) = 0,
  'meeting search does not evaluate read permission once per meeting row'
);
select matches(
  (select prosrc from pg_proc where oid='qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer)'::regprocedure),
  'filtered[[:space:]]+as[[:space:]]+materialized',
  'items and total reuse one filtered meeting set'
);
select has_function('qarar_iam', 'current_meeting_access_units', array[]::text[], 'IAM meeting access read model exists');
select ok(
  not has_function_privilege('authenticated', 'qarar_iam.current_meeting_access_units()', 'execute'),
  'browser roles cannot call the internal IAM read model directly'
);
select ok(
  has_function_privilege('qarar_meetings_executor', 'qarar_iam.current_meeting_access_units()', 'execute'),
  'only the meeting domain executor consumes the contextual IAM read model'
);

select * from finish();
rollback;
