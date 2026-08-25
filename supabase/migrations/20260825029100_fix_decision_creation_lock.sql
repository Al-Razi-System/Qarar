begin;

create or replace function qarar_decisions.create_decision_from_voting_round(
  p_voting_round_id uuid,
  p_decision_text text,
  p_requires_approval boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_round qarar_voting.voting_rounds%rowtype;
  v_meeting qarar_meetings.meetings%rowtype;
  v_topic_id uuid;
  v_decision_id uuid;
  v_decision_no text;
  v_existing jsonb;
begin
  if char_length(btrim(coalesce(p_decision_text, ''))) < 10 then
    raise exception 'يجب ألا يقل نص القرار عن 10 أحرف.' using errcode = '22023';
  end if;

  -- Serialize decision creation without granting the decisions module UPDATE
  -- access to voting data that it only needs to read.
  perform pg_advisory_xact_lock(hashtextextended(p_voting_round_id::text, 0));

  select * into v_round
  from qarar_voting.voting_rounds
  where id = p_voting_round_id
    and organization_id = qarar_iam.current_organization_id();

  if v_round.id is null then
    raise exception 'جولة التصويت غير موجودة.' using errcode = 'P0002';
  end if;
  if v_round.status <> 'closed' or v_round.result <> 'approved' then
    raise exception 'لا ينشأ القرار إلا من جولة مغلقة نتيجتها الموافقة.' using errcode = '23514';
  end if;

  select * into v_meeting
  from qarar_meetings.meetings
  where id = v_round.meeting_id
    and organization_id = v_round.organization_id;

  if v_meeting.id is null then
    raise exception 'الاجتماع غير موجود.' using errcode = 'P0002';
  end if;
  if not qarar_attendance.can_manage_live_meeting(v_meeting.id) then
    raise exception 'صياغة القرار المعتمد من اختصاص رئيس المجلس.' using errcode = '42501';
  end if;

  select topic_id into v_topic_id
  from qarar_meetings.agenda_items
  where id = v_round.agenda_item_id
    and organization_id = v_round.organization_id;

  if v_topic_id is null then
    raise exception 'موضوع بند جدول الأعمال غير موجود.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', id,
    'decision_no', decision_no,
    'decision_status', decision_status
  ) into v_existing
  from qarar_decisions.decisions
  where organization_id = v_round.organization_id
    and agenda_item_id = v_round.agenda_item_id;

  if v_existing is not null then
    return v_existing || jsonb_build_object('already_exists', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_round.organization_id::text || ':decision', 0));

  select 'DEC-' || to_char(current_date, 'YYYY') || '-' || lpad((count(*) + 1)::text, 6, '0')
  into v_decision_no
  from qarar_decisions.decisions
  where organization_id = v_round.organization_id
    and extract(year from created_at) = extract(year from current_date);

  insert into qarar_decisions.decisions(
    organization_id,
    decision_no,
    topic_id,
    meeting_id,
    agenda_item_id,
    governance_unit_id,
    decision_text,
    decision_status,
    issued_at,
    issued_by_user_id,
    requires_approval
  ) values (
    v_round.organization_id,
    v_decision_no,
    v_topic_id,
    v_meeting.id,
    v_round.agenda_item_id,
    v_meeting.governance_unit_id,
    btrim(p_decision_text),
    case when p_requires_approval then 'ready_for_approval' else 'approved' end,
    case when p_requires_approval then null else clock_timestamp() end,
    auth.uid(),
    p_requires_approval
  ) returning id into v_decision_id;

  perform qarar_audit.append_audit_log(
    v_round.organization_id,
    'decision.create_from_vote',
    'decisions',
    v_decision_id,
    jsonb_build_object(
      'voting_round_id', v_round.id,
      'meeting_id', v_meeting.id,
      'agenda_item_id', v_round.agenda_item_id
    )
  );

  return jsonb_build_object(
    'id', v_decision_id,
    'decision_no', v_decision_no,
    'decision_status', case when p_requires_approval then 'ready_for_approval' else 'approved' end,
    'already_exists', false
  );
end
$function$;

alter function qarar_decisions.create_decision_from_voting_round(uuid, text, boolean)
  owner to qarar_decisions_executor;

revoke all on function qarar_decisions.create_decision_from_voting_round(uuid, text, boolean) from public;
grant execute on function qarar_decisions.create_decision_from_voting_round(uuid, text, boolean)
  to qarar_api_executor, qarar_decisions_executor;

commit;
