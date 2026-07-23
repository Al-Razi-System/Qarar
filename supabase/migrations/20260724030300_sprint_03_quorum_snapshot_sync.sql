-- Every attendance state change must persist the quorum result shown to clients.

create or replace function public.on_attendance_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform public.recalculate_meeting_quorum(coalesce(new.meeting_id,old.meeting_id),true);
 return null;
end $$;
