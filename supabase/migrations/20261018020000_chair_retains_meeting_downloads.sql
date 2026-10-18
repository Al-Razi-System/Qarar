-- Participant download policy never removes the contextual chair's access.
-- Impact: docs/engineering/impact/LIVE_ROOM_DISPLAY_20261018_AR.md
begin;
create or replace function qarar_meetings.list_meeting_topic_attachments(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_meeting qarar_meetings.meetings%rowtype;
begin
  select * into v_meeting
  from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = v_org;

  if not found then raise exception 'meeting_not_found' using errcode = 'P0002'; end if;

  if not (
    qarar_iam.is_system_admin()
    or v_meeting.created_by_user_id = auth.uid()
    or qarar_iam.has_permission('meetings.read', v_meeting.governance_unit_id)
    or qarar_iam.has_permission('meetings.manage', v_meeting.governance_unit_id)
    or exists (
      select 1 from qarar_attendance.attendance_records attendance
      where attendance.organization_id = v_org
        and attendance.meeting_id = v_meeting.id
        and attendance.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', attachment.id,
      'topic_id', attachment.topic_id,
      'agenda_item_id', item.id,
      'file_name', attachment.file_name,
      'file_url', attachment.file_url,
      'mime_type', attachment.mime_type,
      'file_size_bytes', attachment.file_size_bytes,
      'description', attachment.description,
      'created_at', attachment.created_at,
      'download_allowed', coalesce(setting.attachments_downloadable, true),
      'viewer_download_allowed', coalesce(setting.attachments_downloadable, true)
        or qarar_iam.has_unit_role_code(v_meeting.governance_unit_id, array['council_chair']),
      'download_revision', coalesce(setting.revision, 0)
    ) order by item.agenda_order, attachment.created_at desc)
    from qarar_meetings.agenda_items item
    join qarar_topics.topic_attachments attachment
      on attachment.topic_id = item.topic_id
     and attachment.organization_id = item.organization_id
    left join qarar_meetings.agenda_item_download_settings setting
      on setting.agenda_item_id = item.id and setting.organization_id = item.organization_id
    where item.organization_id = v_org and item.meeting_id = v_meeting.id
  ), '[]'::jsonb);
end;
$function$;

commit;
