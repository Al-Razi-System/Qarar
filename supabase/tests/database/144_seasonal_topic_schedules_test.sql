begin;
create extension if not exists pgtap;
select plan(16);

set local role qarar_governance_executor;

-- A season is a period of the year, not a single day.
select is(
  (select due_on::text from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2026-01-01","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-01-01','2026-12-31')),
  '2026-09-30','a season from 1 September to 30 September ends on 30 September');
select is(
  (select period_key from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2026-01-01","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-01-01','2026-12-31')),
  'seasonal:2026-09-01','and is identified by the day it starts');
select is(qarar_governance.topic_schedule_window_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-09-30')->>'is_due','true',
  'the last day of the season is still inside it');
select is(qarar_governance.topic_schedule_window_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-08-31')->>'is_due','false',
  'the day before the season is not inside it');
select is(coalesce(qarar_governance.topic_schedule_window_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-10-01')->>'is_due','false'),'false',
  'the day after the season is not inside it');

-- A season may cross the end of the year.
select is(
  (select available_from::text||'/'||due_on::text from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2026-01-01","ends_on":"2027-12-31","dates":[{"month":12,"day":15,"to_month":1,"to_day":15}]}','2026-12-01','2027-01-31')),
  '2026-12-15/2027-01-15','a season from 15 December to 15 January runs into the next year');
select is(qarar_governance.topic_schedule_window_v2('seasonal',
  '{"starts_on":"2026-01-01","ends_on":"2027-12-31","dates":[{"month":12,"day":15,"to_month":1,"to_day":15}]}','2027-01-10')->>'is_due','true',
  'a day in January is inside the season that began in December');

-- A season already under way when a policy begins is not skipped.
select is(
  (select count(*)::int from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2026-09-15","dates":[{"month":9,"day":1,"to_month":9,"to_day":30}]}','2026-09-15','2026-12-31')),
  1,'a policy that starts in the middle of a season still gets that season');

-- A single day keeps its identity and its one-day window.
select is(
  (select period_key||'/'||available_from||'/'||due_on from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2026-01-01","dates":[{"month":3,"day":15}]}','2026-01-01','2026-12-31')),
  'seasonal:2026-03-15/2026-03-15/2026-03-15','a single seasonal day keeps its key and one-day window');

-- 29 February follows the calendar instead of failing.
select is(
  (select available_from::text from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2027-01-01","dates":[{"month":2,"day":29}]}','2027-01-01','2027-12-31')),
  '2027-02-28','29 February in a common year falls on 28 February');
select is(
  (select available_from::text from qarar_governance.topic_schedule_windows_v2('seasonal',
    '{"starts_on":"2028-01-01","dates":[{"month":2,"day":29}]}','2028-01-01','2028-12-31')),
  '2028-02-29','and stays 29 February in a leap year');
select lives_ok($$select qarar_governance.topic_schedule_window_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":2,"day":29}]}','2026-06-01')$$,
  'saving a 29 February season in a common year is accepted');

-- Invalid seasons are refused with a clear message.
select throws_ok($$select * from qarar_governance.topic_schedule_windows_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":3,"day":15},{"month":3,"day":15,"to_month":3,"to_day":20}]}','2026-01-01','2026-12-31')$$,
  '22023','حدد مواعيد موسمية صحيحة وغير مكررة','two seasons that start the same day are refused');
select throws_ok($$select * from qarar_governance.topic_schedule_windows_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":3,"day":15,"to_month":3}]}','2026-01-01','2026-12-31')$$,
  '22023',null,'an end month without an end day is refused');
select throws_ok($$select * from qarar_governance.topic_schedule_windows_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":13,"day":1}]}','2026-01-01','2026-12-31')$$,
  '22023',null,'a month outside 1 to 12 is refused');
select throws_ok($$select * from qarar_governance.topic_schedule_windows_v2('seasonal',
  '{"starts_on":"2026-01-01","dates":[{"month":4,"day":31}]}','2026-01-01','2026-12-31')$$,
  '22023',null,'a day that never exists in its month is refused');

select * from finish();
rollback;
