-- Referral of an agenda item from the live room (owner review 2026-10-15,
-- batch 5b). The council's chair refers an item, without a vote, through the
-- existing topic referral that waits for the receiving unit to accept it.
-- Impact map: docs/engineering/impact/MEETING_ITEM_REFERRAL_AR.md
begin;

-- A separate table, not columns on agenda_items: the agenda item eligibility
-- trigger runs on every agenda_items update.
create table qarar_meetings.agenda_item_referrals (
  agenda_item_id uuid primary key,
  organization_id uuid not null,
  meeting_id uuid not null,
  topic_referral_id uuid not null unique,
  to_unit_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 2000),
  referred_by_user_id uuid not null,
  referred_at timestamptz not null default now(),
  foreign key (agenda_item_id, organization_id) references qarar_meetings.agenda_items(id, organization_id) on delete restrict,
  foreign key (meeting_id, organization_id) references qarar_meetings.meetings(id, organization_id) on delete restrict
);
create index agenda_item_referrals_meeting_idx on qarar_meetings.agenda_item_referrals(meeting_id);
alter table qarar_meetings.agenda_item_referrals enable row level security;
alter table qarar_meetings.agenda_item_referrals force row level security;
revoke all on qarar_meetings.agenda_item_referrals from public, anon, authenticated, service_role;
grant select, insert on qarar_meetings.agenda_item_referrals to qarar_meetings_executor;
insert into qarar_architecture.entity_registry(entity_name, module_code, legacy_public_view)
values ('agenda_item_referrals', 'meetings', false)
on conflict do nothing;

-- The topic side of a meeting referral: the same checks as refer_topic. The
-- council chair's authority is verified by the meetings module before the call,
-- and no client can call this function.
create function qarar_topics.open_meeting_referral(
  p_topic_id uuid, p_to_unit_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_org uuid := qarar_iam.current_organization_id();
  v_topic qarar_topics.topics%rowtype;
  v_id uuid;
begin
  select * into v_topic from qarar_topics.topics
  where id = p_topic_id and organization_id = v_org
  for update;
  if v_topic.id is null then
    raise exception using errcode = 'P0002', message = 'موضوع البند غير موجود.';
  end if;
  if v_topic.current_unit_id is null then
    raise exception using errcode = '23514', message = 'لا جهة حالية لموضوع البند، فلا يُحال.';
  end if;
  if p_to_unit_id is null or p_to_unit_id = v_topic.current_unit_id then
    raise exception using errcode = '22023', message = 'اختر جهة غير الجهة التي فيها الموضوع الآن.';
  end if;
  if not exists (
    select 1 from qarar_core.governance_units
    where id = p_to_unit_id and organization_id = v_org and status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'الجهة المختارة غير نشطة أو غير موجودة.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 2000 then
    raise exception using errcode = '22023', message = 'اكتب سبب الإحالة من 5 إلى 2000 حرف.';
  end if;
  if exists (select 1 from qarar_topics.topic_referrals where topic_id = v_topic.id and status = 'pending') then
    raise exception using errcode = '23514', message = 'على الموضوع إحالة لم تُقبل أو تُرفض بعد.';
  end if;
  insert into qarar_topics.topic_referrals(organization_id, topic_id, from_unit_id, to_unit_id, referred_by_user_id, referral_reason, status)
  values (v_org, v_topic.id, v_topic.current_unit_id, p_to_unit_id, auth.uid(), btrim(p_reason), 'pending')
  returning id into v_id;
  perform qarar_audit.append_audit_log(v_org, 'topics.referral.request', 'topic_referrals', v_id,
    jsonb_build_object('topic_id', v_topic.id, 'from_unit_id', v_topic.current_unit_id,
      'to_unit_id', p_to_unit_id, 'reason', btrim(p_reason), 'source', 'meeting'));
  return jsonb_build_object('referral_id', v_id, 'status', 'pending', 'from_unit_id', v_topic.current_unit_id);
end;
$$;

-- Locks the item, then refuses a vote on it once it is referred. Referral
-- locks the item first too, so the two cannot both succeed.
create function qarar_meetings.assert_agenda_item_votable(p_agenda_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform 1 from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if exists (select 1 from qarar_meetings.agenda_item_referrals where agenda_item_id = p_agenda_item_id) then
    raise exception using errcode = '23514', message = 'أحال رئيس المجلس هذا البند، فلا يُصوَّت عليه.';
  end if;
end;
$$;

create function qarar_voting.refuse_vote_on_referred_item()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform qarar_meetings.assert_agenda_item_votable(new.agenda_item_id);
  return new;
end;
$$;

create trigger voting_rounds_refuse_referred_item
before insert on qarar_voting.voting_rounds
for each row execute function qarar_voting.refuse_vote_on_referred_item();

create function qarar_meetings.refer_agenda_item(
  p_agenda_item_id uuid, p_to_unit_id uuid, p_reason text, p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item qarar_meetings.agenda_items%rowtype;
  v_m qarar_meetings.meetings%rowtype;
  v_referral jsonb;
begin
  select * into v_item from qarar_meetings.agenda_items
  where id = p_agenda_item_id and organization_id = qarar_iam.current_organization_id()
  for update;
  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'البند غير موجود.';
  end if;
  select * into v_m from qarar_meetings.meetings
  where id = v_item.meeting_id and organization_id = v_item.organization_id;
  if not qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']) then
    raise exception using errcode = '42501', message = 'إحالة البند من اختصاص رئيس المجلس.';
  end if;
  if v_m.status <> 'in_progress' then
    raise exception using errcode = '23514', message = 'يُحال البند أثناء انعقاد الجلسة فقط.';
  end if;
  if p_expected_updated_at is null or p_expected_updated_at <> v_item.updated_at then
    raise exception using errcode = '40001', message = 'تغيّر البند من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.';
  end if;
  if exists (select 1 from qarar_meetings.agenda_item_referrals where agenda_item_id = v_item.id) then
    raise exception using errcode = '23514', message = 'أُحيل هذا البند من قبل.';
  end if;
  if v_item.agenda_status not in ('under_discussion', 'discussed') then
    raise exception using errcode = '23514', message = 'ابدأ مناقشة البند قبل إحالته.';
  end if;
  if exists (
    select 1 from qarar_voting.voting_rounds
    where agenda_item_id = v_item.id and organization_id = v_item.organization_id and status in ('open', 'closed')
  ) then
    raise exception using errcode = '23514', message = 'فُتح على هذا البند تصويت، فلا يُحال.';
  end if;
  if p_to_unit_id = v_m.governance_unit_id then
    raise exception using errcode = '22023', message = 'اختر جهة غير هذا المجلس.';
  end if;

  v_referral := qarar_topics.open_meeting_referral(v_item.topic_id, p_to_unit_id, p_reason);

  if v_item.agenda_status = 'under_discussion' then
    update qarar_meetings.agenda_items
    set agenda_status = 'discussed'
    where id = v_item.id and organization_id = v_item.organization_id;
  end if;
  insert into qarar_meetings.agenda_item_referrals(
    agenda_item_id, organization_id, meeting_id, topic_referral_id, to_unit_id, reason, referred_by_user_id
  ) values (
    v_item.id, v_item.organization_id, v_m.id, (v_referral->>'referral_id')::uuid, p_to_unit_id,
    btrim(p_reason), auth.uid()
  );
  perform qarar_audit.append_audit_log(v_item.organization_id, 'meetings.agenda.referred', 'agenda_items', v_item.id,
    jsonb_build_object('meeting_id', v_m.id, 'topic_id', v_item.topic_id,
      'topic_referral_id', v_referral->>'referral_id', 'to_unit_id', p_to_unit_id));
  return jsonb_build_object('agenda_item_id', v_item.id, 'referral_id', v_referral->>'referral_id',
    'to_unit_id', p_to_unit_id, 'status', 'pending');
end;
$$;

create function qarar_meetings.list_meeting_referrals(p_meeting_id uuid)
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
    raise exception using errcode = '42501', message = 'متابعة إحالات البنود متاحة لمن يطّلع على حضور هذا المجلس.';
  end if;
  return jsonb_build_object(
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agenda_item_id', r.agenda_item_id,
        'referral_id', r.topic_referral_id,
        'to_unit_id', r.to_unit_id,
        'to_unit_name_ar', u.name_ar,
        'reason', r.reason,
        'status', tr.status,
        'referred_at', r.referred_at
      ) order by a.agenda_order)
      from qarar_meetings.agenda_item_referrals r
      join qarar_meetings.agenda_items a on a.id = r.agenda_item_id and a.organization_id = r.organization_id
      join qarar_topics.topic_referrals tr on tr.id = r.topic_referral_id and tr.organization_id = r.organization_id
      join qarar_core.governance_units u on u.id = r.to_unit_id and u.organization_id = r.organization_id
      where r.meeting_id = v_m.id and r.organization_id = v_m.organization_id
    ), '[]'::jsonb),
    -- Only the chair refers, so only the chair needs the choices.
    'destinations', case when qarar_iam.has_unit_role_code(v_m.governance_unit_id, array['council_chair']) then coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.name_ar) order by u.name_ar)
      from qarar_core.governance_units u
      where u.organization_id = v_m.organization_id and u.status = 'active' and u.id <> v_m.governance_unit_id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- A session ends only when every item was voted, postponed or referred.
create or replace function qarar_meetings.require_vote_for_agenda_items()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_item record;
begin
  if new.status='waiting_for_minutes' and old.status is distinct from new.status then
    select ai.agenda_order,t.title_ar into v_item
    from qarar_meetings.agenda_items ai
    join qarar_topics.topics t on t.id=ai.topic_id
    where ai.meeting_id=new.id
      and ai.agenda_status<>'postponed'
      and not exists(
        select 1 from qarar_meetings.agenda_item_referrals r
        where r.agenda_item_id=ai.id
      )
      and not exists(
        select 1 from qarar_voting.voting_rounds vr
        where vr.agenda_item_id=ai.id and vr.status='closed'
      )
    order by ai.agenda_order
    limit 1;
    if v_item.agenda_order is not null then
      raise exception 'صوّت المجلس على البند % «%» أو أحِله أو أجّله بسبب موثق قبل إنهاء الجلسة.',
        v_item.agenda_order,v_item.title_ar using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

grant select on qarar_topics.topic_referrals to qarar_meetings_executor;

alter function qarar_topics.open_meeting_referral(uuid, uuid, text) owner to qarar_topics_executor;
alter function qarar_meetings.assert_agenda_item_votable(uuid) owner to qarar_meetings_executor;
alter function qarar_voting.refuse_vote_on_referred_item() owner to qarar_voting_executor;
alter function qarar_meetings.refer_agenda_item(uuid, uuid, text, timestamptz) owner to qarar_meetings_executor;
alter function qarar_meetings.list_meeting_referrals(uuid) owner to qarar_meetings_executor;
revoke all on function
  qarar_topics.open_meeting_referral(uuid, uuid, text),
  qarar_meetings.assert_agenda_item_votable(uuid),
  qarar_voting.refuse_vote_on_referred_item(),
  qarar_meetings.refer_agenda_item(uuid, uuid, text, timestamptz),
  qarar_meetings.list_meeting_referrals(uuid)
  from public, anon, authenticated, service_role;
grant execute on function qarar_topics.open_meeting_referral(uuid, uuid, text) to qarar_meetings_executor;
grant execute on function qarar_meetings.assert_agenda_item_votable(uuid) to qarar_voting_executor;
grant execute on function
  qarar_meetings.refer_agenda_item(uuid, uuid, text, timestamptz),
  qarar_meetings.list_meeting_referrals(uuid)
  to qarar_api_executor;

create function api_v2.refer_agenda_item_v2(p_agenda_item_id uuid, p_to_unit_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select qarar_meetings.refer_agenda_item($1, $2, $3, $4) $$;
create function api_v2.list_meeting_referrals_v2(p_meeting_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$ select qarar_meetings.list_meeting_referrals($1) $$;
alter function api_v2.refer_agenda_item_v2(uuid, uuid, text, timestamptz) owner to qarar_api_executor;
alter function api_v2.list_meeting_referrals_v2(uuid) owner to qarar_api_executor;
revoke all on function
  api_v2.refer_agenda_item_v2(uuid, uuid, text, timestamptz),
  api_v2.list_meeting_referrals_v2(uuid)
  from public, anon, service_role;
grant execute on function
  api_v2.refer_agenda_item_v2(uuid, uuid, text, timestamptz),
  api_v2.list_meeting_referrals_v2(uuid)
  to authenticated;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), r.module_code, n.nspname, false
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join (values
  ('qarar_topics', 'open_meeting_referral', 'topics'),
  ('qarar_meetings', 'assert_agenda_item_votable', 'meetings'),
  ('qarar_voting', 'refuse_vote_on_referred_item', 'voting'),
  ('qarar_meetings', 'refer_agenda_item', 'meetings'),
  ('qarar_meetings', 'list_meeting_referrals', 'meetings')
) r(schema_name, function_name, module_code) on r.schema_name = n.nspname and r.function_name = p.proname
on conflict (function_name, identity_arguments) do update
set function_oid = excluded.function_oid, module_code = excluded.module_code, owning_schema = excluded.owning_schema;

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v2', p.proname, 'qarar_meetings', regexp_replace(p.proname::text, '_v2$', ''),
  pg_get_function_identity_arguments(p.oid), 'meetings', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v2'::regnamespace
  and p.proname in ('refer_agenda_item_v2', 'list_meeting_referrals_v2');

insert into qarar_architecture.module_table_read_allowlist(source_module, target_schema, table_name, rationale) values
  ('meetings', 'qarar_topics', 'topic_referrals', 'Show whether the unit an agenda item was referred to accepted it')
on conflict do nothing;
insert into qarar_architecture.module_function_execute_allowlist(source_module, target_schema, function_name, identity_arguments, rationale) values
  ('meetings', 'qarar_topics', 'open_meeting_referral', 'p_topic_id uuid, p_to_unit_id uuid, p_reason text',
   'The council chair refers an agenda item''s topic from the live room'),
  ('voting', 'qarar_meetings', 'assert_agenda_item_votable', 'p_agenda_item_id uuid',
   'No voting round opens on an agenda item the chair referred')
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
