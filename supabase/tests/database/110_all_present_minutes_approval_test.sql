begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select column_default from information_schema.columns where table_schema='qarar_core' and table_name='governance_units' and column_name='minute_approval_rule'),
  '''all_present_members''::text',
  'new councils require all present members to certify minutes by default'
);

select is(
  (select count(*)::integer from qarar_core.governance_units where minute_approval_rule <> 'all_present_members'),
  0,
  'existing councils use the all-present approval rule'
);

select is((
  select count(*)::integer
  from qarar_minutes.meeting_minutes mm
  join qarar_meetings.meetings m on m.id=mm.meeting_id and m.organization_id=mm.organization_id
  join qarar_attendance.attendance_records a on a.meeting_id=m.id and a.organization_id=m.organization_id
  left join qarar_minutes.minute_approvals ma on ma.minute_id=mm.id and ma.user_id=a.user_id
  where mm.status='ready_for_approval' and m.status='waiting_for_approval'
    and a.attendance_status in ('present','late','remote') and a.verification_status='verified'
    and ma.id is null
),0,'in-flight minutes contain an approval request for every verified attendee');

select * from finish();
rollback;
