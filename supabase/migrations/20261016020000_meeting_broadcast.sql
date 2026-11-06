-- Broadcasting the chair's screen to the members (product owner, 2026-10-15).
-- One controller at a time: the chair by default. The chair hands control to
-- the rapporteur and takes it back; the rapporteur in control may return it.
-- Members read the broadcast and follow it. Navigation (item, panel) is display
-- state and is not audited; a handover moves authority and is.
-- Impact map: docs/engineering/impact/MEETING_BROADCAST_AR.md
begin;

create table qarar_meetings.meeting_broadcasts (
  meeting_id uuid primary key,
  organization_id uuid not null,
  controller_role text not null default 'chair' check (controller_role in ('chair', 'rapporteur')),
  agenda_item_id uuid,
  panel text not null default 'instructions' check (panel in ('instructions', 'attachments', 'history')),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  foreign key (meeting_id, organization_id) references qarar_meetings.meetings(id, organization_id) on delete cascade,
  foreign key (agenda_item_id, organization_id) references qarar_meetings.agenda_items(id, organization_id) on delete set null (agenda_item_id)
);
alter table qarar_meetings.meeting_broadcasts enable row level security;
alter table qarar_meetings.meeting_broadcasts force row level security;
revoke all on qarar_meetings.meeting_broadcasts from public, anon, authenticated, service_role;
grant select, insert, update on qarar_meetings.meeting_broadcasts to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('meeting_broadcasts', 'meetings', false)
on conflict do nothing;

-- The meeting in the caller's tenant, with the live room's read authority.
create function qarar_meetings.meeting_for_broadcast(p_meeting_id uuid)
returns qarar_meetings.meetings
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype;
begin
  select * into v_m
  from qarar_meetings.meetings
  where id = p_meeting_id
    and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('attendance.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('attendance.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'متابعة بث الجلسة متاحة لمن يطّلع على حضور هذا المجلس.';
  end if;
  return v_m;
end;
$$;

-- The broadcast as the caller sees it, with what the caller may do.
create function qarar_meetings.broadcast_view(v_m qarar_meetings.meetings, b qarar_meetings.meeting_broadcasts)
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
    'revision', coalesce(b.revision, 0),
    'updated_at', b.updated_at,
    'viewer_controls', v_live and ((v_role = 'chair' and v_chair) or (v_role = 'rapporteur' and v_rapporteur)),
    'can_hand_over', v_live and v_chair and v_role = 'chair',
    'can_take_back', v_live and v_chair and v_role = 'rapporteur',
    'can_return', v_live and v_rapporteur and not v_chair and v_role = 'rapporteur'
  );
end;
$$;

create function qarar_meetings.get_meeting_broadcast(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_meetings.meeting_for_broadcast(p_meeting_id);
  b qarar_meetings.meeting_broadcasts%rowtype;
begin
  select * into b from qarar_meetings.meeting_broadcasts
  where meeting_id = v_m.id and organization_id = v_m.organization_id;
  return qarar_meetings.broadcast_view(v_m, b);
end;
$$;

-- Locks the meeting's broadcast row, creating it on first use, and checks the
-- session is running and the expected revision still holds.
create function qarar_meetings.lock_broadcast(v_m qarar_meetings.meetings, p_expected_revision integer)
returns qarar_meetings.meeting_broadcasts
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  b qarar_meetings.meeting_broadcasts%rowtype;
begin
  if v_m.status <> 'in_progress' then
    raise exception using errcode = '23514', message = 'البث متاح أثناء الجلسة فقط.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'أعد تحميل الغرفة قبل تغيير البث.';
  end if;
  insert into qarar_meetings.meeting_broadcasts(meeting_id, organization_id)
  values (v_m.id, v_m.organization_id)
  on conflict (meeting_id) do nothing;
  select * into b from qarar_meetings.meeting_broadcasts where meeting_id = v_m.id for update;
  if b.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'تغيّر البث من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  return b;
end;
$$;

create function qarar_meetings.set_meeting_broadcast(
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
begin
  if not ((b.controller_role = 'chair' and qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']))
       or (b.controller_role = 'rapporteur' and qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']))) then
    raise exception using errcode = '42501', message = case b.controller_role
      when 'chair' then 'يتحكم رئيس المجلس في البث الآن.'
      else 'يتحكم مقرر المجلس في البث الآن.' end;
  end if;
  if p_panel is null or p_panel not in ('instructions', 'attachments', 'history') then
    raise exception using errcode = '22023', message = 'لا يمكن بث هذا القسم من مواد الموضوع.';
  end if;
  if p_agenda_item_id is not null and not exists (
    select 1 from qarar_meetings.agenda_items a
    where a.id = p_agenda_item_id and a.meeting_id = v_m.id and a.organization_id = v_m.organization_id
  ) then
    raise exception using errcode = '22023', message = 'البند ليس في جدول أعمال هذا الاجتماع.';
  end if;
  update qarar_meetings.meeting_broadcasts
  set agenda_item_id = p_agenda_item_id, panel = p_panel, revision = revision + 1,
      updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
  where meeting_id = v_m.id
  returning * into b;
  return qarar_meetings.broadcast_view(v_m, b);
end;
$$;

create function qarar_meetings.hand_over_meeting_broadcast(
  p_meeting_id uuid, p_to_role text, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_m qarar_meetings.meetings%rowtype := qarar_meetings.meeting_for_broadcast(p_meeting_id);
  b qarar_meetings.meeting_broadcasts%rowtype := qarar_meetings.lock_broadcast(v_m, p_expected_revision);
  v_chair boolean := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']);
  v_rapporteur boolean := qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_rapporteur']);
  v_from text := b.controller_role;
begin
  if p_to_role is null or p_to_role not in ('chair', 'rapporteur') then
    raise exception using errcode = '22023', message = 'يُسلَّم البث لرئيس المجلس أو مقرره فقط.';
  end if;
  -- The chair hands over and takes back; the rapporteur in control may only return it.
  if not (v_chair or (v_rapporteur and v_from = 'rapporteur' and p_to_role = 'chair')) then
    raise exception using errcode = '42501', message = 'تسليم البث من اختصاص رئيس المجلس، ويعيده المقرر المتحكم إليه.';
  end if;
  if p_to_role = 'rapporteur' and not exists (
    select 1
    from qarar_iam.memberships ms
    join qarar_iam.roles r on r.id = ms.role_id and r.organization_id = ms.organization_id
    where ms.governance_unit_id = v_m.governance_unit_id
      and ms.organization_id = v_m.organization_id
      and ms.membership_status = 'active'
      and r.is_active and r.code = 'council_rapporteur'
      and (ms.end_date is null or ms.end_date >= current_date)
  ) then
    raise exception using errcode = '23514', message = 'لا يوجد مقرر نشط لهذا المجلس لتسليمه البث.';
  end if;
  if v_from = p_to_role then
    return qarar_meetings.broadcast_view(v_m, b);
  end if;
  update qarar_meetings.meeting_broadcasts
  set controller_role = p_to_role, revision = revision + 1,
      updated_at = clock_timestamp(), updated_by_user_id = auth.uid()
  where meeting_id = v_m.id
  returning * into b;
  perform qarar_audit.append_audit_log(v_m.organization_id, 'meetings.broadcast.handover', 'meetings', v_m.id,
    jsonb_build_object('from_role', v_from, 'to_role', p_to_role, 'revision', b.revision));
  return qarar_meetings.broadcast_view(v_m, b);
end;
$$;

alter function qarar_meetings.meeting_for_broadcast(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.broadcast_view(qarar_meetings.meetings, qarar_meetings.meeting_broadcasts) owner to qarar_meetings_executor;
alter function qarar_meetings.get_meeting_broadcast(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.lock_broadcast(qarar_meetings.meetings, integer) owner to qarar_meetings_executor;
alter function qarar_meetings.set_meeting_broadcast(uuid, uuid, text, integer) owner to qarar_meetings_executor;
alter function qarar_meetings.hand_over_meeting_broadcast(uuid, text, integer) owner to qarar_meetings_executor;
revoke all on function
  qarar_meetings.meeting_for_broadcast(uuid),
  qarar_meetings.broadcast_view(qarar_meetings.meetings, qarar_meetings.meeting_broadcasts),
  qarar_meetings.get_meeting_broadcast(uuid),
  qarar_meetings.lock_broadcast(qarar_meetings.meetings, integer),
  qarar_meetings.set_meeting_broadcast(uuid, uuid, text, integer),
  qarar_meetings.hand_over_meeting_broadcast(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  qarar_meetings.get_meeting_broadcast(uuid),
  qarar_meetings.set_meeting_broadcast(uuid, uuid, text, integer),
  qarar_meetings.hand_over_meeting_broadcast(uuid, text, integer)
  to qarar_api_executor;

create function api_v2.get_meeting_broadcast_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_meetings.get_meeting_broadcast($1) $$;
create function api_v2.set_meeting_broadcast_v2(p_meeting_id uuid, p_agenda_item_id uuid, p_panel text, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.set_meeting_broadcast($1, $2, $3, $4) $$;
create function api_v2.hand_over_meeting_broadcast_v2(p_meeting_id uuid, p_to_role text, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.hand_over_meeting_broadcast($1, $2, $3) $$;
alter function api_v2.get_meeting_broadcast_v2(uuid) owner to qarar_api_executor;
alter function api_v2.set_meeting_broadcast_v2(uuid, uuid, text, integer) owner to qarar_api_executor;
alter function api_v2.hand_over_meeting_broadcast_v2(uuid, text, integer) owner to qarar_api_executor;
revoke all on function
  api_v2.get_meeting_broadcast_v2(uuid),
  api_v2.set_meeting_broadcast_v2(uuid, uuid, text, integer),
  api_v2.hand_over_meeting_broadcast_v2(uuid, text, integer)
  from public, anon, service_role;
grant execute on function
  api_v2.get_meeting_broadcast_v2(uuid),
  api_v2.set_meeting_broadcast_v2(uuid, uuid, text, integer),
  api_v2.hand_over_meeting_broadcast_v2(uuid, text, integer)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', 'qarar_meetings', false
from pg_proc p
where p.pronamespace = 'qarar_meetings'::regnamespace
  and p.proname in ('meeting_for_broadcast', 'broadcast_view', 'get_meeting_broadcast', 'lock_broadcast',
                    'set_meeting_broadcast', 'hand_over_meeting_broadcast')
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('get_meeting_broadcast_v2', 'set_meeting_broadcast_v2', 'hand_over_meeting_broadcast_v2');

notify pgrst, 'reload schema';
commit;
