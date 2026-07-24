-- Attendance corrections cannot race an active voting round.

create or replace function public.guard_attendance_override_during_voting()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.check_in_method='override' and (
  old.check_in_method is distinct from new.check_in_method
  or old.attendance_status is distinct from new.attendance_status
 ) and exists(
  select 1 from public.voting_rounds
  where meeting_id=new.meeting_id and status='open'
 ) then
  raise exception 'attendance override is blocked while voting is open';
 end if;
 return new;
end $$;

create trigger block_attendance_override_during_open_vote
before update on public.attendance_records
for each row execute function public.guard_attendance_override_during_voting();
