-- Member downloads are an explicit per-agenda-item decision. The contextual
-- council chair and rapporteur may change it; every other viewer is view-only
-- until they do.
-- Impact: docs/engineering/impact/AGENDA_ITEM_MEMBER_DOWNLOAD_PERMISSION_20261112_AR.md
begin;

alter table qarar_meetings.agenda_item_download_settings
  alter column attachments_downloadable set default false;

-- A historical true value never granted ordinary members access. Resetting it
-- prevents the new meaning from silently opening old files after deployment.
with repaired as (
  update qarar_meetings.agenda_item_download_settings setting
  set attachments_downloadable = false,
      revision = setting.revision + 1,
      updated_at = clock_timestamp(),
      updated_by_user_id = null
  where setting.attachments_downloadable = true
  returning setting.organization_id, setting.agenda_item_id, setting.revision
)
insert into qarar_audit.audit_logs(
  organization_id, actor_user_id, action, entity_type, entity_id, metadata
)
select organization_id, null, 'meetings.agenda.downloads.default_repair',
       'agenda_items', agenda_item_id,
       jsonb_build_object('attachments_downloadable', false, 'revision', revision,
                          'migration', '20261112070000_agenda_member_download_opt_in')
from repaired;

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
  v_can_manage_meeting boolean := false;
  v_can_decide_downloads boolean := false;
begin
  select * into v_meeting
  from qarar_meetings.meetings
  where id = p_meeting_id and organization_id = v_org;

  if not found then raise exception 'meeting_not_found' using errcode = 'P0002'; end if;

  v_can_manage_meeting := qarar_iam.is_system_admin()
    or v_meeting.created_by_user_id = auth.uid()
    or qarar_iam.has_permission('meetings.manage', v_meeting.governance_unit_id);
  v_can_decide_downloads := qarar_iam.has_unit_role_code(
    v_meeting.governance_unit_id, array['council_chair', 'council_rapporteur']
  );

  if not (
    v_can_manage_meeting
    or qarar_iam.has_permission('meetings.read', v_meeting.governance_unit_id)
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
      'download_allowed', coalesce(setting.attachments_downloadable, false),
      'viewer_download_allowed',
        v_can_decide_downloads or coalesce(setting.attachments_downloadable, false),
      'viewer_can_manage_downloads',
        v_can_decide_downloads and v_meeting.status not in ('closed', 'archived', 'cancelled', 'not_held'),
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

create or replace function qarar_meetings.set_agenda_item_downloads(
  p_agenda_item_id uuid, p_allowed boolean, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_setting qarar_meetings.agenda_item_download_settings%rowtype;
  v_previous boolean;
begin
  select * into v_item
  from qarar_meetings.agenda_items
  where id = p_agenda_item_id
    and organization_id = qarar_iam.current_organization_id();
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'البند غير موجود.';
  end if;

  select * into v_meeting
  from qarar_meetings.meetings
  where id = v_item.meeting_id and organization_id = v_item.organization_id;

  if not qarar_iam.has_unit_role_code(
    v_meeting.governance_unit_id, array['council_chair', 'council_rapporteur']
  ) then
    raise exception using errcode = '42501',
      message = 'إذن تنزيل مرفقات البند من اختصاص رئيس المجلس أو مقرره.';
  end if;
  if v_meeting.status in ('closed', 'archived', 'cancelled', 'not_held') then
    raise exception using errcode = '23514',
      message = 'لا يتغير إذن التنزيل بعد انتهاء الاجتماع.';
  end if;
  if p_allowed is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023',
      message = 'أعد تحميل الاجتماع قبل تغيير إذن التنزيل.';
  end if;

  insert into qarar_meetings.agenda_item_download_settings(
    agenda_item_id, organization_id, attachments_downloadable
  ) values (v_item.id, v_item.organization_id, false)
  on conflict (agenda_item_id) do nothing;

  select * into v_setting
  from qarar_meetings.agenda_item_download_settings
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  for update;

  if v_setting.revision <> p_expected_revision then
    raise exception using errcode = '40001',
      message = 'تغيّر إذن التنزيل من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;

  v_previous := v_setting.attachments_downloadable;
  update qarar_meetings.agenda_item_download_settings
  set attachments_downloadable = p_allowed,
      revision = revision + 1,
      updated_at = clock_timestamp(),
      updated_by_user_id = auth.uid()
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  returning * into v_setting;

  perform qarar_audit.append_audit_log(
    v_item.organization_id, 'meetings.agenda.downloads', 'agenda_items', v_item.id,
    jsonb_build_object(
      'meeting_id', v_meeting.id,
      'previous_attachments_downloadable', v_previous,
      'attachments_downloadable', p_allowed,
      'revision', v_setting.revision
    )
  );

  return jsonb_build_object(
    'agenda_item_id', v_item.id,
    'attachments_downloadable', v_setting.attachments_downloadable,
    'revision', v_setting.revision
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
