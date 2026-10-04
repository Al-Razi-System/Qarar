-- The attendance executor resolves meeting operators from IAM memberships and
-- roles. Missing read access to roles made the minutes endpoint fail before it
-- could return the rapporteur's edit capability.
grant select on qarar_iam.roles to qarar_attendance_executor;
grant execute on function qarar_attendance.can_operate_live_meeting(uuid)
  to qarar_minutes_executor;

select pg_notify('pgrst', 'reload schema');
