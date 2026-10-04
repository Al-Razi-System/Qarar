-- Minutes are certified by every verified attendee. This matches the product
-- copy and prevents present members from disappearing from the signature set.
update qarar_core.governance_units
set minute_approval_rule = 'all_present_members',
    updated_at = clock_timestamp()
where minute_approval_rule = 'chair_and_rapporteur';

-- Preserve existing approvals/signatures and insert only missing attendees.
insert into qarar_minutes.minute_approvals(
  organization_id, minute_id, user_id, membership_id
)
select
  mm.organization_id, mm.id, attendance.user_id, attendance.membership_id
from qarar_minutes.meeting_minutes mm
join qarar_meetings.meetings meeting on meeting.id = mm.meeting_id
join qarar_attendance.attendance_records attendance on attendance.meeting_id = meeting.id
where mm.status = 'ready_for_approval'
  and meeting.status = 'waiting_for_approval'
  and attendance.attendance_status in ('present', 'late', 'remote')
  and attendance.verification_status = 'verified'
on conflict (minute_id, user_id) do nothing;

select pg_notify('pgrst', 'reload schema');
