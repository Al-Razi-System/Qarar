-- In-room document viewer and per-item download permission (product owner,
-- 2026-10-15). Files open inside the room and follow the broadcast; the
-- council's chair decides per agenda item whether its files may be downloaded.
-- Impact map: docs/engineering/impact/MEETING_DOCUMENT_VIEWER_AR.md
begin;

-- The chair's decision per agenda item. An item without a row keeps its files
-- downloadable, as every item did before. A separate table, not a column on
-- agenda_items: the agenda item eligibility trigger runs on every update there
-- and may refuse a cosmetic change once the topic's status moved after the vote.
create table qarar_meetings.agenda_item_download_settings (
  agenda_item_id uuid primary key,
  organization_id uuid not null,
  attachments_downloadable boolean not null default true,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  foreign key (agenda_item_id, organization_id) references qarar_meetings.agenda_items(id, organization_id) on delete cascade
);
alter table qarar_meetings.agenda_item_download_settings enable row level security;
alter table qarar_meetings.agenda_item_download_settings force row level security;
revoke all on qarar_meetings.agenda_item_download_settings from public, anon, authenticated, service_role;
grant select, insert, update on qarar_meetings.agenda_item_download_settings to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('agenda_item_download_settings', 'meetings', false)
on conflict do nothing;

-- The document the controller has open, and its page.
alter table qarar_meetings.meeting_broadcasts
  add column attachment_id uuid,
  add column page integer check (page between 1 and 10000);

-- The meeting's files, now with their item and its download permission.
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

create function qarar_meetings.set_agenda_item_downloads(
  p_agenda_item_id uuid, p_allowed boolean, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_m qarar_meetings.meetings%rowtype;
  s qarar_meetings.agenda_item_download_settings%rowtype;
begin
  select * into v_item from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id();
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'البند غير موجود.';
  end if;
  select * into v_m from qarar_meetings.meetings
  where id = v_item.meeting_id and organization_id = v_item.organization_id;
  if not qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']) then
    raise exception using errcode = '42501', message = 'إذن تنزيل مرفقات البند من اختصاص رئيس المجلس.';
  end if;
  if v_m.status in ('closed', 'archived', 'cancelled') then
    raise exception using errcode = '23514', message = 'لا يتغير إذن التنزيل بعد إغلاق الاجتماع.';
  end if;
  if p_allowed is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'أعد تحميل الغرفة قبل تغيير إذن التنزيل.';
  end if;
  insert into qarar_meetings.agenda_item_download_settings(agenda_item_id, organization_id)
  values (v_item.id, v_item.organization_id)
  on conflict (agenda_item_id) do nothing;
  select * into s from qarar_meetings.agenda_item_download_settings
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  for update;
  if s.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'تغيّر إذن التنزيل من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  update qarar_meetings.agenda_item_download_settings
  set attachments_downloadable = p_allowed, revision = revision + 1,
      updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  returning * into s;
  perform qarar_audit.append_audit_log(v_item.organization_id, 'meetings.agenda.downloads', 'agenda_items', v_item.id,
    jsonb_build_object('meeting_id', v_m.id, 'attachments_downloadable', p_allowed, 'revision', s.revision));
  return jsonb_build_object('agenda_item_id', v_item.id, 'attachments_downloadable', s.attachments_downloadable, 'revision', s.revision);
end;
$$;

-- The broadcast as the caller sees it, now with the open document and page.
create or replace function qarar_meetings.broadcast_view(v_m qarar_meetings.meetings, b qarar_meetings.meeting_broadcasts)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_chair boolean := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']);
  v_rapporteur boolean := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']);
  v_live boolean := v_m.status = 'in_progress';
  v_role text := coalesce(b.controller_role, 'chair');
begin
  return jsonb_build_object(
    'meeting_id', v_m.id,
    'active', v_live,
    'controller_role', v_role,
    'agenda_item_id', b.agenda_item_id,
    'panel', coalesce(b.panel, 'instructions'),
    'attachment_id', b.attachment_id,
    'page', b.page,
    'revision', coalesce(b.revision, 0),
    'updated_at', b.updated_at,
    'viewer_controls', v_live and ((v_role = 'chair' and v_chair) or (v_role = 'rapporteur' and v_rapporteur)),
    'can_hand_over', v_live and v_chair and v_role = 'chair',
    'can_take_back', v_live and v_chair and v_role = 'rapporteur',
    'can_return', v_live and v_rapporteur and not v_chair and v_role = 'rapporteur'
  );
end;
$$;

-- Only the current controller steers the broadcast.
create function qarar_meetings.assert_broadcast_controller(v_m qarar_meetings.meetings, b qarar_meetings.meeting_broadcasts)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not ((b.controller_role = 'chair' and qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']))
       or (b.controller_role = 'rapporteur' and qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']))) then
    raise exception using errcode = '42501', message = case b.controller_role
      when 'chair' then 'يتحكم رئيس المجلس في البث الآن.'
      else 'يتحكم مقرر المجلس في البث الآن.' end;
  end if;
end;
$$;

-- Choosing an item or a panel; an open document closes when the item changes
-- or the files panel is left.
create or replace function qarar_meetings.set_meeting_broadcast(
  p_meeting_id uuid, p_agenda_item_id uuid, p_panel text, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_meetings.meeting_for_broadcast(p_meeting_id);
  b qarar_meetings.meeting_broadcasts%rowtype := qarar_meetings.lock_broadcast(v_m, p_expected_revision);
  v_keep_document boolean;
begin
  perform qarar_meetings.assert_broadcast_controller(v_m, b);
  if p_panel is null or p_panel not in ('instructions', 'attachments', 'history') then
    raise exception using errcode = '22023', message = 'لا يمكن بث هذا القسم من مواد الموضوع.';
  end if;
  if p_agenda_item_id is not null and not exists (
    select 1 from qarar_meetings.agenda_items a
    where a.id = p_agenda_item_id and a.meeting_id = v_m.id and a.organization_id = v_m.organization_id
  ) then
    raise exception using errcode = '22023', message = 'البند ليس في جدول أعمال هذا الاجتماع.';
  end if;
  v_keep_document := p_panel = 'attachments' and p_agenda_item_id is not distinct from b.agenda_item_id;
  update qarar_meetings.meeting_broadcasts
  set agenda_item_id = p_agenda_item_id, panel = p_panel,
      attachment_id = case when v_keep_document then attachment_id end,
      page = case when v_keep_document then page end,
      revision = revision + 1, updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
  where meeting_id = v_m.id and organization_id = v_m.organization_id
  returning * into b;
  return qarar_meetings.broadcast_view(v_m, b);
end;
$$;

-- Opening a document (and its page) on every screen, or closing it with null.
create function qarar_meetings.set_meeting_broadcast_document(
  p_meeting_id uuid, p_attachment_id uuid, p_page integer, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_meetings.meeting_for_broadcast(p_meeting_id);
  b qarar_meetings.meeting_broadcasts%rowtype := qarar_meetings.lock_broadcast(v_m, p_expected_revision);
  v_item_id uuid;
begin
  perform qarar_meetings.assert_broadcast_controller(v_m, b);
  if p_attachment_id is null then
    update qarar_meetings.meeting_broadcasts
    set attachment_id = null, page = null,
        revision = revision + 1, updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
    where meeting_id = v_m.id and organization_id = v_m.organization_id
    returning * into b;
    return qarar_meetings.broadcast_view(v_m, b);
  end if;
  if p_page is not null and (p_page < 1 or p_page > 10000) then
    raise exception using errcode = '22023', message = 'رقم الصفحة غير صالح.';
  end if;
  select item.id into v_item_id
  from qarar_topics.topic_attachments attachment
  join qarar_meetings.agenda_items item
    on item.topic_id = attachment.topic_id and item.organization_id = attachment.organization_id
  where attachment.id = p_attachment_id
    and attachment.organization_id = v_m.organization_id
    and item.meeting_id = v_m.id
  order by item.agenda_order
  limit 1;
  if v_item_id is null then
    raise exception using errcode = '22023', message = 'المرفق ليس من مواد جدول أعمال هذا الاجتماع.';
  end if;
  update qarar_meetings.meeting_broadcasts
  set agenda_item_id = v_item_id, panel = 'attachments', attachment_id = p_attachment_id, page = coalesce(p_page, 1),
      revision = revision + 1, updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
  where meeting_id = v_m.id and organization_id = v_m.organization_id
  returning * into b;
  return qarar_meetings.broadcast_view(v_m, b);
end;
$$;

alter function qarar_meetings.set_agenda_item_downloads(uuid, boolean, integer) owner to qarar_meetings_executor;
alter function qarar_meetings.assert_broadcast_controller(qarar_meetings.meetings, qarar_meetings.meeting_broadcasts) owner to qarar_meetings_executor;
alter function qarar_meetings.set_meeting_broadcast_document(uuid, uuid, integer, integer) owner to qarar_meetings_executor;
revoke all on function
  qarar_meetings.set_agenda_item_downloads(uuid, boolean, integer),
  qarar_meetings.assert_broadcast_controller(qarar_meetings.meetings, qarar_meetings.meeting_broadcasts),
  qarar_meetings.set_meeting_broadcast_document(uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  qarar_meetings.set_agenda_item_downloads(uuid, boolean, integer),
  qarar_meetings.set_meeting_broadcast_document(uuid, uuid, integer, integer)
  to qarar_api_executor;

create function api_v2.set_agenda_item_downloads_v2(p_agenda_item_id uuid, p_allowed boolean, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.set_agenda_item_downloads($1, $2, $3) $$;
create function api_v2.set_meeting_broadcast_document_v2(p_meeting_id uuid, p_attachment_id uuid, p_page integer, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.set_meeting_broadcast_document($1, $2, $3, $4) $$;
alter function api_v2.set_agenda_item_downloads_v2(uuid, boolean, integer) owner to qarar_api_executor;
alter function api_v2.set_meeting_broadcast_document_v2(uuid, uuid, integer, integer) owner to qarar_api_executor;
revoke all on function
  api_v2.set_agenda_item_downloads_v2(uuid, boolean, integer),
  api_v2.set_meeting_broadcast_document_v2(uuid, uuid, integer, integer)
  from public, anon, service_role;
grant execute on function
  api_v2.set_agenda_item_downloads_v2(uuid, boolean, integer),
  api_v2.set_meeting_broadcast_document_v2(uuid, uuid, integer, integer)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', 'qarar_meetings', false
from pg_proc p
where p.pronamespace = 'qarar_meetings'::regnamespace
  and p.proname in ('set_agenda_item_downloads', 'assert_broadcast_controller', 'set_meeting_broadcast_document',
                    'broadcast_view', 'set_meeting_broadcast', 'list_meeting_topic_attachments')
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('set_agenda_item_downloads_v2', 'set_meeting_broadcast_document_v2');

notify pgrst, 'reload schema';
commit;
