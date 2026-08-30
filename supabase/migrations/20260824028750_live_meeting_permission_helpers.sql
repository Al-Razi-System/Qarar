begin;

create or replace function qarar_attendance.can_manage_live_meeting(
  p_meeting_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from qarar_meetings.meetings m
    where m.id = p_meeting_id
      and m.organization_id = qarar_iam.current_organization_id()
      and (
        qarar_iam.is_system_admin()
        or exists (
          select 1
          from qarar_iam.memberships ms
          join qarar_iam.roles r
            on r.id = ms.role_id
           and r.organization_id = ms.organization_id
          where ms.organization_id = m.organization_id
            and ms.user_id = auth.uid()
            and ms.membership_status = 'active'
            and ms.start_date <= current_date
            and (ms.end_date is null or ms.end_date >= current_date)
            and (
              r.code = 'governance_admin'
              or (
                r.code = 'council_chair'
                and ms.governance_unit_id = m.governance_unit_id
              )
            )
            and r.is_active
        )
      )
  );
$$;

create or replace function qarar_attendance.can_operate_live_meeting(
  p_meeting_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from qarar_meetings.meetings m
    where m.id = p_meeting_id
      and m.organization_id = qarar_iam.current_organization_id()
      and (
        qarar_attendance.can_manage_live_meeting(m.id)
        or exists (
          select 1
          from qarar_iam.memberships ms
          join qarar_iam.roles r
            on r.id = ms.role_id
           and r.organization_id = ms.organization_id
          where ms.organization_id = m.organization_id
            and ms.governance_unit_id = m.governance_unit_id
            and ms.user_id = auth.uid()
            and ms.membership_status = 'active'
            and ms.start_date <= current_date
            and (ms.end_date is null or ms.end_date >= current_date)
            and r.code = 'council_rapporteur'
            and r.is_active
        )
      )
  );
$$;

alter function qarar_attendance.can_manage_live_meeting(uuid)
  owner to qarar_attendance_executor;
alter function qarar_attendance.can_operate_live_meeting(uuid)
  owner to qarar_attendance_executor;

revoke all on function qarar_attendance.can_manage_live_meeting(uuid)
  from public, anon, authenticated, service_role;
revoke all on function qarar_attendance.can_operate_live_meeting(uuid)
  from public, anon, authenticated, service_role;

grant execute on function qarar_attendance.can_manage_live_meeting(uuid)
  to qarar_api_executor;
grant execute on function qarar_attendance.can_operate_live_meeting(uuid)
  to qarar_api_executor;

commit;
