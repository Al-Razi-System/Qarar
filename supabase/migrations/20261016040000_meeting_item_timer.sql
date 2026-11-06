-- The agenda item timer (owner review 2026-10-15, batch 5). The database
-- records when an item's discussion starts and ends, so every screen shows the
-- same time; the council's chair may plan a duration per item.
-- Impact map: docs/engineering/impact/MEETING_ITEM_TIMER_AR.md
begin;

-- A separate table, not columns on agenda_items: the agenda item eligibility
-- trigger runs on every agenda_items update.
create table qarar_meetings.agenda_item_timers (
  agenda_item_id uuid primary key,
  organization_id uuid not null,
  planned_minutes integer check (planned_minutes between 1 and 240),
  discussion_started_at timestamptz,
  discussion_ended_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (discussion_ended_at is null or discussion_started_at is null or discussion_ended_at >= discussion_started_at),
  foreign key (agenda_item_id, organization_id) references qarar_meetings.agenda_items(id, organization_id) on delete cascade
);
alter table qarar_meetings.agenda_item_timers enable row level security;
alter table qarar_meetings.agenda_item_timers force row level security;
revoke all on qarar_meetings.agenda_item_timers from public, anon, authenticated, service_role;
grant select, insert, update on qarar_meetings.agenda_item_timers to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('agenda_item_timers', 'meetings', false)
on conflict do nothing;

-- Follows every existing discussion transition; it never refuses one.
create function qarar_meetings.track_agenda_discussion_time()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.agenda_status = 'under_discussion' and old.agenda_status is distinct from 'under_discussion' then
    insert into qarar_meetings.agenda_item_timers(agenda_item_id, organization_id, discussion_started_at)
    values (new.id, new.organization_id, clock_timestamp())
    on conflict (agenda_item_id) do update
    set discussion_started_at = excluded.discussion_started_at, discussion_ended_at = null, updated_at = clock_timestamp();
  elsif old.agenda_status = 'under_discussion' and new.agenda_status in ('discussed', 'postponed') then
    update qarar_meetings.agenda_item_timers
    set discussion_ended_at = greatest(clock_timestamp(), discussion_started_at), updated_at = clock_timestamp()
    where agenda_item_id = new.id and organization_id = new.organization_id and discussion_started_at is not null;
  end if;
  return null;
end;
$$;

create trigger agenda_items_track_discussion_time
after update of agenda_status on qarar_meetings.agenda_items
for each row execute function qarar_meetings.track_agenda_discussion_time();

create function qarar_meetings.list_meeting_item_timers(p_meeting_id uuid)
returns jsonb
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
  where id = p_meeting_id and organization_id = qarar_iam.current_organization_id();
  if v_m.id is null then
    raise exception using errcode = 'P0002', message = 'الاجتماع غير موجود.';
  end if;
  if not qarar_iam.is_system_admin()
     and not qarar_iam.has_permission('attendance.read', v_m.governance_unit_id)
     and not qarar_iam.has_permission('attendance.manage', v_m.governance_unit_id) then
    raise exception using errcode = '42501', message = 'متابعة مدة البنود متاحة لمن يطّلع على حضور هذا المجلس.';
  end if;
  return jsonb_build_object(
    'server_now', clock_timestamp(),
    'timers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agenda_item_id', t.agenda_item_id,
        'planned_minutes', t.planned_minutes,
        'discussion_started_at', t.discussion_started_at,
        'discussion_ended_at', t.discussion_ended_at,
        'revision', t.revision
      ) order by a.agenda_order)
      from qarar_meetings.agenda_item_timers t
      join qarar_meetings.agenda_items a on a.id = t.agenda_item_id and a.organization_id = t.organization_id
      where a.meeting_id = v_m.id and a.organization_id = v_m.organization_id
    ), '[]'::jsonb)
  );
end;
$$;

create function qarar_meetings.set_agenda_item_planned_minutes(
  p_agenda_item_id uuid, p_minutes integer, p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_m qarar_meetings.meetings%rowtype;
  t qarar_meetings.agenda_item_timers%rowtype;
begin
  select * into v_item from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id();
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'البند غير موجود.';
  end if;
  select * into v_m from qarar_meetings.meetings
  where id = v_item.meeting_id and organization_id = v_item.organization_id;
  if not qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']) then
    raise exception using errcode = '42501', message = 'تحديد مدة البند من اختصاص رئيس المجلس.';
  end if;
  if v_m.status in ('closed', 'archived', 'cancelled') then
    raise exception using errcode = '23514', message = 'لا تتغير مدة البند بعد إغلاق الاجتماع.';
  end if;
  if p_minutes is not null and (p_minutes < 1 or p_minutes > 240) then
    raise exception using errcode = '22023', message = 'مدة البند من دقيقة إلى أربع ساعات.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'أعد تحميل الغرفة قبل تحديد مدة البند.';
  end if;
  insert into qarar_meetings.agenda_item_timers(agenda_item_id, organization_id)
  values (v_item.id, v_item.organization_id)
  on conflict (agenda_item_id) do nothing;
  select * into t from qarar_meetings.agenda_item_timers
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  for update;
  if t.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'تغيّرت مدة البند من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  update qarar_meetings.agenda_item_timers
  set planned_minutes = p_minutes, revision = revision + 1, updated_at = clock_timestamp()
  where agenda_item_id = v_item.id and organization_id = v_item.organization_id
  returning * into t;
  perform qarar_audit.append_audit_log(v_item.organization_id, 'meetings.agenda.planned_minutes', 'agenda_items', v_item.id,
    jsonb_build_object('meeting_id', v_m.id, 'planned_minutes', p_minutes, 'revision', t.revision));
  return jsonb_build_object('agenda_item_id', v_item.id, 'planned_minutes', t.planned_minutes, 'revision', t.revision);
end;
$$;

alter function qarar_meetings.track_agenda_discussion_time() owner to qarar_meetings_executor;
alter function qarar_meetings.list_meeting_item_timers(uuid) owner to qarar_meetings_executor;
alter function qarar_meetings.set_agenda_item_planned_minutes(uuid, integer, integer) owner to qarar_meetings_executor;
revoke all on function
  qarar_meetings.track_agenda_discussion_time(),
  qarar_meetings.list_meeting_item_timers(uuid),
  qarar_meetings.set_agenda_item_planned_minutes(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  qarar_meetings.list_meeting_item_timers(uuid),
  qarar_meetings.set_agenda_item_planned_minutes(uuid, integer, integer)
  to qarar_api_executor;

create function api_v2.list_meeting_item_timers_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_meetings.list_meeting_item_timers($1) $$;
create function api_v2.set_agenda_item_planned_minutes_v2(p_agenda_item_id uuid, p_minutes integer, p_expected_revision integer)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.set_agenda_item_planned_minutes($1, $2, $3) $$;
alter function api_v2.list_meeting_item_timers_v2(uuid) owner to qarar_api_executor;
alter function api_v2.set_agenda_item_planned_minutes_v2(uuid, integer, integer) owner to qarar_api_executor;
revoke all on function
  api_v2.list_meeting_item_timers_v2(uuid),
  api_v2.set_agenda_item_planned_minutes_v2(uuid, integer, integer)
  from public, anon, service_role;
grant execute on function
  api_v2.list_meeting_item_timers_v2(uuid),
  api_v2.set_agenda_item_planned_minutes_v2(uuid, integer, integer)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'meetings', 'qarar_meetings', false
from pg_proc p
where p.pronamespace = 'qarar_meetings'::regnamespace
  and p.proname in ('track_agenda_discussion_time', 'list_meeting_item_timers', 'set_agenda_item_planned_minutes')
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('list_meeting_item_timers_v2', 'set_agenda_item_planned_minutes_v2');

notify pgrst, 'reload schema';
commit;
