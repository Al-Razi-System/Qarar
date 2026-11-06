-- The decision stands apart from its action items: once saved, its text may be
-- edited on its own. Product decision of 2026-10-10 (docs/design/HANDOFF_AR.md):
-- the council chair and the rapporteur may edit the text until the minutes are
-- approved. While the minutes are out for approval the text is frozen, because
-- the attendees are certifying it; returning the minutes reopens it.
-- Impact map: docs/engineering/impact/DECISION_TEXT_EDIT_AR.md
begin;

create or replace function qarar_decisions.update_meeting_decision_text(
  p_decision_id uuid,
  p_decision_text text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_decision qarar_decisions.decisions%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_text text := btrim(coalesce(p_decision_text, ''));
begin
  if char_length(v_text) < 10 then
    raise exception 'يجب ألا يقل نص القرار عن 10 أحرف.' using errcode = '22023';
  end if;

  select * into v_decision
  from qarar_decisions.decisions
  where id = p_decision_id
    and organization_id = qarar_iam.current_organization_id()
  for update;

  if v_decision.id is null then
    raise exception 'القرار غير موجود.' using errcode = 'P0002';
  end if;
  if v_decision.meeting_id is null then
    raise exception 'هذا القرار لم يصدر من اجتماع، فلا يُعدَّل من هنا.' using errcode = '23514';
  end if;

  select * into v_meeting
  from qarar_meetings.meetings
  where id = v_decision.meeting_id
    and organization_id = v_decision.organization_id;

  if not (
    qarar_attendance.can_manage_live_meeting(v_meeting.id)
    or qarar_iam.has_permission('agenda.manage', v_meeting.governance_unit_id)
  ) then
    raise exception 'تعديل نص القرار من اختصاص رئيس المجلس أو مقرره.' using errcode = '42501';
  end if;

  if v_meeting.status = 'waiting_for_approval' then
    raise exception 'المحضر معروض للمصادقة، فلا يُعدَّل القرار إلا بعد إعادة المحضر للتعديل.' using errcode = '23514';
  elsif v_meeting.status in ('closed', 'archived') then
    raise exception 'اعتُمد محضر الاجتماع، فأصبح نص القرار نهائياً.' using errcode = '23514';
  elsif v_meeting.status not in ('in_progress', 'waiting_for_minutes') then
    raise exception 'لا يُعدَّل القرار في هذه المرحلة من الاجتماع.' using errcode = '23514';
  end if;

  if v_decision.decision_status not in ('draft', 'under_review', 'ready_for_approval', 'approved') then
    raise exception 'دخل القرار مرحلة التنفيذ، فلا يُعدَّل نصه.' using errcode = '23514';
  end if;

  if p_expected_updated_at is null or p_expected_updated_at <> v_decision.updated_at then
    raise exception 'عُدِّل القرار من مستخدم آخر؛ أعد التحميل ثم أعد المحاولة.' using errcode = '40001';
  end if;

  if v_text = v_decision.decision_text then
    return jsonb_build_object(
      'id', v_decision.id,
      'decision_no', v_decision.decision_no,
      'decision_status', v_decision.decision_status,
      'decision_text', v_decision.decision_text,
      'updated_at', v_decision.updated_at,
      'changed', false,
      'meeting_status', v_meeting.status
    );
  end if;

  update qarar_decisions.decisions
  set decision_text = v_text
  where id = v_decision.id
  returning updated_at into v_decision.updated_at;

  perform qarar_audit.append_audit_log(
    v_decision.organization_id,
    'decision.text_update',
    'decisions',
    v_decision.id,
    jsonb_build_object(
      'meeting_id', v_meeting.id,
      'agenda_item_id', v_decision.agenda_item_id,
      'meeting_status', v_meeting.status,
      'previous_text', v_decision.decision_text
    )
  );

  return jsonb_build_object(
    'id', v_decision.id,
    'decision_no', v_decision.decision_no,
    'decision_status', v_decision.decision_status,
    'decision_text', v_text,
    'updated_at', v_decision.updated_at,
    'changed', true,
    'meeting_status', v_meeting.status
  );
end
$function$;

-- Same rows as before, plus the concurrency token and whether the caller may
-- edit the text now, so the room never shows an edit the server would reject.
create or replace function qarar_decisions.list_meeting_decisions(p_meeting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'decision_no', d.decision_no,
    'agenda_item_id', d.agenda_item_id,
    'decision_text', d.decision_text,
    'decision_status', d.decision_status,
    'requires_approval', d.requires_approval,
    'updated_at', d.updated_at,
    'can_edit_text', editor.allowed
      and m.status in ('in_progress', 'waiting_for_minutes')
      and d.decision_status in ('draft', 'under_review', 'ready_for_approval', 'approved')
  ) order by d.created_at), '[]'::jsonb)
  from qarar_decisions.decisions d
  join qarar_meetings.meetings m on m.id = d.meeting_id
  cross join lateral (
    select qarar_attendance.can_manage_live_meeting(m.id)
      or qarar_iam.has_permission('agenda.manage', m.governance_unit_id) as allowed
  ) editor
  where d.meeting_id = p_meeting_id
    and d.organization_id = qarar_iam.current_organization_id()
    and (qarar_iam.is_system_admin() or qarar_iam.has_permission('decisions.read', m.governance_unit_id))
$$;

create function api_v1.update_meeting_decision_text(
  p_decision_id uuid,
  p_decision_text text,
  p_expected_updated_at timestamptz
) returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$ select qarar_decisions.update_meeting_decision_text($1, $2, $3) $$;

alter function qarar_decisions.update_meeting_decision_text(uuid, text, timestamptz)
  owner to qarar_decisions_executor;
revoke all on function qarar_decisions.update_meeting_decision_text(uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function qarar_decisions.update_meeting_decision_text(uuid, text, timestamptz)
  to qarar_api_executor;

alter function api_v1.update_meeting_decision_text(uuid, text, timestamptz)
  owner to qarar_api_executor;
revoke all on function api_v1.update_meeting_decision_text(uuid, text, timestamptz)
  from public, anon, service_role;
grant execute on function api_v1.update_meeting_decision_text(uuid, text, timestamptz)
  to authenticated, service_role;

insert into qarar_architecture.function_registry(function_oid, function_name, identity_arguments, module_code, owning_schema, is_rls_predicate)
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid), 'decisions', 'qarar_decisions', false
from pg_proc p
where p.pronamespace = 'qarar_decisions'::regnamespace
  and p.proname = 'update_meeting_decision_text';

insert into qarar_architecture.api_contract_registry(api_version, contract_name, implementation_schema, implementation_name, identity_arguments, module_code, audience)
select 'v1', p.proname, 'qarar_decisions', p.proname, pg_get_function_identity_arguments(p.oid), 'decisions', 'authenticated'
from pg_proc p
where p.pronamespace = 'api_v1'::regnamespace
  and p.proname = 'update_meeting_decision_text';

select pg_notify('pgrst', 'reload schema');

commit;
