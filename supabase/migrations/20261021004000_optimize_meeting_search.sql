begin;

create or replace function qarar_meetings.search_meetings(
  p_query text default null,
  p_status text default null,
  p_unit_id uuid default null,
  p_from_date date default null,
  p_to_date date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_actor uuid := auth.uid();
  v_is_system_admin boolean := coalesce(qarar_iam.is_system_admin(), false);
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_org is null then
    raise exception 'active authenticated account is required' using errcode = '42501';
  end if;

  return (
    with authorized_units as materialized (
      select distinct
        case
          when permission.context_scope in ('system', 'organization', 'self') then null::uuid
          else membership.governance_unit_id
        end as governance_unit_id
      from qarar_iam.memberships membership
      join qarar_iam.roles role
        on role.id = membership.role_id
       and role.organization_id = membership.organization_id
       and role.is_active
      join qarar_iam.role_permissions role_permission
        on role_permission.role_id = role.id
       and role_permission.organization_id = membership.organization_id
       and role_permission.is_active
      join qarar_iam.permissions permission
        on permission.id = role_permission.permission_id
       and permission.organization_id = membership.organization_id
       and permission.is_active
      where membership.organization_id = v_org
        and membership.membership_status = 'active'
        and membership.start_date <= current_date
        and (membership.end_date is null or membership.end_date >= current_date)
        and permission.code in ('meetings.read', 'meetings.manage')
        and (
          membership.user_id = v_actor
          or exists (
            select 1
            from qarar_iam.access_delegations delegation
            where delegation.source_membership_id = membership.id
              and delegation.organization_id = membership.organization_id
              and delegation.delegated_to_user_id = v_actor
              and delegation.status = 'active'
              and clock_timestamp() between delegation.starts_at and delegation.ends_at
          )
        )
    ),
    agenda_counts as materialized (
      select agenda.meeting_id, count(*)::integer as agenda_item_count
      from qarar_meetings.agenda_items agenda
      where agenda.organization_id = v_org
      group by agenda.meeting_id
    ),
    filtered as materialized (
      select
        meeting.id,
        meeting.meeting_no,
        meeting.title_ar,
        meeting.title_en,
        meeting.scheduled_date,
        meeting.planned_window_start,
        meeting.planned_window_end,
        meeting.schedule_date_confirmed,
        meeting.start_time,
        meeting.end_time,
        meeting.location_type,
        meeting.status,
        meeting.updated_at,
        meeting.created_at,
        unit.id as governance_unit_id,
        unit.name_ar as governance_unit_name_ar,
        unit.name_ar as unit_name_ar,
        meeting_type.id as meeting_type_id,
        meeting_type.name_ar as meeting_type_name_ar,
        coalesce(agenda_count.agenda_item_count, 0) as agenda_item_count
      from qarar_meetings.meetings meeting
      join qarar_core.governance_units unit on unit.id = meeting.governance_unit_id
      left join qarar_meetings.meeting_types meeting_type on meeting_type.id = meeting.meeting_type_id
      left join agenda_counts agenda_count on agenda_count.meeting_id = meeting.id
      where meeting.organization_id = v_org
        and (
          v_is_system_admin
          or meeting.created_by_user_id = v_actor
          or exists (
            select 1
            from authorized_units access
            where access.governance_unit_id is null
               or access.governance_unit_id = meeting.governance_unit_id
          )
        )
        and (p_status is null or meeting.status = p_status)
        and (p_unit_id is null or meeting.governance_unit_id = p_unit_id)
        and (p_from_date is null or coalesce(meeting.planned_window_end, meeting.scheduled_date) >= p_from_date)
        and (p_to_date is null or coalesce(meeting.planned_window_start, meeting.scheduled_date) <= p_to_date)
        and (
          nullif(btrim(p_query), '') is null
          or meeting.meeting_no ilike '%' || btrim(p_query) || '%'
          or meeting.title_ar ilike '%' || btrim(p_query) || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by scheduled_date desc, created_at desc
      limit v_limit
      offset v_offset
    )
    select jsonb_build_object(
      'items', coalesce(
        (select jsonb_agg(to_jsonb(item) order by item.scheduled_date desc, item.created_at desc) from paged item),
        '[]'::jsonb
      ),
      'total', (select count(*) from filtered),
      'limit', v_limit,
      'offset', v_offset
    )
  );
end;
$function$;

comment on function qarar_meetings.search_meetings(text,text,uuid,date,date,integer,integer) is
  'Lists contextually visible meetings after materializing the actor permission scope and filtered result once.';

notify pgrst, 'reload schema';
commit;
