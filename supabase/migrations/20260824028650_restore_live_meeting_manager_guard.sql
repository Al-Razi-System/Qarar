-- Restore the governed live-meeting manager predicate that exists in the
-- production-ready local database and is required by the 20260824+ meeting
-- and voting migrations.

create or replace function qarar_attendance.can_manage_live_meeting(
  p_meeting_id uuid
) returns boolean
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select exists(
    select 1
    from qarar_meetings.meetings mtg
    where mtg.id=p_meeting_id
      and mtg.organization_id=qarar_iam.current_organization_id()
      and (
        qarar_iam.is_system_admin()
        or qarar_iam.has_role_code(array['governance_admin'])
        or qarar_iam.has_unit_role_code(
          mtg.governance_unit_id,
          array['council_chair']
        )
      )
  )
$$;

alter function qarar_attendance.can_manage_live_meeting(uuid)
  owner to qarar_attendance_executor;

revoke all on function qarar_attendance.can_manage_live_meeting(uuid)
  from public,anon,authenticated,service_role;

grant execute on function qarar_attendance.can_manage_live_meeting(uuid)
  to qarar_meetings_executor,
     qarar_minutes_executor,
     qarar_voting_executor,
     qarar_decisions_executor;
