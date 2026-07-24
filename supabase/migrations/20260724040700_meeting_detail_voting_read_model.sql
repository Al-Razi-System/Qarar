begin;

create or replace function qarar_meetings.get_meeting_detail(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
begin
  select *
  into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();

  if v_m.id is null then
    raise exception 'meeting not found' using errcode = 'P0002';
  end if;

  if v_m.created_by_user_id <> auth.uid()
     and not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('meetings.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('meetings.manage', v_m.governance_unit_id) then
    raise exception 'permission denied: meetings.read' using errcode = '42501';
  end if;

  return (
    select to_jsonb(m) || jsonb_build_object(
      'governance_unit', jsonb_build_object('id', gu.id, 'name_ar', gu.name_ar),
      'meeting_type', jsonb_build_object('id', mt.id, 'name_ar', mt.name_ar),
      'agenda_items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ai.id,
            'agenda_order', ai.agenda_order,
            'agenda_status', ai.agenda_status,
            'is_exception', ai.is_exception,
            'exception_reason', ai.exception_reason,
            'voting_status', ai.voting_status,
            'voting_result', ai.voting_result,
            'updated_at', ai.updated_at,
            'topic', jsonb_build_object(
              'id', t.id,
              'topic_no', t.topic_no,
              'title_ar', t.title_ar,
              'status', t.status
            )
          )
          order by ai.agenda_order
        )
        from qarar_meetings.agenda_items ai
        join qarar_topics.topics t on t.id = ai.topic_id
        where ai.meeting_id = m.id
      ), '[]'::jsonb),
      'status_history', coalesce((
        select jsonb_agg(to_jsonb(h) order by h.changed_at, h.id)
        from qarar_meetings.meeting_status_history h
        where h.meeting_id = m.id
      ), '[]'::jsonb)
    )
    from qarar_meetings.meetings m
    join qarar_core.governance_units gu on gu.id = m.governance_unit_id
    left join qarar_meetings.meeting_types mt on mt.id = m.meeting_type_id
    where m.id = v_m.id
  );
end;
$$;

comment on function qarar_meetings.get_meeting_detail(uuid) is
'Tenant-scoped meeting detail read model including agenda voting status and frozen result.';

commit;
